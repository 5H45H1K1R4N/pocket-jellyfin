'use strict';

const TRIGGERS = ['peppy', '@peppy', '!peppy'];

const HELP_TEXT = [
  '=== 🤖 Peppy Commands ===',
  '⛏ mine <n> <block>   - Mine resources (e.g. mine 32 iron_ore)',
  '🌾 harvest <crop>    - Harvest mature crops (wheat/carrots/potatoes/sugarcane)',
  '🌱 plant <crop>      - Plant seeds on empty farmland',
  '🔄 farm <crop>       - Harvest & replant automatically',
  '🏗 build <structure> - Build wheat_farm, small_house, basic_storage',
  '👣 follow me         - Follow the player',
  '🏃 come here         - Walk to player',
  '🛑 stop              - Stop moving',
  '⚔️ defend            - Enable auto-defense against mobs',
  '⚔️ attack <mob>      - Attack target mob',
  '📊 status            - Show current active task',
  '🎒 inventory         - List items in inventory',
  '❤️ health            - Show HP and food stats',
  '❌ cancel            - Abort current task',
  '✨ Chat with me! (Powered by Gemini AI if enabled)'
];

class ChatHandler {
  constructor(botInstance, taskQueue, aiProvider) {
    this.botInstance = botInstance;
    this.queue = taskQueue;
    this.ai = aiProvider;
  }

  get bot() { return this.botInstance.bot; }

  attach() {
    this.bot.on('chat', (username, message) => {
      if (username === this.bot.username) return;

      const lower = message.toLowerCase().trim();
      const trigger = TRIGGERS.find(t => lower.startsWith(t));
      if (!trigger) return;

      // Extract raw command without trigger prefix
      const cmd = message.slice(trigger.length).trim().replace(/^[,:\s]+/, '').trim();
      if (!cmd) {
        this.bot.chat(`Hey ${username}! Say "Peppy help" to see what I can do.`);
        return;
      }

      this._handle(cmd, username);
    });
  }

  async _handle(cmd, player) {
    // Gather live context for smarter decisions (used by Gemini AI)
    const context = {
      health: this.bot.health,
      food: this.bot.food,
      position: this.bot.entity ? {
        x: Math.round(this.bot.entity.position.x),
        y: Math.round(this.bot.entity.position.y),
        z: Math.round(this.bot.entity.position.z)
      } : null,
      inventory: this.bot.inventory
        ? this.bot.inventory.items().slice(0, 15).map(i => `${i.name}×${i.count}`)
        : []
    };

    let task;
    try {
      task = await this.ai.parseCommand(cmd, player, context);
    } catch (e) {
      task = null;
    }

    if (!task) {
      this.bot.chat(`❓ I didn't quite catch that, ${player}. Say "Peppy help" for commands.`);
      return;
    }

    // Direct conversational reply from Gemini
    if (task.task === 'chat' && task.message) {
      this.bot.chat(task.message);
      return;
    }

    // Immediate inline information tasks (no need to queue)
    if (task.task === 'help') {
      for (const line of HELP_TEXT) {
        this.bot.chat(line);
        await new Promise(r => setTimeout(r, 200));
      }
      return;
    }

    if (task.task === 'health') {
      this.bot.chat(`❤️ Health: ${Math.round(this.bot.health || 0)}/20 | 🍗 Food: ${Math.round(this.bot.food || 0)}/20`);
      return;
    }

    if (task.task === 'inventory') {
      const items = this.bot.inventory.items();
      if (!items || items.length === 0) {
        this.bot.chat('🎒 My inventory is currently empty.');
        return;
      }
      const summary = items.slice(0, 10).map(i => `${i.name}×${i.count}`).join(', ');
      this.bot.chat(`🎒 Inventory: ${summary}${items.length > 10 ? ' (and more…)' : ''}`);
      return;
    }

    if (task.task === 'status') {
      const s = this.queue.getStatus();
      if (s.current) {
        this.bot.chat(`📊 Currently doing: ${s.current.task} (${s.current._state}). Pending tasks: ${s.pending.length}`);
      } else {
        this.bot.chat('📊 Idle! Ready for orders.');
      }
      return;
    }

    // Enqueue operational tasks
    this.queue.enqueue(task);

    const acks = {
      mine:   `⛏ On it! Mining ${task.amount || ''} ${task.target || 'blocks'} for ${player}.`,
      farm:   `🌾 Starting ${task.action || 'farm'} work on ${task.crop || 'crops'}.`,
      build:  `🏗 Gathering materials and preparing blueprint for ${task.structure}.`,
      follow: `👣 Following ${task.player || player}.`,
      come:   `🏃 Heading over to ${task.player || player}!`,
      stop:   '🛑 Halting all actions.',
      cancel: '❌ Cancelling the current task.',
      attack: `⚔️ Attacking ${task.target}!`,
      defend: '🛡️ Sentry mode activated.'
    };

    this.bot.chat(acks[task.task] || `✅ Task "${task.task}" queued.`);
  }
}

module.exports = ChatHandler;
