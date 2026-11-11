/**
 * The RatesSpot SDK: a typed client for the public API (generated from its
 * OpenAPI description, so every path, body and response is checked by
 * TypeScript) and webhook signature verification.
 *
 *   import { createRatesSpot } from "@ratesspot/sdk";
 *   const rs = createRatesSpot({ apiKey: process.env.RATESSPOT_API_KEY! });
 *   const { data, error } = await rs.GET("/v1/resources");
 */
import createClient, { type Client } from "openapi-fetch";
import type { components, paths } from "./api";

export type { components, paths };
/** A schema from the API description by name: Schema<"Booking">, Schema<"Quote">… */
export type Schema<Name extends keyof components["schemas"]> = components["schemas"][Name];

export interface RatesSpotOptions {
  /** rs_live_sk_… on servers; rs_live_pk_… is safe in browsers (browse, quote, hold, checkout). */
  apiKey: string;
  /** Defaults to the hosted API. Self-hosted: your server's address. */
  baseUrl?: string;
  /** Staff sessions that can manage several businesses: which one. */
  merchantId?: string;
  fetch?: (request: Request) => Promise<Response>;
}

export type RatesSpot = Client<paths>;

export function createRatesSpot(options: RatesSpotOptions): RatesSpot {
  const client = createClient<paths>({
    baseUrl: (options.baseUrl ?? "https://api.ratesspot.com").replace(/\/$/, ""),
    headers: { authorization: `Bearer ${options.apiKey}`, ...(options.merchantId ? { "x-merchant-id": options.merchantId } : {}) },
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  // Holds need an idempotency key, so a retry never takes a second room. Add one if the caller didn't.
  client.use({
    onRequest({ request }) {
      if (request.method === "POST" && new URL(request.url).pathname === "/v1/holds" && !request.headers.has("idempotency-key")) {
        request.headers.set("idempotency-key", crypto.randomUUID());
      }
      return request;
    },
  });
  return client;
}

const SIGNATURE_TOLERANCE_SECONDS = 300;

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Checks a webhook really came from RatesSpot. Pass the raw request body
 * (not re-serialised JSON), the RatesSpot-Signature header, and the
 * endpoint's signing secret (whsec_…). Rejects anything older than 5 minutes.
 * Works in Node, Deno, Bun, Cloudflare Workers and browsers (Web Crypto).
 */
export async function verifyWebhook(rawBody: string, signatureHeader: string | null | undefined, secret: string, now: Date = new Date()): Promise<boolean> {
  if (!signatureHeader) return false;
  const parts = Object.fromEntries(signatureHeader.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = Number(parts["t"]);
  if (!Number.isFinite(t) || Math.abs(now.getTime() / 1000 - t) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = await hmacHex(secret, `${t}.${rawBody}`);
  const actual = parts["v1"] ?? "";
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  return diff === 0;
}

/** A webhook body, once verified. `data.booking` is the booking as it was when the event happened. */
export type WebhookEvent = Schema<"Event">;
