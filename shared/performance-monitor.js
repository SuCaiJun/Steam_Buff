/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 性能监控工具
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const MONITOR_VERSION = "steam-buff-performance-monitor-v2";
  const SCHEMA_VERSION = 2;

  const existing = window.STPerformanceMonitor;
  if (existing?.version === MONITOR_VERSION && typeof existing.printReport === "function") {
    return;
  }
  existing?.setDiagnosticsEnabled?.(false);

  function taskStats() {
    return { count: 0, totalSyncMs: 0, maxSyncMs: 0 };
  }

  function addTask(stats, duration) {
    stats.count += 1;
    stats.totalSyncMs += duration;
    stats.maxSyncMs = Math.max(stats.maxSyncMs, duration);
  }

  /**
   * 每个页面上下文的诊断摘要；资源数来自资源所有者，不估算扩展 CPU 或全局资源总量
   * 日志开启时仅计时已接入的同步回调；Promise 等待、后台和未接入入口不属于业务耗时
   * schemaVersion=2 移除 cpuUsage/timerCount/observerCount；缺少可选统计源时返回 null
   */
  class PerformanceMonitor {
    constructor() {
      this.version = MONITOR_VERSION;
      this.started = false;
      this.startTime = Date.now();
      this.startAt = performance.now();
      this.injectCount = 0;
      this.activeFeatureCount = null;
      this.bookkeepingMs = 0;
      this.captureEnabled = false;
      this.captureEpoch = 0;
      this.captureStart = null;
      this.captureEnd = null;
      this.business = null;
      this.schedulerTimings = new Map();
      this.longTaskObserver = null;
      this.longTaskStatus = "disabled";
      this.longTasks = null;
      this.longTaskWindowStart = null;
      this.onVisibilityChange = () => this.syncLongTaskObserver();
      this.setDiagnosticsEnabled(window.STLoggerFactory?.getDebugState?.().enabled === true);
    }

    start() {
      // start() 只记录注入摘要，不启动任何额外定时器，避免监控器本身污染性能指标。
      if (this.started) {
        return this.getReport();
      }

      this.started = true;
      this.recordInject();
      return this.getReport();
    }

    recordInject() {
      const start = performance.now();
      this.injectCount += 1;
      this.bookkeepingMs += performance.now() - start;
    }

    updateActiveFeatures(count) {
      if (!Number.isInteger(count) || count < 0) throw new TypeError("活跃功能数量无效");
      this.activeFeatureCount = count;
    }

    // 内核诊断复用此入口，避免通过 getReport() 再次进入内核诊断
    getResourceSummary() {
      return {
        schemaVersion: SCHEMA_VERSION,
        scope: "current-page-context",
        injectCount: this.injectCount,
        activeFeatureCount: window.STPageContext
          ? window.STPageContext.getActiveFeatures().length
          : this.activeFeatureCount,
        scheduler: window.STScheduler ? window.STScheduler.getMetrics() : null,
        observers: window.STObserverUtils ? window.STObserverUtils.getMetrics() : null,
      };
    }

    getSummary() {
      const now = performance.now();
      const uptime = now - this.startAt;
      const runtime = window.STRuntime?.current?.()?.diagnostics() ?? null;
      return {
        ...this.getResourceSummary(),
        startTime: this.startTime,
        uptimeMs: uptime,
        uptimeMin: Math.floor(uptime / 60000),
        monitorBookkeepingMs: this.bookkeepingMs,
        monitorBookkeepingRatioPct: uptime > 0 ? this.bookkeepingMs / uptime * 100 : null,
        capture: {
          enabled: this.captureEnabled,
          status: this.captureStart === null ? "not-started" : this.captureEnabled ? "recording" : "stopped",
          durationMs: this.captureStart === null ? null : (this.captureEnd ?? now) - this.captureStart,
        },
        business: this.business ? Object.fromEntries(Object.entries(this.business).map(([key, value]) => [key, { ...value }])) : null,
        longTasks: {
          scope: "page-main-thread",
          status: this.longTaskStatus,
          ...(this.longTasks ?? { count: null, totalDurationMs: null, maxDurationMs: null }),
        },
        runtime: runtime ? {
          id: runtime.id,
          version: runtime.version,
          status: runtime.status,
          adapterCount: runtime.adapters.length,
          featureCount: runtime.features.length,
          registeredResourceCount: runtime.resources.length,
          errorCount: runtime.errors.length,
        } : null,
      };
    }

    getReport() {
      return this.getSummary();
    }

    getDetails() {
      return {
        ...this.getSummary(),
        activeFeatures: window.STPageContext?.getActiveFeatures() ?? null,
        schedulerTasks: window.STScheduler?.getTasks() ?? null,
        schedulerTaskTimings: Object.fromEntries(Array.from(this.schedulerTimings, ([name, timing]) => [name,
          Object.fromEntries(Object.entries(timing).map(([kind, stats]) => [kind, { ...stats }])),
        ])),
        runtimeDetails: window.STRuntime?.current?.()?.diagnostics() ?? null,
      };
    }

    printReport() {
      const report = this.getSummary();
      window.STLoggerFactory?.createLogger("shared", "performance-monitor")
        .debug("performance-report", "性能诊断摘要", { debugData: report });
      return report;
    }

    /** 日志总开关驱动采集；关闭时排空已收到的长任务并断开，不改变业务调度 */
    setDiagnosticsEnabled(enabled) {
      if (enabled === this.captureEnabled) return;
      if (!enabled) {
        if (this.longTaskObserver) {
          this.recordLongTasks(this.longTaskObserver.takeRecords(), this.captureEpoch);
          this.longTaskObserver.disconnect();
          this.longTaskObserver = null;
          document.removeEventListener("visibilitychange", this.onVisibilityChange);
          this.longTaskStatus = "stopped";
        }
        this.captureEnd = performance.now();
        this.captureEnabled = false;
        this.captureEpoch += 1;
        return;
      }
      this.captureEnabled = true;
      this.captureEpoch += 1;
      this.captureStart = performance.now();
      this.captureEnd = null;
      this.business = { schedulerCallback: taskStats(), schedulerCondition: taskStats(), observerCallback: taskStats() };
      this.schedulerTimings.clear();
      this.longTasks = null;
      const Observer = window.PerformanceObserver;
      if (!Observer?.supportedEntryTypes.includes("longtask")) {
        this.longTaskStatus = "unsupported";
        return;
      }
      const epoch = this.captureEpoch;
      try {
        this.longTaskObserver = new Observer(list => this.recordLongTasks(list.getEntries(), epoch));
        this.longTasks = { count: 0, totalDurationMs: 0, maxDurationMs: 0 };
        document.addEventListener("visibilitychange", this.onVisibilityChange);
        this.syncLongTaskObserver();
      } catch (error) {
        this.reportFailure(error);
      }
    }

    syncLongTaskObserver() {
      if (!this.longTaskObserver) return;
      if (document.hidden) {
        this.recordLongTasks(this.longTaskObserver.takeRecords(), this.captureEpoch);
        this.longTaskObserver.disconnect();
        this.longTaskStatus = "paused-hidden";
      } else if (this.longTaskStatus !== "observing") {
        try {
          // 不回放采集前或隐藏期间的长任务
          this.longTaskWindowStart = performance.now();
          this.longTaskObserver.observe({ type: "longtask" });
          this.longTaskStatus = "observing";
        } catch (error) {
          this.reportFailure(error);
        }
      }
    }

    reportFailure(error) {
      this.longTaskObserver?.disconnect();
      this.longTaskObserver = null;
      this.longTasks = null;
      this.longTaskStatus = "failed";
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
      window.STLoggerFactory.reportError(error, {
        domain: "shared", feature: "performance-monitor", event: "long-task-observer-failed", message: "页面长任务采集启动失败", level: "warn",
      });
    }

    /** 只包围同步执行区间；返回 null 表示未采集，不能作为零耗时样本 */
    beginTask(kind, name) {
      if (!this.captureEnabled) return null;
      const start = performance.now();
      if (!Object.hasOwn(this.business, kind) || (kind !== "observerCallback" && !name)) {
        throw new TypeError("业务计时入口无效");
      }
      let timing = null;
      if (kind !== "observerCallback") {
        let task = this.schedulerTimings.get(name);
        if (!task) {
          task = { schedulerCallback: taskStats(), schedulerCondition: taskStats() };
          this.schedulerTimings.set(name, task);
        }
        timing = task[kind];
      }
      const startedAt = performance.now();
      this.bookkeepingMs += startedAt - start;
      return { kind, timing, epoch: this.captureEpoch, startedAt };
    }

    endTask(sample) {
      if (!sample || !this.captureEnabled || sample.epoch !== this.captureEpoch) return;
      const start = performance.now();
      const duration = start - sample.startedAt;
      addTask(this.business[sample.kind], duration);
      // 直接更新样本持有的计数器，任务在回调内注销时不会重新插回明细 Map
      if (sample.timing) addTask(sample.timing, duration);
      this.bookkeepingMs += performance.now() - start;
    }

    forgetSchedulerTask(name) {
      this.schedulerTimings.delete(name);
    }

    recordLongTasks(entries, epoch) {
      if (!this.captureEnabled || epoch !== this.captureEpoch || !this.longTasks || this.longTaskStatus !== "observing") return;
      const start = performance.now();
      for (const entry of entries) {
        if (entry.startTime < this.longTaskWindowStart) continue;
        this.longTasks.count += 1;
        this.longTasks.totalDurationMs += entry.duration;
        this.longTasks.maxDurationMs = Math.max(this.longTasks.maxDurationMs, entry.duration);
      }
      this.bookkeepingMs += performance.now() - start;
    }
  }

  window.STPerformanceMonitor = new PerformanceMonitor();
  if (!window.chrome?.runtime?.id) {
    window.STPerformanceMonitor.start();
  }
})();
