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

function normalizeUsername(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

/**
 * Determine a user's permission level. An empty player allowlist preserves the
 * existing open-chat behavior; setting MC_BOT_PLAYERS makes other users guests.
 */
function getLevel(username) {
  const safeUsername = normalizeUsername(username);
  if (!safeUsername) return Levels.GUEST;

  const owner = normalizeUsername(process.env.MC_BOT_OWNER || '');
  const admins = parseNames(process.env.MC_BOT_ADMINS);
  const players = parseNames(process.env.MC_BOT_PLAYERS);
  if (admins.has(safeUsername)) return Levels.ADMIN;
  if (owner && !/^yourminecraftusername$/i.test(owner) && owner === safeUsername) {
    return Levels.OWNER;
  }
  if (players.size && !players.has(safeUsername)) return Levels.GUEST;
  return Levels.PLAYER;
}

function parseNames(value = '') {
  return new Set(String(value).split(',').map(name => normalizeUsername(name)).filter(Boolean));
}

function canExecute(task, username, activeTask) {
  if (!task || typeof task !== 'object') return false;

  const safeUsername = normalizeUsername(username);
  const level = getLevel(safeUsername);
  if (level >= Levels.OWNER) return true;

  if (['help', 'health', 'inventory', 'status', 'chat'].includes(task.task)) return true;
  if (task.task === 'follow' || task.task === 'come') {
    const target = normalizeUsername(task.player);
    return !target || target === safeUsername;
  }
  if (task.task === 'stop') return level >= Levels.PLAYER;
  if (task.task === 'cancel') {
    const requestedBy = normalizeUsername(activeTask && activeTask.requestedBy);
    return !!activeTask && !!requestedBy && requestedBy === safeUsername;
  }
  return false;
}

module.exports = { Levels, getLevel, canExecute };
