// /api/media/* — photos (permission-enforced per byte) and File Drop.
import fs from 'node:fs';
import path from 'node:path';
import { storageDir, loadConfig } from './config.js';
import {
  scanLibrary, albumsForUser, photosForAlbum, resolvePhoto, searchPhotos,
  thumbnailFor, imageMagickAvailable,
} from './photos.js';
import { parseMultipart } from './multipart.js';
import { listFilesFor, recordUpload, findFile, deleteFile, dropDir } from './files.js';
import { sendJson, sendError } from './http.js';

const SEND_OPTS = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=300' };

function streamFile(res, filePath, mime, req) {
  const st = fs.statSync(filePath);
  const range = req.headers.range;
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    if (m) {
      const start = m[1] ? Number(m[1]) : 0;
      const end = m[2] ? Number(m[2]) : st.size - 1;
      if (start < st.size && end >= start) {
        res.writeHead(206, {
          ...SEND_OPTS, 'Content-Type': mime,
          'Content-Length': end - start + 1,
          'Content-Range': `bytes ${start}-${end}/${st.size}`,
          'Accept-Ranges': 'bytes',
        });
        return fs.createReadStream(filePath, { start, end }).pipe(res);
      }
    }
  }
  res.writeHead(200, { ...SEND_OPTS, 'Content-Type': mime, 'Content-Length': st.size, 'Accept-Ranges': 'bytes' });
  fs.createReadStream(filePath).pipe(res);
}

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.webp': 'image/webp', '.heic': 'image/heic', '.avif': 'image/avif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8', '.zip': 'application/zip',
};

export async function handleMedia(req, res, url) {
  const route = url.pathname.replace('/api/media', '');
  const user = req.ctx.user;

  // Lazy import avoids a circular init with store's collection cache.
  const index = await scanLibrary();

  // ---- photos -------------------------------------------------------------
  if (route === '/photos/albums' && req.method === 'GET') {
    const thumbs = await new Promise((r) => imageMagickAvailable((v) => r(!!v)));
    return sendJson(res, 200, { albums: albumsForUser(user, index), thumbnails: thumbs });
  }

  if (route.startsWith('/photos/album/') && req.method === 'GET') {
    const album = photosForAlbum(user, index, route.split('/')[4]);
    if (!album) return sendError(res, 404, 'Album not found.');
    return sendJson(res, 200, { album: { id: album.id, name: album.name, photos: album.photos } });
  }

  if (route.startsWith('/photos/thumb/') && req.method === 'GET') {
    const id = route.split('/')[4];
    // Permission check happens inside resolvePhoto — before any byte is sent.
    if (!resolvePhoto(user, index, id)) return sendError(res, 404, 'Not found.');
    return thumbnailFor(id, (err, thumbPath) => {
      if (err) {
        // No ImageMagick: fall back to the original (frontend sets loading=lazy).
        const photo = resolvePhoto(user, index, id);
        if (!photo) return sendError(res, 404, 'Not found.');
        return streamFile(res, photo.path, MIME_BY_EXT[path.extname(photo.name).toLowerCase()] || 'application/octet-stream', req);
      }
      streamFile(res, thumbPath, 'image/jpeg', req);
    });
  }

  if (route.startsWith('/photos/raw/') && req.method === 'GET') {
    const photo = resolvePhoto(user, index, route.split('/')[4]);
    if (!photo) return sendError(res, 404, 'Not found.');
    streamFile(res, photo.path, MIME_BY_EXT[path.extname(photo.name).toLowerCase()] || 'application/octet-stream', req);
    return;
  }

  if (route === '/photos/search' && req.method === 'GET') {
    return sendJson(res, 200, { results: searchPhotos(user, index, url.searchParams.get('q')) });
  }

  if (route === '/photos/rescan' && req.method === 'POST') {
    if (user.role !== 'admin') return sendError(res, 403, 'Admins only.');
    const fresh = await scanLibrary({ force: true });
    return sendJson(res, 200, { albums: albumsForUser(user, fresh), count: fresh.albums.length });
  }

  // ---- file drop ----------------------------------------------------------
  if (route === '/files' && req.method === 'GET') {
    return sendJson(res, 200, {
      files: listFilesFor(user).map((f) => ({
        id: f.id, name: f.originalName, size: f.size, mime: f.mime,
        uploadedAt: f.uploadedAt, visibility: f.visibility,
        ownerName: f.ownerId === user.id ? 'you' : 'someone else',
        mine: f.ownerId === user.id,
      })),
      maxUploadMB: loadConfig().maxUploadMB,
    });
  }

  if (route === '/files' && req.method === 'POST') {
    const cfg = loadConfig();
    let parsed;
    try {
      parsed = await parseMultipart(req, {
        maxFileBytes: cfg.maxUploadMB * 1024 * 1024,
        maxFiles: cfg.maxFilesPerUpload,
        tmpDir: path.join(storageDir(), 'tmp'),
      });
    } catch (err) {
      return sendError(res, err.status || 400, err.message);
    }
    fs.mkdirSync(dropDir(), { recursive: true });
    const saved = [];
    for (const f of parsed.files) {
      const stored = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${f.filename.replace(/[^\w.\-]+/g, '_').slice(0, 120)}`;
      fs.renameSync(f.path, path.join(dropDir(), stored));
      const entry = recordUpload({
        originalName: f.filename, storedName: stored, size: f.size, mime: f.mime,
        ownerId: user.id, visibility: parsed.fields.visibility,
      });
      saved.push({ id: entry.id, name: entry.originalName, size: entry.size, visibility: entry.visibility });
    }
    return sendJson(res, 201, { files: saved });
  }

  if (route.startsWith('/files/') && route.endsWith('/download') && req.method === 'GET') {
    const id = route.split('/')[2];
    const entry = findFile(id, user);
    if (!entry) return sendError(res, 404, 'Not found.');
    const full = path.join(dropDir(), entry.storedName);
    if (!fs.existsSync(full)) return sendError(res, 410, 'File no longer exists on the server.');
    streamFile(res, full, entry.mime, req);
    return;
  }

  if (route.startsWith('/files/') && req.method === 'DELETE') {
    const id = route.split('/')[2];
    if (!deleteFile(id, user)) return sendError(res, 403, 'Not allowed.');
    return sendJson(res, 200, { ok: true });
  }

  return sendError(res, 404, 'Not found.');
}
