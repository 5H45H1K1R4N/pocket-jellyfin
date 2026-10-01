'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const Bot            = require('./bot');
const TaskQueue      = require('./tasks/taskQueue');
const TaskPlanner    = require('./tasks/taskPlanner');
const ChatHandler    = require('./chat');
const BotServer      = require('./api/botServer');
const MockProvider   = require('./ai/mockProvider');
const GeminiProvider = require('./ai/geminiProvider');
const RemoteProvider = require('./ai/remoteProvider');

const botWrapper = new Bot();
const queue      = new TaskQueue();
const planner    = new TaskPlanner(botWrapper, queue);

// Setup AI provider pipeline
const mockAi = new MockProvider();
let aiProvider;

if (process.env.GEMINI_API_KEY || process.env.AI_PROVIDER === 'gemini') {
  console.log('[AI] Initializing Gemini AI Provider (with rule-based fallback)');
  aiProvider = new GeminiProvider(mockAi);
} else if (process.env.AI_PROVIDER === 'remote') {
  aiProvider = new RemoteProvider();
} else {
  console.log('[AI] Running in offline Mode (Rule-based Mock AI)');
  aiProvider = mockAi;
}

const chat   = new ChatHandler(botWrapper, queue, aiProvider);
const server = new BotServer(botWrapper, queue);

// Forward bot logs/errors to console
botWrapper.on('log',   msg => console.log(msg));
botWrapper.on('error', err => console.error('[Error]', err.message || err));

// Drive the task queue
queue.on('taskReady', task => planner.handleTask(task));

// Attach chat whenever the underlying mineflayer bot spawns
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

// Start HTTP API server then connect bot
server.start();
botWrapper.start().catch(err => console.error('[Startup]', err.message || err));
