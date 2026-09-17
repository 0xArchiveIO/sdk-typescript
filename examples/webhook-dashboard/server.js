// 0xArchive webhook dashboard example.
//
// A single-file receiver plus live dashboard. It accepts signed webhook
// deliveries from 0xArchive, verifies the signature against the raw body,
// keeps the most recent events in memory (optionally appending them to a
// JSONL file), and streams them to the browser over server-sent events.
//
// No dependencies. Node 18 or newer.
//
//   WEBHOOK_SECRET=whsec_... node server.js
//
// Environment:
//   WEBHOOK_SECRET   required; comma-separate two secrets during a rotation
//   PORT             listen port (default 3200)
//   MAX_EVENTS       events kept in memory (default 2000)
//   DATA_FILE        optional JSONL file every accepted event is appended to
//   TOLERANCE_S      max signature age in seconds (default 300)
//   WEBHOOK_PATH     path deliveries are posted to (default /webhook)

"use strict";

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3200);
const MAX_EVENTS = Number(process.env.MAX_EVENTS || 2000);
const TOLERANCE_S = Number(process.env.TOLERANCE_S || 300);
const WEBHOOK_PATH = process.env.WEBHOOK_PATH || "/webhook";
const DATA_FILE = process.env.DATA_FILE || "";
const SECRETS = String(process.env.WEBHOOK_SECRET || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (SECRETS.length === 0) {
  console.error("WEBHOOK_SECRET is required (the secret shown once when you created the endpoint).");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Signature verification. The header is `0xa-signature: t=<unix>,v1=<hex>`
// and may carry more than one v1 during the 24 hours after a secret rotation.
// The digest is HMAC-SHA256(secret, "<t>." + raw body).
// ---------------------------------------------------------------------------
function verifySignature(sigHeader, rawBody) {
  if (!sigHeader) return { ok: false, reason: "missing signature header" };
  const parts = sigHeader.split(",").map((p) => p.split("=", 2));
  const t = (parts.find(([k]) => k.trim() === "t") || [])[1];
  const sigs = parts.filter(([k]) => k.trim() === "v1").map(([, v]) => (v || "").trim());
  if (!t || sigs.length === 0) return { ok: false, reason: "malformed signature header" };
  const age = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(age) || age > TOLERANCE_S) return { ok: false, reason: `signature timestamp outside tolerance (${Math.round(age)}s)` };
  for (const secret of SECRETS) {
    const expected = crypto.createHmac("sha256", secret).update(`${t}.`).update(rawBody).digest("hex");
    const ok = sigs.some(
      (s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s))
    );
    if (ok) return { ok: true };
  }
  return { ok: false, reason: "digest mismatch" };
}

// ---------------------------------------------------------------------------
// In-memory store: newest last, bounded, deduplicated by event id.
// ---------------------------------------------------------------------------
const events = [];
const seen = new Set();
const stats = { received: 0, accepted: 0, duplicates: 0, rejected: 0, startedAt: new Date().toISOString() };
const clients = new Set();

function remember(ev) {
  events.push(ev);
  seen.add(ev.id);
  while (events.length > MAX_EVENTS) {
    const old = events.shift();
    seen.delete(old.id);
  }
  if (DATA_FILE) fs.appendFile(DATA_FILE, JSON.stringify(ev) + "\n", () => {});
  const line = `data: ${JSON.stringify(ev)}\n\n`;
  for (const res of clients) res.write(line);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

function summary() {
  const byType = {};
  const chainToObserved = [];
  const observedToReceived = [];
  const chainToReceived = [];
  let late = 0;
  const perMinute = {};
  for (const ev of events) {
    byType[ev.type] = (byType[ev.type] || 0) + 1;
    if (ev.late) late += 1;
    const minute = ev.received_at.slice(0, 16);
    perMinute[minute] = (perMinute[minute] || 0) + 1;
    const received = Date.parse(ev.received_at);
    const observed = Date.parse(ev.observed_at);
    const chain = ev.chain_ts ? Date.parse(ev.chain_ts) : NaN;
    if (Number.isFinite(observed) && Number.isFinite(received)) observedToReceived.push(received - observed);
    if (Number.isFinite(chain) && Number.isFinite(observed)) chainToObserved.push(observed - chain);
    if (Number.isFinite(chain) && Number.isFinite(received)) chainToReceived.push(received - chain);
  }
  const pct = (arr) => {
    const s = arr.slice().sort((a, b) => a - b);
    return { n: s.length, p50: percentile(s, 50), p95: percentile(s, 95), p99: percentile(s, 99) };
  };
  return {
    ...stats,
    inMemory: events.length,
    late,
    byType,
    perMinute,
    latencyMs: {
      chainToObserved: pct(chainToObserved),
      observedToReceived: pct(observedToReceived),
      chainToReceived: pct(chainToReceived),
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const PUBLIC_DIR = path.join(__dirname, "public");

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 2 * 1024 * 1024) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  // The webhook receiver. Acknowledge fast; everything else is bookkeeping.
  if (req.method === "POST" && url.pathname === WEBHOOK_PATH) {
    stats.received += 1;
    let raw;
    try {
      raw = await readBody(req);
    } catch (e) {
      stats.rejected += 1;
      return send(res, 413, JSON.stringify({ error: String(e.message) }));
    }
    const check = verifySignature(req.headers["0xa-signature"], raw);
    if (!check.ok) {
      stats.rejected += 1;
      console.warn(`rejected delivery: ${check.reason}`);
      return send(res, 401, JSON.stringify({ error: check.reason }));
    }
    let payload;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      stats.rejected += 1;
      return send(res, 400, JSON.stringify({ error: "body is not JSON" }));
    }
    const id = payload.id || req.headers["0xa-event-id"];
    if (!id) {
      stats.rejected += 1;
      return send(res, 400, JSON.stringify({ error: "missing event id" }));
    }
    // Acknowledge before doing anything else. 0xArchive retries on non-2xx.
    send(res, 200, JSON.stringify({ ok: true }));
    if (seen.has(id)) {
      stats.duplicates += 1;
      return;
    }
    stats.accepted += 1;
    const data = payload.data || {};
    remember({
      id,
      type: payload.type || req.headers["0xa-event-type"] || "unknown",
      received_at: new Date().toISOString(),
      observed_at: payload.observed_at || null,
      chain_ts: typeof data.timestamp === "string" ? data.timestamp : null,
      late: payload.late === true,
      late_ms: typeof payload.late_ms === "number" ? payload.late_ms : null,
      data,
    });
    return;
  }

  if (req.method !== "GET") return send(res, 405, JSON.stringify({ error: "method not allowed" }));

  if (url.pathname === "/events") {
    const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit") || 200)));
    const type = url.searchParams.get("type");
    const out = (type ? events.filter((e) => e.type === type) : events).slice(-limit);
    return send(res, 200, JSON.stringify(out));
  }
  if (url.pathname === "/stats") return send(res, 200, JSON.stringify(summary()));
  if (url.pathname === "/health") return send(res, 200, JSON.stringify({ status: "ok", ...stats, inMemory: events.length }));

  if (url.pathname === "/stream") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    res.write(`event: hello\ndata: ${JSON.stringify({ recent: events.slice(-100) })}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 25000);
    req.on("close", () => {
      clearInterval(ping);
      clients.delete(res);
    });
    return;
  }

  // Static files for the dashboard.
  const file = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  const full = path.join(PUBLIC_DIR, file);
  if (!full.startsWith(PUBLIC_DIR) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    return send(res, 404, JSON.stringify({ error: "not found" }));
  }
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
  return send(res, 200, fs.readFileSync(full), types[path.extname(full)] || "application/octet-stream");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`webhook dashboard listening on http://127.0.0.1:${PORT}  (deliveries: POST ${WEBHOOK_PATH})`);
});
