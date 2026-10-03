import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import api from '../services/api';
import { PaymentQr } from '../components/PaymentQr';
import './owner-payments.css';

type Method = 'CASH' | 'UPI' | 'CHEQUE' | 'BANK_TRANSFER' | 'OTHER';

export function StaffPayments() {
  const queryClient = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [method, setMethod] = useState<Method>('CASH');
  const [amount, setAmount] = useState(0);
  const [reference, setReference] = useState('');

  const customers = useQuery({
    queryKey: ['staff-customers', 'standalone-payment'],
    queryFn: () => api.get('/customers', { params: { limit: 100 } }).then((response) => response.data.items)
  });
  const account = useQuery({
    queryKey: ['customer-account', customerId, 'staff-payments'],
    queryFn: () => api.get(`/customers/${customerId}/account`).then((response) => response.data),
    enabled: Boolean(customerId)
  });
  const roundedAmount = Math.round(Number(amount) || 0);

  const mutation = useMutation({
    mutationFn: () => api.post('/payments', {
      customerId,
      method,
      amount: roundedAmount,
      reference: reference.trim() || undefined
    }),
    onSuccess: async () => {
      setAmount(0);
      setReference('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['customer-account', customerId] }),
        queryClient.invalidateQueries({ queryKey: ['payments'] })
      ]);
    }
  });

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">CUSTOMER ACCOUNTS</div>
          <h1>Receive payment</h1>
          <p className="muted">Record money received from a customer, even when there is no new order.</p>
        </div>
      </div>

      <div className="panel">
        <h2>Record payment</h2>
        {mutation.isError && (
          <div className="alert danger">
            {(mutation.error as any)?.response?.data?.error || 'Could not save the payment.'}
          </div>
        )}
        {mutation.isSuccess && <div className="alert success">Payment saved to the customer account.</div>}

        <div className="form-grid payment-form">
          <label className="payment-field">
            Customer
            <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
              <option value="">Select customer</option>
              {(customers.data || []).map((customer: any) => (
                <option key={customer.id} value={customer.id}>{customer.store_name}</option>
              ))}
            </select>
          </label>
          <label className="payment-field">
            Payment method
            <select value={method} onChange={(event) => setMethod(event.target.value as Method)}>
              <option value="CASH">Cash</option>
              <option value="UPI">QR / UPI</option>
              <option value="CHEQUE">Cheque</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label className="payment-field">
            Amount (₹)
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value === '' ? 0 : Number(event.target.value))}
            />
            <small>Recorded to the nearest rupee: ₹{roundedAmount}.</small>
          </label>
          <label className="payment-field">
            Reference / transaction ID (optional)
            <input
              placeholder="UPI/bank transaction ID or cheque number"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
            <small>Leave blank for cash payments.</small>
          </label>

          {method === 'UPI' && <div className="payment-field-wide"><PaymentQr /></div>}

          <button
            className="btn primary payment-submit"
            disabled={!customerId || roundedAmount <= 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Saving…' : 'Save payment'}
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>Customer account & history</h2>
        {!customerId && <p className="muted">Select a customer to see their balance and past bills/payments.</p>}
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
                      <td>
                        {entry.transaction_type === 'SALE'
                          ? 'Bill'
                          : entry.transaction_type === 'PAYMENT'
                            ? `Payment${entry.payment_method ? ` (${entry.payment_method === 'UPI' ? 'QR / UPI' : entry.payment_method})` : ''}`
                            : entry.transaction_type}
                      </td>
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
    </div>
  );
}
