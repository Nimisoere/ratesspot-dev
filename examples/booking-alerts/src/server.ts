/**
 * Booking alerts: an example RatesSpot app.
 *
 * 1. A business owner opens /install. They're sent to RatesSpot to sign in, choose
 *    their business and approve (OAuth 2.1 with PKCE).
 * 2. RatesSpot sends them back to /callback with a code. We swap it for tokens, then
 *    use them to register a webhook for confirmed bookings.
 * 3. Each confirmed booking arrives at /webhooks/<install>. We check its signature and
 *    post a message to Slack (or print it).
 *
 * Everything here is the public API: no special access. A real app keeps installs in a
 * database and refreshes access tokens (they last an hour) with the refresh token.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createRatesSpot, verifyWebhook, type WebhookEvent } from "@ratesspot/sdk";

const env = (name: string, fallback?: string) => {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Set ${name} (see README.md)`);
  return value;
};
const API = env("RATESSPOT_API_URL", "https://api.ratesspot.com").replace(/\/$/, "");
const APP_URL = env("APP_URL", "http://localhost:4000").replace(/\/$/, ""); // where RatesSpot can reach this app
const CLIENT_ID = env("RATESSPOT_CLIENT_ID");
const CLIENT_SECRET = env("RATESSPOT_CLIENT_SECRET");
const SLACK_WEBHOOK_URL = process.env["SLACK_WEBHOOK_URL"]; // optional: without it, alerts are printed
const PORT = Number(process.env["PORT"] ?? 4000);

/** In memory, for the example. */
const pendingLogins = new Map<string, { verifier: string; createdAt: number }>(); // OAuth state -> PKCE verifier
const installs = new Map<string, { business: string; webhookSecret: string; accessToken: string; refreshToken: string }>();

const base64url = (b: Buffer) => b.toString("base64url");

function install(res: ServerResponse) {
  const state = base64url(randomBytes(16));
  const verifier = base64url(randomBytes(32));
  pendingLogins.set(state, { verifier, createdAt: Date.now() });
  const url = new URL(`${API}/oauth/authorize`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: `${APP_URL}/callback`,
    code_challenge: base64url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
    state,
    // What this app needs: read bookings, and settings:write to register its webhook.
    scope: "bookings:read settings:write",
  }).toString();
  res.writeHead(302, { location: url.toString() }).end();
}

async function callback(url: URL, res: ServerResponse) {
  const state = url.searchParams.get("state") ?? "";
  const login = pendingLogins.get(state);
  pendingLogins.delete(state);
  if (url.searchParams.get("error")) return send(res, 200, "Install cancelled. You can close this tab.");
  if (!login || Date.now() - login.createdAt > 10 * 60_000) return send(res, 400, "This sign-in link has expired. Start again at /install.");

  // Swap the code for tokens (the client secret proves it's us).
  const tokenResponse = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}` },
    body: new URLSearchParams({ grant_type: "authorization_code", code: url.searchParams.get("code") ?? "", redirect_uri: `${APP_URL}/callback`, code_verifier: login.verifier }),
  });
  if (!tokenResponse.ok) return send(res, 502, `RatesSpot refused the code: ${await tokenResponse.text()}`);
  const tokens = (await tokenResponse.json()) as { access_token: string; refresh_token: string };

  // The token works like an API key for this one business.
  const rs = createRatesSpot({ apiKey: tokens.access_token, baseUrl: API });
  const { data: business } = await rs.GET("/v1/business");
  const installId = randomUUID();
  const { data: endpoint, error } = await rs.POST("/v1/webhook-endpoints", {
    body: { url: `${APP_URL}/webhooks/${installId}`, events: ["booking.confirmed"], description: "Booking alerts" },
  });
  if (!endpoint) return send(res, 502, `Couldn't register the webhook: ${error?.error.message}`);

  installs.set(installId, { business: business?.name ?? "your business", webhookSecret: endpoint.secret, accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
  send(res, 200, `Installed for ${business?.name}. New bookings will be posted ${SLACK_WEBHOOK_URL ? "to Slack" : "to this app's console"}.`);
}

async function webhook(installId: string, req: IncomingMessage, res: ServerResponse) {
  const found = installs.get(installId);
  const raw = await body(req);
  // Always check the signature: anyone can post to this address.
  if (!found || !(await verifyWebhook(raw, req.headers["ratesspot-signature"] as string | undefined, found.webhookSecret))) return send(res, 400, "Bad signature");
  const event = JSON.parse(raw) as WebhookEvent;
  if (event.type === "booking.confirmed") {
    const b = event.data["booking"] as { reference: string; customer: { name: string } | null; total: number; currency: string; start: string };
    const text = `New booking at ${found.business}: ${b.customer?.name ?? "someone"}, ${b.reference}, from ${new Date(b.start).toUTCString()}`;
    if (SLACK_WEBHOOK_URL) await fetch(SLACK_WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
    else console.log(text);
  }
  // Answer quickly with 2xx; RatesSpot retries anything else for about three days.
  send(res, 200, "ok");
}

function body(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, text: string) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" }).end(text);
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", APP_URL);
  try {
    if (req.method === "GET" && url.pathname === "/install") return install(res);
    if (req.method === "GET" && url.pathname === "/callback") return await callback(url, res);
    const hook = url.pathname.match(/^\/webhooks\/([\w-]+)$/);
    if (req.method === "POST" && hook) return await webhook(hook[1]!, req, res);
    send(res, 404, "Open /install to add Booking alerts to your RatesSpot business.");
  } catch (e) {
    console.error(e);
    send(res, 500, "Something went wrong");
  }
}).listen(PORT, () => console.log(`Booking alerts on ${APP_URL} (install at ${APP_URL}/install)`));
