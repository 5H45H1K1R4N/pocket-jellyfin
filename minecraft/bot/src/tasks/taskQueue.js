const EventEmitter = require('events');

/**
 * Simple FIFO task queue with state tracking.
 * Emits "taskReady" when the next task should be processed.
 */
class TaskQueue extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.current = null;
    this.states = ['QUEUED', 'PLANNING', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED'];
  }

  enqueue(task) {
    task._state = 'QUEUED';
    this.queue.push(task);
    this.emit('log', `Task queued: ${task.task}`);
    // If no current task, start processing immediately
    if (!this.current) this._dequeue();
  }

  _dequeue() {
    if (this.queue.length === 0) {
      this.current = null;
      return;
    }
    this.current = this.queue.shift();
    this.current._state = 'PLANNING';
    this.emit('taskReady', this.current);
  }

  /** Called by planner when a task finishes (success or failure). */
  finishCurrent(status = 'COMPLETED') {
    if (!this.current) return;
    if (!this.states.includes(status)) status = 'FAILED';
    this.current._state = status;
    this.emit('log', `Task ${this.current.task} ${status.toLowerCase()}`);
    this.current = null;
    this._dequeue();
  }

  cancelCurrent() {
    if (!this.current) return;
    this.current._state = 'CANCELLED';
    this.emit('log', `Task ${this.current.task} cancelled`);
    this.current = null;
    this._dequeue();
  }

  // Helper to view queue status (for API)
  getStatus() {
    return {
      current: this.current ? { ...this.current, _state: this.current._state } : null,
      pending: this.queue.map(t => ({ task: t.task, _state: t._state })),
    };
  }
}

module.exports = TaskQueue;
