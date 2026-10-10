// Photo library: scans configured roots, builds albums, enforces per-user
// permissions on every byte served (thumbnails, full-res, search results).
// Thumbnails use ImageMagick when installed (Termux: pkg install imagemagick);
// without it the API says so and the frontend falls back to scaled originals.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { loadConfig, storageDir } from './config.js';
import { readCollection, writeCollection, newId } from './store.js';

const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.avif']);

let hasIM = null;
export function imageMagickAvailable(cb) {
  if (hasIM !== null) return cb(hasIM);
  execFile('magick', ['-version'], { timeout: 4000 }, (err) => {
    if (!err) { hasIM = 'magick'; return cb(hasIM); }
    execFile('convert', ['-version'], { timeout: 4000 }, (e2) => {
      hasIM = e2 ? false : 'convert';
      cb(hasIM);
    });
  });
}

const INDEX_KEY = 'photo-index';
let scanPromise = null;

function albumIdFor(rootIdx, rel) { return crypto.createHash('sha1').update(`${rootIdx}:${rel}`).digest('hex').slice(0, 16); }
function photoIdFor(albumId, name) { return crypto.createHash('sha1').update(`${albumId}:${name}`).digest('hex').slice(0, 20); }

export function scanLibrary({ force = false } = {}) {
  if (scanPromise) return scanPromise;
  const cached = readCollection(INDEX_KEY, null);
  if (cached && !force && cached.scannedAt && Date.now() - cached.scannedAt < 1000 * 60 * 60 * 12
      && cached.rootsSignature === rootsSignature()) {
    return Promise.resolve(cached);
  }
  scanPromise = doScan().finally(() => { scanPromise = null; });
  return scanPromise;
}

function rootsSignature() {
  return loadConfig().photoRoots.map((r) => {
    try { return `${r}:${fs.statSync(r).mtimeMs}`; } catch { return `${r}:missing`; }
  }).join('|');
}

async function doScan() {
  const cfg = loadConfig();
  const albums = [];
  const photos = [];
  cfg.photoRoots.forEach((root, rootIdx) => {
    let entries;
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return; }
    // Immediate subdirectories are albums; loose files at root go into an
    // album named after the root folder.
    const subdirs = entries.filter((e) => e.isDirectory());
    const looseFiles = entries.filter((e) => e.isFile() && IMG_EXT.has(path.extname(e.name).toLowerCase()));
    const containers = subdirs.map((d) => ({ rel: d.name, dir: path.join(root, d.name) }));
    if (looseFiles.length) containers.unshift({ rel: path.basename(root), dir: root });
    for (const c of containers) {
      let files;
      try { files = fs.readdirSync(c.dir, { withFileTypes: true }); } catch { continue; }
      const id = albumIdFor(rootIdx, c.rel);
      const items = [];
      for (const f of files) {
        if (!f.isFile()) continue;
        const ext = path.extname(f.name).toLowerCase();
        if (!IMG_EXT.has(ext)) continue;
        const full = path.join(c.dir, f.name);
        let st;
        try { st = fs.statSync(full); } catch { continue; }
        const pid = photoIdFor(id, f.name);
        items.push({
          id: pid, name: f.name, size: st.size,
          takenAt: Math.floor((st.mtimeMs || st.birthtimeMs) / 1000),
        });
        photos.push({ id: pid, albumId: id, path: full, size: st.size });
      }
      if (items.length) {
        items.sort((a, b) => b.takenAt - a.takenAt);
        albums.push({
          id, name: c.rel, rootIndex: rootIdx,
          count: items.length,
          coverPhotoId: items[0]?.id || null,
          updatedAt: items[0]?.takenAt || 0,
          photos: items,
        });
      }
    }
  });
  albums.sort((a, b) => b.updatedAt - a.updatedAt);
  const index = { scannedAt: Date.now(), rootsSignature: rootsSignature(), albums, paths: photos, byId: Object.fromEntries(photos.map((p) => [p.id, p.path])) };
  writeCollection(INDEX_KEY, index);
  return index;
}

// ---- permissions -----------------------------------------------------------
// albums.json: { [albumId]: { visibility: 'everyone'|'private'|'shared', sharedWith: [userId] } }
// Default for a freshly discovered album is admin-only until an admin shares it.
export function albumAcl() { return readCollection('albums', {}); }

export function canViewAlbum(user, albumId) {
  if (user.role === 'admin') return true;
  const acl = albumAcl()[albumId];
  if (!acl || acl.visibility === 'private') return user.role === 'admin';
  if (acl.visibility === 'everyone') return true;
  if (acl.visibility === 'shared') return (acl.sharedWith || []).includes(user.id);
  return false;
}

export function setAlbumAcl(albumId, patch) {
  const acl = albumAcl();
  const entry = acl[albumId] || { visibility: 'private', sharedWith: [] };
  if (patch.visibility) entry.visibility = patch.visibility;
  if (patch.sharedWith) entry.sharedWith = [...new Set(patch.sharedWith)];
  acl[albumId] = entry;
  writeCollection('albums', acl);
}

export function albumsForUser(user, index) {
  return index.albums
    .filter((a) => canViewAlbum(user, a.id))
    .map(({ photos, ...rest }) => rest); // metadata only; photo lists fetched per album
}

export function photosForAlbum(user, index, albumId) {
  if (!canViewAlbum(user, albumId)) return null;
  return index.albums.find((a) => a.id === albumId) || null;
}

export function resolvePhoto(user, index, photoId) {
  const rel = index.byId[photoId];
  if (!rel) return null;
  const album = index.albums.find((a) => a.photos.some((p) => p.id === photoId));
  if (!album || !canViewAlbum(user, album.id)) return null; // permission on every byte
  return { path: rel, name: album.photos.find((p) => p.id === photoId).name, albumId: album.id };
}

export function searchPhotos(user, index, query, limit = 60) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return [];
  const out = [];
  for (const album of index.albums) {
    if (!canViewAlbum(user, album.id)) continue; // never leak others' albums
    for (const p of album.photos) {
      if (p.name.toLowerCase().includes(q)) {
        out.push({ id: p.id, name: p.name, albumId: album.id, albumName: album.name, takenAt: p.takenAt });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

// ---- thumbnails ------------------------------------------------------------

const thumbDir = () => path.join(storageDir(), 'thumbs');

export function thumbnailFor(photoId, cb) {
  const index = readCollection(INDEX_KEY, null);
  const src = index?.byId?.[photoId];
  if (!src) return cb(new Error('not-found'));
  imageMagickAvailable((im) => {
    if (!im) return cb(new Error('no-im'));
    const dest = path.join(thumbDir(), `${photoId}.jpg`);
    fs.access(dest, (err) => {
      if (!err) return cb(null, dest);
      fs.mkdirSync(thumbDir(), { recursive: true });
      const args = ['-auto-orient', '-resize', '480x480>', '-quality', '78', '-strip', src, 'jpeg:' + dest];
      execFile(im, args, { timeout: 30000, maxBuffer: 1024 * 1024 }, (e) => {
        if (e) return cb(new Error('no-im'));
        cb(null, dest);
      });
    });
  });
}
