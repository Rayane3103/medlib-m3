import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format an integer amount of Algerian dinars for display.
 * Money is stored and moved around as whole DA (integers) everywhere in the app.
 */
export function formatDA(amount: number): string {
  return new Intl.NumberFormat("fr-DZ", {
    style: "decimal",
    maximumFractionDigits: 0,
  }).format(amount) + " DA";
}
