import { useEffect, useState } from "react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardSummary, type DashboardSummary } from "@/lib/api";
import { paymentMethodLabel } from "@/lib/labels";
import { formatDA } from "@/lib/utils";

export function Dashboard() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDashboardSummary()
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div>
      <PageHeader
        title="Tableau de bord"
        description="Votre journée en un coup d'œil."
      />

      {error ? (
        <Card>
          <CardContent className="py-8 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat
              label="Ventes du jour"
              value={data ? formatDA(data.today_sales_total) : "—"}
            />
            <Stat
              label="Nombre de ventes"
              value={data ? String(data.today_sales_count) : "—"}
            />
            <Stat
              label="Bénéfice estimé"
              value={data ? formatDA(data.today_estimated_profit) : "—"}
            />
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">Ventes récentes</CardTitle>
            </CardHeader>
            <CardContent>
              {data && data.recent_sales.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">#</th>
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 font-medium">Paiement</th>
                      <th className="pb-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_sales.map((s) => (
                      <tr key={s.id} className="border-b last:border-0">
                        <td className="py-2">{s.id}</td>
                        <td className="py-2">{s.sale_date}</td>
                        <td className="py-2">{paymentMethodLabel(s.payment_method)}</td>
                        <td className="py-2 text-right">{formatDA(s.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Aucune vente enregistrée pour le moment.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
