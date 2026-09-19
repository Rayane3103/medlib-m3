import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getPurchase, type PurchaseDetail } from "@/lib/api";
import { statusLabel } from "@/lib/labels";
import { formatDA } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseId: number | null;
};

export function PurchaseDetailDialog({ open, onOpenChange, purchaseId }: Props) {
  const [detail, setDetail] = useState<PurchaseDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || purchaseId === null) return;
    setLoading(true);
    getPurchase(purchaseId)
      .then(setDetail)
      .finally(() => setLoading(false));
  }, [open, purchaseId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {detail ? `Achat n°${detail.id}` : "Achat"}
          </DialogTitle>
        </DialogHeader>

        {loading || !detail ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Chargement…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Date : </span>
                {detail.purchase_date}
              </div>
              <div>
                <span className="text-muted-foreground">Statut : </span>
                {statusLabel(detail.status)}
              </div>
              {detail.notes && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Notes : </span>
                  {detail.notes}
                </div>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Produit</th>
                    <th className="px-3 py-2 text-right font-medium">Qté</th>
                    <th className="px-3 py-2 text-right font-medium">Prix unitaire</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="px-3 py-2">{item.product_name}</td>
                      <td className="px-3 py-2 text-right">{item.quantity}</td>
                      <td className="px-3 py-2 text-right">{formatDA(item.unit_price)}</td>
                      <td className="px-3 py-2 text-right">{formatDA(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end text-base font-semibold">
              Total : {formatDA(detail.total)}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
