const { Vec3 } = require('vec3');
const { GoalNear } = require('mineflayer-pathfinder').goals;
/**
 * Mining skill – handles "mine" tasks.
 * Expected task shape: { task: 'mine', target: '<block_name>', amount: <int>, player: '<username>' }
 * Uses mineflayer-collectblock to locate and collect the desired block type.
 * Progress is reported via chat messages.
 */
class MiningSkill {
  constructor(botInstance) {
    this.bot = botInstance.bot;
    this.pathfinder = this.bot.pathfinder;
    // Ensure the collectBlock plugin is loaded
    try {
      this.bot.loadPlugin(require('mineflayer-collectblock').plugin);
    } catch (e) {
      // plugin may already be loaded; ignore errors
    }
  }

  async mine(task) {
    const { target, amount, player } = task;
    if (!target || !amount) {
      this.bot.chat('❓ Missing target or amount for mining task.');
      return;
    }
    this.bot.chat(`⛏ Starting mining ${amount} × ${target} for ${player}`);
    let collected = 0;
    const startTime = Date.now();

    while (collected < amount) {
      // Find the nearest block of the requested type
      const block = this.bot.findBlock({
        matching: block => block.name === target,
        maxDistance: 64,
        count: 1,
      });
      if (!block) {
        this.bot.chat(`⚠️ No more ${target} blocks within range. Stopping.`);
        break;
      }
      // Move near the block
      const goal = new GoalNear(block.position.x, block.position.y, block.position.z, 1);
      this.pathfinder.setGoal(goal);
      // Wait until we are close enough (simple poll)
      await this._waitForProximity(block.position);
      // Collect the block
      try {
        await this.bot.collectBlock.collect(block);
        collected += 1;
        this.bot.chat(`📦 Collected ${collected}/${amount} ${target}`);
      } catch (e) {
        this.bot.chat(`❗ Failed to collect block: ${e.message}`);
        // Skip this block and continue searching
      }
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    this.bot.chat(`✅ Mining task finished. ${collected}/${amount} ${target} collected in ${elapsed}s.`);
  }

  /** Simple promise that resolves when bot is within 2 blocks of target */
  _waitForProximity(pos) {
    return new Promise(resolve => {
      const check = () => {
        const distance = this.bot.entity.position.distanceTo(pos);
        if (distance < 2) return resolve();
        setTimeout(check, 500);
      };
      check();
    });
  }
}

module.exports = MiningSkill;
