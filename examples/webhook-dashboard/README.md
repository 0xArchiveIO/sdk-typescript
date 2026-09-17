# 0xArchive webhook dashboard example

A small receiver and live dashboard for [0xArchive webhooks](https://docs.0xarchive.io/webhooks). It verifies each delivery's signature, keeps the recent events, and shows them in a browser as they arrive: a live tape, per-event counts, a deliveries-per-minute chart, the `late` flag, and the latency from the block on Hyperliquid to your server.

One file, no dependencies, Node 18 or newer.

## Run it

```bash
WEBHOOK_SECRET=whsec_... node server.js
# dashboard on http://127.0.0.1:3200, deliveries are posted to /webhook
```

0xArchive has to reach your server over HTTPS. For a laptop, a tunnel is the quickest way:

```bash
cloudflared tunnel --url http://127.0.0.1:3200
# or: ngrok http 3200
```

Use the public URL the tunnel prints, with `/webhook` appended, as the endpoint URL below.

## First look without the secret

If you want to see deliveries before you have wired the secret in (a first setup, a shared inbox), start with `ALLOW_UNVERIFIED=1`: deliveries that fail the signature check are still accepted and shown, marked `unverified` on the tape. Never process anything from an unverified delivery; set `WEBHOOK_SECRET` and drop the flag as soon as you have the secret.

## Point 0xArchive at it

Create the endpoint and keep the secret it returns; it is shown once.

```bash
curl -s -X POST https://api.0xarchive.io/v1/webhooks/endpoints \
  -H "X-API-Key: $OXARCHIVE_API_KEY" -H "content-type: application/json" \
  -d '{"url": "https://your-host.example/webhook", "description": "dashboard example"}'
```

Restart the server with that secret in `WEBHOOK_SECRET`, then subscribe to whatever you want to watch. A few that make a good demo:

```bash
E=<endpoint id from the response above>

# every liquidation above 10,000 USD, any market
curl -s -X POST https://api.0xarchive.io/v1/webhooks/subscriptions -H "X-API-Key: $OXARCHIVE_API_KEY" -H "content-type: application/json" \
  -d "{\"endpoint_id\": \"$E\", \"event_type\": \"market.liquidation\", \"filters\": {\"conditions\": [{\"metric\": \"notional_usd\", \"op\": \">=\", \"value\": 10000}]}}"

# every fill on wallets you watch (add them first with POST /v1/webhooks/addresses)
curl -s -X POST https://api.0xarchive.io/v1/webhooks/subscriptions -H "X-API-Key: $OXARCHIVE_API_KEY" -H "content-type: application/json" \
  -d "{\"endpoint_id\": \"$E\", \"event_type\": \"account.fill\", \"filters\": {}}"

# spot transfers touching those wallets
curl -s -X POST https://api.0xarchive.io/v1/webhooks/subscriptions -H "X-API-Key: $OXARCHIVE_API_KEY" -H "content-type: application/json" \
  -d "{\"endpoint_id\": \"$E\", \"event_type\": \"account.transfer\", \"filters\": {}}"

# HIP-3 oracle moves of 2% or more within a few seconds
curl -s -X POST https://api.0xarchive.io/v1/webhooks/subscriptions -H "X-API-Key: $OXARCHIVE_API_KEY" -H "content-type: application/json" \
  -d "{\"endpoint_id\": \"$E\", \"event_type\": \"oracle.jump\", \"filters\": {\"params\": {\"threshold_pct\": 2}}}"
```

Before enabling a condition you are unsure about, try it against real data with `POST /v1/webhooks/subscriptions/dry-run`; the docs page shows the request.

## What the dashboard shows

A control room over the whole exchange, every panel fed by webhooks: plant health per venue and stream (with open gap and stall incidents), live liquidation flow with long and short split, top markets and a cascade badge, oracle and chain status per HIP-3 dex, market structure (open interest deltas, funding flips, breadth, auctions), watched wallets with their hour, a 60 minute incident tape across four rails, and the raw tape of every delivery with its latency. `?demo=1` replays a scripted 40 second incident through the same panels.

- **Block to your server**: the time from the Hyperliquid block that carried the event to the moment this server accepted the delivery. Fills, transfers and liquidations ride the fast path and usually land under a second; events with `latency_class: minutes` in the catalog arrive a few minutes later by design.
- **Block to 0xArchive** and **0xArchive to your server**: the same span split at `observed_at`, so you can tell our pipeline from the network hop to you.
- **Marked late**: deliveries whose payload carries `late: true`, meaning the occurrence was more than ten minutes old when we caught up, for example after an outage on our side. Treat those as history, not as something that just happened.
- The tape keeps the newest 250 deliveries; click a row for the full payload.

## How it verifies deliveries

Every request carries `0xa-signature: t=<unix seconds>,v1=<hex>`. The server recomputes `HMAC-SHA256(secret, "<t>." + raw body)` over the exact bytes received, compares in constant time, and rejects anything older than five minutes. During the 24 hours after you rotate a secret, deliveries carry two `v1` values; put both secrets in `WEBHOOK_SECRET`, comma separated, and either will be accepted.

It acknowledges with a 200 before doing anything else, and deduplicates on the event id, so a retried delivery never shows twice.

## Plant status (optional)

Set `OXARCHIVE_API_KEY` (and `OXARCHIVE_API_URL` if you are not on production) on the server and the plant panel fills in from the data-quality endpoints: venue health and data lag every 15 seconds, 24 hour completeness by data type, and the number of markets covered per venue. Without a key the page shows plant state from the webhook stream alone (open gap and stall incidents).

## Running it somewhere permanent

`DATA_FILE=events.jsonl` appends every accepted event to disk. Put the server behind your reverse proxy with HTTPS and buffering off on `/stream` (server-sent events); with nginx that is `proxy_buffering off;` on that location. A `Dockerfile` is included:

```bash
docker build -t webhook-dashboard . && docker run -e WEBHOOK_SECRET=whsec_... -p 3200:3200 webhook-dashboard
```

The dashboard has no login. It shows whatever your subscriptions deliver, so put it behind your own access control if that is not public information.
