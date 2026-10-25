use serde::{ser::SerializeStruct, Serialize, Serializer};

/// Errors surfaced to the frontend as `{ code, detail }`. The frontend owns
/// the user-facing (translated) text for each code.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("invalid username or password")]
    InvalidCredentials,
    #[error("user already exists")]
    UserExists,
    #[error("journal is locked")]
    Locked,
    #[error("entry not found")]
    NotFound,
    /// Validation failure; the payload is the error code (e.g. `invalidDate`).
    #[error("invalid input: {0}")]
    Invalid(&'static str),
    #[error("decryption failed")]
    Crypto,
    #[error("internal error: {0}")]
    Internal(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("data error: {0}")]
    Json(#[from] serde_json::Error),
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::InvalidCredentials => "invalidCredentials",
            AppError::UserExists => "userExists",
            AppError::Locked => "locked",
            AppError::NotFound => "notFound",
            AppError::Invalid(code) => code,
            AppError::Crypto => "crypto",
            AppError::Internal(_) => "internal",
            AppError::Io(_) => "io",
            AppError::Json(_) => "data",
        }
    }

    fn detail(&self) -> Option<String> {
        match self {
            AppError::Internal(d) => Some(d.clone()),
            AppError::Io(e) => Some(e.to_string()),
            AppError::Json(e) => Some(e.to_string()),
            _ => None,
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("code", self.code())?;
        s.serialize_field("detail", &self.detail())?;
        s.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;
