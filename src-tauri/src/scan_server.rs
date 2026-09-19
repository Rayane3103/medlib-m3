//! Embedded local HTTPS server that lets a phone act as a barcode scanner
//! for the POS. Runs inside this same process on the tokio runtime Tauri
//! already provides - no separate service, no cloud, LAN only.
//!
//! Flow: phone camera decodes a barcode -> POST /api/scan -> we look the
//! product up and emit a Tauri event to the desktop window, which adds it
//! to the cart. The phone gets its own immediate HTTP response either way
//! (found / not found / expired session) - it never depends on the desktop
//! event succeeding.
//!
//! HTTPS is required, not optional: phone browsers block camera access on
//! plain http:// pages served from a LAN address. The self-signed
//! certificate is generated once and reused across app restarts (stored
//! next to the database), and trusted into the current user's certificate
//! store so this desktop app itself never has to deal with it - only the
//! phone sees the one-time "unsafe site" warning. The session token, by
//! contrast, is regenerated on every launch, exactly so old QR codes stop
//! working after a restart.
//!
//! The phone also mirrors the desktop's active cart. The desktop is the
//! single source of truth: it publishes a snapshot of the active cart here
//! (see `CartFeed`) every time it changes, and the phone long-polls
//! GET /api/cart to receive each new version the moment it exists. Edits
//! made on the phone (quantity +/-, remove) go the other way as Tauri
//! events, the desktop applies them to its own state, and the resulting
//! snapshot flows back down - so both screens always agree.

use std::net::UdpSocket;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use axum::extract::{Query, State};
use axum::response::Html;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::{AppHandle, Emitter};
use tokio::sync::watch;
use uuid::Uuid;

const FALLBACK_PAGE: &str = r#"<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:sans-serif;padding:2rem;max-width:32rem;margin:0 auto">
<h1>Scanner page not installed</h1>
<p>The phone-scanner page has not been built for this app yet.
Run <code>npm run build:mobile</code> on the desktop and restart MedLib M3.</p>
</body></html>"#;

/// Tauri event carrying a scanned product to the POS page.
pub const SCAN_EVENT: &str = "scan:product-scanned";

/// Tauri event fired when a phone scan doesn't match any product, so the
/// desktop can offer to create it instead of just leaving the phone's
/// "not found" message as a dead end.
pub const SCAN_NOT_FOUND_EVENT: &str = "scan:product-not-found";

/// Tauri event carrying a quantity change made on the phone's cart view.
/// `quantity == 0` means "remove the line".
pub const CART_LINE_EVENT: &str = "scan:cart-line-changed";

/// How long a phone's GET /api/cart request is held open waiting for a
/// newer cart version before answering with the unchanged one. Well under
/// the ~30-60s idle timeouts of mobile browsers and proxies.
const CART_POLL_TIMEOUT: Duration = Duration::from_secs(25);

/// Info the POS page needs to render the "scan with your phone" QR code.
/// `None` when no LAN address could be found (PC not on any network).
#[derive(Clone, Serialize)]
pub struct ScanSession {
    pub url: Option<String>,
}

/// One line of the desktop's active cart, exactly as the POS page holds it.
#[derive(Clone, Serialize, Deserialize)]
pub struct CartLine {
    pub product_id: i64,
    pub name: String,
    pub barcode: Option<String>,
    pub unit_price: i64,
    pub quantity: i64,
    pub stock: i64,
}

/// What the desktop publishes: the active cart's label and lines.
#[derive(Clone, Default, Serialize, Deserialize)]
pub struct CartSnapshot {
    pub label: String,
    pub lines: Vec<CartLine>,
}

/// Everything the phone mirrors. `version` only ever goes up, which is what
/// lets the phone ask "anything newer than what I have?" and block until
/// there is. `desktop_connected` is whether the POS page is mounted and
/// listening - flipping it also bumps the version so waiting phones learn
/// about it immediately instead of at their next poll.
#[derive(Clone, Default)]
pub struct CartState {
    pub version: u64,
    pub desktop_connected: bool,
    pub cart: CartSnapshot,
}

/// Handle shared between the Tauri commands (which write) and the HTTP
/// server (which reads/waits). Managed by Tauri so commands can reach it.
#[derive(Clone)]
pub struct CartFeed(Arc<watch::Sender<CartState>>);

impl CartFeed {
    fn new() -> Self {
        let (tx, _rx) = watch::channel(CartState::default());
        Self(Arc::new(tx))
    }

    pub fn set_connected(&self, active: bool) {
        self.0.send_modify(|s| {
            s.version += 1;
            s.desktop_connected = active;
        });
    }

    pub fn publish(&self, cart: CartSnapshot) {
        self.0.send_modify(|s| {
            s.version += 1;
            s.cart = cart;
        });
    }

    fn subscribe(&self) -> watch::Receiver<CartState> {
        self.0.subscribe()
    }

    fn desktop_connected(&self) -> bool {
        self.0.borrow().desktop_connected
    }
}

#[derive(Clone)]
struct ServerState {
    pool: SqlitePool,
    token: String,
    app: AppHandle,
    cart: CartFeed,
    mobile_page: Arc<str>,
}

#[derive(Clone, Serialize, sqlx::FromRow)]
pub struct ScannedProduct {
    id: i64,
    barcode: Option<String>,
    name: String,
    selling_price: i64,
    stock: i64,
}

/// Start the server. Never fails the app: any error (cert generation,
/// binding a port) is logged and simply leaves `ScanSession.url` as `None`,
/// so the rest of the POS works normally without the phone-scan feature.
pub async fn start(
    app: AppHandle,
    pool: SqlitePool,
    cert_dir: &Path,
    mobile_page: Option<String>,
) -> (ScanSession, CartFeed) {
    let token = Uuid::new_v4().simple().to_string();
    let mobile_page: Arc<str> = mobile_page.unwrap_or_else(|| FALLBACK_PAGE.to_string()).into();
    let cart = CartFeed::new();

    let session = match try_start(app, pool, token.clone(), cert_dir, mobile_page, cart.clone()).await
    {
        Ok(port) => {
            let url = local_ip().map(|ip| format!("https://{ip}:{port}/?t={token}"));
            match &url {
                Some(u) => eprintln!("[scan server] listening, phone URL: {u}"),
                None => eprintln!("[scan server] listening on port {port} but no LAN address found"),
            }
            ScanSession { url }
        }
        Err(e) => {
            eprintln!("[scan server] disabled: {e}");
            ScanSession { url: None }
        }
    };

    (session, cart)
}

async fn try_start(
    app: AppHandle,
    pool: SqlitePool,
    token: String,
    cert_dir: &Path,
    mobile_page: Arc<str>,
    cart: CartFeed,
) -> Result<u16, Box<dyn std::error::Error>> {
    let (cert_pem, key_pem) = load_or_create_cert(cert_dir)?;
    trust_certificate(cert_dir);
    let tls_config = axum_server::tls_rustls::RustlsConfig::from_pem(cert_pem, key_pem).await?;

    let state = ServerState { pool, token, app, cart, mobile_page };

    let app_router = Router::new()
        .route("/", get(serve_page))
        .route("/api/scan", post(handle_scan))
        .route("/api/cart", get(handle_cart_poll))
        .route("/api/cart/line", post(handle_cart_line))
        .with_state(state);

    let listener = std::net::TcpListener::bind("0.0.0.0:0")?;
    let port = listener.local_addr()?.port();

    tauri::async_runtime::spawn(async move {
        if let Err(e) = axum_server::from_tcp_rustls(listener, tls_config)
            .serve(app_router.into_make_service())
            .await
        {
            eprintln!("[scan server] stopped: {e}");
        }
    });

    Ok(port)
}

async fn serve_page(State(state): State<ServerState>) -> Html<String> {
    Html(state.mobile_page.as_ref().to_owned())
}

#[derive(Deserialize)]
struct ScanRequest {
    token: String,
    barcode: String,
}

#[derive(Serialize)]
struct NotFoundPayload<'a> {
    barcode: &'a str,
}

#[derive(Serialize)]
struct ScanResponse {
    ok: bool,
    message: String,
    product: Option<ScannedProduct>,
    desktop_connected: bool,
}

async fn handle_scan(
    State(state): State<ServerState>,
    Json(req): Json<ScanRequest>,
) -> Json<ScanResponse> {
    let desktop_connected = state.cart.desktop_connected();

    if req.token != state.token {
        return Json(ScanResponse {
            ok: false,
            message: "Cette session a expiré. Rescannez le code QR sur l'ordinateur.".into(),
            product: None,
            desktop_connected,
        });
    }

    let barcode = req.barcode.trim();
    if barcode.is_empty() {
        return Json(ScanResponse {
            ok: false,
            message: "Aucun code-barres détecté.".into(),
            product: None,
            desktop_connected,
        });
    }

    let product = sqlx::query_as::<_, ScannedProduct>(
        "SELECT id, barcode, name, selling_price, stock
         FROM products WHERE barcode = ?1 AND active = 1",
    )
    .bind(barcode)
    .fetch_optional(&state.pool)
    .await;

    match product {
        Ok(Some(p)) => {
            if let Err(e) = state.app.emit(SCAN_EVENT, &p) {
                eprintln!("[scan server] could not notify desktop: {e}");
            }
            Json(ScanResponse {
                ok: true,
                message: format!("Ajouté : {}", p.name),
                product: Some(p),
                desktop_connected,
            })
        }
        Ok(None) => {
            if let Err(e) = state.app.emit(SCAN_NOT_FOUND_EVENT, &NotFoundPayload { barcode }) {
                eprintln!("[scan server] could not notify desktop: {e}");
            }
            Json(ScanResponse {
                ok: false,
                message: format!(
                    "Aucun produit trouvé pour le code-barres {barcode}. Demandez au caissier de l'ajouter sur l'ordinateur."
                ),
                product: None,
                desktop_connected,
            })
        }
        Err(e) => {
            eprintln!("[scan server] lookup failed: {e}");
            Json(ScanResponse {
                ok: false,
                message: "Erreur du serveur lors de la recherche de ce produit.".into(),
                product: None,
                desktop_connected,
            })
        }
    }
}

#[derive(Deserialize)]
struct CartQuery {
    t: String,
    /// The version the phone already has. `0` (or missing) answers at once.
    #[serde(default)]
    since: u64,
}

#[derive(Serialize)]
struct CartResponse {
    ok: bool,
    message: Option<String>,
    version: u64,
    desktop_connected: bool,
    label: String,
    lines: Vec<CartLine>,
    total: i64,
    item_count: i64,
}

impl CartResponse {
    fn from_state(s: &CartState) -> Self {
        let total = s.cart.lines.iter().map(|l| l.quantity * l.unit_price).sum();
        let item_count = s.cart.lines.iter().map(|l| l.quantity).sum();
        CartResponse {
            ok: true,
            message: None,
            version: s.version,
            desktop_connected: s.desktop_connected,
            label: s.cart.label.clone(),
            lines: s.cart.lines.clone(),
            total,
            item_count,
        }
    }

    fn rejected(message: &str) -> Self {
        CartResponse {
            ok: false,
            message: Some(message.into()),
            version: 0,
            desktop_connected: false,
            label: String::new(),
            lines: Vec::new(),
            total: 0,
            item_count: 0,
        }
    }
}

/// Long-poll: answer immediately if the cart is newer than `since`,
/// otherwise hold the request until it becomes newer or the timeout passes
/// (then answer with the unchanged cart so the phone simply asks again).
async fn handle_cart_poll(
    State(state): State<ServerState>,
    Query(q): Query<CartQuery>,
) -> Json<CartResponse> {
    if q.t != state.token {
        return Json(CartResponse::rejected(
            "Cette session a expiré. Rescannez le code QR sur l'ordinateur.",
        ));
    }

    let mut rx = state.cart.subscribe();
    if rx.borrow().version <= q.since {
        // Result is irrelevant: either a newer version arrived or we timed
        // out, and in both cases the current value is what we return.
        let _ = tokio::time::timeout(CART_POLL_TIMEOUT, rx.wait_for(|s| s.version > q.since)).await;
    }
    let snapshot = rx.borrow().clone();
    Json(CartResponse::from_state(&snapshot))
}

#[derive(Deserialize)]
struct CartLineRequest {
    token: String,
    product_id: i64,
    quantity: i64,
}

#[derive(Serialize)]
struct CartLineChange {
    product_id: i64,
    quantity: i64,
}

#[derive(Serialize)]
struct CartLineResponse {
    ok: bool,
    message: String,
    desktop_connected: bool,
}

/// A quantity edit from the phone. We don't touch any state here - the
/// desktop owns the cart, so we just forward the request as an event and
/// the desktop's next published snapshot is the confirmation.
async fn handle_cart_line(
    State(state): State<ServerState>,
    Json(req): Json<CartLineRequest>,
) -> Json<CartLineResponse> {
    let desktop_connected = state.cart.desktop_connected();

    if req.token != state.token {
        return Json(CartLineResponse {
            ok: false,
            message: "Cette session a expiré. Rescannez le code QR sur l'ordinateur.".into(),
            desktop_connected,
        });
    }
    if !desktop_connected {
        return Json(CartLineResponse {
            ok: false,
            message: "L'ordinateur n'est pas sur la page Caisse actuellement.".into(),
            desktop_connected,
        });
    }

    let change = CartLineChange { product_id: req.product_id, quantity: req.quantity.max(0) };
    match state.app.emit(CART_LINE_EVENT, &change) {
        Ok(()) => Json(CartLineResponse { ok: true, message: "Mis à jour".into(), desktop_connected }),
        Err(e) => {
            eprintln!("[scan server] could not notify desktop of cart change: {e}");
            Json(CartLineResponse {
                ok: false,
                message: "Impossible de joindre la fenêtre de l'ordinateur.".into(),
                desktop_connected,
            })
        }
    }
}

/// The LAN-facing IP address the OS would use to reach the outside world.
/// Connecting a UDP socket does not actually send any packet - it only asks
/// the OS to pick a route - so this works even fully offline as long as a
/// network interface with a gateway is configured (normal LAN/Wi-Fi setup).
fn local_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    socket.local_addr().ok().map(|a| a.ip().to_string())
}

/// A self-signed certificate is generated once and cached on disk so
/// returning phones don't see a new "unsafe site" warning every launch.
fn load_or_create_cert(dir: &Path) -> Result<(Vec<u8>, Vec<u8>), Box<dyn std::error::Error>> {
    std::fs::create_dir_all(dir)?;
    let cert_path = dir.join("scan-cert.pem");
    let key_path = dir.join("scan-key.pem");

    if cert_path.exists() && key_path.exists() {
        return Ok((std::fs::read(&cert_path)?, std::fs::read(&key_path)?));
    }

    let cert = rcgen::generate_simple_self_signed(vec!["medlib-m3.local".to_string()])?;
    let cert_pem = cert.cert.pem();
    let key_pem = cert.key_pair.serialize_pem();

    std::fs::write(&cert_path, &cert_pem)?;
    std::fs::write(&key_path, &key_pem)?;

    Ok((cert_pem.into_bytes(), key_pem.into_bytes()))
}

/// Best-effort: trust our own certificate in the current Windows user's
/// certificate store. This is only ever needed if something on this same PC
/// ever talks to the server over HTTPS directly (it currently doesn't - the
/// desktop UI gets scans via Tauri's own event bridge, not this server) but
/// costs nothing to keep, e.g. for opening the phone URL locally to test it.
/// Never fatal: the phone-scan feature works regardless of this succeeding.
#[cfg(target_os = "windows")]
fn trust_certificate(cert_dir: &Path) {
    let cert_path = cert_dir.join("scan-cert.pem");
    let result = std::process::Command::new("certutil")
        .args(["-user", "-addstore", "Root"])
        .arg(&cert_path)
        .output();
    if let Ok(out) = result {
        if !out.status.success() {
            eprintln!(
                "[scan server] could not trust certificate (non-fatal): {}",
                String::from_utf8_lossy(&out.stderr)
            );
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn trust_certificate(_cert_dir: &Path) {}
