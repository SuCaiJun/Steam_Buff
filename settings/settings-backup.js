/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置备份导入导出
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = globalThis.STSettings = globalThis.STSettings || {};

  if (api.backup) {
    return;
  }

  const TYPE = "steam-buff-settings";
  const SCHEMA_VERSION = 1;
  const APP = "Steam Buff";
  const SECTIONS = Object.freeze([
    "features",
    "translate",
    "ai",
    "reviewFilter",
    "searchSuggestions",
    "see",
  ]);
  const SENSITIVE = Object.freeze({
    ai: Object.freeze(["key"]),
  });

  function catalog() {
    return api.catalog || {};
  }

  function storage() {
    return api.storage || {};
  }

  function now() {
    return Date.now();
  }

  function version() {
    try {
      return chrome.runtime.getManifest().version || "";
    } catch {
      return "";
    }
  }

  function pad(num) {
    return String(num).padStart(2, "0");
  }

  function stamp(time = now()) {
    const date = new Date(time);
    if (!Number.isFinite(date.getTime())) {
      return "unknown-time";
    }
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      "-",
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds()),
    ].join("");
  }

  function filename(time = now(), prefix = "steam-buff-settings") {
    const ver = version() || "unknown";
    return `${prefix}-v${ver}-${stamp(time)}.json`;
  }

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value ?? {}));
    } catch {
      return {};
    }
  }

  function obj(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function keysOf(section) {
    const cat = catalog();
    if (section === "features") {
      return Object.keys(cat.defaults?.() || {});
    }
    if (section === "translate") {
      return Object.keys(cat.translateDefaults?.() || {});
    }
    if (section === "ai") {
      return Object.keys(cat.aiDefaults?.() || {});
    }
    if (section === "reviewFilter") {
      return Object.keys(cat.reviewFilterDefaults?.() || {});
    }
    if (section === "searchSuggestions") {
      return Object.keys(cat.searchSuggestionDefaults?.() || {});
    }
    if (section === "see") {
      return Object.keys(cat.seeDefaults?.() || {});
    }
    return [];
  }

  function defaultsOf(section) {
    const cat = catalog();
    if (section === "features") {
      return cat.defaults?.() || {};
    }
    if (section === "translate") {
      return cat.translateDefaults?.() || {};
    }
    if (section === "ai") {
      return cat.aiDefaults?.() || {};
    }
    if (section === "reviewFilter") {
      return cat.reviewFilterDefaults?.() || {};
    }
    if (section === "searchSuggestions") {
      return cat.searchSuggestionDefaults?.() || {};
    }
    if (section === "see") {
      return cat.seeDefaults?.() || {};
    }
    return {};
  }

  function stripSensitive(sections, includeSensitive) {
    const out = clone(sections);
    if (includeSensitive) {
      return out;
    }
    for (const [section, keys] of Object.entries(SENSITIVE)) {
      for (const key of keys) {
        if (out[section] && Object.hasOwn(out[section], key)) {
          delete out[section][key];
        }
      }
    }
    return out;
  }

  function hasSensitive(sections) {
    const src = obj(sections);
    return Object.entries(SENSITIVE).some(([section, keys]) => {
      const data = obj(src[section]);
      return keys.some(key => Object.hasOwn(data, key) && String(data[key] ?? "").trim() !== "");
    });
  }

  function countValues(sections) {
    return SECTIONS.reduce((sum, section) => sum + Object.keys(obj(sections?.[section])).length, 0);
  }

  function normalizeSection(section, values, stats) {
    const defs = defaultsOf(section);
    const src = obj(values);
    const out = {};
    const known = new Set(keysOf(section));

    for (const key of known) {
      if (Object.hasOwn(src, key)) {
        out[key] = clone(src[key]);
        stats.imported += 1;
      } else {
        out[key] = clone(defs[key]);
        stats.defaulted += 1;
      }
    }

    for (const key of Object.keys(src)) {
      if (!known.has(key)) {
        stats.skipped += 1;
      }
    }

    return out;
  }

  function normalizeSettings(settings) {
    const stats = {
      imported: 0,
      skipped: 0,
      defaulted: 0,
      hasSensitive: hasSensitive(settings),
    };
    const src = obj(settings);
    const out = {};

    for (const section of SECTIONS) {
      out[section] = normalizeSection(section, src[section], stats);
    }

    for (const section of Object.keys(src)) {
      if (!SECTIONS.includes(section)) {
        stats.skipped += Object.keys(obj(src[section])).length || 1;
      }
    }

    return { settings: out, stats };
  }

  function parse(input) {
    if (typeof input === "string") {
      return JSON.parse(input);
    }
    return input;
  }

  function inspectPackage(input) {
    const data = parse(input);
    if (!data || typeof data !== "object") {
      throw new Error("设置备份文件格式无效。");
    }
    if (data.type !== TYPE) {
      throw new Error("不是 Steam Buff 设置备份。");
    }
    if (Number(data.schemaVersion) !== SCHEMA_VERSION) {
      throw new Error(`暂不支持的设置备份版本：${data.schemaVersion || "未知"}`);
    }
    const normalized = normalizeSettings(data.settings || {});
    return {
      valid: true,
      package: data,
      normalized: normalized.settings,
      stats: normalized.stats,
      sections: SECTIONS.filter(section => Object.keys(obj(data.settings?.[section])).length > 0),
    };
  }

  async function currentSections() {
    return storage().getBackupSections?.() || {
      features: await storage().getAll?.() || {},
      translate: await storage().getTranslate?.() || {},
      ai: await storage().getAi?.() || {},
      reviewFilter: await storage().getReviewFilter?.() || {},
      searchSuggestions: await storage().getSearchSuggestions?.() || {},
      see: await storage().getSee?.() || {},
    };
  }

  async function exportPackage(options = {}) {
    const includeSensitive = options.includeSensitive === true;
    const exportedAt = now();
    const sections = stripSensitive(await currentSections(), includeSensitive);
    const payload = {
      type: TYPE,
      schemaVersion: SCHEMA_VERSION,
      app: APP,
      extensionVersion: version(),
      exportedAt,
      options: {
        includeSensitive,
      },
      settings: sections,
    };
    return {
      filename: filename(exportedAt),
      data: JSON.stringify(payload, null, 2),
      payload,
      stats: {
        exported: countValues(sections),
        hasSensitive: includeSensitive && hasSensitive(sections),
      },
    };
  }

  async function importPackage(input) {
    const preview = inspectPackage(input);
    const ok = await storage().setBackupSections?.(preview.normalized);
    return {
      ...preview,
      ok: ok !== false,
    };
  }

  api.backup = Object.freeze({
    TYPE,
    SCHEMA_VERSION,
    SECTIONS,
    filename,
    exportPackage,
    importPackage,
    inspectPackage,
  });

  if (typeof module === "object" && module.exports) {
    module.exports = api.backup;
  }
})();
