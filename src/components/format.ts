export function formatPrice(value: number, currency?: string): string {
  const digits = Math.abs(value) < 10 ? 4 : 2;
  const n = value.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: digits });
  return currency ? `${n} ${currency}` : n;
}

export function formatChange(change: number, percent: number): string {
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toLocaleString("es-CO", { maximumFractionDigits: 2 })} (${sign}${percent.toFixed(2)}%)`;
}

export function changeClass(change: number): string {
  if (change > 0) return "text-up";
  if (change < 0) return "text-down";
  return "text-muted";
}
