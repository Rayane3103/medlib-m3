import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { adjustStock, type Product, type StockAdjustmentInput } from "@/lib/api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onSaved: () => void;
};

const REASONS: { value: StockAdjustmentInput["movement_type"]; label: string }[] = [
  { value: "ADJUSTMENT", label: "Correction (recomptage, stock retrouvé, erreur)" },
  { value: "DAMAGE", label: "Casse / perte" },
  { value: "RETURN", label: "Retour (client ou fournisseur)" },
];

export function AdjustStockDialog({ open, onOpenChange, product, onSaved }: Props) {
  const [movementType, setMovementType] =
    useState<StockAdjustmentInput["movement_type"]>("ADJUSTMENT");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMovementType("ADJUSTMENT");
    setQuantity("");
    setNote("");
    setError(null);
  }, [open, product]);

  if (!product) return null;

  const parsedQuantity = Number(quantity);
  const isValidQuantity =
    quantity.trim() !== "" && Number.isInteger(parsedQuantity) && parsedQuantity !== 0;
  const newStock = isValidQuantity ? product.stock + parsedQuantity : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidQuantity || !product) return;
    setSaving(true);
    setError(null);
    try {
      await adjustStock(product.id, {
        movement_type: movementType,
        quantity: parsedQuantity,
        note: note.trim() ? note.trim() : null,
      });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajuster le stock — {product.name}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Stock actuel : <span className="font-medium text-foreground">{product.stock}</span>
          </p>

          <div className="space-y-1.5">
            <Label>Motif</Label>
            <Select
              value={movementType}
              onValueChange={(v) => setMovementType(v as StockAdjustmentInput["movement_type"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quantity">Variation de quantité</Label>
            <Input
              id="quantity"
              type="number"
              step={1}
              placeholder="ex. 5 ou -2"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              autoFocus
              required
            />
            <p className="text-xs text-muted-foreground">
              Positif pour augmenter le stock, négatif pour le diminuer.
              {newStock !== null && (
                <>
                  {" "}
                  Le nouveau stock sera de <span className="font-medium">{newStock}</span>.
                </>
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note">Note</Label>
            <Input
              id="note"
              placeholder="Facultatif"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving || !isValidQuantity}>
              {saving ? "Enregistrement…" : "Appliquer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
