ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS prior_balance_snapshot NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS minimum_payment_due NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settlement_choice VARCHAR(16);

ALTER TABLE orders
  ADD CONSTRAINT orders_settlement_choice_check
  CHECK (settlement_choice IS NULL OR settlement_choice IN ('QR', 'CASH', 'CHEQUE', 'LEND'));

INSERT INTO customer_ledger(customer_id, transaction_type, reference_id, amount, signed_amount, description, created_by, created_at)
SELECT o.customer_id, 'SALE', o.id, o.grand_total, o.grand_total,
       COALESCE('Invoice ' || o.invoice_number, 'Order ' || o.order_number),
       o.staff_id, o.created_at
FROM orders o
WHERE NOT EXISTS (
  SELECT 1
  FROM customer_ledger l
  WHERE l.transaction_type = 'SALE' AND l.reference_id = o.id
);

UPDATE orders o
SET prior_balance_snapshot = balances.balance,
    minimum_payment_due = CEIL(GREATEST(balances.balance, 0) * 20)::NUMERIC / 100
FROM (
  SELECT o.id, COALESCE(SUM(l.signed_amount), 0)::NUMERIC(14,2) AS balance
  FROM orders o
  LEFT JOIN customer_ledger l ON l.customer_id = o.customer_id
    AND l.created_at < o.created_at
  GROUP BY o.id
) balances
WHERE o.id = balances.id
  AND o.prior_balance_snapshot = 0
  AND o.minimum_payment_due = 0;
