# Architecture

## 1. General architecture

Use a small desktop monolith:

``` text
Windows
  |
  +-- Tauri 2
       |
       +-- React + TypeScript UI
       |
       +-- Rust commands
              |
              +-- SQLx
                    |
                    +-- SQLite
```

There is no remote backend in V1.

## 2. Why local-first

The first version is intended for one shop and potentially one main
computer.

Advantages:

-   Works without Internet
-   Very low RAM usage
-   No server to maintain
-   No Docker
-   No PostgreSQL service
-   Fast local barcode lookup
-   Simple installation
-   Simple backup

## 3. Frontend responsibilities

React handles:

-   pages
-   components
-   forms
-   tables
-   dialogs
-   POS cart
-   navigation
-   local UI state
-   loading and error states
-   user-friendly validation

Use TanStack Query only if it is useful for communicating with Tauri
commands. Do not introduce unnecessary state-management libraries.

## 4. Rust responsibilities

Rust/Tauri handles:

-   database connection
-   SQLite queries
-   transactions
-   business operations that must be atomic
-   filesystem paths
-   backup/restore
-   secure password operations if needed

Do not put UI logic in Rust.

## 5. Database access

Do not let React access SQLite directly.

Use Tauri commands:

``` text
React
  |
  | invoke()
  v
Tauri command
  |
  v
Rust
  |
  v
SQLx
  |
  v
SQLite
```

## 6. Important transactions

A sale must be one database transaction:

``` text
BEGIN

create sale
create sale items
decrease product stock
create stock movements

COMMIT
```

If anything fails:

``` text
ROLLBACK
```

The same principle applies to purchases.

## 7. Barcode

Most USB barcode scanners behave as keyboard input.

The POS should therefore have a focused barcode input.

``` text
Scanner
  |
  v
barcode input
  |
  v
product lookup
  |
  v
add product to cart
```

Do not add native barcode hardware integration unless a real requirement
appears.

## 7b. Phone as a barcode scanner

When the shop has no USB scanner, a phone's camera can be used instead. The
POS page shows a QR code, generated fresh every app launch, pointing at a
small embedded HTTPS server running inside this same process (`axum`, on
the tokio runtime already used by SQLx):

``` text
Phone camera
  |
  v
decode barcode (in the phone's browser, ZXing)
  |
  v
POST /api/scan {token, barcode}  -->  embedded Rust server
  |                                       |
  |                                       +-- look up product (active only)
  |                                       +-- emit a Tauri event to the
  |                                       |   desktop window (add to cart)
  v                                       |
JSON response (found / not found /  <-----+
expired session) shown on the phone
```

Key points:

-   The session **token** is regenerated every app launch, so an old QR
    code/photo stops working after a restart, as intended.
-   HTTPS is required, not optional - phone browsers block camera access on
    a plain `http://` page served from a LAN address. The server uses a
    self-signed certificate, generated once and reused across restarts
    (stored next to the database) so returning phones don't see a new
    "unsafe site" warning every day.
-   The desktop side never talks to this server directly - it receives
    scans via Tauri's own event bridge (`emit`/`listen`), not the network,
    so it never has to deal with the self-signed certificate at all.
-   Everything stays on the local network. No internet connection or cloud
    service is involved.
-   If no network interface is available, the QR panel just says so; the
    rest of the POS (USB scanner, manual search) is unaffected.

The phone page itself (`mobile-scanner/`) is a separate, minimal
TypeScript project built as one self-contained HTML file (see
`vite.mobile.config.ts`) and shipped as a Tauri resource - it has no
build-time dependency on the main React app, and the main app has no
build-time dependency on it either (a missing build falls back to a small
built-in "not installed yet" page instead of failing to compile).

## 7c. Automatic updates

The app is distributed as a Windows installer and updates itself from
GitHub Releases through Tauri's updater plugin:

``` text
npm run release (dev PC)
  |
  v
GitHub Actions: build NSIS installer, sign it, publish Release + latest.json
  |
  v
App startup (shop PC): GET latest.json -> newer? -> dialog -> download
  -> verify signature -> run installer (per-user, passive) -> relaunch
```

Design points:

-   The updater is the *only* reason the app ever touches the Internet, and
    a failed check is silent - the POS works exactly as before without a
    connection.
-   Every update is signed; the public key is compiled into the app, so a
    tampered or unsigned installer is rejected before it runs.
-   Releases are triggered by a version bump on `main`, never by an
    ordinary push. Same commit, same version = no release.
-   No server of ours is involved. GitHub hosts the files; the workflow
    builds on GitHub's machines.

See RELEASING.md for the operator's view.

## 8. Future multi-PC evolution

Do not implement this in V1.

If the shop later needs several cashier computers sharing the same
stock, the architecture can evolve to:

``` text
Tauri clients
      |
      v
Local LAN API
      |
      v
PostgreSQL
```

The React UI should be written cleanly enough that this migration does
not require rewriting the whole application.

## 9. Things explicitly avoided

Do not use:

-   microservices
-   Kubernetes
-   Kafka
-   RabbitMQ
-   Redis without a real need
-   GraphQL
-   CQRS
-   event sourcing
-   complex DDD
-   unnecessary repository/service abstractions
-   cloud dependency for core functionality
-   Electron
-   FastAPI in V1
-   Docker in V1
