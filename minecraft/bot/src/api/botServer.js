const http = require('http');
const url = require('url');

/**
 * Lightweight HTTP API exposing bot telemetry and control.
 * Uses lazy getter for bot.bot so it's safe even before the bot connects.
 */
class BotServer {
  constructor(botInstance, taskQueue, options = {}) {
    this.botInstance = botInstance; // Bot wrapper class
    this.taskQueue   = taskQueue;
    this.port        = options.port ?? (parseInt(process.env.BOT_HTTP_PORT, 10) || 8089);
    this.host        = options.host || process.env.BOT_HTTP_HOST || '127.0.0.1';
    this.maxBodyBytes = 8192;
  }

  // Resolve mineflayer bot lazily – safe even when bot hasn't connected yet
  get bot() { return this.botInstance.bot; }

  start() {
    const server = http.createServer((req, res) => {
      const parsed  = url.parse(req.url, true);
      const method  = req.method.toUpperCase();
      const pathname = parsed.pathname;

      try {
        if (pathname === '/api/bot/status' && method === 'GET') {
          if (!this.bot) return this._json(res, { error: 'Bot not connected yet', online: false });
          return this._json(res, {
            online:    true,
            username:  this.bot.username,
            health:    this.bot.health   ?? 0,
            food:      this.bot.food     ?? 0,
            position:  this.bot.entity   ? this.bot.entity.position : null,
            dimension: (this.bot.game    ? this.bot.game.dimension : null) || 'overworld',
          });
        }

        if (pathname === '/api/bot/task' && method === 'GET') {
          return this._json(res, this.taskQueue.getStatus());
        }

        if (pathname === '/api/bot/inventory' && method === 'GET') {
          if (!this.bot) return this._json(res, []);
          const items = this.bot.inventory.items().map(i => ({
            name:  i.name,
            count: i.count,
            slot:  i.slot,
          }));
          return this._json(res, items);
        }

        if (pathname === '/api/bot/command' && method === 'POST') {
          let body = '';
          let tooLarge = false;
          req.on('data', chunk => {
            if (body.length + chunk.length > this.maxBodyBytes) {
              tooLarge = true;
              body = '';
              return;
            }
            if (!tooLarge) body += chunk;
          });
          req.on('end', () => {
            if (tooLarge) return this._json(res, { success: false, error: 'Request body too large.' }, 413);
            try {
              const task = JSON.parse(body);
              if (!this.bot) {
                return this._json(res, { success: false, error: 'Bot is offline.' }, 503);
              }
              if (task.task === 'cancel') {
                const cancelled = this.taskQueue.cancelCurrent();
                return this._json(res, { success: cancelled, error: cancelled ? undefined : 'No active task.' }, cancelled ? 200 : 409);
              }
              if (task.task === 'stop') {
                this.taskQueue.stopCurrent();
                return this._json(res, { success: true });
              }
              const accepted = this.taskQueue.enqueue(task);
              this._json(res, { success: true, id: accepted.id, state: accepted._state });
            } catch (e) {
              this._json(res, { success: false, error: e.message }, 400);
            }
          });
          return;
        }

        // Health ping – useful for dashboard upcheck
        if (pathname === '/health' && method === 'GET') {
          return this._json(res, { status: 'ok', bot: !!this.bot });
        }

        this._json(res, { error: 'Not found' }, 404);
      } catch (err) {
        console.error('[BotServer] Handler error:', err.message);
        this._json(res, { error: 'Internal server error' }, 500);
      }
    });

    this.server = server;
    server.listen(this.port, this.host, () => {
      console.log(`[Bot API] Listening on ${this.host}:${server.address().port}`);
    });

    server.on('error', err => {
      console.error('[Bot API] Server error:', err.message);
    });
    return server;
  }

  _json(res, obj, status = 200) {
    const payload = JSON.stringify(obj);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(payload);
  }
}

module.exports = BotServer;
