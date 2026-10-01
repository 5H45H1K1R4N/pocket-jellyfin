'use strict';

const TRIGGERS = ['peppy', '@peppy', '!peppy'];

const HELP_TEXT = [
  '=== Peppy Commands ===',
  '⛏ mine <n> <block>  - Mine resources',
  '🌾 harvest <crop>   - Harvest crops',
  '🌱 plant <crop>     - Plant crops',
  '🔄 farm <crop>      - Harvest + replant',
  '🏗 build <name>     - Build structure',
  '👣 follow me        - Follow you',
  '🏃 come here        - Come to you',
  '🛑 stop             - Stop moving',
  '⚔️ defend           - Auto-fight mobs',
  '📊 status           - Current task',
  '🎒 inventory        - Show items',
  '❤️ health           - Show HP/food',
  '❌ cancel           - Cancel task',
];

class ChatHandler {
  constructor(botInstance, taskQueue, aiProvider) {
    this.botInstance = botInstance;
    this.queue = taskQueue;
    this.ai = aiProvider;
  }

  get bot() { return this.botInstance.bot; }

  /**
   * Attach chat listener to the underlying mineflayer bot.
   * Safe to call multiple times (idempotent guard not needed – mineflayer
   * event system allows duplicate listeners, but we keep attach simple).
   */
  attach() {
    this.bot.on('chat', (username, message) => {
      if (username === this.bot.username) return;

      const lower = message.toLowerCase().trim();
      const trigger = TRIGGERS.find(t => lower.startsWith(t));
      if (!trigger) return;

      // Strip trigger + optional punctuation/spaces
      const cmd = message.slice(trigger.length).trim().replace(/^[,:\s]+/, '').trim();

      if (!cmd) {
        this.bot.chat(`Hi ${username}! Say "Peppy help" for commands.`);
        return;
      }

      this._handle(cmd, username);
    });
  }

  async _handle(cmd, player) {
    const task = this.ai.parseCommand(cmd, player);

    if (!task) {
      this.bot.chat(`❓ I don't understand "${cmd}". Say "Peppy help" for commands.`);
      return;
    }

    // --- Inline tasks (no queuing needed) ---

    if (task.task === 'help') {
      HELP_TEXT.forEach(line => this.bot.chat(line));
      return;
    }

    if (task.task === 'health') {
      this.bot.chat(`❤️ Health: ${this.bot.health}/20  🍗 Food: ${this.bot.food}/20`);
      return;
    }

    if (task.task === 'inventory') {
      const items = this.bot.inventory.items();
      if (items.length === 0) {
        this.bot.chat('🎒 Inventory is empty.');
        return;
      }
      const summary = items.slice(0, 10).map(i => `${i.name}×${i.count}`).join(', ');
      this.bot.chat(`🎒 ${summary}${items.length > 10 ? '…' : ''}`);
      return;
    }

    if (task.task === 'status') {
      const s = this.queue.getStatus();
      if (s.current) {
        this.bot.chat(`📊 Doing: ${s.current.task} [${s.current._state || 'running'}], Queue: ${s.pending.length}`);
      } else {
        this.bot.chat('📊 Idle. No active tasks.');
      }
      return;
    }

    // --- Queued tasks ---

    this.queue.enqueue(task);

    const acks = {
      mine:    '⛏ Mining!',
      farm:    '🌾 Farming!',
      build:   '🏗 Building!',
      follow:  '👣 Following!',
      come:    '🏃 Coming!',
      stop:    '🛑 Stopped.',
      cancel:  '❌ Cancelling.',
      attack:  '⚔️ Attacking!',
      defend:  '🛡️ Defending!',
      craft:   '🔨 On it!',
    };

    this.bot.chat(acks[task.task] || '✅ Task queued.');
  }
}

module.exports = ChatHandler;
