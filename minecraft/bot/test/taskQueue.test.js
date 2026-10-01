'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const TaskQueue = require('../src/tasks/taskQueue');

test('queue validates and normalizes tasks before accepting them', () => {
  const queue = new TaskQueue();
  queue.enqueue({ task: 'mine', target: 'iron_ore', amount: 32, player: 'Steve', shell: 'ignored' });

  assert.equal(queue.current.task, 'mine');
  assert.equal(queue.current._state, 'PLANNING');
  assert.equal(queue.current.shell, undefined);
  assert.equal(queue.current.amount, 32);
});

test('queue rejects malformed, unbounded, and unsupported tasks', () => {
  const queue = new TaskQueue();
  assert.throws(() => queue.enqueue({ task: 'mine', target: 'iron_ore', amount: 100000 }), /1 to 256/);
  assert.throws(() => queue.enqueue({ task: 'run_code', source: 'dangerous' }), /not supported/);
  assert.throws(() => queue.enqueue({ task: 'build', structure: 'anything' }), /approved blueprint/);
  assert.throws(() => queue.enqueue({ task: 'attack', target: 'Steve' }), /approved hostile mob/);
  assert.equal(queue.current, null);
});

test('task state advances and cancellation waits for the running action to finish', () => {
  const queue = new TaskQueue();
  const cancellations = [];
  queue.on('cancelRequested', request => cancellations.push(request.task.id));

  const task = queue.enqueue({ task: 'mine', target: 'cobblestone', amount: 16 });
  assert.equal(queue.markRunning(task), true);
  assert.equal(task._state, 'RUNNING');
  assert.equal(queue.cancelCurrent(), true);
  assert.equal(queue.cancelCurrent(), false);
  assert.equal(queue.current, task);
  assert.deepEqual(cancellations, [task.id]);

  queue.finishCurrent('CANCELLED');
  assert.equal(queue.current, null);
});

test('queue processes pending tasks in FIFO order', () => {
  const queue = new TaskQueue();
  queue.enqueue({ task: 'status' });
  const second = queue.enqueue({ task: 'help' });
  queue.finishCurrent('COMPLETED');

  assert.equal(queue.current.id, second.id);
  assert.equal(queue.current._state, 'PLANNING');
});