use thiserror::Error;

pub type CardResult<T> = Result<T, CardError>;

#[derive(Debug, Error)]
pub enum CardError {
    #[error("File operation failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON could not be read: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Archive could not be read: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("Card metadata could not be decoded: {0}")]
    Base64(#[from] base64::DecodeError),
    #[error("{0}")]
    Invalid(String),
}

pub fn command_error(error: CardError) -> String {
    error.to_string()
}
