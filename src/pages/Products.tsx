import { useEffect, useState } from "react";
import { Plus, Tags } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { CategoryManagerDialog } from "@/components/products/CategoryManagerDialog";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  listCategories,
  listProducts,
  setProductActive,
  type Category,
  type Product,
} from "@/lib/api";
import { formatDA } from "@/lib/utils";

/** A scanned barcode looks like a run of digits; anything else is a name. */
const looksLikeBarcode = (value: string) => /^\d{4,}$/.test(value);

export function Products() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [includeInactive, setIncludeInactive] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [prefill, setPrefill] = useState<{ barcode?: string; name?: string } | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  /** Value scanned/typed that matched nothing - confirm before creating. */
  const [pendingCreate, setPendingCreate] = useState<string | null>(null);

  function loadCategories() {
    listCategories(false).then(setCategories).catch(() => {});
  }

  function loadProducts() {
    setLoading(true);
    setError(null);
    listProducts({
      search,
      category_id: categoryId === "all" ? null : Number(categoryId),
      include_inactive: includeInactive,
    })
      .then(setProducts)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(loadCategories, []);

  // Debounce so typing in the search box doesn't fire a query per keystroke.
  useEffect(() => {
    const t = setTimeout(loadProducts, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryId, includeInactive]);

  function openCreate() {
    setEditingProduct(null);
    setPrefill(null);
    setFormOpen(true);
  }

  function openEdit(p: Product) {
    setEditingProduct(p);
    setPrefill(null);
    setFormOpen(true);
  }

  function openCreateFromValue(value: string) {
    setEditingProduct(null);
    setPrefill(looksLikeBarcode(value) ? { barcode: value } : { name: value });
    setFormOpen(true);
  }

  function handleSaved() {
    setSearch("");
    loadProducts();
  }

  // Scanning a barcode and hitting Enter should feel instant: look it up
  // right away (not the debounced search) and open that product for
  // editing if it exists. If it doesn't, ask before creating anything.
  async function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !search.trim()) return;
    e.preventDefault();
    const value = search.trim();
    try {
      const rows = await listProducts({ search: value, include_inactive: true });
      const exact = rows.find((p) => p.barcode === value);
      if (exact) {
        openEdit(exact);
        setSearch("");
      } else {
        setPendingCreate(value);
      }
    } catch {
      // Leave it to the normal debounced search / manual "add" button.
    }
  }

  function confirmCreate() {
    if (!pendingCreate) return;
    openCreateFromValue(pendingCreate);
    setPendingCreate(null);
  }

  async function toggleActive(p: Product) {
    await setProductActive(p.id, !p.active);
    loadProducts();
  }

  return (
    <div>
      <PageHeader
        title="Produits"
        description="Catalogue des produits, prix et catégories."
        actions={
          <>
            <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
              <Tags /> Catégories
            </Button>
            <Button onClick={openCreate}>
              <Plus /> Nouveau produit
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-4 py-4">
          <div className="min-w-[240px] flex-1 space-y-1.5">
            <Label htmlFor="search">Rechercher ou scanner</Label>
            <Input
              id="search"
              placeholder="Scannez un code-barres, ou recherchez par nom/code-barres/marque…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
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

          <label className="flex items-center gap-2 pb-2 text-sm">
            <Checkbox
              checked={includeInactive}
              onCheckedChange={(v) => setIncludeInactive(v === true)}
            />
            Afficher les inactifs
          </label>
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
                  <th className="px-4 py-2 font-medium">Marque</th>
                  <th className="px-4 py-2 text-right font-medium">Achat</th>
                  <th className="px-4 py-2 text-right font-medium">Vente</th>
                  <th className="px-4 py-2 text-right font-medium">Stock</th>
                  <th className="px-4 py-2 font-medium">Statut</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs">{p.barcode ?? "—"}</td>
                    <td className="px-4 py-2 font-medium">{p.name}</td>
                    <td className="px-4 py-2">{p.category_name ?? "—"}</td>
                    <td className="px-4 py-2">{p.brand ?? "—"}</td>
                    <td className="px-4 py-2 text-right">{formatDA(p.purchase_price)}</td>
                    <td className="px-4 py-2 text-right">{formatDA(p.selling_price)}</td>
                    <td className="px-4 py-2 text-right">{p.stock}</td>
                    <td className="px-4 py-2">
                      <Badge variant={p.active ? "success" : "warning"}>
                        {p.active ? "Actif" : "Inactif"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                          Modifier
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleActive(p)}>
                          {p.active ? "Désactiver" : "Activer"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!loading && products.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center">
                      {search.trim() ? (
                        <div className="flex flex-col items-center gap-2">
                          <p className="text-muted-foreground">
                            Aucun produit ne correspond à « {search.trim()} ».
                          </p>
                          <Button size="sm" onClick={() => openCreateFromValue(search.trim())}>
                            <Plus className="h-3.5 w-3.5" /> Ajouter comme nouveau produit
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Aucun produit trouvé.</span>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editingProduct}
        categories={categories}
        onSaved={handleSaved}
        initialBarcode={prefill?.barcode}
        initialName={prefill?.name}
      />

      <CategoryManagerDialog
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        onChanged={loadCategories}
      />

      <Dialog open={pendingCreate !== null} onOpenChange={(o) => !o && setPendingCreate(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Produit introuvable</DialogTitle>
            <DialogDescription>
              Aucun produit ne correspond à « {pendingCreate} ». L'ajouter comme nouveau produit ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingCreate(null)}>
              Annuler
            </Button>
            <Button onClick={confirmCreate} autoFocus>
              Ajouter le produit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
