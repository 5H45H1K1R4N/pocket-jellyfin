const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const Bot = require('./bot');
const attachChat = require('./chat');
const TaskQueue = require('./tasks/taskQueue');
const TaskPlanner = require('./tasks/taskPlanner');
const MockProvider = require('./ai/mockProvider');
const RemoteProvider = require('./ai/remoteProvider');
const BotServer = require('./api/botServer');

// Instantiate core components
const bot = new Bot();
const taskQueue = new TaskQueue();
const taskPlanner = new TaskPlanner(bot, taskQueue);

// Choose AI provider based on env
let aiProvider;
if (process.env.AI_PROVIDER === 'remote') {
  aiProvider = new RemoteProvider();
} else {
  // default to mock (offline) provider
  aiProvider = new MockProvider();
}

// Wire chat handler (Phase 2)
attachChat({ bot, username: process.env.MC_BOT_USERNAME || 'Peppy', emit: bot.emit.bind(bot) }, aiProvider, taskQueue);

// When a task is dequeued, let the planner handle it
taskQueue.on('taskReady', task => {
  taskPlanner.handleTask(task);
});

// Log forwarding (optional – could be sent to dashboard later)
bot.on('log', msg => console.log(msg));
bot.on('error', err => console.error('[Bot error]', err));

// Start HTTP API server (Phase 8)
const apiServer = new BotServer(bot, taskQueue);
apiServer.start();

// Start the bot (Phase 1 core)
bot.start().catch(err => {
  console.error('Failed to start bot:', err);
  process.exit(1);
});
