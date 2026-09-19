import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { PurchaseBuilder } from "@/components/purchases/PurchaseBuilder";
import { PurchaseDetailDialog } from "@/components/purchases/PurchaseDetailDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listPurchases, type PurchaseSummary } from "@/lib/api";
import { statusLabel } from "@/lib/labels";
import { formatDA } from "@/lib/utils";

export function Purchases() {
  const [view, setView] = useState<"list" | "create">("list");
  const [purchases, setPurchases] = useState<PurchaseSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  function load() {
    listPurchases()
      .then(setPurchases)
      .catch((e) => setError(String(e)));
  }

  useEffect(load, []);

  if (view === "create") {
    return (
      <div>
        <PageHeader
          title="Nouvel achat"
          description="Réceptionner du stock dans la boutique."
        />
        <PurchaseBuilder
          onCreated={() => {
            setView("list");
            load();
          }}
          onCancel={() => setView("list")}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Achats"
        description="Stock réceptionné dans la boutique."
        actions={
          <Button onClick={() => setView("create")}>
            <Plus /> Nouvel achat
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {error ? (
            <p className="p-6 text-sm text-destructive">{error}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Articles</th>
                  <th className="px-4 py-2 text-right font-medium">Total</th>
                  <th className="px-4 py-2 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr
                    key={p.id}
                    className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                    onClick={() => setSelectedId(p.id)}
                  >
                    <td className="px-4 py-2">{p.id}</td>
                    <td className="px-4 py-2">{p.purchase_date}</td>
                    <td className="px-4 py-2">{p.item_count}</td>
                    <td className="px-4 py-2 text-right">{formatDA(p.total)}</td>
                    <td className="px-4 py-2">
                      <Badge variant={p.status === "COMPLETED" ? "success" : "destructive"}>
                        {statusLabel(p.status)}
                      </Badge>
                    </td>
                  </tr>
                ))}

                {purchases.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                      Aucun achat pour le moment.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <PurchaseDetailDialog
        open={selectedId !== null}
        onOpenChange={(open) => !open && setSelectedId(null)}
        purchaseId={selectedId}
      />
    </div>
  );
}
