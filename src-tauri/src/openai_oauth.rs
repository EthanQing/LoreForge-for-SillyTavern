use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use keyring::Entry;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::State;

const KEYRING_SERVICE: &str = "sillytavern-card-creator";
const CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const DEVICE_USER_CODE_URL: &str = "https://auth.openai.com/api/accounts/deviceauth/usercode";
const DEVICE_TOKEN_URL: &str = "https://auth.openai.com/api/accounts/deviceauth/token";
const DEVICE_VERIFICATION_URI: &str = "https://auth.openai.com/codex/device";
const TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
const DEVICE_REDIRECT_URI: &str = "https://auth.openai.com/deviceauth/callback";
const DEVICE_CODE_TIMEOUT_SECONDS: u64 = 15 * 60;
const JWT_CLAIM_PATH: &str = "https://api.openai.com/auth";
static FLOW_SEQUENCE: AtomicU64 = AtomicU64::new(1);

#[derive(Default)]
pub struct OpenAiOauthRuntime {
    flows: Mutex<HashMap<String, PendingDeviceFlow>>,
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiOauthStart {
    flow_id: String,
    user_code: String,
    verification_uri: String,
    interval_seconds: u64,
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
    let client = oauth_client()?;
    let response = client
        .post(DEVICE_USER_CODE_URL)
        .json(&serde_json::json!({ "client_id": CLIENT_ID }))
        .send()
        .await
        .map_err(|error| format!("OpenAI login request failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("OpenAI device login is unavailable ({}). Enable device-code login in ChatGPT security settings and try again.", response.status()));
    }
    let device = response
        .json::<DeviceCodeResponse>()
        .await
        .map_err(|_| "OpenAI device login response was invalid.".to_string())?;
    if device.device_auth_id.trim().is_empty() || device.user_code.trim().is_empty() {
        return Err("OpenAI device login response was incomplete.".to_string());
    }
    let now = unix_millis();
    let flow_id = format!(
        "openai-{}-{}",
        now,
        FLOW_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    );
    let interval_seconds = device.interval.max(1);
    let expires_at = now.saturating_add(DEVICE_CODE_TIMEOUT_SECONDS * 1000);
    state
        .flows
        .lock()
        .map_err(|_| "OpenAI login state is unavailable.".to_string())?
        .insert(
            flow_id.clone(),
            PendingDeviceFlow {
                credential_id,
                device_auth_id: device.device_auth_id,
                user_code: device.user_code.clone(),
                interval_seconds,
                expires_at,
            },
        );
    Ok(OpenAiOauthStart {
        flow_id,
        user_code: device.user_code,
        verification_uri: DEVICE_VERIFICATION_URI.to_string(),
        interval_seconds,
        expires_at,
    })
}

#[tauri::command]
pub async fn complete_openai_oauth(
    state: State<'_, OpenAiOauthRuntime>,
    flow_id: String,
) -> Result<OpenAiOauthStatus, String> {
    let flow = get_flow(&state, &flow_id)?;
    let client = oauth_client()?;
    let mut interval_seconds = flow.interval_seconds;

    loop {
        if unix_millis() >= flow.expires_at {
            remove_flow(&state, &flow_id);
            return Err("OpenAI device login expired. Start a new login.".to_string());
        }
        if !flow_is_active(&state, &flow_id)? {
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
            .map_err(|error| format!("OpenAI login polling failed: {error}"))?;

        if response.status().is_success() {
            let code = response
                .json::<DeviceTokenResponse>()
                .await
                .map_err(|_| "OpenAI login response was invalid.".to_string())?;
            let credential = exchange_authorization_code(&client, &code).await?;
            store_credential(&flow.credential_id, &credential)?;
            remove_flow(&state, &flow_id);
            return Ok(status_for_credential(Some(&credential)));
        }

        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let error_code = oauth_error_code(&body);
        if error_code.as_deref() == Some("slow_down") {
            interval_seconds = interval_seconds.saturating_add(5);
        } else if device_poll_is_pending(status.as_u16(), error_code.as_deref()) {
            // Authorization is still pending. Empty 403/404 responses are used by this flow.
        } else {
            remove_flow(&state, &flow_id);
            let reason = error_code.unwrap_or_else(|| status.to_string());
            return Err(format!("OpenAI device login failed ({reason})."));
        }
        tokio::time::sleep(Duration::from_secs(interval_seconds)).await;
    }
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

async fn exchange_authorization_code(
    client: &Client,
    code: &DeviceTokenResponse,
) -> Result<OpenAiOauthCredential, String> {
    let response = client
        .post(TOKEN_URL)
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", CLIENT_ID),
            ("code", code.authorization_code.as_str()),
            ("code_verifier", code.code_verifier.as_str()),
            ("redirect_uri", DEVICE_REDIRECT_URI),
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

fn get_flow(
    state: &OpenAiOauthRuntime,
    flow_id: &str,
) -> Result<PendingDeviceFlow, String> {
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
        account_id_from_token, deserialize_interval, device_poll_is_pending, oauth_error_code,
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
}
