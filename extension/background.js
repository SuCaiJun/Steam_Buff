/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 扩展后台消息与请求代理
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  importScripts(chrome.runtime.getURL("shared/config.js"));
  importScripts(chrome.runtime.getURL("extension/background-logger.js"));
  importScripts(chrome.runtime.getURL("extension/background-update.js"));

  const CFG = globalThis.STConfig;
  const MATCH = CFG.matchers;
  const STORE_HOSTS = Object.freeze(new Set([
    CFG.vendors.steamStore.host,
    CFG.vendors.steamApi.host,
    CFG.vendors.augmentedSteam.host,
    CFG.vendors.steampy.host,
    ...CFG.hosts.storeProxy,
  ]));
  const SAFE_HEADERS = Object.freeze(new Set([
    "accept",
    "content-type",
    "authorization",
    "x-requested-with",
  ]));
  const FILES = Object.freeze([
    "shared/config.js",
    "shared/performance-monitor.js",
    "shared/page-context.js",
    "extension/runtime/guard.js",
    "extension/runtime/injector.js",
    "extension/runtime/logger.js",
    "extension/content.js",
  ]);
  const WEB_BOOT_FILES = Object.freeze([
    "shared/config.js",
    "extension/runtime/injector.js",
    "extension/runtime/logger.js",
    "shared/logger-factory.js",
    "shared/error-boundary.js",
    "shared/runtime/kernel.js",
    "shared/page-context.js",
    "extension/content.js",
  ]);
  const CONTENT_MARK = "steamBuffContentStarted";
  const CONTENT_MARK_VERSION = "steam-runtime-scope-20260616-p7-page-context";
  const SETTINGS_OPEN_MESSAGE = "STEAM_BUFF_OPEN_SETTINGS";
  const INJECT_DELAYS = Object.freeze([0, 1000, 3000]);
  const STORE_FETCH_TIMEOUT_MS = 12 * 1000;
  const AI_FETCH_TIMEOUT_MS = 20 * 1000;
  const SHARED_CONFIG = "shared/config.js";
  const OBSERVER_UTILS = "shared/observer-utils.js";
  const TRANS_LIB = "vendor/xnx3-translate/translate.js";
  const AI_CONFIG = "ai/config.js";
  const AI_CACHE = "ai/cache.js";
  const TRANS_AI_PROMPTS = "translate/ai-prompts.js";
  const TRANS_AI = "translate/ai-adapter.js";
  const TRANS_RUNNER = "translate/runner.js";
  let aiReady = false;
  let aiLoadError = "";

  /* 后台脚本依赖 */
  try {
    importScripts(chrome.runtime.getURL(AI_CONFIG));
    aiReady = !!globalThis.STAI?.ready;
  } catch (error) {
    aiLoadError = error?.message || String(error);
    console.error("[Steam Buff] AI 配置加载失败", error);
    logError("background", "ai-config-load-failed", "AI 配置加载失败", error);
  }

  try {
    importScripts(chrome.runtime.getURL(AI_CACHE));
  } catch (error) {
    console.error("[Steam Buff] AI 缓存加载失败", error);
    logError("background", "ai-cache-load-failed", "AI 缓存加载失败", error);
  }

  function appendLog(entry, sender) {
    const job = globalThis.STBackgroundLogger?.append?.(entry, sender);
    return job?.catch?.(() => null) || Promise.resolve(null);
  }

  function logError(feature, event, message, error, meta) {
    appendLog({
      level: "error",
      domain: "background",
      feature,
      event,
      message,
      error,
      meta,
    });
  }

  function logNetwork(entry) {
    const url = entry?.url
      ? (globalThis.STBackgroundLogger?.safeLogUrl?.(entry.url) || safeLogUrl(entry.url))
      : "";
    appendLog({
      level: "network",
      domain: "background",
      ...entry,
      ...(url ? { url } : {}),
    });
  }

  function safeLogUrl(value) {
    if (!value) {
      return "";
    }
    try {
      const url = new URL(String(value));
      const out = new URL(`${url.origin}${url.pathname}`);
      for (const key of ["appid", "appids", "subid", "bundleid", "id", "cc", "start", "count"]) {
        const values = url.searchParams.getAll(key);
        for (const item of values) {
          out.searchParams.append(key, String(item || "").slice(0, 120));
        }
      }
      return out.toString();
    } catch {
      return String(value).replace(/([?&](?:access_token|refresh_token|token|sessionid|password|key)=)[^&#\s]*/gi, "$1[REDACTED]").slice(0, 300);
    }
  }

  function globalErrorMeta() {
    return {
      path: String(globalThis.location?.pathname || ""),
      href: String(globalThis.location?.href || ""),
    };
  }

  function bindGlobalLoggers() {
    globalThis.addEventListener("error", (event) => {
      const error = event?.error || event?.message || "未知后台异常";
      console.error("[Steam Buff] 后台未捕获异常", error);
      logError("background", "background-unhandled-error", "后台未捕获异常", error, globalErrorMeta());
    });
    globalThis.addEventListener("unhandledrejection", (event) => {
      const reason = event?.reason || "未知 Promise 拒绝";
      console.error("[Steam Buff] 后台未处理 Promise 拒绝", reason);
      logError("background", "background-unhandled-rejection", "后台未处理 Promise 拒绝", reason, globalErrorMeta());
    });
  }

  function isSteam(url) {
    try {
      return MATCH.isSteamLoopbackHost(new URL(url).hostname);
    } catch {
      return false;
    }
  }

  // Steam 客户端内嵌窗口常以 about:blank 起步，不能只看当前 URL 就跳过补注入。
  function ok(tab) {
    if (!tab || typeof tab.id !== "number") {
      return false;
    }
    return !tab.url || isSteam(tab.url) || tab.url.startsWith("about:blank");
  }

  function inject(tabId) {
    chrome.scripting.executeScript(
      {
        target: { tabId, allFrames: true },
        files: FILES,
      },
      () => {
        const err = chrome.runtime.lastError;
        if (err) {
          console.error("[Steam Buff] 后台注入内容脚本失败", err.message || err);
          logError("injection", "content-script-inject-failed", "后台注入内容脚本失败", err.message || err, { tabId });
        }
      },
    );
  }

  async function ping(tabId) {
    try {
      const frames = await execScript({
        target: { tabId, allFrames: true },
        func: (mark, version) => globalThis[mark] === version,
        args: [CONTENT_MARK, CONTENT_MARK_VERSION],
      });
      return frames.length > 0 && frames.every(frame => frame?.result === true);
    } catch {
      return false;
    }
  }

  async function injectIfNeeded(tabId) {
    if (await ping(tabId)) {
      return;
    }
    inject(tabId);
  }

  function tabsQueryAll() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({}, (tabs) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || "读取标签页失败"));
          return;
        }
        if (!Array.isArray(tabs)) {
          reject(new Error("tabs-query-invalid"));
          return;
        }
        resolve(tabs);
      });
    });
  }

  async function injectAll() {
    try {
      const tabs = await tabsQueryAll();
      for (const tab of tabs) {
        if (ok(tab)) {
          injectIfNeeded(tab.id);
        }
      }
    } catch (error) {
      console.error("[Steam Buff] 后台读取标签页失败", error?.message || error);
      logError("injection", "tabs-query-failed", "后台读取标签页失败", error, globalErrorMeta());
    }
  }

  function injectSoon() {
    // 扩展重载、开机自启和 Steam CEF 复用旧窗口时机不稳定，短重试用于覆盖稍后才 ready 的既有页面。
    for (const delay of INJECT_DELAYS) {
      if (delay <= 0) {
        injectAll();
      } else {
        globalThis.setTimeout(injectAll, delay);
      }
    }
  }

  function openSettings(tab) {
    const tabId = tab?.id;
    if (typeof tabId !== "number") {
      return;
    }
    const sendOpen = () => {
      chrome.tabs.sendMessage(tabId, { type: SETTINGS_OPEN_MESSAGE }, () => {
        const err = chrome.runtime.lastError;
        if (err) {
          logError("settings", "settings-open-message-failed", "设置中心打开消息发送失败", err.message || err, { tabId });
        }
      });
    };
    chrome.scripting.executeScript(
      {
        target: { tabId, allFrames: false },
        files: WEB_BOOT_FILES,
      },
      () => {
        const err = chrome.runtime.lastError;
        if (err) {
          logError("settings", "settings-open-boot-failed", "设置中心轻入口补注入失败", err.message || err, { tabId });
        }
        sendOpen();
      },
    );
  }

  // 后台代理是跨域访问边界，只允许业务需要的少量请求头，避免调用方透传浏览器敏感头。
  function cleanHeaders(headers) {
    const out = {};
    for (const [name, value] of Object.entries(headers || {})) {
      const lower = name.toLowerCase();
      if (!SAFE_HEADERS.has(lower)) {
        continue;
      }
      if (value === undefined || value === null) {
        continue;
      }
      out[name] = String(value);
    }
    return out;
  }

  function reqBody(request) {
    if (request.body !== undefined) {
      return request.body;
    }
    if (request.data !== undefined) {
      return JSON.stringify(request.data);
    }
    return undefined;
  }

  function normalizeTimeout(value, fallback) {
    const next = Number(value ?? fallback);
    return Number.isFinite(next) && next > 0 ? next : 0;
  }

  function timeoutError(timeoutMs) {
    const error = new Error(`请求超时（${Math.round(timeoutMs)}ms）`);
    error.name = "TimeoutError";
    return error;
  }

  async function fetchWithTimeout(url, init, timeoutMs) {
    const timeout = normalizeTimeout(timeoutMs, 0);
    if (timeout <= 0) {
      return fetch(url, init);
    }
    if (typeof AbortController === "function") {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(timeoutError(timeout)), timeout);
      try {
        return await fetch(url, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    }
    let timer = 0;
    return Promise.race([
      fetch(url, init),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(timeout)), timeout);
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  /* 商店页跨域代理 */
  async function storeFetch(request, sender, sendResponse) {
    const startedAt = Date.now();
    let url;
    try {
      url = new URL(request.url);
    } catch {
      logNetwork({
        feature: "store-fetch",
        event: "invalid-url",
        message: "后台代理收到无效请求地址",
        method: request.method || "GET",
        url: request.url || "",
        status: 0,
        durationMs: Date.now() - startedAt,
      });
      sendResponse({ success: false, error: "无效的请求地址" });
      return;
    }

    if (!STORE_HOSTS.has(url.hostname)) {
      logNetwork({
        feature: "store-fetch",
        event: "blocked-host",
        message: "后台代理拒绝非允许列表地址",
        method: request.method || "GET",
        url: url.toString(),
        status: 0,
        durationMs: Date.now() - startedAt,
      });
      sendResponse({ success: false, error: "请求地址不在允许列表中" });
      return;
    }

    const method = String(request.method || "GET").toUpperCase();
    const init = {
      method,
      headers: cleanHeaders(request.headers),
      cache: "no-cache",
      credentials: "omit",
    };

    const body = reqBody(request);
    if (body !== undefined && method !== "GET" && method !== "HEAD") {
      init.body = body;
    }

    try {
      const response = await fetchWithTimeout(url.toString(), init, request.timeoutMs ?? STORE_FETCH_TIMEOUT_MS);
      const data = await response.text();
      if (!response.ok && !request.allowHttpError) {
        const msg = httpError(response.status, data);
        console.error("[Steam Buff] 后台代理请求失败", msg);
        logNetwork({
          feature: "store-fetch",
          event: "http-failed",
          message: "后台代理请求失败",
          method,
          url: url.toString(),
          status: response.status,
          durationMs: Date.now() - startedAt,
          error: `HTTP状态码错误: ${response.status}`,
        });
        sendResponse({ success: false, error: msg, data, status: response.status, ok: false });
        return;
      }
      if (!response.ok) {
        logNetwork({
          feature: "store-fetch",
          event: "http-allowed-error",
          message: "后台代理收到非成功状态码",
          method,
          url: url.toString(),
          status: response.status,
          durationMs: Date.now() - startedAt,
        });
      }
      sendResponse({ success: true, data, status: response.status, ok: response.ok });
    } catch (error) {
      const msg = error.message || String(error);
      console.error("[Steam Buff] 后台代理请求失败", msg);
      logNetwork({
        feature: "store-fetch",
        event: "request-thrown",
        message: "后台代理请求异常",
        method,
        url: url.toString(),
        status: 0,
        durationMs: Date.now() - startedAt,
        error,
      });
      sendResponse({ success: false, error: msg, status: 0, ok: false });
    }
  }

  function parseJson(text) {
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function httpError(status, text) {
    void text;
    return `HTTP状态码错误: ${status}`;
  }

  function aiChat(request, sender, sendResponse) {
    if (!aiReady) {
      sendResponse({
        success: false,
        code: "AI_CONFIG_LOAD_FAILED",
        error: aiLoadError ? `AI 配置脚本加载失败：${aiLoadError}` : "AI 配置脚本未就绪",
      });
      return;
    }

    const next = globalThis.STAI?.chatRequest?.(request.ai, request.messages);
    if (!next) {
      sendResponse({ success: false, code: "AI_CONFIG_INCOMPLETE", error: "AI 配置不完整" });
      return;
    }

    let url;
    try {
      url = new URL(next.url);
    } catch {
      sendResponse({ success: false, error: "无效的 AI 网关地址" });
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      sendResponse({ success: false, error: "无效的 AI 网关协议" });
      return;
    }

    fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: next.headers,
      body: JSON.stringify(next.body),
      cache: "no-cache",
      credentials: "omit",
    }, request.timeoutMs ?? AI_FETCH_TIMEOUT_MS)
      .then((response) => response.text().then((text) => {
        if (!response.ok) {
          throw new Error(httpError(response.status, text));
        }
        const data = parseJson(text);
        const content = globalThis.STAI?.chatText?.(data);
        if (!content) {
          throw new Error("AI 响应格式异常");
        }
        return { content, status: response.status };
      }))
      .then((res) => {
        sendResponse({ success: true, text: res.content, status: res.status });
      })
      .catch((error) => {
        const msg = error.message || String(error);
        console.error("[Steam Buff] AI 请求失败", msg);
        logError("ai", "request-failed", "AI 请求失败", error);
        sendResponse({ success: false, error: msg });
      });
  }

  function translateTarget(sender) {
    const tabId = sender?.tab?.id;
    const frameId = sender?.frameId;
    if (typeof tabId !== "number" || typeof frameId !== "number") {
      return null;
    }
    return { tabId, frameIds: [frameId] };
  }

  function senderTarget(sender) {
    const tabId = sender?.tab?.id;
    const frameId = sender?.frameId;
    if (typeof tabId !== "number" || typeof frameId !== "number") {
      return null;
    }
    return { tabId, frameIds: [frameId] };
  }

  // Chrome executeScript 没有 Promise 形态，统一包一层便于异步路由保持 sendResponse 通道。
  function execScript(options) {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript(options, (res) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || String(err)));
          return;
        }
        resolve(res || []);
      });
    });
  }

  // 翻译脚本只注入发起请求的 frame，先写入配置，再按需加载翻译库和 runner，避免污染其他页面。
  async function translateInject(request, sender, sendResponse) {
    const target = translateTarget(sender);
    if (!target) {
      sendResponse({ success: false, error: "无法定位翻译页面" });
      return;
    }

    try {
      await execScript({
        target,
        world: "ISOLATED",
        func: (cfg) => {
          globalThis.STEAM_BUFF_TRANSLATE_CONFIG = cfg || {};
        },
        args: [request.cfg || {}],
      });

      const res = await execScript({
        target,
        world: "ISOLATED",
        func: () => ({
          lib: !!(globalThis.translate && globalThis.translate.version),
          runner: globalThis.steamBuffTranslateRunnerLoaded === true,
        }),
      });
      const state = res?.[0]?.result || {};
      if (state.runner === true) {
        sendResponse({ success: true });
        return;
      }

      await execScript({
        target,
        world: "ISOLATED",
        files: state.lib === true
          ? [SHARED_CONFIG, OBSERVER_UTILS, AI_CONFIG, AI_CACHE, TRANS_AI_PROMPTS, TRANS_AI, TRANS_RUNNER]
          : [TRANS_LIB, SHARED_CONFIG, OBSERVER_UTILS, AI_CONFIG, AI_CACHE, TRANS_AI_PROMPTS, TRANS_AI, TRANS_RUNNER],
      });
      sendResponse({ success: true });
    } catch (error) {
      const msg = error.message || String(error);
      console.error("[Steam Buff] 翻译注入失败", msg);
      logError("translate", "inject-failed", "翻译注入失败", error);
      sendResponse({ success: false, error: msg });
    }
  }

  async function injectContentFiles(request, sender, sendResponse) {
    const target = senderTarget(sender);
    const files = Array.isArray(request.files)
      ? request.files.filter(item => typeof item === "string" && item.trim()).map(item => item.trim())
      : [];
    if (!target || !files.length) {
      sendResponse({ success: false, error: "无法定位注入目标或脚本列表为空" });
      return;
    }

    try {
      await execScript({
        target,
        world: "ISOLATED",
        files,
      });
      sendResponse({ success: true });
    } catch (error) {
      logError("injection", "content-files-inject-failed", "内容脚本文件按需注入失败", error, {
        count: files.length,
        firstFile: files[0] || "",
      });
      sendResponse({ success: false, error: error?.message || String(error) });
    }
  }

  function cacheGet(request, sender, sendResponse) {
    const store = globalThis.STAITranslateCache;
    if (!store?.getMany) {
      sendResponse({ success: true, data: {} });
      return;
    }
    store.getMany(request.keys)
      .then((data) => sendResponse({ success: true, data }))
      .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
  }

  function cacheSet(request, sender, sendResponse) {
    const store = globalThis.STAITranslateCache;
    if (!store?.setMany) {
      sendResponse({ success: false, error: "AI 缓存模块未加载" });
      return;
    }
    store.setMany(request.entries)
      .then((ok) => sendResponse({ success: ok !== false }))
      .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
  }

  const ROUTES = Object.freeze({
    UPDATE_CHECK: globalThis.STBackgroundUpdate.updateCheck,
    STORE_FETCH: storeFetch,
    TRANSLATE_INJECT: translateInject,
    CONTENT_FILES_INJECT: injectContentFiles,
    AI_CHAT_COMPLETIONS: aiChat,
    AI_TRANSLATE_CACHE_GET: cacheGet,
    AI_TRANSLATE_CACHE_SET: cacheSet,
    LOG_APPEND(request, sender, sendResponse) {
      globalThis.STBackgroundLogger.append(request.entry || request, sender)
        .then((stats) => sendResponse({ success: true, stats }))
        .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
    },
    LOG_EXPORT(request, sender, sendResponse) {
      globalThis.STBackgroundLogger.exportLogs(request.entry || request, sender)
        .then((data) => sendResponse({ success: true, ...data }))
        .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
    },
    LOG_CLEAR(request, sender, sendResponse) {
      globalThis.STBackgroundLogger.clear()
        .then((stats) => sendResponse({ success: true, stats }))
        .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
    },
    LOG_STATS(request, sender, sendResponse) {
      globalThis.STBackgroundLogger.stats()
        .then((stats) => sendResponse({ success: true, stats }))
        .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
    },
  });

  // 所有异步路由必须 return true，让 Chrome 保持 sendResponse 通道。
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const route = ROUTES[request?.type];
    if (route) {
      route(request, sender, sendResponse);
      return true;
    }
    return false;
  });

  chrome.runtime.onInstalled.addListener(injectSoon);
  chrome.runtime.onStartup.addListener(injectSoon);
  chrome.action?.onClicked?.addListener(openSettings);
  bindGlobalLoggers();
  injectSoon();
})();
