use tauri::State;

use crate::scan_server::{CartFeed, CartSnapshot, ScanSession};

/// Info the POS page needs to render the "scan with your phone" QR code.
/// Regenerated once per app launch (see scan_server::start).
#[tauri::command]
pub fn get_scan_session(session: State<'_, ScanSession>) -> ScanSession {
    session.inner().clone()
}

/// The POS page calls this on mount/unmount so the phone can show a
/// "desktop not connected" warning instead of scanning into the void.
#[tauri::command]
pub fn set_scan_listener_active(feed: State<'_, CartFeed>, active: bool) {
    feed.set_connected(active);
}

/// The POS page calls this every time its active cart changes so the phone
/// can mirror it (items, quantities, total). Desktop state is the truth;
/// this is a one-way publish, never read back by the desktop.
#[tauri::command]
pub fn publish_cart_state(feed: State<'_, CartFeed>, cart: CartSnapshot) {
    feed.publish(cart);
}
