use std::path::PathBuf;
use std::time::Duration;

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

/// Full path to the SQLite database file inside the OS application-data directory,
/// e.g. `C:\Users\<name>\AppData\Roaming\com.medlib.m3\medlib.db`.
pub fn db_file_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| AppError::msg("Impossible de déterminer le dossier de données de l'application."))?;
    Ok(dir.join("medlib.db"))
}

/// Open the connection pool, creating the database file and running migrations
/// on first launch. Kept small: a single pool, sane pragmas, embedded migrations.
pub async fn init_pool(app: &AppHandle) -> AppResult<SqlitePool> {
    let path = db_file_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AppError::msg(format!("Impossible de créer le dossier de données : {e}")))?;
    }

    let options = SqliteConnectOptions::new()
        .filename(&path)
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(Duration::from_secs(5));

    // A desktop app has one user; a couple of connections is plenty.
    let pool = SqlitePoolOptions::new()
        .max_connections(4)
        .connect_with(options)
        .await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    Ok(pool)
}
