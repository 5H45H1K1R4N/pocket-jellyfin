const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const Bot = require('./bot');

/**
 * Simple chat handler for Peppy.
 * Listens to the bot's "chat" event, filters messages addressed to Peppy
 * ("Peppy", "@Peppy", "!peppy" – case‑insensitive), and forwards the
 * raw text to the AI layer (mockProvider for now).
 */
module.exports = function attachChatHandler(botInstance, aiProvider, taskQueue) {
  botInstance.bot.on('chat', (username, message) => {
    // Ignore bot's own messages
    if (username === botInstance.username) return;

    const lower = message.toLowerCase();
    const trigger = lower.startsWith('peppy') || lower.startsWith('@peppy') || lower.startsWith('!peppy');
    if (!trigger) return; // not addressed to Peppy

    // Extract the command after the trigger word
    const command = message.replace(/^(peppy|@peppy|!peppy)\s*/i, '').trim();
    if (!command) return; // nothing to do

    // Emit a log for visibility
    botInstance.emit('log', `[Chat] ${username}: ${command}`);

    // Parse via AI provider (returns a task JSON or null)
    const task = aiProvider.parseCommand(command, username);
    if (task) {
      taskQueue.enqueue(task);
      botInstance.bot.chat(`✅ Queued task: ${task.task}`);
    } else {
      botInstance.bot.chat(`❓ I didn't understand that. Try a different command.`);
    }
  });
};
