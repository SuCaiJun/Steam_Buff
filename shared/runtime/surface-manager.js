/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 通用 Surface Host 注册与生命周期管理器
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const VERSION = "steam-buff-surface-manager-v1";
  const log = globalThis.STLoggerFactory?.createLogger?.("shared", "surface-manager") || {
    error() {},
  };
  const existing = globalThis.STSurfaceManager;
  if (existing?.version === VERSION && typeof existing.createHost === "function") {
    return;
  }
  existing?.stopAll?.();

  const hosts = new Map();

  function hostId(value) {
    return String(value || "").trim();
  }

  function invoke(callback, failure, ...args) {
    if (typeof callback !== "function") {
      return;
    }
    try {
      callback(...args);
    } catch (error) {
      try {
        log.error("surface-callback-failed", "Surface Host 回调执行失败", { ...failure, error });
      } catch {
        // 日志故障不得破坏 Surface Host 的隔离与后续生命周期。
      }
    }
  }

  function createHost(input = {}) {
    const id = hostId(input.id);
    if (!id) {
      throw new TypeError("Surface Host ID 无效");
    }

    hosts.get(id)?.stop?.();
    const state = {
      active: false,
      context: null,
      entries: new Map(),
      observer: null,
      observerTarget: null,
      stopped: false,
    };

    function orderedEntries() {
      return Array.from(state.entries.values()).sort((left, right) => {
        if (left.order !== right.order) {
          return left.order - right.order;
        }
        return left.id.localeCompare(right.id);
      });
    }

    function publishEntries() {
      invoke(input.onEntriesChange, { hostId: id, callback: "entries-change" }, orderedEntries(), state.context);
    }

    function notifyEntry(entry) {
      invoke(entry.onActiveChange, { hostId: id, entryId: entry.id, callback: "active-change" }, state.active, state.context);
    }

    function register(entryInput = {}) {
      if (state.stopped) {
        throw new Error(`Surface Host 已停止: ${id}`);
      }
      const entryId = hostId(entryInput.id);
      if (!entryId) {
        throw new TypeError(`Surface 注册 ID 无效: ${id}`);
      }
      const previous = state.entries.get(entryId);
      invoke(previous?.onDispose, { hostId: id, entryId, callback: "dispose" });
      const entry = {
        id: entryId,
        onActiveChange: typeof entryInput.onActiveChange === "function" ? entryInput.onActiveChange : null,
        onDispose: typeof entryInput.onDispose === "function" ? entryInput.onDispose : null,
        order: Number.isFinite(Number(entryInput.order)) ? Number(entryInput.order) : 100,
        value: entryInput.value,
      };
      state.entries.set(entryId, entry);
      publishEntries();
      notifyEntry(entry);
      return Object.freeze({
        id: entryId,
        active() {
          return state.active;
        },
        dispose() {
          const current = state.entries.get(entryId);
          if (current !== entry) {
            return;
          }
          state.entries.delete(entryId);
          invoke(entry.onDispose, { hostId: id, entryId, callback: "dispose" });
          publishEntries();
        },
      });
    }

    function setContext(context = null, active = false) {
      if (state.stopped) {
        return;
      }
      const nextActive = active === true;
      const changed = state.context !== context || state.active !== nextActive;
      state.context = context;
      state.active = nextActive;
      if (!changed) {
        return;
      }
      invoke(input.onContextChange, { hostId: id, callback: "context-change" }, context, nextActive);
      for (const entry of state.entries.values()) {
        notifyEntry(entry);
      }
    }

    function disconnectObserver() {
      state.observer?.disconnect?.();
      state.observer = null;
      state.observerTarget = null;
    }

    function observe(target, callback, options) {
      if (state.stopped) {
        throw new Error(`Surface Host 已停止: ${id}`);
      }
      if (!target || typeof callback !== "function") {
        throw new TypeError(`Surface Observer 参数无效: ${id}`);
      }
      disconnectObserver();
      const observer = new MutationObserver(callback);
      observer.observe(target, options);
      state.observer = observer;
      state.observerTarget = target;
      return observer;
    }

    function diagnostics() {
      return Object.freeze({
        active: state.active,
        entryCount: state.entries.size,
        id,
        observerCount: state.observer ? 1 : 0,
        observerTarget: state.observerTarget,
        stopped: state.stopped,
      });
    }

    function stop() {
      if (state.stopped) {
        return;
      }
      state.stopped = true;
      disconnectObserver();
      for (const entry of state.entries.values()) {
        invoke(entry.onDispose, { hostId: id, entryId: entry.id, callback: "dispose" });
      }
      state.entries.clear();
      invoke(input.onStop, { hostId: id, callback: "stop" });
      if (hosts.get(id) === api) {
        hosts.delete(id);
      }
    }

    const api = Object.freeze({
      id,
      diagnostics,
      disconnectObserver,
      entries: orderedEntries,
      observe,
      register,
      setContext,
      stop,
    });
    hosts.set(id, api);
    return api;
  }

  function diagnostics() {
    const details = Array.from(hosts.values(), (host) => host.diagnostics());
    return Object.freeze({
      hostCount: details.length,
      observerCount: details.reduce((count, host) => count + host.observerCount, 0),
      hosts: Object.freeze(details),
    });
  }

  function stopAll() {
    for (const host of Array.from(hosts.values())) {
      host.stop();
    }
  }

  globalThis.STSurfaceManager = Object.freeze({
    version: VERSION,
    createHost,
    diagnostics,
    getHost(id) {
      return hosts.get(hostId(id)) || null;
    },
    stopAll,
  });
})();
