import { describe, expect, it } from 'vitest';
import { OrderSettlementSchema, PaymentSchema } from '../services/schemas.js';

describe('order payment settlement', () => {
  it('accepts QR payment details without a soundbox confirmation flag', () => {
    expect(OrderSettlementSchema.safeParse({
      choice: 'QR',
      amount: 125.5
    }).success).toBe(true);
  });

  it('allows a lend choice with no earlier balance to collect', () => {
    expect(OrderSettlementSchema.safeParse({
      choice: 'LEND',
      amount: 0
    }).success).toBe(true);
  });

  it('rejects payment choices outside the supported methods', () => {
    expect(OrderSettlementSchema.safeParse({
      choice: 'CARD',
      amount: 100
    }).success).toBe(false);
  });

  it('supports standalone customer payments without an order', () => {
    const payment = PaymentSchema.safeParse({
      customerId: '40af0c66-7902-4bed-be5f-f81c3fb20378',
      method: 'CASH',
      amount: 200
    });
    expect(payment.success).toBe(true);
    if (payment.success) {
      expect(payment.data.orderId).toBeUndefined();
    }
  });

  it('accepts standalone UPI payment without a soundbox confirmation flag', () => {
    expect(PaymentSchema.safeParse({
      customerId: '40af0c66-7902-4bed-be5f-f81c3fb20378',
      method: 'UPI',
      amount: 200
    }).success).toBe(true);
  });
});
