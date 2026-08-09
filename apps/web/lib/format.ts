export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fi-FI", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value));
}

export function formatMoney(value: string | number | null): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(Number(value ?? 0));
}

export function formatNumber(value: string | number | null, digits = 0): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(value));
}

export function isFreshHeartbeat(value: string | null, maxAgeMs = 180_000): boolean {
  return Boolean(value && Date.now() - new Date(value).getTime() <= maxAgeMs);
}
