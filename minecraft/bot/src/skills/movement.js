/**
 * Movement skill – follow, come, stop.
 * Uses lazy getter so bot.bot can be null at construction time.
 */
class MovementSkill {
  constructor(botInstance) {
    this.botInstance = botInstance;
  }

  get bot() { return this.botInstance.bot; }

  async follow(playerName) {
    const { GoalFollow } = require('mineflayer-pathfinder').goals;
    const target = this.bot.players[playerName];
    if (!target || !target.entity) {
      this.bot.chat(`❓ Can't see ${playerName} right now.`);
      return;
    }
    this.bot.pathfinder.setGoal(new GoalFollow(target.entity, 2), true);
    this.bot.chat(`👣 Following ${playerName}`);
  }

  async come(playerName) {
    const { GoalNear } = require('mineflayer-pathfinder').goals;
    const target = this.bot.players[playerName];
    if (!target || !target.entity) {
      this.bot.chat(`❓ Can't find ${playerName}.`);
      return;
    }
    const { x, y, z } = target.entity.position;
    this.bot.pathfinder.setGoal(new GoalNear(x, y, z, 1));
    this.bot.chat(`🏃 Coming to ${playerName}`);
  }

  stop() {
    this.bot.pathfinder.stop();
    this.bot.chat('🛑 Stopped.');
  }
}

module.exports = MovementSkill;
