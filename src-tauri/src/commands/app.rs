use serde::Serialize;
use tauri::AppHandle;

use crate::db;
use crate::error::AppResult;

#[derive(Serialize)]
pub struct AppInfo {
    version: String,
    db_path: String,
}

#[tauri::command]
pub fn app_info(app: AppHandle) -> AppResult<AppInfo> {
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        db_path: db::db_file_path(&app)?.display().to_string(),
    })
}
