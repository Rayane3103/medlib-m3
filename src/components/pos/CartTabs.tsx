import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export type CartTab = {
  id: string;
  label: string;
  itemCount: number;
};

type Props = {
  carts: CartTab[];
  activeId: string;
  onSwitch: (id: string) => void;
  onDiscard: (id: string) => void;
};

/** Switcher for held carts - only rendered once a second cart exists. */
export function CartTabs({ carts, activeId, onSwitch, onDiscard }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {carts.map((c) => {
        const active = c.id === activeId;
        return (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            onClick={() => onSwitch(c.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSwitch(c.id);
              }
            }}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <span>{c.label}</span>
            {c.itemCount > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] leading-none",
                  active ? "bg-primary-foreground/20" : "bg-muted",
                )}
              >
                {c.itemCount}
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDiscard(c.id);
              }}
              title="Abandonner le panier"
              className="rounded-full opacity-60 hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
