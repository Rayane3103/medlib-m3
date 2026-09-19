import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { SaleDetail } from "@/lib/api";
import { paymentMethodLabel } from "@/lib/labels";
import { formatDA } from "@/lib/utils";

type Props = {
  sale: SaleDetail | null;
  onClose: () => void;
};

export function SaleReceiptDialog({ sale, onClose }: Props) {
  return (
    <Dialog open={sale !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Vente n°{sale?.id} validée</DialogTitle>
        </DialogHeader>

        {sale && (
          <div className="space-y-4">
            <div className="max-h-72 overflow-y-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Produit</th>
                    <th className="px-3 py-2 text-right font-medium">Qté</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.items.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="px-3 py-2">{item.product_name}</td>
                      <td className="px-3 py-2 text-right">{item.quantity}</td>
                      <td className="px-3 py-2 text-right">{formatDA(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between text-base">
              <span className="text-muted-foreground">Paiement : {paymentMethodLabel(sale.payment_method)}</span>
              <span className="font-semibold">Total : {formatDA(sale.total)}</span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose} autoFocus>
            Nouvelle vente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
