import { describe, expect, it } from 'vitest';
import { OrderSchema, ProductSchema, ProductUpdateSchema, StockAdjustSchema } from '../services/schemas.js';

describe('ProductSchema', () => {
  it('accepts loose product details without SKU or HSN codes and supports fractional KG stock', () => {
    const parsed = ProductSchema.safeParse({
      name: 'Flour',
      unit: 'KG',
      masterRate: 90,
      gstRate: 5,
      stockQuantity: 2.5
    });

    expect(parsed.success).toBe(true);
  });

  it('requires a weight and whole-number stock for packet products', () => {
    const valid = ProductSchema.safeParse({
      name: 'Sooji 500 g',
      unit: 'PACKET',
      packWeightKg: 0.5,
      masterRate: 90,
      gstRate: 5,
      stockQuantity: 30
    });
    const fractionalStock = ProductSchema.safeParse({
      name: 'Sooji 500 g',
      unit: 'PACKET',
      packWeightKg: 0.5,
      masterRate: 90,
      gstRate: 5,
      stockQuantity: 30.5
    });
    const missingWeight = ProductSchema.safeParse({
      name: 'Sooji',
      unit: 'PACKET',
      masterRate: 90,
      gstRate: 5
    });

    expect(valid.success).toBe(true);
    expect(fractionalStock.success).toBe(false);
    expect(missingWeight.success).toBe(false);
  });

  it('does not add or accept stock changes in a partial product update', () => {
    const parsed = ProductUpdateSchema.safeParse({ masterRate: 90, stockQuantity: 0 });

    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ masterRate: 90 });
  });

  it('accepts fractional kilogram order quantities and per-kilogram rate overrides', () => {
    const order = OrderSchema.safeParse({
      customerId: '00000000-0000-4000-8000-000000000001',
      clientIdempotencyKey: '00000000-0000-4000-8000-000000000002',
      items: [{
        productId: '00000000-0000-4000-8000-000000000003',
        quantity: 0.5,
        ratePerKg: 90,
        discountPercent: 0
      }]
    });
    const adjustment = StockAdjustSchema.safeParse({ quantityDelta: -0.5, reason: 'Sale' });

    expect(order.success).toBe(true);
    expect(adjustment.success).toBe(true);
  });
});
