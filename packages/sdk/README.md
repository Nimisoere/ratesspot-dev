# @ratesspot/sdk

A typed client for the [RatesSpot API](https://api.ratesspot.com/docs) (built on [openapi-fetch](https://openapi-ts.dev/openapi-fetch/)), and webhook signature verification. MIT.

```ts
import { createRatesSpot, verifyWebhook } from "@ratesspot/sdk";

const rs = createRatesSpot({ apiKey: process.env.RATESSPOT_API_KEY! }); // rs_test_sk_… on servers, rs_test_pk_… in browsers
const { data, error } = await rs.GET("/v1/resources");

// In your webhook handler (raw body, before parsing):
const ok = await verifyWebhook(rawBody, request.headers.get("ratesspot-signature"), process.env.WEBHOOK_SECRET!);
```

Every path, parameter and response is typed from the API's OpenAPI description. Holds get an idempotency key automatically, so a retry never takes a second room. Guides: [ratesspot.com/docs](https://ratesspot.com/docs).
