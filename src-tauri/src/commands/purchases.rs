use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

use crate::error::{AppError, AppResult};

#[derive(Serialize, sqlx::FromRow)]
pub struct PurchaseSummary {
    pub id: i64,
    pub total: i64,
    pub status: String,
    pub purchase_date: String,
    pub notes: Option<String>,
    pub created_at: String,
    pub item_count: i64,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct PurchaseItemDetail {
    pub id: i64,
    pub product_id: i64,
    pub product_name: String,
    pub quantity: i64,
    pub unit_price: i64,
    pub total: i64,
}

#[derive(Serialize)]
pub struct PurchaseDetail {
    #[serde(flatten)]
    pub purchase: PurchaseSummary,
    pub items: Vec<PurchaseItemDetail>,
}

#[derive(Deserialize)]
pub struct PurchaseItemInput {
    pub product_id: i64,
    pub quantity: i64,
    pub unit_price: i64,
}

#[derive(Deserialize)]
pub struct CreatePurchaseInput {
    pub notes: Option<String>,
    pub items: Vec<PurchaseItemInput>,
}

const PURCHASE_SELECT: &str = "
    SELECT p.id, p.total, p.status, p.purchase_date, p.notes, p.created_at,
           (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id) as item_count
    FROM purchases p";

#[tauri::command]
pub async fn list_purchases(pool: State<'_, SqlitePool>) -> AppResult<Vec<PurchaseSummary>> {
    let rows = sqlx::query_as::<_, PurchaseSummary>(&format!(
        "{PURCHASE_SELECT} ORDER BY p.id DESC LIMIT 200"
    ))
    .fetch_all(pool.inner())
    .await?;

    Ok(rows)
}

#[tauri::command]
pub async fn get_purchase(pool: State<'_, SqlitePool>, id: i64) -> AppResult<PurchaseDetail> {
    fetch_purchase_detail(pool.inner(), id).await
}

/// Complete a purchase: create the purchase and its items, increase stock for
/// each product (and record its new cost), and create a PURCHASE stock
/// movement per item - all in one transaction.
#[tauri::command]
pub async fn create_purchase(
    pool: State<'_, SqlitePool>,
    input: CreatePurchaseInput,
) -> AppResult<PurchaseDetail> {
    if input.items.is_empty() {
        return Err(AppError::msg("Ajoutez au moins un produit à l'achat."));
    }
    for item in &input.items {
        if item.quantity <= 0 {
            return Err(AppError::msg("La quantité doit être supérieure à zéro."));
        }
        if item.unit_price < 0 {
            return Err(AppError::msg("Le prix unitaire ne peut pas être négatif."));
        }
    }

    let total: i64 = input.items.iter().map(|i| i.quantity * i.unit_price).sum();
    let notes = normalize(&input.notes);

    let mut tx = pool.inner().begin().await?;

    let purchase_id = sqlx::query(
        "INSERT INTO purchases (total, status, notes) VALUES (?1, 'COMPLETED', ?2)",
    )
    .bind(total)
    .bind(notes)
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    for item in &input.items {
        let item_total = item.quantity * item.unit_price;

        sqlx::query(
            "INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_price, total)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(purchase_id)
        .bind(item.product_id)
        .bind(item.quantity)
        .bind(item.unit_price)
        .bind(item_total)
        .execute(&mut *tx)
        .await?;

        // The latest purchase price becomes the product's current cost.
        sqlx::query(
            "UPDATE products
             SET stock = stock + ?1, purchase_price = ?2, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?3",
        )
        .bind(item.quantity)
        .bind(item.unit_price)
        .bind(item.product_id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "INSERT INTO stock_movements (product_id, type, quantity, reference_type, reference_id)
             VALUES (?1, 'PURCHASE', ?2, 'purchase', ?3)",
        )
        .bind(item.product_id)
        .bind(item.quantity)
        .bind(purchase_id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    fetch_purchase_detail(pool.inner(), purchase_id).await
}

async fn fetch_purchase_detail(pool: &SqlitePool, id: i64) -> AppResult<PurchaseDetail> {
    let purchase = sqlx::query_as::<_, PurchaseSummary>(&format!(
        "{PURCHASE_SELECT} WHERE p.id = ?1"
    ))
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::msg("Achat introuvable."))?;

    let items = sqlx::query_as::<_, PurchaseItemDetail>(
        "SELECT pi.id, pi.product_id, pr.name as product_name, pi.quantity, pi.unit_price, pi.total
         FROM purchase_items pi
         JOIN products pr ON pr.id = pi.product_id
         WHERE pi.purchase_id = ?1
         ORDER BY pi.id",
    )
    .bind(id)
    .fetch_all(pool)
    .await?;

    Ok(PurchaseDetail { purchase, items })
}

fn normalize(value: &Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}
