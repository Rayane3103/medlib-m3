import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";

type Props = {
  quantity: number;
  onChange: (quantity: number) => void;
};

/**
 * Click the quantity to type an exact value with the numpad and confirm
 * with Enter - faster than clicking "+" repeatedly for a large quantity.
 * Purely local edit state, so it never steals focus from the barcode
 * scanner input unless the cashier deliberately clicks in here.
 */
export function QuantityCell({ quantity, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(quantity));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function startEditing() {
    setDraft(String(quantity));
    setEditing(true);
  }

  function commit() {
    const parsed = Math.floor(Number(draft));
    onChange(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
    setEditing(false);
  }

  function cancel() {
    setDraft(String(quantity));
    setEditing(false);
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        type="number"
        min={1}
        step={1}
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        onBlur={commit}
        className="h-7 w-16 px-2 text-center"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      title="Cliquez pour saisir une quantité exacte"
      className="w-8 rounded text-center tabular-nums hover:bg-accent hover:text-accent-foreground"
    >
      {quantity}
    </button>
  );
}
