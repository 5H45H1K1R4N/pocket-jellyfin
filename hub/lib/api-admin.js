// /api/admin/* — user management, album permissions, server settings.
import { listUsers, createUser, updateUser, destroySessionsFor } from './auth.js';
import { albumAcl, setAlbumAcl, scanLibrary } from './photos.js';
import { publicConfig, updateConfig } from './config.js';
import { sendJson, sendError, readJsonBody } from './http.js';

function safeUser(u) {
  return {
    id: u.id, username: u.username, displayName: u.displayName,
    role: u.role, disabled: !!u.disabled, color: u.color || null,
    createdAt: u.createdAt,
  };
}

export async function handleAdmin(req, res, url) {
  const user = req.ctx.user;
  if (user.role !== 'admin') return sendError(res, 403, 'Admins only.');
  const route = url.pathname.replace('/api/admin', '') || '/';

  // ---- users --------------------------------------------------------------
  if (route === '/users' && req.method === 'GET') {
    return sendJson(res, 200, { users: listUsers().map(safeUser) });
  }

  if (route === '/users' && req.method === 'POST') {
    const body = await readJsonBody(req);
    try {
      const created = createUser({
        username: body.username, password: body.password,
        displayName: body.displayName || body.username, role: body.role || 'family',
      });
      return sendJson(res, 201, { user: safeUser(created) });
    } catch (err) {
      return sendError(res, 400, err.message);
    }
  }

  if (route.startsWith('/users/') && req.method === 'PATCH') {
    const id = route.split('/')[2];
    const body = await readJsonBody(req);
    // Never allow disabling/demoting yourself into lockout.
    if (id === user.id && (body.disabled === true || (body.role && body.role !== 'admin'))) {
      return sendError(res, 400, 'You cannot demote or disable your own account.');
    }
    try {
      const updated = updateUser(id, body);
      if (!updated) return sendError(res, 404, 'User not found.');
      if (body.password || body.disabled === true) destroySessionsFor(id);
      return sendJson(res, 200, { user: safeUser(updated) });
    } catch (err) {
      return sendError(res, 400, err.message);
    }
  }

  if (route.startsWith('/users/') && req.method === 'DELETE') {
    const id = route.split('/')[2];
    if (id === user.id) return sendError(res, 400, 'You cannot delete your own account.');
    const { writeCollection } = await import('./store.js');
    const users = listUsers();
    const idx = users.findIndex((u) => u.id === id);
    if (idx === -1) return sendError(res, 404, 'User not found.');
    users.splice(idx, 1);
    writeCollection('users', users);
    destroySessionsFor(id);
    return sendJson(res, 200, { ok: true });
  }

  // ---- album permissions --------------------------------------------------
  if (route === '/albums' && req.method === 'GET') {
    const index = await scanLibrary();
    return sendJson(res, 200, {
      albums: index.albums.map(({ photos, ...a }) => ({ ...a, acl: albumAcl()[a.id] || { visibility: 'private', sharedWith: [] } })),
      users: listUsers().map((u) => ({ id: u.id, displayName: u.displayName })),
    });
  }

  if (route.startsWith('/albums/') && req.method === 'PATCH') {
    const id = route.split('/')[2];
    const body = await readJsonBody(req);
    if (!['everyone', 'private', 'shared'].includes(body.visibility)) {
      return sendError(res, 400, 'visibility must be everyone, private, or shared.');
    }
    setAlbumAcl(id, { visibility: body.visibility, sharedWith: body.sharedWith || [] });
    return sendJson(res, 200, { ok: true, acl: albumAcl()[id] });
  }

  // ---- server settings ----------------------------------------------------
  if (route === '/settings' && req.method === 'GET') {
    return sendJson(res, 200, { settings: publicConfig() });
  }

  if (route === '/settings' && req.method === 'PATCH') {
    const body = await readJsonBody(req);
    const updated = updateConfig(body);
    return sendJson(res, 200, { settings: publicConfig(), applied: updated.hubName });
  }

  return sendError(res, 404, 'Not found.');
}
