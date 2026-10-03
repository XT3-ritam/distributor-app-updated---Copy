import { describe, expect, it } from 'vitest';
import { calculateSellUnitRate } from '../utils/productPricing.js';
import { toPackingKilograms } from '../utils/packingQuantity.js';

describe('per-kilogram product pricing', () => {
  it('derives a 500 g packet rate from ₹90/kg', () => {
    expect(calculateSellUnitRate(90, 'PACKET', 0.5)).toBe(45);
  });

  describe('packing summary kilograms', () => {
    it('converts packet counts using their configured packet weight', () => {
      expect(toPackingKilograms(80, 'PACKET', 0.5)).toBe(40);
      expect(toPackingKilograms(7, 'PACKET', 0.2)).toBe(1.4);
    });

    it('keeps loose kilogram quantities unchanged', () => {
      expect(toPackingKilograms(2.375, 'KG', null)).toBe(2.375);
    });

    it('does not guess when a packet weight is missing', () => {
      expect(() => toPackingKilograms(4, 'PACKET', null)).toThrow('Packet weight is missing');
    });
  });

  it('derives a 200 g packet rate from ₹90/kg', () => {
    expect(calculateSellUnitRate(90, 'PACKET', 0.2)).toBe(18);
  });

  it('keeps loose kilogram prices at the per-kilogram rate', () => {
    expect(calculateSellUnitRate(90, 'KG', null)).toBe(90);
  });

  it('rejects a packet with missing or invalid weight', () => {
    expect(() => calculateSellUnitRate(90, 'PACKET', null)).toThrow('packet weight');
    expect(() => calculateSellUnitRate(90, 'PACKET', 0)).toThrow('packet weight');
  });
});
