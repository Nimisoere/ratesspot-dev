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

/**
 * An instant as the business's wall-clock time, in the same shape tools take
 * as input: "2026-12-08T09:00:00.000Z" in Africa/Lagos → "2026-12-08T10:00".
 * So an agent never converts timezones itself.
 */
export function localTime(instant: string, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(instant))
      .map((p) => [p.type, p.value]),
  );
  return `${parts["year"]}-${parts["month"]}-${parts["day"]}T${parts["hour"]}:${parts["minute"]}`;
}

/** Today in the business's timezone: the date, the time and the weekday, for "tomorrow" or "next Friday". */
export function localNow(timeZone: string, at: Date = new Date()): { date: string; time: string; weekday: Weekday } {
  const [date, time] = localTime(at.toISOString(), timeZone).split("T") as [string, string];
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(at).toLowerCase() as Weekday;
  return { date, time, weekday };
}
