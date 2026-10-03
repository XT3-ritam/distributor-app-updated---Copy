export function minimumPaymentForOutstanding(balance: number) {
  const eligibleBalance = Math.max(Number.isFinite(balance) ? balance : 0, 0);
  if (eligibleBalance === 0) return 0;
  return Math.ceil(eligibleBalance * 0.2 - 1e-8);
}
