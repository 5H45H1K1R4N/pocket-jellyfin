'use strict';

const { GoalNear } = require('mineflayer-pathfinder').goals;

class CombatSkill {
  constructor(botInstance) {
    this.botInstance = botInstance;
    this._defending = false;
    this._defenceListener = null;
  }

  get bot() { return this.botInstance.bot; }

  /**
   * Enable auto-defence: bot fights back when hurt by a nearby mob.
   */
  defend() {
    if (this._defending) {
      this.bot.chat('⚔️ Already defending.');
      return;
    }
    this._defending = true;

    this._defenceListener = (entity) => {
      if (entity !== this.bot.entity) return;
      // Find nearest mob within 8 blocks and fight back
      const mob = this.bot.nearestEntity(
        e => e.type === 'mob' && this.bot.entity.position.distanceTo(e.position) < 8
      );
      if (mob) {
        this.bot.chat('⚔️ Defending!');
        this.bot.attack(mob);
      }
    };

    this.bot.on('entityHurt', this._defenceListener);
    this.bot.chat('🛡️ Defence mode ON. I will fight back if attacked.');
  }

  /**
   * Disable auto-defence mode.
   */
  stopDefending() {
    if (this._defenceListener) {
      this.bot.removeListener('entityHurt', this._defenceListener);
      this._defenceListener = null;
    }
    this._defending = false;
    this.bot.chat('🛡️ Defence mode OFF.');
  }

  /**
   * Actively attack a named mob/player entity.
   * @param {object} task - { target: string }
   */
  async attack(task) {
    const { target } = task;
    if (!target) {
      this.bot.chat('❓ Specify a target to attack.');
      return;
    }

    const entity = this.bot.nearestEntity(e => {
      const name = (e.name || e.username || '').toLowerCase();
      return (
        name.includes(target.toLowerCase()) &&
        this.bot.entity.position.distanceTo(e.position) < 20
      );
    });

    if (!entity) {
      this.bot.chat(`❓ No ${target} found nearby.`);
      return;
    }

    this.bot.chat(`⚔️ Attacking ${entity.name || target}!`);
    try {
      this.bot.pathfinder.setGoal(
        new GoalNear(entity.position.x, entity.position.y, entity.position.z, 2)
      );
      await this._sleep(2000);
      this.bot.attack(entity);
    } catch (e) {
      this.bot.chat('⚔️ Could not reach target.');
    }
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = CombatSkill;
