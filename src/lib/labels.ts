import type { PaymentMethod, StockMovementType } from "@/lib/api";

/**
 * French display labels for the enum values stored in the database.
 * The stored values (CASH, COMPLETED, PURCHASE, …) never change; only what
 * the cashier sees on screen is translated here.
 */

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Espèces",
  CARD: "Carte",
  OTHER: "Autre",
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? method;
}

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "Terminé",
  CANCELLED: "Annulé",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

const MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = {
  PURCHASE: "Achat",
  SALE: "Vente",
  RETURN: "Retour",
  DAMAGE: "Casse / perte",
  ADJUSTMENT: "Correction",
};

export function movementTypeLabel(type: string): string {
  return MOVEMENT_TYPE_LABELS[type as StockMovementType] ?? type;
}
