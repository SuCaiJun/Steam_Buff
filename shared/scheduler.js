/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 统一调度器
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  class Scheduler {
    constructor() {
      this.tasks = new Map();
      this.timerId = null;
      this.interval = 10000; // 10 秒
      this.running = false;
    }

    register(name, callback, condition = null) {
      if (!name || typeof callback !== 'function') {
        console.error('[Steam Buff][Scheduler] Invalid task:', name);
        return;
      }

      this.tasks.set(name, {
        callback,
        condition,
        status: 'active',
        lastRun: null,
        errorCount: 0,
      });

      console.log('[Steam Buff][Scheduler] Task registered:', name);
      this.start();
    }

    unregister(name) {
      if (this.tasks.delete(name)) {
        console.log('[Steam Buff][Scheduler] Task unregistered:', name);
      }

      if (this.tasks.size === 0) {
        this.stop();
      }
    }

    pause(name) {
      const task = this.tasks.get(name);
      if (task) {
        task.status = 'paused';
        console.log('[Steam Buff][Scheduler] Task paused:', name);
      }
    }

    resume(name) {
      const task = this.tasks.get(name);
      if (task) {
        task.status = 'active';
        console.log('[Steam Buff][Scheduler] Task resumed:', name);
      }
    }

    start() {
      if (this.timerId) return;

      this.running = true;
      this.timerId = setInterval(() => {
        this.tick();
      }, this.interval);

      console.log('[Steam Buff][Scheduler] Started, interval:', this.interval);
    }

    stop() {
      if (this.timerId) {
        clearInterval(this.timerId);
        this.timerId = null;
        this.running = false;
        console.log('[Steam Buff][Scheduler] Stopped');
      }
    }

    tick() {
      for (const [name, task] of this.tasks) {
        // 跳过暂停的任务
        if (task.status !== 'active') {
          continue;
        }

        // 检查执行条件
        if (task.condition) {
          try {
            if (!task.condition()) {
              continue;
            }
          } catch (err) {
            console.error(`[Steam Buff][Scheduler] Condition check failed for ${name}:`, err);
            continue;
          }
        }

        // 执行任务
        try {
          task.callback();
          task.lastRun = Date.now();
          task.errorCount = 0;
        } catch (err) {
          task.errorCount++;
          console.error(`[Steam Buff][Scheduler] Task ${name} failed (${task.errorCount} times):`, err);

          // 连续失败 3 次，自动暂停
          if (task.errorCount >= 3) {
            task.status = 'paused';
            console.warn(`[Steam Buff][Scheduler] Task ${name} paused due to repeated failures`);
          }
        }
      }
    }

    getTasks() {
      const result = {};
      for (const [name, task] of this.tasks) {
        result[name] = {
          status: task.status,
          lastRun: task.lastRun,
          errorCount: task.errorCount,
        };
      }
      return result;
    }
  }

  // 全局单例
  window.STScheduler = new Scheduler();
})();
