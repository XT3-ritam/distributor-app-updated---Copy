ALTER TABLE delivery_items
  ALTER COLUMN unit_cost DROP NOT NULL,
  ALTER COLUMN total_cost DROP NOT NULL;
