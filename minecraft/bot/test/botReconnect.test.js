'use strict';

const { EventEmitter } = require('events');
const test = require('node:test');
const assert = require('node:assert/strict');
const Bot = require('../src/bot');

class FakeMinecraftBot extends EventEmitter {
  constructor() {
    super();
    this.pathfinder = { setMovements() {} };
  }

  loadPlugin() {}
}

test('connection errors and end events share one exponential reconnect schedule', async () => {
  const clients = [];
  const timers = [];
  const bot = new Bot({
    env: { MC_SERVER_HOST: '127.0.0.1', MC_SERVER_PORT: '25565', MC_BOT_USERNAME: 'Peppy' },
    mineflayer: { createBot: () => {
      const client = new FakeMinecraftBot();
      clients.push(client);
      return client;
    } },
    pathfinderModule: { pathfinder() {}, Movements: class {} },
    collectBlockPlugin() {},
    setTimeout: (callback, delay) => {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimeout() {},
    installProcessHandlers: false,
  });
  bot.on('error', () => {});

  await bot.start();
  assert.equal(clients.length, 1);
  clients[0].emit('error', new Error('server unavailable'));
  clients[0].emit('end');
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 5000);

  timers[0].callback();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(clients.length, 2);
  clients[1].emit('end');
  assert.equal(timers.length, 2);
  assert.equal(timers[1].delay, 10000);
});

test('successful spawn resets the reconnect backoff', async () => {
  const clients = [];
  const timers = [];
  const bot = new Bot({
    env: {},
    mineflayer: { createBot: () => {
      const client = new FakeMinecraftBot();
      clients.push(client);
      return client;
    } },
    pathfinderModule: { pathfinder() {}, Movements: class {} },
    collectBlockPlugin() {},
    setTimeout: (callback, delay) => {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    installProcessHandlers: false,
  });
  bot.on('error', () => {});

  await bot.start();
  clients[0].emit('spawn');
  clients[0].emit('end');
  assert.equal(timers[0].delay, 5000);
});