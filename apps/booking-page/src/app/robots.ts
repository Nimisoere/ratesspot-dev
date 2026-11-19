import type { MetadataRoute } from "next";
import { publicBase } from "@/lib/seo";

/** Booking pages are public. Private pages (booking, payment, a guest's own booking) say noindex themselves, so crawlers must be allowed to read them. */
export default function robots(): MetadataRoute.Robots {
  const base = publicBase();
  return { rules: { userAgent: "*", allow: "/" }, ...(base ? { sitemap: new URL("sitemap.xml", base).toString() } : {}) };
}
