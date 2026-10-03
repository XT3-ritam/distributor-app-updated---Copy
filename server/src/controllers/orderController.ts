import { Request, Response } from 'express';
import pool from '../db/index.js';
import { AuthRequest } from '../middleware/auth.js';
import { OrderSchema, OrderSettlementSchema } from '../services/schemas.js';
import { audit } from '../utils/audit.js';
import { amountInWords, calculateLine, round2, roundToRupee } from '../utils/billing.js';
import { calculateSellUnitRate } from '../utils/productPricing.js';
import { minimumPaymentForOutstanding } from '../utils/creditPolicy.js';
import { toPackingKilograms } from '../utils/packingQuantity.js';

export class OrderController {
  create = async (req: AuthRequest, res: Response) => {
    const parsed = OrderSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid order.', details: parsed.error.flatten() });
    const d = parsed.data;

    const existing = await pool.query('SELECT id, status FROM orders WHERE client_idempotency_key=$1', [d.clientIdempotencyKey]);
    if (existing.rows.length) {
      return res.status(200).json({ id: existing.rows[0].id, status: existing.rows[0].status, duplicate: true });
    }

    const customer = await pool.query('SELECT * FROM customers WHERE id=$1 AND active=TRUE', [d.customerId]);
    if (!customer.rows.length) return res.status(404).json({ error: 'Customer not found or inactive.' });
    const company = await pool.query("SELECT value FROM settings WHERE key='company'");
    const companyStateCode = company.rows[0]?.value?.stateCode ?? '19';
    const intraState = !customer.rows[0].state_code || String(customer.rows[0].state_code) === String(companyStateCode);

    const productIds = [...new Set(d.items.map(i => i.productId))];
    const products = await pool.query('SELECT * FROM products WHERE id = ANY($1::uuid[]) AND active=TRUE', [productIds]);
    if (products.rows.length !== productIds.length) return res.status(400).json({ error: 'One or more products are missing or inactive.' });
    const byId = new Map(products.rows.map(p => [p.id, p]));

    for (const item of d.items) {
      const product = byId.get(item.productId)!;
      if (String(product.unit).toUpperCase() === 'PACKET' && (!Number.isFinite(Number(product.pack_weight_kg)) || Number(product.pack_weight_kg) <= 0)) {
        return res.status(400).json({ error: `Packet weight is not configured for ${product.name}. Ask the owner to edit the product.` });
      }
      if (String(product.unit).toUpperCase() === 'PACKET' && !Number.isInteger(item.quantity)) {
        return res.status(400).json({ error: `Packet quantities for ${product.name} must be whole packets.` });
      }
    }

    const calculated = d.items.map(item => {
      const p = byId.get(item.productId)!;
      const ratePerKg = item.ratePerKg ?? Number(p.master_rate);
      const unitRate = calculateSellUnitRate(ratePerKg, String(p.unit), p.pack_weight_kg === null ? null : Number(p.pack_weight_kg));
      const line = calculateLine({ quantity:item.quantity, unitRate, gstRate:Number(p.gst_rate), discountPercent:item.discountPercent, intraState });
      return { item, p, unitRate, line };
    });
    const subtotal = round2(calculated.reduce((s,x) => s+x.line.itemValue,0));
    const discountTotal = round2(calculated.reduce((s,x) => s+x.line.discountAmount,0));
    const cgstTotal = round2(calculated.reduce((s,x) => s+x.line.cgstAmount,0));
    const sgstTotal = round2(calculated.reduce((s,x) => s+x.line.sgstAmount,0));
    const igstTotal = round2(calculated.reduce((s,x) => s+x.line.igstAmount,0));
    const exactGrandTotal = round2(calculated.reduce((s,x) => s+x.line.netPrice,0));
    const grandTotal = roundToRupee(exactGrandTotal);
    const roundOff = round2(grandTotal - exactGrandTotal);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const lockedCustomer = await client.query('SELECT id FROM customers WHERE id=$1 AND active=TRUE FOR UPDATE', [d.customerId]);
      if (!lockedCustomer.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Customer not found or inactive.' });
      }
      const balanceResult = await client.query(
        'SELECT COALESCE(SUM(signed_amount), 0)::NUMERIC(14,2) AS balance FROM customer_ledger WHERE customer_id=$1',
        [d.customerId]
      );
      const priorBalance = Math.max(Number(balanceResult.rows[0].balance), 0);
      const minimumPaymentDue = minimumPaymentForOutstanding(priorBalance);
      const order = await client.query(
        `INSERT INTO orders(customer_id,staff_id,status,sync_status,client_idempotency_key,subtotal,discount_total,cgst_total,sgst_total,igst_total,grand_total,round_off,prior_balance_snapshot,minimum_payment_due)
         VALUES($1,$2,'SUBMITTED','SYNCED',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [d.customerId, req.user!.id, d.clientIdempotencyKey, subtotal, discountTotal, cgstTotal, sgstTotal, igstTotal, grandTotal, roundOff, priorBalance, minimumPaymentDue]
      );
      for (const x of calculated) {
        await client.query(
          `INSERT INTO order_items(order_id,product_id,product_name_snapshot,sku_snapshot,hsn_snapshot,unit_snapshot,quantity,master_rate_snapshot,unit_rate,gst_rate_snapshot,discount_percent,item_value,discount_amount,taxable_value,cgst_amount,sgst_amount,igst_amount,net_rate,net_price,pack_weight_kg_snapshot)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
          [order.rows[0].id,x.p.id,x.p.name,x.p.sku,x.p.hsn_code,x.p.unit,x.item.quantity,x.p.master_rate,x.unitRate,x.p.gst_rate,x.item.discountPercent,x.line.itemValue,x.line.discountAmount,x.line.taxableValue,x.line.cgstAmount,x.line.sgstAmount,x.line.igstAmount,x.line.netRate,x.line.netPrice,x.p.pack_weight_kg]
        );
      }
      await client.query(
        `INSERT INTO customer_ledger(customer_id,transaction_type,reference_id,amount,signed_amount,description,created_by)
         VALUES($1,'SALE',$2,$3,$3,$4,$5)`,
        [d.customerId, order.rows[0].id, grandTotal, `Order ${order.rows[0].order_number}`, req.user!.id]
      );
      await client.query('COMMIT');
      await audit(req.user!.id,'ORDER_SUBMITTED','ORDER',order.rows[0].id,{customerId:d.customerId,items:d.items.length});
      res.status(201).json(order.rows[0]);
    } catch (err:any) {
      await client.query('ROLLBACK');
      if (err?.code === '23505' && err?.constraint === 'orders_client_idempotency_key_key') {
        const dup = await pool.query('SELECT id,status FROM orders WHERE client_idempotency_key=$1',[d.clientIdempotencyKey]);
        return res.status(200).json({ id: dup.rows[0]?.id, status: dup.rows[0]?.status, duplicate: true });
      }
      throw err;
    } finally { client.release(); }
  };

  list = async (req: AuthRequest, res: Response) => {
    const status = String(req.query.status ?? '').trim();
    const where: string[] = [];
    const params: any[] = [];
    if (status) { params.push(status); where.push(`o.status=$${params.length}`); }
    if (req.user?.role === 'STAFF') { params.push(req.user.id); where.push(`o.staff_id=$${params.length}`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await pool.query(`SELECT o.*, c.store_name, c.is_taxpayer, u.display_name AS staff_name FROM orders o JOIN customers c ON c.id=o.customer_id JOIN users u ON u.id=o.staff_id ${whereSql} ORDER BY o.created_at DESC LIMIT 300`, params);
    res.json(rows);
  };

  getOne = async (req: AuthRequest, res: Response) => {
    const params: any[] = [String(req.params.id)];
    const own = req.user?.role === 'STAFF' ? ' AND o.staff_id=$2' : '';
    if (own) params.push(req.user!.id);
    const order = await pool.query(`SELECT o.*, c.*, c.store_name AS customer_store_name, u.display_name AS staff_name FROM orders o JOIN customers c ON c.id=o.customer_id JOIN users u ON u.id=o.staff_id WHERE o.id=$1${own}`, params);
    if (!order.rows.length) return res.status(404).json({ error: 'Order not found.' });
    const items = await pool.query('SELECT * FROM order_items WHERE order_id=$1 ORDER BY id', [String(req.params.id)]);
    const payments = await pool.query('SELECT id,method,amount,reference,created_at FROM payments WHERE order_id=$1 ORDER BY created_at', [String(req.params.id)]);
    res.json({ ...order.rows[0], amount_in_words: amountInWords(Number(order.rows[0].grand_total)), items: items.rows, payments: payments.rows });
  };

  settle = async (req: AuthRequest, res: Response) => {
    const parsed = OrderSettlementSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payment details.', details: parsed.error.flatten() });
    const d = parsed.data;
    const paymentAmount = roundToRupee(d.amount);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const orderResult = await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [String(req.params.id)]);
      if (!orderResult.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Order not found.' });
      }
      const order = orderResult.rows[0];
      if (req.user?.role === 'STAFF' && order.staff_id !== req.user.id) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Order not found.' });
      }
      if (order.settlement_choice) {
        await client.query('COMMIT');
        return res.json({ order, duplicate: true });
      }
      if (!['SUBMITTED', 'APPROVED', 'PROCESSING', 'COMPLETED'].includes(order.status)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `Order payments cannot be recorded while the order is ${order.status}.` });
      }
      const customer = await client.query('SELECT id FROM customers WHERE id=$1 FOR UPDATE', [order.customer_id]);
      if (!customer.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Customer not found.' });
      }
      if (paymentAmount < Number(order.minimum_payment_due)) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Collect at least ₹${Number(order.minimum_payment_due).toFixed(2)} now. This is 20% of the customer's previous outstanding balance.`
        });
      }
      if (d.choice !== 'LEND' && paymentAmount <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Enter the amount received, or choose Lend.' });
      }
      if (d.choice === 'LEND' && paymentAmount > 0 && !d.collectionMethod) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Choose how the required previous-balance payment was collected.' });
      }

      if (paymentAmount > 0) {
        const method = d.choice === 'LEND' ? d.collectionMethod! : d.choice === 'QR' ? 'UPI' : d.choice;
        const payment = await client.query(
          `INSERT INTO payments(customer_id,order_id,method,amount,reference,notes,created_by)
           VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [order.customer_id, order.id, method, paymentAmount, d.reference ?? null, null, req.user!.id]
        );
        await client.query(
          `INSERT INTO customer_ledger(customer_id,transaction_type,reference_id,amount,signed_amount,description,created_by)
           VALUES($1,'PAYMENT',$2,$3,$4,$5,$6)`,
          [order.customer_id, payment.rows[0].id, paymentAmount, -paymentAmount, `Payment received for order ${order.order_number}`, req.user!.id]
        );
      }

      const updated = await client.query(
        'UPDATE orders SET settlement_choice=$1, updated_at=NOW() WHERE id=$2 RETURNING *',
        [d.choice, order.id]
      );
      await client.query('COMMIT');
      await audit(req.user!.id, 'ORDER_SETTLED', 'ORDER', order.id, { choice: d.choice, amount: paymentAmount });
      res.json({ order: updated.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  };

  approve = async (req: AuthRequest, res: Response) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const orderRes = await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [String(req.params.id)]);
      if (!orderRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error:'Order not found.' }); }
      const order = orderRes.rows[0];
      if (order.status === 'APPROVED' || order.status === 'COMPLETED') { await client.query('COMMIT'); return res.json(order); }
      if (order.status !== 'SUBMITTED') { await client.query('ROLLBACK'); return res.status(409).json({ error:`Order cannot be approved from status ${order.status}.` }); }

      const company = await client.query("SELECT value FROM settings WHERE key='company'");
      const billing = await client.query("SELECT value FROM settings WHERE key='billing' FOR UPDATE");
      const companyStateCode = company.rows[0]?.value?.stateCode ?? '19';
      const customer = await client.query('SELECT * FROM customers WHERE id=$1 FOR UPDATE', [order.customer_id]);
      const intraState = !customer.rows[0].state_code || String(customer.rows[0].state_code) === String(companyStateCode);
      const items = await client.query('SELECT oi.*, p.stock_quantity FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=$1 ORDER BY oi.id', [order.id]);
      for (const item of items.rows) {
        if (Number(item.quantity) > Number(item.stock_quantity)) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error:`Insufficient stock for ${item.product_name_snapshot}. Only ${item.stock_quantity} units are currently available.` });
        }
      }
      for (const item of items.rows) {
        const updated = await client.query('UPDATE products SET stock_quantity=stock_quantity-$1, updated_at=NOW() WHERE id=$2 AND stock_quantity >= $1 RETURNING id, stock_quantity', [item.quantity,item.product_id]);
        if (!updated.rows.length) throw new Error(`Stock changed for ${item.product_name_snapshot}; approval rolled back.`);
        await client.query('INSERT INTO stock_movements(product_id,movement_type,quantity,reference_id,reason,created_by) VALUES($1,\'SALE\',$2,$3,$4,$5)', [item.product_id,-Number(item.quantity),order.id,'Order sale',req.user!.id]);
      }
      const settings = billing.rows[0]?.value ?? { invoicePrefix:'', nextInvoiceNumber:1 };
      const invoiceNumber = `${settings.invoicePrefix ?? ''}${Number(settings.nextInvoiceNumber ?? 1)}`;
      settings.nextInvoiceNumber = Number(settings.nextInvoiceNumber ?? 1) + 1;
      await client.query("UPDATE settings SET value=$1, updated_by=$2, updated_at=NOW() WHERE key='billing'", [JSON.stringify(settings), req.user!.id]);
      const updated = await client.query(`UPDATE orders SET status='APPROVED', invoice_number=$1, approved_at=NOW(), updated_at=NOW() WHERE id=$2 RETURNING *`, [invoiceNumber,order.id]);
      await client.query("UPDATE customer_ledger SET description=$1 WHERE transaction_type='SALE' AND reference_id=$2", [`Invoice ${invoiceNumber}`, order.id]);
      await client.query('COMMIT');
      await audit(req.user!.id,'ORDER_APPROVED','ORDER',order.id,{invoiceNumber,intraState});
      res.json(updated.rows[0]);
    } catch (err) { await client.query('ROLLBACK').catch(()=>{}); throw err; } finally { client.release(); }
  };

  markPrinted = async (req: AuthRequest, res: Response) => {
    const ids = Array.isArray(req.body?.orderIds) ? req.body.orderIds : [];
    if (!ids.length || ids.length > 100) return res.status(400).json({ error:'Select 1-100 orders.' });
    const { rows } = await pool.query('UPDATE orders SET print_count=print_count+2, printed_at=NOW(), updated_at=NOW() WHERE id=ANY($1::uuid[]) AND status IN (\'APPROVED\',\'COMPLETED\') RETURNING id,invoice_number,print_count', [ids]);
    await audit(req.user?.id,'BILLS_PRINTED','ORDER',undefined,{orderIds:rows.map(r=>r.id),copiesPerInvoice:2});
    res.json(rows);
  };

  complete = async (req: AuthRequest, res: Response) => {
    const { rows } = await pool.query("UPDATE orders SET status='COMPLETED',completed_at=NOW(),delivered_at=COALESCE(delivered_at,NOW()),updated_at=NOW() WHERE id=$1 AND status='APPROVED' RETURNING *", [String(req.params.id)]);
    if (!rows.length) return res.status(409).json({ error:'Only approved orders can be completed.' });
    await audit(req.user?.id,'ORDER_COMPLETED','ORDER',String(req.params.id),{});
    res.json(rows[0]);
  };

  packingSummary = async (req: Request, res: Response) => {
    const ids = String(req.query.ids ?? '').split(',').map(s=>s.trim()).filter(Boolean).slice(0,100);
    if (!ids.length) return res.status(400).json({error:'No orders selected.'});
    const { rows } = await pool.query(
      `SELECT oi.product_id,oi.product_name_snapshot,oi.unit_snapshot,
              oi.pack_weight_kg_snapshot, SUM(oi.quantity)::NUMERIC AS quantity,
              ARRAY_AGG(DISTINCT o.invoice_number) FILTER (WHERE o.invoice_number IS NOT NULL) AS invoice_numbers
       FROM order_items oi
       JOIN orders o ON o.id=oi.order_id
       WHERE o.id=ANY($1::uuid[]) AND o.status IN ('APPROVED','COMPLETED')
       GROUP BY oi.product_id,oi.product_name_snapshot,oi.unit_snapshot,oi.pack_weight_kg_snapshot
       ORDER BY oi.product_name_snapshot`,
      [ids]
    );
    const items: {productName:string,unit:'KG',quantity:number}[] = [];
    const invoices = new Set<string>();
    for (const row of rows) {
      const packetUnit = String(row.unit_snapshot).toUpperCase() === 'PACKET';
      let quantity: number;
      try {
        quantity = toPackingKilograms(
          Number(row.quantity),
          row.unit_snapshot,
          row.pack_weight_kg_snapshot === null ? null : Number(row.pack_weight_kg_snapshot)
        );
      } catch (error) {
        return res.status(409).json({ error: error instanceof Error ? error.message : 'Could not convert packet quantity to kilograms.' });
      }
      items.push({ productName:row.product_name_snapshot, unit:'KG', quantity });
      for (const invoice of row.invoice_numbers || []) invoices.add(String(invoice));
    }
    res.json({invoices:[...invoices],items});
  };
}
