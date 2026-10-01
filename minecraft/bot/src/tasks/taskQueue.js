const EventEmitter = require('events');
const { validateTask } = require('./taskValidation');

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

  enqueue(input) {
    const task = validateTask(input);
    task.id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    task.createdAt = new Date().toISOString();
    task._state = 'QUEUED';
    this.queue.push(task);
    this.emit('log', `Task queued: ${task.task}`);
    // If no current task, start processing immediately
    if (!this.current) this._dequeue();
    return task;
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
    if (!['COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) status = 'FAILED';
    this.current._state = status;
    this.emit('log', `Task ${this.current.task} ${status.toLowerCase()}`);
    this.current = null;
    this._dequeue();
  }

  markRunning(task = this.current) {
    if (!task || task !== this.current || task._state !== 'PLANNING') return false;
    task._state = 'RUNNING';
    return true;
  }

  cancelCurrent(reason = 'cancel') {
    if (!this.current || this.current._cancelRequested) return false;
    this.current._cancelRequested = true;
    this.emit('cancelRequested', { task: this.current, reason });
    return true;
  }

  stopCurrent() {
    const cancelled = this.cancelCurrent('stop');
    if (!cancelled) this.emit('stopRequested', null);
    return true;
  }

  // Helper to view queue status (for API)
  getStatus() {
    return {
      current: this.current ? { ...this.current } : null,
      pending: this.queue.map(t => ({ task: t.task, _state: t._state })),
    };
  }
}

module.exports = TaskQueue;
