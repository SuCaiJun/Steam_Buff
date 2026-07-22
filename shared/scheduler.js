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

  const MIN_TICK_MS = 1000;
  const DEFAULT_TASK_MS = 10000;
  const SCHEDULER_VERSION = "steam-buff-scheduler-v1";

  const existing = window.STScheduler;
  if (existing?.version === SCHEDULER_VERSION && typeof existing.register === 'function') {
    return;
  }
  if (existing && typeof existing.stop === 'function') {
    existing.stop();
  }

  let schedulerLogger = null;
  function logScheduler(level, event, message, meta = {}) {
    try {
      schedulerLogger = schedulerLogger || window.STLoggerFactory?.createLogger?.("shared", "scheduler");
      schedulerLogger?.[level]?.(event, message, meta);
    } catch {
    }
  }

  class Scheduler {
    constructor() {
      this.version = SCHEDULER_VERSION;
      this.tasks = new Map();
      this.timerId = null;
      this.interval = MIN_TICK_MS; // 底层只保留一个轻量心跳，任务自身仍可保持原巡检间隔。
      this.defaultTaskInterval = DEFAULT_TASK_MS;
      this.running = false;
    }

    register(name, callback, condition = null, options = {}) {
      if (!name || typeof callback !== 'function') {
        logScheduler("error", "scheduler-task-invalid", "调度任务配置无效", { name });
        return;
      }

      const normalized = this.normalizeArgs(condition, options);
      const intervalMs = this.normalizeInterval(normalized.options.intervalMs);
      const now = Date.now();
      this.tasks.set(name, {
        callback,
        condition: normalized.condition,
        intervalMs,
        status: 'active',
        lastRun: null,
        nextRunAt: now + intervalMs,
        errorCount: 0,
      });

      window.STPerformanceMonitor?.recordTimer?.(name);
      this.start();
      logScheduler("info", "scheduler-task-registered", "调度任务已注册", {
        name,
        intervalMs,
        taskCount: this.tasks.size,
      });
    }

    unregister(name) {
      const existed = this.tasks.delete(name);

      if (this.tasks.size === 0) {
        this.stop();
      }
      if (existed) {
        logScheduler("info", "scheduler-task-unregistered", "调度任务已注销", {
          name,
          taskCount: this.tasks.size,
        });
      }
    }

    pause(name) {
      const task = this.tasks.get(name);
      if (task) {
        task.status = 'paused';
        logScheduler("info", "scheduler-task-paused", "调度任务已暂停", {
          name,
        });
      }
    }

    resume(name) {
      const task = this.tasks.get(name);
      if (task) {
        task.status = 'active';
        logScheduler("info", "scheduler-task-resumed", "调度任务已恢复", {
          name,
        });
      }
    }

    reschedule(name, options = {}) {
      const task = this.tasks.get(name);
      if (!task) {
        return false;
      }
      const intervalMs = this.normalizeInterval(
        typeof options === 'number' ? options : options.intervalMs
      );
      task.intervalMs = intervalMs;
      task.nextRunAt = Date.now() + intervalMs;
      logScheduler("info", "scheduler-task-rescheduled", "调度任务已重新排期", {
        name,
        intervalMs,
      });
      return true;
    }

    start() {
      if (this.timerId) return;

      this.running = true;
      this.timerId = setInterval(() => {
        this.tick();
      }, this.interval);
    }

    stop() {
      if (this.timerId) {
        clearInterval(this.timerId);
        this.timerId = null;
        this.running = false;
        logScheduler("info", "scheduler-stopped", "调度器已停止", {
          taskCount: this.tasks.size,
        });
      }
    }

    tick() {
      const now = Date.now();
      for (const [name, task] of this.tasks) {
        // 跳过暂停的任务
        if (task.status !== 'active') {
          continue;
        }

        if (now < task.nextRunAt) {
          continue;
        }

        // 检查执行条件
        if (task.condition) {
          try {
            if (!task.condition()) {
              task.nextRunAt = now + task.intervalMs;
              continue;
            }
          } catch (err) {
            logScheduler("error", "scheduler-condition-failed", "调度任务条件检查失败", {
              name,
              error: err,
            });
            task.nextRunAt = now + task.intervalMs;
            continue;
          }
        }

        // 执行任务
        try {
          task.callback();
          task.lastRun = now;
          task.nextRunAt = now + task.intervalMs;
          task.errorCount = 0;
        } catch (err) {
          task.errorCount++;
          task.nextRunAt = now + task.intervalMs;
          logScheduler("error", "scheduler-task-failed", "调度任务执行失败", {
            name,
            errorCount: task.errorCount,
            error: err,
          });

          // 连续失败 3 次，自动暂停
          if (task.errorCount >= 3) {
            task.status = 'paused';
            logScheduler("warn", "scheduler-task-auto-paused", "调度任务连续失败后已暂停", {
              name,
              errorCount: task.errorCount,
            });
          }
        }
      }
    }

    normalizeArgs(condition, options) {
      if (condition && typeof condition === 'object' && typeof condition !== 'function') {
        return {
          condition: null,
          options: condition,
        };
      }
      return {
        condition,
        options: options || {},
      };
    }

    normalizeInterval(value) {
      const intervalMs = Number(value);
      if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
        return this.defaultTaskInterval;
      }
      return Math.max(MIN_TICK_MS, Math.floor(intervalMs));
    }

    getTasks() {
      const result = {};
      for (const [name, task] of this.tasks) {
        result[name] = {
          status: task.status,
          lastRun: task.lastRun,
          nextRunAt: task.nextRunAt,
          intervalMs: task.intervalMs,
          errorCount: task.errorCount,
        };
      }
      return result;
    }
  }

  // 全局单例
  window.STScheduler = new Scheduler();
})();
