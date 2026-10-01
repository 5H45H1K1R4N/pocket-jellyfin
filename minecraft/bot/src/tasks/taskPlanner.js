'use strict';

class TaskPlanner {
  constructor(botInstance, taskQueue) {
    this.botInstance = botInstance;
    this.queue = taskQueue;

    // Lazy-require skill classes so they never touch bot in constructors
    this.movement = new (require('../skills/movement'))(botInstance);
    this.mining   = new (require('../skills/mining'))(botInstance);
    this.farming  = new (require('../skills/farming'))(botInstance);
    this.building = new (require('../skills/building'))(botInstance);
    this.combat   = new (require('../skills/combat'))(botInstance);

    this._currentSkill = null;
  }

  get bot() { return this.botInstance.bot; }

  async handleTask(task) {
    if (!this.bot) {
      console.warn('[Planner] Bot not ready – dropping task:', task.task);
      this.queue.finishCurrent('FAILED');
      return;
    }

    this._currentSkill = null;

    try {
      switch (task.task) {
        case 'follow':
          this._currentSkill = this.movement;
          await this.movement.follow(task.player);
          break;

        case 'come':
          this._currentSkill = this.movement;
          await this.movement.come(task.player);
          break;

        case 'stop':
          this.movement.stop();
          break;

        case 'mine':
          this._currentSkill = this.mining;
          await this.mining.mine(task);
          break;

        case 'farm':
          this._currentSkill = this.farming;
          await this.farming.farm(task);
          break;

        case 'build':
          this._currentSkill = this.building;
          await this.building.build(task);
          break;

        case 'attack':
          this._currentSkill = this.combat;
          await this.combat.attack(task);
          break;

        case 'defend':
          // Non-async; toggles a listener
          this.combat.defend();
          break;

        case 'cancel':
          if (this._currentSkill && typeof this._currentSkill.cancel === 'function') {
            this._currentSkill.cancel();
          }
          this.queue.cancelCurrent();
          return; // cancelCurrent manages state; skip finishCurrent

        case 'craft':
          this.bot.chat('🔨 Crafting coming soon!');
          break;

        // Inline tasks – handled by chat.js; should not reach here
        case 'help':
        case 'health':
        case 'inventory':
        case 'status':
          break;

        default:
          this.bot.chat(`❓ Unknown task: ${task.task}`);
      }

      this.queue.finishCurrent('COMPLETED');
    } catch (err) {
      console.error('[Planner] Task error:', err.message || err);
      try { this.bot.chat('🚨 Task error – check bot console.'); } catch (_) {}
      this.queue.finishCurrent('FAILED');
    }
  }
}

module.exports = TaskPlanner;
