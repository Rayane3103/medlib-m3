import { useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  createCategory,
  listCategories,
  setCategoryActive,
  updateCategory,
  type Category,
} from "@/lib/api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called whenever categories change, so the Products page can refresh its list. */
  onChanged: () => void;
};

export function CategoryManagerDialog({ open, onOpenChange, onChanged }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const rows = await listCategories(true);
    setCategories(rows);
    onChanged();
  }

  useEffect(() => {
    if (open) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setError(null);
    try {
      await createCategory({ name: newName.trim() });
      setNewName("");
      await reload();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleRename(id: number) {
    if (!editingName.trim()) return;
    setError(null);
    try {
      await updateCategory(id, { name: editingName.trim() });
      setEditingId(null);
      await reload();
    } catch (err) {
      setError(String(err));
    }
  }

  async function toggleActive(c: Category) {
    setError(null);
    try {
      await setCategoryActive(c.id, !c.active);
      await reload();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Catégories</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleCreate} className="flex gap-2">
          <Input
            placeholder="Nom de la nouvelle catégorie"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button type="submit" size="icon" aria-label="Ajouter une catégorie">
            <Plus className="h-4 w-4" />
          </Button>
        </form>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="max-h-80 space-y-1 overflow-y-auto">
          {categories.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
            >
              {editingId === c.id ? (
                <Input
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(c.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onBlur={() => handleRename(c.id)}
                  className="h-8"
                />
              ) : (
                <span className="flex items-center gap-2 text-sm">
                  {c.name}
                  {!c.active && <Badge variant="warning">Inactive</Badge>}
                </span>
              )}

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setEditingId(c.id);
                    setEditingName(c.name);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => toggleActive(c)}
                >
                  {c.active ? "Désactiver" : "Activer"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
