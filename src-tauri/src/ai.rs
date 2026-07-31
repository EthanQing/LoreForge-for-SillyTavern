use base64::Engine;
use futures_util::{future::{AbortHandle, Abortable}, StreamExt};
use keyring::Entry;
use reqwest::{redirect::Policy, Client, Method, Url};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::{Arc, Mutex}, time::Duration};
use tauri::{AppHandle, Emitter, State};

const KEYRING_SERVICE: &str = "sillytavern-card-creator";
const MAX_AI_TIMEOUT_MS: u64 = 1_800_000;
const MAX_REQUEST_BODY_BYTES: usize = 16 * 1024 * 1024;
const MAX_RESPONSE_HEADER_BYTES: usize = 64 * 1024;
const MAX_RESPONSE_BODY_BYTES: usize = 64 * 1024 * 1024;

#[derive(Default)]
pub struct AiRuntime {
    requests: Arc<Mutex<HashMap<String, AbortHandle>>>,
    profiles: Mutex<HashMap<String, AiProfile>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProfile {
    pub id: String,
    pub base_url: String,
    #[serde(default)]
    pub allow_insecure_http: bool,
    #[serde(default)]
    pub credential_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiHttpStreamRequest {
    pub request_id: String,
    pub url: String,
    pub method: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
    pub profile_id: Option<String>,
    #[serde(default)]
    pub allow_insecure_http: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiHttpStreamStart {
    pub request_id: String,
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiHttpStreamEvent {
    request_id: String,
    event: String,
    data: Option<String>,
    message: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCredentialRequest {
    pub credential_id: String,
    pub secret: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCredentialStatus {
    pub credential_id: String,
    pub configured: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiModel {
    pub id: String,
    pub owned_by: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ModelsEnvelope {
    data: Vec<AiModel>,
}

#[tauri::command]
pub fn configure_ai_profile(state: State<'_, AiRuntime>, profile: AiProfile) -> Result<(), String> {
    validate_endpoint(&profile.base_url, profile.allow_insecure_http)?;
    if profile.id.trim().is_empty() {
        return Err("AI profile id is required.".to_string());
    }
    state
        .profiles
        .lock()
        .map_err(|_| "AI profile state is unavailable.".to_string())?
        .insert(profile.id.clone(), profile);
    Ok(())
}

#[tauri::command]
pub async fn start_ai_http_stream(
    app: AppHandle,
    state: State<'_, AiRuntime>,
    request: AiHttpStreamRequest,
) -> Result<AiHttpStreamStart, String> {
    let profile = profile_for_request(&state, &request)?;
    let url = validate_endpoint(&request.url, request.allow_insecure_http || profile.allow_insecure_http)?;
    let method = Method::from_bytes(request.method.as_bytes()).map_err(|_| "Invalid AI HTTP method.".to_string())?;
    let body = request.body.clone().unwrap_or_default();
    if body.len() > MAX_REQUEST_BODY_BYTES {
        return Err("AI request body is too large.".to_string());
    }

    let (abort_handle, abort_registration) = AbortHandle::new_pair();
    state
        .requests
        .lock()
        .map_err(|_| "AI request state is unavailable.".to_string())?
        .insert(request.request_id.clone(), abort_handle);

    let client = build_client(url.origin().ascii_serialization())?;
    let secret = read_credential(profile.credential_id.as_deref())?;
    let request_id = request.request_id.clone();
    let request_headers = sanitize_headers(&request.headers)?;
    let request_url = url.to_string();
    let request_id_for_task = request_id.clone();
    let state_requests = state.requests.clone();
    let app_for_task = app.clone();
    let send_future = async move {
        let mut builder = client.request(method, request_url).headers(request_headers);
        if !secret.is_empty() {
            builder = builder.bearer_auth(secret);
        }
        if !body.is_empty() {
            builder = builder.body(body);
        }
        builder.send().await.map_err(|error| format!("AI request failed: {error}"))
    };
    let response = match Abortable::new(send_future, abort_registration).await {
        Ok(Ok(response)) => response,
        Ok(Err(error)) => {
            remove_request(state.requests.as_ref(), &request_id);
            return Err(error);
        }
        Err(_) => {
            remove_request(state.requests.as_ref(), &request_id);
            emit_http_event(&app, request_id, "error", None, Some("AI request was cancelled.".to_string()));
            return Err("AI request was cancelled.".to_string());
        }
    };

    let headers = response_headers(&response)?;
    let start = AiHttpStreamStart {
        request_id: request_id.clone(),
        status: response.status().as_u16(),
        status_text: response.status().canonical_reason().unwrap_or_default().to_string(),
        headers,
    };
    let body_stream = response.bytes_stream();
    let (body_handle, body_registration) = AbortHandle::new_pair();
    if let Ok(mut requests) = state.requests.lock() {
        requests.insert(request_id.clone(), body_handle);
    }
    tauri::async_runtime::spawn(async move {
        if Abortable::new(
            stream_response_body(app_for_task, request_id_for_task.clone(), body_stream, state_requests.clone()),
            body_registration,
        )
        .await
        .is_err()
        {
            emit_http_event(&app, request_id_for_task.clone(), "error", None, Some("AI response stream was cancelled.".to_string()));
            remove_request(state_requests.as_ref(), &request_id_for_task);
        }
    });
    Ok(start)
}

#[tauri::command]
pub fn cancel_ai_http_stream(state: State<'_, AiRuntime>, request_id: String) -> Result<(), String> {
    let handle = state
        .requests
        .lock()
        .map_err(|_| "AI request state is unavailable.".to_string())?
        .remove(&request_id);
    if let Some(handle) = handle {
        handle.abort();
    }
    Ok(())
}

#[tauri::command]
pub fn store_ai_credential(request: AiCredentialRequest) -> Result<(), String> {
    let credential_id = normalize_credential_id(&request.credential_id)?;
    if request.secret.trim().is_empty() {
        return Err("Credential cannot be empty.".to_string());
    }
    Entry::new(KEYRING_SERVICE, &credential_id)
        .map_err(|_| "Could not access the system credential store.".to_string())?
        .set_password(request.secret.trim())
        .map_err(|_| "Could not store the AI credential in the system credential store.".to_string())
}

#[tauri::command]
pub fn ai_credential_status(credential_id: String) -> Result<AiCredentialStatus, String> {
    let credential_id = normalize_credential_id(&credential_id)?;
    let configured = Entry::new(KEYRING_SERVICE, &credential_id)
        .map_err(|_| "Could not access the system credential store.".to_string())?
        .get_password()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    Ok(AiCredentialStatus { credential_id, configured })
}

#[tauri::command]
pub fn delete_ai_credential(credential_id: String) -> Result<(), String> {
    let credential_id = normalize_credential_id(&credential_id)?;
    let entry = Entry::new(KEYRING_SERVICE, &credential_id)
        .map_err(|_| "Could not access the system credential store.".to_string())?;
    let _ = entry.delete_credential();
    Ok(())
}

#[tauri::command]
pub async fn fetch_ai_models(
    state: State<'_, AiRuntime>,
    profile_id: String,
) -> Result<Vec<AiModel>, String> {
    let profile = state
        .profiles
        .lock()
        .map_err(|_| "AI profile state is unavailable.".to_string())?
        .get(&profile_id)
        .cloned()
        .ok_or_else(|| "AI profile is not configured.".to_string())?;
    let base = validate_endpoint(&profile.base_url, profile.allow_insecure_http)?;
    let url = base.join("models").map_err(|_| "Invalid AI models endpoint.".to_string())?;
    let client = build_client(url.origin().ascii_serialization())?;
    let secret = read_credential(profile.credential_id.as_deref())?;
    let mut request = client.get(url);
    if !secret.is_empty() {
        request = request.bearer_auth(secret);
    }
    let response = request.send().await.map_err(|error| format!("AI models request failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("AI models request failed ({})", response.status()));
    }
    let envelope = response.json::<ModelsEnvelope>().await.map_err(|_| "AI models response was invalid.".to_string())?;
    let mut models = envelope.data;
    models.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(models)
}

async fn stream_response_body(
    app: AppHandle,
    request_id: String,
    mut body: impl futures_util::Stream<Item = Result<bytes::Bytes, reqwest::Error>> + Unpin,
    requests: Arc<Mutex<HashMap<String, AbortHandle>>>,
) {
    let mut response_bytes = 0usize;
    while let Some(chunk) = body.next().await {
        match chunk {
            Ok(chunk) => {
                response_bytes = response_bytes.saturating_add(chunk.len());
                if response_bytes > MAX_RESPONSE_BODY_BYTES {
                    emit_http_event(&app, request_id.clone(), "error", None, Some("AI response body is too large.".to_string()));
                    remove_request(requests.as_ref(), &request_id);
                    return;
                }
                let encoded = base64::engine::general_purpose::STANDARD.encode(chunk);
                emit_http_event(&app, request_id.clone(), "chunk", Some(encoded), None);
            }
            Err(_) => {
                emit_http_event(&app, request_id.clone(), "error", None, Some("AI response stream failed.".to_string()));
                remove_request(requests.as_ref(), &request_id);
                return;
            }
        }
    }
    emit_http_event(&app, request_id.clone(), "done", None, None);
    remove_request(requests.as_ref(), &request_id);
}

fn profile_for_request(state: &State<'_, AiRuntime>, request: &AiHttpStreamRequest) -> Result<AiProfile, String> {
    let profile_id = request
        .profile_id
        .as_deref()
        .or_else(|| request.headers.get("x-card-agent-profile").map(String::as_str))
        .ok_or_else(|| "AI profile id is required.".to_string())?;
    state
        .profiles
        .lock()
        .map_err(|_| "AI profile state is unavailable.".to_string())?
        .get(profile_id)
        .cloned()
        .ok_or_else(|| "AI profile is not configured.".to_string())
}

fn read_credential(credential_id: Option<&str>) -> Result<String, String> {
    let Some(credential_id) = credential_id else {
        return Ok(String::new());
    };
    let credential_id = normalize_credential_id(credential_id)?;
    match Entry::new(KEYRING_SERVICE, &credential_id)
        .map_err(|_| "Could not access the system credential store.".to_string())?
        .get_password()
    {
        Ok(value) => Ok(value),
        Err(_) => Err("AI credential is not configured in the system credential store.".to_string()),
    }
}

fn sanitize_headers(headers: &HashMap<String, String>) -> Result<reqwest::header::HeaderMap, String> {
    let mut output = reqwest::header::HeaderMap::new();
    for (name, value) in headers {
        if name.eq_ignore_ascii_case("authorization")
            || name.eq_ignore_ascii_case("x-card-agent-profile")
            || name.eq_ignore_ascii_case("x-card-agent-credential")
        {
            continue;
        }
        if value.len() > 8 * 1024 {
            return Err("AI request header is too large.".to_string());
        }
        let header_name = reqwest::header::HeaderName::from_bytes(name.as_bytes()).map_err(|_| "Invalid AI request header.".to_string())?;
        let header_value = reqwest::header::HeaderValue::from_str(value).map_err(|_| "Invalid AI request header value.".to_string())?;
        output.insert(header_name, header_value);
    }
    Ok(output)
}

fn build_client(origin: String) -> Result<Client, String> {
    let origin_url = Url::parse(&origin).map_err(|_| "Invalid AI origin.".to_string())?;
    Client::builder()
        .timeout(Duration::from_millis(MAX_AI_TIMEOUT_MS))
        .redirect(Policy::custom(move |attempt| {
            if attempt.url().origin() == origin_url.origin() {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .build()
        .map_err(|_| "Could not create AI HTTP client.".to_string())
}

fn validate_endpoint(value: &str, allow_insecure_http: bool) -> Result<Url, String> {
    let url = Url::parse(value.trim()).map_err(|_| "AI URL is invalid.".to_string())?;
    match url.scheme() {
        "https" => Ok(url),
        "http" if allow_insecure_http || is_loopback(&url) => Ok(url),
        "http" => Err("HTTP is only allowed for loopback endpoints unless explicitly enabled.".to_string()),
        _ => Err("AI URL must use HTTPS, or explicitly enabled loopback HTTP.".to_string()),
    }
}

fn is_loopback(url: &Url) -> bool {
    matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "::1"))
}

fn response_headers(response: &reqwest::Response) -> Result<HashMap<String, String>, String> {
    let mut total = 0;
    let mut headers = HashMap::new();
    for (name, value) in response.headers() {
        total += name.as_str().len() + value.as_bytes().len();
        if total > MAX_RESPONSE_HEADER_BYTES {
            return Err("AI response headers are too large.".to_string());
        }
        if let Ok(value) = value.to_str() {
            headers.insert(name.to_string(), value.to_string());
        }
    }
    Ok(headers)
}

fn normalize_credential_id(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value.len() > 200 || !value.chars().all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')) {
        return Err("Credential id is invalid.".to_string());
    }
    Ok(value.to_string())
}

fn remove_request(requests: &Mutex<HashMap<String, AbortHandle>>, request_id: &str) {
    if let Ok(mut requests) = requests.lock() {
        requests.remove(request_id);
    }
}

fn emit_http_event(app: &AppHandle, request_id: String, event: &str, data: Option<String>, message: Option<String>) {
    let _ = app.emit(
        if event == "chunk" { "ai://http-stream" } else { "ai://http-stream-end" },
        AiHttpStreamEvent { request_id, event: event.to_string(), data, message },
    );
}

#[cfg(test)]
mod tests {
    use super::{is_loopback, normalize_credential_id, validate_endpoint, Url};

    #[test]
    fn rejects_remote_http_by_default() {
        assert!(validate_endpoint("http://example.com", false).is_err());
    }

    #[test]
    fn allows_loopback_http() {
        assert!(validate_endpoint("http://127.0.0.1:8080", false).is_ok());
        assert!(is_loopback(&Url::parse("http://localhost").unwrap()));
    }

    #[test]
    fn validates_credential_ids() {
        assert!(normalize_credential_id("profile-key").is_ok());
        assert!(normalize_credential_id("../secret").is_err());
    }
}
