import { Response } from 'express';
import pool from '../db/index.js';
import { AuthRequest } from '../middleware/auth.js';
import { PaymentSchema } from '../services/schemas.js';
import { audit } from '../utils/audit.js';
import { roundToRupee } from '../utils/billing.js';

export class PaymentController {
  list = async (req: AuthRequest, res: Response) => {
    const { rows } = await pool.query(`SELECT p.*,c.store_name,o.invoice_number,u.display_name AS created_by_name FROM payments p JOIN customers c ON c.id=p.customer_id LEFT JOIN orders o ON o.id=p.order_id JOIN users u ON u.id=p.created_by ORDER BY p.created_at DESC LIMIT 300`);
    res.json(rows);
  };

  create = async (req: AuthRequest, res: Response) => {
    const parsed = PaymentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({error:'Invalid payment.'});
    const d=parsed.data;
    if (req.user?.role === 'STAFF' && d.orderId) {
      return res.status(400).json({error:'Staff should record order payments from the order payment page.'});
    }
    const amount=roundToRupee(d.amount);
    if (amount <= 0) return res.status(400).json({error:'Payment must round to at least ₹1.'});
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const customer=await client.query('SELECT id FROM customers WHERE id=$1 AND active=TRUE FOR UPDATE',[d.customerId]);
      if(!customer.rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'Customer not found.'});}
      const payment=await client.query('INSERT INTO payments(customer_id,order_id,method,amount,reference,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[d.customerId,d.orderId??null,d.method,amount,d.reference??null,d.notes??null,req.user!.id]);
      await client.query("INSERT INTO customer_ledger(customer_id,transaction_type,reference_id,amount,signed_amount,description,created_by) VALUES($1,'PAYMENT',$2,$3,$4,$5,$6)",[d.customerId,payment.rows[0].id,amount,-amount,'Payment received',req.user!.id]);
      await client.query('COMMIT');
      await audit(req.user!.id,'PAYMENT_CREATED','PAYMENT',payment.rows[0].id,{amount,method:d.method,customerId:d.customerId});
      res.status(201).json(payment.rows[0]);
    } catch(err){await client.query('ROLLBACK').catch(()=>{});throw err;}finally{client.release();}
  };
}
