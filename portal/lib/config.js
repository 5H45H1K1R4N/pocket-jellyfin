// Configuration for Peppy Home Hub.
// Precedence: environment variable > config.json > defaults.
// config.json lives in the data directory and is created on first run.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DEFAULTS = {
  // HTTP listener. 0.0.0.0 = reachable on the home network only (no port
  // forwarding is performed anywhere; keep it that way).
  host: '0.0.0.0',
  port: 7777,

  // Displayed in the sidebar header and on the sign-in screen.
  hubName: 'Peppy Home Hub',

  // Jellyfin (never expose credentials to the frontend; we only probe health).
  jellyfin: {
    // Reachable from the Hub server process itself.
    url: 'http://127.0.0.1:8096',
    // Shown to users as the "Open Jellyfin" link. Leave null to derive it
    // from the request host (correct when the phone's IP has not changed).
    publicUrl: null,
    timeoutMs: 2500,
  },

  // Minecraft: Java Edition (PaperMC in Debian PRoot).
  minecraft: {
    host: '127.0.0.1',
    port: 25565,
    // Address shown to players for joining (phone's LAN IP, may change).
    publicAddress: '192.168.31.178',
    timeoutMs: 2500,
  },

  // Photo library roots. Each immediate subdirectory becomes an album.
  // On Termux grant storage access first (termux-setup-storage), then point
  // this at e.g. /storage/emulated/0/DCIM and /storage/emulated/0/Pictures.
  photoRoots: [],

  // File Drop limits.
  maxUploadMB: 2048,
  maxFilesPerUpload: 10,

  // Presence windows (milliseconds).
  presenceOnlineMs: 3 * 60 * 1000,
  presenceIdleMs: 20 * 60 * 1000,

  // Session lifetime.
  sessionDays: 30,

  // Rescan the photo library automatically every N minutes (0 = manual only).
  photoRescanMinutes: 30,
};

function deepMerge(base, override) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(override || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

let cached = null;

export function dataDir() {
  return process.env.HUB_DATA_DIR
    ? path.resolve(process.env.HUB_DATA_DIR)
    : path.join(process.cwd(), 'data');
}

export function storageDir() {
  return process.env.HUB_STORAGE_DIR
    ? path.resolve(process.env.HUB_STORAGE_DIR)
    : path.join(process.cwd(), 'storage');
}

export function loadConfig() {
  if (cached) return cached;
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  let fileCfg = {};
  const cfgPath = path.join(dir, 'config.json');
  if (fs.existsSync(cfgPath)) {
    try {
      fileCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    } catch (err) {
      console.error(`[config] Could not parse ${cfgPath}: ${err.message} (using defaults)`);
    }
  }
  let cfg = deepMerge(DEFAULTS, fileCfg);

  // Environment overrides (used for one-off runs, not required).
  if (process.env.HUB_HOST) cfg.host = process.env.HUB_HOST;
  if (process.env.HUB_PORT) cfg.port = Number(process.env.HUB_PORT);
  if (process.env.JELLYFIN_URL) cfg.jellyfin.url = process.env.JELLYFIN_URL;
  if (process.env.MC_HOST) cfg.minecraft.host = process.env.MC_HOST;
  if (process.env.MC_PORT) cfg.minecraft.port = Number(process.env.MC_PORT);

  // Normalize paths the user may have written as "~/...".
  cfg.photoRoots = (cfg.photoRoots || []).map((p) =>
    String(p).startsWith('~') ? path.join(os.homedir(), String(p).slice(1)) : String(p)
  );

  // Persist defaults so admins can edit config.json directly later.
  if (!fs.existsSync(cfgPath)) {
    try {
      fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    } catch (err) {
      console.error(`[config] Could not write ${cfgPath}: ${err.message}`);
    }
  }

  cached = cfg;
  return cfg;
}

// Mutations from the admin settings page.
const EDITABLE = ['hubName', 'jellyfin.url', 'jellyfin.publicUrl', 'minecraft.host', 'minecraft.port', 'minecraft.publicAddress', 'maxUploadMB', 'photoRescanMinutes'];

function setPath(obj, dotted, value) {
  const parts = dotted.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = value;
}

export function updateConfig(patch) {
  const cfg = loadConfig();
  for (const key of EDITABLE) {
    if (!(key in patch)) continue;
    let value = patch[key];
    if (key === 'minecraft.port') value = Number(value) || 25565;
    if (key === 'maxUploadMB') value = Math.max(1, Number(value) || DEFAULTS.maxUploadMB);
    if (key === 'photoRescanMinutes') value = Math.max(0, Number(value) || 0);
    setPath(cfg, key, value);
  }
  // photoRoots is an array of strings.
  if (Array.isArray(patch.photoRoots)) {
    cfg.photoRoots = patch.photoRoots.map((p) => String(p).trim()).filter(Boolean);
  }
  const cfgPath = path.join(dataDir(), 'config.json');
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  return cfg;
}

// Config as safe to expose to signed-in frontend users (no secrets today,
// but keep the allowlist explicit so future secrets can't leak by accident).
export function publicConfig() {
  const cfg = loadConfig();
  return {
    hubName: cfg.hubName,
    maxUploadMB: cfg.maxUploadMB,
    jellyfinPublicUrl: cfg.jellyfin.publicUrl || null,
    minecraftPublicAddress: cfg.minecraft.publicAddress,
    minecraftPort: cfg.minecraft.port,
    // Photo roots are folder paths on the phone's storage. Only the admin
    // settings endpoint (admin-gated) uses this function, and admins need
    // the paths to manage them.
    photoRoots: [...cfg.photoRoots],
    photoRootsConfigured: cfg.photoRoots.length > 0,
  };
}
