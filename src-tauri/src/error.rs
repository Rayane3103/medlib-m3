use serde::{Serialize, Serializer};

/// Error type returned by every Tauri command.
///
/// `Db` wraps raw SQLx failures and is shown to the user as a generic message
/// (details go to the log). `Message` carries a clean, business-level message
/// that is safe to show directly, e.g. "Not enough stock for \"Stylo Bleu\"".
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Message(String),

    #[error("database error")]
    Db(#[from] sqlx::Error),

    #[error("migration error")]
    Migrate(#[from] sqlx::migrate::MigrateError),
}

impl AppError {
    pub fn msg(text: impl Into<String>) -> Self {
        AppError::Message(text.into())
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        // Log the real error, hand the frontend something readable.
        let shown = match self {
            AppError::Message(m) => m.clone(),
            AppError::Db(e) => {
                eprintln!("[db error] {e}");
                "Une erreur de base de données est survenue.".to_string()
            }
            AppError::Migrate(e) => {
                eprintln!("[migration error] {e}");
                "La base de données n'a pas pu être préparée.".to_string()
            }
        };
        serializer.serialize_str(&shown)
    }
}

pub type AppResult<T> = Result<T, AppError>;

/// Turn a SQLite UNIQUE-constraint failure into a friendly, business-level
/// message. Any other database error passes through unchanged.
pub fn unique_violation(e: sqlx::Error, message: &str) -> AppError {
    if let sqlx::Error::Database(db_err) = &e {
        let is_unique = db_err.code().as_deref() == Some("2067")
            || db_err.message().to_lowercase().contains("unique constraint");
        if is_unique {
            return AppError::msg(message);
        }
    }
    AppError::Db(e)
}
