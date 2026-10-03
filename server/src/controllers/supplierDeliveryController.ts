import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Request, Response } from 'express';
import pool from '../db/index.js';
import { AuthRequest } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { GeminiInvoiceService } from '../services/geminiInvoiceService.js';
import { SupplierConfirmSchema } from '../services/schemas.js';

const ai = new GeminiInvoiceService();
const uploadDir = path.resolve(process.env.UPLOAD_DIR || 'uploads');

export class SupplierDeliveryController {
  list = async (_req: AuthRequest, res: Response) => {
    const { rows } = await pool.query('SELECT sd.*,s.supplier_name FROM supplier_deliveries sd LEFT JOIN suppliers s ON s.id=sd.supplier_id ORDER BY sd.created_at DESC LIMIT 200');
    res.json(rows);
  };

  upload = async (req: AuthRequest, res: Response) => {
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: 'No bill uploaded.' });
    const allowed = new Set(['application/pdf','image/jpeg','image/png','image/webp']);
    if (!allowed.has(file.mimetype)) return res.status(400).json({ error: 'Only PDF/JPEG/PNG/WEBP files are allowed.' });
    if (file.size > 10 * 1024 * 1024) return res.status(400).json({ error: 'File is too large. Maximum 10 MB.' });
    const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await pool.query('SELECT id,status,invoice_number FROM supplier_deliveries WHERE document_hash=$1', [hash]);
    if (duplicate.rows.length) return res.status(409).json({ error: 'This supplier bill file has already been uploaded.', deliveryId: duplicate.rows[0].id });
    await fs.mkdir(uploadDir, { recursive:true });
    const stored = `${hash}-${Date.now()}.bin`;
    await fs.writeFile(path.join(uploadDir, stored), file.buffer);
    const catalog = (await pool.query('SELECT id,sku,name,brand,pack_size,pack_weight_kg,unit,master_rate,gst_rate,hsn_code FROM products WHERE active=TRUE ORDER BY name')).rows.map(p => ({...p,packWeightKg:p.pack_weight_kg===null?null:Number(p.pack_weight_kg),masterRate:Number(p.master_rate),gstRate:Number(p.gst_rate)}));
    let extracted;
    try { extracted = await ai.extractInvoice(file.buffer, file.mimetype, catalog); }
    catch (err) { await fs.unlink(path.join(uploadDir, stored)).catch(()=>{}); return res.status(502).json({ error:(err as Error).message }); }
    let supplierId: string|null = null;
    if (extracted.supplierName) {
      const s = await pool.query('SELECT id FROM suppliers WHERE LOWER(supplier_name)=LOWER($1) LIMIT 1', [extracted.supplierName]);
      supplierId = s.rows[0]?.id ?? null;
      if (!supplierId) {
        const created = await pool.query('INSERT INTO suppliers(supplier_name,gstin) VALUES($1,$2) RETURNING id', [extracted.supplierName, extracted.supplierGstin ?? null]);
        supplierId = created.rows[0].id;
      }
    }
    const { rows } = await pool.query(`INSERT INTO supplier_deliveries(supplier_id,supplier_name_snapshot,supplier_gstin_snapshot,invoice_number,invoice_date,total_amount,status,uploaded_by,document_hash) VALUES($1,$2,$3,$4,$5,$6,'REVIEW',$7,$8) RETURNING *`, [supplierId,extracted.supplierName,extracted.supplierGstin,extracted.invoiceNumber,extracted.invoiceDate,extracted.totalAmount,req.user!.id,hash]);
    await pool.query('INSERT INTO uploaded_documents(delivery_id,original_filename,stored_filename,mime_type,byte_size,sha256) VALUES($1,$2,$3,$4,$5,$6)', [rows[0].id,file.originalname,stored,file.mimetype,file.size,hash]);
    await pool.query('INSERT INTO ai_extractions(delivery_id,provider,model,extracted_json) VALUES($1,$2,$3,$4)', [rows[0].id,'Google Gemini',process.env.GEMINI_VISION_MODEL||'gemini-3.5-flash-lite',JSON.stringify(extracted)]);
    for (const item of extracted.items) await pool.query('INSERT INTO delivery_items(delivery_id,product_id,raw_description,quantity,unit_cost,total_cost,gst_rate,confidence,match_source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [rows[0].id,item.matchedProductId,item.rawDescription,item.quantity,item.unitCost,item.totalCost,item.gstRate,item.confidence,item.matchedProductId?'AI':'MANUAL']);
    await audit(req.user!.id,'SUPPLIER_BILL_UPLOADED','SUPPLIER_DELIVERY',rows[0].id,{file:file.originalname});
    res.status(201).json(await this.getDelivery(rows[0].id));
  };

  get = async (req: AuthRequest,res:Response) => { const d=await this.getDelivery(String(req.params.id)); if(!d)return res.status(404).json({error:'Delivery not found.'}); res.json(d); };

  document = async (_req: AuthRequest,res:Response) => {
    const d = await pool.query('SELECT ud.stored_filename,ud.mime_type FROM uploaded_documents ud WHERE ud.delivery_id=$1 ORDER BY ud.created_at LIMIT 1', [String(_req.params.id)]);
    if (!d.rows.length) return res.status(404).json({error:'Document not found.'});
    const filename = path.join(uploadDir, d.rows[0].stored_filename);
    res.setHeader('Content-Type', d.rows[0].mime_type); res.sendFile(path.resolve(filename));
  };

  private async getDelivery(id:string) {
    const d=await pool.query('SELECT sd.*,s.supplier_name,s.gstin AS supplier_gstin FROM supplier_deliveries sd LEFT JOIN suppliers s ON s.id=sd.supplier_id WHERE sd.id=$1',[id]);
    if(!d.rows.length)return null;
    const items=await pool.query('SELECT di.*,p.name AS matched_product_name,p.sku AS matched_sku,p.unit AS matched_product_unit,p.pack_weight_kg AS matched_pack_weight_kg FROM delivery_items di LEFT JOIN products p ON p.id=di.product_id WHERE di.delivery_id=$1 ORDER BY di.id',[id]);
    return {...d.rows[0],items:items.rows};
  }

  confirm = async (req:AuthRequest,res:Response) => {
    const parsed=SupplierConfirmSchema.safeParse(req.body); if(!parsed.success)return res.status(400).json({error:'Invalid delivery review.',details:parsed.error.flatten()});
    const d=parsed.data; const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const current=await client.query('SELECT * FROM supplier_deliveries WHERE id=$1 FOR UPDATE',[String(req.params.id)]);
      if(!current.rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'Delivery not found.'});}
      if(current.rows[0].status==='CONFIRMED'){await client.query('COMMIT');return res.status(409).json({error:'Delivery is already confirmed.'});}
      const duplicate=await client.query('SELECT id FROM supplier_deliveries WHERE id<>$1 AND supplier_id IS NOT DISTINCT FROM $2 AND invoice_number IS NOT DISTINCT FROM $3 AND invoice_date IS NOT DISTINCT FROM $4 AND invoice_number IS NOT NULL AND invoice_date IS NOT NULL',[String(req.params.id),current.rows[0].supplier_id,d.invoiceNumber??null,d.invoiceDate??null]);
      if(duplicate.rows.length){await client.query('ROLLBACK');return res.status(409).json({error:'A delivery with the same supplier/invoice/date already exists.',deliveryId:duplicate.rows[0].id});}
      for(const item of d.items){const check=await client.query('SELECT id,unit,pack_weight_kg FROM products WHERE id=$1 AND active=TRUE',[item.productId]);if(!check.rows.length)throw new Error('A reviewed product does not exist or is inactive.');if(check.rows[0].unit==='PACKET'&&(!check.rows[0].pack_weight_kg||Number(check.rows[0].pack_weight_kg)<=0))throw new Error('A packet product must have its packet weight configured before stock can be received.');if(check.rows[0].unit==='PACKET'&&!Number.isInteger(item.quantity))throw new Error('Packet stock must be a whole packet count.');}
      await client.query('DELETE FROM delivery_items WHERE delivery_id=$1',[String(req.params.id)]);
      for(const item of d.items){
        await client.query('UPDATE products SET stock_quantity=stock_quantity+$1,updated_at=NOW() WHERE id=$2',[item.quantity,item.productId]);
        await client.query("INSERT INTO stock_movements(product_id,movement_type,quantity,reference_id,reason,created_by) VALUES($1,'COMPANY_DELIVERY',$2,$3,$4,$5)",[item.productId,item.quantity,String(req.params.id),`Supplier invoice ${d.invoiceNumber??''}`.trim(),req.user!.id]);
        await client.query("INSERT INTO delivery_items(delivery_id,product_id,raw_description,quantity,unit_cost,total_cost,gst_rate,confidence,match_source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'OWNER_REVIEWED')",[String(req.params.id),item.productId,item.rawDescription,item.quantity,item.unitCost,item.totalCost,item.gstRate,item.confidence??null]);
      }
      await client.query("UPDATE supplier_deliveries SET supplier_name_snapshot=$1,supplier_gstin_snapshot=$2,invoice_number=$3,invoice_date=$4,total_amount=$5,status='CONFIRMED',confirmed_by=$6,confirmed_at=NOW(),updated_at=NOW() WHERE id=$7",[d.supplierName,d.supplierGstin??null,d.invoiceNumber??null,d.invoiceDate??null,d.totalAmount??null,req.user!.id,String(req.params.id)]);
      await client.query('COMMIT'); await audit(req.user!.id,'SUPPLIER_DELIVERY_CONFIRMED','SUPPLIER_DELIVERY',String(req.params.id),{items:d.items.length}); res.json({success:true});
    } catch(err){await client.query('ROLLBACK').catch(()=>{});res.status(400).json({error:(err as Error).message});} finally{client.release();}
  };
}
