import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listStockMovements, type Product, type StockMovement } from "@/lib/api";
import { movementTypeLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
};

const TYPE_VARIANT: Record<StockMovement["movement_type"], "success" | "destructive" | "default"> = {
  PURCHASE: "success",
  RETURN: "success",
  SALE: "destructive",
  DAMAGE: "destructive",
  ADJUSTMENT: "default",
};

export function StockHistoryDialog({ open, onOpenChange, product }: Props) {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !product) return;
    setLoading(true);
    listStockMovements(product.id)
      .then(setMovements)
      .finally(() => setLoading(false));
  }, [open, product]);

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Historique du stock — {product.name}</DialogTitle>
        </DialogHeader>

        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Chargement…</p>
          ) : movements.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucun mouvement de stock enregistré pour le moment.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-2 font-medium">Date</th>
                  <th className="py-2 pr-2 font-medium">Type</th>
                  <th className="py-2 pr-2 text-right font-medium">Variation</th>
                  <th className="py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="py-2 pr-2 text-xs text-muted-foreground">{m.created_at}</td>
                    <td className="py-2 pr-2">
                      <Badge variant={TYPE_VARIANT[m.movement_type]}>{movementTypeLabel(m.movement_type)}</Badge>
                    </td>
                    <td
                      className={cn(
                        "py-2 pr-2 text-right font-medium",
                        m.quantity > 0 ? "text-emerald-600" : "text-destructive",
                      )}
                    >
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </td>
                    <td className="py-2 text-muted-foreground">{m.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
