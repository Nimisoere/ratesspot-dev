/** Money and dates for guests, in the business's currency and timezone. */

export function money(minor: number, currency: string): string {
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const major = minor / 10 ** digits;
  return new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: Number.isInteger(major) ? 0 : digits }).format(major);
}

export function day(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone }).format(new Date(iso));
}

export function time(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(new Date(iso));
}

export function dateTime(iso: string, timeZone: string): string {
  return `${day(iso, timeZone)}, ${time(iso, timeZone)}`;
}

/** "Thu 10 Dec → Sat 12 Dec" or "Thu 10 Dec, 10:00–12:00". */
export function when(start: string, end: string, timeZone: string): string {
  const sameDay = day(start, timeZone) === day(new Date(Date.parse(end) - 1).toISOString(), timeZone);
  const startsMidnight = time(start, timeZone) === "00:00" && time(end, timeZone) === "00:00";
  if (sameDay && !startsMidnight) return `${day(start, timeZone)}, ${time(start, timeZone)}–${time(end, timeZone)}`;
  return `${day(start, timeZone)} → ${day(end, timeZone)}`;
}

/** Today's date in the business's timezone, YYYY-MM-DD. */
export function today(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export const PER: Record<string, string> = { NIGHT: "night", HOUR: "hour", BLOCK: "session", DAY: "day", MONTH: "month", YEAR: "year" };
export const STATUS: Record<string, string> = {
  HOLD: "Awaiting payment",
  PENDING_APPROVAL: "Waiting for the business to approve",
  CONFIRMED: "Confirmed",
  CHECKED_IN: "Checked in",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  NO_SHOW: "No-show",
};
