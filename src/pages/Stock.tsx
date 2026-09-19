import { useEffect, useState } from "react";
import { History, SlidersHorizontal } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { AdjustStockDialog } from "@/components/stock/AdjustStockDialog";
import { StockHistoryDialog } from "@/components/stock/StockHistoryDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listCategories, listProducts, type Category, type Product } from "@/lib/api";

export function Stock() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");

  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [historyFor, setHistoryFor] = useState<Product | null>(null);

  useEffect(() => {
    listCategories(false).then(setCategories).catch(() => {});
  }, []);

  function loadProducts() {
    setLoading(true);
    setError(null);
    listProducts({
      search,
      category_id: categoryId === "all" ? null : Number(categoryId),
    })
      .then(setProducts)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const t = setTimeout(loadProducts, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryId]);

  return (
    <div>
      <PageHeader
        title="Stock"
        description="Niveaux de stock actuels et ajustements manuels."
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-4 py-4">
          <div className="min-w-[240px] flex-1 space-y-1.5">
            <Label htmlFor="search">Rechercher</Label>
            <Input
              id="search"
              placeholder="Nom, code-barres ou marque…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          <div className="w-56 space-y-1.5">
            <Label>Catégorie</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les catégories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {error ? (
            <p className="p-6 text-sm text-destructive">{error}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Code-barres</th>
                  <th className="px-4 py-2 font-medium">Nom</th>
                  <th className="px-4 py-2 font-medium">Catégorie</th>
                  <th className="px-4 py-2 text-right font-medium">Stock</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs">{p.barcode ?? "—"}</td>
                    <td className="px-4 py-2 font-medium">{p.name}</td>
                    <td className="px-4 py-2">{p.category_name ?? "—"}</td>
                    <td className="px-4 py-2 text-right">{p.stock}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAdjusting(p)}
                        >
                          <SlidersHorizontal /> Ajuster
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setHistoryFor(p)}
                        >
                          <History /> Historique
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!loading && products.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                      Aucun produit trouvé.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <AdjustStockDialog
        open={adjusting !== null}
        onOpenChange={(open) => !open && setAdjusting(null)}
        product={adjusting}
        onSaved={loadProducts}
      />

      <StockHistoryDialog
        open={historyFor !== null}
        onOpenChange={(open) => !open && setHistoryFor(null)}
        product={historyFor}
      />
    </div>
  );
}
