mod commands;
mod db;
mod error;
mod scan_server;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Open the database (creating it and running migrations on first run)
            // before any window can call a command.
            let handle = app.handle().clone();
            let pool = tauri::async_runtime::block_on(db::init_pool(&handle))?;

            // Certificate lives next to the database so it survives restarts;
            // the session token itself is generated fresh every launch.
            let cert_dir = db::db_file_path(&handle)?
                .parent()
                .map(|p| p.to_path_buf())
                .unwrap_or_else(std::env::temp_dir);
            let mobile_page = load_mobile_page(&handle);

            let (scan_session, cart_feed) = tauri::async_runtime::block_on(scan_server::start(
                handle,
                pool.clone(),
                &cert_dir,
                mobile_page,
            ));

            app.manage(pool);
            app.manage(scan_session);
            app.manage(cart_feed);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::app_info,
            commands::dashboard::get_dashboard_summary,
            commands::categories::list_categories,
            commands::categories::create_category,
            commands::categories::update_category,
            commands::categories::set_category_active,
            commands::products::list_products,
            commands::products::create_product,
            commands::products::update_product,
            commands::products::set_product_active,
            commands::stock::adjust_stock,
            commands::stock::list_stock_movements,
            commands::purchases::list_purchases,
            commands::purchases::get_purchase,
            commands::purchases::create_purchase,
            commands::sales::list_sales,
            commands::sales::get_sale,
            commands::sales::create_sale,
            commands::scan::get_scan_session,
            commands::scan::set_scan_listener_active,
            commands::scan::publish_cart_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Read the pre-built phone-scanner page (`npm run build:mobile`).
/// Missing/unreadable is not an error here - the scan server just falls
/// back to a small built-in page explaining what to run.
///
/// Dev builds read straight from the source tree (via `CARGO_MANIFEST_DIR`,
/// baked in at compile time) since Tauri's resource resolution is meant for
/// installed apps, not `cargo run`. Release builds use the real bundled
/// resource, copied next to the executable by `tauri build`.
#[cfg(debug_assertions)]
fn load_mobile_page(_app: &tauri::AppHandle) -> Option<String> {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("mobile-scanner/index.html");
    std::fs::read_to_string(path).ok()
}

#[cfg(not(debug_assertions))]
fn load_mobile_page(app: &tauri::AppHandle) -> Option<String> {
    let path = app
        .path()
        .resolve("mobile-scanner/index.html", tauri::path::BaseDirectory::Resource)
        .ok()?;
    std::fs::read_to_string(path).ok()
}
