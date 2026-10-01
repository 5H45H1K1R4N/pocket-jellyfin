const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

/**
 * MockProvider – lightweight rule‑based parser (offline).
 * Recognises a limited set of commands the bot can understand without an LLM.
 * Returns a task object compatible with the TaskQueue schema.
 */
class MockProvider {
  constructor() {
    // simple regex patterns for supported commands
    this.patterns = [
      { regex: /mine\s+(\d+)\s+(.*)/i, task: 'mine' },
      { regex: /follow\s+me/i, task: 'follow' },
      { regex: /come\s+to\s+me/i, task: 'come' },
      { regex: /stop/i, task: 'stop' },
      { regex: /cancel/i, task: 'cancel' },
      { regex: /status/i, task: 'status' },
      { regex: /harvest\s+(.*)/i, task: 'farm', action: 'harvest' },
      { regex: /plant\s+(.*)/i, task: 'farm', action: 'plant' },
      { regex: /build\s+(.*)/i, task: 'build' },
    ];
  }

  /**
   * Parse a raw command string from chat.
   * @param {string} command – the message after the trigger word.
   * @param {string} username – player who issued the command (used as "owner" for permission checks).
   * @returns {object|null} task object or null if not recognised.
   */
  parseCommand(command, username) {
    const trimmed = command.trim();
    for (const p of this.patterns) {
      const m = trimmed.match(p.regex);
      if (m) {
        const task = { task: p.task, player: username };
        if (p.task === 'mine') {
          task.amount = parseInt(m[1], 10);
          task.target = m[2];
        } else if (p.task === 'farm') {
          task.action = p.action;
          task.crop = m[1];
        } else if (p.task === 'build') {
          task.structure = m[1];
        }
        return task;
      }
    }
    return null; // unknown command
  }
}

module.exports = MockProvider;
