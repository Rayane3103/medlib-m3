use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

use crate::error::{AppError, AppResult};

/// Movement types that can be created directly from the Stock page. PURCHASE
/// and SALE movements are created automatically by the Purchases and POS
/// steps and never go through this command.
const ADJUSTMENT_TYPES: [&str; 3] = ["ADJUSTMENT", "DAMAGE", "RETURN"];

#[derive(Serialize, sqlx::FromRow)]
pub struct StockMovement {
    pub id: i64,
    #[sqlx(rename = "type")]
    pub movement_type: String,
    pub quantity: i64,
    pub reference_type: Option<String>,
    pub reference_id: Option<i64>,
    pub note: Option<String>,
    pub created_at: String,
}

#[derive(Deserialize)]
pub struct StockAdjustmentInput {
    pub movement_type: String,
    /// Signed change to apply to stock, e.g. +5 or -1. Never zero.
    pub quantity: i64,
    pub note: Option<String>,
}

/// Manually adjust a product's stock (stock found, damage, return, correction).
/// Updates `products.stock` and records a `stock_movements` row in one
/// transaction, and never lets stock go negative.
#[tauri::command]
pub async fn adjust_stock(
    pool: State<'_, SqlitePool>,
    product_id: i64,
    input: StockAdjustmentInput,
) -> AppResult<()> {
    let movement_type = input.movement_type.to_uppercase();
    if !ADJUSTMENT_TYPES.contains(&movement_type.as_str()) {
        return Err(AppError::msg("Type de mouvement de stock invalide."));
    }
    if input.quantity == 0 {
        return Err(AppError::msg("La variation de quantité ne peut pas être nulle."));
    }

    let mut tx = pool.inner().begin().await?;

    let row: Option<(String, i64)> =
        sqlx::query_as("SELECT name, stock FROM products WHERE id = ?1")
            .bind(product_id)
            .fetch_optional(&mut *tx)
            .await?;
    let (name, stock) = row.ok_or_else(|| AppError::msg("Produit introuvable."))?;

    let new_stock = stock + input.quantity;
    if new_stock < 0 {
        return Err(AppError::msg(format!(
            "Impossible d'appliquer cette modification : « {name} » n'a que {stock} en stock."
        )));
    }

    sqlx::query("UPDATE products SET stock = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2")
        .bind(new_stock)
        .bind(product_id)
        .execute(&mut *tx)
        .await?;

    sqlx::query(
        "INSERT INTO stock_movements (product_id, type, quantity, note)
         VALUES (?1, ?2, ?3, ?4)",
    )
    .bind(product_id)
    .bind(movement_type)
    .bind(input.quantity)
    .bind(normalize_note(&input.note))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(())
}

#[tauri::command]
pub async fn list_stock_movements(
    pool: State<'_, SqlitePool>,
    product_id: i64,
) -> AppResult<Vec<StockMovement>> {
    let rows = sqlx::query_as::<_, StockMovement>(
        "SELECT id, type, quantity, reference_type, reference_id, note, created_at
         FROM stock_movements
         WHERE product_id = ?1
         ORDER BY id DESC
         LIMIT 200",
    )
    .bind(product_id)
    .fetch_all(pool.inner())
    .await?;

    Ok(rows)
}

fn normalize_note(note: &Option<String>) -> Option<String> {
    note.as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}
