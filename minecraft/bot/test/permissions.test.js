'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Levels, getLevel, canExecute } = require('../src/security/permissions');

test('configured owner, admins, and player allowlist map to the expected levels', () => {
  const original = {
    owner: process.env.MC_BOT_OWNER,
    admins: process.env.MC_BOT_ADMINS,
    players: process.env.MC_BOT_PLAYERS,
  };
  process.env.MC_BOT_OWNER = 'Shashi';
  process.env.MC_BOT_ADMINS = 'ModOne';
  process.env.MC_BOT_PLAYERS = 'Steve,Alex';

  assert.equal(getLevel('shashi'), Levels.OWNER);
  assert.equal(getLevel('MODONE'), Levels.ADMIN);
  assert.equal(getLevel('Steve'), Levels.PLAYER);
  assert.equal(getLevel('Unknown'), Levels.GUEST);

  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[{ owner: 'MC_BOT_OWNER', admins: 'MC_BOT_ADMINS', players: 'MC_BOT_PLAYERS' }[key]];
    else process.env[{ owner: 'MC_BOT_OWNER', admins: 'MC_BOT_ADMINS', players: 'MC_BOT_PLAYERS' }[key]] = value;
  }
});

test('players can use safe controls but world-changing tasks require owner/admin', () => {
  const originalOwner = process.env.MC_BOT_OWNER;
  const originalPlayers = process.env.MC_BOT_PLAYERS;
  process.env.MC_BOT_OWNER = 'Owner';
  process.env.MC_BOT_PLAYERS = 'Steve';

  assert.equal(canExecute({ task: 'follow', player: 'Steve' }, 'Steve'), true);
  assert.equal(canExecute({ task: 'follow', player: 'Alex' }, 'Steve'), false);
  assert.equal(canExecute({ task: 'mine' }, 'Steve'), false);
  assert.equal(canExecute({ task: 'mine' }, 'Owner'), true);
  assert.equal(canExecute({ task: 'cancel' }, 'Steve', { requestedBy: 'Steve' }), true);
  assert.equal(canExecute({ task: 'cancel' }, 'Steve', { requestedBy: 'Alex' }), false);

  if (originalOwner === undefined) delete process.env.MC_BOT_OWNER;
  else process.env.MC_BOT_OWNER = originalOwner;
  if (originalPlayers === undefined) delete process.env.MC_BOT_PLAYERS;
  else process.env.MC_BOT_PLAYERS = originalPlayers;
});

test('permission checks fail safely for missing or malformed usernames', () => {
  const originalOwner = process.env.MC_BOT_OWNER;
  const originalPlayers = process.env.MC_BOT_PLAYERS;
  process.env.MC_BOT_OWNER = 'Owner';
  process.env.MC_BOT_PLAYERS = 'Steve';

  assert.equal(getLevel(undefined), Levels.GUEST);
  assert.equal(getLevel('   '), Levels.GUEST);
  assert.equal(canExecute({ task: 'status' }, undefined), true);
  assert.equal(canExecute({ task: 'mine' }, undefined), false);
  assert.equal(canExecute({ task: 'follow', player: 'Steve' }, undefined), false);

  if (originalOwner === undefined) delete process.env.MC_BOT_OWNER;
  else process.env.MC_BOT_OWNER = originalOwner;
  if (originalPlayers === undefined) delete process.env.MC_BOT_PLAYERS;
  else process.env.MC_BOT_PLAYERS = originalPlayers;
});