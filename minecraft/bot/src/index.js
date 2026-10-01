'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const Bot            = require('./bot');
const TaskQueue      = require('./tasks/taskQueue');
const TaskPlanner    = require('./tasks/taskPlanner');
const ChatHandler    = require('./chat');
const BotServer      = require('./api/botServer');
const MockProvider   = require('./ai/mockProvider');
const RemoteProvider = require('./ai/remoteProvider');

const botWrapper = new Bot();
const queue      = new TaskQueue();
const planner    = new TaskPlanner(botWrapper, queue);
const ai         = process.env.AI_PROVIDER === 'remote'
  ? new RemoteProvider()
  : new MockProvider();
const chat   = new ChatHandler(botWrapper, queue, ai);
const server = new BotServer(botWrapper, queue);

// Forward bot logs/errors to console
botWrapper.on('log',   msg => console.log(msg));
botWrapper.on('error', err => console.error('[Error]', err.message || err));

// Drive the task queue
queue.on('taskReady', task => planner.handleTask(task));

// Attach chat whenever the underlying mineflayer bot spawns.
// We patch _connect so this also works across reconnections.
const _origConnect = botWrapper._connect.bind(botWrapper);
botWrapper._connect = async function () {
  await _origConnect();
  if (botWrapper.bot) {
    botWrapper.bot.once('spawn', () => {
      try { chat.attach(); } catch (e) {
        console.error('[Chat] attach error:', e.message);
      }
    });
  }
};

// Start HTTP API server then the bot
server.start();
botWrapper.start().catch(err => console.error('[Startup]', err.message || err));
