# RatesSpot MCP server

Lets an AI agent (Claude, or any MCP client) set up a business on RatesSpot and run its bookings: listings, prices, photos, opening hours, courses, ways to pay, availability, quotes, bookings, payments and cancellations. It uses only the public RatesSpot API, so it can do exactly what the API key allows and nothing more.

MIT licensed.

## Use it

**Easiest: the hosted server.** Add `https://api.ratesspot.com/mcp` as a custom connector in Claude (Settings → Connectors). You sign in to RatesSpot and choose a business; no API key to copy. The rest of this section runs it yourself with an API key.

**Run it from npm** with a RatesSpot secret API key:

```sh
claude mcp add ratesspot --env RATESSPOT_API_KEY=rs_live_sk_… -- npx -y @ratesspot/mcp
```

Or in Claude Desktop's `claude_desktop_config.json`: `"command": "npx", "args": ["-y", "@ratesspot/mcp"], "env": { "RATESSPOT_API_KEY": "rs_live_sk_…" }`.

To run it from a copy of the source instead: you need a RatesSpot **secret** API key for the business (dashboard → API keys → "Full access"). The key decides which business the agent works on.

**Claude Code**

```sh
claude mcp add ratesspot --env RATESSPOT_API_KEY=rs_live_sk_… -- node /path/to/ratesspot-dev/packages/mcp/src/server.ts
```

**Claude Desktop** (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "ratesspot": {
      "command": "node",
      "args": ["/path/to/ratesspot-dev/packages/mcp/src/server.ts"],
      "env": { "RATESSPOT_API_KEY": "rs_live_sk_…" }
    }
  }
}
```

Needs Node 26 (it runs the TypeScript directly). `RATESSPOT_API_URL` defaults to `https://api.ratesspot.com`; set it for a self-hosted server.

Then ask things like: *"Set up my guesthouse: three double rooms at ₦30,000 a night, guests can pay a night's deposit by bank transfer to GTBank 0123456789"*, or *"Who's arriving tomorrow?"*, or *"Cancel Kemi's booking and tell me what she gets back."*

## Tools

| Tool | What it does |
|---|---|
| `get_business` | Currency, timezone, what's left to set up, how guests can pay |
| `list_catalog` | Listings with units, rates and photos; add-ons; courses |
| `create_listing` | A listing with its units and first rate |
| `update_listing` | Name, description, features, web address, capacity, on/off |
| `set_rate` | Add or change a price and the ways to pay it |
| `add_photo` | A photo from a local file or https URL |
| `create_course` | A course or event with seats on dates (or dates to be announced) |
| `set_opening_hours` | Weekly hours for the business or one listing |
| `set_payment_methods` | Card on/off, bank transfer details |
| `check_availability` | Free units or seats per day, prices, start times |
| `quote` | Exact price, taxes, terms and ways to pay, without booking |
| `book` | Book for a customer: pay at the desk, by bank transfer, or on arrival |
| `find_bookings` | Search, or today's arrivals, departures, in-house |
| `get_calendar` | Who's in which unit, day by day, with closures |
| `get_booking` | One booking in full, with what cancelling would refund |
| `record_payment` | Cash, POS or bank transfer received |
| `cancel_booking` | Previews the refund; cancels only with `confirm: true` |

Amounts are in normal currency units (`30000` = ₦30,000) and times are local to the business (`2026-12-08T10:00`); the tools convert to the API's minor units and exact times. `cancel_booking` is marked destructive, and read-only tools are marked read-only, so clients can ask before acting.

## API gaps it found (all closed)

Building this is the test of whether an agent can run a business through the API alone. It found three gaps, now fixed in the API:

1. Every booking needed the customer's email. Now a name plus an email **or** a phone number is enough (card checkout still needs an email for the receipt).
2. Hourly bookings needed exact times with an offset. The API now also takes local times (`2026-12-08T10:00`) in the business's timezone.
3. Bookings couldn't be listed by date range. `GET /v1/bookings?from=&to=` now can, and `GET /v1/calendar` gives a whole unit-by-day view in one call.

## Develop

```sh
npm test -w @ratesspot/mcp        # drives the real API in-process: sets up a business from nothing and books it
npm run api-types -w @ratesspot/mcp   # after the API changes
```

Before publishing to npm it needs a build step: Node doesn't run TypeScript from `node_modules`.
