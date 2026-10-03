import React from 'react';
import {BrowserRouter,Routes,Route,Navigate} from 'react-router-dom';
import {QueryClient,QueryClientProvider,useQuery} from '@tanstack/react-query';
import api from './services/api';
import {Login} from './pages/Login';
import {SetupOwner} from './pages/SetupOwner';
import {AppLayout} from './components/Layout';
import {OwnerDashboard} from './pages/OwnerDashboard';
import {OwnerOrders} from './pages/OwnerOrders';
import {OwnerOrderView} from './pages/OwnerOrderView';
import {OwnerCustomers} from './pages/OwnerCustomers';
import {OwnerProducts} from './pages/OwnerProducts';
import {OwnerInventory} from './pages/OwnerInventory';
import {OwnerSupplier} from './pages/OwnerSupplier';
import {OwnerPayments} from './pages/OwnerPayments';
import {OwnerReports} from './pages/OwnerReports';
import {OwnerSettings} from './pages/OwnerSettings';
import {OwnerStaff} from './pages/OwnerStaff';
import {StaffHome} from './pages/StaffHome';
import {StaffNewOrder} from './pages/StaffNewOrder';
import { StaffOrderPayment } from './pages/StaffOrderPayment';
import { StaffPayments } from './pages/StaffPayments';
import {PrintInvoices} from './pages/PrintInvoices';
import {PackingPrint} from './pages/PackingPrint';

const qc=new QueryClient();
function user(){try{return JSON.parse(localStorage.getItem('user')||'null')}catch{return null}}
function Gate({role,children}:{role:'OWNER'|'STAFF';children:React.ReactNode}){const u=user();return u?.role===role&&localStorage.getItem('token')?<>{children}</>:<Navigate to="/login"/>}
function StaffOrders(){const q=useQuery({queryKey:['my-orders'],queryFn:()=>api.get('/orders').then(r=>r.data),refetchInterval:15000});return <div className="page"><div className="page-heading"><div><div className="eyebrow">ORDERS</div><h1>My orders</h1><p className="muted">Your submitted orders appear here.</p></div></div><div className="panel table-wrap"><table><thead><tr><th>Order</th><th>Store</th><th>Status</th><th>Total</th></tr></thead><tbody>{(q.data||[]).map((o:any)=><tr key={o.id}><td>{o.invoice_number||`Order ${o.order_number}`}</td><td>{o.store_name}</td><td><span className="pill neutral">{o.status}</span></td><td>₹{Number(o.grand_total).toFixed(2)}</td></tr>)}</tbody></table></div></div>}
export default function App(){return <QueryClientProvider client={qc}><BrowserRouter><Routes><Route path="/login" element={<Login/>}/><Route path="/setup-owner" element={<SetupOwner/>}/><Route path="/owner" element={<Gate role="OWNER"><AppLayout role="OWNER"/></Gate>}><Route index element={<OwnerDashboard/>}/><Route path="orders" element={<OwnerOrders/>}/><Route path="order/:id" element={<OwnerOrderView/>}/><Route path="customers" element={<OwnerCustomers/>}/><Route path="products" element={<OwnerProducts/>}/><Route path="inventory" element={<OwnerInventory/>}/><Route path="supplier" element={<OwnerSupplier/>}/><Route path="payments" element={<OwnerPayments/>}/><Route path="reports" element={<OwnerReports/>}/><Route path="staff" element={<OwnerStaff/>}/><Route path="settings" element={<OwnerSettings/>}/></Route><Route path="/owner/print" element={<Gate role="OWNER"><PrintInvoices/></Gate>}/><Route path="/owner/packing" element={<Gate role="OWNER"><PackingPrint/></Gate>}/><Route path="/staff" element={<Gate role="STAFF"><AppLayout role="STAFF"/></Gate>}><Route index element={<StaffHome/>}/><Route path="order" element={<StaffNewOrder/>}/><Route path="order/:id/payment" element={<StaffOrderPayment/>}/><Route path="orders" element={<StaffOrders/>}/><Route path="payments" element={<StaffPayments/>}/></Route><Route path="*" element={<Navigate to="/login" replace/>}/></Routes></BrowserRouter></QueryClientProvider>}
