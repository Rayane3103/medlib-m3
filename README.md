# MedLib M3

Lightweight Windows desktop software for managing a small Algerian
retail store selling school supplies, stationery, and cosmetics.

## Main goals

-   Fast point of sale (POS)
-   Barcode scanner support
-   Product and stock management
-   Purchases
-   Sales and customers
-   Stock movement history
-   Basic profit and sales reports
-   Simple user accounts
-   Local-first operation
-   Very low resource usage
-   Easy backup and restore
-   Automatic updates from GitHub Releases
-   Professional but simple UI

## V1 technology

-   Tauri 2
-   React
-   TypeScript
-   Vite
-   Tailwind CSS
-   shadcn/ui
-   SQLite
-   Rust + SQLx for local database access

## Important principle

This is not a generic ERP.

Build only what the store actually needs. Prefer simple, readable code
over abstractions and frameworks that do not provide real value.

## V1 navigation

POS is the home screen - it's what the app opens to, ready to scan for a
new sale.

1.  POS (home)
2.  Dashboard
3.  Products
4.  Stock
5.  Purchases
6.  Customers
7.  Reports
8.  Expenses
9.  Settings

## Running the project

### Prerequisites (one time)

- **Node.js** 18+ (used: 22)
- **Rust** stable toolchain — install from https://rustup.rs
- **Microsoft C++ Build Tools** + the **WebView2 runtime** (WebView2 ships
  with Windows 10/11 by default). See https://tauri.app/start/prerequisites/

### Install

```
npm install
```

Rust crates are fetched automatically on the first `tauri` command.

### Develop

```
npm run tauri dev
```

Starts Vite on port 1420 and launches the desktop window with hot reload.
On first run the SQLite database is created and migrated automatically.
This also builds the phone-scanner page (see below) before starting, so the
first run is a few seconds slower than later ones.

### Frontend only (no desktop shell)

```
npm run dev
```

Backend commands (`invoke`) are unavailable in this mode; use it only for
pure UI work.

### Phone barcode scanner

The POS page shows a QR code that turns a phone into a barcode scanner over
the local network (no internet needed) - see ARCHITECTURE.md for how it
works. Its web page lives in `mobile-scanner/` and is built separately from
the main app:

```
npm run build:mobile
```

`npm run tauri dev` and `npm run tauri build` already run this
automatically (`dev:tauri` / `build:tauri` in package.json). You only need
the command above if you're iterating on `mobile-scanner/` itself and want
to rebuild it without restarting the whole app - reload the desktop app
afterward to pick it up.

**Phone stuck "loading" and never shows the page?** Windows Firewall blocks
inbound connections by default on networks it classifies as "Public" - only
"Private" is allowed automatically. Check with:

```
netsh advfirewall firewall show rule name="MedLib M3" verbose
Get-NetConnectionProfile
```

(the second one, in PowerShell, shows each network adapter's category). Fix
by setting the Wi-Fi network to Private (Settings → Network & Internet →
Wi-Fi → your network → Network profile type), or run this in an **elevated**
PowerShell to allow the existing rule on Public too:
`Set-NetFirewallRule -DisplayName "MedLib M3" -Profile Any`. This is a
one-time, per-PC fix - not something the app can do for itself without
admin rights.

### Build a Windows installer

```
npm run tauri build
```

Produces an NSIS installer under
`src-tauri/target/release/bundle/nsis/`. The build also emits a signature
for the auto-updater, so it needs the signing key in the environment - see
[RELEASING.md](RELEASING.md) for the two variables to set.

### Shipping an update to the shop

You normally don't build locally at all. Commit, then:

```
npm run release
```

GitHub Actions builds and publishes the installer; the installed app picks
the new version up on its next launch. Full details in
[RELEASING.md](RELEASING.md).

### Database location

The database lives in the OS application-data directory, not next to the
executable:

```
%APPDATA%\com.medlib.m3\medlib.db
```

The exact path is shown on the **Settings** page. A backup is just a copy
of that file (and its `-wal` / `-shm` companions) while the app is closed.

## Production

The application must be installable on Windows as a normal desktop
application. It should not require the user to install Node, Python,
PostgreSQL, Docker, or any other development dependency.

The database must live in the proper application-data directory, not
beside the executable.
