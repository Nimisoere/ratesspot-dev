import type { Listing } from "@/lib/api";
import { addDays, money, PER, today } from "@/lib/format";

type Rate = Listing["rates"][number];

const HOURS = Array.from({ length: 33 }, (_, i) => 6 * 60 + i * 30).map((m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);

/**
 * One booking form per rate, shaped by how the rate is sold: nights, hours,
 * a named block (e.g. Morning), days, months or years. A plain GET form to
 * /<slug>/book: works before JavaScript loads, and the choice is in the URL.
 */
export function BookForm({ slug, listing, rate, currency, timezone }: { slug: string; listing: Listing; rate: Rate; currency: string; timezone: string }) {
  const start = addDays(today(timezone), 1);
  const units = Array.from({ length: Math.min(listing.inventory, 10) }, (_, i) => i + 1);
  const guests = Array.from({ length: Math.min(listing.capacity, 20) }, (_, i) => i + 1);
  const min = Math.max(1, rate.minUnits);
  return (
    <form action={`/${slug}/book`} method="get" className="panel">
      <input type="hidden" name="listing" value={listing.slug} />
      <input type="hidden" name="rate" value={rate.id} />
      <div className="stack" style={{ gap: "0.15rem" }}>
        <h3>{rate.name}</h3>
        <p>
          <strong>{money(rate.amount, currency)}</strong> <span className="muted">/ {PER[rate.unit] ?? rate.unit.toLowerCase()}{rate.termMonths ? ` · ${rate.termMonths}-month contract` : ""}</span>
        </p>
      </div>
      {rate.unit === "NIGHT" && (
        <div className="row">
          <label>Check-in<input type="date" name="checkIn" required min={today(timezone)} defaultValue={start} /></label>
          <label>Check-out<input type="date" name="checkOut" required min={today(timezone)} defaultValue={addDays(start, Math.max(1, min))} /></label>
        </div>
      )}
      {rate.unit === "HOUR" && (
        <div className="row">
          <label>Date<input type="date" name="date" required min={today(timezone)} defaultValue={start} /></label>
          <label>Start<select name="time" defaultValue="10:00">{HOURS.map((h) => <option key={h}>{h}</option>)}</select></label>
          <label>Hours<select name="hours" defaultValue={String(min)}>{Array.from({ length: 12 }, (_, i) => i + 1).filter((n) => n >= min).map((n) => <option key={n}>{n}</option>)}</select></label>
        </div>
      )}
      {rate.unit === "BLOCK" && (
        <div className="row">
          <label>Date<input type="date" name="date" required min={today(timezone)} defaultValue={start} /></label>
          <label>Session<select name="block">{rate.blocks.map((b) => <option key={b.name}>{b.name}</option>)}</select></label>
        </div>
      )}
      {(rate.unit === "DAY" || rate.unit === "MONTH" || rate.unit === "YEAR") && (
        <div className="row">
          <label>Start<input type="date" name="start" required min={today(timezone)} defaultValue={start} /></label>
          <label>
            {rate.unit === "DAY" ? "Days" : rate.unit === "MONTH" ? "Months" : "Years"}
            <select name="count" defaultValue={String(rate.termMonths && rate.unit === "MONTH" ? rate.termMonths : min)}>
              {Array.from({ length: rate.unit === "MONTH" ? 24 : 14 }, (_, i) => i + 1).filter((n) => n >= min && (!rate.maxUnits || n <= rate.maxUnits)).map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
        </div>
      )}
      <div className="row">
        {listing.capacity > 1 && (
          <label>{listing.words.customers.charAt(0).toUpperCase() + listing.words.customers.slice(1)}<select name="adults" defaultValue="1">{guests.map((n) => <option key={n}>{n}</option>)}</select></label>
        )}
        {units.length > 1 && (
          <label>{units.length > 1 ? "How many" : ""}<select name="quantity" defaultValue="1">{units.map((n) => <option key={n}>{n}</option>)}</select></label>
        )}
      </div>
      <button className="btn btn-block" type="submit">Check price and book</button>
    </form>
  );
}
