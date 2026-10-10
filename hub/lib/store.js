// Tiny JSON-file persistence with atomic writes.
// Perfect for a household-sized home server: no native modules, no daemon.
// Every collection is one JSON file in the data directory.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dataDir } from './config.js';

function fileFor(name) {
  return path.join(dataDir(), `${name}.json`);
}

const cache = new Map();

export function readCollection(name, fallback) {
  if (cache.has(name)) return cache.get(name);
  const file = fileFor(name);
  let value = fallback;
  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // Corrupt file: keep the raw copy for manual recovery, start fresh.
      try {
        fs.renameSync(file, `${file}.corrupt-${Date.now()}`);
        console.error(`[store] ${file} was corrupt; moved aside and reset.`);
      } catch { /* ignore */ }
    }
  }
  cache.set(name, value);
  return value;
}

export function writeCollection(name, value) {
  cache.set(name, value);
  const file = fileFor(name);
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file); // atomic on the same filesystem
}

export function newId() {
  return crypto.randomBytes(12).toString('hex');
}

export function cryptoRandomHex(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function ensureDataDir() {
  fs.mkdirSync(dataDir(), { recursive: true });
}
