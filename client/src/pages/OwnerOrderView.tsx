import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import './owner-order-view.css';

function money(value: unknown) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function OrderSummary({ order }: { order: any }) {
  const tax = Number(order.cgst_total) + Number(order.sgst_total) + Number(order.igst_total);
  const taxable = Number(order.subtotal) - Number(order.discount_total);

  return (
    <aside className="order-summary">
      <h2>Order summary</h2>
      <div className="order-summary-row"><span>Subtotal</span><b>{money(order.subtotal)}</b></div>
      <div className="order-summary-row"><span>Discount</span><b>−{money(order.discount_total)}</b></div>
      <div className="order-summary-row"><span>Taxable value</span><b>{money(taxable)}</b></div>
      {Number(order.cgst_total) > 0 && <div className="order-summary-row"><span>CGST</span><b>{money(order.cgst_total)}</b></div>}
      {Number(order.sgst_total) > 0 && <div className="order-summary-row"><span>SGST</span><b>{money(order.sgst_total)}</b></div>}
      {Number(order.igst_total) > 0 && <div className="order-summary-row"><span>IGST</span><b>{money(order.igst_total)}</b></div>}
      <div className="order-summary-row"><span>Total tax</span><b>{money(tax)}</b></div>
      {Number(order.round_off) !== 0 && (
        <div className="order-summary-row">
          <span>Round off</span>
          <b>{Number(order.round_off) > 0 ? '+' : '−'}{money(Math.abs(Number(order.round_off)))}</b>
        </div>
      )}
      <div className="order-summary-total"><span>Grand total</span><strong>{money(order.grand_total)}</strong></div>
      {order.amount_in_words && <p className="order-amount-words">{order.amount_in_words}</p>}
    </aside>
  );
}

export function OwnerOrderView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const orderQuery = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get(`/orders/${id}`).then((response) => response.data),
    enabled: Boolean(id)
  });
  const approve = useMutation({
    mutationFn: () => api.post(`/orders/${id}/approve`),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['order', id] }),
        queryClient.invalidateQueries({ queryKey: ['orders'] })
      ]);
    }
  });

  if (orderQuery.isLoading) return <div className="page"><div className="panel">Loading order…</div></div>;
  if (orderQuery.isError || !orderQuery.data) {
    const message = isAxiosError(orderQuery.error)
      ? orderQuery.error.response?.data?.error || orderQuery.error.message
      : 'Could not load this order.';
    return <div className="page"><div className="alert danger">{message}</div><Link className="btn secondary" to="/owner/orders">Back to orders</Link></div>;
  }

  const order = orderQuery.data;
  const approved = ['APPROVED', 'COMPLETED'].includes(order.status);
  const orderDate = new Date(order.created_at).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="page owner-order-view">
      <div className="order-view-heading">
        <div>
          <div className="eyebrow">ORDER REVIEW</div>
          <h1>{order.invoice_number ? `Invoice ${order.invoice_number}` : `Order ${order.order_number}`}</h1>
          <p className="muted">{order.customer_store_name}</p>
        </div>
        <div className="order-view-actions">
          <span className={`pill ${approved ? 'success' : 'warning'}`}>{order.status}</span>
          {order.status === 'SUBMITTED' && (
            <button className="btn primary" onClick={() => approve.mutate()} disabled={approve.isPending}>
              {approve.isPending ? 'Approving…' : 'Approve & generate bill'}
            </button>
          )}
          {approved && <button className="btn primary" onClick={() => navigate(`/owner/print?ids=${id}`)}>Print 2 copies</button>}
          <Link className="btn secondary" to="/owner/orders">Back</Link>
        </div>
      </div>

      {approve.isError && (
        <div className="alert danger">
          {isAxiosError(approve.error)
            ? approve.error.response?.data?.error || approve.error.message
            : 'Could not approve order.'}
        </div>
      )}

      <section className="order-detail-grid">
        <div className="panel order-items-panel">
          <div className="order-section-heading">
            <div>
              <h2>Products</h2>
              <p className="muted">{order.items.length} line item{order.items.length === 1 ? '' : 's'} · Submitted {orderDate}</p>
            </div>
          </div>
          <div className="order-items-list">
            <div className="order-item-grid order-item-grid-heading" aria-hidden="true">
              <span>Product</span>
              <span>Qty</span>
              <span>Rate</span>
              <span>Disc.</span>
              <span>GST</span>
              <span className="numeric">Total</span>
            </div>
            {order.items.map((item: any) => (
              <article className="order-item-grid order-item-row" key={item.id}>
                <div className="order-item-cell product-cell" data-label="Product">
                  <strong>{item.product_name_snapshot}</strong>
                </div>
                <div className="order-item-cell" data-label="Qty">
                  {Number(item.quantity).toLocaleString('en-IN', { maximumFractionDigits: 3 })} {item.unit_snapshot || ''}
                </div>
                <div className="order-item-cell rate-cell" data-label="Rate">
                  <strong>{money(item.unit_rate)}/{item.unit_snapshot || 'unit'}</strong>
                  <small>{money(item.master_rate_snapshot)}/kg</small>
                </div>
                <div className="order-item-cell" data-label="Discount">
                  <strong>{Number(item.discount_percent).toFixed(2)}%</strong>
                  <small>{money(item.discount_amount)}</small>
                </div>
                <div className="order-item-cell" data-label="GST">
                  {Number(item.gst_rate_snapshot).toFixed(2)}%
                </div>
                <div className="order-item-cell numeric total-cell" data-label="Line total">
                  <strong>{money(item.net_price)}</strong>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="panel order-customer-panel">
          <div className="eyebrow">BILLED TO</div>
          <h2>{order.customer_store_name}</h2>
          {order.address && <p>{order.address}</p>}
          {order.phone && <p>{order.phone}</p>}
          {order.gstin && <p>GSTIN: {order.gstin}</p>}
          {(order.state || order.pan) && (
            <p>{order.state || ''}{order.state && order.pan ? ' · ' : ''}{order.pan ? `PAN: ${order.pan}` : ''}</p>
          )}
          <div className="order-staff-meta">
            <span>Salesperson</span>
            <strong>{order.staff_name || '—'}</strong>
          </div>
          <OrderSummary order={order} />
        </div>
      </section>
    </div>
  );
}
