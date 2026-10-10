// File Drop: store uploads per-user, track an index, enforce ownership.
import fs from 'node:fs';
import path from 'node:path';
import { storageDir } from './config.js';
import { readCollection, writeCollection, newId } from './store.js';

const KEY = 'files';
export const dropDir = () => path.join(storageDir(), 'drop');

export function listFilesFor(user) {
  const all = readCollection(KEY, []);
  // Owners see their own; admins see everything; shared files are visible
  // only when explicitly shared with "everyone".
  return all
    .filter((f) => f.ownerId === user.id || user.role === 'admin' || f.visibility === 'everyone')
    .sort((a, b) => b.uploadedAt - a.uploadedAt);
}

export function recordUpload({ originalName, storedName, size, mime, ownerId, visibility }) {
  const entry = {
    id: newId(),
    originalName: String(originalName).slice(0, 200),
    storedName,
    size,
    mime: mime || 'application/octet-stream',
    ownerId,
    visibility: visibility === 'everyone' ? 'everyone' : 'private',
    uploadedAt: Date.now(),
  };
  const all = readCollection(KEY, []);
  all.push(entry);
  writeCollection(KEY, all);
  return entry;
}

export function findFile(id, user) {
  const entry = readCollection(KEY, []).find((f) => f.id === id);
  if (!entry) return null;
  const allowed = entry.ownerId === user.id || user.role === 'admin' || entry.visibility === 'everyone';
  if (!allowed) return null;
  return entry;
}

export function deleteFile(id, user) {
  const all = readCollection(KEY, []);
  const idx = all.findIndex((f) => f.id === id);
  if (idx === -1) return false;
  if (all[idx].ownerId !== user.id && user.role !== 'admin') return false;
  fs.rm(path.join(dropDir(), all[idx].storedName), { force: true }, () => {});
  all.splice(idx, 1);
  writeCollection(KEY, all);
  return true;
}

export function safeStoredName(file) {
  return path.basename(file.path);
}
