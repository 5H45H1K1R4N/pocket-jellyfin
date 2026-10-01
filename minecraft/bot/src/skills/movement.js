const { GoalNear, goals } = require('mineflayer-pathfinder').goals;
/**
 * Movement skill set for Peppy.
 * Provides simple high‑level actions: follow a player, come to the player, and stop.
 */
class MovementSkill {
  constructor(bot) {
    this.bot = bot;
    this.pathfinder = bot.pathfinder;
  }

  /** Follow the specified player (by username). */
  async follow(playerName) {
    const target = this.bot.players[playerName];
    if (!target) {
      this.bot.chat(`❓ I can't see player ${playerName}.`);
      return;
    }
    const followGoal = new GoalNear(target.entity.position.x, target.entity.position.y, target.entity.position.z, 2);
    this.pathfinder.setGoal(followGoal);
    this.bot.chat(`👣 Following ${playerName}`);
  }

  /** Come to the issuing player's position. */
  async come(playerName) {
    const target = this.bot.players[playerName];
    if (!target) {
      this.bot.chat(`❓ I can't find ${playerName}.`);
      return;
    }
    const goal = new GoalNear(target.entity.position.x, target.entity.position.y, target.entity.position.z, 1);
    this.pathfinder.setGoal(goal);
    this.bot.chat(`🏃 Coming to ${playerName}`);
  }

  /** Stop all current pathfinding movement. */
  stop() {
    this.pathfinder.stop();
    this.bot.chat('🛑 Stopping movement');
  }
}

module.exports = MovementSkill;
