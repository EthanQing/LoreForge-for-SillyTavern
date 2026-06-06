use futures_util::StreamExt;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const MAX_AI_TIMEOUT_MS: u64 = 1_800_000;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderRequest {
    pub base_url: String,
    pub api_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiModel {
    pub id: String,
    #[serde(default, alias = "owned_by")]
    pub owned_by: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ModelsEnvelope {
    data: Vec<AiModel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatRequest {
    pub request_id: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub messages: Vec<AiChatMessage>,
    #[serde(default)]
    pub stream: bool,
    pub temperature: Option<f64>,
    pub max_tokens: Option<u32>,
    pub thinking_effort: Option<String>,
    pub deepseek_thinking: Option<bool>,
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub json_response: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStreamEvent {
    pub request_id: String,
    pub event: String,
    pub content_delta: String,
    pub reasoning_delta: String,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiChatResult {
    pub content: String,
    pub reasoning: String,
    pub model: String,
}

#[derive(Debug, Deserialize)]
struct ChatEnvelope {
    model: Option<String>,
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessagePayload,
}

#[derive(Debug, Deserialize)]
struct ChatMessagePayload {
    content: Option<String>,
    reasoning_content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct StreamEnvelope {
    choices: Vec<StreamChoice>,
}

#[derive(Debug, Deserialize)]
struct StreamChoice {
    delta: StreamDelta,
}

#[derive(Debug, Deserialize)]
struct StreamDelta {
    content: Option<String>,
    reasoning_content: Option<String>,
}

#[tauri::command]
pub async fn fetch_ai_models(request: AiProviderRequest) -> Result<Vec<AiModel>, String> {
    let client = client(30_000)?;
    let response = client
        .get(endpoint(&request.base_url, "models")?)
        .bearer_auth(request.api_key.trim())
        .send()
        .await
        .map_err(|error| error.to_string())?;

    parse_json_response::<ModelsEnvelope>(
        ensure_success(response, &request.api_key).await?,
        &request.api_key,
        "AI models request",
    )
    .await
    .map(|envelope| {
        let mut models = envelope.data;
        models.sort_by(|left, right| left.id.cmp(&right.id));
        models
    })
}

#[tauri::command]
pub async fn test_ai_connection(
    app: AppHandle,
    request: AiChatRequest,
) -> Result<AiChatResult, String> {
    run_ai_chat(app, request).await
}

#[tauri::command]
pub async fn send_ai_chat(app: AppHandle, request: AiChatRequest) -> Result<AiChatResult, String> {
    run_ai_chat(app, request).await
}

async fn run_ai_chat(app: AppHandle, request: AiChatRequest) -> Result<AiChatResult, String> {
    if request.stream {
        stream_chat_completion(app, request).await
    } else {
        chat_completion(request).await
    }
}

async fn chat_completion(request: AiChatRequest) -> Result<AiChatResult, String> {
    let client = client(request.timeout_ms.unwrap_or(60_000))?;
    let response = client
        .post(endpoint(&request.base_url, "chat/completions")?)
        .bearer_auth(request.api_key.trim())
        .json(&chat_body(&request))
        .send()
        .await
        .map_err(|error| error.to_string())?;

    let envelope = parse_json_response::<ChatEnvelope>(
        ensure_success(response, &request.api_key).await?,
        &request.api_key,
        "AI chat request",
    )
    .await?;
    let message = envelope
        .choices
        .into_iter()
        .next()
        .map(|choice| choice.message)
        .unwrap_or(ChatMessagePayload {
            content: None,
            reasoning_content: None,
        });

    Ok(AiChatResult {
        content: message.content.unwrap_or_default(),
        reasoning: message.reasoning_content.unwrap_or_default(),
        model: envelope.model.unwrap_or(request.model),
    })
}

async fn stream_chat_completion(
    app: AppHandle,
    request: AiChatRequest,
) -> Result<AiChatResult, String> {
    let client = stream_client(request.timeout_ms.unwrap_or(60_000))?;
    let response = client
        .post(endpoint(&request.base_url, "chat/completions")?)
        .bearer_auth(request.api_key.trim())
        .json(&chat_body(&request))
        .send()
        .await
        .map_err(|error| error.to_string())?;

    let response = ensure_success(response, &request.api_key).await?;
    let response_debug = response_debug(&response);
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut content = String::new();
    let mut reasoning = String::new();

    emit_stream_event(
        &app,
        AiStreamEvent {
            request_id: request.request_id.clone(),
            event: "start".to_string(),
            content_delta: String::new(),
            reasoning_delta: String::new(),
            message: None,
        },
    );

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| {
            format!(
                "AI stream body read failed: {error}. {response_debug}. Content so far: {}. Reasoning so far: {}",
                preview_text(&content),
                preview_text(&reasoning)
            )
        })?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(index) = buffer.find('\n') {
            let mut line = buffer[..index].trim().to_string();
            buffer = buffer[index + 1..].to_string();
            if !line.starts_with("data:") {
                continue;
            }
            line = line.trim_start_matches("data:").trim().to_string();
            if line == "[DONE]" {
                emit_stream_event(
                    &app,
                    AiStreamEvent {
                        request_id: request.request_id.clone(),
                        event: "done".to_string(),
                        content_delta: String::new(),
                        reasoning_delta: String::new(),
                        message: None,
                    },
                );
                return Ok(AiChatResult {
                    content,
                    reasoning,
                    model: request.model,
                });
            }

            let parsed = serde_json::from_str::<StreamEnvelope>(&line);
            if let Ok(envelope) = parsed {
                if let Some(delta) = envelope
                    .choices
                    .into_iter()
                    .next()
                    .map(|choice| choice.delta)
                {
                    let content_delta = delta.content.unwrap_or_default();
                    let reasoning_delta = delta.reasoning_content.unwrap_or_default();
                    if content_delta.is_empty() && reasoning_delta.is_empty() {
                        continue;
                    }
                    content.push_str(&content_delta);
                    reasoning.push_str(&reasoning_delta);
                    emit_stream_event(
                        &app,
                        AiStreamEvent {
                            request_id: request.request_id.clone(),
                            event: "delta".to_string(),
                            content_delta,
                            reasoning_delta,
                            message: None,
                        },
                    );
                }
            } else if line.starts_with('{') {
                return Err(format!(
                    "AI stream returned an unexpected JSON event. {response_debug}. Event preview: {}",
                    preview_text(&line)
                ));
            }
        }
    }

    emit_stream_event(
        &app,
        AiStreamEvent {
            request_id: request.request_id.clone(),
            event: "done".to_string(),
            content_delta: String::new(),
            reasoning_delta: String::new(),
            message: None,
        },
    );
    Ok(AiChatResult {
        content,
        reasoning,
        model: request.model,
    })
}

fn chat_body(request: &AiChatRequest) -> Value {
    let mut body = json!({
        "model": request.model,
        "messages": request.messages,
        "stream": request.stream,
    });

    if let Some(temperature) = request.temperature {
        body["temperature"] = json!(temperature.clamp(0.0, 2.0));
    }
    if let Some(max_tokens) = request.max_tokens.filter(|tokens| *tokens > 0) {
        body["max_tokens"] = json!(max_tokens);
    }
    if let Some(effort) = request
        .thinking_effort
        .as_deref()
        .filter(|effort| matches!(*effort, "high" | "max"))
    {
        body["reasoning_effort"] = json!(effort);
    }
    if let Some(enabled) = request.deepseek_thinking {
        body["thinking"] = json!({ "type": if enabled { "enabled" } else { "disabled" } });
    }
    if request.json_response {
        body["response_format"] = json!({ "type": "json_object" });
    }

    body
}

fn client(timeout_ms: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_millis(
            timeout_ms.clamp(1_000, MAX_AI_TIMEOUT_MS),
        ))
        .build()
        .map_err(|error| error.to_string())
}

fn stream_client(timeout_ms: u64) -> Result<reqwest::Client, String> {
    let timeout = Duration::from_millis(timeout_ms.clamp(1_000, MAX_AI_TIMEOUT_MS));
    reqwest::Client::builder()
        .connect_timeout(timeout)
        .read_timeout(timeout)
        .build()
        .map_err(|error| error.to_string())
}

fn endpoint(base_url: &str, path: &str) -> Result<String, String> {
    let base_url = base_url.trim().trim_end_matches('/');
    if base_url.is_empty() {
        return Err("Base URL is required.".to_string());
    }
    if !base_url.starts_with("http://") && !base_url.starts_with("https://") {
        return Err("Base URL must start with http:// or https://.".to_string());
    }
    Ok(format!("{base_url}/{path}"))
}

async fn ensure_success(
    response: reqwest::Response,
    api_key: &str,
) -> Result<reqwest::Response, String> {
    if response.status().is_success() {
        return Ok(response);
    }

    let status = response.status();
    let debug = response_debug(&response);
    let message = response
        .text()
        .await
        .map(|body| preview_text(&redact_secret(&body, api_key)))
        .unwrap_or_else(|error| format!("failed to read error body: {error}"));
    Err(format!(
        "AI request failed ({status}). {debug}. Body preview: {message}"
    ))
}

async fn parse_json_response<T: DeserializeOwned>(
    response: reqwest::Response,
    api_key: &str,
    context: &str,
) -> Result<T, String> {
    let debug = response_debug(&response);
    let text = response
        .text()
        .await
        .map_err(|error| format!("{context}: failed to read response body: {error}. {debug}"))?;
    serde_json::from_str::<T>(&text).map_err(|error| {
        format!(
            "{context}: response was not valid OpenAI-compatible JSON ({error}). {debug}. Body preview: {}",
            preview_text(&redact_secret(&text, api_key))
        )
    })
}

fn response_debug(response: &reqwest::Response) -> String {
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("unknown");
    let content_encoding = response
        .headers()
        .get(reqwest::header::CONTENT_ENCODING)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("none");
    format!(
        "status={}, content-type={}, content-encoding={}",
        response.status(),
        content_type,
        content_encoding
    )
}

fn preview_text(value: &str) -> String {
    const MAX_PREVIEW: usize = 700;
    let normalized = value.replace('\r', "\\r").replace('\n', "\\n");
    let mut preview = normalized.chars().take(MAX_PREVIEW).collect::<String>();
    if normalized.chars().count() > MAX_PREVIEW {
        preview.push_str("...");
    }
    if preview.is_empty() {
        "<empty>".to_string()
    } else {
        preview
    }
}

fn redact_secret(message: &str, secret: &str) -> String {
    let secret = secret.trim();
    if secret.is_empty() {
        return message.to_string();
    }
    message.replace(secret, "[redacted]")
}

fn emit_stream_event(app: &AppHandle, event: AiStreamEvent) {
    let _ = app.emit("ai://stream", event);
}
