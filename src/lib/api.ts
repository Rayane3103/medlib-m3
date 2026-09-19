import { invoke } from "@tauri-apps/api/core";

/**
 * Thin typed wrappers around the Rust commands.
 * Every call into the backend goes through this file so the surface stays visible.
 */

export type Category = {
  id: number;
  name: string;
  active: boolean;
  created_at: string;
};

export type CategoryInput = {
  name: string;
};

export type Product = {
  id: number;
  barcode: string | null;
  name: string;
  category_id: number | null;
  category_name: string | null;
  brand: string | null;
  purchase_price: number;
  selling_price: number;
  stock: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductFilter = {
  search?: string;
  category_id?: number | null;
  include_inactive?: boolean;
};

/** Fields editable once a product exists - stock isn't among them, see CreateProductInput. */
export type ProductInput = {
  barcode: string | null;
  name: string;
  category_id: number | null;
  brand: string | null;
  purchase_price: number;
  selling_price: number;
};

/** Creating a product is the only time stock can be set directly. */
export type CreateProductInput = ProductInput & {
  stock: number;
};

export type StockMovementType = "PURCHASE" | "SALE" | "RETURN" | "DAMAGE" | "ADJUSTMENT";

export type StockMovement = {
  id: number;
  movement_type: StockMovementType;
  quantity: number;
  reference_type: string | null;
  reference_id: number | null;
  note: string | null;
  created_at: string;
};

export type StockAdjustmentInput = {
  movement_type: "ADJUSTMENT" | "DAMAGE" | "RETURN";
  quantity: number;
  note: string | null;
};

export type PurchaseItemInput = {
  product_id: number;
  quantity: number;
  unit_price: number;
};

export type CreatePurchaseInput = {
  notes: string | null;
  items: PurchaseItemInput[];
};

export type PurchaseSummary = {
  id: number;
  total: number;
  status: string;
  purchase_date: string;
  notes: string | null;
  created_at: string;
  item_count: number;
};

export type PurchaseItemDetail = {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
};

export type PurchaseDetail = PurchaseSummary & {
  items: PurchaseItemDetail[];
};

export type PaymentMethod = "CASH" | "CARD" | "OTHER";

export type SaleItemInput = {
  /** `null` = ad-hoc line (fee, extra) — `label` is then required and stock is untouched. */
  product_id: number | null;
  label?: string;
  quantity: number;
  unit_price: number;
};

export type CreateSaleInput = {
  payment_method: PaymentMethod;
  customer_id: number | null;
  items: SaleItemInput[];
};

export type SaleSummary = {
  id: number;
  customer_id: number | null;
  total: number;
  payment_method: PaymentMethod;
  status: string;
  sale_date: string;
  created_at: string;
  item_count: number;
};

export type SaleItemDetail = {
  id: number;
  /** `null` for an ad-hoc line; `product_name` then holds its label. */
  product_id: number | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  purchase_price: number;
  total: number;
};

export type SaleDetail = SaleSummary & {
  items: SaleItemDetail[];
};

export type ScanSession = {
  url: string | null;
};

export type ScannedProduct = {
  id: number;
  barcode: string | null;
  name: string;
  selling_price: number;
  stock: number;
};

export const SCAN_EVENT = "scan:product-scanned";
export const SCAN_NOT_FOUND_EVENT = "scan:product-not-found";
/** A quantity edit made on the phone's cart view. `quantity === 0` = remove. */
export const CART_LINE_EVENT = "scan:cart-line-changed";

export type CartLineChange = {
  product_id: number;
  quantity: number;
};

/** The active cart as published to the phone so it can mirror it. */
export type CartSnapshot = {
  label: string;
  lines: {
    product_id: number;
    name: string;
    barcode: string | null;
    unit_price: number;
    quantity: number;
    stock: number;
  }[];
};

export type RecentSale = {
  id: number;
  total: number;
  payment_method: string;
  sale_date: string;
};

export type DashboardSummary = {
  today_sales_total: number;
  today_sales_count: number;
  today_estimated_profit: number;
  recent_sales: RecentSale[];
};

export type AppInfo = {
  version: string;
  db_path: string;
};

export function appInfo(): Promise<AppInfo> {
  return invoke("app_info");
}

export function getDashboardSummary(): Promise<DashboardSummary> {
  return invoke("get_dashboard_summary");
}

export function listCategories(includeInactive = false): Promise<Category[]> {
  return invoke("list_categories", { includeInactive });
}

export function createCategory(input: CategoryInput): Promise<Category> {
  return invoke("create_category", { input });
}

export function updateCategory(id: number, input: CategoryInput): Promise<Category> {
  return invoke("update_category", { id, input });
}

export function setCategoryActive(id: number, active: boolean): Promise<void> {
  return invoke("set_category_active", { id, active });
}

export function listProducts(filter: ProductFilter = {}): Promise<Product[]> {
  return invoke("list_products", { filter });
}

export function createProduct(input: CreateProductInput): Promise<Product> {
  return invoke("create_product", { input });
}

export function updateProduct(id: number, input: ProductInput): Promise<Product> {
  return invoke("update_product", { id, input });
}

export function setProductActive(id: number, active: boolean): Promise<void> {
  return invoke("set_product_active", { id, active });
}

export function adjustStock(
  productId: number,
  input: StockAdjustmentInput,
): Promise<void> {
  return invoke("adjust_stock", { productId, input });
}

export function listStockMovements(productId: number): Promise<StockMovement[]> {
  return invoke("list_stock_movements", { productId });
}

export function listPurchases(): Promise<PurchaseSummary[]> {
  return invoke("list_purchases");
}

export function getPurchase(id: number): Promise<PurchaseDetail> {
  return invoke("get_purchase", { id });
}

export function createPurchase(input: CreatePurchaseInput): Promise<PurchaseDetail> {
  return invoke("create_purchase", { input });
}

export function listSales(): Promise<SaleSummary[]> {
  return invoke("list_sales");
}

export function getSale(id: number): Promise<SaleDetail> {
  return invoke("get_sale", { id });
}

export function createSale(input: CreateSaleInput): Promise<SaleDetail> {
  return invoke("create_sale", { input });
}

export function getScanSession(): Promise<ScanSession> {
  return invoke("get_scan_session");
}

export function setScanListenerActive(active: boolean): Promise<void> {
  return invoke("set_scan_listener_active", { active });
}

export function publishCartState(cart: CartSnapshot): Promise<void> {
  return invoke("publish_cart_state", { cart });
}
