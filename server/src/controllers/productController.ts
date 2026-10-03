import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import pool from '../db/index.js';
import { ProductSchema, ProductUpdateSchema, StockAdjustSchema } from '../services/schemas.js';
import { AuthRequest } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

export class ProductController {
  list = async (req: Request, res: Response) => {
    const q = String(req.query.q ?? '').trim();
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 60)));
    const offset = (page - 1) * limit;
    const like = `%${q.toLowerCase()}%`;
    const count = await pool.query('SELECT COUNT(*)::int AS count FROM products WHERE active = TRUE AND (LOWER(name) LIKE $1 OR LOWER(sku) LIKE $1 OR LOWER(COALESCE(brand,\'\')) LIKE $1)', [like]);
    const { rows } = await pool.query('SELECT * FROM products WHERE active = TRUE AND (LOWER(name) LIKE $1 OR LOWER(sku) LIKE $1 OR LOWER(COALESCE(brand,\'\')) LIKE $1) ORDER BY name LIMIT $2 OFFSET $3', [like, limit, offset]);
    res.json({ items: rows, page, limit, total: count.rows[0].count });
  };

  create = async (req: AuthRequest, res: Response) => {
    const parsed = ProductSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid product details.', details: parsed.error.flatten() });
    const d = parsed.data;
    if (d.unit === 'PACKET' && !Number.isInteger(d.stockQuantity)) return res.status(400).json({ error: 'Opening stock for a packet product must be a whole packet count.' });
    try {
      const sku = d.sku ?? `AUTO-${randomUUID()}`;
      const { rows } = await pool.query('INSERT INTO products(sku,name,brand,pack_size,unit,pack_weight_kg,hsn_code,master_rate,gst_rate,stock_quantity,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *', [sku,d.name,d.brand??null,d.packSize??null,d.unit,d.packWeightKg,d.hsnCode??null,d.masterRate,d.gstRate,d.stockQuantity,d.active]);
      if (d.stockQuantity > 0) await pool.query('INSERT INTO stock_movements(product_id,movement_type,quantity,reason,created_by) VALUES($1,\'MANUAL_ADJUSTMENT\',$2,$3,$4)', [rows[0].id,d.stockQuantity,'Opening stock',req.user?.id]);
      await audit(req.user?.id,'PRODUCT_CREATED','PRODUCT',rows[0].id,{sku:rows[0].sku});
      res.status(201).json(rows[0]);
    } catch (err: any) {
      if (err?.code === '23505') return res.status(409).json({ error: 'SKU already exists.' });
      throw err;
    }
  };

  update = async (req: AuthRequest, res: Response) => {
    const parsed = ProductUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid product update.' });
    const current = await pool.query('SELECT * FROM products WHERE id=$1', [String(req.params.id)]);
    if (!current.rows.length) return res.status(404).json({ error: 'Product not found.' });
    const before = current.rows[0];
    const normalizedUnit = String(before.unit).toUpperCase();
    const isKilogramUnit = ['KG', 'KGS', 'KILOGRAM', 'KILOGRAMS'].includes(normalizedUnit);
    const isPacketUnit = ['PACKET', 'PACKETS', 'PCS', 'PIECE', 'PIECES'].includes(normalizedUnit);
    if (!isKilogramUnit && !isPacketUnit) {
      return res.status(409).json({ error: 'This legacy product has an unsupported stock unit. Do not edit it until its stock and sellable unit have been reviewed.' });
    }
    const currentProduct = {
      sku: before.sku,
      name: before.name,
      brand: before.brand,
      packSize: before.pack_size,
      unit: isPacketUnit ? 'PACKET' : 'KG',
      packWeightKg: before.pack_weight_kg === null ? null : Number(before.pack_weight_kg),
      hsnCode: before.hsn_code,
      masterRate: Number(before.master_rate),
      gstRate: Number(before.gst_rate),
      stockQuantity: Number(before.stock_quantity),
      active: before.active
    };
    const merged = ProductSchema.safeParse({ ...currentProduct, ...parsed.data });
    if (!merged.success) return res.status(400).json({ error: 'Invalid product update.', details: merged.error.flatten() });
    if (merged.data.unit === 'PACKET' && !Number.isInteger(merged.data.stockQuantity)) return res.status(400).json({ error: 'Stock for a packet product must be a whole packet count.' });
    if (parsed.data.unit && parsed.data.unit !== currentProduct.unit && Number(before.stock_quantity) > 0) {
      return res.status(409).json({ error: 'Stock must be zero before changing how this product is sold. Adjust the stock first to avoid changing the quantity meaning.' });
    }
    const map: Record<string,string> = { sku:'sku',name:'name',brand:'brand',packSize:'pack_size',unit:'unit',packWeightKg:'pack_weight_kg',hsnCode:'hsn_code',masterRate:'master_rate',gstRate:'gst_rate',stockQuantity:'stock_quantity',active:'active' };
    const keys = Object.keys(parsed.data);
    const vals = keys.map(k => (merged.data as any)[k] ?? null);
    const sets = keys.map((k,i) => `${map[k]}=$${i+1}`);
    vals.push(String(req.params.id));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`UPDATE products SET ${sets.join(', ')}, updated_at=NOW() WHERE id=$${vals.length} RETURNING *`, vals);
      if (!rows.length) throw new Error('Product not found');
      const after = rows[0];
      if (parsed.data.masterRate !== undefined && Number(before.master_rate) !== Number(after.master_rate)) {
        await client.query('INSERT INTO product_price_history(product_id,old_rate,new_rate,changed_by) VALUES($1,$2,$3,$4)', [after.id,before.master_rate,after.master_rate,req.user?.id]);
      }
      await client.query('COMMIT');
      await audit(req.user?.id,'PRODUCT_UPDATED','PRODUCT',String(req.params.id),parsed.data);
      res.json(after);
    } catch (err) {
      await client.query('ROLLBACK'); throw err;
    } finally { client.release(); }
  };

  adjustStock = async (req: AuthRequest, res: Response) => {
    const parsed = StockAdjustSchema.safeParse(req.body);
    if (!parsed.success || parsed.data.quantityDelta === 0) return res.status(400).json({ error: 'Invalid stock adjustment.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const p = await client.query('SELECT id,unit,stock_quantity FROM products WHERE id=$1 FOR UPDATE', [String(req.params.id)]);
      if (!p.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Product not found.' }); }
      if (p.rows[0].unit === 'PACKET' && !Number.isInteger(parsed.data.quantityDelta)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Packet stock adjustments must be a whole packet count.' });
      }
      const next = Number(p.rows[0].stock_quantity) + parsed.data.quantityDelta;
      if (next < 0) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Stock cannot become negative.' }); }
      const { rows } = await client.query('UPDATE products SET stock_quantity=$1,updated_at=NOW() WHERE id=$2 RETURNING *', [next,String(req.params.id)]);
      await client.query('INSERT INTO stock_movements(product_id,movement_type,quantity,reason,created_by) VALUES($1,\'MANUAL_ADJUSTMENT\',$2,$3,$4)', [String(req.params.id),parsed.data.quantityDelta,parsed.data.reason,req.user?.id]);
      await client.query('COMMIT');
      await audit(req.user?.id,'STOCK_ADJUSTED','PRODUCT',String(req.params.id),{quantityDelta:parsed.data.quantityDelta,reason:parsed.data.reason});
      res.json(rows[0]);
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
  };
}
