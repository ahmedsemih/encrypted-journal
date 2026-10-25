use serde::{Serialize, Serializer};

/// Errors surfaced to the frontend. Messages are user-facing (Turkish).
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Kullanıcı adı veya parola hatalı")]
    InvalidCredentials,
    #[error("Bu kullanıcı adı zaten kayıtlı")]
    UserExists,
    #[error("Günlük kilitli, lütfen tekrar giriş yapın")]
    Locked,
    #[error("Kayıt bulunamadı")]
    NotFound,
    #[error("{0}")]
    Invalid(String),
    #[error("Şifre çözme başarısız: veri bozuk veya anahtar hatalı")]
    Crypto,
    #[error("Dosya hatası: {0}")]
    Io(#[from] std::io::Error),
    #[error("Veri hatası: {0}")]
    Json(#[from] serde_json::Error),
}

impl AppError {
    pub fn invalid(msg: impl Into<String>) -> Self {
        AppError::Invalid(msg.into())
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
