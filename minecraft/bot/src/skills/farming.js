'use strict';

const Vec3 = require('vec3');
const { GoalNear } = require('mineflayer-pathfinder').goals;

/**
 * Crop definitions.
 * special:true crops (sugarcane) use column-based harvesting logic.
 */
const CROP_MAP = {
  wheat:     { block: 'wheat',     maxAge: 7, seed: 'wheat_seeds' },
  carrots:   { block: 'carrots',   maxAge: 7, seed: 'carrot' },
  potatoes:  { block: 'potatoes',  maxAge: 7, seed: 'potato' },
  beetroot:  { block: 'beetroots', maxAge: 3, seed: 'beetroot_seeds' },
  sugarcane: { special: true, block: 'sugar_cane', seed: 'sugar_cane' },
};

/** Normalize a crop name from user input to a CROP_MAP key. */
function normalizeCrop(str) {
  const s = str.toLowerCase().replace(/[\s_]+/g, '');
  if (s === 'sugarcane' || s === 'sugarcane' || s === 'sugarcane') return 'sugarcane';
  if (s === 'wheat') return 'wheat';
  if (s === 'carrot' || s === 'carrots') return 'carrots';
  if (s === 'potato' || s === 'potatoes') return 'potatoes';
  if (s === 'beetroot' || s === 'beetroots') return 'beetroot';
  return s;
}

class FarmingSkill {
  constructor(botInstance) {
    this.botInstance = botInstance;
    this._cancelled = false;
  }

  get bot() { return this.botInstance.bot; }

  cancel() { this._cancelled = true; }

  /**
   * Dispatch to harvest / plant / maintain based on task.action.
   */
  async farm(task) {
    this._cancelled = false;
    const cropKey = normalizeCrop(task.crop || '');
    const { action, player } = task;

    if (!CROP_MAP[cropKey]) {
      this.bot.chat(`❓ Unknown crop: ${task.crop}. Known: ${Object.keys(CROP_MAP).join(', ')}`);
      return;
    }

    switch (action) {
      case 'harvest':  await this.harvest(cropKey, player); break;
      case 'plant':    await this.plant(cropKey, player);   break;
      case 'maintain': await this.maintain(cropKey, player); break;
      default:
        this.bot.chat(`❓ Unknown farm action: ${action}`);
    }
  }

  // ---------------------------------------------------------------------------
  // HARVEST
  // ---------------------------------------------------------------------------

  /**
   * Harvest all mature crops of the given type.
   */
  async harvest(cropName, player) {
    const info = CROP_MAP[cropName];
    if (!info) { this.bot.chat(`❓ Unknown crop: ${cropName}`); return; }

    if (info.special) {
      await this.harvestSugarcane(player);
      return;
    }

    this.bot.chat(`🌾 Harvesting ${cropName}…`);
    let count = 0;

    const blocks = this.bot.findBlocks({
      matching: b => b.name === info.block,
      maxDistance: 48,
      count: 256,
    });

    for (const pos of blocks) {
      if (this._cancelled) break;
      const block = this.bot.blockAt(pos);
      if (!block) continue;

      // Check maturity
      const props = block.getProperties ? block.getProperties() : {};
      const age = parseInt(props.age, 10);
      if (isNaN(age) || age < info.maxAge) continue;

      try {
        this.bot.pathfinder.setGoal(new GoalNear(pos.x, pos.y, pos.z, 2));
        await this._waitForProximity(pos, 3, 12000);
        if (this._cancelled) break;
        await this.bot.dig(block);
        count++;
        // Auto-replant
        await this._replant(pos, info.seed);
        if (count % 10 === 0) this.bot.chat(`🌾 Harvested ${count} ${cropName}…`);
      } catch (e) {
        // block gone or unreachable
      }
    }

    this.bot.chat(
      this._cancelled
        ? `🌾 Cancelled. Harvested ${count} ${cropName}.`
        : `✅ Harvested ${count} ${cropName}.`
    );
  }

  /**
   * Harvest sugarcane: find non-base sugarcane blocks (block below is also sugar_cane),
   * de-duplicate by column keeping the lowest non-base y, then dig each.
   */
  async harvestSugarcane(player) {
    this.bot.chat('🌾 Harvesting sugarcane…');

    const allBlocks = this.bot.findBlocks({
      matching: b => b.name === 'sugar_cane',
      maxDistance: 48,
      count: 512,
    });

    // Keep only blocks whose block below is also sugar_cane (they are non-base)
    const nonBase = allBlocks.filter(pos => {
      const below = this.bot.blockAt(pos.offset(0, -1, 0));
      return below && below.name === 'sugar_cane';
    });

    // De-duplicate by column (x,z): keep the one with the lowest y per column
    const colMap = new Map();
    for (const pos of nonBase) {
      const key = `${pos.x},${pos.z}`;
      if (!colMap.has(key) || pos.y < colMap.get(key).y) {
        colMap.set(key, pos);
      }
    }

    const targets = Array.from(colMap.values());
    let count = 0;

    for (const pos of targets) {
      if (this._cancelled) break;
      const block = this.bot.blockAt(pos);
      if (!block || block.name !== 'sugar_cane') continue;
      try {
        this.bot.pathfinder.setGoal(new GoalNear(pos.x, pos.y, pos.z, 2));
        await this._waitForProximity(pos, 3, 12000);
        if (this._cancelled) break;
        await this.bot.dig(block);
        count++;
      } catch (e) { /* skip */ }
    }

    this.bot.chat(
      this._cancelled
        ? `🌾 Cancelled. Harvested ${count} sugarcane.`
        : `✅ Harvested ${count} sugarcane.`
    );
  }

  // ---------------------------------------------------------------------------
  // PLANT
  // ---------------------------------------------------------------------------

  /**
   * Plant seeds on all empty farmland blocks nearby.
   */
  async plant(cropName, player) {
    const info = CROP_MAP[cropName];
    if (!info) { this.bot.chat(`❓ Unknown crop: ${cropName}`); return; }

    // Check inventory for seed
    const seedItem = this.bot.inventory.findInventoryItem(
      item => item.name === info.seed, null
    );
    if (!seedItem) {
      this.bot.chat(`❌ No ${info.seed} in inventory!`);
      return;
    }

    this.bot.chat(`🌱 Planting ${cropName}…`);
    let count = 0;

    const farmlandBlocks = this.bot.findBlocks({
      matching: b => b.name === 'farmland',
      maxDistance: 48,
      count: 256,
    });

    for (const pos of farmlandBlocks) {
      if (this._cancelled) break;

      // Must have air directly above
      const above = this.bot.blockAt(pos.offset(0, 1, 0));
      if (!above || above.name !== 'air') continue;

      // Re-check seed availability
      const seed = this.bot.inventory.findInventoryItem(
        item => item.name === info.seed, null
      );
      if (!seed) { this.bot.chat('❌ Ran out of seeds!'); break; }

      try {
        this.bot.pathfinder.setGoal(new GoalNear(pos.x, pos.y, pos.z, 2));
        await this._waitForProximity(pos, 3, 12000);
        if (this._cancelled) break;

        await this.bot.equip(seed, 'hand');
        const farmland = this.bot.blockAt(pos);
        if (!farmland) continue;
        await this.bot.placeBlock(farmland, new Vec3(0, 1, 0));
        count++;

        if (count % 10 === 0) this.bot.chat(`🌱 Planted ${count} ${cropName}…`);
      } catch (e) { /* already planted or unreachable */ }
    }

    this.bot.chat(
      this._cancelled
        ? `🌱 Cancelled. Planted ${count} ${cropName}.`
        : `✅ Planted ${count} ${cropName}.`
    );
  }

  // ---------------------------------------------------------------------------
  // MAINTAIN
  // ---------------------------------------------------------------------------

  async maintain(cropName, player) {
    await this.harvest(cropName, player);
    if (!this._cancelled) await this.plant(cropName, player);
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  /**
   * Replant a single seed at the given position (assumes farmland at pos - 1y).
   */
  async _replant(pos, seedName) {
    try {
      const seed = this.bot.inventory.findInventoryItem(
        item => item.name === seedName, null
      );
      if (!seed) return;
      await this.bot.equip(seed, 'hand');
      const farmland = this.bot.blockAt(pos.offset(0, -1, 0));
      if (!farmland || farmland.name !== 'farmland') return;
      await this.bot.placeBlock(farmland, new Vec3(0, 1, 0));
    } catch (e) { /* replant failed silently */ }
  }

  _waitForProximity(pos, maxDist = 3, timeoutMs = 12000) {
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

module.exports = FarmingSkill;
