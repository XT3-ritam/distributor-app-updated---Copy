import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { isAxiosError } from 'axios';
import api from '../services/api';

export function OwnerInventory() {
  const qc = useQueryClient();
  const [adjusting, setAdjusting] = useState<any>(null);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const query = useQuery({
    queryKey: ['products', 'inventory'],
    queryFn: () => api.get('/products', { params: { limit: 100 } }).then((r) => r.data.items),
    refetchInterval: 10000
  });
  const adjustStock = useMutation({
    mutationFn: (data: { productId: string; quantityDelta: number; reason: string }) =>
      api.post(`/products/${data.productId}/stock-adjust`, { quantityDelta: data.quantityDelta, reason: data.reason }),
    onSuccess: () => {
      setAdjusting(null);
      setQuantity('');
      setReason('');
      setMessage('Stock updated.');
      qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error) => {
      setMessage(isAxiosError(error) ? error.response?.data?.error || error.message : 'Could not update stock.');
    }
  });

  function submitAdjustment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adjusting || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0 || !reason.trim()) return;
    adjustStock.mutate({
      productId: adjusting.id,
      quantityDelta: adjusting.direction === 'remove' ? -Number(quantity) : Number(quantity),
      reason: reason.trim()
    });
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">LIVE STOCK</div>
          <h1>Inventory</h1>
          <p className="muted">Loose stock is tracked in kilograms; fixed-size stock is tracked in whole packets. Adjustments are recorded in stock history.</p>
        </div>
      </div>
      {message && <div className={`alert ${adjustStock.isError ? 'danger' : 'info'}`}>{message}</div>}
      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Product</th><th>Stock</th><th>Selling rate (₹/kg)</th><th>Packet price</th><th>GST (%)</th><th></th></tr>
            </thead>
            <tbody>
              {(query.data || []).map((product: any) => (
                <tr key={product.id}>
                  <td><b>{product.name}</b><small>{product.brand || ''} {product.unit === 'PACKET' ? `${Number(product.pack_weight_kg) * 1000} g packet` : 'Loose product'}</small></td>
                  <td>
                    <span className={`pill ${Number(product.stock_quantity) <= 0 ? 'danger' : Number(product.stock_quantity) <= 5 ? 'warning' : 'success'}`}>
                      {Number(product.stock_quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })} {product.unit === 'PACKET' ? 'packets' : 'kg'}
                    </span>
                  </td>
                  <td>₹{Number(product.master_rate).toFixed(2)}</td>
                  <td>{product.unit === 'PACKET' ? `₹${(Number(product.master_rate) * Number(product.pack_weight_kg)).toFixed(2)}` : '—'}</td>
                  <td>{Number(product.gst_rate).toFixed(2)}%</td>
                  <td>
                    <button
                      className="btn small secondary"
                      onClick={() => {
                        adjustStock.reset();
                        setMessage('');
                        setQuantity('');
                        setReason('');
                        setAdjusting({ id: product.id, name: product.name, unit: product.unit, direction: 'add' });
                      }}
                    >
                      Adjust stock
                    </button>
                  </td>
                </tr>
              ))}
              {adjusting && (
                <tr>
                  <td colSpan={6}>
                    <form className="form-grid" onSubmit={submitAdjustment}>
                      <strong>{adjusting.name} — current stock adjustment</strong>
                      <label>
                        Adjustment
                        <select value={adjusting.direction} onChange={(e) => setAdjusting({ ...adjusting, direction: e.target.value })}>
                          <option value="add">Add stock</option>
                          <option value="remove">Remove stock</option>
                        </select>
                      </label>
                      <label>
                        Quantity ({adjusting.unit === 'PACKET' ? 'whole packets' : 'kg'})
                        <input
                          required
                          type="number"
                          min={adjusting.unit === 'PACKET' ? '1' : '0.001'}
                          step={adjusting.unit === 'PACKET' ? '1' : '0.001'}
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                        />
                      </label>
                      <label>
                        Reason
                        <input required maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Received stock" />
                      </label>
                      <div className="button-row">
                        <button className="btn primary" type="submit" disabled={adjustStock.isPending}>
                          {adjustStock.isPending ? 'Saving…' : 'Save adjustment'}
                        </button>
                        <button className="btn secondary" type="button" onClick={() => setAdjusting(null)}>Cancel</button>
                      </div>
                    </form>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
