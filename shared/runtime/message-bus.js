/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 运行时消息总线
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  if (root.STMessageBus?.ready) {
    return;
  }

  const DEFAULT_TIMEOUT_MS = 12 * 1000;
  const MAX_IN_FLIGHT = 80;
  const AI_STREAM_TYPE = "AI_CHAT_COMPLETIONS_STREAM";
  const log = root.STLoggerFactory?.createLogger?.("shared", "message-bus") || {
    warn() {},
  };
  const ROUTES = Object.freeze({
    CONTENT_FILES_INJECT: { timeoutMs: 12 * 1000, owner: "runtime" },
    STEAM_BUFF_OPEN_SETTINGS: { timeoutMs: 5 * 1000, owner: "settings" },
    STORE_FETCH: { timeoutMs: 12 * 1000, owner: "network" },
    TRANSLATE_INJECT: { timeoutMs: 12 * 1000, owner: "translate" },
    UPDATE_CHECK: { timeoutMs: 10 * 1000, owner: "settings" },
    AI_CHAT_COMPLETIONS: { timeoutMs: 20 * 1000, owner: "ai" },
    AI_CHAT_COMPLETIONS_STREAM: { timeoutMs: 120 * 1000, owner: "ai" },
    AI_TRANSLATE_CACHE_GET: { timeoutMs: 8 * 1000, owner: "translate" },
    AI_TRANSLATE_CACHE_SET: { timeoutMs: 8 * 1000, owner: "translate" },
    LOG_APPEND: { timeoutMs: 8 * 1000, owner: "logger" },
    LOG_EXPORT: { timeoutMs: 12 * 1000, owner: "logger" },
    LOG_CLEAR: { timeoutMs: 8 * 1000, owner: "logger" },
    LOG_STATS: { timeoutMs: 8 * 1000, owner: "logger" },
  });

  const inFlight = new Map();
  const listeners = new Map();
  const stats = {
    sent: 0,
    resolved: 0,
    failed: 0,
    timedOut: 0,
    deduped: 0,
    listened: 0,
    byType: {},
    lastError: "",
    lastSentAt: 0,
  };

  function text(value) {
    return value == null ? "" : String(value);
  }

  function safeError(error) {
    return text(error?.message || error).slice(0, 300);
  }

  function routePolicy(type) {
    return ROUTES[text(type)] || { timeoutMs: DEFAULT_TIMEOUT_MS, owner: "unknown" };
  }

  function messageMeta(type, extra = {}, message = {}) {
    const policy = routePolicy(type);
    return {
      type: text(type) || "unknown",
      owner: policy.owner || "unknown",
      timeoutMs: Number(policy.timeoutMs) || DEFAULT_TIMEOUT_MS,
      operationId: text(message.operationId) || undefined,
      requestId: text(message.requestId) || undefined,
      ...extra,
    };
  }

  function timeoutFor(type, options = {}) {
    const value = Number(options.timeoutMs ?? routePolicy(type).timeoutMs ?? DEFAULT_TIMEOUT_MS);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function bump(type, field) {
    stats[field] += 1;
    const key = text(type) || "unknown";
    const item = stats.byType[key] || { sent: 0, resolved: 0, failed: 0, timedOut: 0, deduped: 0 };
    item[field] = (item[field] || 0) + 1;
    stats.byType[key] = item;
  }

  function pruneInFlight() {
    if (inFlight.size <= MAX_IN_FLIGHT) {
      return;
    }
    const overflow = inFlight.size - MAX_IN_FLIGHT;
    for (const key of Array.from(inFlight.keys()).slice(0, overflow)) {
      inFlight.delete(key);
    }
  }

  function createTimeout(type, timeoutMs) {
    const error = new Error(`${text(type) || "runtime-message"} 请求超时（${Math.round(timeoutMs)}ms）`);
    error.name = "TimeoutError";
    return error;
  }

  function send(payload = {}, options = {}) {
    const message = payload && typeof payload === "object" ? { ...payload } : {};
    const type = text(message.type || options.type);
    const logFailures = options.logFailures !== false;
    if (!type) {
      if (logFailures) {
        log.warn("message-bus-send-failed", "运行时消息发送失败", {
          operationId: text(message.operationId) || undefined,
          requestId: text(message.requestId) || undefined,
          reason: "missing-type",
        });
      }
      return Promise.reject(new Error("运行时消息缺少 type"));
    }
    message.type = type;

    const chromeApi = root.chrome?.runtime;
    if (!chromeApi?.sendMessage) {
      if (logFailures) {
        log.warn("message-bus-send-failed", "运行时消息发送失败", messageMeta(type, {
          reason: "sendMessage-unavailable",
        }, message));
      }
      return Promise.reject(new Error("chrome.runtime.sendMessage 不可用"));
    }

    const dedupeKey = text(options.dedupeKey || message.dedupeKey);
    if (dedupeKey && inFlight.has(dedupeKey)) {
      bump(type, "deduped");
      return inFlight.get(dedupeKey);
    }

    const timeoutMs = timeoutFor(type, options);
    const job = new Promise((resolve, reject) => {
      let done = false;
      let timer = 0;

      const finish = (fn, value) => {
        if (done) {
          return;
        }
        done = true;
        if (timer) {
          root.clearTimeout(timer);
        }
        if (dedupeKey) {
          inFlight.delete(dedupeKey);
        }
        fn(value);
      };

      if (timeoutMs > 0) {
        timer = root.setTimeout(() => {
          const error = createTimeout(type, timeoutMs);
          stats.lastError = safeError(error);
          bump(type, "timedOut");
          bump(type, "failed");
          if (logFailures) {
            log.warn("message-bus-send-timeout", "运行时消息发送超时", messageMeta(type, {
              timeoutMs,
              error,
            }, message));
          }
          finish(reject, error);
        }, timeoutMs);
      }

      try {
        stats.lastSentAt = Date.now();
        bump(type, "sent");
        chromeApi.sendMessage(message, (response) => {
          if (done) {
            return;
          }
          const error = chromeApi.lastError;
          if (error) {
            const err = new Error(error.message || "后台消息请求失败");
            err.name = "MessageError";
            stats.lastError = safeError(err);
            bump(type, "failed");
            if (logFailures) {
              log.warn("message-bus-send-failed", "运行时消息发送失败", messageMeta(type, {
                error: err,
              }, message));
            }
            finish(reject, err);
            return;
          }
          bump(type, "resolved");
          finish(resolve, response || null);
        });
      } catch (error) {
        stats.lastError = safeError(error);
        bump(type, "failed");
        if (logFailures) {
          log.warn("message-bus-send-failed", "运行时消息发送失败", messageMeta(type, {
            error,
          }, message));
        }
        finish(reject, error);
      }
    });

    if (dedupeKey) {
      inFlight.set(dedupeKey, job);
      pruneInFlight();
    }
    return job;
  }

  function stream(payload = {}, handlers = {}, options = {}) {
    const message = payload && typeof payload === "object" ? { ...payload } : {};
    const type = text(message.type || options.type);
    const chromeApi = root.chrome?.runtime;
    if (type !== AI_STREAM_TYPE) {
      const error = new Error("未知的流式消息类型");
      return Object.freeze({ done: Promise.reject(error), cancel() {} });
    }
    if (!chromeApi?.connect) {
      const error = new Error("chrome.runtime.connect 不可用");
      return Object.freeze({ done: Promise.reject(error), cancel() {} });
    }

    message.type = type;
    const timeoutMs = timeoutFor(type, {
      ...options,
      timeoutMs: options.timeoutMs ?? message.timeoutMs,
    });
    const logFailures = options.logFailures !== false;
    let port = null;
    let timer = 0;
    let settled = false;
    let rejectDone = null;

    const done = new Promise((resolve, reject) => {
      rejectDone = reject;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        if (timer) root.clearTimeout(timer);
        fn(value);
      };

      try {
        port = chromeApi.connect({ name: type });
      } catch (error) {
        stats.lastError = safeError(error);
        bump(type, "failed");
        if (logFailures) {
          log.warn("message-bus-stream-failed", "运行时流式消息连接失败", messageMeta(type, { error }, message));
        }
        finish(reject, error);
        return;
      }

      if (timeoutMs > 0) {
        timer = root.setTimeout(() => {
          const error = createTimeout(type, timeoutMs);
          stats.lastError = safeError(error);
          bump(type, "timedOut");
          bump(type, "failed");
          if (logFailures) {
            log.warn("message-bus-stream-timeout", "运行时流式消息超时", messageMeta(type, {
              timeoutMs,
              error,
            }, message));
          }
          finish(reject, error);
          try {
            port?.disconnect?.();
          } catch {
          }
        }, timeoutMs);
      }

      port.onMessage.addListener((event = {}) => {
        if (settled) return;
        try {
          if (event.event === "start") {
            handlers.onStart?.(event);
            return;
          }
          if (event.event === "delta") {
            handlers.onDelta?.(text(event.text), event);
            return;
          }
          if (event.event === "done") {
            handlers.onDone?.(event);
            bump(type, "resolved");
            finish(resolve, event);
            try {
              port?.disconnect?.();
            } catch {
            }
            return;
          }
          if (event.event === "error") {
            const error = new Error(text(event.error) || "AI 流式请求失败");
            error.code = text(event.code) || "AI_STREAM_FAILED";
            error.status = Number(event.status) || 0;
            stats.lastError = safeError(error);
            handlers.onError?.(error, event);
            bump(type, "failed");
            finish(reject, error);
            try {
              port?.disconnect?.();
            } catch {
            }
          }
        } catch (error) {
          stats.lastError = safeError(error);
          bump(type, "failed");
          if (logFailures) {
            log.warn("message-bus-stream-failed", "运行时流式消息处理失败", messageMeta(type, { error }, message));
          }
          finish(reject, error);
          try {
            port?.disconnect?.();
          } catch {
          }
        }
      });

      port.onDisconnect.addListener(() => {
        if (settled) return;
        const runtimeError = chromeApi.lastError;
        const error = new Error(runtimeError?.message || "AI 流式通道已断开");
        error.name = "MessageError";
        stats.lastError = safeError(error);
        bump(type, "failed");
        if (logFailures) {
          log.warn("message-bus-stream-failed", "运行时流式消息意外断开", messageMeta(type, { error }, message));
        }
        finish(reject, error);
      });

      stats.lastSentAt = Date.now();
      bump(type, "sent");
      try {
        port.postMessage(message);
      } catch (error) {
        stats.lastError = safeError(error);
        bump(type, "failed");
        if (logFailures) {
          log.warn("message-bus-stream-failed", "运行时流式消息发送失败", messageMeta(type, { error }, message));
        }
        finish(reject, error);
        try {
          port.disconnect();
        } catch {
        }
      }
    });

    function cancel() {
      if (settled) return;
      const error = new Error("AI 流式请求已取消");
      error.name = "AbortError";
      settled = true;
      if (timer) root.clearTimeout(timer);
      rejectDone?.(error);
      try {
        port?.disconnect?.();
      } catch {
      }
    }

    return Object.freeze({ done, cancel });
  }

  async function request(payload = {}, options = {}) {
    const response = await send(payload, options);
    if (options.expectSuccess === true && response?.success === false) {
      const error = new Error(response?.error || "后台消息请求失败");
      error.response = response;
      error.status = Number(response?.status) || 0;
      if (options.logFailures !== false) {
        log.warn("message-bus-request-failed", "运行时消息请求失败", messageMeta(payload?.type || options.type, {
          status: error.status,
          error,
        }, payload));
      }
      throw error;
    }
    return response;
  }

  function listen(type, handler, options = {}) {
    const route = text(type);
    if (!route || typeof handler !== "function" || !root.chrome?.runtime?.onMessage) {
      log.warn("message-bus-listen-skipped", "运行时消息监听跳过", messageMeta(route, {
        reason: !route
          ? "missing-type"
          : typeof handler !== "function"
            ? "handler-invalid"
            : "onMessage-unavailable",
      }));
      return null;
    }
    const owner = text(options.owner || routePolicy(route).owner || "message-bus");
    const key = text(options.key || route);
    const listener = (message, sender, sendResponse) => {
      if (text(message?.type) !== route) {
        return false;
      }
      try {
        return handler(message, sender, sendResponse) === true;
      } catch (error) {
        stats.lastError = safeError(error);
        log.warn("message-bus-listener-failed", "运行时消息监听处理失败", messageMeta(route, {
          owner,
          key,
          error,
        }));
        sendResponse?.({ success: false, error: safeError(error) });
        return false;
      }
    };
    root.chrome.runtime.onMessage.addListener(listener);
    const id = `${owner}:${key}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    let disposed = false;
    const dispose = () => {
      if (disposed) {
        return;
      }
      disposed = true;
      try {
        root.chrome.runtime.onMessage.removeListener(listener);
      } catch (error) {
        log.warn("message-bus-listener-dispose-failed", "运行时消息监听释放失败", messageMeta(route, {
          owner,
          key,
          error,
        }));
      }
      listeners.delete(id);
      stats.listened = listeners.size;
    };
    listeners.set(id, { id, owner, key, type: route, createdAt: Date.now(), dispose });
    stats.listened = listeners.size;
    root.STRuntime?.current?.()?.registerResource?.({
      owner,
      key,
      type: "message-listener",
      dispose,
    });
    return Object.freeze({ id, owner, key, type: route, dispose });
  }

  function clearOwner(owner) {
    const target = text(owner);
    let count = 0;
    for (const item of Array.from(listeners.values())) {
      if (item.owner === target) {
        item.dispose();
        count += 1;
      }
    }
    stats.listened = listeners.size;
    return count;
  }

  function diagnostics() {
    return {
      policy: {
        defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
        maxInFlight: MAX_IN_FLIGHT,
        routes: ROUTES,
      },
      stats: {
        ...stats,
        byType: { ...stats.byType },
      },
      inFlight: inFlight.size,
      listeners: Array.from(listeners.values()).map(item => ({
        owner: item.owner,
        key: item.key,
        type: item.type,
        ageMs: Date.now() - item.createdAt,
      })),
    };
  }

  root.STMessageBus = root.STRuntimeMessageBus = Object.freeze({
    ready: true,
    routes: ROUTES,
    send,
    stream,
    request,
    listen,
    clearOwner,
    diagnostics,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
