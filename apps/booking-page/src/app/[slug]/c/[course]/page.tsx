import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCatalog, getStorefront } from "@/lib/api";
import { dateTime, money, time } from "@/lib/format";

async function find(slug: string, id: string) {
  const { courses } = await getCatalog(slug);
  return courses.find((c) => c.id === id) ?? notFound();
}

export async function generateMetadata({ params }: PageProps<"/[slug]/c/[course]">): Promise<Metadata> {
  const { slug, course } = await params;
  const c = await find(slug, course);
  return { title: c.name, description: c.description?.slice(0, 160) ?? undefined };
}

/** A course or event: dates, seats left, and a form to book seats. */
export default async function CoursePage({ params }: PageProps<"/[slug]/c/[course]">) {
  const { slug, course } = await params;
  const { merchant } = await getStorefront(slug);
  const c = await find(slug, course);
  const tz = merchant.timezone;
  const bookable = c.occurrences.length > 0 && c.seatsLeft > 0 && c.pricePerSeat !== null;
  return (
    <main className="wrap section">
      <p className="small"><Link href={`/${slug}`}>← All</Link></p>
      <div className="layout" style={{ marginTop: "1rem" }}>
        <div className="stack-lg">
          <div className="stack">
            <h1>{c.name}</h1>
            {c.hostName && <p className="muted">With {c.hostName}</p>}
          </div>
          {c.images[0] && <Image src={c.images[0].url} alt={c.images[0].alt || c.name} width={c.images[0].width} height={c.images[0].height} style={{ borderRadius: 12 }} sizes="(max-width: 900px) 100vw, 700px" priority />}
          {c.description && <p className="prose">{c.description}</p>}
          <div className="stack">
            <h2>Dates</h2>
            {c.occurrences.length === 0 ? (
              <p className="muted">Dates to be announced.</p>
            ) : (
              <ul>{c.occurrences.map((o) => <li key={o.start}>{dateTime(o.start, tz)}–{time(o.end, tz)}</li>)}</ul>
            )}
          </div>
        </div>
        <div className="aside">
          <form action={`/${slug}/book`} method="get" className="panel">
            <input type="hidden" name="course" value={c.id} />
            {c.pricePerSeat !== null && <p><strong>{money(c.pricePerSeat, merchant.currency)}</strong> <span className="muted">/ seat, all dates</span></p>}
            <p className="muted small">{c.seatsLeft === 0 ? "Full" : `${c.seatsLeft} of ${c.seats} seats left`}</p>
            {bookable ? (
              <>
                <label>Seats<select name="quantity" defaultValue="1">{Array.from({ length: Math.min(c.seatsLeft, 10) }, (_, i) => i + 1).map((n) => <option key={n}>{n}</option>)}</select></label>
                <button className="btn btn-block" type="submit">Check price and book</button>
              </>
            ) : (
              <div className="notice">{c.occurrences.length === 0 ? "Bookings open when dates are set." : "No seats left."}</div>
            )}
          </form>
        </div>
      </div>
    </main>
  );
}
