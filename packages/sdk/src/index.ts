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
import type { components, paths } from "./api.js";

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

/**
 * What a plugin page shown in the RatesSpot dashboard is told about who's looking
 * (docs/plugin-runtime.md §3): the business, the staff member and their role, the
 * place, and the booking for a booking panel.
 */
export interface AppContext {
  v: 1;
  iss: "ratesspot";
  /** Your app's client id. */
  aud: string;
  merchantId: string;
  /** staff:<user id> */
  sub: string;
  role: "OWNER" | "MANAGER" | "FRONT_DESK";
  place: "page" | "booking_panel";
  bookingId?: string;
  /** Unix seconds. */
  iat: number;
  exp: number;
  /** Unique per context: accept each once. */
  jti: string;
}

const contextKeys = new Map<string, Promise<CryptoKey>>();

function fromBase64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

/**
 * Checks the `ratesspot_context` your dashboard page was opened with. Returns the context,
 * or null if it's forged, for another app, expired, or (with `seen`) already used.
 * The signing key is fetched from the API once and cached.
 *
 *   const context = await verifyAppContext(url.searchParams.get("ratesspot_context"), { clientId: "rs_app_…" });
 *   if (!context) return new Response("Open this from the RatesSpot dashboard.", { status: 401 });
 *
 * Then act with your own install token for `context.merchantId`, never trusting anything else in the URL.
 */
export async function verifyAppContext(
  token: string | null | undefined,
  options: {
    clientId: string;
    /** Defaults to the hosted API. */
    baseUrl?: string;
    /** Return true if this jti was used before; record it otherwise. Recommended: a context is good for one page load. */
    seen?: (jti: string) => boolean | Promise<boolean>;
    fetch?: (request: Request) => Promise<Response>;
    now?: Date;
  },
): Promise<AppContext | null> {
  if (!token) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const base = (options.baseUrl ?? "https://api.ratesspot.com").replace(/\/$/, "");
  let key = contextKeys.get(base);
  if (!key) {
    key = (async () => {
      const res = await (options.fetch ?? fetch)(new Request(`${base}/v1/app-context/key`));
      if (!res.ok) throw new Error(`Couldn't fetch the RatesSpot app context key (${res.status}).`);
      const jwk = (await res.json()) as { x: string };
      return crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: jwk.x }, { name: "Ed25519" }, false, ["verify"]);
    })();
    contextKeys.set(base, key);
    key.catch(() => contextKeys.delete(base));
  }
  let valid = false;
  try {
    valid = await crypto.subtle.verify({ name: "Ed25519" }, await key, fromBase64url(signature), new TextEncoder().encode(body));
  } catch {
    return null;
  }
  if (!valid) return null;
  let context: AppContext;
  try {
    context = JSON.parse(new TextDecoder().decode(fromBase64url(body))) as AppContext;
  } catch {
    return null;
  }
  const now = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (context.v !== 1 || context.iss !== "ratesspot" || context.aud !== options.clientId || typeof context.exp !== "number" || context.exp <= now) return null;
  if (options.seen && (await options.seen(context.jti))) return null;
  return context;
}
