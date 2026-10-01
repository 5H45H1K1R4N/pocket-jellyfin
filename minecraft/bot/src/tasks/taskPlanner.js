/**
 * TaskPlanner – routes tasks to skill modules.
 * Skills are instantiated with the Bot wrapper (not bot.bot directly),
 * so they use lazy getters and are safe to create before the bot connects.
 */
class TaskPlanner {
  constructor(botInstance, taskQueue) {
    this.botInstance = botInstance;
    this.queue = taskQueue;

    // Pass botInstance (the wrapper), NOT botInstance.bot
    // Each skill uses a lazy `get bot()` getter to resolve bot.bot at runtime
    this.movement  = new (require('../skills/movement'))(botInstance);
    this.mining    = new (require('../skills/mining'))(botInstance);
    this.farming   = new (require('../skills/farming'))(botInstance);
    this.building  = new (require('../skills/building'))(botInstance);
  }

  get bot() { return this.botInstance.bot; }

  async handleTask(task) {
    if (!this.bot) {
      console.warn('[Planner] Bot not connected yet, skipping task:', task.task);
      this.queue.finishCurrent('FAILED');
      return;
    }

    try {
      this.bot.chat(`⚙️ Starting: ${task.task}`);

      switch (task.task) {
        case 'follow':  await this.movement.follow(task.player); break;
        case 'come':    await this.movement.come(task.player);   break;
        case 'stop':    this.movement.stop();                    break;
        case 'mine':    await this.mining.mine(task);            break;
        case 'farm':    await this.farming.farm(task);           break;
        case 'build':   await this.building.build(task);         break;
        case 'cancel':  this.queue.cancelCurrent(); return;
        case 'status':  this.bot.chat('📊 Check the dashboard at :8089'); break;
        default:        this.bot.chat(`❓ Unknown task: ${task.task}`);
      }

      if (task._state !== 'CANCELLED' && task._state !== 'FAILED') {
        this.queue.finishCurrent('COMPLETED');
      }
    } catch (err) {
      this.bot.chat('🚨 Task failed – check bot console.');
      this.botInstance.emit('error', err);
      this.queue.finishCurrent('FAILED');
    }
  }
}

module.exports = TaskPlanner;
