import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import api from '../services/api';

function unitLabel(product: any) {
  return product?.unit === 'PACKET' ? 'packets' : 'kg';
}

export function OwnerSupplier() {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [review, setReview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [docUrl, setDocUrl] = useState('');
  const list = useQuery({ queryKey: ['deliveries'], queryFn: () => api.get('/supplier/deliveries').then((r) => r.data) });
  const products = useQuery({ queryKey: ['products', 'supplier-review'], queryFn: () => api.get('/products', { params: { limit: 100 } }).then((r) => r.data.items) });

  useEffect(() => {
    if (!review) return;
    let url = '';
    api.get(`/supplier/deliveries/${review.id}/document`, { responseType: 'blob' }).then((r) => {
      url = URL.createObjectURL(r.data);
      setDocUrl(url);
    }).catch(() => setDocUrl(''));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [review]);

  async function upload() {
    if (!file) return;
    const form = new FormData();
    form.append('bill', file);
    setBusy(true);
    try {
      const { data } = await api.post('/supplier/deliveries/upload', form);
      setReview(data);
    } catch (error: any) {
      alert(error.response?.data?.error || 'AI processing failed');
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!review) return;
    try {
      await api.post(`/supplier/deliveries/${review.id}/confirm`, {
        supplierName: review.supplier_name_snapshot,
        supplierGstin: review.supplier_gstin_snapshot,
        invoiceNumber: review.invoice_number,
        invoiceDate: review.invoice_date,
        totalAmount: Number(review.total_amount || 0),
        items: review.items.map((item: any) => ({
          productId: item.product_id,
          rawDescription: item.raw_description,
          quantity: Number(item.quantity),
          unitCost: Number(item.unit_cost),
          totalCost: Number(item.total_cost),
          gstRate: Number(item.gst_rate),
          confidence: item.confidence == null ? null : Number(item.confidence)
        }))
      });
      setReview(null);
      setFile(null);
      qc.invalidateQueries({ queryKey: ['deliveries'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      alert('Delivery confirmed and stock updated.');
    } catch (error: any) {
      const details = error.response?.data?.details?.fieldErrors;
      const fieldErrors = details
        ? Object.entries(details).flatMap(([field, messages]) => (messages as string[]).map((message) => `${field}: ${message}`))
        : [];
      alert([error.response?.data?.error || 'Confirmation failed', ...fieldErrors].join('\n'));
    }
  }

  function updateItem(index: number, patch: any) {
    setReview({ ...review, items: review.items.map((item: any, i: number) => i === index ? { ...item, ...patch } : item) });
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">INBOUND STOCK</div>
          <h1>Company deliveries</h1>
          <p className="muted">AI reads the supplier bill. Review product matches and quantities before stock changes.</p>
        </div>
      </div>
      {!review ? (
        <div className="panel upload-panel">
          <div className="upload-icon">AI</div>
          <h2>Scan supplier bill</h2>
          <p className="muted">PDF, JPG, PNG or WEBP up to 10 MB.</p>
          <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button className="btn primary" disabled={!file || busy} onClick={upload}>{busy ? 'Reading bill…' : 'Upload & identify products'}</button>
        </div>
      ) : (
        <div className="panel">
          <div className="panel-head">
            <div><h2>Owner review</h2><p className="muted">Correct supplier details, matches, quantities and costs before confirming.</p></div>
            <span className="pill warning">REVIEW REQUIRED</span>
          </div>
          <div className="review-layout">
            <div>{docUrl ? <iframe title="Supplier bill" src={docUrl} className="doc-frame" /> : <div className="empty">Loading document…</div>}</div>
            <div>
              <div className="form-grid">
                <input value={review.supplier_name_snapshot || ''} onChange={(e) => setReview({ ...review, supplier_name_snapshot: e.target.value })} placeholder="Supplier" />
                <input value={review.invoice_number || ''} onChange={(e) => setReview({ ...review, invoice_number: e.target.value })} placeholder="Invoice no" />
                <input value={review.invoice_date || ''} onChange={(e) => setReview({ ...review, invoice_date: e.target.value })} placeholder="Invoice date" />
                <input type="number" value={review.total_amount || 0} onChange={(e) => setReview({ ...review, total_amount: Number(e.target.value) })} placeholder="Total amount" />
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Bill description</th><th>Product</th><th>Qty (sellable unit)</th><th>Unit cost (₹)</th><th>Total cost (₹)</th><th>GST</th><th>Confidence</th></tr></thead>
                  <tbody>{review.items.map((item: any, index: number) => {
                    const product = (products.data || []).find((candidate: any) => candidate.id === item.product_id);
                    const packet = product?.unit === 'PACKET';
                    return (
                      <tr key={index}>
                        <td>{item.raw_description}</td>
                        <td>
                          <select value={item.product_id || ''} onChange={(e) => {
                            const selected = (products.data || []).find((candidate: any) => candidate.id === e.target.value);
                            updateItem(index, { product_id: e.target.value || null, matched_product_name: selected?.name || '', matched_sku: selected?.sku || '' });
                          }}>
                            <option value="">Select existing product</option>
                            {(products.data || []).map((candidate: any) => <option key={candidate.id} value={candidate.id}>{candidate.name} • {candidate.unit === 'PACKET' ? `${Number(candidate.pack_weight_kg) * 1000} g packet` : 'loose kg'}</option>)}
                          </select>
                        </td>
                        <td><input aria-label={`Delivery quantity in ${unitLabel(product)}`} type="number" min={packet ? 1 : 0.001} step={packet ? 1 : 0.001} value={item.quantity} onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })} /></td>
                        <td><input aria-label={`Unit cost per ${packet ? 'packet' : 'kg'}`} type="number" min="0" step="0.01" value={item.unit_cost ?? ''} onChange={(e) => updateItem(index, { unit_cost: e.target.value === '' ? null : Number(e.target.value) })} /><small>{packet ? 'per packet' : 'per kg'}</small></td>
                        <td><input aria-label="Supplier invoice line total cost" type="number" min="0" step="0.01" value={item.total_cost ?? ''} onChange={(e) => updateItem(index, { total_cost: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                        <td><input type="number" min="0" max="100" step="0.01" value={item.gst_rate} onChange={(e) => updateItem(index, { gst_rate: Number(e.target.value) })} /></td>
                        <td>{Math.round(Number(item.confidence || 0) * 100)}%</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
              <div className="button-row">
                <button className="btn primary" onClick={confirm} disabled={review.items.some((item: any) => !item.product_id || item.unit_cost === null || item.unit_cost === undefined || item.total_cost === null || item.total_cost === undefined)}>Confirm delivery & update stock</button>
                <button className="btn secondary" onClick={() => setReview(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="panel">
        <div className="panel-head"><h2>Recent deliveries</h2></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Supplier</th><th>Invoice</th><th>Date</th><th>Status</th><th>Total</th></tr></thead>
            <tbody>{(list.data || []).map((delivery: any) => (
              <tr key={delivery.id}>
                <td>{delivery.supplier_name_snapshot || delivery.supplier_name}</td>
                <td>{delivery.invoice_number || '—'}</td>
                <td>{delivery.invoice_date || '—'}</td>
                <td><span className={`pill ${delivery.status === 'CONFIRMED' ? 'success' : 'warning'}`}>{delivery.status}</span></td>
                <td>₹{Number(delivery.total_amount || 0).toFixed(2)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
