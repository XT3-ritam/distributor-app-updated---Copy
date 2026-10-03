import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';

export function OwnerOrders() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);
  const orders = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.get('/orders').then((response) => response.data),
    refetchInterval: 15000
  });

  async function approve(id: string) {
    try {
      await api.post(`/orders/${id}/approve`);
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['order', id] });
    } catch (error: any) {
      alert(error.response?.data?.error || 'Approval failed');
    }
  }

  function toggle(id: string) {
    setSelected((current) => current.includes(id)
      ? current.filter((orderId) => orderId !== id)
      : [...current, id]);
  }

  function printSelected() {
    if (selected.length) navigate(`/owner/print?ids=${encodeURIComponent(selected.join(','))}`);
  }

  function packingSummary() {
    if (selected.length) navigate(`/owner/packing?ids=${encodeURIComponent(selected.join(','))}`);
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">BILLING QUEUE</div>
          <h1>Orders & bills</h1>
          <p className="muted">Open each order to review its products, discount, and totals before approving.</p>
        </div>
        <div className="button-row">
          <button className="btn secondary" onClick={packingSummary} disabled={!selected.length}>Packing summary</button>
          <button className="btn primary" onClick={printSelected} disabled={!selected.length}>Print selected (2 copies)</button>
        </div>
      </div>
      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th></th><th>Invoice</th><th>Store</th><th>Staff</th><th>Status</th><th>Total</th><th>Tax payer</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {(orders.data || []).map((order: any) => (
                <tr key={order.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.includes(order.id)}
                      onChange={() => toggle(order.id)}
                      disabled={!['APPROVED', 'COMPLETED'].includes(order.status)}
                      aria-label={`Select invoice ${order.invoice_number || order.order_number} for printing`}
                    />
                  </td>
                  <td><b>{order.invoice_number || `Order ${order.order_number}`}</b></td>
                  <td>{order.store_name}</td>
                  <td>{order.staff_name}</td>
                  <td>
                    <span className={`pill ${order.status === 'SUBMITTED' ? 'warning' : ['APPROVED', 'COMPLETED'].includes(order.status) ? 'success' : 'neutral'}`}>
                      {order.status}
                    </span>
                  </td>
                  <td>₹{Number(order.grand_total).toFixed(2)}</td>
                  <td>{order.is_taxpayer ? 'YES' : 'NO'}</td>
                  <td>
                    <div className="button-row">
                      <Link className="btn small secondary" to={`/owner/order/${order.id}`}>View</Link>
                      {order.status === 'SUBMITTED' && (
                        <button className="btn small" onClick={() => approve(order.id)}>Approve & bill</button>
                      )}
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
