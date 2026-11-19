import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getDirectory } from "@/lib/api";
import { publicBase } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Book online: businesses on RatesSpot",
  description: "Book apartments, rooms, desks, offices, sessions and courses directly with the businesses that take bookings on RatesSpot.",
  metadataBase: publicBase(),
  ...(publicBase() ? { alternates: { canonical: "/" } } : {}),
};

// The directory changes when businesses opt in; refresh it every few minutes rather than on every visit.
export const revalidate = 300;

export default async function Home() {
  const listed = await getDirectory();
  return (
    <main className="wrap section stack-lg">
      <div className="stack" style={{ maxWidth: 640 }}>
        <h1>Book online</h1>
        <p className="muted">
          Book directly with businesses that take bookings on RatesSpot. Businesses choose whether to appear here from their dashboard (Booking page settings).
        </p>
      </div>
      {listed.length > 0 && (
        <div className="grid">
          {listed.map((b) => (
            <Link key={b.slug} href={`/${b.slug}`} className="card">
              {b.cover ? <Image className="photo" src={b.cover.url} alt="" width={b.cover.width} height={b.cover.height} sizes="(max-width: 700px) 100vw, 380px" /> : <div className="photo" />}
              <div className="body">
                <h2 style={{ fontSize: "1.1rem" }}>{b.name}</h2>
                {b.address && <p className="muted small">{b.address}</p>}
                {b.about && <p className="small">{b.about.length > 140 ? `${b.about.slice(0, 140).trimEnd()}…` : b.about}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
      <p className="small muted">
        Run a business people book? <a href="https://www.ratesspot.com/">Get your own booking page with RatesSpot</a>.
      </p>
    </main>
  );
}
