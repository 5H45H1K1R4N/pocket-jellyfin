// Real service integrations — no mock data.
//
//  * Jellyfin: HTTP probe of the public system info endpoint (no auth needed,
//    no password stored or exposed).
//  * Minecraft: the Server List Ping protocol over raw TCP (Java Edition),
//    implemented by hand so PaperMC status works with zero dependencies.
//  * System: uptime/load/memory from node:os; disk usage via `df` when the
//    platform provides it. Anything that can't be measured reports "unknown"
//    rather than a made-up number.

import net from 'node:net';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { loadConfig } from './config.js';

// ---- helpers ---------------------------------------------------------------

async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'manual' });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ---- Jellyfin --------------------------------------------------------------

export async function probeJellyfin() {
  const cfg = loadConfig();
  const base = String(cfg.jellyfin.url || '').replace(/\/+$/, '');
  if (!base) return { state: 'unknown', detail: 'Jellyfin URL not configured.' };
  try {
    const res = await fetchWithTimeout(`${base}/System/Info/Public`, cfg.jellyfin.timeoutMs);
    if (!res.ok) return { state: 'unknown', detail: `Jellyfin responded ${res.status}.` };
    const info = await res.json().catch(() => ({}));
    return {
      state: 'online',
      version: info.Version || null,
      serverName: info.ServerName || null,
    };
  } catch (err) {
    const detail = err.name === 'AbortError' ? 'Timed out.' : 'Connection failed.';
    return { state: 'offline', detail };
  }
}

// ---- Minecraft (Server List Ping) ------------------------------------------

function writeVarInt(value) {
  // Java VarInt: 7 bits per byte, high bit = continuation flag.
  const bytes = [];
  let temp = value | 0;
  while (true) {
    if ((temp & ~0x7f) === 0) {
      bytes.push(temp);
      break;
    }
    bytes.push((temp & 0x7f) | 0x80);
    temp >>>= 7;
  }
  return Buffer.from(bytes);
}

function writeString(str) {
  const body = Buffer.from(str, 'utf8');
  return Buffer.concat([writeVarInt(body.length), body]);
}

function readVarIntFrom(buf, offset) {
  let result = 0;
  let shift = 0;
  let pos = offset;
  while (true) {
    if (pos >= buf.length) throw new Error('Truncated VarInt');
    const byte = buf[pos++];
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
    if (shift > 35) throw new Error('VarInt too large');
  }
  return { value: result >>> 0, next: pos };
}

export function pingMinecraft() {
  const cfg = loadConfig();
  const { host, port, timeoutMs } = cfg.minecraft;
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    const socket = net.createConnection({ host, port });
    socket.setTimeout(timeoutMs);

    // Handshake: protocol version -1 (any), then request status (state 1).
    const handshake = Buffer.concat([
      writeVarInt(0x00),
      writeVarInt(-1),
      writeString(host),
      Buffer.from([(port >> 8) & 0xff, port & 0xff]),
      writeVarInt(1),
    ]);
    const request = Buffer.concat([writeVarInt(handshake.length), handshake, writeVarInt(0x00)]);

    socket.on('connect', () => {
      socket.write(request);
    });

    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        if (buffer.length < 1) return;
        const lenA = readVarIntFrom(buffer, 0);
        if (buffer.length < lenA.next + lenA.value) return; // wait for more
        let pos = lenA.next;
        const pkt = readVarIntFrom(buffer, pos);
        pos = pkt.next;
        const strLen = readVarIntFrom(buffer, pos);
        pos = strLen.next;
        const jsonBuf = buffer.slice(pos, pos + strLen.value);
        const status = JSON.parse(jsonBuf.toString('utf8'));
        const ping = Date.now() - started;
        const players = status.players || {};
        const desc = typeof status.description === 'string'
          ? status.description
          : (status.description?.text || status.description?.description || null);
        finish({
          state: 'online',
          pingMs: ping,
          version: status.version?.name || null,
          protocol: status.version?.protocol ?? null,
          playersOnline: players.online ?? null,
          playersMax: players.max ?? null,
          motd: desc,
          favicon: status.favicon || null, // data URI; frontend decides to use it
        });
      } catch {
        finish({ state: 'unknown', detail: 'Sent an unreadable status response.' });
      }
    });

    socket.on('timeout', () => finish({ state: 'unknown', detail: 'Timed out.' }));
    socket.on('error', (err) => {
      // ECONNREFUSED / EHOSTUNREACH on the loopback of the same phone means
      // the server process is genuinely down; anything else is unknown.
      const reachableCodes = ['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH'];
      if (reachableCodes.includes(err.code)) {
        finish({ state: 'offline', detail: 'Connection refused — server not running.' });
      } else {
        finish({ state: 'unknown', detail: err.code || err.message });
      }
    });
    socket.on('close', () => finish({ state: 'unknown', detail: 'Connection closed.' }));
  });
}

// ---- system stats ----------------------------------------------------------

const dfCache = { at: 0, value: null };

function probeDisk(paths) {
  // `df -Pk <path>` is available in Termux (coreutils) and on macOS/Linux.
  // Never shell out with a string — execFile keeps paths as one argument.
  return new Promise((resolve) => {
    const now = Date.now();
    if (dfCache.value && now - dfCache.at < 30_000) return resolve(dfCache.value);
    execFile('df', ['-Pk', ...paths], { timeout: 5000 }, (err, stdout) => {
      if (err) return resolve(null);
      const lines = stdout.trim().split('\n').slice(1);
      const mounts = [];
      for (const line of lines) {
        const cols = line.split(/\s+/);
        if (cols.length < 6) continue;
        const [_, total, used, avail] = cols.map(Number);
        if (!total) continue;
        mounts.push({
          mount: cols[cols.length - 1],
          totalBytes: total * 1024,
          usedBytes: used * 1024,
          availableBytes: avail * 1024,
          usedPct: Math.round((used / total) * 100),
        });
      }
      if (mounts.length) {
        dfCache.value = mounts;
        dfCache.at = now;
      }
      resolve(mounts.length ? mounts : null);
    });
  });
}

export async function systemStatus() {
  const cfg = loadConfig();
  const loadavg = os.loadavg ? os.loadavg().map((n) => Math.round(n * 100) / 100) : null;
  const disks = await probeDisk(cfg.photoRoots.length ? cfg.photoRoots : [os.homedir()]);
  return {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    uptimeSec: Math.round(os.uptime()),
    loadAvg: loadavg,
    cpuCount: os.cpus()?.length ?? null,
    memTotalBytes: os.totalmem(),
    memFreeBytes: os.freemem(),
    nodeVersion: process.version,
    disks, // null when df is unavailable — frontend shows "Unavailable", never a fake number
    measuredAt: Date.now(),
  };
}

// ---- combined --------------------------------------------------------------

export async function allServices() {
  const [jellyfin, minecraft, system] = await Promise.all([
    probeJellyfin(),
    pingMinecraft(),
    systemStatus(),
  ]);
  const cfg = loadConfig();
  return {
    jellyfin: {
      ...jellyfin,
      publicUrl: cfg.jellyfin.publicUrl || null,
      internalUrl: cfg.jellyfin.url,
    },
    minecraft: {
      ...minecraft,
      publicAddress: cfg.minecraft.publicAddress,
      port: cfg.minecraft.port,
      edition: 'Java Edition (PaperMC)',
    },
    system,
    measuredAt: Date.now(),
  };
}
