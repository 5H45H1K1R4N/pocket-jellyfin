// Small HTTP helpers: JSON responses, cookie handling, body parsing.
// Zero dependencies — everything here is node:http primitives.

import crypto from 'node:crypto';

export function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end(payload);
}

export function sendError(res, status, message, extra = {}) {
  sendJson(res, status, { error: message, ...extra });
}

export function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function sessionCookie(token, maxAgeSec) {
  // HttpOnly + SameSite=Lax: not readable from JS, not sent on cross-site
  // form posts. The Hub is plain HTTP on a LAN (no TLS on the phone), so we
  // deliberately do NOT set Secure — it would break over http://192.168.x.x.
  return `hub_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export function clearSessionCookie() {
  return 'hub_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

export async function readJsonBody(req, limitBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('Request body too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

// Simple in-memory rate limiter for auth endpoints (per IP+route).
const buckets = new Map();
export function rateLimit(key, { limit = 10, windowMs = 5 * 60 * 1000 } = {}) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.start > windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

// Periodically prune the limiter map so it can't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.start > 10 * 60 * 1000) buckets.delete(key);
  }
}, 60_000).unref();

export function clientIp(req) {
  return req.socket?.remoteAddress || 'unknown';
}

export function csrfSafe(req) {
  // SameSite=Lax already blocks cross-site POSTs, but belt and braces for
  // any browser that ignores it: require same-origin headers when present.
  const origin = req.headers.origin;
  if (!origin) return true; // curl / same-origin GET-with-body-free requests
  try {
    const host = req.headers.host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function newId() {
  return crypto.randomBytes(12).toString('hex');
}
