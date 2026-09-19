import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";

import { CartTabs } from "@/components/pos/CartTabs";
import { CustomLineDialog, type CustomLineInput } from "@/components/pos/CustomLineDialog";
import { PhoneScanPanel } from "@/components/pos/PhoneScanPanel";
import { QuantityCell } from "@/components/pos/QuantityCell";
import { SaleReceiptDialog } from "@/components/pos/SaleReceiptDialog";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { ProductPicker, type ProductPickerHandle } from "@/components/products/ProductPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createSale,
  listCategories,
  publishCartState,
  type CartLineChange,
  type Category,
  type PaymentMethod,
  type SaleDetail,
} from "@/lib/api";
import { formatDA } from "@/lib/utils";

/** A scanned barcode looks like a run of digits. */
const looksLikeBarcode = (value: string) => /^\d{4,}$/.test(value);

type CartLine = {
  /**
   * Real product id, or a negative local id for an ad-hoc line (see
   * `addCustomLine`). Negative ids never reach the database.
   */
  product_id: number;
  name: string;
  barcode: string | null;
  unit_price: number;
  quantity: number;
  stock: number;
};

type CartSession = {
  id: string;
  label: string;
  lines: CartLine[];
  paymentMethod: PaymentMethod;
};

/** Minimal shape shared by both the local ProductPicker and phone-scanned products. */
type Scannable = {
  id: number;
  name: string;
  barcode: string | null;
  selling_price: number;
  stock: number;
};

let cartCounter = 0;
/** Ad-hoc lines share the `product_id` key space with products, so keep them negative. */
let customLineCounter = 0;
const isCustomLine = (line: CartLine) => line.product_id < 0;

function makeCart(): CartSession {
  cartCounter += 1;
  return {
    id: crypto.randomUUID(),
    label: `Panier ${cartCounter}`,
    lines: [],
    paymentMethod: "CASH",
  };
}

export function Pos() {
  const [{ carts, activeCartId }, setState] = useState(() => {
    const first = makeCart();
    return { carts: [first], activeCartId: first.id };
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<SaleDetail | null>(null);
  const pickerRef = useRef<ProductPickerHandle>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  const [quickAdd, setQuickAdd] = useState<{ barcode?: string; name?: string } | null>(null);
  const [customLineOpen, setCustomLineOpen] = useState(false);

  const activeCart = carts.find((c) => c.id === activeCartId) ?? carts[0];

  useEffect(() => {
    listCategories(false).then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  // Mirror the active cart to the phone scanner. `activeCart` is a new
  // object only when that cart (or which cart is active) changes, so this
  // fires exactly once per meaningful update.
  useEffect(() => {
    publishCartState({ label: activeCart.label, lines: activeCart.lines }).catch(() => {});
  }, [activeCart]);

  // A scan/search that matched nothing (from the barcode box or a phone
  // scan) - ask before creating anything, rather than assuming.
  function handleNotFound(value: string) {
    if (quickAdd) return; // already mid-way adding one
    setError(null);
    setPendingBarcode(value);
  }

  function confirmQuickAdd() {
    if (!pendingBarcode) return;
    setQuickAdd(
      looksLikeBarcode(pendingBarcode) ? { barcode: pendingBarcode } : { name: pendingBarcode },
    );
    setPendingBarcode(null);
  }

  function handleQuickAddSaved(product: {
    id: number;
    name: string;
    barcode: string | null;
    selling_price: number;
    stock: number;
  }) {
    addProduct(product);
    setNotice(`Nouveau produit ajouté : ${product.name}`);
    pickerRef.current?.focus();
  }

  /**
   * Always targets whichever cart is active *now*, not the one captured
   * when the caller was created - phone events arrive through listeners
   * registered once, long after the active cart may have changed.
   */
  function updateActiveCart(updater: (cart: CartSession) => CartSession) {
    setState((s) => ({
      ...s,
      carts: s.carts.map((c) => (c.id === s.activeCartId ? updater(c) : c)),
    }));
  }

  function newCart() {
    setState((s) => {
      const current = s.carts.find((c) => c.id === s.activeCartId);
      if (current && current.lines.length === 0) return s; // already on a blank cart
      const created = makeCart();
      return { carts: [...s.carts, created], activeCartId: created.id };
    });
    setError(null);
  }

  function switchCart(id: string) {
    setState((s) => ({ ...s, activeCartId: id }));
    setError(null);
  }

  function nextCart() {
    setState((s) => {
      if (s.carts.length < 2) return s;
      const idx = s.carts.findIndex((c) => c.id === s.activeCartId);
      const next = s.carts[(idx + 1) % s.carts.length];
      return { ...s, activeCartId: next.id };
    });
    setError(null);
  }

  /** Removes a cart outright. Always keeps at least one cart around. */
  function removeCart(id: string) {
    setState((s) => {
      const remaining = s.carts.filter((c) => c.id !== id);
      if (remaining.length === 0) {
        const created = makeCart();
        return { carts: [created], activeCartId: created.id };
      }
      const activeCartId = s.activeCartId === id ? remaining[0].id : s.activeCartId;
      return { carts: remaining, activeCartId };
    });
  }

  function discardCart(id: string) {
    const cart = carts.find((c) => c.id === id);
    if (cart && cart.lines.length > 0) {
      const ok = window.confirm(
        `Abandonner « ${cart.label} » avec ${cart.lines.length} article(s) ? Cette action est irréversible.`,
      );
      if (!ok) return;
    }
    removeCart(id);
  }

  function addProduct(p: Scannable) {
    setError(null);
    updateActiveCart((cart) => {
      const existing = cart.lines.find((l) => l.product_id === p.id);
      const lines = existing
        ? cart.lines.map((l) =>
            l.product_id === p.id ? { ...l, quantity: l.quantity + 1 } : l,
          )
        : [
            ...cart.lines,
            {
              product_id: p.id,
              name: p.name,
              barcode: p.barcode,
              unit_price: p.selling_price,
              quantity: 1,
              stock: p.stock,
            },
          ];
      return { ...cart, lines };
    });
  }

  /** A fee/extra typed in by hand. Not a product: no stock, no barcode. */
  function addCustomLine({ name, unit_price, quantity }: CustomLineInput) {
    customLineCounter += 1;
    setError(null);
    updateActiveCart((cart) => ({
      ...cart,
      lines: [
        ...cart.lines,
        {
          product_id: -customLineCounter,
          name,
          barcode: null,
          unit_price,
          quantity,
          // Nothing to run out of - keeps the "seulement N en stock" warning quiet.
          stock: Number.MAX_SAFE_INTEGER,
        },
      ],
    }));
    setNotice(`Frais ajouté : ${name}`);
    pickerRef.current?.focus();
  }

  function addFromPhone(p: Scannable) {
    addProduct(p);
    setNotice(`Ajouté depuis le téléphone : ${p.name}`);
  }

  function setQuantity(productId: number, quantity: number) {
    updateActiveCart((cart) => ({
      ...cart,
      lines: cart.lines.map((l) =>
        l.product_id === productId ? { ...l, quantity: Math.max(1, quantity) } : l,
      ),
    }));
    pickerRef.current?.focus();
  }

  function removeLine(productId: number) {
    updateActiveCart((cart) => ({
      ...cart,
      lines: cart.lines.filter((l) => l.product_id !== productId),
    }));
  }

  /** A +/-/remove made in the phone's cart view. Applied exactly like a local edit. */
  function handlePhoneLineChange({ product_id, quantity }: CartLineChange) {
    if (quantity <= 0) {
      removeLine(product_id);
      setNotice("Retiré depuis le téléphone");
    } else {
      setQuantity(product_id, quantity);
      setNotice(`Quantité réglée à ${quantity} depuis le téléphone`);
    }
  }

  function clearActiveCart() {
    if (activeCart.lines.length === 0) return;
    updateActiveCart((cart) => ({ ...cart, lines: [] }));
    setError(null);
  }

  function setPaymentMethod(method: PaymentMethod) {
    updateActiveCart((cart) => ({ ...cart, paymentMethod: method }));
  }

  const total = activeCart.lines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0);
  const itemCount = activeCart.lines.reduce((sum, l) => sum + l.quantity, 0);

  async function completeSale() {
    if (activeCart.lines.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      const detail = await createSale({
        payment_method: activeCart.paymentMethod,
        customer_id: null,
        items: activeCart.lines.map((l) =>
          isCustomLine(l)
            ? { product_id: null, label: l.name, quantity: l.quantity, unit_price: l.unit_price }
            : { product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price },
        ),
      });
      setReceipt(detail);
      removeCart(activeCart.id);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  // Keyboard shortcuts. F-keys never insert characters, so it's safe to let
  // them act even while the barcode input or a quantity field has focus.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "F2") {
        e.preventDefault();
        void completeSale();
      } else if (e.key === "F3") {
        e.preventDefault();
        newCart();
      } else if (e.key === "F4") {
        e.preventDefault();
        clearActiveCart();
      } else if (e.key === "F6") {
        e.preventDefault();
        nextCart();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCart, carts, saving]);

  return (
    <div className="flex gap-4">
      <div className="flex flex-1 flex-col gap-3">
        <ProductPicker
          ref={pickerRef}
          onSelect={addProduct}
          onNotFound={handleNotFound}
          placeholder="Scannez un code-barres ou recherchez par nom…"
          autoFocus
        />

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
            <CardTitle className="text-base">Articles</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCustomLineOpen(true)}
              title="Ajouter un frais (livraison, emballage…)"
            >
              <Plus className="mr-1 h-4 w-4" />
              Frais
            </Button>
          </CardHeader>
          <CardContent className="max-h-[65vh] overflow-y-auto p-0">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Produit</th>
                  <th className="px-4 py-2 font-medium">Prix unitaire</th>
                  <th className="px-4 py-2 font-medium">Qté</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {activeCart.lines.map((l) => (
                  <tr key={l.product_id} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">
                      {l.name}
                      {isCustomLine(l) && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">frais</span>
                      )}
                    </td>
                    <td className="px-4 py-2">{formatDA(l.unit_price)}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setQuantity(l.product_id, l.quantity - 1)}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <QuantityCell
                          quantity={l.quantity}
                          onChange={(qty) => setQuantity(l.product_id, qty)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setQuantity(l.product_id, l.quantity + 1)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {l.quantity > l.stock && (
                        <p className="mt-1 text-xs text-destructive">
                          Seulement {l.stock} en stock
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      {formatDA(l.quantity * l.unit_price)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removeLine(l.product_id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}

                {activeCart.lines.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-16 text-center text-muted-foreground">
                      Le panier est vide. Scannez ou recherchez pour ajouter des produits.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <div className="w-72 shrink-0 space-y-4">
        {carts.length > 1 && (
          <CartTabs
            carts={carts.map((c) => ({ id: c.id, label: c.label, itemCount: c.lines.length }))}
            activeId={activeCartId}
            onSwitch={switchCart}
            onDiscard={discardCart}
          />
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{activeCart.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm text-muted-foreground">Mode de paiement</label>
              <Select
                value={activeCart.paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Espèces</SelectItem>
                  <SelectItem value="CARD">Carte</SelectItem>
                  <SelectItem value="OTHER">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 border-t pt-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Articles</span>
                <span>{itemCount}</span>
              </div>
              <div className="flex justify-between text-xl font-semibold">
                <span>Total</span>
                <span>{formatDA(total)}</span>
              </div>
            </div>

            {notice && <p className="text-sm text-emerald-600">{notice}</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="space-y-2">
              <Button
                className="w-full justify-between"
                size="lg"
                disabled={activeCart.lines.length === 0 || saving}
                onClick={() => void completeSale()}
              >
                <span>{saving ? "Validation…" : "Valider la vente"}</span>
                <kbd className="text-xs font-normal opacity-70">F2</kbd>
              </Button>
              <Button
                variant="outline"
                className="w-full justify-between"
                disabled={activeCart.lines.length === 0}
                onClick={clearActiveCart}
              >
                <span>Vider le panier</span>
                <kbd className="text-xs font-normal opacity-60">F4</kbd>
              </Button>
              <Button variant="outline" className="w-full justify-between" onClick={newCart}>
                <span>Nouveau panier</span>
                <kbd className="text-xs font-normal opacity-60">F3</kbd>
              </Button>
              {carts.length > 1 && (
                <p className="pt-1 text-center text-xs text-muted-foreground">
                  <kbd className="opacity-70">F6</kbd> passe au panier suivant
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <PhoneScanPanel
          onScan={addFromPhone}
          onNotFound={handleNotFound}
          onLineChange={handlePhoneLineChange}
        />
      </div>

      <SaleReceiptDialog sale={receipt} onClose={() => setReceipt(null)} />

      <CustomLineDialog
        open={customLineOpen}
        onOpenChange={setCustomLineOpen}
        onConfirm={addCustomLine}
      />

      <Dialog open={pendingBarcode !== null} onOpenChange={(o) => !o && setPendingBarcode(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Produit introuvable</DialogTitle>
            <DialogDescription>
              Aucun produit ne correspond à « {pendingBarcode} ». L'ajouter comme nouveau produit ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingBarcode(null)}>
              Annuler
            </Button>
            <Button onClick={confirmQuickAdd} autoFocus>
              Ajouter le produit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductFormDialog
        open={quickAdd !== null}
        onOpenChange={(o) => !o && setQuickAdd(null)}
        product={null}
        categories={categories}
        onSaved={handleQuickAddSaved}
        initialBarcode={quickAdd?.barcode}
        initialName={quickAdd?.name}
      />
    </div>
  );
}
