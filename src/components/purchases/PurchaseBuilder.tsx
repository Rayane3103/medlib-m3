import { useState } from "react";
import { X } from "lucide-react";

import { ProductPicker } from "@/components/products/ProductPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPurchase, type Product } from "@/lib/api";
import { formatDA } from "@/lib/utils";

type DraftItem = {
  product_id: number;
  name: string;
  quantity: number;
  unit_price: number;
};

type Props = {
  onCreated: () => void;
  onCancel: () => void;
};

export function PurchaseBuilder({ onCreated, onCancel }: Props) {
  const [items, setItems] = useState<DraftItem[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function addProduct(p: Product) {
    setError(null);
    setItems((prev) => {
      const existing = prev.find((i) => i.product_id === p.id);
      if (existing) {
        return prev.map((i) =>
          i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        { product_id: p.id, name: p.name, quantity: 1, unit_price: p.purchase_price },
      ];
    });
  }

  function updateItem(productId: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((i) => (i.product_id === productId ? { ...i, ...patch } : i)));
  }

  function removeItem(productId: number) {
    setItems((prev) => prev.filter((i) => i.product_id !== productId));
  }

  const total = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);

  async function handleSubmit() {
    if (items.length === 0) {
      setError("Ajoutez au moins un produit.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createPurchase({
        notes: notes.trim() ? notes.trim() : null,
        items: items.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
        })),
      });
      onCreated();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <ProductPicker onSelect={addProduct} autoFocus />

        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Produit</th>
                <th className="px-3 py-2 font-medium">Qté</th>
                <th className="px-3 py-2 font-medium">Prix unitaire (DA)</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.product_id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{i.name}</td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={i.quantity}
                      onChange={(e) =>
                        updateItem(i.product_id, {
                          quantity: Math.max(1, Number(e.target.value)),
                        })
                      }
                      className="h-8 w-20"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={i.unit_price}
                      onChange={(e) =>
                        updateItem(i.product_id, {
                          unit_price: Math.max(0, Number(e.target.value)),
                        })
                      }
                      className="h-8 w-24"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatDA(i.quantity * i.unit_price)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => removeItem(i.product_id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    Recherchez ci-dessus pour ajouter des produits.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Input
            id="notes"
            placeholder="Facultatif"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center justify-between border-t pt-4">
          <div className="text-lg font-semibold">Total : {formatDA(total)}</div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Annuler
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={saving || items.length === 0}>
              {saving ? "Enregistrement…" : "Valider l'achat"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
