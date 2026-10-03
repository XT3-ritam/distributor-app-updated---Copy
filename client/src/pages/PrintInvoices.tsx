import { useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import api from '../services/api';
import './print.css';

function money(value: unknown) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function InvoiceCopy({ order, company, copy }: { order: any; company: any; copy: number }) {
  const intraState = Number(order.igst_total) === 0;
  const showHsn = order.items.some((item: any) => item.hsn_snapshot);
  const date = order.approved_at
    ? new Date(order.approved_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';
  const totalTax = Number(order.cgst_total) + Number(order.sgst_total) + Number(order.igst_total);

  return (
    <article className="invoice-copy">
      <header className="invoice-top">
        <div className="invoice-company">
          <h1>{company.businessName || 'BHOWMICK AGENCY'}</h1>
          {company.address && <div>{company.address}</div>}
          {company.phone && <div>Phone: {company.phone}</div>}
          {company.gstin && <div>GSTIN: {company.gstin}</div>}
          {(company.state || company.stateCode) && (
            <div>
              {company.state && `State: ${company.state}`}
              {company.state && company.stateCode && ' · '}
              {company.stateCode && `Code: ${company.stateCode}`}
            </div>
          )}
        </div>
        <div className="invoice-title">
          <h2>TAX INVOICE</h2>
        </div>
      </header>

      <section className="invoice-meta">
        <div className="invoice-customer">
          <h3>Bill to</h3>
          <strong>{order.customer_store_name}</strong>
          {order.address && <div>{order.address}</div>}
          {order.phone && <div>Phone: {order.phone}</div>}
          {order.gstin && <div>GSTIN: {order.gstin}</div>}
          {(order.state || order.pan) && (
            <div>
              {order.state && `State: ${order.state}`}
              {order.state && order.pan && ' · '}
              {order.pan && `PAN: ${order.pan}`}
            </div>
          )}
        </div>
        <div className="invoice-details">
          <h3>Invoice details</h3>
          <div><b>Invoice no.:</b> {order.invoice_number || '—'}</div>
          <div><b>Date:</b> {date || '—'}</div>
          <div><b>Salesperson:</b> {order.staff_name || '—'}</div>
        </div>
      </section>

      <table className={`invoice-table ${showHsn ? 'has-hsn' : ''}`}>
        <thead>
          <tr>
            <th className="col-number">#</th>
            <th className="col-product">Product</th>
            {showHsn && <th>HSN</th>}
            <th>Qty</th>
            <th>Unit</th>
            <th>Rate</th>
            <th>Value</th>
            <th>Disc. %</th>
            <th>Discount</th>
            <th>Taxable</th>
            {intraState ? (
              <>
                <th>CGST %</th>
                <th>CGST</th>
                <th>SGST %</th>
                <th>SGST</th>
              </>
            ) : (
              <>
                <th>IGST %</th>
                <th>IGST</th>
              </>
            )}
            <th>Net rate</th>
            <th>Net price</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item: any, index: number) => (
            <tr key={item.id}>
              <td>{index + 1}</td>
              <td className="left">{item.product_name_snapshot}</td>
              {showHsn && <td>{item.hsn_snapshot || '—'}</td>}
              <td>{Number(item.quantity).toLocaleString('en-IN', { maximumFractionDigits: 3 })}</td>
              <td>{item.unit_snapshot || '—'}</td>
              <td>{money(item.unit_rate)}</td>
              <td>{money(item.item_value)}</td>
              <td>{Number(item.discount_percent).toFixed(2)}</td>
              <td>{money(item.discount_amount)}</td>
              <td>{money(item.taxable_value)}</td>
              {intraState ? (
                <>
                  <td>{Number(item.gst_rate_snapshot / 2).toFixed(2)}</td>
                  <td>{money(item.cgst_amount)}</td>
                  <td>{Number(item.gst_rate_snapshot / 2).toFixed(2)}</td>
                  <td>{money(item.sgst_amount)}</td>
                </>
              ) : (
                <>
                  <td>{Number(item.gst_rate_snapshot).toFixed(2)}</td>
                  <td>{money(item.igst_amount)}</td>
                </>
              )}
              <td>{money(item.net_rate)}</td>
              <td>{money(item.net_price)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="invoice-bottom">
        <div className="invoice-tax-summary">
          <h3>Amount in words</h3>
          {order.amount_in_words && <div className="words">{order.amount_in_words}</div>}
        </div>
        <div className="invoice-totals">
          <div><span>Subtotal</span><b>{money(order.subtotal)}</b></div>
          <div><span>Discount</span><b>{money(order.discount_total)}</b></div>
          <div><span>Taxable value</span><b>{money(Number(order.subtotal) - Number(order.discount_total))}</b></div>
          {intraState ? (
            <>
              <div><span>CGST</span><b>{money(order.cgst_total)}</b></div>
              <div><span>SGST</span><b>{money(order.sgst_total)}</b></div>
            </>
          ) : (
            <div><span>IGST</span><b>{money(order.igst_total)}</b></div>
          )}
          <div><span>Total tax</span><b>{money(totalTax)}</b></div>
          {Number(order.round_off) !== 0 && (
            <div>
              <span>Round off</span>
              <b>{Number(order.round_off) > 0 ? '+' : '−'}{money(Math.abs(Number(order.round_off)))}</b>
            </div>
          )}
          <div className="total-line"><span>Grand total</span><b>{money(order.grand_total)}</b></div>
        </div>
      </section>

      <footer className="copy-footer">{copy === 1 ? 'CUSTOMER COPY' : 'OFFICE COPY'}</footer>
    </article>
  );
}

export function PrintInvoices() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ids = useMemo(() => String(params.get('ids') || '').split(',').filter(Boolean), [params]);
  const orders = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['print-order', id],
      queryFn: () => api.get(`/orders/${id}`).then((response) => response.data)
    }))
  });
  const companyQuery = useQueries({
    queries: [{
      queryKey: ['print-settings'],
      queryFn: () => api.get('/settings').then((response) => response.data)
    }]
  })[0];

  useEffect(() => {
    if (orders.length && orders.every((query) => query.isSuccess) && companyQuery.isSuccess) {
      api.post('/orders/mark-printed', { orderIds: ids }).catch(() => {});
    }
  }, [orders.length, companyQuery.isSuccess]);

  if (!ids.length) {
    return <div className="print-actions"><button className="btn primary" onClick={() => navigate('/owner/orders')}>Back</button></div>;
  }

  const company = companyQuery.data?.company || {};
  const ready = orders.every((query) => query.data);

  return (
    <main className="print-page">
      <div className="print-actions">
        <button className="btn secondary" onClick={() => navigate('/owner/orders')}>Back</button>
        <button className="btn primary" onClick={() => window.print()} disabled={!ready}>Print all — 2 copies each</button>
      </div>
      {orders.flatMap((query: any) => query.data ? [
        <InvoiceCopy key={`${query.data.id}-1`} order={query.data} company={company} copy={1} />,
        <InvoiceCopy key={`${query.data.id}-2`} order={query.data} company={company} copy={2} />
      ] : [])}
    </main>
  );
}
