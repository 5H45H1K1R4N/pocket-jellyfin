const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
const autoEat = require('mineflayer-auto-eat').plugin;
const { EventEmitter } = require('events');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Peppy Minecraft Bot – Core class (Phase 1)
 * • Connects to the PaperMC server using Mineflayer.
 * • Implements exponential‑backoff reconnection (5 s, 10 s, 20 s, 40 s, … up to 60 s).
 * • Listens for process termination signals and quits gracefully.
 * • Emits "log" and "error" events for higher‑level components (future phases).
 */
class Bot extends EventEmitter {
  constructor() {
    super();
    // Configuration – pulled from .env (or defaults)
    this.host = process.env.MC_SERVER_HOST || '127.0.0.1';
    this.port = parseInt(process.env.MC_SERVER_PORT, 10) || 25565;
    this.username = process.env.MC_BOT_USERNAME || 'Peppy';
    this.auth = process.env.MC_BOT_AUTH || 'offline'; // offline works with online-mode=false
    this.autoJoin = process.env.MC_BOT_AUTOJOIN === 'true';
    this.reconnectAttempts = 0;
    this.maxDelayMs = 60000; // cap at 60 s
    this.bot = null;
    this.shutdownRequested = false;
  }

  /** Start the bot – respect the auto‑join flag. */
  async start() {
    if (!this.autoJoin) {
      this.emit('log', '[Bot] Auto‑join disabled – bot will stay idle.');
      return;
    }
    await this._connect();
    this._installProcessHandlers();
  }

  /** Internal connect with exponential back‑off. */
  async _connect() {
    if (this.reconnectAttempts > 0) {
      const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts - 1), this.maxDelayMs);
      this.emit('log', `[Bot] Reconnect attempt #${this.reconnectAttempts} in ${delay / 1000}s…`);
      await new Promise(r => setTimeout(r, delay));
    }

    this.emit('log', `[Bot] Connecting to ${this.host}:${this.port} as ${this.username}`);
    this.bot = mineflayer.createBot({
      host: this.host,
      port: this.port,
      username: this.username,
      auth: this.auth,
    });

    // Load useful plugins
    this.bot.loadPlugin(pathfinder);
    this.bot.loadPlugin(autoEat);

    // Provide default movement settings (will be customised later)
    const defaultMovements = new Movements(this.bot);
    this.bot.pathfinder.setMovements(defaultMovements);

    // Bot lifecycle events
    this.bot.once('spawn', () => {
      this.emit('log', '[Bot] Spawned – ready for tasks');
      this.reconnectAttempts = 0; // reset back‑off on success
    });

    this.bot.on('end', () => {
      this.emit('log', '[Bot] Connection ended');
      if (!this.shutdownRequested) this._scheduleReconnect();
    });

    this.bot.on('error', err => {
      this.emit('error', err);
      if (!this.shutdownRequested) this._scheduleReconnect();
    });
  }

  /** Increment counter and retry connection. */
  _scheduleReconnect() {
    this.reconnectAttempts += 1;
    this.bot = null;
    // fire‑and‑forget – any unhandled rejection will be emitted via "error"
    this._connect().catch(err => this.emit('error', err));
  }

  /** Setup graceful shutdown on SIGINT / SIGTERM. */
  _installProcessHandlers() {
    const graceful = () => {
      this.shutdownRequested = true;
      if (this.bot) {
        this.bot.quit('Graceful shutdown');
        this.emit('log', '[Bot] Quit signal sent');
      }
      process.exit(0);
    };
    process.on('SIGINT', graceful);
    process.on('SIGTERM', graceful);
  }
}

module.exports = Bot;
