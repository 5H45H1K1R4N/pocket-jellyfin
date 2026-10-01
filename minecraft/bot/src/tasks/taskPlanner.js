const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

/**
 * TaskPlanner – interprets a task object from the queue and dispatches
 * to the appropriate skill module.
 * Currently supports: mine, follow, come, stop, farm, build, cancel, status.
 */
class TaskPlanner {
  constructor(botInstance, taskQueue) {
    this.bot = botInstance.bot; // underlying mineflayer bot
    this.botInstance = botInstance; // reference to Bot class for events
    this.queue = taskQueue;
    // Lazy‑load skill modules
    this.movement = new (require('../skills/movement'))(botInstance);
    this.mining = new (require('../skills/mining'))(botInstance);
    this.farming = new (require('../skills/farming'))(botInstance);
    this.building = new (require('../skills/building'))(botInstance);
  }

  async handleTask(task) {
    try {
      this.bot.chat(`⚙️ Executing ${task.task}…`);
      switch (task.task) {
        case 'follow':
          await this.movement.follow(task.player);
          break;
        case 'come':
          await this.movement.come(task.player);
          break;
        case 'stop':
          this.movement.stop();
          break;
        case 'mine':
          await this.mining.mine(task);
          break;
        case 'farm':
          await this.farming.farm(task);
          break;
        case 'build':
          await this.building.build(task);
          break;
        case 'cancel':
          this.queue.cancelCurrent();
          break;
        case 'status':
          // Will be served via API; just ack in chat
          this.bot.chat('📊 Current status requested – check dashboard.');
          break;
        default:
          this.bot.chat(`❓ Unknown task: ${task.task}`);
      }
      // Mark as completed unless cancelled or failed inside skill
      if (task._state !== 'CANCELLED' && task._state !== 'FAILED') {
        this.queue.finishCurrent('COMPLETED');
      }
    } catch (err) {
      this.bot.chat('🚨 Task failed – see console');
      this.botInstance.emit('error', err);
      this.queue.finishCurrent('FAILED');
    }
  }
}

module.exports = TaskPlanner;
