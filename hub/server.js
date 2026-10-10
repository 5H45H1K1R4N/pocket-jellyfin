// Peppy Home Hub — entry point. Zero-dependency node:http server.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, dataDir } from './lib/config.js';
import { ensureDataDir } from './lib/store.js';
import { parseCookies, sendError, csrfSafe } from './lib/http.js';
import { resolveSession, touchSession } from './lib/auth.js';
import { handleAuth } from './lib/api-auth.js';
import { handleStatus } from './lib/api-status.js';
import { handleMedia } from './lib/api-media.js';
import { handleAdmin } from './lib/api-admin.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

ensureDataDir();
loadConfig();

// Attach req.ctx = { user, session } for authenticated routes.
function attachUser(req) {
  const token = parseCookies(req).hub_session;
  const resolved = resolveSession(token);
  req.ctx = { token, user: resolved?.user || null, session: resolved?.session || null };
  if (resolved) touchSession(resolved.session, { ip: req.socket.remoteAddress });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  try {
    // ---- API ------------------------------------------------------------
    if (p.startsWith('/api/')) {
      attachUser(req);
      // Mutations must be same-origin (CSRF belt-and-braces with SameSite).
      if (!['GET', 'HEAD'].includes(req.method) && !csrfSafe(req)) {
        return sendError(res, 403, 'Cross-origin request blocked.');
      }
      // Auth endpoints manage their own session logic.
      if (p.startsWith('/api/auth/')) return await handleAuth(req, res, url);
      if (!req.ctx.user) return sendError(res, 401, 'Sign in required.');
      if (p.startsWith('/api/status')) return await handleStatus(req, res, url);
      if (p.startsWith('/api/media')) return await handleMedia(req, res, url);
      if (p.startsWith('/api/admin')) return await handleAdmin(req, res, url);
      return sendError(res, 404, 'Not found.');
    }

    // ---- static ---------------------------------------------------------
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendError(res, 405, 'Method not allowed.');
    let filePath = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(p)));
    if (!filePath.startsWith(PUBLIC_DIR)) return sendError(res, 403, 'Forbidden.');
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(PUBLIC_DIR, 'index.html'); // SPA fallback
    }
    const ext = path.extname(filePath).toLowerCase();
    const body = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': body.length,
      // LAN hub: files are tiny and admins may edit them in place, so always
      // revalidate rather than letting devices cache stale CSS/JS for minutes.
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (err) {
    console.error(`[hub] ${req.method} ${p} → ${err.stack || err.message}`);
    if (!res.headersSent) sendError(res, 500, 'Internal server error.');
    else res.end();
  }
});

const cfg = loadConfig();
server.listen(cfg.port, cfg.host, () => {
  console.log(`\n  Peppy Home Hub running:`);
  console.log(`    LAN:   http://192.168.31.178:${cfg.port}`);
  console.log(`    Local: http://127.0.0.1:${cfg.port}`);
  console.log(`  Data: ${dataDir()}\n`);
});
