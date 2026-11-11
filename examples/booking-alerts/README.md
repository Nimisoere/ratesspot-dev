# Booking alerts (example app)

A complete RatesSpot app in one file: businesses install it with OAuth, and it posts each confirmed booking to Slack (or prints it). Use it as the starting point for your own app: invoicing, loyalty, channel managers, messaging.

## Run it

1. In the RatesSpot dashboard, open **Apps → Apps you've built** and register an app:
   - Redirect address: `http://localhost:4000/callback` (or your public address + `/callback`)
   - Copy the **client ID** and **client secret** (shown once).
2. Webhooks must reach this app from the internet. Locally, use a tunnel (e.g. `cloudflared tunnel --url http://localhost:4000`) and use its address as `APP_URL`, and register `<APP_URL>/callback` as the redirect address.
3. Run it (Node 26):

   ```sh
   RATESSPOT_CLIENT_ID=rs_app_… RATESSPOT_CLIENT_SECRET=rs_cs_… APP_URL=https://your-tunnel.example \
   SLACK_WEBHOOK_URL=https://hooks.slack.com/… npm start -w @ratesspot/example-booking-alerts
   ```

4. Open `<APP_URL>/install`, sign in to RatesSpot (a test business is fine) and approve. Make a booking: the alert arrives.

The business can uninstall it any time from **Apps** in their dashboard; its token and webhook stop working at once.

## What it shows

- OAuth 2.1 authorisation code flow with PKCE and a client secret
- Calling the API with the app's token through `@ratesspot/sdk`
- Registering a webhook endpoint and verifying signatures with `verifyWebhook`

Guide: [Apps, OAuth and the remote MCP server](https://ratesspot.com/docs/oauth-apps). Webhooks: [ratesspot.com/docs/webhooks](https://ratesspot.com/docs/webhooks).
