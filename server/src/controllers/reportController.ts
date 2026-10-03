import { Request, Response } from 'express';
import pool from '../db/index.js';
import { workbookXml } from '../utils/excelXml.js';

function monthRange(month:string){ if(!/^\d{4}-\d{2}$/.test(month)) throw new Error('Month must be YYYY-MM.'); const start=`${month}-01`; const end=new Date(`${start}T00:00:00Z`); end.setUTCMonth(end.getUTCMonth()+1); return {start,end:end.toISOString().slice(0,10)}; }

export class ReportController {
  gstr1 = async (req: Request,res: Response)=>{
    try{ const month=String(req.query.month ?? new Date().toISOString().slice(0,7)); const {start,end}=monthRange(month); const {rows}=await pool.query(`SELECT o.invoice_number,o.created_at,o.approved_at,o.grand_total,o.subtotal,o.discount_total,o.cgst_total,o.sgst_total,o.igst_total,c.store_name,c.gstin,c.is_taxpayer,c.state,c.state_code,oi.sku_snapshot,oi.product_name_snapshot,oi.hsn_snapshot,oi.quantity,oi.unit_rate,oi.gst_rate_snapshot,oi.taxable_value,oi.cgst_amount,oi.sgst_amount,oi.igst_amount FROM orders o JOIN customers c ON c.id=o.customer_id JOIN order_items oi ON oi.order_id=o.id WHERE o.status IN ('APPROVED','COMPLETED') AND o.approved_at >= $1 AND o.approved_at < $2 ORDER BY o.approved_at,o.invoice_number,oi.id`,[start,end]);
      const headers=['Invoice No','Invoice Date','Store','GSTIN','Taxpayer','State','State Code','SKU','Product','HSN','Qty','Rate','GST %','Taxable','CGST','SGST','IGST','Invoice Total'];
      const makeRows=(records:any[])=>[headers,...records.map(r=>[r.invoice_number,r.approved_at?.toISOString?.().slice(0,10)??'',r.store_name,r.gstin??'',r.is_taxpayer?'YES':'NO',r.state??'',r.state_code??'',r.sku_snapshot,r.product_name_snapshot,r.hsn_snapshot??'',Number(r.quantity),Number(r.unit_rate),Number(r.gst_rate_snapshot),Number(r.taxable_value),Number(r.cgst_amount),Number(r.sgst_amount),Number(r.igst_amount),Number(r.grand_total)])];
      const taxpayers=rows.filter(r=>r.is_taxpayer); const non=rows.filter(r=>!r.is_taxpayer); const invoiceIds=new Set(rows.map(r=>r.invoice_number)); const completed=await pool.query(`SELECT COUNT(*)::int AS count FROM orders WHERE status='COMPLETED' AND delivered_at >= $1 AND delivered_at < $2`,[start,end]);
      const sheet3=[['MONTHLY BILL SUMMARY',month],['Total bills',invoiceIds.size],['Taxpayer bills',new Set(taxpayers.map(r=>r.invoice_number)).size],['Non-taxpayer bills',new Set(non.map(r=>r.invoice_number)).size],['Total outward line items',rows.length],['Completed company deliveries',completed.rows[0].count],['Note','Working report for accountant; verify against current GST return requirements before filing.'],[],['Selected month invoice detail']] ;
      const xml=workbookXml([{name:'Tax Payers',rows:makeRows(taxpayers)},{name:'Non Tax Payers',rows:makeRows(non)},{name:'Monthly Summary',rows:sheet3}]);
      res.setHeader('Content-Type','application/vnd.ms-excel; charset=utf-8'); res.setHeader('Content-Disposition',`attachment; filename="GSTR1-working-${month}.xls"`); res.send(xml);
    }catch(err){res.status(400).json({error:(err as Error).message});}
  };

  inward = async (req: Request,res: Response)=>{
    try{const month=String(req.query.month ?? new Date().toISOString().slice(0,7)); const {start,end}=monthRange(month); const {rows}=await pool.query(`SELECT sd.invoice_number,sd.invoice_date,sd.supplier_name_snapshot,sd.supplier_gstin_snapshot,sd.total_amount,di.raw_description,di.quantity,di.unit_cost,di.total_cost,di.gst_rate,p.name AS product_name,p.sku FROM supplier_deliveries sd JOIN delivery_items di ON di.delivery_id=sd.id LEFT JOIN products p ON p.id=di.product_id WHERE sd.status='CONFIRMED' AND COALESCE(sd.invoice_date, sd.created_at::date) >= $1 AND COALESCE(sd.invoice_date, sd.created_at::date) < $2 ORDER BY sd.invoice_date,sd.invoice_number,di.id`,[start,end]); const data=[['INWARD SUPPLIES / PURCHASE WORKING REPORT',month],['Invoice No','Invoice Date','Supplier','Supplier GSTIN','Total Bill','Product','SKU','Qty','Unit Cost','Line Total','GST %'],...rows.map(r=>[r.invoice_number??'',r.invoice_date??'',r.supplier_name_snapshot??'',r.supplier_gstin_snapshot??'',Number(r.total_amount??0),r.product_name??r.raw_description,r.sku??'',Number(r.quantity),Number(r.unit_cost),Number(r.total_cost),Number(r.gst_rate)])]; const xml=workbookXml([{name:'Inward Supplies',rows:data}]); res.setHeader('Content-Type','application/vnd.ms-excel; charset=utf-8'); res.setHeader('Content-Disposition',`attachment; filename="Inward-Supplies-${month}.xls"`); res.send(xml);
    }catch(err){res.status(400).json({error:(err as Error).message});}
  };
}
