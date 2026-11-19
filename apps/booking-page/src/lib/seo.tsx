import type { Course, Listing, Storefront } from "@/lib/api";
import { PER } from "@/lib/format";

/**
 * Search engines: canonical links, structured data (schema.org JSON-LD) and sitemaps.
 * Canonical links need this site's public address (SITE_URL). Without it we leave them out rather than point at localhost.
 */
export function publicBase(): URL | undefined {
  const url = process.env.SITE_URL;
  return url ? new URL(url.replace(/\/$/, "") + "/") : undefined;
}

/** A business's own pages are indexed once it's live; test businesses never are. */
export const indexable = (page: Storefront) => !page.merchant.testMode;

function major(minor: number, currency: string): string {
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return (minor / 10 ** digits).toFixed(digits);
}

const abs = (path: string) => {
  const base = publicBase();
  return base ? new URL(path.replace(/^\//, ""), base).toString() : undefined;
};

function sameAs(page: Storefront): string[] {
  const c = page.brand.contact;
  return [c.instagram, c.website].filter((u): u is string => Boolean(u));
}

/** The business, as a local business. The type is neutral: RatesSpot doesn't know if it's a hotel, a coworking space or a school. */
export function businessLd(slug: string, page: Storefront) {
  const c = page.brand.contact;
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": abs(`/${slug}#business`),
    name: page.merchant.name,
    url: abs(`/${slug}`),
    description: page.brand.about ?? undefined,
    image: page.brand.cover?.url ?? page.brand.logo?.url ?? undefined,
    logo: page.brand.logo?.url ?? undefined,
    address: c.address ?? undefined,
    telephone: c.phone ?? undefined,
    email: c.email ?? undefined,
    hasMap: c.mapUrl ?? undefined,
    sameAs: sameAs(page).length ? sameAs(page) : undefined,
  };
}

/** A listing, as a product with one offer per rate (price per night, hour, month...). */
export function listingLd(slug: string, page: Storefront, l: Listing) {
  const currency = page.merchant.currency;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: l.name,
    description: l.description ?? l.tagline ?? undefined,
    image: l.images.map((i) => i.url),
    url: abs(`/${slug}/l/${l.slug}`),
    brand: { "@type": "Brand", name: page.merchant.name },
    offers: l.rates.map((r) => ({
      "@type": "Offer",
      name: r.name,
      price: major(r.amount, currency),
      priceCurrency: currency,
      priceSpecification: { "@type": "UnitPriceSpecification", price: major(r.amount, currency), priceCurrency: currency, unitText: PER[r.unit] ?? "booking" },
      availability: "https://schema.org/InStock",
      url: abs(`/${slug}/l/${l.slug}`),
      seller: { "@id": abs(`/${slug}#business`) },
    })),
  };
}

/** A course, as one event per date. Courses with no dates yet have nothing to list. */
export function courseLd(slug: string, page: Storefront, c: Course) {
  const currency = page.merchant.currency;
  const address = page.brand.contact.address;
  return c.occurrences.map((o) => ({
    "@context": "https://schema.org",
    "@type": "Event",
    name: c.name,
    description: c.description ?? undefined,
    image: c.images.map((i) => i.url),
    startDate: o.start,
    endDate: o.end,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place", name: page.merchant.name, address: address ?? page.merchant.name },
    organizer: { "@type": "Organization", name: page.merchant.name, url: abs(`/${slug}`) },
    performer: c.hostName ? { "@type": "Person", name: c.hostName } : undefined,
    url: abs(`/${slug}/c/${c.id}`),
    offers:
      c.pricePerSeat === null
        ? undefined
        : {
            "@type": "Offer",
            price: major(c.pricePerSeat, currency),
            priceCurrency: currency,
            availability: c.seatsLeft > 0 ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
            url: abs(`/${slug}/c/${c.id}`),
          },
  }));
}

/** JSON-LD for a page. `<` is escaped so business-written text can't close the script tag. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
