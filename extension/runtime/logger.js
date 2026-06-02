/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 前台诊断日志上报
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  if (root.STLogger?.ready) {
    return;
  }

  const EVENT = "STEAM_BUFF_LOG_EVENT";
  const FALLBACK_KEY = "steam_buff_diag_fallback_logs";
  const FALLBACK_MAX = 120;
  const FALLBACK_TAG = "storage-fallback";
  let globalBound = false;

  function page() {
    try {
      return location.href;
    } catch {
      return "";
    }
  }

  function domain() {
    try {
      const host = location.hostname;
      if (host === "store.steampowered.com" || host === "checkout.steampowered.com") return "store";
      if (host === "steamcommunity.com") return "community";
      if (host === "steamloopback.host") return "steam";
      return host ? "settings" : "extension";
    } catch {
      return "extension";
    }
  }

  function transportError(error) {
    const text = error?.message || String(error || "");
    return text || "日志上报失败";
  }

  function storageFallback(entry) {
    try {
      if (typeof chrome === "undefined" || !chrome.storage?.local) {
        return;
      }
      chrome.storage.local.get([FALLBACK_KEY], (rt) => {
        if (chrome.runtime?.lastError) {
          return;
        }
        const list = Array.isArray(rt?.[FALLBACK_KEY]) ? rt[FALLBACK_KEY] : [];
        const next = [...list, entry].slice(-FALLBACK_MAX);
        chrome.storage.local.set({ [FALLBACK_KEY]: next }, () => {
          void chrome.runtime?.lastError;
        });
      });
    } catch {
    }
  }

  function send(entry) {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: "LOG_APPEND", entry }, () => {
          const err = chrome.runtime?.lastError;
          if (err) {
            storageFallback({
              ...entry,
              level: "error",
              feature: "runtime-logger",
              event: "transport-send-failed",
              message: "前台诊断日志上报失败",
              error: transportError(err),
              meta: {
                [FALLBACK_TAG]: true,
                transportError: true,
                originalEvent: entry.event || "",
                originalFeature: entry.feature || "",
              },
            });
          }
        });
        return;
      }
    } catch {
    }
    try {
      root.postMessage({ type: EVENT, entry }, "*");
    } catch {
    }
  }

  function append(input = {}) {
    const entry = {
      time: Date.now(),
      domain: domain(),
      page: page(),
      ...(input || {}),
    };
    send(entry);
  }

  function bindGlobalLoggers() {
    if (globalBound) {
      return;
    }
    globalBound = true;
    root.addEventListener("error", (event) => {
      append({
        level: "error",
        feature: "runtime-logger",
        event: "page-unhandled-error",
        message: "前台未捕获异常",
        error: event?.error || event?.message || "未知前台异常",
        meta: {
          filename: String(event?.filename || ""),
          lineno: Number(event?.lineno) || 0,
          colno: Number(event?.colno) || 0,
        },
      });
    });
    root.addEventListener("unhandledrejection", (event) => {
      append({
        level: "error",
        feature: "runtime-logger",
        event: "page-unhandled-rejection",
        message: "前台未处理 Promise 拒绝",
        error: event?.reason || "未知 Promise 拒绝",
      });
    });
  }

  function withLevel(level, input = {}) {
    append({ ...(input || {}), level });
  }

  function info(entry) {
    withLevel("info", entry);
  }

  function warn(entry) {
    withLevel("warn", entry);
  }

  function error(entry) {
    withLevel("error", entry);
  }

  function network(entry) {
    withLevel("network", entry);
  }

  const api = Object.freeze({
    ready: true,
    EVENT,
    append,
    info,
    warn,
    error,
    network,
  });

  bindGlobalLoggers();
  root.STLogger = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
