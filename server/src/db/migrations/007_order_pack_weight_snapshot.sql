ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS pack_weight_kg_snapshot NUMERIC(12,6);

UPDATE order_items oi
SET pack_weight_kg_snapshot = p.pack_weight_kg
FROM products p
WHERE oi.product_id = p.id
  AND UPPER(COALESCE(oi.unit_snapshot, '')) = 'PACKET'
  AND oi.pack_weight_kg_snapshot IS NULL;
