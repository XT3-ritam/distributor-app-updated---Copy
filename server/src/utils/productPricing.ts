import { round2 } from './billing.js';

export function calculateSellUnitRate(ratePerKg: number, unit: string, packWeightKg: number | null): number {
  const normalizedUnit = unit.toUpperCase();
  if (!Number.isFinite(ratePerKg) || ratePerKg < 0) throw new RangeError('Rate per kilogram must be a non-negative number.');
  if (normalizedUnit === 'KG') return round2(ratePerKg);
  if (normalizedUnit !== 'PACKET' || !Number.isFinite(packWeightKg) || Number(packWeightKg) <= 0) {
    throw new RangeError('A packet product needs a valid packet weight.');
  }
  return round2(ratePerKg * Number(packWeightKg));
}
