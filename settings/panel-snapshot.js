/*
 * @Author : 顾青离
 * @Url : sucaijun.com
 * @Email : Ricky@LiHai.La
 * @Project : Steam Buff
 * @Description : Steam 客户端增强小工具
 * @File : 设置中心面板快照归一与读写
 * @Read me : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind : 二次开发请保留原版权信息，谢谢。
 */

/*
 * 备份 JSON 与云同步共用这一份面板快照。不含云同步通道、浮窗位置、登录会员、日志缓存。
 * 新增功能开关走 catalog.featureItems().enabled；新增业务面板时要补 PANEL_SECTIONS、defaults 和 storage 读写。
 */
((root) => {
  "use strict";

  const settings = root.STSettings = root.STSettings || {};
  if (settings.panelSnapshot?.ready) {
    return;
  }

  const LOCALES = Object.freeze(["zh_CN", "en", "zh_TW", "ja", "ko"]);

  function catalog() {
    return settings.catalog || {};
  }

  function storage() {
    return settings.storage || {};
  }

  function sections() {
    return catalog().panelSections || [];
  }

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value ?? null));
    } catch {
      return null;
    }
  }

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function localeOf(value) {
    if (typeof root.STI18n?.normalizeLocale === "function") {
      return root.STI18n.normalizeLocale(value);
    }
    const raw = String(value || "").trim().replace("-", "_");
    if (LOCALES.includes(raw)) {
      return raw;
    }
    const lower = raw.toLowerCase();
    if (lower === "zh_tw") {
      return "zh_TW";
    }
    if (lower === "en" || lower.startsWith("en_")) {
      return "en";
    }
    if (lower === "ja" || lower.startsWith("ja_")) {
      return "ja";
    }
    if (lower === "ko" || lower.startsWith("ko_")) {
      return "ko";
    }
    return "zh_CN";
  }

  function sectionDefaults(name) {
    return catalog().panelSectionDefaults?.(name) ?? (name === "uiLocale" ? "zh_CN" : {});
  }

  // lineColors 的默认值是空对象，合法键来自价格目录。不能按空对象丢弃，也不能收下目录外的键
  function copyLineColors(value, stats, present) {
    const source = isPlainObject(value) ? value : {};
    const normalizeChart = storage().normalizeStorePriceChart;
    const normalized = typeof normalizeChart === "function"
      ? normalizeChart({ lineColors: source })
      : {};
    const kept = isPlainObject(normalized?.lineColors) ? clone(normalized.lineColors) : {};
    const colors = kept || {};
    if (!stats || present !== true) {
      return colors;
    }
    if (!isPlainObject(value)) {
      stats.skipped += 1;
      return {};
    }
    const srcCount = Object.keys(source).length;
    const keptCount = Object.keys(colors).length;
    stats.imported += keptCount;
    stats.skipped += srcCount - keptCount;
    return colors;
  }

  function copyKnown(src, defs, stats) {
    const out = {};
    const source = isPlainObject(src) ? src : {};
    const defaults = isPlainObject(defs) ? defs : {};
    const known = new Set(Object.keys(defaults));
    for (const key of Object.keys(defaults)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        continue;
      }
      if (key === "lineColors") {
        out[key] = copyLineColors(Object.hasOwn(source, key) ? source[key] : {}, stats, Object.hasOwn(source, key));
        continue;
      }
      if (Object.hasOwn(source, key)) {
        const value = source[key];
        if (isPlainObject(defaults[key]) && isPlainObject(value)) {
          out[key] = copyKnown(value, defaults[key], stats);
        } else {
          out[key] = clone(value);
          if (stats) {
            stats.imported += 1;
          }
        }
      } else if (isPlainObject(defaults[key])) {
        out[key] = copyKnown({}, defaults[key], stats);
      } else {
        out[key] = clone(defaults[key]);
        if (stats) {
          stats.defaulted += 1;
        }
      }
    }
    if (stats) {
      for (const key of Object.keys(source)) {
        if (!known.has(key)) {
          stats.skipped += 1;
        }
      }
    }
    return out;
  }

  function emptyStats() {
    return {
      imported: 0,
      skipped: 0,
      defaulted: 0,
    };
  }

  function normalize(settingsValue, stats) {
    const src = isPlainObject(settingsValue) ? settingsValue : {};
    const out = {};
    const box = stats || emptyStats();
    for (const name of sections()) {
      if (name === "uiLocale") {
        if (Object.hasOwn(src, "uiLocale")) {
          out.uiLocale = localeOf(src.uiLocale);
          box.imported += 1;
        } else {
          out.uiLocale = localeOf();
          box.defaulted += 1;
        }
        continue;
      }
      out[name] = copyKnown(src[name], sectionDefaults(name), box);
    }
    for (const name of Object.keys(src)) {
      if (!sections().includes(name)) {
        const extra = src[name];
        box.skipped += isPlainObject(extra) ? (Object.keys(extra).length || 1) : 1;
      }
    }
    return stats ? { settings: out, stats: box } : out;
  }

  function defaultsPack() {
    const out = {};
    for (const name of sections()) {
      out[name] = name === "uiLocale" ? "zh_CN" : clone(sectionDefaults(name));
    }
    return out;
  }

  async function pack() {
    const store = storage();
    if (typeof store.getPanelSettings !== "function") {
      throw new Error("设置面板读取接口不可用");
    }
    return normalize(await store.getPanelSettings());
  }

  async function write(settingsValue, diagnostics = {}) {
    const store = storage();
    if (typeof store.setPanelSettings !== "function") {
      return false;
    }
    return store.setPanelSettings(normalize(settingsValue), diagnostics);
  }

  const api = Object.freeze({
    ready: true,
    get SECTIONS() {
      return sections();
    },
    LOCALES,
    clone,
    isPlainObject,
    copyKnown,
    localeOf,
    normalize,
    defaultsPack,
    pack,
    write,
  });

  settings.panelSnapshot = api;
  root.STSettingsPanelSnapshot = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
