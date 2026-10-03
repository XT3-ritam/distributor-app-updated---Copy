import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import { PaymentQr } from '../components/PaymentQr';
import './staff-payment.css';

type PaymentChoice = 'QR' | 'CASH' | 'CHEQUE' | 'LEND';
type CollectionMethod = 'CASH' | 'UPI' | 'CHEQUE';

const formatMoney = (value: unknown) => `₹${Number(value || 0).toFixed(2)}`;
const choiceLabel: Record<PaymentChoice, string> = {
  QR: 'QR / UPI',
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  LEND: 'Lend / credit'
};

export function StaffOrderPayment() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<PaymentChoice>('CASH');
  const [collectionMethod, setCollectionMethod] = useState<CollectionMethod>('CASH');
  const [amount, setAmount] = useState(0);
  const [reference, setReference] = useState('');
  const [saved, setSaved] = useState(false);

  const orderQuery = useQuery({
    queryKey: ['staff-order-payment', id],
    queryFn: () => api.get(`/orders/${id}`).then((response) => response.data),
    enabled: Boolean(id)
  });
  const customerId = orderQuery.data?.customer_id;
  const accountQuery = useQuery({
    queryKey: ['customer-account', customerId, id],
    queryFn: () => api.get(`/customers/${customerId}/account`, { params: { excludeOrderId: id } }).then((response) => response.data),
    enabled: Boolean(customerId)
  });

  useEffect(() => {
    if (orderQuery.data) {
      const minimum = Number(orderQuery.data.minimum_payment_due || 0);
      setAmount(Math.max(Number(orderQuery.data.grand_total || 0), minimum));
      if (orderQuery.data.settlement_choice) setSaved(true);
    }
  }, [orderQuery.data]);

  const settle = useMutation({
    mutationFn: () => api.post(`/orders/${id}/settle`, {
      choice,
      amount: roundedPaymentAmount,
      collectionMethod: choice === 'LEND' ? collectionMethod : undefined,
      reference: reference.trim() || undefined
    }),
    onSuccess: async () => {
      setSaved(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['staff-order-payment', id] }),
        queryClient.invalidateQueries({ queryKey: ['customer-account'] }),
        queryClient.invalidateQueries({ queryKey: ['payments'] }),
        queryClient.invalidateQueries({ queryKey: ['my-orders'] })
      ]);
    }
  });

  const order = orderQuery.data;
  const minimum = Number(order?.minimum_payment_due || 0);
  const payMethod = choice === 'LEND' ? collectionMethod : choice === 'QR' ? 'UPI' : choice;
  const paymentIsQr = payMethod === 'UPI';
  const roundedPaymentAmount = Math.round(amount);
  const amountIsValid = Number.isFinite(amount) && roundedPaymentAmount >= minimum && (choice === 'LEND' || roundedPaymentAmount > 0);
  const alreadyReceived = Number(order?.payments?.reduce((sum: number, payment: any) => sum + Number(payment.amount), 0) || 0);

  if (orderQuery.isLoading) return <div className="page"><div className="panel">Loading order payment…</div></div>;
  if (orderQuery.isError || !order) {
    return <div className="page"><div className="alert danger">Could not load this order. Return to <Link to="/staff/orders">My orders</Link>.</div></div>;
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">ORDER PAYMENT</div>
          <h1>{order.invoice_number || `Order ${order.order_number}`}</h1>
          <p className="muted">Customer: {order.customer_store_name}</p>
        </div>
      </div>

      <div className="staff-payment-layout">
        <section className="panel staff-payment-panel">
          {saved || order.settlement_choice ? (
            <>
              <h2>Payment choice saved</h2>
              <p className="muted">
                {order.settlement_choice
                  ? `This order was recorded as ${choiceLabel[order.settlement_choice as PaymentChoice] || order.settlement_choice}.`
                  : 'Your payment choice has been saved.'}
              </p>
              <p>Received so far: <strong>{formatMoney(alreadyReceived)}</strong></p>
              <button className="btn primary" onClick={() => navigate('/staff/order')}>Start a new order</button>
            </>
          ) : (
            <>
              <h2>How is the customer paying?</h2>
              <div className="payment-choice-grid">
                {(['QR', 'CASH', 'CHEQUE', 'LEND'] as PaymentChoice[]).map((option) => (
                  <button
                    type="button"
                    key={option}
                    className={`payment-choice ${choice === option ? 'selected' : ''}`}
                    onClick={() => {
                      setChoice(option);
                      setAmount(option === 'LEND' ? minimum : Math.max(Number(order.grand_total), minimum));
                    }}
                  >
                    {choiceLabel[option]}
                  </button>
                ))}
              </div>

              {choice === 'LEND' && (
                <div className="alert info">
                  The current bill stays on the customer account as unpaid. If there is an earlier balance, collect at least {formatMoney(minimum)} toward it before saving this order as lend.
                </div>
              )}
              {choice !== 'LEND' && (
                <p className="muted">Any part of this bill not collected now remains due on the customer account.</p>
              )}

              <label className="payment-input">
                {choice === 'LEND' ? 'Amount collected toward old balance (₹)' : 'Amount received now (₹)'}
                <input
                  type="number"
                  min={minimum}
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value === '' ? 0 : Number(event.target.value))}
                />
                <small>The recorded payment is rounded to the nearest rupee: {formatMoney(roundedPaymentAmount)}.</small>
              </label>

              {choice === 'LEND' && amount > 0 && (
                <label className="payment-input">
                  Collected using
                  <select value={collectionMethod} onChange={(event) => setCollectionMethod(event.target.value as CollectionMethod)}>
                    <option value="CASH">Cash</option>
                    <option value="UPI">QR / UPI</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </label>
              )}

              {paymentIsQr && roundedPaymentAmount > 0 && (
                <>
                  <PaymentQr />
                  <label className="payment-input">
                    UPI transaction ID (optional)
                    <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Enter transaction ID if available" />
                  </label>
                </>
              )}

              {settle.isError && (
                <div className="alert danger">
                  {(settle.error as any)?.response?.data?.error || 'Could not save the payment choice.'}
                </div>
              )}
              {accountQuery.isError && (
                <div className="alert danger">Could not load the customer account history. Retry before recording payment.</div>
              )}

              <button
                className="btn primary wide payment-submit"
                disabled={!amountIsValid || accountQuery.isLoading || accountQuery.isError || settle.isPending}
                onClick={() => settle.mutate()}
              >
                {settle.isPending ? 'Saving…' : choice === 'LEND' ? 'Save as lend' : 'Record payment'}
              </button>
            </>
          )}
        </section>

        <aside className="panel account-summary">
          <h2>Account summary</h2>
          <div className="account-line"><span>This bill</span><strong>{formatMoney(order.grand_total)}</strong></div>
          <div className="account-line"><span>Previous outstanding</span><strong>{formatMoney(order.prior_balance_snapshot)}</strong></div>
          <div className="account-line"><span>Minimum to collect now (20%)</span><strong>{formatMoney(minimum)}</strong></div>
          {accountQuery.data && <div className="account-line account-balance"><span>Previous balance now</span><strong>{formatMoney(accountQuery.data.balance)}</strong></div>}
          {accountQuery.data && (
            <div className="account-history">
              <h3>Account history</h3>
              {accountQuery.data.transactions.length === 0 ? (
                <p className="muted tiny">No earlier account activity.</p>
              ) : (
                accountQuery.data.transactions.slice(0, 8).map((entry: any) => (
                  <div className="account-history-row" key={entry.id}>
                    <span>{entry.description || entry.transaction_type}<small>{new Date(entry.created_at).toLocaleDateString('en-IN')}</small></span>
                    <strong className={Number(entry.signed_amount) < 0 ? 'credit' : ''}>
                      {Number(entry.signed_amount) < 0 ? '−' : '+'}{formatMoney(Math.abs(Number(entry.signed_amount)))}
                    </strong>
                  </div>
                ))
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
