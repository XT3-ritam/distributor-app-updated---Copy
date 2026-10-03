import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import { isAxiosError } from 'axios';
import api from '../services/api';

const blank = {
  name: '',
  brand: '',
  packSize: '',
  unit: 'KG',
  packWeightKg: null,
  masterRate: 0,
  gstRate: 5,
  stockQuantity: 0,
  active: true
};

export function OwnerProducts() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [f, setF] = useState<any>(blank);
  const [edit, setEdit] = useState<any>(null);
  const products = useQuery({
    queryKey: ['products', q],
    queryFn: () => api.get('/products', { params: { q, limit: 100 } }).then((r) => r.data.items),
    refetchInterval: 30000
  });
  const create = useMutation({
    mutationFn: () => api.post('/products', {
      ...f,
      packWeightKg: f.unit === 'PACKET' ? Number(f.packWeightGrams) / 1000 : null,
      packSize: f.unit === 'PACKET' ? `${f.packWeightGrams} g packet` : null
    }),
    onSuccess: () => {
      setF({ ...blank });
      qc.invalidateQueries({ queryKey: ['products'] });
    }
  });
  const update = useMutation({
    mutationFn: (data: any) => api.patch(`/products/${data.id}`, data),
    onSuccess: () => {
      setEdit(null);
      qc.invalidateQueries({ queryKey: ['products'] });
    }
  });

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">MASTER CATALOG</div>
          <h1>Products & rates</h1>
          <p className="muted">All selling rates are entered per kilogram. Packet prices are calculated from packet weight.</p>
        </div>
      </div>

      <div className="panel">
        <h2>Add product</h2>
        {create.isError && (
          <div className="alert danger">
            {isAxiosError(create.error)
              ? create.error.response?.data?.error || create.error.message
              : create.error instanceof Error ? create.error.message : 'Could not add product.'}
          </div>
        )}
        <form
          className="form-grid"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <label>
            Product name *
            <input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </label>
          <label>
            Brand
            <input value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} />
          </label>
          <label>
            How is this product sold?
            <select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value, packWeightGrams: e.target.value === 'PACKET' ? 500 : null })}>
              <option value="KG">Loose, by kilogram</option>
              <option value="PACKET">Fixed-weight packets</option>
            </select>
          </label>
          {f.unit === 'PACKET' && <label>
            Weight in each packet (grams) *
            <input required type="number" min="1" step="1" value={f.packWeightGrams ?? ''} onChange={(e) => setF({ ...f, packWeightGrams: Number(e.target.value) })} />
            <small className="muted">Create a separate product for each packet size.</small>
          </label>}
          <label>
            Selling rate (₹ per kg) *
            <input
              type="number"
              min="0"
              step="0.01"
              value={f.masterRate}
              onChange={(e) => setF({ ...f, masterRate: Number(e.target.value) })}
            />
          </label>
          <label>
            GST rate (%)
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={f.gstRate}
              onChange={(e) => setF({ ...f, gstRate: Number(e.target.value) })}
            />
          </label>
          <label>
            Opening stock ({f.unit === 'PACKET' ? 'whole packets' : 'kg'})
            <input
              type="number"
              min="0"
              step={f.unit === 'PACKET' ? '1' : '0.001'}
              value={f.stockQuantity}
              onChange={(e) => setF({ ...f, stockQuantity: Number(e.target.value) })}
            />
          </label>
          <button className="btn primary" disabled={create.isPending}>Add product</button>
        </form>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Product master</h2>
          <input className="search" aria-label="Search products" placeholder="Search product, SKU or brand" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {update.isError && (
          <div className="alert danger">
            {isAxiosError(update.error)
              ? update.error.response?.data?.error || update.error.message
              : update.error instanceof Error ? update.error.message : 'Could not update product.'}
          </div>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Selling rate (₹/kg)</th>
                <th>GST rate (%)</th>
                <th>Stock (sellable unit)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(products.data || []).map((p: any) => edit?.id === p.id ? (
                <tr key={p.id}>
                  <td>
                    <input aria-label="Product name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                    <input aria-label="Brand" placeholder="Brand" value={edit.brand} onChange={(e) => setEdit({ ...edit, brand: e.target.value })} />
                    <select aria-label="How product is sold" value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value, packWeightGrams: e.target.value === 'PACKET' ? edit.packWeightGrams || 500 : null })}>
                      <option value="KG">Loose, by kilogram</option>
                      <option value="PACKET">Fixed-weight packets</option>
                    </select>
                    {edit.unit === 'PACKET' && <input aria-label="Packet weight in grams" type="number" min="1" step="1" placeholder="Packet weight (grams)" value={edit.packWeightGrams ?? ''} onChange={(e) => setEdit({ ...edit, packWeightGrams: Number(e.target.value) })} />}
                  </td>
                  <td><input aria-label="Selling rate in rupees per kilogram" type="number" min="0" step="0.01" value={edit.masterRate} onChange={(e) => setEdit({ ...edit, masterRate: Number(e.target.value) })} /></td>
                  <td><input aria-label="GST rate percentage" type="number" min="0" max="100" step="0.01" value={edit.gstRate} onChange={(e) => setEdit({ ...edit, gstRate: Number(e.target.value) })} /></td>
                  <td>{Number(p.stock_quantity).toLocaleString(undefined, { maximumFractionDigits: 3 })} {p.unit === 'PACKET' ? 'packets' : 'kg'}</td>
                  <td>
                    <div className="button-row">
                      <button className="btn small" onClick={() => update.mutate({ ...edit, packWeightKg: edit.unit === 'PACKET' ? Number(edit.packWeightGrams) / 1000 : null, packSize: edit.unit === 'PACKET' ? `${edit.packWeightGrams} g packet` : null })}>Save</button>
                      <button className="btn small secondary" onClick={() => setEdit(null)}>Cancel</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={p.id}>
                  <td><b>{p.name}</b><small>{p.brand || ''} {p.unit === 'PACKET' ? `${Number(p.pack_weight_kg) * 1000} g packet` : 'Loose · kg'}</small></td>
                  <td>₹{Number(p.master_rate).toFixed(2)}/kg{p.unit === 'PACKET' ? <small>₹{(Number(p.master_rate) * Number(p.pack_weight_kg)).toFixed(2)} per packet</small> : null}</td>
                  <td>{Number(p.gst_rate).toFixed(2)}%</td>
                  <td><span className={`pill ${Number(p.stock_quantity) === 0 ? 'danger' : 'success'}`}>{Number(p.stock_quantity) === 0 ? 'OUT OF STOCK' : `${p.stock_quantity} ${p.unit === 'PACKET' ? 'packets' : 'kg'}`}</span></td>
                  <td>
                    <div className="button-row">
                      <button className="btn small" onClick={() => setEdit({ id: p.id, name: p.name, brand: p.brand || '', packSize: p.pack_size || '', unit: p.unit === 'PACKET' ? 'PACKET' : 'KG', packWeightGrams: p.pack_weight_kg ? Number(p.pack_weight_kg) * 1000 : null, masterRate: Number(p.master_rate), gstRate: Number(p.gst_rate), active: p.active })}>Edit product</button>
                      <button
                        className="btn small secondary"
                        disabled={update.isPending}
                        onClick={() => {
                          if (window.confirm(`Remove ${p.name} from the active product list? Past orders and invoices will be kept.`)) {
                            update.mutate({ id: p.id, active: false });
                          }
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
