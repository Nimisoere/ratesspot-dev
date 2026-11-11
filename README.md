# Build on RatesSpot

[RatesSpot](https://ratesspot.com) is a booking engine for anything people book: rooms by the night, desks by the day, sessions by the hour, places on a course. This repository has everything you need to build on it. MIT licensed.

| | |
|---|---|
| [`packages/sdk`](packages/sdk) | `@ratesspot/sdk`: a typed TypeScript client for the API, and webhook signature verification |
| [`packages/mcp`](packages/mcp) | `@ratesspot/mcp`: the MCP server, so Claude and other AI assistants can set up a business and run its bookings |
| [`apps/booking-page`](apps/booking-page) | The hosted booking page (book.ratesspot.com), built only on the SDK. Fork it to build a booking site |
| [`examples/booking-alerts`](examples/booking-alerts) | A complete app that businesses install with OAuth, listening to webhooks |

## Start

1. Create a test business and get test API keys: [app.ratesspot.com/start](https://app.ratesspot.com/start).
2. Read the docs: [ratesspot.com/docs](https://ratesspot.com/docs), and the API reference at [api.ratesspot.com/docs](https://api.ratesspot.com/docs) (generated from the [OpenAPI spec](https://api.ratesspot.com/openapi.json)).
3. Clone this repo (Node 26):

   ```sh
   npm install
   npm run typecheck
   ```

## Three ways to build

- **A booking site for one business:** use its API keys (publishable in the browser, secret on your server). Start from `apps/booking-page`, or any framework with the SDK.
- **An app many businesses install** (invoicing, loyalty, messaging, channel managers): register an OAuth app in the dashboard under **Apps**. Start from `examples/booking-alerts`.
- **AI assistants:** add `https://api.ratesspot.com/mcp` to Claude as a custom connector, or run `packages/mcp` yourself with an API key.

Apps only ever use the public API, webhooks and OAuth: the same rules RatesSpot's own plugins follow.

## Keeping types current

The SDK and MCP types are generated from the live API description:

```sh
npm run api-types
```

## Contributing

Issues and pull requests are welcome: bugs, examples, and anything the API can't do that your app needs. Security problems: security@ratesspot.com, not a public issue.

## Licence

MIT, copyright Nimisoere Tekena-Lawson. RatesSpot's engine itself is separate and not in this repository.
