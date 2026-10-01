'use strict';

const { GoalNear } = require('mineflayer-pathfinder').goals;

class MiningSkill {
  constructor(botInstance) {
    this.botInstance = botInstance;
    this._cancelled = false;
  }

  get bot() { return this.botInstance.bot; }

  cancel() { this._cancelled = true; }

  async mine(task) {
    const { target, amount, player } = task;
    this._cancelled = false;

    if (!target || !amount) {
      this.bot.chat('❓ Specify block and amount.');
      return;
    }

    this.bot.chat(`⛏ Mining ${amount}× ${target}`);
    let collected = 0;
    let failStreak = 0;

    while (collected < amount && !this._cancelled) {
      const block = this.bot.findBlock({
        matching: b => b.name === target,
        maxDistance: 64,
      });

      if (!block) {
        failStreak++;
        if (failStreak >= 3) {
          this.bot.chat(`⚠️ Can't find ${target} nearby.`);
          break;
        }
        await this._sleep(1500);
        continue;
      }

      failStreak = 0;
      try {
        this.bot.pathfinder.setGoal(
          new GoalNear(block.position.x, block.position.y, block.position.z, 2)
        );
        await this._waitForProximity(block.position, 2.5, 15000);
        if (this._cancelled) break;
        await this.bot.dig(block);
        collected++;
        if (collected % 8 === 0 || collected === amount) {
          this.bot.chat(`⛏ ${collected}/${amount} ${target}`);
        }
      } catch (e) {
        // block gone or unreachable – try another
      }
    }

    if (this._cancelled) {
      this.bot.chat(`⛏ Cancelled. Got ${collected}/${amount}.`);
    } else {
      this.bot.chat(`✅ Done! ${collected}/${amount} ${target}.`);
    }
  }

  _waitForProximity(pos, maxDist, timeoutMs = 15000) {
    return new Promise(resolve => {
      const t = setTimeout(resolve, timeoutMs);
      const check = () => {
        if (this.bot.entity.position.distanceTo(pos) <= maxDist) {
          clearTimeout(t);
          return resolve();
        }
        if (!this._cancelled) {
          setTimeout(check, 200);
        } else {
          clearTimeout(t);
          resolve();
        }
      };
      check();
    });
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = MiningSkill;
