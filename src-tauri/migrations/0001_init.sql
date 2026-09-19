-- MedLib M3 initial schema.
-- Money is stored as whole Algerian dinars (INTEGER). Booleans are 0/1.
-- Timestamps are TEXT in SQLite's default 'YYYY-MM-DD HH:MM:SS' UTC format.

CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    name          TEXT NOT NULL,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('ADMIN', 'CASHIER')),
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    id             INTEGER PRIMARY KEY,
    barcode        TEXT,
    name           TEXT NOT NULL,
    category_id    INTEGER REFERENCES categories (id),
    brand          TEXT,
    purchase_price INTEGER NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
    selling_price  INTEGER NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
    stock          INTEGER NOT NULL DEFAULT 0,
    active         INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Barcode is optional, but unique when present. Fast lookup for the POS.
CREATE UNIQUE INDEX idx_products_barcode
    ON products (barcode)
    WHERE barcode IS NOT NULL;
CREATE INDEX idx_products_name ON products (name);
CREATE INDEX idx_products_category_id ON products (category_id);

CREATE TABLE customers (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    phone      TEXT,
    notes      TEXT,
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE purchases (
    id            INTEGER PRIMARY KEY,
    total         INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),
    status        TEXT NOT NULL DEFAULT 'COMPLETED'
                       CHECK (status IN ('COMPLETED', 'CANCELLED')),
    purchase_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes         TEXT,
    created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_purchases_purchase_date ON purchases (purchase_date);

CREATE TABLE purchase_items (
    id          INTEGER PRIMARY KEY,
    purchase_id INTEGER NOT NULL REFERENCES purchases (id) ON DELETE CASCADE,
    product_id  INTEGER NOT NULL REFERENCES products (id),
    quantity    INTEGER NOT NULL CHECK (quantity > 0),
    unit_price  INTEGER NOT NULL CHECK (unit_price >= 0),
    total       INTEGER NOT NULL CHECK (total >= 0)
);

CREATE INDEX idx_purchase_items_purchase_id ON purchase_items (purchase_id);
CREATE INDEX idx_purchase_items_product_id ON purchase_items (product_id);

CREATE TABLE sales (
    id             INTEGER PRIMARY KEY,
    customer_id    INTEGER REFERENCES customers (id),
    total          INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),
    payment_method TEXT NOT NULL DEFAULT 'CASH'
                        CHECK (payment_method IN ('CASH', 'CARD', 'OTHER')),
    status         TEXT NOT NULL DEFAULT 'COMPLETED'
                        CHECK (status IN ('COMPLETED', 'CANCELLED')),
    sale_date      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sales_sale_date ON sales (sale_date);

CREATE TABLE sale_items (
    id             INTEGER PRIMARY KEY,
    sale_id        INTEGER NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
    product_id     INTEGER NOT NULL REFERENCES products (id),
    quantity       INTEGER NOT NULL CHECK (quantity > 0),
    unit_price     INTEGER NOT NULL CHECK (unit_price >= 0),
    -- Copied from products.purchase_price at the moment of sale so that
    -- historical profit stays correct when the product price changes later.
    purchase_price INTEGER NOT NULL CHECK (purchase_price >= 0),
    total          INTEGER NOT NULL CHECK (total >= 0)
);

CREATE INDEX idx_sale_items_sale_id ON sale_items (sale_id);
CREATE INDEX idx_sale_items_product_id ON sale_items (product_id);

CREATE TABLE stock_movements (
    id             INTEGER PRIMARY KEY,
    product_id     INTEGER NOT NULL REFERENCES products (id),
    type           TEXT NOT NULL CHECK (type IN
                       ('PURCHASE', 'SALE', 'RETURN', 'DAMAGE', 'ADJUSTMENT')),
    -- Signed change applied to product stock (e.g. +50 on purchase, -2 on sale).
    quantity       INTEGER NOT NULL,
    reference_type TEXT,
    reference_id   INTEGER,
    note           TEXT,
    created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_stock_movements_product_id ON stock_movements (product_id);
CREATE INDEX idx_stock_movements_created_at ON stock_movements (created_at);

CREATE TABLE expenses (
    id           INTEGER PRIMARY KEY,
    name         TEXT NOT NULL,
    amount       INTEGER NOT NULL CHECK (amount >= 0),
    expense_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes        TEXT,
    created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_expenses_expense_date ON expenses (expense_date);

-- Starter categories from DATABASE.md.
INSERT INTO categories (name) VALUES
    ('School Supplies'),
    ('Stationery'),
    ('Cosmetics'),
    ('Other');
