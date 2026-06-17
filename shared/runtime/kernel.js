/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 统一运行时内核
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const VERSION = "2026-06-18-p18-message-storage";
  const GLOBAL_KEY = "__SteamBuffRuntimeKernel";
  const DEFAULT_ID = "steam-buff-runtime";

  if (window.STRuntime?.version === VERSION && window[GLOBAL_KEY]?.version === VERSION) {
    return;
  }

  function now() {
    return Date.now();
  }

  function arr(value) {
    return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
  }

  function text(value) {
    return value == null ? "" : String(value);
  }

  function errText(error) {
    if (!error) {
      return "";
    }
    return error?.message || String(error);
  }

  function safeCall(fn) {
    try {
      return fn();
    } catch {
      return null;
    }
  }

  class RuntimeResourceManager {
    constructor(runtime) {
      this.runtime = runtime;
      this.items = new Map();
    }

    register(input) {
      const owner = text(input?.owner);
      const key = text(input?.key);
      const type = text(input?.type || "custom");
      if (!owner || !key) {
        throw new Error("运行时资源必须声明 owner 和 key");
      }
      const id = `${owner}:${type}:${key}`;
      this.dispose(id);

      const item = {
        id,
        owner,
        key,
        type,
        meta: input?.meta && typeof input.meta === "object" ? { ...input.meta } : {},
        createdAt: now(),
        disposed: false,
        dispose: typeof input?.dispose === "function" ? input.dispose : () => {},
      };
      this.items.set(id, item);
      return Object.freeze({
        id,
        owner,
        key,
        type,
        dispose: () => this.dispose(id),
      });
    }

    dispose(id) {
      const item = this.items.get(id);
      if (!item || item.disposed) {
        return false;
      }
      item.disposed = true;
      this.items.delete(id);
      try {
        item.dispose();
      } catch (error) {
        this.runtime.markError("resource-dispose-failed", error, {
          resourceId: item.id,
          owner: item.owner,
          type: item.type,
        });
      }
      return true;
    }

    disposeOwner(owner) {
      const target = text(owner);
      return this.disposeWhere(item => item.owner === target);
    }

    disposeOwnerPrefix(prefix) {
      const target = text(prefix);
      return this.disposeWhere(item => item.owner.startsWith(target));
    }

    disposeWhere(match) {
      let count = 0;
      for (const item of Array.from(this.items.values())) {
        if (match(item) && this.dispose(item.id)) {
          count += 1;
        }
      }
      return count;
    }

    list() {
      return Array.from(this.items.values()).map(item => ({
        id: item.id,
        owner: item.owner,
        key: item.key,
        type: item.type,
        meta: { ...item.meta },
        ageMs: now() - item.createdAt,
      }));
    }

    disposeAll() {
      return this.disposeWhere(() => true);
    }
  }

  class RuntimeKernel {
    constructor(options = {}) {
      this.version = VERSION;
      this.id = text(options.id) || DEFAULT_ID;
      this.createdAt = now();
      this.status = "created";
      this.adapters = new Map();
      this.features = new Map();
      this.errors = [];
      this.resources = new RuntimeResourceManager(this);
    }

    registerAdapter(adapter = {}) {
      const id = text(adapter.id || adapter.domain);
      if (!id) {
        throw new Error("运行时 adapter 必须声明 id");
      }
      const prev = this.adapters.get(id) || {};
      const next = Object.freeze({
        ...prev,
        id,
        domain: text(adapter.domain || prev.domain || id),
        publicApi: text(adapter.publicApi || prev.publicApi),
        registry: text(adapter.registry || prev.registry),
        loadStrategy: text(adapter.loadStrategy || prev.loadStrategy || "runtime-adapter"),
        status: text(adapter.status || prev.status || "registered"),
        legacy: adapter.legacy === true || prev.legacy === true,
        registeredAt: prev.registeredAt || now(),
        activatedAt: prev.activatedAt || 0,
        meta: {
          ...(prev.meta || {}),
          ...(adapter.meta || {}),
        },
      });
      this.adapters.set(id, next);
      this.status = this.status === "created" ? "registered" : this.status;
      return next;
    }

    activateAdapter(id, meta = {}) {
      const adapter = this.adapters.get(id) || this.registerAdapter({ id });
      const next = Object.freeze({
        ...adapter,
        status: "active",
        activatedAt: adapter.activatedAt || now(),
        meta: {
          ...(adapter.meta || {}),
          ...(meta || {}),
        },
      });
      this.adapters.set(id, next);
      this.status = "running";
      return next;
    }

    deactivateAdapter(id, reason = "") {
      const adapter = this.adapters.get(id);
      if (!adapter) {
        return null;
      }
      const next = Object.freeze({
        ...adapter,
        status: "inactive",
        meta: {
          ...(adapter.meta || {}),
          reason: text(reason),
        },
      });
      this.adapters.set(id, next);
      return next;
    }

    registerFeature(feature = {}) {
      const domain = text(feature.domain);
      const id = text(feature.id);
      if (!domain || !id) {
        throw new Error("运行时 feature 必须声明 domain 和 id");
      }
      const key = this.featureKey(domain, id);
      const prev = this.features.get(key) || {};
      const next = Object.freeze({
        ...prev,
        key,
        domain,
        id,
        status: prev.status || "registered",
        reason: prev.reason || "",
        settingsKey: text(feature.settingsKey || prev.settingsKey || id),
        loadStrategy: text(feature.loadStrategy || prev.loadStrategy || "on-demand"),
        modes: arr(feature.modes || prev.modes),
        pageScope: arr(feature.pageScope || prev.pageScope),
        dependencies: arr(feature.dependencies || prev.dependencies),
        cost: text(feature.cost || prev.cost || "normal"),
        dispose: feature.dispose === true || prev.dispose === true,
        registeredAt: prev.registeredAt || now(),
        updatedAt: now(),
        meta: {
          ...(prev.meta || {}),
          ...(feature.meta || {}),
        },
      });
      this.features.set(key, next);
      return next;
    }

    markFeature(input = {}) {
      const domain = text(input.domain);
      const id = text(input.id);
      if (!domain || !id) {
        return null;
      }
      const key = this.featureKey(domain, id, input.mode, input.entry);
      const base = this.features.get(this.featureKey(domain, id)) || {};
      const prev = this.features.get(key) || {};
      const next = Object.freeze({
        ...base,
        ...prev,
        key,
        domain,
        id,
        mode: text(input.mode || prev.mode),
        entry: text(input.entry || prev.entry),
        status: text(input.status || prev.status || "registered"),
        reason: text(input.reason || ""),
        updatedAt: now(),
        startedAt: input.status === "started" ? now() : (prev.startedAt || 0),
        error: errText(input.error),
        meta: {
          ...(base.meta || {}),
          ...(prev.meta || {}),
          ...(input.meta || {}),
        },
      });
      this.features.set(key, next);
      this.updatePageContextFeature(next);
      this.updateFeatureMetric();
      return next;
    }

    registerResource(input) {
      return this.resources.register(input);
    }

    timer(owner, key, timerId) {
      return this.registerResource({
        owner,
        key,
        type: "timer",
        dispose() {
          window.clearTimeout(timerId);
          window.clearInterval(timerId);
        },
      });
    }

    schedulerTask(owner, key, taskName) {
      return this.registerResource({
        owner,
        key,
        type: "scheduler",
        meta: { taskName },
        dispose() {
          window.STScheduler?.unregister?.(taskName);
        },
      });
    }

    observer(owner, key, observer) {
      return this.registerResource({
        owner,
        key,
        type: "observer",
        dispose() {
          observer?.disconnect?.();
        },
      });
    }

    listener(owner, key, target, type, handler, options) {
      this.resources.dispose(`${text(owner)}:listener:${text(key)}`);
      target?.addEventListener?.(type, handler, options);
      return this.registerResource({
        owner,
        key,
        type: "listener",
        meta: { event: type },
        dispose() {
          target?.removeEventListener?.(type, handler, options);
        },
      });
    }

    style(owner, key, element) {
      return this.registerResource({
        owner,
        key,
        type: "style",
        dispose() {
          element?.remove?.();
        },
      });
    }

    disposeOwner(owner) {
      return this.resources.disposeOwner(owner);
    }

    disposeByOwnerPrefix(prefix) {
      return this.resources.disposeOwnerPrefix(prefix);
    }

    markError(event, error, meta = {}) {
      const entry = {
        event: text(event),
        error: errText(error),
        meta: { ...(meta || {}) },
        time: now(),
      };
      this.errors.push(entry);
      if (this.errors.length > 20) {
        this.errors.shift();
      }
      return entry;
    }

    diagnostics() {
      const schedulerTasks = safeCall(() => window.STScheduler?.getTasks?.()) || {};
      const monitor = window.STPerformanceMonitor;
      const perf = monitor?.metrics ? {
        injectCount: monitor.metrics.injectCount,
        timerCount: typeof monitor.getTimerCount === "function"
          ? monitor.getTimerCount()
          : monitor.metrics.timerCount,
        observerCount: monitor.metrics.observerCount,
        activeFeatureCount: monitor.metrics.activeFeatures,
      } : null;
      return {
        id: this.id,
        version: this.version,
        status: this.status,
        uptimeMs: now() - this.createdAt,
        context: this.contextSnapshot(),
        activeFeatureSet: safeCall(() => window.STPageContext?.activeFeatureSet?.()) || null,
        adapters: Array.from(this.adapters.values()),
        features: Array.from(this.features.values()),
        resources: this.resources.list(),
        schedulerTaskCount: Object.keys(schedulerTasks).length,
        schedulerTasks,
        messageBus: safeCall(() => window.STMessageBus?.diagnostics?.()) || null,
        settingsBus: safeCall(() => window.STSettingsBus?.diagnostics?.()) || null,
        performance: perf ? {
          injectCount: perf.injectCount,
          timerCount: perf.timerCount,
          observerCount: perf.observerCount,
          activeFeatureCount: perf.activeFeatureCount,
        } : null,
        errors: this.errors.slice(),
      };
    }

    dispose(meta = {}) {
      this.status = "disposing";
      this.resources.disposeAll();
      for (const adapter of this.adapters.values()) {
        if (typeof adapter.dispose === "function") {
          safeCall(() => adapter.dispose(meta));
        }
      }
      this.adapters.clear();
      this.features.clear();
      this.status = "disposed";
    }

    featureKey(domain, id, mode = "", entry = "") {
      return [domain, id, text(mode), text(entry)].filter(Boolean).join(":");
    }

    contextSnapshot() {
      const shared = safeCall(() => window.STPageContext?.snapshot?.()) || null;
      return shared || {
        host: location.hostname,
        path: location.pathname,
        title: document.title || "",
        topFrame: window.top === window,
      };
    }

    updatePageContextFeature(feature) {
      const id = feature.mode || feature.entry
        ? `${feature.domain}:${feature.id}:${feature.mode || feature.entry}`
        : `${feature.domain}:${feature.id}`;
      if (feature.status === "started") {
        window.STPageContext?.markFeatureActive?.(id, {
          domain: feature.domain,
          featureId: feature.id,
          mode: feature.mode || "",
          entry: feature.entry || "",
          reason: feature.reason || "",
        });
        return;
      }
      if (["skipped", "failed", "disabled", "inactive"].includes(feature.status)) {
        window.STPageContext?.markFeatureInactive?.(id, feature.reason || feature.status, {
          domain: feature.domain,
          featureId: feature.id,
          mode: feature.mode || "",
          entry: feature.entry || "",
          error: feature.error || "",
        });
      }
    }

    updateFeatureMetric() {
      const count = Array.from(this.features.values())
        .filter(item => item.status === "started").length;
      window.STPerformanceMonitor?.updateActiveFeatures?.(count);
    }
  }

  function disposeOldKernel() {
    const old = window[GLOBAL_KEY];
    if (old?.version && old.version !== VERSION && typeof old.dispose === "function") {
      old.dispose({ reason: "kernel-upgrade" });
    }
  }

  function create(options = {}) {
    disposeOldKernel();
    const kernel = new RuntimeKernel(options);
    window[GLOBAL_KEY] = kernel;
    return kernel;
  }

  function get(options = {}) {
    const kernel = window[GLOBAL_KEY];
    if (kernel?.version === VERSION) {
      return kernel;
    }
    return create(options);
  }

  function current() {
    return window[GLOBAL_KEY]?.version === VERSION ? window[GLOBAL_KEY] : null;
  }

  window.STRuntime = Object.freeze({
    version: VERSION,
    get,
    current,
    create,
    disposeCurrent() {
      const kernel = current();
      if (kernel) {
        kernel.dispose({ reason: "manual-dispose" });
        window[GLOBAL_KEY] = null;
      }
    },
  });
})();
