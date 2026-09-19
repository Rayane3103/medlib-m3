-- Allow ad-hoc lines on a sale (delivery fees, gift wrap, …) that are not
-- backed by a product. Such lines have a NULL product_id and carry their
-- own label; they never touch stock. SQLite cannot drop NOT NULL in place,
-- so the table is rebuilt.
CREATE TABLE sale_items_new (
    id             INTEGER PRIMARY KEY,
    sale_id        INTEGER NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
    product_id     INTEGER REFERENCES products (id),
    -- Name of an ad-hoc line. Required exactly when product_id is NULL.
    label          TEXT,
    quantity       INTEGER NOT NULL CHECK (quantity > 0),
    unit_price     INTEGER NOT NULL CHECK (unit_price >= 0),
    -- Copied from products.purchase_price at the moment of sale so that
    -- historical profit stays correct when the product price changes later.
    purchase_price INTEGER NOT NULL CHECK (purchase_price >= 0),
    total          INTEGER NOT NULL CHECK (total >= 0),
    CHECK ((product_id IS NOT NULL) OR (label IS NOT NULL AND label <> ''))
);

INSERT INTO sale_items_new (id, sale_id, product_id, label, quantity, unit_price, purchase_price, total)
SELECT id, sale_id, product_id, NULL, quantity, unit_price, purchase_price, total
FROM sale_items;

DROP TABLE sale_items;
ALTER TABLE sale_items_new RENAME TO sale_items;

CREATE INDEX idx_sale_items_sale_id ON sale_items (sale_id);
