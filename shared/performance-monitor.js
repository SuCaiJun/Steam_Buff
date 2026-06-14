/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 性能监控工具
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  'use strict';

  const MONITOR_VERSION = '2026-06-12';
  const CPU_PRECISION = 1000;

  const existing = window.STPerformanceMonitor;
  if (existing?.version === MONITOR_VERSION && typeof existing.printReport === 'function') {
    return;
  }

  class PerformanceMonitor {
    constructor() {
      this.version = MONITOR_VERSION;
      this.started = false;
      this.timerNames = new Set();
      this.observerTargets = [];
      this.monitorCostMs = 0;
      this.metrics = {
        injectCount: 0,
        timerCount: 0,
        observerCount: 0,
        activeFeatures: 0,
        startTime: Date.now(),
      };
    }

    start() {
      // start() 只记录注入，不启动任何额外定时器，避免监控器本身污染性能指标。
      if (this.started) {
        return this.getReport();
      }

      this.started = true;
      this.recordInject(location.href);
      return this.getReport();
    }

    recordInject(url) {
      this.measure(() => {
        this.metrics.injectCount += 1;
      });
    }

    recordTimer(name) {
      this.measure(() => {
        const key = String(name || 'unknown');
        this.timerNames.add(key);
        this.metrics.timerCount = this.getTimerCount();
      });
    }

    recordObserver(target) {
      this.measure(() => {
        const label = this.describeTarget(target);
        this.observerTargets.push(label);
        this.metrics.observerCount += 1;
      });
    }

    updateActiveFeatures(count) {
      const value = Number(count);
      this.metrics.activeFeatures = Number.isFinite(value) ? Math.max(0, value) : 0;
    }

    getReport() {
      const uptime = Date.now() - this.metrics.startTime;
      const schedulerTasks = window.STScheduler?.getTasks?.() || {};
      const activeFeatures = window.STPageContext?.getActiveFeatures?.() || [];
      const runtimeDiagnostics = window.STRuntime?.current?.()?.diagnostics?.() || null;
      const report = {
        ...this.metrics,
        timerCount: this.getTimerCount(),
        observerCount: this.metrics.observerCount,
        observerTargets: this.observerTargets.slice(),
        activeFeatures,
        activeFeatureCount: activeFeatures.length,
        uptimeMs: uptime,
        uptimeMin: Math.floor(uptime / 60000),
        cpuUsage: this.getCpuUsage(uptime),
        schedulerRunning: window.STScheduler?.running === true,
        schedulerTaskCount: Object.keys(schedulerTasks).length,
        schedulerTasks,
        runtime: runtimeDiagnostics ? {
          id: runtimeDiagnostics.id,
          version: runtimeDiagnostics.version,
          status: runtimeDiagnostics.status,
          adapterCount: runtimeDiagnostics.adapters.length,
          featureCount: runtimeDiagnostics.features.length,
          resourceCount: runtimeDiagnostics.resources.length,
          adapters: runtimeDiagnostics.adapters,
          features: runtimeDiagnostics.features,
          resources: runtimeDiagnostics.resources,
        } : null,
      };

      return report;
    }

    printReport() {
      const report = this.getReport();
      const summary = {
        injectCount: report.injectCount,
        timerCount: report.timerCount,
        observerCount: report.observerCount,
        activeFeatureCount: report.activeFeatureCount,
        cpuUsage: report.cpuUsage,
        uptimeMin: report.uptimeMin,
        schedulerTaskCount: report.schedulerTaskCount,
      };

      console.table(summary);
      return report;
    }

    getTimerCount() {
      // 指标表示“统一调度器数量”，不是任务数量；底层最多只允许一个心跳。
      if (window.STScheduler) {
        return 1;
      }
      return this.timerNames.size > 0 ? 1 : 0;
    }

    getCpuUsage(uptime) {
      if (!uptime) {
        return '0.000%';
      }
      // 刚启动时 uptime 可能只有几毫秒，至少用 1 秒窗口估算，避免瞬时百分比误导判断。
      const effectiveUptime = Math.max(1000, uptime);
      const usage = (this.monitorCostMs / effectiveUptime) * 100;
      return `${Math.round(usage * CPU_PRECISION) / CPU_PRECISION}%`;
    }

    measure(fn) {
      const startedAt = performance.now();
      try {
        return fn();
      } finally {
        this.monitorCostMs += performance.now() - startedAt;
      }
    }

    describeTarget(target) {
      if (!target) {
        return 'unknown';
      }
      if (target === document.documentElement) {
        return 'documentElement';
      }
      if (target === document.body) {
        return 'body';
      }
      const tagName = String(target.tagName || target.nodeName || 'node').toLowerCase();
      const id = target.id ? `#${target.id}` : '';
      const className = typeof target.className === 'string'
        ? `.${target.className.trim().split(/\s+/u).filter(Boolean).slice(0, 3).join('.')}`
        : '';
      return `${tagName}${id}${className}`;
    }
  }

  window.STPerformanceMonitor = new PerformanceMonitor();
  if (!window.chrome?.runtime?.id) {
    window.STPerformanceMonitor.start();
  }
})();
