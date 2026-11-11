import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookForm } from "@/components/BookForm";
import { getCatalog, getStorefront } from "@/lib/api";

async function find(slug: string, listing: string) {
  const { listings } = await getCatalog(slug);
  return listings.find((l) => l.slug === listing) ?? notFound();
}

export async function generateMetadata({ params }: PageProps<"/[slug]/l/[listing]">): Promise<Metadata> {
  const { slug, listing } = await params;
  const l = await find(slug, listing);
  return { title: l.name, description: l.tagline ?? l.description?.slice(0, 160) ?? undefined };
}

/** One listing: photos, description, features, and a booking form for each way it's sold. */
export default async function ListingPage({ params }: PageProps<"/[slug]/l/[listing]">) {
  const { slug, listing } = await params;
  const { merchant } = await getStorefront(slug);
  const l = await find(slug, listing);
  const rates = [...l.rates].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  return (
    <main className="wrap section">
      <p className="small"><Link href={`/${slug}`}>← All</Link></p>
      <div className="layout" style={{ marginTop: "1rem" }}>
        <div className="stack-lg">
          <div className="stack">
            <h1>{l.name}</h1>
            {l.tagline && <p className="muted" style={{ fontSize: "1.1rem" }}>{l.tagline}</p>}
            <p className="muted small">{l.words.capacity.charAt(0).toUpperCase() + l.words.capacity.slice(1)} {l.capacity} {l.capacity === 1 ? "person" : "people"}</p>
          </div>
          {l.images.length > 0 && (
            <div className="gallery">
              {l.images.map((img, i) => (
                <Image key={img.id} src={img.url} alt={img.alt || l.name} width={img.width} height={img.height} sizes="(max-width: 900px) 100vw, 360px" priority={i === 0} />
              ))}
            </div>
          )}
          {l.description && <p className="prose">{l.description}</p>}
          {l.features.length > 0 && (
            <ul className="features">
              {l.features.map((f) => <li key={f}>{f}</li>)}
            </ul>
          )}
        </div>
        <div className="aside stack">
          {rates.length === 0 ? (
            <div className="notice">Not bookable online yet. Please get in touch.</div>
          ) : (
            rates.map((r) => <BookForm key={r.id} slug={slug} listing={l} rate={r} currency={merchant.currency} timezone={merchant.timezone} />)
          )}
        </div>
      </div>
    </main>
  );
}
