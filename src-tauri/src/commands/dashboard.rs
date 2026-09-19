use serde::Serialize;
use sqlx::SqlitePool;
use tauri::State;

use crate::error::AppResult;

#[derive(Serialize, sqlx::FromRow)]
pub struct RecentSale {
    pub id: i64,
    pub total: i64,
    pub payment_method: String,
    pub sale_date: String,
}

#[derive(Serialize)]
pub struct DashboardSummary {
    today_sales_total: i64,
    today_sales_count: i64,
    today_estimated_profit: i64,
    recent_sales: Vec<RecentSale>,
}

/// Simple "today" summary for the dashboard. "Today" is the local calendar day.
#[tauri::command]
pub async fn get_dashboard_summary(
    pool: State<'_, SqlitePool>,
) -> AppResult<DashboardSummary> {
    let pool = pool.inner();

    let (today_sales_total, today_sales_count): (i64, i64) = sqlx::query_as(
        "SELECT COALESCE(SUM(total), 0), COUNT(*)
         FROM sales
         WHERE status = 'COMPLETED'
           AND date(sale_date, 'localtime') = date('now', 'localtime')",
    )
    .fetch_one(pool)
    .await?;

    let today_estimated_profit: i64 = sqlx::query_scalar(
        "SELECT COALESCE(SUM((si.unit_price - si.purchase_price) * si.quantity), 0)
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         WHERE s.status = 'COMPLETED'
           AND date(s.sale_date, 'localtime') = date('now', 'localtime')",
    )
    .fetch_one(pool)
    .await?;

    let recent_sales = sqlx::query_as::<_, RecentSale>(
        "SELECT id, total, payment_method, sale_date
         FROM sales
         WHERE status = 'COMPLETED'
         ORDER BY id DESC
         LIMIT 10",
    )
    .fetch_all(pool)
    .await?;

    Ok(DashboardSummary {
        today_sales_total,
        today_sales_count,
        today_estimated_profit,
        recent_sales,
    })
}
