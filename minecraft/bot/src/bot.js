const { EventEmitter } = require('events');

class Bot extends EventEmitter {
  constructor(options = {}) {
    super();
    const env = options.env || process.env;
    const pathfinderModule = options.pathfinderModule || require('mineflayer-pathfinder');
    this.mineflayer = options.mineflayer || require('mineflayer');
    this.pathfinderPlugin = pathfinderModule.pathfinder;
    this.Movements = pathfinderModule.Movements;
    const collectBlockModule = options.collectBlockPlugin || require('mineflayer-collectblock');
    this.collectBlockPlugin = collectBlockModule.plugin || collectBlockModule;
    this.host = env.MC_SERVER_HOST || '127.0.0.1';
    this.port = parseInt(env.MC_SERVER_PORT, 10) || 25565;
    this.username = env.MC_BOT_USERNAME || 'Peppy';
    this.auth = env.MC_BOT_AUTH || 'offline';
    this.autoJoin = !/^false$/i.test(env.MC_BOT_AUTOJOIN || 'true');
    this.reconnectAttempts = 0;
    this.maxDelayMs = 60000;
    this.bot = null;
    this.connecting = false;
    this.reconnectTimer = null;
    this.shutdownRequested = false;
    this.setTimer = options.setTimeout || setTimeout;
    this.clearTimer = options.clearTimeout || clearTimeout;
    this.installProcessHandlers = options.installProcessHandlers !== false;
    this.processHandlersInstalled = false;
  }

  async start() {
    if (!this.autoJoin) {
      this.emit('log', '[Bot] Auto-join disabled – bot staying idle.');
      return;
    }
    if (this.installProcessHandlers) this._installProcessHandlers();
    await this._connect();
  }

  async _connect() {
    if (this.shutdownRequested || !this.autoJoin || this.connecting || this.bot || this.reconnectTimer) return;
    this.connecting = true;
    this.emit('log', `[Bot] Connecting to ${this.host}:${this.port} as ${this.username}`);

    try {
      const bot = this.mineflayer.createBot({
        host: this.host,
        port: this.port,
        username: this.username,
        auth: this.auth,
      });
      this.bot = bot;
      bot.loadPlugin(this.pathfinderPlugin);
      bot.loadPlugin(this.collectBlockPlugin);

      bot.once('spawn', () => {
        if (this.bot !== bot) return;
        this.connecting = false;
        this.reconnectAttempts = 0;
        bot.pathfinder.setMovements(new this.Movements(bot));
        this.emit('log', '[Bot] Spawned and ready.');
      });

      bot.on('end', () => {
        this.emit('log', '[Bot] Connection ended.');
        this.emit('disconnected');
        if (this.bot === bot) this.bot = null;
        this.connecting = false;
        this._scheduleReconnect();
      });

      bot.on('error', err => {
        this.emit('error', err);
        this.emit('disconnected');
        this._scheduleReconnect();
      });
    } catch (err) {
      this.connecting = false;
      this.emit('error', err);
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    if (this.shutdownRequested || this.reconnectTimer) return;
    this.connecting = false;
    this.bot = null;
    this.reconnectAttempts += 1;
    const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts - 1), this.maxDelayMs);
    this.emit('log', `[Bot] Reconnecting in ${delay / 1000}s (attempt #${this.reconnectAttempts})…`);
    this.reconnectTimer = this.setTimer(() => {
      this.reconnectTimer = null;
      this._connect().catch(err => this.emit('error', err));
    }, delay);
  }

  _installProcessHandlers() {
    if (this.processHandlersInstalled) return;
    this.processHandlersInstalled = true;
    const graceful = () => {
      this.shutdownRequested = true;
      if (this.reconnectTimer) this.clearTimer(this.reconnectTimer);
      this.reconnectTimer = null;
      if (this.bot) this.bot.quit('Shutting down');
      process.exit(0);
    };
    process.once('SIGINT', graceful);
    process.once('SIGTERM', graceful);
  }
}

module.exports = Bot;
