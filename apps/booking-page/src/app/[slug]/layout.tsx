import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getStorefront } from "@/lib/api";
import { themeVars } from "@/lib/theme";

export async function generateMetadata({ params }: LayoutProps<"/[slug]">): Promise<Metadata> {
  const page = await getStorefront((await params).slug);
  return {
    title: { default: `${page.merchant.name}: book online`, template: `%s · ${page.merchant.name}` },
    description: page.brand.about?.slice(0, 160) ?? `Book ${page.merchant.name} online.`,
    ...(page.brand.cover ? { openGraph: { images: [page.brand.cover.url] } } : {}),
  };
}

/** Every page of one business: its colours, fonts, header and contact footer. */
export default async function BusinessLayout({ children, params }: LayoutProps<"/[slug]">) {
  const { slug } = await params;
  const { merchant, brand } = await getStorefront(slug);
  const c = brand.contact;
  return (
    <div className={`font-${brand.fontPairing}`} style={themeVars(brand) as React.CSSProperties}>
      {merchant.testMode && <div className="notice warn small" style={{ borderRadius: 0, textAlign: "center" }}>Test mode: bookings here aren't real and no money is taken.</div>}
      <header className="header">
        <div className="wrap">
          <Link href={`/${slug}`} className="brand">
            {brand.logo ? <Image src={brand.logo.url} alt={merchant.name} width={brand.logo.width} height={brand.logo.height} priority /> : null}
            <span>{merchant.name}</span>
          </Link>
          {c.whatsapp ? (
            <a className="btn btn-ghost" href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp us</a>
          ) : c.phone ? (
            <a className="btn btn-ghost" href={`tel:${c.phone.replace(/\s/g, "")}`}>Call us</a>
          ) : null}
        </div>
      </header>
      {children}
      <footer className="footer">
        <div className="wrap">
          <div className="stack">
            <strong>{merchant.name}</strong>
            {c.address && <p className="muted small">{c.address}</p>}
            {c.mapUrl && <a href={c.mapUrl} target="_blank" rel="noreferrer">Open in maps</a>}
          </div>
          <ul>
            {c.phone && <li><a href={`tel:${c.phone.replace(/\s/g, "")}`}>{c.phone}</a></li>}
            {c.whatsapp && <li><a href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp {c.whatsapp}</a></li>}
            {c.email && <li><a href={`mailto:${c.email}`}>{c.email}</a></li>}
            {c.instagram && <li><a href={c.instagram} target="_blank" rel="noreferrer">Instagram</a></li>}
            {c.website && <li><a href={c.website} target="_blank" rel="noreferrer">Website</a></li>}
          </ul>
          <ul>
            {brand.bookingTerms && <li><Link href={`/${slug}/terms`}>Booking terms</Link></li>}
            <li className="powered">Bookings by RatesSpot</li>
          </ul>
        </div>
      </footer>
    </div>
  );
}
