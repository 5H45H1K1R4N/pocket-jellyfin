// /api/status/* — service status, members presence, announcements.
import { allServices } from './services.js';
import { loadConfig } from './config.js';
import { listUsers, lastSeenFor, presenceOf } from './auth.js';
import { readCollection } from './store.js';
import { sendJson, sendError, readJsonBody, newId } from './http.js';

export async function handleStatus(req, res, url) {
  const route = url.pathname.replace('/api/status', '') || '/';
  const me = req.ctx.user;

  if (route === '/services' && req.method === 'GET') {
    const services = await allServices();
    return sendJson(res, 200, { hubName: loadConfig().hubName, ...services });
  }

  // Members panel: Hub accounts with honest presence derived only from
  // authenticated Hub activity — we never claim to see Wi-Fi devices.
  if (route === '/members' && req.method === 'GET') {
    const members = listUsers()
      .filter((u) => !u.disabled)
      .map((u) => {
        const lastSeen = lastSeenFor(u.id);
        return {
          id: u.id,
          displayName: u.displayName,
          role: u.role,
          color: u.color || null,
          presence: u.id === me.id ? 'online' : presenceOf(lastSeen),
          isSelf: u.id === me.id,
        };
      })
      .sort((a, b) => {
        const rank = { online: 0, idle: 1, offline: 2 };
        return rank[a.presence] - rank[b.presence] || a.displayName.localeCompare(b.displayName);
      });
    return sendJson(res, 200, {
      label: 'Home Hub Members', // not a Wi-Fi device list — say what it is
      members,
      note: 'Presence reflects Home Hub sign-in activity. Wi-Fi device discovery is not available.',
    });
  }

  // Announcements: everyone signed in can read; only admins can post.
  if (route === '/announcements' && req.method === 'GET') {
    const items = readCollection('announcements', []).sort((a, b) => b.createdAt - a.createdAt);
    return sendJson(res, 200, { items });
  }

  if (route === '/announcements' && req.method === 'POST') {
    if (me.role !== 'admin') return sendError(res, 403, 'Admins only.');
    const body = await readJsonBody(req);
    const title = String(body.title || '').trim().slice(0, 120);
    const text = String(body.text || '').trim().slice(0, 2000);
    if (!title || !text) return sendError(res, 400, 'Title and text are required.');
    const item = {
      id: newId(), title, text,
      authorName: me.displayName,
      createdAt: Date.now(),
    };
    const all = readCollection('announcements', []);
    all.push(item);
    const { writeCollection } = await import('./store.js');
    writeCollection('announcements', all);
    return sendJson(res, 201, { item });
  }

  if (route.startsWith('/announcements/') && req.method === 'DELETE') {
    if (me.role !== 'admin') return sendError(res, 403, 'Admins only.');
    const id = route.split('/')[2];
    const all = readCollection('announcements', []);
    const idx = all.findIndex((a) => a.id === id);
    if (idx === -1) return sendError(res, 404, 'Not found.');
    all.splice(idx, 1);
    const { writeCollection } = await import('./store.js');
    writeCollection('announcements', all);
    return sendJson(res, 200, { ok: true });
  }

  return sendError(res, 404, 'Not found.');
}
