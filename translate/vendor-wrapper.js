/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 翻译 vendor 副作用隔离适配器
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const VERSION = "steam-buff-translate-vendor-wrapper-v1";
  const MARK = "STTranslateVendor";
  const MODE_MANUAL = "manual";
  const MODE_SELECTION = "selection";
  const MODE_AUTO_PAGE = "autoPage";
  const MODE_AI_CONFIG = "aiConfig";
  const OWNER = "translate:vendor";
  const LOAD_OWNER = "translate:vendor:load";
  const AUTO_OWNER = "translate:vendor:auto-page";
  const LOAD_KEY = "vendor-load";
  const AUTO_KEY = "auto-page";
  const NOOP = () => {};
  const state = {
    installed: false,
    activeKey: "",
    phase: "",
    mode: MODE_MANUAL,
    modes: [],
    timers: [],
    observers: [],
    logs: [],
    patches: null,
    autoStarted: false,
    configuredAt: 0,
  };

  if (globalThis[MARK]?.version === VERSION) {
    return;
  }

  function text(value) {
    return String(value || "");
  }

  function unique(items) {
    return Array.from(new Set((items || []).filter(Boolean).map(String)));
  }

  function modesFrom(conf = {}) {
    if (conf.enabled === false) {
      return [];
    }
    const raw = Array.isArray(conf.modes)
      ? conf.modes
      : typeof conf.mode === "string"
        ? [conf.mode]
        : [];
    const out = unique(raw);
    if (conf.selection === true && !out.includes(MODE_SELECTION)) {
      out.push(MODE_SELECTION);
    }
    if (conf.page === true && !out.includes(MODE_AUTO_PAGE)) {
      out.push(MODE_AUTO_PAGE);
    }
    if (conf.manual === true && !out.includes(MODE_MANUAL)) {
      out.push(MODE_MANUAL);
    }
    if ((conf.service === "steam-buff.ai" || conf.selectionService === "steam-buff.ai" || conf.newsPopupService === "steam-buff.ai") && !out.includes(MODE_AI_CONFIG)) {
      out.push(MODE_AI_CONFIG);
    }
    return unique(out);
  }

  function runtime() {
    return globalThis.STRuntime?.get?.({ id: "steam-buff-page-runtime" }) || null;
  }

  function ownerForPhase(phase = state.activeKey) {
    if (phase === LOAD_KEY) {
      return LOAD_OWNER;
    }
    if (phase === AUTO_KEY) {
      return AUTO_OWNER;
    }
    return OWNER;
  }

  function registerResource(item) {
    const rt = runtime();
    if (!rt?.registerResource) {
      return;
    }
    rt.registerResource({
      owner: item.owner || ownerForPhase(),
      key: item.key,
      type: item.type,
      meta: item.meta || {},
      dispose: item.dispose,
    });
  }

  function ownTimer(kind, id, meta = {}) {
    if (!id) {
      return id;
    }
    const item = {
      id,
      kind,
      key: `${state.activeKey || "unknown"}:${kind}:${state.timers.length + 1}`,
      meta,
    };
    state.timers.push(item);
    registerResource({
      key: item.key,
      type: kind,
      meta,
      dispose() {
        if (kind === "interval") {
          globalThis.clearInterval(id);
        } else {
          globalThis.clearTimeout(id);
        }
      },
    });
    return id;
  }

  function ownObserver(observer, meta = {}) {
    if (!observer) {
      return observer;
    }
    const item = {
      observer,
      key: `${state.activeKey || "unknown"}:observer:${state.observers.length + 1}`,
      meta,
    };
    state.observers.push(item);
    registerResource({
      key: item.key,
      type: "observer",
      meta,
      dispose() {
        observer.disconnect?.();
      },
    });
    return observer;
  }

  function clearPhaseSideEffects(key, owner) {
    for (const item of state.timers.filter(timer => timer.key.startsWith(`${key}:`))) {
      if (item.kind === "interval") {
        globalThis.clearInterval(item.id);
      } else {
        globalThis.clearTimeout(item.id);
      }
    }
    for (const item of state.observers.filter(observer => observer.key.startsWith(`${key}:`))) {
      item.observer?.disconnect?.();
    }
    runtime()?.disposeOwner?.(owner);
    state.timers = state.timers.filter(timer => !timer.key.startsWith(`${key}:`));
    state.observers = state.observers.filter(item => !item.key.startsWith(`${key}:`));
  }

  function clearLoadSideEffects() {
    clearPhaseSideEffects(LOAD_KEY, LOAD_OWNER);
  }

  function clearAutoSideEffects() {
    clearPhaseSideEffects(AUTO_KEY, AUTO_OWNER);
  }

  function shouldMuteConsole(args) {
    const first = text(args?.[0]);
    return /translate\.js|translate\.execute\(\) Finish|已启动过了，无需在启动|PerformanceObserver|translate\.request\.listener/i.test(first);
  }

  function recordLog(args) {
    state.logs.push({
      time: Date.now(),
      phase: state.phase,
      text: text(args?.[0]).slice(0, 300),
    });
    if (state.logs.length > 30) {
      state.logs.shift();
    }
  }

  function patch() {
    if (state.patches) {
      return;
    }
    const orig = {
      setInterval: globalThis.setInterval,
      setTimeout: globalThis.setTimeout,
      MutationObserver: globalThis.MutationObserver,
      PerformanceObserver: globalThis.PerformanceObserver,
      log: console?.log,
      warn: console?.warn,
    };
    state.patches = orig;

    globalThis.setInterval = function wrappedSetInterval(fn, delay, ...args) {
      const id = orig.setInterval.call(this, fn, delay, ...args);
      if (state.phase === LOAD_KEY || state.phase === AUTO_KEY) {
        ownTimer("interval", id, {
          phase: state.phase,
          delay,
        });
      }
      return id;
    };
    globalThis.setTimeout = function wrappedSetTimeout(fn, delay, ...args) {
      const id = orig.setTimeout.call(this, fn, delay, ...args);
      if (state.phase === LOAD_KEY || state.phase === AUTO_KEY) {
        ownTimer("timeout", id, {
          phase: state.phase,
          delay,
        });
      }
      return id;
    };
    if (typeof orig.MutationObserver === "function") {
      globalThis.MutationObserver = function WrappedMutationObserver(callback) {
        return ownObserver(new orig.MutationObserver(callback), {
          phase: state.phase,
          observer: "MutationObserver",
        });
      };
      globalThis.MutationObserver.prototype = orig.MutationObserver.prototype;
    }
    if (typeof orig.PerformanceObserver === "function") {
      globalThis.PerformanceObserver = function WrappedPerformanceObserver(callback) {
        return ownObserver(new orig.PerformanceObserver(callback), {
          phase: state.phase,
          observer: "PerformanceObserver",
        });
      };
      Object.setPrototypeOf(globalThis.PerformanceObserver, orig.PerformanceObserver);
      globalThis.PerformanceObserver.prototype = orig.PerformanceObserver.prototype;
    }
    if (console && typeof orig.log === "function") {
      console.log = function wrappedVendorLog(...args) {
        if (state.phase && shouldMuteConsole(args)) {
          recordLog(args);
          return undefined;
        }
        return orig.log.apply(this, args);
      };
    }
    if (console && typeof orig.warn === "function") {
      console.warn = function wrappedVendorWarn(...args) {
        if (state.phase && shouldMuteConsole(args)) {
          recordLog(args);
          return undefined;
        }
        return orig.warn.apply(this, args);
      };
    }
  }

  function restore() {
    const orig = state.patches;
    if (!orig) {
      return;
    }
    globalThis.setInterval = orig.setInterval;
    globalThis.setTimeout = orig.setTimeout;
    if (orig.MutationObserver) {
      globalThis.MutationObserver = orig.MutationObserver;
    }
    if (orig.PerformanceObserver) {
      globalThis.PerformanceObserver = orig.PerformanceObserver;
    }
    if (console) {
      console.log = orig.log;
      console.warn = orig.warn;
    }
    state.patches = null;
  }

  function withPhase(key, fn) {
    state.activeKey = key;
    state.phase = key;
    patch();
    try {
      return fn();
    } finally {
      state.phase = "";
      state.activeKey = "";
      restore();
    }
  }

  function configure(conf = {}) {
    const modes = modesFrom(conf);
    state.modes = modes;
    state.mode = modes[0] || MODE_MANUAL;
    state.configuredAt = Date.now();
    const trans = globalThis.translate;
    if (trans?.listener) {
      trans.listener.use = modes.includes(MODE_AUTO_PAGE);
    }
    if (trans?.request?.listener) {
      trans.request.listener.use = modes.includes(MODE_AUTO_PAGE);
    }
    return diagnostics();
  }

  function beforeVendorLoad(conf = {}) {
    configure(conf);
    state.installed = true;
    state.activeKey = LOAD_KEY;
    state.phase = LOAD_KEY;
    patch();
  }

  function afterVendorLoad(conf = {}) {
    configure(conf);
    state.phase = "";
    state.activeKey = "";
    restore();
    clearLoadSideEffects();
    const trans = globalThis.translate;
    if (trans && typeof trans.log === "function") {
      trans.log = function steamBuffVendorLog(message) {
        if (shouldMuteConsole([message])) {
          recordLog([message]);
        }
      };
    }
    if (trans?.request?.api) {
      trans.request.api.init = "";
    }
    return diagnostics();
  }

  function prepareTextMode(trans) {
    if (trans?.listener) {
      trans.listener.use = false;
    }
    if (trans?.request?.listener) {
      trans.request.listener.use = false;
    }
    if (trans?.whole) {
      trans.whole.isEnableAll = false;
    }
  }

  function runAutoPage(fn) {
    state.autoStarted = true;
    return withPhase(AUTO_KEY, () => {
      return typeof fn === "function" ? fn() : undefined;
    });
  }

  function stopAutoPage(trans) {
    state.autoStarted = false;
    if (trans?.listener) {
      trans.listener.use = false;
      trans.listener.reset?.();
    }
    if (trans?.request?.listener) {
      trans.request.listener.use = false;
      trans.request.listener.executetime = 0;
    }
    if (trans?.whole) {
      trans.whole.isEnableAll = false;
    }
    clearAutoSideEffects();
  }

  function diagnostics() {
    return {
      version: VERSION,
      installed: state.installed,
      mode: state.mode,
      modes: state.modes.slice(),
      timerCount: state.timers.length,
      observerCount: state.observers.length,
      logCount: state.logs.length,
      autoStarted: state.autoStarted,
      configuredAt: state.configuredAt,
    };
  }

  globalThis[MARK] = Object.freeze({
    version: VERSION,
    modes: Object.freeze([MODE_SELECTION, MODE_MANUAL, MODE_AUTO_PAGE, MODE_AI_CONFIG]),
    configure,
    beforeVendorLoad,
    afterVendorLoad,
    prepareTextMode,
    runAutoPage,
    stopAutoPage,
    diagnostics,
    noop: NOOP,
  });
})();
