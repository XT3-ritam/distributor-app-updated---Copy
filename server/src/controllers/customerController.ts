import { Request, Response } from 'express';
import pool from '../db/index.js';
import { CustomerSchema } from '../services/schemas.js';
import { AuthRequest } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

export class CustomerController {
  account = async (req: AuthRequest, res: Response) => {
    const customerId = String(req.params.id);
    const excludeOrderId = String(req.query.excludeOrderId ?? '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerId)) {
      return res.status(400).json({ error: 'Invalid customer ID.' });
    }
    if (excludeOrderId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(excludeOrderId)) {
      return res.status(400).json({ error: 'Invalid order ID.' });
    }

    const customer = await pool.query('SELECT id,store_name FROM customers WHERE id=$1', [customerId]);
    if (!customer.rows.length) return res.status(404).json({ error: 'Customer not found.' });
    if (excludeOrderId) {
      const order = await pool.query('SELECT id FROM orders WHERE id=$1 AND customer_id=$2', [excludeOrderId, customerId]);
      if (!order.rows.length) return res.status(404).json({ error: 'Order not found.' });
    }

    const params = [customerId, excludeOrderId || null];
    const balance = await pool.query(
      `SELECT COALESCE(SUM(signed_amount),0)::NUMERIC(14,2) AS balance
       FROM customer_ledger
       WHERE customer_id=$1
         AND NOT ($2::uuid IS NOT NULL AND transaction_type='SALE' AND reference_id=$2)`,
      params
    );
    const { rows } = await pool.query(
      `SELECT l.id,l.transaction_type,l.reference_id,l.amount,l.signed_amount,l.description,l.created_at,
              p.method AS payment_method,p.reference AS payment_reference,
              o.invoice_number,o.order_number
       FROM customer_ledger l
       LEFT JOIN payments p ON l.transaction_type='PAYMENT' AND p.id=l.reference_id
       LEFT JOIN orders o ON l.transaction_type='SALE' AND o.id=l.reference_id
       WHERE l.customer_id=$1
         AND NOT ($2::uuid IS NOT NULL AND l.transaction_type='SALE' AND l.reference_id=$2)
       ORDER BY l.created_at DESC
       LIMIT 300`,
      params
    );
    res.json({ customer: customer.rows[0], balance: balance.rows[0].balance, transactions: rows });
  };

  list = async (req: Request, res: Response) => {
    const q = String(req.query.q ?? '').trim();
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 30)));
    const offset = (page - 1) * limit;
    const like = `%${q.toLowerCase()}%`;
    const count = await pool.query('SELECT COUNT(*)::int AS count FROM customers WHERE active = TRUE AND (LOWER(store_name) LIKE $1 OR LOWER(COALESCE(phone,\'\')) LIKE $1)', [like]);
    const { rows } = await pool.query('SELECT * FROM customers WHERE active = TRUE AND (LOWER(store_name) LIKE $1 OR LOWER(COALESCE(phone,\'\')) LIKE $1) ORDER BY store_name LIMIT $2 OFFSET $3', [like, limit, offset]);
    res.json({ items: rows, page, limit, total: count.rows[0].count });
  };

  create = async (req: AuthRequest, res: Response) => {
    const parsed = CustomerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid customer details.', details: parsed.error.flatten() });
    const d = parsed.data;
    const { rows } = await pool.query('INSERT INTO customers(store_name,address,phone,gstin,state,state_code,pan,is_taxpayer,credit_limit,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *', [d.storeName,d.address??null,d.phone??null,d.gstin??null,d.state??null,d.stateCode??null,d.pan??null,d.isTaxpayer,d.creditLimit,d.active]);
    await audit(req.user?.id,'CUSTOMER_CREATED','CUSTOMER',rows[0].id,{storeName:rows[0].store_name,isTaxpayer:rows[0].is_taxpayer});
    res.status(201).json(rows[0]);
  };

  update = async (req: AuthRequest, res: Response) => {
    const parsed = CustomerSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid customer update.' });
    const map: Record<string,string> = { storeName:'store_name',address:'address',phone:'phone',gstin:'gstin',state:'state',stateCode:'state_code',pan:'pan',isTaxpayer:'is_taxpayer',creditLimit:'credit_limit',active:'active' };
    const keys = Object.keys(parsed.data);
    if (!keys.length) return res.status(400).json({ error: 'Nothing to update.' });
    const vals = keys.map(k => (parsed.data as any)[k] ?? null);
    const sets = keys.map((k,i) => `${map[k]} = $${i+1}`);
    vals.push(String(req.params.id));
    const { rows } = await pool.query(`UPDATE customers SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length} RETURNING *`, vals);
    if (!rows.length) return res.status(404).json({ error: 'Customer not found.' });
    await audit(req.user?.id,'CUSTOMER_UPDATED','CUSTOMER',String(req.params.id),parsed.data);
    res.json(rows[0]);
  };
}
