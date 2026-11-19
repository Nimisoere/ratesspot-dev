import { getDirectory } from "@/lib/api";
import { publicBase } from "@/lib/seo";

export const dynamic = "force-dynamic";

/** A sitemap index: the directory page, then each listed business's own sitemap (/<slug>/sitemap.xml). Unlisted businesses aren't named here. */
export async function GET(request: Request) {
  const base = publicBase() ?? new URL("/", request.url);
  const listed = await getDirectory();
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const sitemaps = listed.map((b) => `  <sitemap><loc>${esc(new URL(`${b.slug}/sitemap.xml`, base).toString())}</loc></sitemap>`);
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemaps.join("\n")}\n</sitemapindex>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=3600" } });
}
