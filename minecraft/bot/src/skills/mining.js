'use strict';

/**
 * MiningSkill – handles mining and resource gathering.
 * Includes auto-tool equipping logic (best pickaxe/axe/shovel in inventory)
 * and fail-streak recovery.
 */
class MiningSkill {
  constructor(botInstance) {
    this.botInstance = botInstance;
    this._cancelled = false;
  }

  get bot() { return this.botInstance.bot; }

  cancel() {
    this._cancelled = true;
    if (this.bot && this.bot.collectBlock && typeof this.bot.collectBlock.cancelTask === 'function') {
      this.bot.collectBlock.cancelTask();
    }
  }

  async mine(task) {
    const { target, amount, player } = task;
    this._cancelled = false;

    if (!target || !amount) {
      this.bot.chat('❓ Specify block and amount (e.g. Peppy mine 32 iron_ore).');
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
          this.bot.chat(`⚠️ Can't find any ${target} within 64 blocks.`);
          break;
        }
        await this._sleep(1500);
        continue;
      }

      failStreak = 0;
      try {
        // Equip the best available tool for this block before digging
        await this._equipBestTool(block);
        if (this._cancelled) break;

        await this.bot.collectBlock.collect(block);
        failStreak = 0;
        collected++;
        if (collected % 8 === 0 || collected === amount) {
          this.bot.chat(`⛏ ${collected}/${amount} ${target}`);
        }
      } catch (e) {
        failStreak++;
        if (failStreak >= 3) {
          this.bot.chat(`⚠️ Unable to reach or collect ${target}; stopping safely.`);
          break;
        }
      }
    }

    this.bot.chat(
      this._cancelled
        ? `⛏ Cancelled. Got ${collected}/${amount} ${target}.`
        : `✅ Finished! Collected ${collected}/${amount} ${target}.`
    );
  }

  /**
   * Intelligently equip the best tool (pickaxe, shovel, axe, shears) for the block.
   */
  async _equipBestTool(block) {
    if (!this.bot || !block) return;
    try {
      // If mineflayer-tool plugin is installed, use its equipForBlock
      if (this.bot.tool && typeof this.bot.tool.equipForBlock === 'function') {
        await this.bot.tool.equipForBlock(block);
        return;
      }

      // Native fallback tool selector
      const toolPreference = ['netherite', 'diamond', 'iron', 'golden', 'stone', 'wooden'];
      let targetType = 'pickaxe';

      const name = block.name || '';
      if (name.includes('log') || name.includes('wood') || name.includes('plank')) {
        targetType = 'axe';
      } else if (name.includes('dirt') || name.includes('sand') || name.includes('gravel') || name.includes('clay')) {
        targetType = 'shovel';
      }

      const items = this.bot.inventory.items();
      let bestItem = null;

      for (const tier of toolPreference) {
        const found = items.find(i => i.name === `${tier}_${targetType}`);
        if (found) {
          bestItem = found;
          break;
        }
      }

      if (bestItem) {
        await this.bot.equip(bestItem, 'hand');
      }
    } catch (_) {}
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = MiningSkill;
