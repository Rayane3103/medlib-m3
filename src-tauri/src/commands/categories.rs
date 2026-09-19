use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

use crate::error::{unique_violation, AppError, AppResult};

#[derive(Serialize, sqlx::FromRow)]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub active: bool,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct CategoryInput {
    pub name: String,
}

#[tauri::command]
pub async fn list_categories(
    pool: State<'_, SqlitePool>,
    include_inactive: bool,
) -> AppResult<Vec<Category>> {
    let rows = sqlx::query_as::<_, Category>(
        "SELECT id, name, active, created_at
         FROM categories
         WHERE active = 1 OR ?1 = 1
         ORDER BY name",
    )
    .bind(include_inactive)
    .fetch_all(pool.inner())
    .await?;

    Ok(rows)
}

#[tauri::command]
pub async fn create_category(
    pool: State<'_, SqlitePool>,
    input: CategoryInput,
) -> AppResult<Category> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(AppError::msg("Le nom de la catégorie est obligatoire."));
    }

    let id = sqlx::query("INSERT INTO categories (name) VALUES (?1)")
        .bind(name)
        .execute(pool.inner())
        .await
        .map_err(|e| unique_violation(e, "Une catégorie portant ce nom existe déjà."))?
        .last_insert_rowid();

    fetch_category(pool.inner(), id).await
}

#[tauri::command]
pub async fn update_category(
    pool: State<'_, SqlitePool>,
    id: i64,
    input: CategoryInput,
) -> AppResult<Category> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(AppError::msg("Le nom de la catégorie est obligatoire."));
    }

    sqlx::query("UPDATE categories SET name = ?1 WHERE id = ?2")
        .bind(name)
        .bind(id)
        .execute(pool.inner())
        .await
        .map_err(|e| unique_violation(e, "Une catégorie portant ce nom existe déjà."))?;

    fetch_category(pool.inner(), id).await
}

#[tauri::command]
pub async fn set_category_active(
    pool: State<'_, SqlitePool>,
    id: i64,
    active: bool,
) -> AppResult<()> {
    sqlx::query("UPDATE categories SET active = ?1 WHERE id = ?2")
        .bind(active)
        .bind(id)
        .execute(pool.inner())
        .await?;

    Ok(())
}

async fn fetch_category(pool: &SqlitePool, id: i64) -> AppResult<Category> {
    sqlx::query_as::<_, Category>(
        "SELECT id, name, active, created_at FROM categories WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::msg("Catégorie introuvable."))
}
