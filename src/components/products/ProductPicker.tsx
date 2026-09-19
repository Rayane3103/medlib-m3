import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { Input } from "@/components/ui/input";
import { listProducts, type Product } from "@/lib/api";

type Props = {
  onSelect: (product: Product) => void;
  /** Called when Enter is pressed but nothing matched the query. */
  onNotFound?: (query: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

export type ProductPickerHandle = {
  /** Return keyboard focus to the search/barcode input. */
  focus: () => void;
};

/**
 * Search-as-you-type product lookup, shared by Purchases and the POS.
 * A barcode scanner types the code and hits Enter - if the current results
 * contain an exact barcode match (or there's a single match), Enter picks it
 * immediately without waiting for a mouse click.
 */
export const ProductPicker = forwardRef<ProductPickerHandle, Props>(function ProductPicker(
  { onSelect, onNotFound, placeholder, autoFocus },
  ref,
) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [searched, setSearched] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearched(false);
    const t = setTimeout(() => {
      listProducts({ search: query })
        .then((rows) => {
          setResults(rows.slice(0, 8));
          setSearched(true);
          setOpen(true);
        })
        .catch(() => {});
    }, 150);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function pick(p: Product) {
    onSelect(p);
    setQuery("");
    setResults([]);
    setSearched(false);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter" || !query.trim()) return;
    e.preventDefault();
    const trimmed = query.trim();
    const exact = results.find((p) => p.barcode === trimmed);
    if (exact) {
      pick(exact);
    } else if (results.length === 1) {
      pick(results[0]);
    } else if (results.length === 0 && searched) {
      onNotFound?.(trimmed);
      setQuery("");
      setSearched(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        placeholder={placeholder ?? "Scannez un code-barres ou recherchez par nom…"}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
        autoFocus={autoFocus}
      />
      {open && searched && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              Aucun produit trouvé pour « {query.trim()} ».
            </p>
          ) : (
            results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => pick(p)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <span>
                  <span className="font-medium">{p.name}</span>
                  {p.barcode && (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {p.barcode}
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">Stock : {p.stock}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
});
