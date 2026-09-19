import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

/**
 * Phone-side barcode scanner + live mirror of the desktop's active cart.
 * Served by the desktop app's embedded HTTPS server (see
 * src-tauri/src/scan_server.rs) - this file has no build-time dependency
 * on that server, it just talks to it over relative /api paths.
 *
 * Sync model: the desktop owns the cart. We long-poll GET /api/cart and
 * repaint whenever a newer version arrives (scans, +/- on either side, cart
 * switches). Our own edits are POSTed and shown optimistically, then
 * confirmed by the next snapshot the desktop publishes.
 */

const params = new URLSearchParams(window.location.search);
const token = params.get("t") ?? "";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const videoEl = $<HTMLVideoElement>("video");
const statusEl = $("status");
const statusLabel = statusEl.querySelector(".label") as HTMLElement;
const reticleEl = $("reticle");
const toastEl = $("toast");
const toastIcon = toastEl.querySelector(".icon") as HTMLElement;
const toastName = toastEl.querySelector(".name") as HTMLElement;
const toastDetail = toastEl.querySelector(".detail") as HTMLElement;
const toastQty = toastEl.querySelector(".qty-badge") as HTMLElement;
const permissionEl = $("permission");
const permissionErrorEl = $("permission-error");
const grantBtn = $<HTMLButtonElement>("grant");

const barLabel = $("bar-label");
const barCount = $("bar-count");
const barTotal = $("bar-total");
const barBadge = $("bar-badge");
const openCartBtn = $<HTMLButtonElement>("open-cart");
const closeSheetBtn = $<HTMLButtonElement>("close-sheet");
const backdropEl = $("backdrop");
const sheetTitle = $("sheet-title");
const sheetSub = $("sheet-sub");
const sheetNotice = $("sheet-notice");
const sheetNoticeText = $("sheet-notice-text");
const linesEl = $("lines");
const emptyEl = $("empty");
const footCount = $("foot-count");
const footTotal = $("foot-total");
const syncHint = $("sync-hint");
const fatalEl = $("fatal");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ICON_CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const ICON_X =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const ICON_MINUS =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg>';
const ICON_PLUS =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const ICON_TRASH =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';

/** Same formatting as the desktop's formatDA - whole dinars, fr-DZ grouping. */
const daFormat = new Intl.NumberFormat("fr-DZ", { style: "decimal", maximumFractionDigits: 0 });
const formatDA = (n: number) => `${daFormat.format(n)} DA`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}

function bump(node: HTMLElement) {
  node.classList.remove("bump");
  // force reflow so the animation restarts even on rapid updates
  void node.offsetWidth;
  node.classList.add("bump");
}

// ---------------------------------------------------------------------------
// Connection status pill
// ---------------------------------------------------------------------------

type Conn = "connecting" | "connected" | "disconnected" | "offline";

function setStatus(state: Conn) {
  statusEl.className = state === "connecting" ? "" : state;
  statusLabel.textContent = {
    connecting: "Connexion…",
    connected: "En direct avec l'ordinateur",
    disconnected: "Ordinateur hors caisse",
    offline: "Ordinateur injoignable",
  }[state];
}

// ---------------------------------------------------------------------------
// Scan result toast
// ---------------------------------------------------------------------------

let toastTimer: number | undefined;

function showToast(ok: boolean, title: string, detail: string, qty?: number) {
  toastEl.className = `show pop ${ok ? "ok" : "error"}`;
  toastIcon.innerHTML = ok ? ICON_CHECK : ICON_X;
  toastName.textContent = title;
  toastDetail.textContent = detail;
  if (qty !== undefined && qty > 1) {
    toastQty.hidden = false;
    toastQty.textContent = `×${qty}`;
  } else {
    toastQty.hidden = true;
  }

  reticleEl.classList.remove("flash", "flash-bad");
  void reticleEl.offsetWidth;
  reticleEl.classList.add(ok ? "flash" : "flash-bad");

  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.classList.remove("show");
    reticleEl.classList.remove("flash", "flash-bad");
  }, 4000);
}

// ---------------------------------------------------------------------------
// Cart state (mirrors the desktop's active cart)
// ---------------------------------------------------------------------------

type CartLine = {
  product_id: number;
  name: string;
  barcode: string | null;
  unit_price: number;
  quantity: number;
  stock: number;
};

type CartResponse = {
  ok: boolean;
  message: string | null;
  version: number;
  desktop_connected: boolean;
  label: string;
  lines: CartLine[];
  total: number;
  item_count: number;
};

let cartVersion = 0;
let cartLabel = "Panier";
let cartLines: CartLine[] = [];
let desktopConnected = false;
let networkOk = true;
let lastTotal = 0;
let lastItemCount = 0;

/**
 * Quantities we've sent to the desktop but haven't seen echoed back yet.
 * A snapshot that still shows the old quantity for one of these is stale
 * (it was already in flight when we tapped), so we keep our value until
 * the desktop agrees or the override times out.
 */
const pending = new Map<number, { quantity: number; until: number }>();
const PENDING_TTL = 2500;

/** The line currently being edited by typing, if any - don't repaint it mid-edit. */
let editingProductId: number | null = null;

function computeTotals() {
  let total = 0;
  let count = 0;
  for (const l of cartLines) {
    total += l.quantity * l.unit_price;
    count += l.quantity;
  }
  return { total, count };
}

function applySnapshot(snap: CartResponse) {
  if (snap.version < cartVersion) return; // out-of-order response
  cartVersion = snap.version;
  cartLabel = snap.label || "Panier";
  desktopConnected = snap.desktop_connected;

  const now = Date.now();
  const merged: CartLine[] = [];
  for (const line of snap.lines) {
    const p = pending.get(line.product_id);
    if (p) {
      if (p.quantity === line.quantity || p.until < now) {
        pending.delete(line.product_id);
      } else if (p.quantity === 0) {
        continue; // we removed it locally; desktop hasn't caught up yet
      } else {
        merged.push({ ...line, quantity: p.quantity });
        continue;
      }
    }
    merged.push(line);
  }
  // Drop pending entries for lines that no longer exist on the desktop.
  for (const id of [...pending.keys()]) {
    if (!snap.lines.some((l) => l.product_id === id)) pending.delete(id);
  }
  cartLines = merged;
  render();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function render() {
  const { total, count } = computeTotals();
  const itemsText = `${count} ${count === 1 ? "article" : "articles"}`;

  // pinned bar
  barLabel.textContent = cartLabel;
  barCount.textContent = itemsText;
  barTotal.innerHTML = `${daFormat.format(total)}<span class="unit">DA</span>`;
  barBadge.textContent = String(count);
  barBadge.classList.toggle("zero", count === 0);
  if (total !== lastTotal) bump(barTotal);
  if (count !== lastItemCount) bump(barBadge);
  lastTotal = total;
  lastItemCount = count;

  // sheet header / footer
  sheetTitle.textContent = cartLabel;
  sheetSub.textContent = `${itemsText} · ${cartLines.length} ${cartLines.length === 1 ? "produit" : "produits"}`;
  footCount.textContent = String(count);
  footTotal.textContent = formatDA(total);

  const live = desktopConnected && networkOk;
  syncHint.classList.toggle("off", !live);
  (syncHint.lastElementChild as HTMLElement).textContent = live
    ? "En direct · les modifications ici mettent à jour l'ordinateur instantanément"
    : "En pause · reconnectez-vous à l'ordinateur pour modifier";
  sheetNotice.hidden = live;
  sheetNoticeText.textContent = !networkOk
    ? "Impossible de joindre l'ordinateur. Vérifiez que les deux appareils sont sur le même Wi-Fi."
    : "L'ordinateur n'est pas sur la page Caisse. Ouvrez-la pour reprendre les modifications.";

  // lines
  emptyEl.hidden = cartLines.length > 0;
  renderLines(live);

  // status pill
  if (!networkOk) setStatus("offline");
  else setStatus(desktopConnected ? "connected" : "disconnected");
}

function renderLines(live: boolean) {
  // Keep existing rows keyed by product id so animations and an in-progress
  // quantity edit survive repaints; only create/remove what changed.
  const existing = new Map<number, HTMLElement>();
  for (const row of Array.from(linesEl.children) as HTMLElement[]) {
    existing.set(Number(row.dataset.id), row);
  }

  const seen = new Set<number>();
  let prev: HTMLElement | null = null;
  for (const line of cartLines) {
    seen.add(line.product_id);
    let row = existing.get(line.product_id);
    if (!row) {
      row = buildRow(line);
    } else if (editingProductId !== line.product_id) {
      updateRow(row, line);
    }
    row.classList.toggle("paused", !live);
    row.querySelectorAll("button").forEach((b) => (b.disabled = !live));

    // ensure order matches the desktop
    const expectedNext: Element | null = prev ? prev.nextElementSibling : linesEl.firstElementChild;
    if (expectedNext !== row) linesEl.insertBefore(row, expectedNext);
    prev = row;
  }

  for (const [id, row] of existing) {
    if (seen.has(id)) continue;
    row.classList.add("leaving");
    row.querySelectorAll("button").forEach((b) => (b.disabled = true));
    window.setTimeout(() => row.remove(), 200);
  }
}

function buildRow(line: CartLine): HTMLElement {
  const row = el("div", "line");
  row.dataset.id = String(line.product_id);

  const info = el("div", "info");
  info.append(el("div", "name"));
  const meta = el("div", "meta");

  const stepper = el("div", "stepper");
  const minus = el("button", "minus");
  minus.type = "button";
  const qty = el("button", "qty num");
  qty.type = "button";
  qty.title = "Appuyez pour saisir une quantité";
  const plus = el("button", "plus");
  plus.type = "button";
  plus.setAttribute("aria-label", "Increase quantity");
  plus.innerHTML = ICON_PLUS;
  stepper.append(minus, qty, plus);

  row.append(info, meta, stepper);

  minus.addEventListener("click", () => {
    const current = currentQty(line.product_id);
    if (current === null) return;
    changeQuantity(line.product_id, current - 1);
  });
  plus.addEventListener("click", () => {
    const current = currentQty(line.product_id);
    if (current === null) return;
    changeQuantity(line.product_id, current + 1);
  });
  qty.addEventListener("click", () => startInlineEdit(row, line.product_id));

  updateRow(row, line);
  return row;
}

function updateRow(row: HTMLElement, line: CartLine) {
  (row.querySelector(".name") as HTMLElement).textContent = line.name;

  const meta = row.querySelector(".meta") as HTMLElement;
  meta.replaceChildren();
  meta.append(el("span", "num", `${formatDA(line.unit_price)} × ${line.quantity}`));
  meta.append(el("span", "line-total num", formatDA(line.unit_price * line.quantity)));
  if (line.quantity > line.stock) {
    meta.append(el("span", "warn", `Seulement ${line.stock} en stock`));
  }

  const minus = row.querySelector(".minus") as HTMLButtonElement;
  const removing = line.quantity <= 1;
  minus.innerHTML = removing ? ICON_TRASH : ICON_MINUS;
  minus.classList.toggle("remove", removing);
  minus.setAttribute("aria-label", removing ? "Remove from cart" : "Decrease quantity");

  const qty = row.querySelector(".qty") as HTMLElement;
  if (qty) {
    qty.textContent = String(line.quantity);
    qty.classList.toggle("syncing", pending.has(line.product_id));
  }
}

function currentQty(productId: number): number | null {
  const line = cartLines.find((l) => l.product_id === productId);
  return line ? line.quantity : null;
}

/** Tap the number → type an exact quantity (numpad), Enter/blur to confirm. */
function startInlineEdit(row: HTMLElement, productId: number) {
  const qtyBtn = row.querySelector(".qty") as HTMLElement | null;
  if (!qtyBtn) return;
  const current = currentQty(productId);
  if (current === null) return;

  editingProductId = productId;
  const input = el("input");
  input.type = "number";
  input.inputMode = "numeric";
  input.min = "1";
  input.step = "1";
  input.value = String(current);
  qtyBtn.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const finish = (commit: boolean) => {
    if (done) return;
    done = true;
    editingProductId = null;
    const parsed = Math.floor(Number(input.value));
    const next = commit && Number.isFinite(parsed) && parsed > 0 ? parsed : current;
    input.replaceWith(qtyBtn);
    if (next !== current) changeQuantity(productId, next);
    else {
      const line = cartLines.find((l) => l.product_id === productId);
      if (line) updateRow(row, line);
    }
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    }
  });
  input.addEventListener("blur", () => finish(true));
}

// ---------------------------------------------------------------------------
// Edits → desktop
// ---------------------------------------------------------------------------

async function changeQuantity(productId: number, quantity: number) {
  if (!desktopConnected || !networkOk) return;
  const next = Math.max(0, Math.floor(quantity));

  // Optimistic: repaint now, reconcile when the desktop echoes it back.
  pending.set(productId, { quantity: next, until: Date.now() + PENDING_TTL });
  if (next === 0) {
    cartLines = cartLines.filter((l) => l.product_id !== productId);
  } else {
    cartLines = cartLines.map((l) => (l.product_id === productId ? { ...l, quantity: next } : l));
  }
  vibrate(next === 0 ? [30, 40, 30] : 15);
  render();

  try {
    const res = await fetch("/api/cart/line", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, product_id: productId, quantity: next }),
    });
    const data: { ok: boolean; message: string; desktop_connected: boolean } = await res.json();
    if (!data.ok) {
      pending.delete(productId);
      desktopConnected = data.desktop_connected;
      showToast(false, "Modification non appliquée", data.message);
      // Ask for a fresh snapshot to roll back the optimistic change.
      cartVersion = 0;
      wakePoll();
    }
  } catch {
    pending.delete(productId);
    networkOk = false;
    render();
    wakePoll();
  }
}

// ---------------------------------------------------------------------------
// Live feed ← desktop (long-poll)
// ---------------------------------------------------------------------------

let pollAbort: AbortController | null = null;
let pollRetryTimer: number | undefined;

/** Cancel the in-flight poll (if any) so the loop restarts immediately. */
function wakePoll() {
  window.clearTimeout(pollRetryTimer);
  pollAbort?.abort();
}

async function pollLoop() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    pollAbort = new AbortController();
    let retryDelay = 0;
    // While we think we're offline, ask for the current cart unconditionally
    // (since=0) - a blocking poll would only answer once something changed,
    // leaving the "can't reach desktop" warning up long after it reconnected.
    const since = networkOk ? cartVersion : 0;
    try {
      const res = await fetch(`/api/cart?t=${encodeURIComponent(token)}&since=${since}`, {
        signal: pollAbort.signal,
        cache: "no-store",
      });
      const data: CartResponse = await res.json();
      if (!data.ok) {
        showFatal("Session expirée", data.message ?? "Rescannez le code QR sur l'ordinateur.");
        return;
      }
      if (!networkOk) {
        networkOk = true;
        vibrate(20);
      }
      applySnapshot(data);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        continue; // woken up deliberately - go straight back around
      }
      if (networkOk) {
        networkOk = false;
        render();
      }
      retryDelay = 2000;
    }
    if (retryDelay) {
      await new Promise<void>((resolve) => {
        pollRetryTimer = window.setTimeout(resolve, retryDelay);
        // let wakePoll() cut the wait short too
        pollAbort = { abort: () => resolve() } as AbortController;
      });
    }
  }
}

// When the phone screen comes back on, the held request may have been
// killed by the OS - restart right away rather than waiting on a timeout.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") wakePoll();
});

// ---------------------------------------------------------------------------
// Cart sheet open/close
// ---------------------------------------------------------------------------

function openSheet() {
  document.body.classList.add("sheet-open");
}
function closeSheet() {
  document.body.classList.remove("sheet-open");
  (document.activeElement as HTMLElement | null)?.blur();
}
openCartBtn.addEventListener("click", () => {
  vibrate(10);
  openSheet();
});
closeSheetBtn.addEventListener("click", closeSheet);
backdropEl.addEventListener("click", closeSheet);

// swipe down on the sheet header to dismiss
{
  const sheet = $("sheet");
  let startY = 0;
  let tracking = false;
  sheet.addEventListener(
    "touchstart",
    (e) => {
      const t = e.target as HTMLElement;
      tracking = !!t.closest(".sheet-head, .sheet-handle");
      startY = e.touches[0].clientY;
    },
    { passive: true },
  );
  sheet.addEventListener(
    "touchmove",
    (e) => {
      if (!tracking) return;
      const dy = e.touches[0].clientY - startY;
      if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
    },
    { passive: true },
  );
  sheet.addEventListener("touchend", (e) => {
    if (!tracking) return;
    tracking = false;
    const dy = e.changedTouches[0].clientY - startY;
    sheet.style.transform = "";
    if (dy > 80) closeSheet();
  });
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

type ScanResponse = {
  ok: boolean;
  message: string;
  product: { id: number; name: string; selling_price: number; stock: number } | null;
  desktop_connected: boolean;
};

let lastBarcode = "";
let lastScanAt = 0;
let cameraControls: { stop: () => void } | null = null;

async function sendScan(barcode: string) {
  try {
    const res = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, barcode }),
    });
    const data: ScanResponse = await res.json();
    desktopConnected = data.desktop_connected;
    if (!networkOk) {
      networkOk = true;
      wakePoll();
    }

    if (data.ok && data.product) {
      // The desktop will publish the new quantity in a moment; show what it
      // will be so the toast feels instant.
      const existing = cartLines.find((l) => l.product_id === data.product!.id);
      const qty = (existing?.quantity ?? 0) + 1;
      vibrate(existing ? [25, 30, 25] : 40);
      showToast(
        true,
        data.product.name,
        `${formatDA(data.product.selling_price)} · ${desktopConnected ? "ajouté au panier" : "ordinateur non à l'écoute"}`,
        qty,
      );
    } else {
      vibrate([60, 40, 60]);
      showToast(false, "Non ajouté", data.message);
    }
    render();
  } catch {
    networkOk = false;
    render();
    vibrate([60, 40, 60]);
    showToast(false, "Ordinateur injoignable", "Vérifiez que le téléphone est sur le même Wi-Fi que l'ordinateur.");
    wakePoll();
  }
}

function handleDecoded(text: string) {
  const now = Date.now();
  // Ignore repeats of the same barcode seen again within 1.5s - the camera
  // keeps decoding the same code across many frames while it's in view.
  if (text === lastBarcode && now - lastScanAt < 1500) return;
  lastBarcode = text;
  lastScanAt = now;
  void sendScan(text);
}

// Retail barcodes are 1D and well-printed - restricting the formats ZXing
// tries per frame (instead of also checking QR/Data Matrix/PDF417/etc.)
// cuts real decode time noticeably. The default 500ms pause between decode
// attempts (and between a successful decode and the next one) is tuned for
// battery life, not responsiveness - shortening it is what actually makes
// scanning feel instant.
const hints = new Map();
hints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
]);

async function startScanning() {
  permissionEl.hidden = true;
  permissionErrorEl.hidden = true;

  const reader = new BrowserMultiFormatReader(hints, {
    delayBetweenScanAttempts: 50,
    delayBetweenScanSuccess: 250,
  });
  try {
    cameraControls = await reader.decodeFromConstraints(
      {
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          // Not all cameras/browsers support these - unsupported entries in
          // `advanced` are just ignored rather than causing an error.
          advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
        },
      },
      videoEl,
      (result) => {
        if (result) handleDecoded(result.getText());
      },
    );
  } catch (e) {
    permissionEl.hidden = false;
    permissionErrorEl.hidden = false;
    permissionErrorEl.textContent = cameraErrorMessage(e);
  }
}

/** The browser's camera errors come back in the browser's own language - map
 *  the common ones to a French message the cashier can act on. */
function cameraErrorMessage(e: unknown): string {
  const name = e instanceof Error ? e.name : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "Autorisation refusée. Autorisez l'accès à la caméra dans les réglages du navigateur, puis réessayez.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "Aucune caméra détectée sur cet appareil.";
    case "NotReadableError":
    case "TrackStartError":
      return "La caméra est déjà utilisée par une autre application.";
    default:
      return "Impossible d'accéder à la caméra.";
  }
}

grantBtn.addEventListener("click", () => void startScanning());

window.addEventListener("pagehide", () => cameraControls?.stop());

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function showFatal(title: string, text: string) {
  $("fatal-title").textContent = title;
  $("fatal-text").textContent = text;
  fatalEl.hidden = false;
  cameraControls?.stop();
}

if (!token) {
  showFatal("Session manquante", "Ouvrez cette page en scannant le code QR affiché dans l'application de bureau.");
} else {
  render();
  void pollLoop();
  if (!navigator.mediaDevices?.getUserMedia) {
    permissionEl.hidden = false;
    permissionErrorEl.hidden = false;
    permissionErrorEl.textContent = "Ce navigateur ne prend pas en charge l'accès à la caméra.";
  } else {
    void startScanning();
  }
}
