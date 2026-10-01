const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Simple permission helper – defines hierarchy and checks.
 * Levels: ADMIN > OWNER > PLAYER > GUEST
 */
const Levels = {
  ADMIN: 4,
  OWNER: 3,
  PLAYER: 2,
  GUEST: 1,
};

/**
 * Determine a user's permission level.
 * For now:
 *  - If username matches MC_BOT_OWNER env → OWNER
 *  - If username is in a hard‑coded admin list → ADMIN
 *  - Otherwise → PLAYER
 */
function getLevel(username) {
  const owner = process.env.MC_BOT_OWNER;
  const admins = (process.env.MC_BOT_ADMINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (admins.includes(username)) return Levels.ADMIN;
  if (owner && username === owner) return Levels.OWNER;
  return Levels.PLAYER;
}

module.exports = { Levels, getLevel };
