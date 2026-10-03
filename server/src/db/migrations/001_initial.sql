CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('OWNER','STAFF');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('DRAFT','SUBMITTED','APPROVED','PROCESSING','COMPLETED','CANCELLED','RETURNED','PARTIALLY_RETURNED','SYNC_CONFLICT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE sync_status AS ENUM ('OFFLINE','PENDING_SYNC','SYNCING','SYNCED','SYNC_FAILED','REQUIRES_ATTENTION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE stock_movement_type AS ENUM ('COMPANY_DELIVERY','SALE','RETURN','DAMAGE','MANUAL_ADJUSTMENT','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE ledger_transaction_type AS ENUM ('OPENING_BALANCE','SALE','PAYMENT','RETURN','ADJUSTMENT','CREDIT_NOTE','DEBIT_NOTE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('CASH','UPI','BANK_TRANSFER','CHEQUE','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE supplier_delivery_status AS ENUM ('UPLOADED','PROCESSING','REVIEW','CONFIRMED','REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(120) UNIQUE NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role user_role NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_name VARCHAR(255) NOT NULL,
  address TEXT,
  phone VARCHAR(32),
  gstin VARCHAR(32),
  state VARCHAR(100),
  state_code VARCHAR(4),
  pan VARCHAR(16),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  is_taxpayer BOOLEAN NOT NULL DEFAULT FALSE,
  credit_limit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customers_store_name ON customers (LOWER(store_name));
CREATE INDEX IF NOT EXISTS idx_customers_active ON customers (active);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  brand VARCHAR(160),
  pack_size VARCHAR(120),
  unit VARCHAR(32),
  hsn_code VARCHAR(32),
  master_rate NUMERIC(14,2) NOT NULL CHECK (master_rate >= 0),
  gst_rate NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (gst_rate >= 0 AND gst_rate <= 100),
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_name ON products (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_products_active ON products (active);

CREATE TABLE IF NOT EXISTS product_price_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id),
  old_rate NUMERIC(14,2) NOT NULL,
  new_rate NUMERIC(14,2) NOT NULL,
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_name VARCHAR(255) NOT NULL,
  gstin VARCHAR(32),
  address TEXT,
  phone VARCHAR(32),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers (LOWER(supplier_name));

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number BIGSERIAL UNIQUE,
  invoice_number VARCHAR(32) UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  staff_id UUID NOT NULL REFERENCES users(id),
  status order_status NOT NULL DEFAULT 'SUBMITTED',
  sync_status sync_status NOT NULL DEFAULT 'SYNCED',
  client_idempotency_key UUID UNIQUE,
  conflict_reason TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  printed_at TIMESTAMPTZ,
  print_count INTEGER NOT NULL DEFAULT 0,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  cgst_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  sgst_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  igst_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_staff ON orders (staff_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_submitted_at ON orders (submitted_at);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  product_name_snapshot VARCHAR(255) NOT NULL,
  sku_snapshot VARCHAR(64) NOT NULL,
  hsn_snapshot VARCHAR(32),
  unit_snapshot VARCHAR(32),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  master_rate_snapshot NUMERIC(14,2) NOT NULL CHECK (master_rate_snapshot >= 0),
  unit_rate NUMERIC(14,2) NOT NULL CHECK (unit_rate >= 0),
  gst_rate_snapshot NUMERIC(6,2) NOT NULL CHECK (gst_rate_snapshot >= 0 AND gst_rate_snapshot <= 100),
  discount_percent NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  item_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  taxable_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  cgst_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  sgst_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  igst_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_rate NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_price NUMERIC(14,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  order_id UUID REFERENCES orders(id),
  method payment_method NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  reference VARCHAR(255),
  notes TEXT,
  reversed_payment_id UUID REFERENCES payments(id),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id, created_at);

CREATE TABLE IF NOT EXISTS customer_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  transaction_type ledger_transaction_type NOT NULL,
  reference_id UUID,
  amount NUMERIC(14,2) NOT NULL,
  signed_amount NUMERIC(14,2) NOT NULL,
  description TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ledger_customer ON customer_ledger(customer_id, created_at);

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id),
  movement_type stock_movement_type NOT NULL,
  quantity INTEGER NOT NULL,
  reference_id UUID,
  reason TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (quantity <> 0)
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, created_at);

CREATE TABLE IF NOT EXISTS supplier_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID REFERENCES suppliers(id),
  supplier_name_snapshot VARCHAR(255),
  supplier_gstin_snapshot VARCHAR(32),
  invoice_number VARCHAR(255),
  invoice_date DATE,
  document_hash VARCHAR(128) UNIQUE,
  total_amount NUMERIC(14,2),
  status supplier_delivery_status NOT NULL DEFAULT 'UPLOADED',
  uploaded_by UUID REFERENCES users(id),
  confirmed_by UUID REFERENCES users(id),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_invoice_key ON supplier_deliveries(supplier_id, invoice_number, invoice_date) WHERE supplier_id IS NOT NULL AND invoice_number IS NOT NULL AND invoice_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS uploaded_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_id UUID NOT NULL REFERENCES supplier_deliveries(id) ON DELETE CASCADE,
  original_filename VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(255) NOT NULL UNIQUE,
  mime_type VARCHAR(120) NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  sha256 VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_uploaded_documents_hash ON uploaded_documents(sha256);

CREATE TABLE IF NOT EXISTS ai_extractions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_id UUID NOT NULL REFERENCES supplier_deliveries(id) ON DELETE CASCADE,
  provider VARCHAR(64) NOT NULL,
  model VARCHAR(128),
  extracted_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_id UUID NOT NULL REFERENCES supplier_deliveries(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  raw_description VARCHAR(255) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  gst_rate NUMERIC(6,2) NOT NULL DEFAULT 0,
  confidence NUMERIC(5,4),
  match_source VARCHAR(32) NOT NULL DEFAULT 'MANUAL'
);
CREATE INDEX IF NOT EXISTS idx_delivery_items_delivery ON delivery_items(delivery_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id UUID REFERENCES users(id),
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(120) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO settings(key,value)
VALUES
 ('company', '{"businessName":"BHOWMICK AGENCY","address":"","phone":"","gstin":"","state":"West Bengal","stateCode":"19"}'),
 ('billing', '{"defaultCgstRate":0,"defaultSgstRate":0,"defaultIgstRate":0,"invoicePrefix":"","nextInvoiceNumber":1,"copiesPerInvoice":2}')
ON CONFLICT (key) DO NOTHING;
