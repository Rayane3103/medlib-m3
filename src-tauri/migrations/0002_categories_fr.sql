-- Reduce the starter categories to the two actually used by the shop and
-- rename them in French. Products in the removed categories are reassigned
-- so the FK stays valid: stationery is school supplies, "Other" becomes
-- uncategorised.
UPDATE categories SET name = 'Cosmétiques'        WHERE name = 'Cosmetics';
UPDATE categories SET name = 'Affaires scolaires' WHERE name = 'School Supplies';

UPDATE products
SET category_id = (SELECT id FROM categories WHERE name = 'Affaires scolaires')
WHERE category_id IN (SELECT id FROM categories WHERE name = 'Stationery');

UPDATE products
SET category_id = NULL
WHERE category_id IN (SELECT id FROM categories WHERE name = 'Other');

DELETE FROM categories WHERE name IN ('Stationery', 'Other');
