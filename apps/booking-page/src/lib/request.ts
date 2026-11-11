import type { Schema } from "@ratesspot/sdk";
import { getCatalog } from "./api";

type Params = Record<string, string | string[] | undefined>;
type Range = Schema<"Range">;

export interface BookingRequest {
  /** What's booked, for people. */
  title: string;
  resourceId?: string;
  sessionId?: string;
  rateId?: string;
  range: Range;
  quantity: number;
  adults: number;
  /** Where "change" goes back to. */
  backHref: string;
  /** The form's fields, to carry into the booking step. */
  query: Record<string, string>;
}

const one = (p: Params, k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
const date = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const int = (v: string, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

/** Reads a booking choice from the URL (the listing or course page's form). Null with a reason if it doesn't make sense. */
export async function parseRequest(slug: string, p: Params): Promise<BookingRequest | { error: string }> {
  const { listings, courses } = await getCatalog(slug);
  const query = Object.fromEntries(Object.entries(p).filter((e): e is [string, string] => typeof e[1] === "string"));
  const quantity = int(one(p, "quantity"), 1, 50, 1);
  const adults = int(one(p, "adults"), 1, 100, 1);

  if (one(p, "course")) {
    const course = courses.find((c) => c.id === one(p, "course"));
    if (!course) return { error: "That course isn't available any more." };
    return { title: course.name, sessionId: course.id, range: { kind: "session" }, quantity, adults: quantity, backHref: `/${slug}/c/${course.id}`, query };
  }

  const listing = listings.find((l) => l.slug === one(p, "listing"));
  const rate = listing?.rates.find((r) => r.id === one(p, "rate"));
  if (!listing || !rate) return { error: "That option isn't available any more." };
  const base = { title: listing.name, resourceId: listing.id, rateId: rate.id, quantity, adults, backHref: `/${slug}/l/${listing.slug}`, query };
  switch (rate.unit) {
    case "NIGHT": {
      const checkIn = date(one(p, "checkIn"));
      const checkOut = date(one(p, "checkOut"));
      if (!checkIn || !checkOut || checkOut <= checkIn) return { error: "Choose a check-out date after check-in." };
      return { ...base, range: { kind: "nights", checkIn, checkOut } };
    }
    case "HOUR": {
      const d = date(one(p, "date"));
      const t = /^\d{2}:\d{2}$/.test(one(p, "time")) ? one(p, "time") : null;
      if (!d || !t) return { error: "Choose a date and a start time." };
      return { ...base, range: { kind: "hours", start: `${d}T${t}`, hours: int(one(p, "hours"), 1, 24, 1) } };
    }
    case "BLOCK": {
      const d = date(one(p, "date"));
      if (!d || !one(p, "block")) return { error: "Choose a date and a session." };
      return { ...base, range: { kind: "block", date: d, block: one(p, "block") } };
    }
    case "DAY":
    case "MONTH":
    case "YEAR": {
      const start = date(one(p, "start"));
      if (!start) return { error: "Choose a start date." };
      const count = int(one(p, "count"), 1, 120, 1);
      return { ...base, range: rate.unit === "DAY" ? { kind: "days", start, days: count } : rate.unit === "MONTH" ? { kind: "months", start, months: count } : { kind: "years", start, years: count } };
    }
    default:
      return { error: "This can't be booked online." };
  }
}
