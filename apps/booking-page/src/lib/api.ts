import "server-only";
import { createRatesSpot, type RatesSpot, type Schema } from "@ratesspot/sdk";
import { notFound } from "next/navigation";
import { cache } from "react";

export type Storefront = Schema<"Storefront">;
export type Listing = Schema<"Resource">;
export type Course = Schema<"Session">;
export type Quote = Schema<"Quote">;
export type Booking = Schema<"Booking">;
export type ApiError = Schema<"Error">["error"];

const baseUrl = () => process.env.RATESSPOT_API_URL ?? "https://api.ratesspot.com";

/** This site's public address, for links back from payment providers and emails. */
export const siteUrl = () => (process.env.SITE_URL ?? "http://localhost:3005").replace(/\/$/, "");

/** A business's published booking page (once per request). 404 if it isn't published. */
export const getStorefront = cache(async (slug: string): Promise<Storefront> => {
  if (!/^[a-z0-9-]{1,100}$/.test(slug)) notFound();
  const rs = createRatesSpot({ apiKey: "none", baseUrl: baseUrl() });
  const { data } = await rs.GET("/v1/storefronts/{slug}", { params: { path: { slug } } });
  if (!data) notFound();
  return data;
});

/** The API, as this business's booking page: its publishable key can browse, quote, hold and pay, nothing more. */
export const client = cache(async (slug: string): Promise<RatesSpot> => {
  const page = await getStorefront(slug);
  return createRatesSpot({ apiKey: page.publishableKey, baseUrl: baseUrl() });
});

export const getCatalog = cache(async (slug: string) => {
  const rs = await client(slug);
  const [listings, courses, methods] = await Promise.all([rs.GET("/v1/resources"), rs.GET("/v1/sessions"), rs.GET("/v1/payment-methods")]);
  return { listings: listings.data?.data ?? [], courses: courses.data?.data ?? [], methods: methods.data ?? { card: false, cardProvider: null, bankTransfer: null } };
});

/** Guest pages: public, authorised by the manage token. */
export async function getManaged(slug: string, bookingId: string, token: string) {
  const rs = await client(slug);
  return rs.GET("/v1/manage/{bookingId}", { params: { path: { bookingId }, query: { token } } });
}
