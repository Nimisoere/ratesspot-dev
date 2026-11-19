import { getCatalog, getStorefront } from "@/lib/api";
import { indexable, publicBase } from "@/lib/seo";

/** Built on request: listings change, and Next would otherwise prerender this as a static metadata route. */
export const dynamic = "force-dynamic";

/** One business's sitemap, at /<slug>/sitemap.xml: its home, listings, courses and booking terms. Test businesses have none. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getStorefront(slug);
  if (!indexable(page)) return new Response("Not found", { status: 404 });
  const { listings, courses } = await getCatalog(slug);
  const base = publicBase() ?? new URL("/", request.url);
  const paths = [`/${slug}`, ...listings.map((l) => `/${slug}/l/${l.slug}`), ...courses.map((c) => `/${slug}/c/${c.id}`), ...(page.brand.bookingTerms ? [`/${slug}/terms`] : [])];
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
    .map((p) => `  <url><loc>${esc(new URL(p.slice(1), base).toString())}</loc></url>`)
    .join("\n")}\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=3600" } });
}
