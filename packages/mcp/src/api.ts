import createClient from "openapi-fetch";
import type { components, paths } from "./ratesspot-api";

export type Schemas = components["schemas"];
export type Api = ReturnType<typeof createClient<paths>>;

export interface Connection {
  baseUrl: string;
  apiKey: string;
  /** For tests: call the API in-process instead of over the network. */
  fetch?: (request: Request) => Promise<Response>;
}

/** A RatesSpot API error, with the API's own message so the agent can explain or fix it. */
export class RatesSpotError extends Error {
  readonly code: string;
  readonly details: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function createApi(connection: Connection) {
  const api = createClient<paths>({
    baseUrl: connection.baseUrl.replace(/\/$/, ""),
    headers: { authorization: `Bearer ${connection.apiKey}`, "user-agent": "ratesspot-mcp/0.1" },
    ...(connection.fetch ? { fetch: connection.fetch } : {}),
  });

  /** Returns the data, or throws a RatesSpotError carrying the API's error. */
  async function ok<T>(call: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
    const { data, error, response } = await call;
    if (error !== undefined || !response.ok) {
      const e = (error as { error?: { code?: string; message?: string; details?: unknown } } | undefined)?.error;
      throw new RatesSpotError(e?.code ?? `http_${response.status}`, e?.message ?? `RatesSpot answered ${response.status}.`, e?.details);
    }
    return data as T;
  }

  /** Multipart uploads (photos), which openapi-fetch doesn't type. */
  async function upload<T>(path: string, form: FormData): Promise<T> {
    const request = new Request(`${connection.baseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${connection.apiKey}` },
      body: form,
    });
    const response = await (connection.fetch ?? fetch)(request);
    const body = (await response.json().catch(() => ({}))) as { error?: { code: string; message: string; details?: unknown } };
    if (!response.ok) throw new RatesSpotError(body.error?.code ?? `http_${response.status}`, body.error?.message ?? `Upload failed (${response.status}).`, body.error?.details);
    return body as T;
  }

  return { api, ok, upload };
}

export type Client = ReturnType<typeof createApi>;
