import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../services/api';
import { PaymentQr } from '../components/PaymentQr';
import './owner-payments.css';

export function OwnerPayments() {
  const qc = useQueryClient();
  const [accountCustomerId, setAccountCustomerId] = useState('');
  const [f, setF] = useState<any>({
    customerId: '',
    method: 'CASH',
    amount: 0,
    reference: '',
    notes: ''
  });
  const customers = useQuery({
    queryKey: ['customers', 'payment'],
    queryFn: () => api.get('/customers', { params: { limit: 100 } }).then((r) => r.data.items)
  });
  const payments = useQuery({
    queryKey: ['payments'],
    queryFn: () => api.get('/payments').then((r) => r.data)
  });
  const account = useQuery({
    queryKey: ['customer-account', accountCustomerId],
    queryFn: () => api.get(`/customers/${accountCustomerId}/account`).then((r) => r.data),
    enabled: Boolean(accountCustomerId)
  });
  const mutation = useMutation({
    mutationFn: () => api.post('/payments', { ...f, amount: Math.round(Number(f.amount)) }),
    onSuccess: () => {
      setF({ ...f, customerId: '', amount: 0, reference: '', notes: '' });
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['customer-account'] });
    }
  });

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">FINANCE</div>
          <h1>Payments</h1>
          <p className="muted">Record real payments against customer accounts.</p>
        </div>
      </div>

      <div className="panel">
        <h2>Customer account & history</h2>
        <label className="payment-field account-picker">
          Choose customer
          <select value={accountCustomerId} onChange={(e) => setAccountCustomerId(e.target.value)}>
            <option value="">Select customer</option>
            {(customers.data || []).map((customer: any) => (
              <option key={customer.id} value={customer.id}>{customer.store_name}</option>
            ))}
          </select>
        </label>
        {account.isLoading && <p className="muted">Loading account…</p>}
        {account.isError && <div className="alert danger">Could not load this customer account.</div>}
        {account.data && (
          <>
            <p className="account-balance-display">
              Outstanding balance <strong>₹{Number(account.data.balance).toFixed(2)}</strong>
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Date</th><th>Activity</th><th>Details</th><th>Amount</th></tr>
                </thead>
                <tbody>
                  {account.data.transactions.map((entry: any) => (
                    <tr key={entry.id}>
                      <td>{new Date(entry.created_at).toLocaleString('en-IN')}</td>
                      <td>{entry.transaction_type === 'SALE' ? 'Bill' : entry.transaction_type === 'PAYMENT' ? `Payment${entry.payment_method ? ` (${entry.payment_method === 'UPI' ? 'QR / UPI' : entry.payment_method})` : ''}` : entry.transaction_type}</td>
                      <td>{entry.description || entry.payment_reference || '—'}</td>
                      <td>{Number(entry.signed_amount) < 0 ? '−' : '+'}₹{Math.abs(Number(entry.signed_amount)).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {account.data.transactions.length === 0 && <p className="muted">No account activity yet.</p>}
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <h2>Record payment</h2>
        {mutation.isError && (
          <div className="alert danger">
            {(mutation.error as any)?.response?.data?.error || 'Could not save the payment.'}
          </div>
        )}
        <div className="form-grid payment-form">
          <label className="payment-field">
            Customer
            <select value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })}>
              <option value="">Select customer</option>
              {(customers.data || []).map((customer: any) => (
                <option key={customer.id} value={customer.id}>{customer.store_name}</option>
              ))}
            </select>
          </label>
          <label className="payment-field">
            Payment method
            <select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
              <option>CASH</option>
              <option>UPI</option>
              <option>BANK_TRANSFER</option>
              <option>CHEQUE</option>
              <option>OTHER</option>
            </select>
          </label>
          <label className="payment-field">
            Amount (₹)
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={f.amount}
              onChange={(e) => setF({ ...f, amount: Number(e.target.value) })}
            />
            <small>Recorded to the nearest rupee: ₹{Math.round(Number(f.amount) || 0)}.</small>
          </label>
          <label className="payment-field">
            Reference / transaction ID (optional)
            <input
              placeholder="UPI/bank transaction ID or cheque number"
              value={f.reference}
              onChange={(e) => setF({ ...f, reference: e.target.value })}
            />
            <small>Enter the payment or cheque number for tracking. Leave blank for cash.</small>
          </label>
          {f.method === 'UPI' && <div className="payment-field-wide"><PaymentQr /></div>}
          <button
            className="btn primary payment-submit"
            disabled={!f.customerId || !f.amount || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Save payment
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>Recent payments</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Store</th>
                <th>Method</th>
                <th>Reference</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {(payments.data || []).map((payment: any) => (
                <tr key={payment.id}>
                  <td>{new Date(payment.created_at).toLocaleString('en-IN')}</td>
                  <td>{payment.store_name}</td>
                  <td>{payment.method === 'UPI' ? 'QR / UPI' : payment.method}</td>
                  <td>{payment.reference || '—'}</td>
                  <td>₹{Number(payment.amount).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
