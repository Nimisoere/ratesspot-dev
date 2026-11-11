/**
 * Conversions between how people (and agents) say things and how the API
 * stores them. Agents get minor units and timezone offsets wrong, so tools
 * take "25000" naira and "2026-12-08T10:00" local time, and convert here.
 */

/** Digits after the decimal point for a currency: 2 for NGN and USD, 0 for JPY. */
export function minorDigits(currency: string): number {
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

/** 25000 (naira) → 2500000 (kobo). */
export function toMinor(amount: number, currency: string): number {
  return Math.round(amount * 10 ** minorDigits(currency));
}

/** 2500000 (kobo) → 25000 (naira). */
export function toMajor(minor: number, currency: string): number {
  return minor / 10 ** minorDigits(currency);
}

/** 2500000 kobo → "₦25,000". */
export function money(minor: number, currency: string): string {
  const major = toMajor(minor, currency);
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: Number.isInteger(major) ? 0 : minorDigits(currency),
  }).format(major);
}

/** "10:00" → 600 minutes after midnight. */
export function minuteOfDay(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) throw new Error(`"${time}" isn't a time like 09:30.`);
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  if (minutes > 1440 || Number(m[2]) > 59) throw new Error(`"${time}" isn't a valid time.`);
  return minutes;
}

export const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
