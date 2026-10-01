/**
 * Movement skill – follow, come, stop.
 * Uses lazy getter so bot.bot can be null at construction time.
 */
class MovementSkill {
  constructor(botInstance, goals) {
    this.botInstance = botInstance;
    this.goals = goals || require('mineflayer-pathfinder').goals;
    this.followResolver = null;
  }

  get bot() { return this.botInstance.bot; }

  async follow(playerName) {
    const target = this.bot.players[playerName];
    if (!target || !target.entity) {
      this.bot.chat(`❓ Can't see ${playerName} right now.`);
      return;
    }
    this.bot.pathfinder.setGoal(new this.goals.GoalFollow(target.entity, 2), true);
    this.bot.chat(`👣 Following ${playerName}`);
    await new Promise(resolve => { this.followResolver = resolve; });
  }

  async come(playerName) {
    const target = this.bot.players[playerName];
    if (!target || !target.entity) {
      this.bot.chat(`❓ Can't find ${playerName}.`);
      return;
    }
    const { x, y, z } = target.entity.position;
    await this.bot.pathfinder.goto(new this.goals.GoalNear(x, y, z, 1));
    this.bot.chat(`🏃 Coming to ${playerName}`);
  }

  cancel() {
    if (this.bot && this.bot.pathfinder) this.bot.pathfinder.stop();
    if (this.followResolver) {
      const resolve = this.followResolver;
      this.followResolver = null;
      resolve();
    }
  }

  stop() {
    this.cancel();
    this.bot.chat('🛑 Stopped.');
  }
}

module.exports = MovementSkill;
