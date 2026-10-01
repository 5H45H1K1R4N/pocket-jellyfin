'use strict';

const http = require('http');
const test = require('node:test');
const assert = require('node:assert/strict');
const BotServer = require('../src/api/botServer');
const TaskQueue = require('../src/tasks/taskQueue');

function request(port, path, method = 'GET', body) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      path,
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    }, response => {
      let data = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(data) }));
    });
    request.on('error', reject);
    if (body !== undefined) request.write(body);
    request.end();
  });
}

test('bot API accepts only valid bounded commands and reports offline state', async t => {
  let bot = { username: 'Peppy', health: 20, food: 20, inventory: { items: () => [] } };
  const queue = new TaskQueue();
  const server = new BotServer({ get bot() { return bot; } }, queue, { port: 0 });
  server.start();
  await new Promise(resolve => server.server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.server.close(resolve)));
  assert.equal(server.server.address().address, '127.0.0.1');
  const port = server.server.address().port;

  const accepted = await request(port, '/api/bot/command', 'POST', JSON.stringify({
    task: 'mine', target: 'iron_ore', amount: 8,
  }));
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.state, 'PLANNING');

  const invalid = await request(port, '/api/bot/command', 'POST', JSON.stringify({ task: 'execute', code: 'nope' }));
  assert.equal(invalid.status, 400);

  const oversized = await request(port, '/api/bot/command', 'POST', ' '.repeat(9000));
  assert.equal(oversized.status, 413);

  bot = null;
  const offline = await request(port, '/api/bot/command', 'POST', JSON.stringify({ task: 'status' }));
  assert.equal(offline.status, 503);
});