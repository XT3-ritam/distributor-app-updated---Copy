export function toPackingKilograms(quantity: number, unit: string | null, packetWeightKg: number | null) {
  if (unit?.toUpperCase() !== 'PACKET') {
    return Math.round(quantity * 1000) / 1000;
  }
  if (!Number.isFinite(packetWeightKg) || Number(packetWeightKg) <= 0) {
    throw new Error('Packet weight is missing; configure the product packet weight before printing the packing summary.');
  }
  return Math.round(quantity * Number(packetWeightKg) * 1000) / 1000;
}
