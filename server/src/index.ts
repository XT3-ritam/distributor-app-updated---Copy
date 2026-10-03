import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import multer from 'multer';
import { AuthController } from './controllers/authController.js';
import { StaffController } from './controllers/staffController.js';
import { CustomerController } from './controllers/customerController.js';
import { ProductController } from './controllers/productController.js';
import { OrderController } from './controllers/orderController.js';
import { PaymentController } from './controllers/paymentController.js';
import { SupplierDeliveryController } from './controllers/supplierDeliveryController.js';
import { ReportController } from './controllers/reportController.js';
import { SettingsController } from './controllers/settingsController.js';
import { authenticate, authorize } from './middleware/auth.js';
import type { ErrorRequestHandler } from 'express';

const app=express();
const port=Number(process.env.PORT||3000);
const allowedOrigin=process.env.CORS_ORIGIN||'http://localhost:5173';
app.use(cors({origin:allowedOrigin.split(',').map(s=>s.trim()),credentials:false}));
app.use(express.json({limit:'1mb'}));
app.disable('x-powered-by');
app.use((_req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');next();});

const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1},fileFilter:(_req,file,cb)=>cb(null,['application/pdf','image/jpeg','image/png','image/webp'].includes(file.mimetype))});
const auth=new AuthController(); const staff=new StaffController(); const customers=new CustomerController(); const products=new ProductController(); const orders=new OrderController(); const payments=new PaymentController(); const supplier=new SupplierDeliveryController(); const reports=new ReportController(); const settings=new SettingsController();

app.get('/api/health',(_req,res)=>res.json({status:'ok'}));
app.post('/api/auth/login',auth.login);
app.post('/api/auth/setup-owner',auth.setupOwner);
app.get('/api/auth/me',authenticate,(req:any,res)=>res.json(req.user));

app.get('/api/staff',authenticate,authorize(['OWNER']),staff.list);
app.post('/api/staff',authenticate,authorize(['OWNER']),staff.create);
app.patch('/api/staff/:id',authenticate,authorize(['OWNER']),staff.update);

app.get('/api/customers',authenticate,customers.list);
app.get('/api/customers/:id/account',authenticate,customers.account);
app.post('/api/customers',authenticate,authorize(['OWNER']),customers.create);
app.patch('/api/customers/:id',authenticate,authorize(['OWNER']),customers.update);

app.get('/api/products',authenticate,products.list);
app.post('/api/products',authenticate,authorize(['OWNER']),products.create);
app.patch('/api/products/:id',authenticate,authorize(['OWNER']),products.update);
app.post('/api/products/:id/stock-adjust',authenticate,authorize(['OWNER']),products.adjustStock);

app.post('/api/orders',authenticate,orders.create);
app.get('/api/orders',authenticate,orders.list);
app.get('/api/orders/packing-summary',authenticate,authorize(['OWNER']),orders.packingSummary);
app.get('/api/orders/:id',authenticate,orders.getOne);
app.post('/api/orders/:id/settle',authenticate,orders.settle);
app.post('/api/orders/:id/approve',authenticate,authorize(['OWNER']),orders.approve);
app.post('/api/orders/mark-printed',authenticate,authorize(['OWNER']),orders.markPrinted);
app.post('/api/orders/:id/complete',authenticate,authorize(['OWNER']),orders.complete);

app.get('/api/payments',authenticate,authorize(['OWNER']),payments.list);
app.post('/api/payments',authenticate,authorize(['OWNER','STAFF']),payments.create);

app.get('/api/supplier/deliveries',authenticate,authorize(['OWNER']),supplier.list);
app.post('/api/supplier/deliveries/upload',authenticate,authorize(['OWNER']),upload.single('bill'),supplier.upload);
app.get('/api/supplier/deliveries/:id',authenticate,authorize(['OWNER']),supplier.get);
app.get('/api/supplier/deliveries/:id/document',authenticate,authorize(['OWNER']),supplier.document);
app.post('/api/supplier/deliveries/:id/confirm',authenticate,authorize(['OWNER']),supplier.confirm);

app.get('/api/reports/gstr1',authenticate,authorize(['OWNER']),reports.gstr1);
app.get('/api/reports/inward',authenticate,authorize(['OWNER']),reports.inward);
app.get('/api/settings',authenticate,authorize(['OWNER']),settings.get);
app.put('/api/settings',authenticate,authorize(['OWNER']),settings.update);

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve(process.cwd(), '../client/dist');
  app.use(express.static(clientDist));
  app.get('/{*path}', (_req, res, next) => {
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

const errorHandler:ErrorRequestHandler=(err,_req,res,_next)=>{if(err instanceof multer.MulterError)return res.status(400).json({error:`Upload error: ${err.message}`});console.error(err);res.status(500).json({error:'Internal server error.'});};
app.use(errorHandler);

if(process.env.NODE_ENV!=='test'){app.listen(port,()=>console.log(`Distributor server listening on port ${port}`));}
export default app;
