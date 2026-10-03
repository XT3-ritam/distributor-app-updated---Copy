import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import './packing-print.css';

function quantity(value: number) {
  return `${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 3 })} kg`;
}

export function PackingPrint() {
  const [params] = useSearchParams();
  const ids = params.get('ids') || '';
  const navigate = useNavigate();
  const summary = useQuery({
    queryKey: ['packing', ids],
    queryFn: () => api.get('/orders/packing-summary', { params: { ids } }).then((response) => response.data),
    enabled: Boolean(ids)
  });
  const items = summary.data?.items || [];
  const totalLines = items.length;
  const totalUnits = items.reduce((total: number, item: any) => total + Number(item.quantity), 0);

  return (
    <main className="packing-page">
      <div className="packing-actions">
        <button className="btn secondary" onClick={() => navigate('/owner/orders')}>Back to orders</button>
        <button className="btn primary" onClick={() => window.print()} disabled={!items.length}>Print packing summary</button>
      </div>

      {summary.isLoading && <div className="packing-message">Preparing your packing list…</div>}
      {summary.isError && <div className="alert danger">Could not load the packing summary. Please return to Orders & Bills and try again.</div>}
      {!ids && <div className="alert info">Select one or more approved orders first.</div>}

      {summary.data && (
        <article className="packing-sheet">
          <header className="packing-header">
            <div>
              <span className="packing-eyebrow">BHOWMICK AGENCY</span>
              <h1>Packing summary</h1>
              <p>Consolidated pick list for the selected bills</p>
            </div>
            <div className="packing-date">
              <span>PREPARED</span>
              <strong>{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
            </div>
          </header>

          <section className="packing-stats" aria-label="Packing summary counts">
            <div><span>Selected bills</span><strong>{summary.data.invoices.length}</strong></div>
            <div><span>Product lines</span><strong>{totalLines}</strong></div>
            <div><span>Total weight (kg)</span><strong>{Number(totalUnits).toLocaleString('en-IN', { maximumFractionDigits: 3 })}</strong></div>
          </section>

          <section className="packing-invoices" aria-label="Selected invoice numbers">
            <span>INVOICES</span>
            <div>
              {summary.data.invoices.map((invoice: string) => <strong key={invoice}>{invoice}</strong>)}
            </div>
          </section>

          <table className="packing-table">
            <thead>
              <tr><th className="packing-number">#</th><th>Product</th><th>Weight to pack</th><th className="packing-check-heading">Packed</th></tr>
            </thead>
            <tbody>
              {items.map((item: any, index: number) => (
                <tr key={`${item.productName}-${item.unit || ''}`}>
                  <td className="packing-number">{String(index + 1).padStart(2, '0')}</td>
                  <td><strong>{item.productName}</strong></td>
                  <td className="packing-quantity">{quantity(item.quantity)}</td>
                  <td className="packing-check"><span aria-label="Not yet packed"></span></td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={4} className="packing-empty">No products found in the selected bills.</td></tr>}
            </tbody>
          </table>

          <footer className="packing-footer">
            <span>Check each line after packing and verify quantities before dispatch.</span>
            <strong>{totalLines} product line{totalLines === 1 ? '' : 's'}</strong>
          </footer>
        </article>
      )}
    </main>
  );
}
