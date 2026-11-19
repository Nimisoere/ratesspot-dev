import Image from "next/image";
import Link from "next/link";
import { getCatalog, getStorefront } from "@/lib/api";
import { day, money, PER } from "@/lib/format";
import { businessLd, JsonLd } from "@/lib/seo";

/** A business's booking page: what it offers, with photos and prices. */
export default async function BusinessHome({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const page = await getStorefront(slug);
  const { merchant, brand } = page;
  const { listings, courses } = await getCatalog(slug);
  const tz = merchant.timezone;
  return (
    <main>
      <JsonLd data={businessLd(slug, page)} />
      <section className={`hero${brand.cover ? " has-cover" : ""}`}>
        {brand.cover && <Image className="cover" src={brand.cover.url} alt="" fill sizes="100vw" priority />}
        {brand.cover && <div className="shade" />}
        <div className="wrap">
          <h1>{merchant.name}</h1>
          {brand.about && <p style={{ maxWidth: 640, fontSize: "1.1rem" }}>{brand.about}</p>}
        </div>
      </section>

      {listings.length > 0 && (
        <section className="section wrap stack-lg">
          <h2>Book</h2>
          <div className="grid">
            {listings.map((l) => {
              const rate = l.rates.find((r) => r.isDefault) ?? l.rates[0];
              const photo = l.images[0];
              return (
                <Link key={l.id} href={`/${slug}/l/${l.slug}`} className="card">
                  {photo ? <Image className="photo" src={photo.url} alt={photo.alt || l.name} width={photo.width} height={photo.height} sizes="(max-width: 700px) 100vw, 380px" /> : <div className="photo" />}
                  <div className="body">
                    <h3>{l.name}</h3>
                    {l.tagline && <p className="muted small">{l.tagline}</p>}
                    {rate && <p className="price">From {money(rate.amount, merchant.currency)} <span className="muted small">/ {PER[rate.unit] ?? "booking"}</span></p>}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {courses.length > 0 && (
        <section className="section wrap stack-lg">
          <h2>Courses and events</h2>
          <div className="grid">
            {courses.map((c) => (
              <Link key={c.id} href={`/${slug}/c/${c.id}`} className="card">
                {c.images[0] ? <Image className="photo" src={c.images[0].url} alt={c.images[0].alt || c.name} width={c.images[0].width} height={c.images[0].height} sizes="(max-width: 700px) 100vw, 380px" /> : null}
                <div className="body">
                  <h3>{c.name}</h3>
                  <p className="muted small">{c.occurrences[0] ? `Starts ${day(c.occurrences[0].start, tz)}` : "Dates to be announced"}</p>
                  {c.pricePerSeat !== null && <p className="price">{money(c.pricePerSeat, merchant.currency)} <span className="muted small">/ seat</span>{c.occurrences.length > 0 && c.seatsLeft <= 5 ? <span className="pill" style={{ marginLeft: 8 }}>{c.seatsLeft === 0 ? "Full" : `${c.seatsLeft} left`}</span> : null}</p>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {listings.length === 0 && courses.length === 0 && (
        <section className="section wrap"><p className="muted">Nothing to book online right now. Get in touch using the details below.</p></section>
      )}
    </main>
  );
}
