use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use keyring::Entry;
use rand::{rngs::OsRng, TryRngCore};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::State;
use url::Url;

const KEYRING_SERVICE: &str = "sillytavern-card-creator";
const CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL: &str = "https://auth.openai.com/oauth/authorize";
const DEVICE_USER_CODE_URL: &str = "https://auth.openai.com/api/accounts/deviceauth/usercode";
const DEVICE_TOKEN_URL: &str = "https://auth.openai.com/api/accounts/deviceauth/token";
const DEVICE_VERIFICATION_URI: &str = "https://auth.openai.com/codex/device";
const TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
const BROWSER_REDIRECT_URI: &str = "http://localhost:1455/auth/callback";
const DEVICE_REDIRECT_URI: &str = "https://auth.openai.com/deviceauth/callback";
const OAUTH_SCOPE: &str = "openid profile email offline_access";
const OAUTH_CALLBACK_HOST: &str = "127.0.0.1";
const OAUTH_CALLBACK_PORT: u16 = 1455;
const DEVICE_CODE_TIMEOUT_SECONDS: u64 = 15 * 60;
const JWT_CLAIM_PATH: &str = "https://api.openai.com/auth";
static FLOW_SEQUENCE: AtomicU64 = AtomicU64::new(1);

#[derive(Default)]
pub struct OpenAiOauthRuntime {
    flows: Mutex<HashMap<String, Arc<PendingOpenAiFlow>>>,
    refresh_lock: tokio::sync::Mutex<()>,
}

#[derive(Clone)]
struct PendingDeviceFlow {
    credential_id: String,
    device_auth_id: String,
    user_code: String,
    interval_seconds: u64,
    expires_at: u64,
}

struct PendingBrowserFlow {
    credential_id: String,
    verifier: String,
    state: String,
    listener: TcpListener,
    expires_at: u64,
}

enum PendingOpenAiFlow {
    Browser(PendingBrowserFlow),
    Device(PendingDeviceFlow),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiOauthStart {
    flow_id: String,
    method: String,
    auth_url: Option<String>,
    user_code: Option<String>,
    verification_uri: Option<String>,
    interval_seconds: Option<u64>,
    expires_at: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiOauthStatus {
    configured: bool,
    expires_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenAiOauthCredential {
    credential_type: String,
    access: String,
    refresh: String,
    expires: u64,
    account_id: String,
}

#[derive(Debug, Deserialize)]
struct DeviceCodeResponse {
    device_auth_id: String,
    user_code: String,
    #[serde(deserialize_with = "deserialize_interval")]
    interval: u64,
}

#[derive(Debug, Deserialize)]
struct DeviceTokenResponse {
    authorization_code: String,
    code_verifier: String,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
}

pub struct OpenAiRequestAuth {
    pub access_token: String,
    pub account_id: String,
}

#[tauri::command]
pub async fn begin_openai_oauth(
    state: State<'_, OpenAiOauthRuntime>,
    credential_id: String,
) -> Result<OpenAiOauthStart, String> {
    let credential_id = normalize_credential_id(&credential_id)?;
    let now = unix_millis();
    let flow_id = format!(
        "openai-{}-{}",
        now,
        FLOW_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    );
    let expires_at = now.saturating_add(DEVICE_CODE_TIMEOUT_SECONDS * 1000);
    match create_browser_flow(&credential_id, expires_at) {
        Ok((flow, auth_url)) => {
            insert_flow(&state, &flow_id, PendingOpenAiFlow::Browser(flow))?;
            Ok(OpenAiOauthStart {
                flow_id,
                method: "browser".to_string(),
                auth_url: Some(auth_url),
                user_code: None,
                verification_uri: None,
                interval_seconds: None,
                expires_at,
            })
        }
        Err(browser_error) => {
            let device = begin_device_flow(&credential_id, expires_at).await.map_err(|device_error| {
                format!("Browser login could not start ({browser_error}). Device-code fallback also failed: {device_error}")
            })?;
            let interval_seconds = device.interval_seconds;
            let user_code = device.user_code.clone();
            insert_flow(&state, &flow_id, PendingOpenAiFlow::Device(device))?;
            Ok(OpenAiOauthStart {
                flow_id,
                method: "device-code".to_string(),
                auth_url: None,
                user_code: Some(user_code),
                verification_uri: Some(DEVICE_VERIFICATION_URI.to_string()),
                interval_seconds: Some(interval_seconds),
                expires_at,
            })
        }
    }
}

#[tauri::command]
pub async fn complete_openai_oauth(
    state: State<'_, OpenAiOauthRuntime>,
    flow_id: String,
) -> Result<OpenAiOauthStatus, String> {
    let flow = get_flow(&state, &flow_id)?;
    let client = oauth_client()?;
    let credential = match flow.as_ref() {
        PendingOpenAiFlow::Browser(browser) => {
            let code = match wait_for_browser_code(&state, &flow_id, browser).await {
                Ok(code) => code,
                Err(error) => {
                    remove_flow(&state, &flow_id);
                    return Err(error);
                }
            };
            exchange_browser_authorization_code(&client, &code, &browser.verifier).await
        }
        PendingOpenAiFlow::Device(device) => complete_device_flow(&state, &flow_id, device, &client).await,
    };
    let credential = match credential {
        Ok(credential) => credential,
        Err(error) => {
            remove_flow(&state, &flow_id);
            return Err(error);
        }
    };
    let credential_id = match flow.as_ref() {
        PendingOpenAiFlow::Browser(browser) => &browser.credential_id,
        PendingOpenAiFlow::Device(device) => &device.credential_id,
    };
    if let Err(error) = store_credential(credential_id, &credential) {
        remove_flow(&state, &flow_id);
        return Err(error);
    }
    remove_flow(&state, &flow_id);
    Ok(status_for_credential(Some(&credential)))
}

fn create_browser_flow(
    credential_id: &str,
    expires_at: u64,
) -> Result<(PendingBrowserFlow, String), String> {
    let listener = TcpListener::bind((OAUTH_CALLBACK_HOST, OAUTH_CALLBACK_PORT))
        .map_err(|error| format!("OpenAI browser callback port {OAUTH_CALLBACK_PORT} is unavailable: {error}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("Could not prepare the OpenAI browser callback: {error}"))?;
    let verifier = random_url_token(32)?;
    let state = random_url_token(16)?;
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let mut url = Url::parse(AUTHORIZE_URL).map_err(|_| "OpenAI authorization URL is invalid.".to_string())?;
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", CLIENT_ID)
        .append_pair("redirect_uri", BROWSER_REDIRECT_URI)
        .append_pair("scope", OAUTH_SCOPE)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", &state)
        .append_pair("id_token_add_organizations", "true")
        .append_pair("codex_cli_simplified_flow", "true")
        .append_pair("originator", "pi");
    Ok((
        PendingBrowserFlow {
            credential_id: credential_id.to_string(),
            verifier,
            state,
            listener,
            expires_at,
        },
        url.to_string(),
    ))
}

async fn begin_device_flow(
    credential_id: &str,
    expires_at: u64,
) -> Result<PendingDeviceFlow, String> {
    let client = oauth_client()?;
    let response = client
        .post(DEVICE_USER_CODE_URL)
        .json(&serde_json::json!({ "client_id": CLIENT_ID }))
        .send()
        .await
        .map_err(|error| format!("OpenAI device login request failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("OpenAI device login is unavailable ({})", response.status()));
    }
    let device = response
        .json::<DeviceCodeResponse>()
        .await
        .map_err(|_| "OpenAI device login response was invalid.".to_string())?;
    if device.device_auth_id.trim().is_empty() || device.user_code.trim().is_empty() {
        return Err("OpenAI device login response was incomplete.".to_string());
    }
    Ok(PendingDeviceFlow {
        credential_id: credential_id.to_string(),
        device_auth_id: device.device_auth_id,
        user_code: device.user_code,
        interval_seconds: device.interval.max(1),
        expires_at,
    })
}

async fn complete_device_flow(
    state: &OpenAiOauthRuntime,
    flow_id: &str,
    flow: &PendingDeviceFlow,
    client: &Client,
) -> Result<OpenAiOauthCredential, String> {
    let mut interval_seconds = flow.interval_seconds;
    loop {
        if unix_millis() >= flow.expires_at {
            remove_flow(state, flow_id);
            return Err("OpenAI device login expired. Start a new login.".to_string());
        }
        if !flow_is_active(state, flow_id)? {
            return Err("OpenAI login was cancelled.".to_string());
        }

        let response = client
            .post(DEVICE_TOKEN_URL)
            .json(&serde_json::json!({
                "device_auth_id": flow.device_auth_id,
                "user_code": flow.user_code,
            }))
            .send()
            .await
            .map_err(|error| format!("OpenAI device login polling failed: {error}"))?;

        if response.status().is_success() {
            let code = response
                .json::<DeviceTokenResponse>()
                .await
                .map_err(|_| "OpenAI login response was invalid.".to_string())?;
            return exchange_authorization_code(
                client,
                &code.authorization_code,
                &code.code_verifier,
                DEVICE_REDIRECT_URI,
            )
            .await;
        }

        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let error_code = oauth_error_code(&body);
        if error_code.as_deref() == Some("slow_down") {
            interval_seconds = interval_seconds.saturating_add(5);
        } else if device_poll_is_pending(status.as_u16(), error_code.as_deref()) {
            // Authorization is still pending. Empty 403/404 responses are used by this flow.
        } else {
            remove_flow(state, flow_id);
            let reason = error_code.unwrap_or_else(|| status.to_string());
            return Err(format!("OpenAI device login failed ({reason})."));
        }
        tokio::time::sleep(Duration::from_secs(interval_seconds)).await;
    }
}

async fn wait_for_browser_code(
    state: &OpenAiOauthRuntime,
    flow_id: &str,
    flow: &PendingBrowserFlow,
) -> Result<String, String> {
    loop {
        if unix_millis() >= flow.expires_at {
            remove_flow(state, flow_id);
            return Err("OpenAI browser login expired. Start a new login.".to_string());
        }
        if !flow_is_active(state, flow_id)? {
            return Err("OpenAI login was cancelled.".to_string());
        }

        match flow.listener.accept() {
            Ok((stream, _)) => match read_browser_callback(stream, &flow.state)? {
                Some(code) => return Ok(code),
                None => continue,
            },
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
            Err(error) => {
                remove_flow(state, flow_id);
                return Err(format!("OpenAI browser callback failed: {error}"));
            }
        }
    }
}

fn read_browser_callback(mut stream: TcpStream, expected_state: &str) -> Result<Option<String>, String> {
    stream
        .set_nonblocking(false)
        .map_err(|error| format!("Could not read the OpenAI browser callback: {error}"))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| format!("Could not configure the OpenAI browser callback: {error}"))?;
    let mut buffer = [0_u8; 8192];
    let count = stream
        .read(&mut buffer)
        .map_err(|error| format!("Could not read the OpenAI browser callback: {error}"))?;
    let request = String::from_utf8_lossy(&buffer[..count]);
    let target = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .ok_or_else(|| "OpenAI browser callback request was invalid.".to_string())?;
    let callback = Url::parse(&format!("http://localhost{target}"))
        .map_err(|_| "OpenAI browser callback URL was invalid.".to_string())?;
    if callback.path() != "/auth/callback" {
        write_callback_response(&mut stream, false, "Callback route not found.")?;
        return Ok(None);
    }
    if callback.query_pairs().find(|(key, _)| key == "state").map(|(_, value)| value.into_owned()).as_deref() != Some(expected_state) {
        write_callback_response(&mut stream, false, "State mismatch.")?;
        return Ok(None);
    }
    if let Some(error) = callback.query_pairs().find(|(key, _)| key == "error").map(|(_, value)| value.into_owned()) {
        write_callback_response(&mut stream, false, "OpenAI login was denied.")?;
        return Err(format!("OpenAI browser login failed ({error})."));
    }
    let code = callback
        .query_pairs()
        .find(|(key, _)| key == "code")
        .map(|(_, value)| value.into_owned())
        .filter(|value| !value.trim().is_empty());
    let Some(code) = code else {
        write_callback_response(&mut stream, false, "Authorization code was missing.")?;
        return Err("OpenAI browser login did not return an authorization code.".to_string());
    };
    write_callback_response(&mut stream, true, "OpenAI authentication completed. You can close this window.")?;
    Ok(Some(code))
}

fn write_callback_response(stream: &mut TcpStream, success: bool, message: &str) -> Result<(), String> {
    let color = if success { "#15803d" } else { "#b91c1c" };
    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>OpenAI sign-in</title></head><body style=\"font-family: sans-serif; padding: 2rem\"><h2 style=\"color:{color}\">{message}</h2></body></html>"
    );
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(), body
    );
    stream
        .write_all(response.as_bytes())
        .and_then(|_| stream.flush())
        .map_err(|error| format!("Could not respond to the OpenAI browser callback: {error}"))
}

#[tauri::command]
pub fn cancel_openai_oauth(
    state: State<'_, OpenAiOauthRuntime>,
    flow_id: String,
) -> Result<(), String> {
    remove_flow(&state, &flow_id);
    Ok(())
}

#[tauri::command]
pub fn openai_oauth_status(credential_id: String) -> Result<OpenAiOauthStatus, String> {
    let credential_id = normalize_credential_id(&credential_id)?;
    Ok(status_for_credential(read_credential(&credential_id).ok().as_ref()))
}

#[tauri::command]
pub fn logout_openai_oauth(credential_id: String) -> Result<(), String> {
    let credential_id = normalize_credential_id(&credential_id)?;
    let entry = Entry::new(KEYRING_SERVICE, &credential_id)
        .map_err(|_| "Could not access the system credential store.".to_string())?;
    let _ = entry.delete_credential();
    Ok(())
}

pub async fn request_auth(
    state: &OpenAiOauthRuntime,
    credential_id: &str,
) -> Result<OpenAiRequestAuth, String> {
    let credential_id = normalize_credential_id(credential_id)?;
    let _refresh_guard = state.refresh_lock.lock().await;
    let mut credential = read_credential(&credential_id)
        .map_err(|_| "Sign in with ChatGPT before using OpenAI Codex.".to_string())?;
    if credential.expires <= unix_millis().saturating_add(60_000) {
        credential = refresh_credential(&credential.refresh).await?;
        store_credential(&credential_id, &credential)?;
    }
    Ok(OpenAiRequestAuth {
        access_token: credential.access,
        account_id: credential.account_id,
    })
}

async fn exchange_browser_authorization_code(
    client: &Client,
    code: &str,
    verifier: &str,
) -> Result<OpenAiOauthCredential, String> {
    exchange_authorization_code(client, code, verifier, BROWSER_REDIRECT_URI).await
}

async fn exchange_authorization_code(
    client: &Client,
    code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<OpenAiOauthCredential, String> {
    let response = client
        .post(TOKEN_URL)
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", CLIENT_ID),
            ("code", code),
            ("code_verifier", verifier),
            ("redirect_uri", redirect_uri),
        ])
        .send()
        .await
        .map_err(|error| format!("OpenAI token exchange failed: {error}"))?;
    token_response_to_credential(response, "exchange").await
}

async fn refresh_credential(refresh_token: &str) -> Result<OpenAiOauthCredential, String> {
    let client = oauth_client()?;
    let response = client
        .post(TOKEN_URL)
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("client_id", CLIENT_ID),
        ])
        .send()
        .await
        .map_err(|error| format!("OpenAI token refresh failed: {error}"))?;
    token_response_to_credential(response, "refresh").await
}

async fn token_response_to_credential(
    response: reqwest::Response,
    operation: &str,
) -> Result<OpenAiOauthCredential, String> {
    if !response.status().is_success() {
        return Err(format!("OpenAI token {operation} failed ({}). Sign in again.", response.status()));
    }
    let token = response
        .json::<TokenResponse>()
        .await
        .map_err(|_| format!("OpenAI token {operation} response was invalid."))?;
    let account_id = account_id_from_token(&token.access_token)?;
    Ok(OpenAiOauthCredential {
        credential_type: "oauth".to_string(),
        access: token.access_token,
        refresh: token.refresh_token,
        expires: unix_millis().saturating_add(token.expires_in.saturating_mul(1000)),
        account_id,
    })
}

fn account_id_from_token(token: &str) -> Result<String, String> {
    let payload = token
        .split('.')
        .nth(1)
        .ok_or_else(|| "OpenAI access token was invalid.".to_string())?;
    let decoded = URL_SAFE_NO_PAD
        .decode(payload)
        .map_err(|_| "OpenAI access token payload was invalid.".to_string())?;
    let value: Value = serde_json::from_slice(&decoded)
        .map_err(|_| "OpenAI access token payload was invalid.".to_string())?;
    value
        .get(JWT_CLAIM_PATH)
        .and_then(|claim| claim.get("chatgpt_account_id"))
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .ok_or_else(|| "OpenAI account id was missing from the access token.".to_string())
}

fn oauth_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "Could not create the OpenAI login client.".to_string())
}

fn store_credential(
    credential_id: &str,
    credential: &OpenAiOauthCredential,
) -> Result<(), String> {
    let value = serde_json::to_string(credential)
        .map_err(|_| "Could not serialize the OpenAI credential.".to_string())?;
    Entry::new(KEYRING_SERVICE, credential_id)
        .map_err(|_| "Could not access the system credential store.".to_string())?
        .set_password(&value)
        .map_err(|_| "Could not store the OpenAI credential in the system credential store.".to_string())
}

fn read_credential(credential_id: &str) -> Result<OpenAiOauthCredential, String> {
    let value = Entry::new(KEYRING_SERVICE, credential_id)
        .map_err(|_| "Could not access the system credential store.".to_string())?
        .get_password()
        .map_err(|_| "OpenAI credential is not configured.".to_string())?;
    serde_json::from_str(&value).map_err(|_| "Stored OpenAI credential is invalid.".to_string())
}

fn status_for_credential(credential: Option<&OpenAiOauthCredential>) -> OpenAiOauthStatus {
    OpenAiOauthStatus {
        configured: credential.is_some(),
        expires_at: credential.map(|value| value.expires),
    }
}

fn insert_flow(
    state: &OpenAiOauthRuntime,
    flow_id: &str,
    flow: PendingOpenAiFlow,
) -> Result<(), String> {
    state
        .flows
        .lock()
        .map_err(|_| "OpenAI login state is unavailable.".to_string())?
        .insert(flow_id.to_string(), Arc::new(flow));
    Ok(())
}

fn get_flow(
    state: &OpenAiOauthRuntime,
    flow_id: &str,
) -> Result<Arc<PendingOpenAiFlow>, String> {
    state
        .flows
        .lock()
        .map_err(|_| "OpenAI login state is unavailable.".to_string())?
        .get(flow_id)
        .cloned()
        .ok_or_else(|| "OpenAI login is no longer active.".to_string())
}

fn flow_is_active(state: &OpenAiOauthRuntime, flow_id: &str) -> Result<bool, String> {
    Ok(state
        .flows
        .lock()
        .map_err(|_| "OpenAI login state is unavailable.".to_string())?
        .contains_key(flow_id))
}

fn remove_flow(state: &OpenAiOauthRuntime, flow_id: &str) {
    if let Ok(mut flows) = state.flows.lock() {
        flows.remove(flow_id);
    }
}

fn normalize_credential_id(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 200
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
    {
        return Err("Credential id is invalid.".to_string());
    }
    Ok(value.to_string())
}

fn random_url_token(byte_count: usize) -> Result<String, String> {
    let mut bytes = vec![0_u8; byte_count];
    OsRng
        .try_fill_bytes(&mut bytes)
        .map_err(|_| "Could not create secure OpenAI login state.".to_string())?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

fn oauth_error_code(body: &str) -> Option<String> {
    let value: Value = serde_json::from_str(body).ok()?;
    match value.get("error")? {
        Value::String(code) => Some(code.clone()),
        Value::Object(error) => error.get("code")?.as_str().map(ToString::to_string),
        _ => None,
    }
}

fn device_poll_is_pending(status: u16, error_code: Option<&str>) -> bool {
    error_code == Some("deviceauth_authorization_pending")
        || ((status == 403 || status == 404) && error_code.is_none())
}

fn unix_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn deserialize_interval<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Value::deserialize(deserializer)?;
    match value {
        Value::Number(number) => number
            .as_u64()
            .ok_or_else(|| serde::de::Error::custom("interval must be positive")),
        Value::String(value) => value
            .parse::<u64>()
            .map_err(|_| serde::de::Error::custom("interval must be a number")),
        _ => Err(serde::de::Error::custom("interval must be a number")),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        account_id_from_token, create_browser_flow, deserialize_interval, device_poll_is_pending,
        oauth_error_code,
    };
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct Interval {
        #[serde(deserialize_with = "deserialize_interval")]
        interval: u64,
    }

    #[test]
    fn extracts_account_id_from_access_token() {
        let payload = URL_SAFE_NO_PAD.encode(
            br#"{"https://api.openai.com/auth":{"chatgpt_account_id":"account-123"}}"#,
        );
        let token = format!("header.{payload}.signature");
        assert_eq!(account_id_from_token(&token).unwrap(), "account-123");
    }

    #[test]
    fn accepts_string_device_intervals() {
        let interval: Interval = serde_json::from_str(r#"{"interval":"5"}"#).unwrap();
        assert_eq!(interval.interval, 5);
    }

    #[test]
    fn reads_nested_oauth_errors() {
        assert_eq!(
            oauth_error_code(r#"{"error":{"code":"slow_down"}}"#).as_deref(),
            Some("slow_down")
        );
    }

    #[test]
    fn stops_polling_when_device_authorization_is_denied() {
        assert!(device_poll_is_pending(403, None));
        assert!(device_poll_is_pending(
            403,
            Some("deviceauth_authorization_pending")
        ));
        assert!(!device_poll_is_pending(403, Some("access_denied")));
        assert!(!device_poll_is_pending(400, Some("expired_token")));
    }

    #[test]
    fn browser_flow_uses_pkce_and_localhost_callback() {
        let (_, auth_url) = create_browser_flow("openai-codex-oauth", u64::MAX).unwrap();
        let url = url::Url::parse(&auth_url).unwrap();
        assert_eq!(url.path(), "/oauth/authorize");
        assert_eq!(url.query_pairs().find(|(key, _)| key == "redirect_uri").map(|(_, value)| value), Some("http://localhost:1455/auth/callback".into()));
        assert_eq!(url.query_pairs().find(|(key, _)| key == "code_challenge_method").map(|(_, value)| value), Some("S256".into()));
        assert!(url.query_pairs().any(|(key, value)| key == "code_challenge" && !value.is_empty()));
        assert!(url.query_pairs().any(|(key, value)| key == "state" && !value.is_empty()));
    }
}
