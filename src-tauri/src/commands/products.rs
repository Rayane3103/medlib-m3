use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

use crate::error::{unique_violation, AppError, AppResult};

#[derive(Serialize, sqlx::FromRow)]
pub struct Product {
    pub id: i64,
    pub barcode: Option<String>,
    pub name: String,
    pub category_id: Option<i64>,
    pub category_name: Option<String>,
    pub brand: Option<String>,
    pub purchase_price: i64,
    pub selling_price: i64,
    pub stock: i64,
    pub active: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Filters for the product list/search screen. All fields are optional from
/// the frontend's point of view; `serde(default)` fills in "no filter".
#[derive(Deserialize, Default)]
pub struct ProductFilter {
    #[serde(default)]
    pub search: String,
    #[serde(default)]
    pub category_id: Option<i64>,
    #[serde(default)]
    pub include_inactive: bool,
}

/// Fields editable once a product exists. Stock itself is not among them -
/// past creation, it only changes through purchases, sales and stock
/// adjustments, each of which records a stock movement.
#[derive(Deserialize)]
pub struct ProductInput {
    pub barcode: Option<String>,
    pub name: String,
    pub category_id: Option<i64>,
    pub brand: Option<String>,
    pub purchase_price: i64,
    pub selling_price: i64,
}

/// Creating a product is the one time stock can be set directly, to skip a
/// trip to the Stock page for a brand new item. A non-zero starting count
/// still gets its own ADJUSTMENT stock movement, same as any other change.
#[derive(Deserialize)]
pub struct CreateProductInput {
    #[serde(flatten)]
    pub base: ProductInput,
    #[serde(default)]
    pub stock: i64,
}

const PRODUCT_SELECT: &str = "
    SELECT p.id, p.barcode, p.name, p.category_id, c.name as category_name,
           p.brand, p.purchase_price, p.selling_price, p.stock,
           p.active, p.created_at, p.updated_at
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id";

#[tauri::command]
pub async fn list_products(
    pool: State<'_, SqlitePool>,
    filter: ProductFilter,
) -> AppResult<Vec<Product>> {
    let search = filter.search.trim().to_string();
    let like = format!("%{search}%");

    let sql = format!(
        "{PRODUCT_SELECT}
         WHERE (p.active = 1 OR ?1 = 1)
           AND (?2 = '' OR p.name LIKE ?3 OR p.barcode LIKE ?3 OR p.brand LIKE ?3)
           AND (?4 IS NULL OR p.category_id = ?4)
         ORDER BY p.name"
    );

    let rows = sqlx::query_as::<_, Product>(&sql)
        .bind(filter.include_inactive)
        .bind(search)
        .bind(like)
        .bind(filter.category_id)
        .fetch_all(pool.inner())
        .await?;

    Ok(rows)
}

/// Create a product. If a starting stock count is given, it's applied in the
/// same transaction as an ADJUSTMENT stock movement - creation is the only
/// place stock can be set without going through Purchases or Stock.
#[tauri::command]
pub async fn create_product(
    pool: State<'_, SqlitePool>,
    input: CreateProductInput,
) -> AppResult<Product> {
    validate_product_input(&input.base)?;
    if input.stock < 0 {
        return Err(AppError::msg("Le stock ne peut pas être négatif."));
    }
    let barcode = normalize_barcode(&input.base.barcode);

    let mut tx = pool.inner().begin().await?;

    let id = sqlx::query(
        "INSERT INTO products
            (barcode, name, category_id, brand, purchase_price, selling_price, stock)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )
    .bind(barcode)
    .bind(input.base.name.trim())
    .bind(input.base.category_id)
    .bind(trimmed(&input.base.brand))
    .bind(input.base.purchase_price)
    .bind(input.base.selling_price)
    .bind(input.stock)
    .execute(&mut *tx)
    .await
    .map_err(|e| unique_violation(e, "Ce code-barres est déjà utilisé par un autre produit."))?
    .last_insert_rowid();

    if input.stock > 0 {
        sqlx::query(
            "INSERT INTO stock_movements (product_id, type, quantity, note)
             VALUES (?1, 'ADJUSTMENT', ?2, 'Initial stock')",
        )
        .bind(id)
        .bind(input.stock)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    fetch_product(pool.inner(), id).await
}

#[tauri::command]
pub async fn update_product(
    pool: State<'_, SqlitePool>,
    id: i64,
    input: ProductInput,
) -> AppResult<Product> {
    validate_product_input(&input)?;
    let barcode = normalize_barcode(&input.barcode);

    let result = sqlx::query(
        "UPDATE products SET
            barcode = ?1, name = ?2, category_id = ?3, brand = ?4,
            purchase_price = ?5, selling_price = ?6,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?7",
    )
    .bind(barcode)
    .bind(input.name.trim())
    .bind(input.category_id)
    .bind(trimmed(&input.brand))
    .bind(input.purchase_price)
    .bind(input.selling_price)
    .bind(id)
    .execute(pool.inner())
    .await
    .map_err(|e| unique_violation(e, "Ce code-barres est déjà utilisé par un autre produit."))?;

    if result.rows_affected() == 0 {
        return Err(AppError::msg("Produit introuvable."));
    }

    fetch_product(pool.inner(), id).await
}

/// Activate or deactivate a product. Products with historical sales/purchases
/// are never deleted - see DEVELOPMENT.md.
#[tauri::command]
pub async fn set_product_active(
    pool: State<'_, SqlitePool>,
    id: i64,
    active: bool,
) -> AppResult<()> {
    sqlx::query("UPDATE products SET active = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2")
        .bind(active)
        .bind(id)
        .execute(pool.inner())
        .await?;

    Ok(())
}

fn validate_product_input(input: &ProductInput) -> AppResult<()> {
    if input.name.trim().is_empty() {
        return Err(AppError::msg("Le nom du produit est obligatoire."));
    }
    if input.purchase_price < 0 || input.selling_price < 0 {
        return Err(AppError::msg("Les prix ne peuvent pas être négatifs."));
    }
    Ok(())
}

/// Treat a blank barcode as "no barcode" so the partial unique index doesn't
/// collide on empty strings.
fn normalize_barcode(barcode: &Option<String>) -> Option<String> {
    barcode
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn trimmed(value: &Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

async fn fetch_product(pool: &SqlitePool, id: i64) -> AppResult<Product> {
    sqlx::query_as::<_, Product>(&format!("{PRODUCT_SELECT} WHERE p.id = ?1"))
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::msg("Produit introuvable."))
}
