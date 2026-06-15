/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 后台诊断日志存储与导出
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  if (root.STBackgroundLogger?.ready) {
    return;
  }

  const STORE_KEY = "steam_buff_diag_logs";
  const FALLBACK_KEY = "steam_buff_diag_fallback_logs";
  const MB = 1024 * 1024;
  const POLICY = Object.freeze({
    version: 1,
    maxEntries: null,
    targetBytes: Math.floor(4.5 * MB),
    hardBytes: 5 * MB,
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
    messageMax: 1000,
    metaMax: 4 * 1024,
    quietEvents: [
      "content-script-start",
      "runtime-deps-waiting",
      "runtime-start",
      "runtime-ready",
      "runtime-waiting",
      "runtime-skipped",
      "features-start-summary",
    ],
  });
  const LEVELS = Object.freeze(new Set(["debug", "info", "warn", "error", "fatal", "network"]));
  const QUERY_ALLOW = Object.freeze(new Set(["appid", "appids", "subid", "bundleid", "id", "cc"]));
  const SENSITIVE = /^(authorization|cookie|set-cookie|access_token|refresh_token|token|sessionid|password|body|requestbody|responsebody|responsetext|requestdata|data|headers)$/i;
  const SETTINGS_SENSITIVE = /^(authorization|cookie|set-cookie|access_token|refresh_token|token|sessionid|password|secret|apikey|api_key|key)$/i;
  const SENSITIVE_WORD = /(authorization|cookie|set-cookie|access_token|refresh_token|token|sessionid|password|bearer)\s*[:=]?\s*[^,\s;]*/gi;
  const QUIET_INFO_EVENT = /^(?:content-script-start|runtime-deps-waiting|runtime-(?:start|ready|waiting|skipped)|features-start-summary|.+-runtime-inject-(?:start|success|skipped)|.+-page-script-inject-(?:start|success))$/u;
  const BJ_OFFSET_MS = 8 * 60 * 60 * 1000;

  // chrome.storage.local 没有原子更新能力，所有读改写和清空必须串行。
  let storageQueue = Promise.resolve();

  function pad(value, size = 2) {
    return String(Math.max(0, Number(value) || 0)).padStart(size, "0");
  }

  function num(value) {
    const next = Number(value);
    return Number.isFinite(next) ? next : 0;
  }

  function tsFrom(value) {
    const next = Number(value);
    if (Number.isFinite(next) && next > 0) {
      return Math.round(next);
    }
    const parsed = Date.parse(String(value || ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function itemTs(item) {
    return tsFrom(item?.ts) || tsFrom(item?.time);
  }

  function bjParts(value) {
    const ts = tsFrom(value) || Date.now();
    const date = new Date(ts + BJ_OFFSET_MS);
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
      ms: date.getUTCMilliseconds(),
    };
  }

  function bjTime(value) {
    const part = bjParts(value);
    return `${part.year}-${pad(part.month)}-${pad(part.day)} ${pad(part.hour)}:${pad(part.minute)}:${pad(part.second)}.${pad(part.ms, 3)} +08:00`;
  }

  function bjStamp(value) {
    const part = bjParts(value);
    return `${part.year}${pad(part.month)}${pad(part.day)}-${pad(part.hour)}${pad(part.minute)}${pad(part.second)}`;
  }

  function safeIso(value) {
    const ts = tsFrom(value);
    return ts ? new Date(ts).toISOString() : "";
  }

  function levelCounts(logs) {
    const out = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
      fatal: 0,
      network: 0,
    };
    for (const item of logs || []) {
      const level = String(item?.level || "");
      if (Object.prototype.hasOwnProperty.call(out, level)) {
        out[level] += 1;
      }
    }
    return out;
  }

  function isFailure(item) {
    const event = String(item?.event || "");
    const level = String(item?.level || "");
    const status = num(item?.status);
    return level === "error"
      || /(?:^|[-])(failed|thrown|error|invalid|blocked|timeout|rejected)$/.test(event)
      || event.includes("unhandled")
      || status >= 400;
  }

  function pickLog(item) {
    if (!item || typeof item !== "object") {
      return null;
    }
    const ts = itemTs(item) || Date.now();
    const out = {
      time: bjTime(ts),
      ts,
      level: String(item.level || "info"),
      domain: redactText(item.domain || "", 80),
      feature: redactText(item.feature || "", 120),
      event: redactText(item.event || "", 120),
      message: redactText(item.message || ""),
    };
    if (item.page) out.page = safeUrl(item.page);
    if (item.url) out.url = safeUrl(item.url);
    if (item.method) out.method = redactText(item.method, 16).toUpperCase();
    if (item.status !== undefined) out.status = num(item.status);
    if (item.durationMs !== undefined) out.durationMs = Math.max(0, Math.round(num(item.durationMs)));
    if (item.error) out.error = cleanError(item.error);
    if (item.meta && typeof item.meta === "object" && Object.keys(item.meta).length) {
      out.meta = trimMeta(item.meta);
    }
    return out;
  }

  function browserInfo(ua) {
    const text = redactText(ua || root.navigator?.userAgent || "", 400);
    const rules = [
      ["Edge", /Edg\/([\d.]+)/],
      ["Chrome", /Chrome\/([\d.]+)/],
      ["Firefox", /Firefox\/([\d.]+)/],
      ["Safari", /Version\/([\d.]+).*Safari/],
    ];
    for (const [name, pattern] of rules) {
      const match = text.match(pattern);
      if (match) {
        return { name, version: match[1], userAgent: text };
      }
    }
    return { name: "Unknown", version: "", userAgent: text };
  }

  function cleanEnv(env = {}) {
    const page = env.page || {};
    const display = env.display || {};
    const device = env.device || {};
    const memory = env.memory || {};
    return {
      browser: browserInfo(env.browser?.userAgent || root.navigator?.userAgent || ""),
      page: {
        title: clip(page.title || "", 240),
        url: safeUrl(page.url || ""),
      },
      display: {
        screenWidth: Math.max(0, Math.round(num(display.screenWidth))),
        screenHeight: Math.max(0, Math.round(num(display.screenHeight))),
        availWidth: Math.max(0, Math.round(num(display.availWidth))),
        availHeight: Math.max(0, Math.round(num(display.availHeight))),
        devicePixelRatio: Number.isFinite(Number(display.devicePixelRatio))
          ? Number(display.devicePixelRatio)
          : 1,
      },
      device: {
        platform: redactText(device.platform || "", 80),
        language: redactText(device.language || "", 40),
        languages: Array.isArray(device.languages)
          ? device.languages.slice(0, 10).map(item => redactText(item, 40)).filter(Boolean)
          : [],
        hardwareConcurrency: Math.max(0, Math.round(num(device.hardwareConcurrency))),
        deviceMemory: Number.isFinite(Number(device.deviceMemory))
          ? Number(device.deviceMemory)
          : null,
      },
      memory: {
        memoryUsedMB: Number.isFinite(Number(memory.memoryUsedMB)) ? Number(memory.memoryUsedMB) : null,
        totalHeapMB: Number.isFinite(Number(memory.totalHeapMB)) ? Number(memory.totalHeapMB) : null,
      },
    };
  }

  function extensionId() {
    try {
      return chrome.runtime?.id || "";
    } catch {
      return "";
    }
  }

  function bytes(text) {
    const value = String(text || "");
    if (typeof TextEncoder === "function") {
      return new TextEncoder().encode(value).length;
    }
    return value.length * 2;
  }

  function clip(text, max = POLICY.messageMax) {
    const value = String(text ?? "").replace(/\r\n?/g, "\n");
    if (value.length <= max) {
      return value;
    }
    return `${value.slice(0, max)}...已截断`;
  }

  function redactText(text, max = POLICY.messageMax) {
    const value = String(text ?? "")
      .replace(SENSITIVE_WORD, "[已脱敏]")
      .replace(/(HTTP状态码错误:\s*\d{3})[\s\S]*/g, "$1");
    return clip(value, max);
  }

  function safeUrl(value) {
    if (!value) {
      return "";
    }
    try {
      const url = new URL(String(value));
      const next = new URL(`${url.origin}${url.pathname}`);
      for (const key of QUERY_ALLOW) {
        const values = url.searchParams.getAll(key);
        for (const item of values) {
          next.searchParams.append(key, redactText(item, 120));
        }
      }
      return next.toString();
    } catch {
      return redactText(value, 300);
    }
  }

  function sanitizeValue(value, depth = 0) {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === "string") {
      return redactText(value);
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === "boolean") {
      return value;
    }
    if (depth >= 5) {
      return "[已截断]";
    }
    if (Array.isArray(value)) {
      return value.slice(0, 30).map(item => sanitizeValue(item, depth + 1));
    }
    if (typeof value === "object") {
      const out = {};
      for (const [key, item] of Object.entries(value)) {
        if (SENSITIVE.test(key)) {
          continue;
        }
        out[key] = sanitizeValue(item, depth + 1);
      }
      return out;
    }
    return redactText(String(value));
  }

  function trimMeta(value) {
    const clean = sanitizeValue(value);
    if (bytes(JSON.stringify(clean || {})) <= POLICY.metaMax) {
      return clean;
    }
    const text = redactText(JSON.stringify(clean || {}), POLICY.metaMax);
    return { truncated: true, text };
  }

  function sanitizeSettings(value, depth = 0) {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === "string") {
      return redactText(value, 180);
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === "boolean") {
      return value;
    }
    if (depth >= 4) {
      return "[已截断]";
    }
    if (Array.isArray(value)) {
      return value.slice(0, 120).map(item => sanitizeSettings(item, depth + 1));
    }
    if (typeof value === "object") {
      const out = {};
      for (const [key, item] of Object.entries(value)) {
        if (SETTINGS_SENSITIVE.test(key)) {
          out[`has${key.slice(0, 1).toUpperCase()}${key.slice(1)}`] = !!item;
          continue;
        }
        out[redactText(key, 80)] = sanitizeSettings(item, depth + 1);
      }
      return out;
    }
    return redactText(String(value), 180);
  }

  function cleanSettings(settings = {}) {
    const clean = sanitizeSettings(settings);
    if (bytes(JSON.stringify(clean || {})) <= 64 * 1024) {
      return clean || {};
    }
    return {
      truncated: true,
      text: redactText(JSON.stringify(clean || {}), 64 * 1024),
    };
  }

  function cleanError(error) {
    if (!error) {
      return undefined;
    }
    if (typeof error === "string") {
      return { message: redactText(error) };
    }
    if (typeof error !== "object") {
      return { message: redactText(String(error)) };
    }
    const out = {};
    if (error.name) out.name = redactText(error.name, 120);
    if (error.message) out.message = redactText(error.message);
    if (error.code !== undefined) out.code = redactText(error.code, 120);
    if (error.status !== undefined || error.statusCode !== undefined) {
      out.status = Number(error.status ?? error.statusCode) || 0;
    }
    if (error.stack) {
      out.stack = String(error.stack)
        .split("\n")
        .slice(1, 4)
        .map(line => redactText(line, 220))
        .join("\n");
    }
    return Object.keys(out).length ? out : undefined;
  }

  function domainFromUrl(url) {
    try {
      const host = new URL(String(url)).hostname;
      const domain = root.STConfig?.matchers?.logDomainForHost?.(host) || "";
      if (domain && domain !== "web") return domain;
      return host || "";
    } catch {
      return "";
    }
  }

  function normalize(input = {}, sender = null) {
    const entry = input.entry && typeof input.entry === "object" ? input.entry : input;
    const ts = tsFrom(entry.ts || entry.time) || Date.now();
    const url = safeUrl(entry.url || sender?.url || sender?.tab?.url || "");
    const out = {
      time: safeIso(ts),
      ts,
      level: LEVELS.has(entry.level) ? entry.level : "info",
      domain: redactText(entry.domain || domainFromUrl(url) || "extension", 80),
      feature: redactText(entry.feature || "", 120),
      event: redactText(entry.event || "", 120),
      message: redactText(entry.message || ""),
    };
    if (entry.page) out.page = safeUrl(entry.page);
    if (url) out.url = url;
    if (entry.method) out.method = redactText(entry.method, 16).toUpperCase();
    if (entry.status !== undefined) out.status = Number(entry.status) || 0;
    if (entry.durationMs !== undefined) out.durationMs = Math.max(0, Math.round(Number(entry.durationMs) || 0));
    const error = cleanError(entry.error);
    if (error) out.error = error;
    const meta = trimMeta(entry.meta);
    if (meta && typeof meta === "object" && Object.keys(meta).length) {
      out.meta = meta;
    }
    return out;
  }

  function store() {
    if (typeof chrome === "undefined") {
      return null;
    }
    return chrome?.storage?.local || null;
  }

  function getBox() {
    const box = store();
    if (!box) {
      return Promise.reject(new Error("chrome.storage.local 不可用"));
    }
    return new Promise((resolve, reject) => {
      try {
        box.get([STORE_KEY], (rt) => {
          const error = chrome.runtime?.lastError?.message || "";
          if (error) {
            reject(new Error(error || "读取诊断日志失败"));
            return;
          }
          const value = rt?.[STORE_KEY];
          resolve(value && typeof value === "object" ? value : { logs: [] });
        });
      } catch (error) {
        reject(new Error(error?.message || "读取诊断日志失败"));
      }
    });
  }

  function getFallbackLogs() {
    const box = store();
    if (!box) {
      return Promise.reject(new Error("chrome.storage.local 不可用"));
    }
    return new Promise((resolve, reject) => {
      try {
        box.get([FALLBACK_KEY], (rt) => {
          const error = chrome.runtime?.lastError?.message || "";
          if (error) {
            reject(new Error(error || "读取诊断回退日志失败"));
            return;
          }
          const value = rt?.[FALLBACK_KEY];
          resolve(Array.isArray(value) ? value : []);
        });
      } catch (error) {
        reject(new Error(error?.message || "读取诊断回退日志失败"));
      }
    });
  }

  function putBox(box) {
    const area = store();
    if (!area) {
      return Promise.reject(new Error("chrome.storage.local 不可用"));
    }
    return new Promise((resolve, reject) => {
      try {
        area.set({ [STORE_KEY]: box }, () => {
          const error = chrome.runtime?.lastError?.message || "";
          if (error) {
            reject(new Error(error || "写入诊断日志失败"));
            return;
          }
          resolve(true);
        });
      } catch (error) {
        reject(new Error(error?.message || "写入诊断日志失败"));
      }
    });
  }

  function removeBox() {
    const area = store();
    if (!area) {
      return Promise.resolve({ ok: false, error: "chrome.storage.local 不可用" });
    }
    return new Promise((resolve) => {
      try {
        area.remove([STORE_KEY], () => {
          const error = chrome.runtime?.lastError?.message || "";
          resolve({ ok: !error, error });
        });
      } catch (error) {
        resolve({ ok: false, error: error?.message || String(error) });
      }
    });
  }

  function removeFallbackBox() {
    const area = store();
    if (!area) {
      return Promise.resolve({ ok: false, error: "chrome.storage.local 不可用" });
    }
    return new Promise((resolve) => {
      try {
        area.remove([FALLBACK_KEY], () => {
          const error = chrome.runtime?.lastError?.message || "";
          resolve({ ok: !error, error });
        });
      } catch (error) {
        resolve({ ok: false, error: error?.message || String(error) });
      }
    });
  }

  function sizeOf(logs) {
    return bytes(JSON.stringify(logs || []));
  }

  function compact(logs, limit = POLICY.targetBytes) {
    const now = Date.now();
    let fresh = (logs || [])
      .filter(item => now - (itemTs(item) || now) <= POLICY.maxAgeMs);
    if (Number.isFinite(POLICY.maxEntries) && POLICY.maxEntries > 0) {
      fresh = fresh.slice(-POLICY.maxEntries);
    }
    while (fresh.length > 1 && sizeOf(fresh) > POLICY.hardBytes) {
      fresh.shift();
    }
    while (fresh.length > 1 && sizeOf(fresh) > limit) {
      fresh.shift();
    }
    return fresh;
  }

  function mergeLogs(primary, fallback) {
    return [...(Array.isArray(primary) ? primary : []), ...(Array.isArray(fallback) ? fallback : [])]
      .sort((left, right) => itemTs(left) - itemTs(right));
  }

  function statsFrom(logs) {
    const list = Array.isArray(logs) ? logs : [];
    const counts = levelCounts(list);
    return {
      count: list.length,
      firstTime: list[0]?.time || "",
      lastTime: list[list.length - 1]?.time || "",
      sizeBytes: sizeOf(list),
      errorCount: counts.error,
      levelCounts: counts,
      policy: POLICY,
    };
  }

  function shouldStore(item) {
    if (!item || item.meta?.diagnostic === true) {
      return true;
    }
    return !(item.level === "info" && QUIET_INFO_EVENT.test(String(item.event || "")));
  }

  function enqueueStorage(job) {
    const task = storageQueue
      .catch(() => null)
      .then(job);
    storageQueue = task.catch(() => null);
    return task;
  }

  async function appendNow(input, sender = null) {
    const box = await getBox();
    const fallback = await getFallbackLogs().catch(() => []);
    const entry = normalize(input, sender);
    const merged = mergeLogs(Array.isArray(box.logs) ? box.logs : [], fallback);
    if (!shouldStore(entry)) {
      return statsFrom(compact(merged));
    }
    const logs = compact([
      ...merged,
      entry,
    ]);
    const next = {
      version: POLICY.version,
      updatedAt: Date.now(),
      logs,
      stats: statsFrom(logs),
    };
    await putBox(next);
    if (fallback.length) {
      const cleared = await removeFallbackBox();
      if (!cleared.ok) {
        throw new Error(cleared.error || "清理诊断回退日志失败");
      }
    }
    return next.stats;
  }

  function append(input, sender = null) {
    return enqueueStorage(() => appendNow(input, sender));
  }

  async function statsNow() {
    const box = await getBox();
    const fallback = await getFallbackLogs().catch(() => []);
    const logs = compact(mergeLogs(Array.isArray(box.logs) ? box.logs : [], fallback));
    if (logs.length !== box.logs?.length || fallback.length) {
      await putBox({ version: POLICY.version, updatedAt: Date.now(), logs, stats: statsFrom(logs) });
      if (fallback.length) {
        const cleared = await removeFallbackBox();
        if (!cleared.ok) {
          throw new Error(cleared.error || "清理诊断回退日志失败");
        }
      }
    }
    return statsFrom(logs);
  }

  function stats() {
    return enqueueStorage(statsNow);
  }

  function version() {
    try {
      return chrome.runtime.getManifest().version || "";
    } catch {
      return "";
    }
  }

  function filename(now = new Date()) {
    const stamp = bjStamp(now instanceof Date ? now.getTime() : now);
    return `steam-buff-log-v${version() || "unknown"}-${stamp}.json`;
  }

  function summaryFromLogs(logs) {
    const counts = levelCounts(logs);
    return {
      count: Array.isArray(logs) ? logs.length : 0,
      sizeBytes: sizeOf(logs),
      firstTime: logs?.length ? bjTime(itemTs(logs[0])) : "",
      lastTime: logs?.length ? bjTime(itemTs(logs[logs.length - 1])) : "",
      levelCounts: counts,
    };
  }

  async function exportLogsNow(input = {}, sender = null) {
    const box = await getBox();
    const fallback = await getFallbackLogs().catch(() => []);
    const logs = compact(mergeLogs(Array.isArray(box.logs) ? box.logs : [], fallback));
    const exportTs = Date.now();
    const envInput = input?.env && typeof input.env === "object" ? input.env : {};
    if (!envInput.page?.url && sender?.tab?.url) {
      envInput.page = { ...(envInput.page || {}), url: sender.tab.url };
    }
    const exportedLogs = logs.map(pickLog).filter(Boolean);
    const payload = {
      app: "Steam Buff",
      version: version(),
      extensionId: extensionId(),
      exportedAt: bjTime(exportTs),
      exportTs,
      env: cleanEnv(envInput),
      settings: cleanSettings(input?.settings && typeof input.settings === "object" ? input.settings : {}),
      summary: summaryFromLogs(logs),
      logs: exportedLogs,
    };
    if (fallback.length) {
      await putBox({ version: POLICY.version, updatedAt: exportTs, logs, stats: statsFrom(logs) });
      const cleared = await removeFallbackBox();
      if (!cleared.ok) {
        throw new Error(cleared.error || "清理诊断回退日志失败");
      }
    }
    return {
      filename: filename(exportTs),
      data: JSON.stringify(payload, null, 2),
      stats: statsFrom(logs),
    };
  }

  function exportLogs(input = {}, sender = null) {
    return enqueueStorage(() => exportLogsNow(input, sender));
  }

  async function clearNow() {
    const result = await removeBox();
    const fallback = await removeFallbackBox();
    if (!result.ok || !fallback.ok) {
      throw new Error(result.error || fallback.error || "清空诊断日志失败");
    }
    return statsFrom([]);
  }

  function clear() {
    return enqueueStorage(clearNow);
  }

  root.STBackgroundLogger = Object.freeze({
    ready: true,
    policy: POLICY,
    safeLogUrl: safeUrl,
    normalize,
    append,
    exportLogs,
    clear,
    stats,
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
