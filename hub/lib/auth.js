// Authentication: scrypt password hashing, session tokens, role checks.
// Passwords never leave the server. Session tokens are random, stored only
// as SHA-256 hashes, and delivered in HttpOnly cookies.

import crypto from 'node:crypto';
import { readCollection, writeCollection, newId, cryptoRandomHex } from './store.js';
import { loadConfig } from './config.js';

export const ROLES = ['admin', 'family', 'guest'];
const ROLE_RANK = { admin: 3, family: 2, guest: 1 };

export function roleRank(role) {
  return ROLE_RANK[role] || 0;
}

export function atLeast(role, minimum) {
  return roleRank(role) >= roleRank(minimum);
}

// ---- passwords -------------------------------------------------------------

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, n, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, {
      ...SCRYPT, N: Number(n) || SCRYPT.N,
    });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// ---- users -----------------------------------------------------------------

export function listUsers() {
  return readCollection('users', []);
}

export function findUserByName(username) {
  const wanted = String(username || '').toLowerCase();
  return listUsers().find((u) => u.username.toLowerCase() === wanted) || null;
}

export function findUserById(id) {
  return listUsers().find((u) => u.id === id) || null;
}

export function createUser({ username, password, displayName, role }) {
  const clean = String(username || '').trim();
  if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(clean)) {
    throw new Error('Username must be 2–32 characters (letters, digits, _ . -).');
  }
  if (findUserByName(clean)) throw new Error('That username already exists.');
  if (!password || String(password).length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }
  if (!ROLES.includes(role)) throw new Error('Invalid role.');
  const user = {
    id: newId(),
    username: clean,
    displayName: String(displayName || clean).trim().slice(0, 48) || clean,
    role,
    passwordHash: hashPassword(password),
    createdAt: Date.now(),
    disabled: false,
    // Optional per-user accent for avatars (deterministic from id if unset).
    color: null,
  };
  const users = listUsers();
  users.push(user);
  writeCollection('users', users);
  return user;
}

export function updateUser(id, patch) {
  const users = listUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  const user = { ...users[idx] };
  if (patch.displayName !== undefined) user.displayName = String(patch.displayName).trim().slice(0, 48) || user.username;
  if (patch.role !== undefined) {
    if (!ROLES.includes(patch.role)) throw new Error('Invalid role.');
    user.role = patch.role;
  }
  if (patch.disabled !== undefined) user.disabled = Boolean(patch.disabled);
  if (patch.color !== undefined) user.color = patch.color || null;
  if (patch.password) {
    if (String(patch.password).length < 8) throw new Error('Password must be at least 8 characters.');
    user.passwordHash = hashPassword(patch.password);
  }
  users[idx] = user;
  writeCollection('users', users);
  return user;
}

// ---- sessions --------------------------------------------------------------

export function createSession(userId, meta = {}) {
  const token = cryptoRandomHex(32);
  const sessions = readCollection('sessions', []);
  // Housekeeping: drop expired sessions while we're here.
  const cfg = loadConfig();
  const ttl = cfg.sessionDays * 24 * 60 * 60 * 1000;
  const alive = sessions.filter((s) => Date.now() - s.lastSeenAt < ttl);
  alive.push({
    id: newId(),
    userId,
    tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    ip: meta.ip || null,
    ua: meta.ua ? String(meta.ua).slice(0, 120) : null,
  });
  writeCollection('sessions', alive);
  return token;
}

export function resolveSession(token) {
  if (!token) return null;
  const cfg = loadConfig();
  const ttl = cfg.sessionDays * 24 * 60 * 60 * 1000;
  const sessions = readCollection('sessions', []);
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const session = sessions.find((s) => s.tokenHash === hash);
  if (!session) return null;
  if (Date.now() - session.lastSeenAt > ttl) {
    destroySession(token);
    return null;
  }
  const user = findUserById(session.userId);
  if (!user || user.disabled) return null;
  return { session, user };
}

// Throttle lastSeenAt writes (one write per session per 20s is plenty).
export function touchSession(session, meta = {}) {
  if (Date.now() - (session.lastSeenAt || 0) < 20_000 && !meta.force) return;
  const sessions = readCollection('sessions', []);
  const idx = sessions.find((s) => s.id === session.id);
  if (!idx) return;
  idx.lastSeenAt = Date.now();
  if (meta.ip) idx.ip = meta.ip;
  writeCollection('sessions', sessions);
}

export function destroySession(token) {
  if (!token) return;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const sessions = readCollection('sessions', []).filter((s) => s.tokenHash !== hash);
  writeCollection('sessions', sessions);
}

export function destroySessionsFor(userId) {
  writeCollection('sessions', readCollection('sessions', []).filter((s) => s.userId !== userId));
}

// ---- presence --------------------------------------------------------------

// 'online'  = authenticated activity within the online window
// 'idle'    = authenticated activity within the idle window
// 'offline' = no recent Hub activity (we make no claims about their device)
export function presenceOf(lastSeenAt) {
  const cfg = loadConfig();
  const age = Date.now() - (lastSeenAt || 0);
  if (age <= cfg.presenceOnlineMs) return 'online';
  if (age <= cfg.presenceIdleMs) return 'idle';
  return 'offline';
}

export function lastSeenFor(userId) {
  const sessions = readCollection('sessions', []);
  let latest = 0;
  for (const s of sessions) {
    if (s.userId === userId && s.lastSeenAt > latest) latest = s.lastSeenAt;
  }
  return latest;
}

// ---- bootstrap -------------------------------------------------------------

export function hasUsers() {
  return listUsers().length > 0;
}
