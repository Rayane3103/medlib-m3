use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

use crate::error::{AppError, AppResult};

const PAYMENT_METHODS: [&str; 3] = ["CASH", "CARD", "OTHER"];

#[derive(Serialize, sqlx::FromRow)]
pub struct SaleSummary {
    pub id: i64,
    pub customer_id: Option<i64>,
    pub total: i64,
    pub payment_method: String,
    pub status: String,
    pub sale_date: String,
    pub created_at: String,
    pub item_count: i64,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct SaleItemDetail {
    pub id: i64,
    /// `None` for an ad-hoc line (fees, extras) that isn't a product.
    pub product_id: Option<i64>,
    pub product_name: String,
    pub quantity: i64,
    pub unit_price: i64,
    pub purchase_price: i64,
    pub total: i64,
}

#[derive(Serialize)]
pub struct SaleDetail {
    #[serde(flatten)]
    pub sale: SaleSummary,
    pub items: Vec<SaleItemDetail>,
}

#[derive(Deserialize)]
pub struct SaleItemInput {
    /// `None` = ad-hoc line; `label` must then be set. No stock is touched.
    pub product_id: Option<i64>,
    #[serde(default)]
    pub label: Option<String>,
    pub quantity: i64,
    pub unit_price: i64,
}

#[derive(Deserialize)]
pub struct CreateSaleInput {
    pub payment_method: String,
    pub customer_id: Option<i64>,
    pub items: Vec<SaleItemInput>,
}

const SALE_SELECT: &str = "
    SELECT s.id, s.customer_id, s.total, s.payment_method, s.status, s.sale_date, s.created_at,
           (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) as item_count
    FROM sales s";

#[tauri::command]
pub async fn list_sales(pool: State<'_, SqlitePool>) -> AppResult<Vec<SaleSummary>> {
    let rows = sqlx::query_as::<_, SaleSummary>(&format!(
        "{SALE_SELECT} ORDER BY s.id DESC LIMIT 200"
    ))
    .fetch_all(pool.inner())
    .await?;

    Ok(rows)
}

#[tauri::command]
pub async fn get_sale(pool: State<'_, SqlitePool>, id: i64) -> AppResult<SaleDetail> {
    fetch_sale_detail(pool.inner(), id).await
}

/// Complete a sale: create the sale and its items (snapshotting each
/// product's current purchase price so historical profit stays correct),
/// decrease stock, and create a SALE stock movement per item - all in one
/// transaction. Never lets stock go negative. Ad-hoc lines (no product)
/// are stored with their label only and leave stock alone.
#[tauri::command]
pub async fn create_sale(
    pool: State<'_, SqlitePool>,
    input: CreateSaleInput,
) -> AppResult<SaleDetail> {
    if input.items.is_empty() {
        return Err(AppError::msg("Ajoutez au moins un produit au panier."));
    }
    let payment_method = input.payment_method.to_uppercase();
    if !PAYMENT_METHODS.contains(&payment_method.as_str()) {
        return Err(AppError::msg("Mode de paiement invalide."));
    }
    for item in &input.items {
        if item.quantity <= 0 {
            return Err(AppError::msg("La quantité doit être supérieure à zéro."));
        }
        if item.unit_price < 0 {
            return Err(AppError::msg("Le prix unitaire ne peut pas être négatif."));
        }
        if item.product_id.is_none() && item.label.as_deref().map_or(true, |l| l.trim().is_empty()) {
            return Err(AppError::msg("Un frais doit avoir un nom."));
        }
    }

    let mut tx = pool.inner().begin().await?;

    // Snapshot stock/name/purchase_price for every line before writing
    // anything, so a stock problem on item 3 doesn't leave items 1-2 applied.
    let mut lines = Vec::with_capacity(input.items.len());
    for item in &input.items {
        let Some(product_id) = item.product_id else {
            // Ad-hoc line: nothing to check, no purchase price to snapshot.
            lines.push((item, 0));
            continue;
        };

        let row: Option<(String, i64, i64)> = sqlx::query_as(
            "SELECT name, stock, purchase_price FROM products WHERE id = ?1 AND active = 1",
        )
        .bind(product_id)
        .fetch_optional(&mut *tx)
        .await?;

        let (name, stock, purchase_price) =
            row.ok_or_else(|| AppError::msg("L'un des produits du panier n'est plus disponible."))?;

        if stock < item.quantity {
            return Err(AppError::msg(format!(
                "Impossible de valider la vente : « {name} » n'a que {stock} unité(s) en stock."
            )));
        }

        lines.push((item, purchase_price));
    }

    let total: i64 = input.items.iter().map(|i| i.quantity * i.unit_price).sum();

    let sale_id = sqlx::query(
        "INSERT INTO sales (customer_id, total, payment_method, status)
         VALUES (?1, ?2, ?3, 'COMPLETED')",
    )
    .bind(input.customer_id)
    .bind(total)
    .bind(&payment_method)
    .execute(&mut *tx)
    .await?
    .last_insert_rowid();

    for (item, purchase_price) in lines {
        let item_total = item.quantity * item.unit_price;

        let label = item
            .label
            .as_deref()
            .map(str::trim)
            .filter(|l| !l.is_empty() && item.product_id.is_none());

        sqlx::query(
            "INSERT INTO sale_items (sale_id, product_id, label, quantity, unit_price, purchase_price, total)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        )
        .bind(sale_id)
        .bind(item.product_id)
        .bind(label)
        .bind(item.quantity)
        .bind(item.unit_price)
        .bind(purchase_price)
        .bind(item_total)
        .execute(&mut *tx)
        .await?;

        let Some(product_id) = item.product_id else {
            continue;
        };

        sqlx::query(
            "UPDATE products SET stock = stock - ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        )
        .bind(item.quantity)
        .bind(product_id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "INSERT INTO stock_movements (product_id, type, quantity, reference_type, reference_id)
             VALUES (?1, 'SALE', ?2, 'sale', ?3)",
        )
        .bind(product_id)
        .bind(-item.quantity)
        .bind(sale_id)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    fetch_sale_detail(pool.inner(), sale_id).await
}

async fn fetch_sale_detail(pool: &SqlitePool, id: i64) -> AppResult<SaleDetail> {
    let sale = sqlx::query_as::<_, SaleSummary>(&format!("{SALE_SELECT} WHERE s.id = ?1"))
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::msg("Vente introuvable."))?;

    let items = sqlx::query_as::<_, SaleItemDetail>(
        "SELECT si.id, si.product_id, COALESCE(pr.name, si.label, '') as product_name,
                si.quantity, si.unit_price, si.purchase_price, si.total
         FROM sale_items si
         LEFT JOIN products pr ON pr.id = si.product_id
         WHERE si.sale_id = ?1
         ORDER BY si.id",
    )
    .bind(id)
    .fetch_all(pool)
    .await?;

    Ok(SaleDetail { sale, items })
}
