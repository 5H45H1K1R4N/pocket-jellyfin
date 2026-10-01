'use strict';

const CROPS = new Set(['wheat', 'carrots', 'potatoes', 'beetroot', 'sugarcane']);
const STRUCTURES = new Set(['wheat_farm', 'small_house', 'basic_storage']);
const FARM_ACTIONS = new Set(['harvest', 'plant', 'maintain']);
const SIMPLE_TASKS = new Set(['stop', 'defend', 'cancel', 'help', 'health', 'inventory', 'status']);
const HOSTILE_MOBS = new Set([
  'blaze', 'cave_spider', 'creeper', 'drowned', 'enderman', 'endermite', 'ghast',
  'husk', 'magma_cube', 'phantom', 'piglin', 'piglin_brute', 'pillager', 'ravager',
  'silverfish', 'skeleton', 'slime', 'spider', 'stray', 'vex', 'vindicator', 'warden',
  'witch', 'wither_skeleton', 'zoglin', 'zombie', 'zombie_villager', 'zombified_piglin'
]);

function requirePlayer(player) {
  if (typeof player !== 'string' || !/^[A-Za-z0-9_]{1,16}$/.test(player)) {
    throw new TypeError('A valid Minecraft player name is required.');
  }
  return player;
}

function validateTask(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Task must be a JSON object.');
  }

  const player = input.player === undefined ? undefined : requirePlayer(input.player);
  let task;

  switch (input.task) {
    case 'mine':
      if (typeof input.target !== 'string' || !/^[a-z0-9_]{1,48}$/.test(input.target)) {
        throw new TypeError('Mining target must be a valid block name.');
      }
      if (!Number.isSafeInteger(input.amount) || input.amount < 1 || input.amount > 256) {
        throw new TypeError('Mining amount must be an integer from 1 to 256.');
      }
      task = { task: 'mine', target: input.target, amount: input.amount };
      break;
    case 'farm':
      if (!FARM_ACTIONS.has(input.action) || !CROPS.has(input.crop)) {
        throw new TypeError('Farm action or crop is not supported.');
      }
      task = { task: 'farm', action: input.action, crop: input.crop };
      break;
    case 'build':
      if (!STRUCTURES.has(input.structure)) {
        throw new TypeError('Structure is not in the approved blueprint list.');
      }
      task = { task: 'build', structure: input.structure };
      break;
    case 'follow':
    case 'come':
      task = { task: input.task, player: requirePlayer(input.player) };
      break;
    case 'attack':
      if (typeof input.target !== 'string' || !HOSTILE_MOBS.has(input.target)) {
        throw new TypeError('Attack target must be an approved hostile mob.');
      }
      task = { task: 'attack', target: input.target };
      break;
    default:
      if (!SIMPLE_TASKS.has(input.task)) {
        throw new TypeError('Task type is not supported.');
      }
      task = { task: input.task };
  }

  if (player !== undefined) task.player = player;
  if (input.requestedBy !== undefined) task.requestedBy = requirePlayer(input.requestedBy);
  return task;
}

module.exports = { validateTask };