'use strict';

const Vec3 = require('vec3');
const { GoalNear } = require('mineflayer-pathfinder').goals;

/**
 * Crop definitions.
 * special:true crops (sugarcane) use column-based harvesting logic.
 */
const CROP_MAP = {
  wheat:     { block: 'wheat',      maxAge: 7, seed: 'wheat_seeds' },
  carrots:   { block: 'carrots',    maxAge: 7, seed: 'carrot' },
  potatoes:  { block: 'potatoes',   maxAge: 7, seed: 'potato' },
  beetroot:  { block: 'beetroots',  maxAge: 3, seed: 'beetroot_seeds' },
  sugarcane: { special: true, block: 'sugar_cane', seed: 'sugar_cane' },
};

/** Normalize crop names from diverse player phrasings */
function normalizeCrop(str) {
  const s = (str || '').toLowerCase().replace(/[\s_]+/g, '');
  if (s.includes('sugar') || s.includes('cane')) return 'sugarcane';
  if (s.includes('wheat') || s.includes('grain')) return 'wheat';
  if (s.includes('carrot')) return 'carrots';
  if (s.includes('potato') || s.includes('potatoes')) return 'potatoes';
  if (s.includes('beet')) return 'beetroot';
  return s;
}

class FarmingSkill {
  constructor(botInstance) {
    this.botInstance = botInstance;
    this._cancelled = false;
  }

  get bot() { return this.botInstance.bot; }

  cancel() { this._cancelled = true; }

  async farm(task) {
    this._cancelled = false;
    const cropKey = normalizeCrop(task.crop || 'wheat');
    const { action, player } = task;

    if (!CROP_MAP[cropKey]) {
      this.bot.chat(`❓ Unknown crop: ${task.crop}. I support: wheat, carrots, potatoes, beetroot, sugarcane.`);
      return;
    }

    switch (action) {
      case 'harvest':  await this.harvest(cropKey, player); break;
      case 'plant':    await this.plant(cropKey, player);   break;
      case 'maintain': await this.maintain(cropKey, player); break;
      default:
        await this.maintain(cropKey, player);
    }
  }

  // ---------------------------------------------------------------------------
  // HARVEST
  // ---------------------------------------------------------------------------

  async harvest(cropName, player) {
    const info = CROP_MAP[cropName];
    if (!info) return;

    if (info.special) {
      await this.harvestSugarcane(player);
      return;
    }

    this.bot.chat(`🌾 Scanning for mature ${cropName}…`);
    let count = 0;

    // Scan a 48-block radius for matching crops
    const blocks = this.bot.findBlocks({
      matching: b => b.name === info.block,
      maxDistance: 48,
      count: 256,
    });

    // Sort blocks by distance so bot farms nearest first
    const sorted = blocks.sort((a, b) => {
      const pos = this.bot.entity.position;
      return pos.distanceTo(a) - pos.distanceTo(b);
    });

    for (const pos of sorted) {
      if (this._cancelled) break;
      const block = this.bot.blockAt(pos);
      if (!block) continue;

      // Verify maturity
      const props = block.getProperties ? block.getProperties() : {};
      const age = parseInt(props.age, 10);
      if (isNaN(age) || age < info.maxAge) continue;

      try {
        this.bot.pathfinder.setGoal(new GoalNear(pos.x, pos.y, pos.z, 2));
        await this._waitForProximity(pos, 2.5, 12000);
        if (this._cancelled) break;

        await this.bot.dig(block);
        count++;

        // Brief wait for drop item collection, then immediate auto-replant
        await this._sleep(150);
        await this._replant(pos, info.seed);

        if (count % 8 === 0) {
          this.bot.chat(`🌾 Harvested ${count} ${cropName}…`);
        }
      } catch (e) {
        // block unreachable or broken
      }
    }

    this.bot.chat(
      this._cancelled
        ? `🌾 Cancelled. Harvested ${count} ${cropName}.`
        : `✅ Completed! Harvested ${count} ${cropName}.`
    );
  }

  async harvestSugarcane(player) {
    this.bot.chat('🌾 Harvesting sugarcane (preserving bottom stalk)…');

    const allBlocks = this.bot.findBlocks({
      matching: b => b.name === 'sugar_cane',
      maxDistance: 48,
      count: 512,
    });

    // Only collect stalks where the block below is ALSO sugar_cane (preserves the root)
    const nonBase = allBlocks.filter(pos => {
      const below = this.bot.blockAt(pos.offset(0, -1, 0));
      return below && below.name === 'sugar_cane';
    });

    // De-duplicate by column (x, z): break from the lowest non-base upward
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
        await this._waitForProximity(pos, 2.5, 12000);
        if (this._cancelled) break;

        await this.bot.dig(block);
        count++;
      } catch (e) {}
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

  async plant(cropName, player) {
    const info = CROP_MAP[cropName];
    if (!info) return;

    let seedItem = this._findSeed(info.seed);
    if (!seedItem) {
      this.bot.chat(`❌ I don't have any ${info.seed} in my inventory!`);
      return;
    }

    this.bot.chat(`🌱 Planting ${cropName} on empty farmland…`);
    let count = 0;

    const farmlandBlocks = this.bot.findBlocks({
      matching: b => b.name === 'farmland',
      maxDistance: 48,
      count: 256,
    });

    // Sort to plant nearest first
    const sorted = farmlandBlocks.sort((a, b) => {
      const pos = this.bot.entity.position;
      return pos.distanceTo(a) - pos.distanceTo(b);
    });

    for (const pos of sorted) {
      if (this._cancelled) break;

      // Air must be directly above the farmland
      const above = this.bot.blockAt(pos.offset(0, 1, 0));
      if (!above || above.name !== 'air') continue;

      seedItem = this._findSeed(info.seed);
      if (!seedItem) {
        this.bot.chat('❌ Ran out of seeds!');
        break;
      }

      try {
        this.bot.pathfinder.setGoal(new GoalNear(pos.x, pos.y, pos.z, 2));
        await this._waitForProximity(pos, 2.5, 12000);
        if (this._cancelled) break;

        await this.bot.equip(seedItem, 'hand');
        const farmland = this.bot.blockAt(pos);
        if (!farmland || farmland.name !== 'farmland') continue;

        await this.bot.placeBlock(farmland, new Vec3(0, 1, 0));
        count++;

        if (count % 8 === 0) {
          this.bot.chat(`🌱 Planted ${count} ${cropName}…`);
        }
      } catch (e) {}
    }

    this.bot.chat(
      this._cancelled
        ? `🌱 Cancelled. Planted ${count} ${cropName}.`
        : `✅ Finished! Planted ${count} ${cropName}.`
    );
  }

  // ---------------------------------------------------------------------------
  // MAINTAIN (Harvest then Replant)
  // ---------------------------------------------------------------------------

  async maintain(cropName, player) {
    this.bot.chat(`🔄 Starting farm maintenance cycle for ${cropName}…`);
    await this.harvest(cropName, player);
    if (!this._cancelled) {
      await this.plant(cropName, player);
    }
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  _findSeed(seedName) {
    if (!this.bot || !this.bot.inventory) return null;
    return this.bot.inventory.items().find(i => i.name === seedName) || null;
  }

  async _replant(pos, seedName) {
    try {
      const seed = this._findSeed(seedName);
      if (!seed) return;

      await this.bot.equip(seed, 'hand');
      const farmland = this.bot.blockAt(pos.offset(0, -1, 0));
      if (!farmland || farmland.name !== 'farmland') return;

      await this.bot.placeBlock(farmland, new Vec3(0, 1, 0));
    } catch (_) {}
  }

  _waitForProximity(pos, maxDist = 2.5, timeoutMs = 12000) {
    return new Promise(resolve => {
      const t = setTimeout(resolve, timeoutMs);
      const check = () => {
        if (!this.bot || !this.bot.entity) {
          clearTimeout(t);
          return resolve();
        }
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
