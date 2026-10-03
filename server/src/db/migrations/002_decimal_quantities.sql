ALTER TABLE products
  ALTER COLUMN stock_quantity TYPE NUMERIC(14,3) USING stock_quantity::NUMERIC(14,3);

ALTER TABLE order_items
  ALTER COLUMN quantity TYPE NUMERIC(14,3) USING quantity::NUMERIC(14,3);

ALTER TABLE stock_movements
  ALTER COLUMN quantity TYPE NUMERIC(14,3) USING quantity::NUMERIC(14,3);

ALTER TABLE delivery_items
  ALTER COLUMN quantity TYPE NUMERIC(14,3) USING quantity::NUMERIC(14,3);
