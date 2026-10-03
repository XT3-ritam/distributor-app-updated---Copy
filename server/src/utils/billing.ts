export interface TaxLineInput {
  quantity: number;
  unitRate: number;
  gstRate: number;
  discountPercent?: number;
  intraState: boolean;
}

export interface TaxLineResult {
  itemValue: number;
  discountAmount: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  netRate: number;
  netPrice: number;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundToRupee(value: number): number {
  return Math.floor(value + 0.5 + Number.EPSILON);
}

export function calculateLine(input: TaxLineInput): TaxLineResult {
  const itemValue = round2(input.quantity * input.unitRate);
  const discountAmount = round2(itemValue * ((input.discountPercent ?? 0) / 100));
  const taxableValue = round2(itemValue - discountAmount);
  const cgstAmount = input.intraState ? round2(taxableValue * (input.gstRate / 200)) : 0;
  const sgstAmount = input.intraState ? round2(taxableValue * (input.gstRate / 200)) : 0;
  const igstAmount = input.intraState ? 0 : round2(taxableValue * (input.gstRate / 100));
  const netPrice = round2(taxableValue + cgstAmount + sgstAmount + igstAmount);
  return {
    itemValue,
    discountAmount,
    taxableValue,
    cgstAmount,
    sgstAmount,
    igstAmount,
    netRate: input.quantity ? round2(netPrice / input.quantity) : 0,
    netPrice
  };
}

const belowTwenty = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigitWords(n: number): string {
  if (n < 20) return belowTwenty[n];
  return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${belowTwenty[n % 10]}` : ''}`;
}

function integerWords(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000); n %= 10_000_000;
  const lakh = Math.floor(n / 100_000); n %= 100_000;
  const thousand = Math.floor(n / 1_000); n %= 1_000;
  const hundred = Math.floor(n / 100); n %= 100;
  if (crore) parts.push(`${integerWords(crore)} Crore`);
  if (lakh) parts.push(`${integerWords(lakh)} Lakh`);
  if (thousand) parts.push(`${integerWords(thousand)} Thousand`);
  if (hundred) parts.push(`${belowTwenty[hundred]} Hundred`);
  if (n) parts.push(twoDigitWords(n));
  return parts.join(' ');
}

export function amountInWords(amount: number): string {
  const rounded = round2(Math.max(0, amount));
  const rupees = Math.floor(rounded);
  const paise = Math.round((rounded - rupees) * 100);
  let result = `Rupees ${integerWords(rupees)}`;
  if (paise) result += ` and ${integerWords(paise)} Paise`;
  return `${result} Only`;
}
