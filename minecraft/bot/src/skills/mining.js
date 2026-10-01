const { GoalNear } = require('mineflayer-pathfinder').goals;

/**
 * Mining skill – handles "mine" tasks.
 * NOTE: bot.bot must be non-null before calling mine().
 */
class MiningSkill {
  constructor(botInstance) {
    this.botInstance = botInstance; // store the Bot wrapper, NOT bot.bot
  }

  get bot() { return this.botInstance.bot; } // resolve lazily

  async mine(task) {
    const { target, amount, player } = task;
    if (!target || !amount) {
      this.bot.chat('❓ Missing target or amount for mining task.');
      return;
    }

    this.bot.chat(`⛏ Mining ${amount} × ${target} for ${player}`);
    let collected = 0;

    while (collected < amount) {
      const block = this.bot.findBlock({
        matching: b => b.name === target,
        maxDistance: 64,
      });

      if (!block) {
        this.bot.chat(`⚠️ No ${target} found within 64 blocks. Stopping.`);
        break;
      }

      // Navigate to block
      const goal = new GoalNear(block.position.x, block.position.y, block.position.z, 1);
      this.bot.pathfinder.setGoal(goal);
      await this._waitForProximity(block.position);

      try {
        await this.bot.collectBlock.collect(block);
        collected += 1;
        if (collected % 8 === 0 || collected === amount) {
          this.bot.chat(`📦 ${collected}/${amount} ${target}`);
        }
      } catch (e) {
        // block may have moved or been broken by someone else — skip it
      }
    }

    this.bot.chat(`✅ Done. ${collected}/${amount} ${target} collected.`);
  }

  _waitForProximity(pos) {
    return new Promise(resolve => {
      const check = () => {
        if (this.bot.entity.position.distanceTo(pos) < 2) return resolve();
        setTimeout(check, 300);
      };
      check();
    });
  }
}

module.exports = MiningSkill;
