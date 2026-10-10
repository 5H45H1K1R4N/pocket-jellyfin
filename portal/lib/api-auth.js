// /api/auth/* — login, logout, me, password change, first-run admin setup.
import {
  findUserByName, verifyPassword, createUser, updateUser, hasUsers,
  createSession, destroySession, ROLES,
} from './auth.js';
import { sendJson, sendError, readJsonBody, sessionCookie, clearSessionCookie, rateLimit, clientIp } from './http.js';
import { loadConfig } from './config.js';

function safeUser(u) {
  return { id: u.id, username: u.username, displayName: u.displayName, role: u.role, color: u.color || null };
}

export async function handleAuth(req, res, url) {
  const route = url.pathname.replace('/api/auth', '') || '/';
  const ip = clientIp(req);

  if (route === '/setup' && req.method === 'POST') {
    // First-run only: create the initial admin when no users exist yet.
    if (hasUsers()) return sendError(res, 403, 'Setup already completed.');
    const body = await readJsonBody(req);
    try {
      const user = createUser({
        username: body.username, password: body.password,
        displayName: body.displayName || body.username, role: 'admin',
      });
      const token = createSession(user.id, { ip, ua: req.headers['user-agent'] });
      return sendJson(res, 201, { user: safeUser(user) }, {
        'Set-Cookie': sessionCookie(token, loadConfig().sessionDays * 86400),
      });
    } catch (err) {
      return sendError(res, 400, err.message);
    }
  }

  if (route === '/login' && req.method === 'POST') {
    if (!rateLimit(`login:${ip}`, { limit: 10, windowMs: 5 * 60 * 1000 })) {
      return sendError(res, 429, 'Too many attempts. Try again in a few minutes.');
    }
    const body = await readJsonBody(req);
    const user = findUserByName(body.username);
    // Same message + comparable work for unknown user vs wrong password.
    const ok = user && !user.disabled && verifyPassword(String(body.password || ''), user.passwordHash);
    if (!ok) return sendError(res, 401, 'Invalid username or password.');
    const token = createSession(user.id, { ip, ua: req.headers['user-agent'] });
    return sendJson(res, 200, { user: safeUser(user) }, {
      'Set-Cookie': sessionCookie(token, loadConfig().sessionDays * 86400),
    });
  }

  if (route === '/logout' && req.method === 'POST') {
    destroySession(req.ctx.token);
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() });
  }

  if (route === '/me' && req.method === 'GET') {
    if (!req.ctx.user) return sendError(res, 401, 'Not signed in.');
    return sendJson(res, 200, {
      user: safeUser(req.ctx.user),
      needsSetup: !hasUsers(),
    });
  }

  if (route === '/password' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const u = req.ctx.user;
    if (!verifyPassword(String(body.currentPassword || ''), u.passwordHash)) {
      return sendError(res, 403, 'Current password is incorrect.');
    }
    try {
      updateUser(u.id, { password: body.newPassword });
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      return sendError(res, 400, err.message);
    }
  }

  return sendError(res, 404, 'Not found.');
}
