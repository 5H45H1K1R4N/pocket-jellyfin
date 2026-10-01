const http = require('http');
const url = require('url');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Simple HTTP API exposing bot telemetry and control.
 * No external framework – uses Node's built‑in http server to keep the bundle tiny.
 */
class BotServer {
  constructor(botInstance, taskQueue) {
    this.bot = botInstance.bot;
    this.botInstance = botInstance;
    this.taskQueue = taskQueue;
    this.port = parseInt(process.env.BOT_HTTP_PORT, 10) || 8089;
  }

  start() {
    const server = http.createServer((req, res) => {
      const parsed = url.parse(req.url, true);
      const method = req.method.toUpperCase();
      const pathname = parsed.pathname;

      // CORS for dashboard fetches
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
      }

      if (pathname === '/api/bot/status' && method === 'GET') {
        const status = {
          health: this.bot.health,
          food: this.bot.food,
          position: this.bot.entity.position,
          dimension: this.bot.world ? this.bot.world.name : 'overworld',
          online: this.bot.player ? true : false,
          username: this.bot.username,
        };
        return this._json(res, status);
      }

      if (pathname === '/api/bot/task' && method === 'GET') {
        return this._json(res, this.taskQueue.getStatus());
      }

      if (pathname === '/api/bot/inventory' && method === 'GET') {
        const items = this.bot.inventory.items().map(i => ({
          name: i.name,
          count: i.count,
          slot: i.slot,
        }));
        return this._json(res, items);
      }

      if (pathname === '/api/bot/command' && method === 'POST') {
        let body = '';
        req.on('data', chunk => (body += chunk));
        req.on('end', () => {
          try {
            const task = JSON.parse(body);
            this.taskQueue.enqueue(task);
            this._json(res, { success: true });
          } catch (e) {
            this._json(res, { success: false, error: e.message }, 400);
          }
        });
        return;
      }

      // Unknown endpoint
      this._json(res, { error: 'Not found' }, 404);
    });

    server.listen(this.port, () => {
      console.log(`[Bot API] Listening on port ${this.port}`);
    });
  }

  _json(res, obj, status = 200) {
    const payload = JSON.stringify(obj);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(payload);
  }
}

module.exports = BotServer;
