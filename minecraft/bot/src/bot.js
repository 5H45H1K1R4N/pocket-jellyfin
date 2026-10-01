const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const { EventEmitter } = require('events');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Peppy Minecraft Bot – Core class (Phase 1)
 * Connects to PaperMC using Mineflayer.
 * Implements exponential-backoff reconnection: 5s → 10s → 20s → 40s → 60s (cap).
 * Listens for SIGINT/SIGTERM and quits gracefully.
 */
class Bot extends EventEmitter {
  constructor() {
    super();
    this.host     = process.env.MC_SERVER_HOST || '127.0.0.1';
    this.port     = parseInt(process.env.MC_SERVER_PORT, 10) || 25565;
    this.username = process.env.MC_BOT_USERNAME || 'Peppy';
    this.auth     = process.env.MC_BOT_AUTH || 'offline';
    this.autoJoin = process.env.MC_BOT_AUTOJOIN !== 'false';

    this.reconnectAttempts = 0;
    this.maxDelayMs        = 60000; // cap at 60 s
    this.bot               = null;
    this.shutdownRequested = false;
  }

  async start() {
    if (!this.autoJoin) {
      this.emit('log', '[Bot] Auto-join disabled – bot staying idle.');
      return;
    }
    await this._connect();
    this._installProcessHandlers();
  }

  async _connect() {
    if (this.reconnectAttempts > 0) {
      const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts - 1), this.maxDelayMs);
      this.emit('log', `[Bot] Reconnecting in ${delay / 1000}s (attempt #${this.reconnectAttempts})…`);
      await new Promise(r => setTimeout(r, delay));
    }

    this.emit('log', `[Bot] Connecting to ${this.host}:${this.port} as ${this.username}`);
    this.bot = mineflayer.createBot({
      host:     this.host,
      port:     this.port,
      username: this.username,
      auth:     this.auth,
    });

    // Load plugins
    this.bot.loadPlugin(pathfinder);

    // Default movement config
    this.bot.once('spawn', () => {
      const defaultMovements = new Movements(this.bot);
      this.bot.pathfinder.setMovements(defaultMovements);
      this.emit('log', '[Bot] Spawned and ready.');
      this.reconnectAttempts = 0;
    });

    this.bot.on('end', () => {
      this.emit('log', '[Bot] Connection ended.');
      if (!this.shutdownRequested) this._scheduleReconnect();
    });

    this.bot.on('error', err => {
      this.emit('error', err);
      if (!this.shutdownRequested) this._scheduleReconnect();
    });
  }

  _scheduleReconnect() {
    this.reconnectAttempts += 1;
    this.bot = null;
    this._connect().catch(err => this.emit('error', err));
  }

  _installProcessHandlers() {
    const graceful = () => {
      this.shutdownRequested = true;
      if (this.bot) this.bot.quit('Shutting down');
      process.exit(0);
    };
    process.on('SIGINT', graceful);
    process.on('SIGTERM', graceful);
  }
}

module.exports = Bot;
