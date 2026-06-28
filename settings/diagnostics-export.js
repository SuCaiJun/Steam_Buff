/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置页诊断包 ZIP 构建
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  if (root.STSettingsDiagnosticsExport?.ready) {
    return;
  }

  const APP = "Steam Buff";
  const SCHEMA_VERSION = 1;
  const ZIP_LEVEL = 6;
  const QUERY_ALLOW = Object.freeze(new Set(["appid", "appids", "subid", "bundleid", "id", "cc"]));
  const SENSITIVE_KEY = /(?:authorization|cookie|set-cookie|access[_-]?token|refresh[_-]?token|token|sessionid|password|secret|headers?|body)/i;
  const SENSITIVE_TEXT = /(authorization|cookie|set-cookie|access_token|refresh_token|token|sessionid|password|bearer)\s*[:=]?\s*[^,\s;]*/gi;
  const BJ_OFFSET_MS = 8 * 60 * 60 * 1000;

  function num(value) {
    const next = Number(value);
    return Number.isFinite(next) ? next : 0;
  }

  function pad(value, size = 2) {
    return String(Math.max(0, Number(value) || 0)).padStart(size, "0");
  }

  function bjTime(ts = Date.now()) {
    const date = new Date(Number(ts) + BJ_OFFSET_MS);
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)} +08:00`;
  }

  function clip(text, max = 240) {
    const value = String(text ?? "").replace(/\r\n?/g, "\n");
    return value.length <= max ? value : `${value.slice(0, max)}...[已截断]`;
  }

  function redactText(text, max = 300) {
    return clip(String(text ?? "").replace(SENSITIVE_TEXT, "$1 [REDACTED]"), max);
  }

  function safeUrl(value) {
    if (!value) {
      return "";
    }
    try {
      const url = new URL(String(value));
      const out = new URL(`${url.origin}${url.pathname}`);
      for (const key of QUERY_ALLOW) {
        for (const item of url.searchParams.getAll(key)) {
          out.searchParams.append(key, redactText(item, 120));
        }
      }
      return out.toString();
    } catch {
      return redactText(value, 300);
    }
  }

  function manifest() {
    try {
      return chrome.runtime.getManifest() || {};
    } catch {
      return {};
    }
  }

  function extensionId() {
    try {
      return chrome.runtime?.id || "";
    } catch {
      return "";
    }
  }

  function extensionInfo() {
    const data = manifest();
    return {
      id: extensionId(),
      name: String(data.name || APP),
      version: String(data.version || ""),
      manifestVersion: Number(data.manifest_version) || null,
      defaultLocale: String(data.default_locale || ""),
    };
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

  function storage() {
    return root.STSettings?.storage || {};
  }

  function catalog() {
    return root.STSettings?.catalog || {};
  }

  function obj(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function cleanText(value, max = 120) {
    return redactText(value, max);
  }

  function isSensitiveKey(key) {
    return SENSITIVE_KEY.test(String(key || ""));
  }

  function compactConfig(values = {}, keys = []) {
    const src = obj(values);
    const out = {};
    for (const key of keys) {
      if (isSensitiveKey(key)) {
        continue;
      }
      const value = src[key];
      if (typeof value === "boolean") {
        out[key] = value;
      } else if (typeof value === "number") {
        out[key] = Number.isFinite(value) ? value : null;
      } else if (value !== undefined && value !== null) {
        out[key] = cleanText(value);
      }
    }
    return out;
  }

  function featureSnapshot(states = {}) {
    const cat = catalog();
    const state = obj(states);
    const list = [];
    for (const group of cat.list?.() || []) {
      for (const item of group.items || []) {
        if (!item?.id) {
          continue;
        }
        list.push({
          id: String(item.id),
          name: cleanText(item.name || item.id),
          category: cleanText(group.name || group.id || ""),
          area: cleanText(item.area || ""),
          enabled: state[item.id] !== false,
        });
      }
    }
    return list;
  }

  function readSettings(name) {
    const store = storage();
    const job = store[name];
    try {
      return typeof job === "function" ? Promise.resolve(job.call(store)).catch(() => ({})) : Promise.resolve({});
    } catch {
      return Promise.resolve({});
    }
  }

  async function settingsSnapshot() {
    const [features, translate, ai, reviewFilter, searchSuggestions, see, membership] = await Promise.all([
      readSettings("getAll"),
      readSettings("getTranslate"),
      readSettings("getAi"),
      readSettings("getReviewFilter"),
      readSettings("getSearchSuggestions"),
      readSettings("getSee"),
      readSettings("getMembership"),
    ]);
    return {
      features: featureSnapshot(features),
      translate: compactConfig(translate, [
        "scope",
        "page",
        "selection",
        "selectionTrigger",
        "selectionService",
        "local",
        "to",
        "service",
        "force",
      ]),
      ai: {
        enabled: ai?.enabled === true,
        host: ai?.host ? safeUrl(ai.host) : "",
        model: ai?.model ? cleanText(ai.model) : "",
        keyMode: ai?.keyMode ? cleanText(ai.keyMode, 40) : "",
        aiConcurrency: num(ai?.aiConcurrency) || 0,
        hasKey: !!ai?.key,
        hasKeyName: !!ai?.keyName,
      },
      reviewFilter: {
        ruleCount: Array.isArray(reviewFilter?.rules) ? reviewFilter.rules.length : 0,
      },
      searchSuggestions: compactConfig(searchSuggestions, ["limit", "nativeMode"]),
      see: compactConfig(see, Object.keys(obj(see)).slice(0, 20)),
      membership: membership ? {
        active: membership.active === true,
        level: cleanText(membership.level || "", 40),
        badge: cleanText(membership.badge || "", 80),
        expire: cleanText(membership.expire || "", 80),
        featureCount: Object.keys(obj(membership.features)).length,
      } : null,
    };
  }

  async function configSnapshot(exportTs) {
    return {
      schemaVersion: SCHEMA_VERSION,
      app: APP,
      generatedAt: bjTime(exportTs),
      generatedTs: exportTs,
      extension: extensionInfo(),
      settings: await settingsSnapshot(),
    };
  }

  function envSnapshot(exportTs) {
    const nav = root.navigator || {};
    const scr = root.screen || {};
    const perfMem = root.performance?.memory || {};
    return {
      schemaVersion: SCHEMA_VERSION,
      capturedAt: bjTime(exportTs),
      capturedTs: exportTs,
      browser: browserInfo(nav.userAgent || ""),
      page: {
        title: redactText(root.document?.title || "", 240),
        url: safeUrl(root.location?.href || ""),
      },
      display: {
        screenWidth: Math.max(0, Math.round(num(scr.width))),
        screenHeight: Math.max(0, Math.round(num(scr.height))),
        availWidth: Math.max(0, Math.round(num(scr.availWidth))),
        availHeight: Math.max(0, Math.round(num(scr.availHeight))),
        devicePixelRatio: Number.isFinite(Number(root.devicePixelRatio)) ? Number(root.devicePixelRatio) : 1,
      },
      device: {
        platform: redactText(nav.platform || "", 80),
        language: redactText(nav.language || "", 40),
        languages: Array.isArray(nav.languages)
          ? nav.languages.slice(0, 10).map(item => redactText(item, 40)).filter(Boolean)
          : [],
        hardwareConcurrency: Math.max(0, Math.round(num(nav.hardwareConcurrency))),
        deviceMemory: Number.isFinite(Number(nav.deviceMemory)) ? Number(nav.deviceMemory) : null,
      },
      memory: {
        memoryUsedMB: Number.isFinite(Number(perfMem.usedJSHeapSize))
          ? Math.round((Number(perfMem.usedJSHeapSize) / 1024 / 1024) * 100) / 100
          : null,
        totalHeapMB: Number.isFinite(Number(perfMem.totalJSHeapSize))
          ? Math.round((Number(perfMem.totalJSHeapSize) / 1024 / 1024) * 100) / 100
          : null,
      },
    };
  }

  function levelCounts(input = {}) {
    return {
      debug: Number(input.debug) || 0,
      info: Number(input.info) || 0,
      warn: Number(input.warn) || 0,
      error: Number(input.error) || 0,
      fatal: Number(input.fatal) || 0,
      network: Number(input.network) || 0,
    };
  }

  function retentionPolicy(summary = {}) {
    const src = summary.retentionPolicy || summary.policy || {};
    return {
      version: Number(src.version) || 0,
      maxEntries: Number.isFinite(Number(src.maxEntries)) ? Number(src.maxEntries) : null,
      targetBytes: Number(src.targetBytes) || 0,
      hardBytes: Number(src.hardBytes) || 0,
      maxAgeMs: Number(src.maxAgeMs) || 0,
    };
  }

  function summarySnapshot(logExport = {}, exportTs) {
    const src = logExport.summary || logExport.stats || {};
    return {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: src.exportedAt || bjTime(exportTs),
      exportTs,
      format: "zip",
      files: ["logs.jsonl", "config.json", "env.json", "summary.json"],
      logs: {
        count: Number(src.count) || 0,
        sizeBytes: Number(src.sizeBytes) || 0,
        firstTime: String(src.firstTime || ""),
        lastTime: String(src.lastTime || ""),
        errorCount: Number(src.errorCount) || 0,
        levelCounts: levelCounts(src.levelCounts),
      },
      retentionPolicy: retentionPolicy(src),
    };
  }

  function jsonText(value) {
    return `${JSON.stringify(value, null, 2)}\n`;
  }

  function encode(text) {
    const zip = root.fflate || {};
    if (typeof zip.strToU8 === "function") {
      return zip.strToU8(String(text || ""));
    }
    if (typeof TextEncoder === "function") {
      return new TextEncoder().encode(String(text || ""));
    }
    throw new Error("当前环境不支持 UTF-8 编码");
  }

  function zipFiles(files) {
    const zip = root.fflate || {};
    if (typeof zip.zipSync !== "function") {
      throw new Error("诊断包压缩库未加载");
    }
    const input = {};
    for (const [name, text] of Object.entries(files)) {
      input[name] = encode(text);
    }
    return zip.zipSync(input, { level: ZIP_LEVEL });
  }

  async function build(logExport = {}) {
    const exportTs = Number(logExport.summary?.exportTs || logExport.stats?.exportTs) || Date.now();
    const config = await configSnapshot(exportTs);
    const env = envSnapshot(exportTs);
    const summary = summarySnapshot(logExport, exportTs);
    const files = {
      "logs.jsonl": String(logExport.logsJsonl || ""),
      "config.json": jsonText(config),
      "env.json": jsonText(env),
      "summary.json": jsonText(summary),
    };
    const bytes = zipFiles(files);
    return {
      filename: String(logExport.filename || `${logExport.filenameBase || "steam-buff-diagnostics"}.zip`),
      blob: new Blob([bytes], { type: "application/zip" }),
      files: Object.keys(files),
      config,
      env,
      summary,
    };
  }

  root.STSettingsDiagnosticsExport = Object.freeze({
    ready: true,
    build,
    settingsSnapshot,
    envSnapshot,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
