'use strict';
/*
 * Peppy Radio — a private LAN radio station.
 *  - Plays the MP3s in ./music on a shuffled loop, 24/7, as one shared live stream
 *  - Lets you go on air with your voice from /dj (PIN protected)
 *  - Everything stays on your home network; nothing is exposed to the internet
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const CONFIG_PATH = path.join(ROOT, 'config.json');

/* ---------- config ---------- */
const DEFAULTS = {
  stationName: 'Peppy Radio',
  port: 8443,
  musicDir: 'music',
  jingleDir: 'jingles',
  jingleEvery: 4, // play one clip from jingleDir after every N songs (0 = off)
  djPin: '',
};

function loadConfig() {
  let cfg = {};
  let existed = false;
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    existed = true;
  } catch (e) {
    /* first run */
  }
  cfg = { ...DEFAULTS, ...cfg };
  if (!cfg.djPin) {
    cfg.djPin = String(crypto.randomInt(100000, 1000000));
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n');
    console.log(existed ? 'Added a DJ PIN to config.json' : 'Created config.json with a new DJ PIN');
  }
  if (process.env.PORT) cfg.port = Number(process.env.PORT);
  if (process.env.DJ_PIN) cfg.djPin = String(process.env.DJ_PIN);
  return cfg;
}

const cfg = loadConfig();
const abs = (d) => (path.isAbsolute(d) ? d : path.join(ROOT, d));
const MUSIC_DIR = abs(cfg.musicDir);
const JINGLE_DIR = abs(cfg.jingleDir);
fs.mkdirSync(MUSIC_DIR, { recursive: true });
fs.mkdirSync(JINGLE_DIR, { recursive: true });

/* ---------- MP3 frame parser (so we can pace the stream in real time) ---------- */
const BR_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BR_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SAMPLE_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

function parseMp3(buf) {
  let pos = 0;
  if (buf.length > 10 && buf.toString('latin1', 0, 3) === 'ID3') {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    pos = 10 + size + (buf[5] & 0x10 ? 10 : 0);
  }
  const frames = [];
  while (pos + 4 <= buf.length) {
    if (buf[pos] !== 0xff || (buf[pos + 1] & 0xe0) !== 0xe0) {
      pos++;
      continue;
    }
    const ver = (buf[pos + 1] >> 3) & 3;
    const layer = (buf[pos + 1] >> 1) & 3;
    const bri = (buf[pos + 2] >> 4) & 15;
    const sri = (buf[pos + 2] >> 2) & 3;
    const pad = (buf[pos + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) {
      pos++;
      continue;
    }
    const br = (ver === 3 ? BR_V1 : BR_V2)[bri] * 1000;
    const sr = SAMPLE_RATES[ver][sri];
    const samples = ver === 3 ? 1152 : 576;
    const len = Math.floor(((ver === 3 ? 144 : 72) * br) / sr) + pad;
    if (pos + len > buf.length) break;
    const isInfoFrame =
      frames.length === 0 && /Xing|Info/.test(buf.toString('latin1', pos, Math.min(pos + len, pos + 60)));
    if (!isInfoFrame) frames.push({ off: pos, len, ms: (samples * 1000) / sr });
    pos += len;
  }
  return frames;
}

function listMp3(dir, depth = 0) {
  let out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth < 3) out = out.concat(listMp3(p, depth + 1));
    else if (e.isFile() && /\.mp3$/i.test(e.name)) out.push(p);
  }
  return out;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const prettyTitle = (f) => path.basename(f).replace(/\.mp3$/i, '').replace(/_/g, ' ');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- shared state ---------- */
const streamClients = new Set(); // open /stream responses
const recent = []; // last ~2s of audio, so new listeners start instantly
let recentMs = 0;
const state = { now: null, history: [], live: null };
let djSocket = null;
let skipRequested = false;

function pushAudio(buf, ms) {
  for (const res of streamClients) {
    if (res.writableLength > 512 * 1024) {
      streamClients.delete(res);
      res.destroy(); // too slow, drop it; the page reconnects
      continue;
    }
    res.write(buf);
  }
  recent.push({ buf, ms });
  recentMs += ms;
  while (recent.length > 1 && recentMs - recent[0].ms > 2000) recentMs -= recent.shift().ms;
}

/* ---------- the 24/7 player ---------- */
let clock = Date.now();

async function playFile(file, kind) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch (e) {
    return;
  }
  const frames = parseMp3(buf);
  if (!frames.length) {
    console.warn('Skipping unreadable MP3:', file);
    return;
  }
  setNow({ title: prettyTitle(file), kind, startedAt: Date.now() });
  skipRequested = false;
  const BATCH_MS = 120;
  const LEAD_MS = 600; // stay slightly ahead of real time so listeners never starve
  let i = 0;
  while (i < frames.length) {
    if (skipRequested) {
      skipRequested = false;
      break;
    }
    const start = frames[i].off;
    let end = start;
    let ms = 0;
    while (i < frames.length && ms < BATCH_MS) {
      end = frames[i].off + frames[i].len;
      ms += frames[i].ms;
      i++;
    }
    pushAudio(buf.subarray(start, end), ms);
    clock += ms;
    const wait = clock - Date.now() - LEAD_MS;
    if (wait > 0) await sleep(wait);
    else if (wait < -2000) clock = Date.now(); // we fell behind (e.g. phone slept); resync
  }
}

async function playLoop() {
  let sinceJingle = 0;
  let last = null;
  for (;;) {
    try {
      const music = listMp3(MUSIC_DIR); // rescanned every round, so new files appear on their own
      if (!music.length) {
        if (state.now) setNow(null);
        await sleep(3000);
        clock = Date.now();
        continue;
      }
      const order = shuffle(music.slice());
      if (order.length > 1 && order[0] === last) order.push(order.shift());
      for (const file of order) {
        if (cfg.jingleEvery > 0 && sinceJingle >= cfg.jingleEvery) {
          const jingles = listMp3(JINGLE_DIR);
          if (jingles.length) await playFile(jingles[Math.floor(Math.random() * jingles.length)], 'jingle');
          sinceJingle = 0;
        }
        await playFile(file, 'song');
        last = file;
        sinceJingle++;
      }
    } catch (e) {
      console.error('player error:', e);
      await sleep(1000);
    }
  }
}

function setNow(now) {
  state.now = now;
  if (now && now.kind === 'song') {
    state.history.unshift({ title: now.title, at: now.startedAt });
    state.history.length = Math.min(state.history.length, 8);
  }
  broadcast({ type: 'now', now: state.now, history: state.history });
}

/* ---------- HTTP ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (p === '/stream') {
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store, no-cache',
      Connection: 'keep-alive',
      'X-Content-Type-Options': 'nosniff',
      'icy-name': cfg.stationName,
    });
    if (res.socket) res.socket.setNoDelay(true);
    for (const c of recent) res.write(c.buf);
    streamClients.add(res);
    req.on('close', () => streamClients.delete(res));
    return;
  }

  if (p === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(
      JSON.stringify({
        station: cfg.stationName,
        now: state.now,
        live: state.live,
        listeners: countListeners(),
      })
    );
    return;
  }

  let rel = p === '/' ? '/index.html' : p === '/dj' ? '/dj.html' : p;
  let file;
  try {
    file = path.normalize(path.join(PUBLIC, decodeURIComponent(rel)));
  } catch (e) {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (!file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  });
}

let server;
let secure = false;
try {
  server = https.createServer(
    {
      key: fs.readFileSync(path.join(ROOT, 'certs', 'key.pem')),
      cert: fs.readFileSync(path.join(ROOT, 'certs', 'cert.pem')),
    },
    handler
  );
  secure = true;
} catch (e) {
  server = http.createServer(handler);
}

/* ---------- WebSocket: now-playing, stats, and live voice ---------- */
const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });

server.on('upgrade', (req, socket, head) => {
  let ok = new URL(req.url, 'http://x').pathname === '/ws';
  if (ok && req.headers.origin) {
    try {
      ok = new URL(req.headers.origin).host === req.headers.host; // blocks other websites from talking to the radio
    } catch (e) {
      ok = false;
    }
  }
  if (!ok) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

const sendJSON = (ws, obj) => {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
};
function broadcast(obj) {
  const s = JSON.stringify(obj);
  for (const c of wss.clients) if (c.readyState === 1) c.send(s);
}
function countListeners() {
  let n = 0;
  for (const c of wss.clients) if (!c.isDJ) n++;
  return n;
}
const broadcastStats = () => broadcast({ type: 'stats', listeners: countListeners() });

const fails = new Map();
const locked = (ip) => {
  const f = fails.get(ip);
  return !!f && f.n >= 5 && Date.now() < f.until;
};
function noteFail(ip) {
  const f = fails.get(ip) || { n: 0, until: 0 };
  f.n++;
  f.until = Date.now() + 60000;
  fails.set(ip, f);
}
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

function endLive() {
  djSocket = null;
  state.live = null;
  broadcast({ type: 'live', live: null });
}

wss.on('connection', (ws, req) => {
  ws.isDJ = false;
  ws.isAlive = true;
  const ip = req.socket.remoteAddress;
  ws.on('pong', () => (ws.isAlive = true));

  sendJSON(ws, {
    type: 'hello',
    station: cfg.stationName,
    now: state.now,
    history: state.history,
    live: state.live,
    listeners: countListeners(),
  });

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      // voice audio (16 kHz mono Int16) — only the live DJ may send it
      if (ws === djSocket && data.length > 0 && data.length <= 65536 && data.length % 2 === 0) {
        for (const c of wss.clients) {
          if (c !== ws && c.readyState === 1 && c.bufferedAmount < 1024 * 1024) c.send(data, { binary: true });
        }
      }
      return;
    }
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (e) {
      return;
    }

    if (msg.type === 'auth') {
      if (locked(ip)) return sendJSON(ws, { type: 'auth', ok: false, error: 'Too many wrong PINs. Wait a minute.' });
      if (crypto.timingSafeEqual(sha(msg.pin), sha(cfg.djPin))) {
        ws.isDJ = true;
        fails.delete(ip);
        sendJSON(ws, { type: 'auth', ok: true });
        broadcastStats();
      } else {
        noteFail(ip);
        sendJSON(ws, { type: 'auth', ok: false, error: 'Wrong PIN' });
      }
      return;
    }

    if (!ws.isDJ) return;

    if (msg.type === 'live') {
      if (msg.on) {
        if (djSocket && djSocket !== ws) return sendJSON(ws, { type: 'liveAck', ok: false, error: 'Someone else is already on air' });
        djSocket = ws;
        state.live = { name: String(msg.name || 'DJ').slice(0, 40), since: Date.now() };
        sendJSON(ws, { type: 'liveAck', ok: true });
        broadcast({ type: 'live', live: state.live });
      } else if (ws === djSocket) {
        endLive();
      }
    } else if (msg.type === 'skip') {
      skipRequested = true;
    }
  });

  ws.on('close', () => {
    if (ws === djSocket) endLive();
    broadcastStats();
  });
  broadcastStats();
});

setInterval(() => {
  for (const c of wss.clients) {
    if (!c.isAlive) {
      c.terminate();
      continue;
    }
    c.isAlive = false;
    c.ping();
  }
  broadcastStats();
}, 20000);

/* ---------- start ---------- */
process.on('uncaughtException', (e) => console.error('uncaught:', e));
process.on('unhandledRejection', (e) => console.error('unhandled:', e));

server.listen(cfg.port, '0.0.0.0', () => {
  const scheme = secure ? 'https' : 'http';
  console.log(`\n${cfg.stationName} is on air.`);
  let ips = [];
  try {
    for (const list of Object.values(os.networkInterfaces()))
      for (const i of list || []) if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
  } catch (e) {
    /* some Android versions block this */
  }
  if (!ips.length) ips = ['192.168.31.178', '127.0.0.1'];
  for (const ip of ips) {
    console.log(`  Listen: ${scheme}://${ip}:${cfg.port}/`);
    console.log(`  DJ booth: ${scheme}://${ip}:${cfg.port}/dj   (PIN is in config.json)`);
  }
  if (!secure)
    console.log('\n  NOTE: no HTTPS certificate found, so browsers will block the microphone.\n  Run ./gen-cert.sh once, then restart.');
  console.log(`  Music folder: ${MUSIC_DIR} (${listMp3(MUSIC_DIR).length} songs)\n`);
  playLoop();
});
