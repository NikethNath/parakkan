// Display + serialization helpers shared across server and client components.

/** Coerce anything (incl. Prisma Decimal) to a JS number. */
export function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (typeof (v as { toNumber?: () => number }).toNumber === "function") {
    return (v as { toNumber: () => number }).toNumber();
  }
  const n = Number(v as string);
  return Number.isFinite(n) ? n : 0;
}

/** Format a number as Indian Rupees, e.g. 79000 -> "₹79,000.00". */
export function inr(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

/** Format litres, e.g. 790 -> "790.00 L". */
export function litres(n: number): string {
  return `${(Number.isFinite(n) ? n : 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} L`;
}

/** YYYY-MM-DD for <input type="date"> and keys. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Date + time in IST, e.g. "27 Jun 2026, 6:30 pm". (Server runs on UTC.) */
export function istDateTime(d: Date): string {
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Compact IST date + time without the year, e.g. "27 Jun, 6:30 pm". */
export function istDateTimeShort(d: Date): string {
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
