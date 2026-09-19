import { useEffect, useRef, useState } from "react";
import { Barcode as BarcodeIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createProduct,
  listProducts,
  updateProduct,
  type Category,
  type CreateProductInput,
  type Product,
  type ProductInput,
} from "@/lib/api";
import { cn, formatDA } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  categories: Category[];
  /** Called with the created/updated product once the save succeeds. */
  onSaved: (product: Product) => void;
  /** Pre-fill from the Products page's "scan to add" flow (create mode only). */
  initialBarcode?: string;
  initialName?: string;
};

const emptyForm: ProductInput = {
  barcode: "",
  name: "",
  category_id: null,
  brand: "",
  purchase_price: 0,
  selling_price: 0,
};

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  categories,
  onSaved,
  initialBarcode,
  initialName,
}: Props) {
  const [form, setForm] = useState<ProductInput>(emptyForm);
  const [stock, setStock] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState<Product | null>(null);

  const barcodeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const focusBarcodeOnOpen = !product && !initialBarcode;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDuplicate(null);
    setStock(0);
    setForm(
      product
        ? {
            barcode: product.barcode ?? "",
            name: product.name,
            category_id: product.category_id,
            brand: product.brand ?? "",
            purchase_price: product.purchase_price,
            selling_price: product.selling_price,
          }
        : {
            ...emptyForm,
            barcode: initialBarcode ?? "",
            name: initialName ?? "",
          },
    );
    // Focus whichever field the cashier should act on first: the barcode
    // field when starting from scratch (ready to scan immediately), or the
    // name field when a barcode/name was already supplied by the caller.
    const t = setTimeout(() => {
      if (focusBarcodeOnOpen) barcodeRef.current?.focus();
      else nameRef.current?.focus();
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product]);

  // Live duplicate-barcode check, debounced, so a mis-scan is caught before
  // hitting Save rather than only via the server's error afterward.
  useEffect(() => {
    const value = form.barcode?.trim();
    if (!value) {
      setDuplicate(null);
      return;
    }
    const t = setTimeout(() => {
      listProducts({ search: value, include_inactive: true })
        .then((rows) => {
          const match = rows.find((p) => p.barcode === value && p.id !== product?.id);
          setDuplicate(match ?? null);
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [form.barcode, product]);

  function handleBarcodeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // A scanner sends the code followed by Enter - don't let that submit an
    // otherwise-empty form, just move on to naming the product.
    if (e.key === "Enter") {
      e.preventDefault();
      nameRef.current?.focus();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const input: ProductInput = {
        ...form,
        barcode: form.barcode?.trim() ? form.barcode.trim() : null,
        brand: form.brand?.trim() ? form.brand.trim() : null,
      };
      const saved = product
        ? await updateProduct(product.id, input)
        : await createProduct({ ...input, stock } satisfies CreateProductInput);
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  const margin = form.selling_price - form.purchase_price;
  const marginPct =
    form.purchase_price > 0 ? Math.round((margin / form.purchase_price) * 100) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product ? "Modifier le produit" : "Nouveau produit"}</DialogTitle>
          {!product && (
            <DialogDescription>
              Scannez le code-barres avec votre douchette ou saisissez-le, puis complétez le reste.
            </DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="barcode">Code-barres</Label>
            <div className="relative">
              <BarcodeIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="barcode"
                ref={barcodeRef}
                className="pl-9 font-mono"
                value={form.barcode ?? ""}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                onKeyDown={handleBarcodeKeyDown}
                placeholder="Scannez ou saisissez le code-barres — facultatif"
                autoFocus={focusBarcodeOnOpen}
              />
            </div>
            {duplicate && (
              <p className="text-xs text-amber-600">
                Déjà utilisé par <span className="font-medium">« {duplicate.name} »</span>.
                {!duplicate.active && " (inactif)"}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">Nom</Label>
            <Input
              id="name"
              ref={nameRef}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Catégorie</Label>
              <Select
                value={form.category_id ? String(form.category_id) : "none"}
                onValueChange={(v) =>
                  setForm({ ...form, category_id: v === "none" ? null : Number(v) })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sans catégorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sans catégorie</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="brand">Marque</Label>
              <Input
                id="brand"
                value={form.brand ?? ""}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder="Facultatif"
              />
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tarification
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="purchase_price">Prix d'achat (DA)</Label>
                <Input
                  id="purchase_price"
                  type="number"
                  min={0}
                  step={1}
                  value={form.purchase_price}
                  onChange={(e) =>
                    setForm({ ...form, purchase_price: Number(e.target.value) })
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="selling_price">Prix de vente (DA)</Label>
                <Input
                  id="selling_price"
                  type="number"
                  min={0}
                  step={1}
                  value={form.selling_price}
                  onChange={(e) =>
                    setForm({ ...form, selling_price: Number(e.target.value) })
                  }
                  required
                />
              </div>
            </div>
            <p
              className={cn(
                "text-xs",
                margin > 0
                  ? "text-emerald-600"
                  : margin < 0
                    ? "text-destructive"
                    : "text-muted-foreground",
              )}
            >
              Marge : {formatDA(margin)}
              {marginPct !== null && ` (${marginPct}%)`}
            </p>
          </div>

          {product ? (
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Stock actuel</Label>
              <p className="flex h-9 items-center text-sm">
                {product.stock}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  (à modifier depuis la page Stock)
                </span>
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="stock">Stock initial</Label>
              <Input
                id="stock"
                type="number"
                min={0}
                step={1}
                value={stock}
                onChange={(e) => setStock(Math.max(0, Number(e.target.value)))}
              />
              <p className="text-xs text-muted-foreground">
                Nombre d'unités que vous avez en main actuellement. Laissez 0 si
                vous le recevrez plus tard via un achat.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
