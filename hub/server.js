import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR);
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif'
};

const server = http.createServer((req, res) => {
  // API: Get Server Status
  if (req.url === '/api/status' && req.method === 'GET') {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      cpuLoad: os.loadavg()[0] || 0,
      memUsed: (usedMem / 1024 / 1024 / 1024).toFixed(2),
      memTotal: (totalMem / 1024 / 1024 / 1024).toFixed(2),
      uptime: os.uptime()
    }));
    return;
  }

  // API: List Uploaded Files
  if (req.url === '/api/files' && req.method === 'GET') {
    fs.readdir(UPLOADS_DIR, (err, files) => {
      if (err) { res.writeHead(500); return res.end('Error reading files'); }
      const fileData = files.map(f => {
        const stats = fs.statSync(path.join(UPLOADS_DIR, f));
        return { name: f, size: stats.size };
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(fileData));
    });
    return;
  }

  // API: Upload File
  if (req.url.startsWith('/api/upload') && req.method === 'POST') {
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const filename = urlParams.get('filename') || ('upload_' + Date.now());
    const safeFilename = path.basename(filename);
    const filePath = path.join(UPLOADS_DIR, safeFilename);
    
    const fileStream = fs.createWriteStream(filePath);
    req.pipe(fileStream);
    req.on('end', () => {
      res.writeHead(200);
      res.end('Uploaded');
    });
    return;
  }

  // API: Download Uploaded File
  if (req.url.startsWith('/uploads/') && req.method === 'GET') {
    const filename = decodeURIComponent(req.url.substring(9));
    const safeFilename = path.basename(filename);
    const filePath = path.join(UPLOADS_DIR, safeFilename);
    fs.readFile(filePath, (err, content) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Disposition': `attachment; filename="${safeFilename}"` });
      res.end(content);
    });
    return;
  }

  // Serve Static Frontend Files
  const parsedUrl = new URL(req.url, `http://localhost`);
  let filePath = path.join(PUBLIC_DIR, parsedUrl.pathname === '/' ? 'index.html' : parsedUrl.pathname);
  const extname = path.extname(filePath).toLowerCase();

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err, fallbackContent) => {
          res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
          res.end(fallbackContent, 'utf-8');
        });
      } else {
        res.writeHead(500);
        res.end('Server Error: ' + error.code + ' ..\n');
      }
    } else {
      res.writeHead(200, { 
        'Content-Type': MIME_TYPES[extname] || 'application/octet-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(content, 'utf-8');
    }
  });
});

// WebSocket Server for Real-Time Chat & Presence
const wss = new WebSocketServer({ server });

const clients = new Map();
let messageHistory = [];

wss.on('connection', (ws) => {
  const id = Math.random().toString(36).substring(2, 10);
  clients.set(ws, { id, username: 'Anonymous', status: 'Exploring Home Server', role: 'guest' });

  ws.send(JSON.stringify({ type: 'history', data: messageHistory }));
  broadcastPresence();

  ws.on('message', (message) => {
    const parsed = JSON.parse(message);
    
    if (parsed.type === 'join') {
      const client = clients.get(ws);
      let uname = parsed.username || 'Anonymous';
      
      if (uname.toLowerCase() === 'admin' || uname.includes('5H')) {
        client.username = '5HÎ±5HÄ±kRÎ±Î·';
        client.role = 'admin';
        client.status = 'ðŸ•¶ï¸ V!83_C0D!N6';
      } else {
        client.username = uname;
        client.role = 'family';
        client.status = 'Online';
      }
      clients.set(ws, client);
      broadcastPresence();
      
    } else if (parsed.type === 'chat') {
      const client = clients.get(ws);
      const msgObj = {
        id: Date.now(),
        author: client.username,
        role: client.role,
        text: parsed.text,
        timestamp: new Date().toISOString()
      };
      
      messageHistory.push(msgObj);
      if (messageHistory.length > 50) messageHistory.shift(); 
      
      broadcastMessage(msgObj);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    broadcastPresence();
  });
});

function broadcastPresence() {
  const onlineUsers = Array.from(clients.values());
  const payload = JSON.stringify({ type: 'presence', data: onlineUsers });
  wss.clients.forEach(c => {
    if (c.readyState === 1) c.send(payload);
  });
}

function broadcastMessage(msgObj) {
  const payload = JSON.stringify({ type: 'chat', data: msgObj });
  wss.clients.forEach(c => {
    if (c.readyState === 1) c.send(payload);
  });
}

const PORT = 7777;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`ðŸš€ KHURE Home Hub running at http://127.0.0.1:${PORT}/`);
  console.log(`   Real-time WebSockets and File Drop enabled.`);
});
