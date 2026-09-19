import { useEffect, useState } from "react";

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

export type CustomLineInput = {
  name: string;
  unit_price: number;
  quantity: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (line: CustomLineInput) => void;
};

/**
 * Tiny form for adding an ad-hoc line (delivery fee, gift wrap, …) to the
 * cart without creating a product. Resets itself every time it opens.
 */
export function CustomLineDialog({ open, onOpenChange, onConfirm }: Props) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");

  useEffect(() => {
    if (!open) return;
    setName("");
    setPrice("");
    setQuantity("1");
  }, [open]);

  const trimmedName = name.trim();
  const unitPrice = Number(price);
  const qty = Number(quantity);
  const valid =
    trimmedName.length > 0 &&
    price.trim() !== "" &&
    Number.isFinite(unitPrice) &&
    unitPrice >= 0 &&
    Number.isInteger(qty) &&
    qty >= 1;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onConfirm({ name: trimmedName, unit_price: Math.round(unitPrice), quantity: qty });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Ajouter un frais</DialogTitle>
          <DialogDescription>
            Ligne libre ajoutée au panier, sans toucher au stock.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="custom-line-name">Nom</Label>
            <Input
              id="custom-line-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Livraison"
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="custom-line-price">Prix (DA)</Label>
              <Input
                id="custom-line-price"
                type="number"
                min={0}
                step={1}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="custom-line-qty">Quantité</Label>
              <Input
                id="custom-line-qty"
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!valid}>
              Confirmer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
