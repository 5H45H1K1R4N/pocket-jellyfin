'use strict';

const Vec3 = require('vec3');
const { GoalNear } = require('mineflayer-pathfinder').goals;

// ---------------------------------------------------------------------------
// Blueprint generation helpers
// ---------------------------------------------------------------------------

/**
 * Generate blueprint entries for a wheat farm.
 * 9×9 grid of dirt, with water at the centre (0,0,0).
 */
function makeWheatFarm() {
  const blocks = [];
  for (let x = -4; x <= 4; x++) {
    for (let z = -4; z <= 4; z++) {
      blocks.push({ x, y: 0, z, block: 'dirt' });
    }
  }
  // overwrite centre with water
  const centre = blocks.find(b => b.x === 0 && b.z === 0);
  if (centre) centre.block = 'water';
  return blocks;
}

/**
 * Generate blueprint entries for a small 5×5 house.
 * Floor at y=0, walls at y=1-3 (perimeter), windows at y=2 mid-walls, roof at y=4.
 */
function makeSmallHouse() {
  const blocks = [];
  const size = 5; // 0..4

  // Floor y=0
  for (let x = 0; x < size; x++)
    for (let z = 0; z < size; z++)
      blocks.push({ x, y: 0, z, block: 'oak_planks' });

  // Walls y=1..3 (only perimeter: x===0||x===4||z===0||z===4)
  for (let y = 1; y <= 3; y++) {
    for (let x = 0; x < size; x++) {
      for (let z = 0; z < size; z++) {
        if (x === 0 || x === size - 1 || z === 0 || z === size - 1) {
          blocks.push({ x, y, z, block: 'oak_planks' });
        }
      }
    }
  }

  // Windows – glass_pane at y=2, middle of each wall face
  // mid of x-axis walls: x=2, z=0 and x=2, z=4
  // mid of z-axis walls: x=0, z=2 and x=4, z=2
  const windows = [
    { x: 2, y: 2, z: 0 },
    { x: 2, y: 2, z: 4 },
    { x: 0, y: 2, z: 2 },
    { x: 4, y: 2, z: 2 },
  ];
  for (const w of windows) {
    const existing = blocks.find(b => b.x === w.x && b.y === w.y && b.z === w.z);
    if (existing) existing.block = 'glass_pane';
    else blocks.push({ ...w, block: 'glass_pane' });
  }

  // Roof y=4
  for (let x = 0; x < size; x++)
    for (let z = 0; z < size; z++)
      blocks.push({ x, y: 4, z, block: 'oak_planks' });

  return blocks;
}

/**
 * Generate blueprint entries for a basic 3×3×3 cobblestone storage shell.
 * Only perimeter (shell) blocks; chest at (1,1,1).
 */
function makeBasicStorage() {
  const blocks = [];
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      for (let z = 0; z < 3; z++) {
        // Only shell blocks
        const isShell =
          x === 0 || x === 2 || z === 0 || z === 2 || y === 0 || y === 2;
        if (!isShell) continue;
        blocks.push({ x, y, z, block: 'cobblestone' });
      }
    }
  }
  // Chest at centre interior
  blocks.push({ x: 1, y: 1, z: 1, block: 'chest' });
  return blocks;
}

// ---------------------------------------------------------------------------
// Blueprints registry
// ---------------------------------------------------------------------------

const BLUEPRINTS = {
  wheat_farm:    makeWheatFarm(),
  small_house:   makeSmallHouse(),
  basic_storage: makeBasicStorage(),
};

// ---------------------------------------------------------------------------
// BuildingSkill
// ---------------------------------------------------------------------------

class BuildingSkill {
  constructor(botInstance) {
    this.botInstance = botInstance;
    this._cancelled = false;
  }

  get bot() { return this.botInstance.bot; }

  cancel() { this._cancelled = true; }

  /**
   * Build a named structure from BLUEPRINTS relative to bot's current position.
   */
  async build(task) {
    this._cancelled = false;
    const key = (task.structure || '').toLowerCase().replace(/\s+/g, '_');
    const blueprint = BLUEPRINTS[key];

    if (!blueprint) {
      const available = Object.keys(BLUEPRINTS).join(', ');
      this.bot.chat(`❓ Unknown structure "${task.structure}". Available: ${available}`);
      return;
    }

    // Origin = bot position offset slightly forward so we don't build on top of ourselves
    const origin = this.bot.entity.position.floored().offset(2, 0, 2);

    // Count required blocks
    const needed = {};
    for (const entry of blueprint) {
      needed[entry.block] = (needed[entry.block] || 0) + 1;
    }

    // Check inventory and report missing
    const missing = [];
    for (const [blockName, count] of Object.entries(needed)) {
      const total = this.bot.inventory.items()
        .filter(i => i.name === blockName)
        .reduce((s, i) => s + i.count, 0);
      if (total < count) missing.push(`${blockName}×${count - total}`);
    }
    if (missing.length > 0) {
      this.bot.chat(`❌ Missing blocks: ${missing.join(', ')}`);
      return;
    }

    this.bot.chat(`🏗 Building ${key} (${blueprint.length} blocks)…`);
    let placed = 0;

    for (const entry of blueprint) {
      if (this._cancelled) break;

      const pos = new Vec3(
        origin.x + entry.x,
        origin.y + entry.y,
        origin.z + entry.z
      );

      try {
        // Navigate near placement position
        this.bot.pathfinder.setGoal(new GoalNear(pos.x, pos.y, pos.z, 3));
        await this._waitForProximity(pos, 4, 12000);
        if (this._cancelled) break;

        // Equip the item
        const item = this.bot.inventory.findInventoryItem(
          i => i.name === entry.block, null
        );
        if (!item) {
          this.bot.chat(`❌ Ran out of ${entry.block}!`);
          break;
        }
        await this.bot.equip(item, 'hand');

        // Find reference block below placement pos (to place on top of)
        const referenceBlock = this.bot.blockAt(pos.offset(0, -1, 0));
        if (!referenceBlock) continue;

        // Place block
        await this.bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
        placed++;

        if (placed % 10 === 0 || placed === blueprint.length) {
          this.bot.chat(`🏗 ${placed}/${blueprint.length} blocks placed.`);
        }
      } catch (e) {
        // Position occupied or unreachable – skip
      }
    }

    if (this._cancelled) {
      this.bot.chat(`🏗 Cancelled. Placed ${placed}/${blueprint.length} blocks.`);
    } else {
      this.bot.chat(`✅ ${key} complete! ${placed}/${blueprint.length} blocks placed.`);
    }
  }

  _waitForProximity(pos, maxDist = 4, timeoutMs = 12000) {
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

module.exports = BuildingSkill;
