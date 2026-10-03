import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { SyncService } from '../services/syncService';
import './staff-order.css';

function displayQuantity(quantity: number) {
  return Number(quantity).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function productUnit(product: any) {
  return product.unit === 'PACKET' ? 'packets' : 'kg';
}

function sellUnitRate(item: any) {
  const weight = item.productUnit === 'PACKET' ? Number(item.packWeightKg) : 1;
  return Math.round(item.ratePerKg * weight * 100) / 100;
}

export function StaffNewOrder() {
  const navigate = useNavigate();
  const [cq, setCq] = useState('');
  const [pq, setPq] = useState('');
  const [customer, setCustomer] = useState<any>(null);
  const [cart, setCart] = useState<any[]>([]);
  const [msg, setMsg] = useState('');

  const customers = useQuery({
    queryKey: ['staff-customers', cq],
    queryFn: async () => {
      try {
        const data = await api.get('/customers', { params: { q: cq, limit: 30 } }).then((r) => r.data.items);
        SyncService.cache('customers', data);
        return data;
      } catch {
        return (SyncService.getCache<any[]>('customers') || [])
          .filter((c: any) => String(c.store_name).toLowerCase().includes(cq.toLowerCase()));
      }
    },
    enabled: cq.length >= 1,
    staleTime: 60000
  });

  const products = useQuery({
    queryKey: ['staff-products', pq],
    queryFn: async () => {
      try {
        const data = await api.get('/products', { params: { q: pq, limit: 40 } }).then((r) => r.data.items);
        SyncService.cache('products', data);
        return data;
      } catch {
        return SyncService.getCache<any[]>('products') || [];
      }
    },
    refetchInterval: 30000
  });

  useEffect(() => {
    if (products.data) SyncService.cache('products', products.data);
  }, [products.data]);

  useEffect(() => {
    if (customers.data) SyncService.cache('customers', customers.data);
  }, [customers.data]);

  function add(product: any) {
    const available = Number(product.stock_quantity);
    const existing = cart.find((item) => item.productId === product.id);
    const step = product.unit === 'PACKET' ? 1 : 0.5;
    if (available <= 0) {
      setMsg('Out of stock. This product is currently unavailable.');
      return;
    }
    if (existing) {
      if (existing.quantity + step > available) {
        setMsg(`Insufficient stock. Only ${displayQuantity(available)} ${productUnit(product)} are currently available.`);
        return;
      }
      setCart(cart.map((item) => item.productId === product.id ? { ...item, quantity: item.quantity + step } : item));
      return;
    }

    setCart([...cart, {
      productId: product.id,
      name: product.name,
      sku: product.sku,
      unit: productUnit(product),
      productUnit: product.unit === 'PACKET' ? 'PACKET' : 'KG',
      packWeightKg: Number(product.pack_weight_kg || 0),
      stockQuantity: available,
      quantity: product.unit === 'PACKET' ? Math.min(1, available) : Math.min(0.5, available),
      ratePerKg: Number(product.master_rate),
      discountPercent: 0,
      gstRate: Number(product.gst_rate)
    }]);
    setMsg('');
  }

  function update(id: string, patch: any) {
    setCart(cart.map((item) => item.productId === id ? { ...item, ...patch } : item));
  }

  const grossTotal = cart.reduce((sum, item) =>
    sum + Number(item.quantity || 0) * sellUnitRate(item), 0);
  const discountTotal = cart.reduce((sum, item) =>
    sum + Number(item.quantity || 0) * sellUnitRate(item) * Number(item.discountPercent || 0) / 100, 0);
  const taxableTotal = grossTotal - discountTotal;

  function resetOrderForm() {
    setCustomer(null);
    setCq('');
    setPq('');
    setCart([]);
  }

  async function submit() {
    if (!customer || !cart.length) return;
    if (cart.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0 || item.quantity > item.stockQuantity || (item.productUnit === 'PACKET' && !Number.isInteger(item.quantity)))) {
      setMsg('Enter a valid quantity: whole packets or kilograms up to available stock.');
      return;
    }
    if (cart.some((item) => !Number.isFinite(Number(item.discountPercent)) || Number(item.discountPercent) < 0 || Number(item.discountPercent) > 100)) {
      setMsg('Discount must be between 0% and 100%.');
      return;
    }

    const order = {
      customerId: customer.id,
      clientIdempotencyKey: crypto.randomUUID(),
      items: cart.map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity),
        ratePerKg: Number(item.ratePerKg),
        discountPercent: Number(item.discountPercent)
      }))
    };

    try {
      if (!navigator.onLine) {
        SyncService.saveOfflineOrder({ ...order, createdAt: new Date().toISOString() });
        resetOrderForm();
        setMsg('Saved offline. It will sync automatically when the connection returns.');
        return;
      }
      const response = await api.post('/orders', order);
      navigate(`/staff/order/${response.data.id}/payment`);
    } catch (error: any) {
      if (!navigator.onLine) {
        SyncService.saveOfflineOrder({ ...order, createdAt: new Date().toISOString() });
        resetOrderForm();
        setMsg('Connection lost. Order saved offline.');
      } else {
        setMsg(error.response?.data?.error || 'Could not submit order.');
      }
    }
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">FIELD ORDER</div>
          <h1>New order</h1>
          <p className="muted">Enter quantities in kilograms for loose products or whole packets for packaged products. Rates are per kilogram.</p>
        </div>
        <span className="pill neutral">{navigator.onLine ? 'ONLINE' : 'OFFLINE'}</span>
      </div>

      {msg && <div className="alert info">{msg}</div>}

      <div className="order-layout">
        <div className="panel">
          <h2>1. Select store</h2>
          {customer ? (
            <div className="selected-customer">
              <div>
                <b>{customer.store_name}</b>
                <span>{customer.is_taxpayer ? 'Tax payer' : 'Non tax payer'}{customer.phone ? ` • ${customer.phone}` : ''}</span>
              </div>
              <button className="btn ghost" onClick={() => setCustomer(null)}>Change</button>
            </div>
          ) : (
            <>
              <input className="search big" placeholder="Search store name" value={cq} onChange={(e) => setCq(e.target.value)} />
              <div className="result-list">
                {(customers.data || []).map((c: any) => (
                  <button key={c.id} onClick={() => { setCustomer(c); setCq(''); }}>
                    <b>{c.store_name}</b>
                    <span>{c.state || ''} {c.is_taxpayer ? '• Tax payer' : '• Non tax payer'}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <h2 className="mt">2. Add products</h2>
          <input className="search big" placeholder="Search product name" value={pq} onChange={(e) => setPq(e.target.value)} />
          <div className="product-list">
            {(products.data || []).map((product: any) => (
              <div className="product-row" key={product.id}>
                <div>
                  <b>{product.name}</b>
                  <span>GST {product.gst_rate}% • Stock {displayQuantity(product.stock_quantity)} {productUnit(product)} • ₹{Number(product.master_rate).toFixed(2)}/kg{product.unit === 'PACKET' ? ` • ₹${(Number(product.master_rate) * Number(product.pack_weight_kg)).toFixed(2)}/packet (${Number(product.pack_weight_kg) * 1000} g)` : ''}</span>
                </div>
                <button className="btn small" disabled={Number(product.stock_quantity) <= 0} onClick={() => add(product)}>Add</button>
              </div>
            ))}
          </div>
        </div>

        <div className="panel cart-panel">
          <h2>3. Review order</h2>
          {customer && (
            <div className="cart-customer">
              <b>{customer.store_name}</b>
              <span>{customer.is_taxpayer ? 'Tax payer' : 'Non tax payer'}</span>
            </div>
          )}
          {cart.length === 0 ? (
            <div className="empty">No products yet.</div>
          ) : (
            <div className="cart-list">
              {cart.map((item) => (
                <div className="cart-item" key={item.productId}>
                  <div>
                    <b>{item.name}</b>
                    <span>₹{item.ratePerKg.toFixed(2)}/kg • {item.productUnit === 'PACKET' ? `${Number(item.packWeightKg) * 1000} g packet at ₹${sellUnitRate(item).toFixed(2)}` : 'loose by kg'} • GST {item.gstRate}%</span>
                  </div>
                  <div className="cart-controls">
                    <label>
                      Quantity ({item.unit})
                      <input
                        aria-label={`Quantity in ${item.unit} for ${item.name}`}
                        type="number"
                        min={item.productUnit === 'PACKET' ? 1 : 0.001}
                        max={item.stockQuantity}
                        step={item.productUnit === 'PACKET' ? 1 : 0.001}
                        value={item.quantity}
                        onChange={(e) => update(item.productId, { quantity: e.target.value === '' ? '' : Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      Rate (₹/kg)
                      <input
                        aria-label={`Rate in rupees per kilogram for ${item.name}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.ratePerKg}
                        onChange={(e) => update(item.productId, { ratePerKg: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      Discount (%)
                      <input
                        aria-label={`Discount percentage for ${item.name}`}
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={item.discountPercent}
                        onChange={(e) => update(item.productId, { discountPercent: e.target.value === '' ? '' : Number(e.target.value) })}
                      />
                    </label>
                    <button className="icon-btn" aria-label={`Remove ${item.name} from order`} onClick={() => setCart(cart.filter((entry) => entry.productId !== item.productId))}>×</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="cart-total order-totals">
            <div><span>Subtotal</span><strong>₹{grossTotal.toFixed(2)}</strong></div>
            <div><span>Discount</span><strong>−₹{discountTotal.toFixed(2)}</strong></div>
            <div><span>Taxable value (before GST)</span><strong>₹{taxableTotal.toFixed(2)}</strong></div>
          </div>
          <button className="btn primary wide" disabled={!customer || !cart.length} onClick={submit}>Submit order</button>
          <p className="tiny muted">Discount is applied to this product line before GST. Packet selling prices are calculated from per-kg rate and packet weight.</p>
        </div>
      </div>
    </div>
  );
}
