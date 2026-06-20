/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 共享多语言运行时
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  if (root.STI18n) {
    return;
  }

  const STORAGE_KEY = "SETTING_UI_LOCALE";
  const DATASET_KEY = "steamBuffUiLocale";
  const CHANGE_EVENT = "SteamBuffI18nLocaleChanged";
  const DEFAULT_LOCALE = "zh_CN";
  const SUPPORTED = Object.freeze(["zh_CN", "en", "zh_TW"]);
  const log = root.STLoggerFactory?.createLogger?.("shared", "i18n") || {
    info() {},
    warn() {},
  };
  const FALLBACK_LABELS = Object.freeze({
    zh_CN: "简体中文",
    en: "English",
    zh_TW: "繁體中文",
  });
  const messages = {};
  const loading = new Map();
  let current = DEFAULT_LOCALE;

  function safeError(error) {
    return String(error?.message || error || "").slice(0, 300);
  }

  function normalizeLocale(value) {
    const raw = String(value || "").trim().replace("-", "_");
    const lower = raw.toLowerCase();
    if (lower === "zh_cn" || lower === "zh_hans" || lower === "cn") {
      return "zh_CN";
    }
    if (lower === "zh_tw" || lower === "zh_hant" || lower === "tw" || lower === "hk") {
      return "zh_TW";
    }
    if (lower === "en" || lower.startsWith("en_")) {
      return "en";
    }
    return DEFAULT_LOCALE;
  }

  function scriptBase() {
    const doc = root.document;
    const src = doc?.currentScript?.src || Array.from(doc?.scripts || [])
      .map(script => script.src || "")
      .find(src => /\/shared\/i18n\.js(?:\?|$)/.test(src)) || "";
    return src ? src.replace(/shared\/i18n\.js(?:\?.*)?$/, "") : "";
  }

  function url(path) {
    try {
      if (root.chrome?.runtime?.getURL) {
        return root.chrome.runtime.getURL(path);
      }
    } catch {
    }
    const base = scriptBase();
    return base ? `${base}${path}` : path;
  }

  function cleanMessages(data) {
    const out = {};
    const src = data && typeof data === "object" ? data : {};
    for (const [key, value] of Object.entries(src)) {
      if (value && typeof value === "object" && typeof value.message === "string") {
        out[key] = { message: value.message };
      }
    }
    return out;
  }

  function messageKey(key) {
    return String(key || "").replace(/[^A-Za-z0-9_]/g, "_");
  }

  async function load(locale) {
    const id = normalizeLocale(locale);
    if (messages[id]) {
      return messages[id];
    }
    if (loading.has(id)) {
      return loading.get(id);
    }
    const task = Promise.resolve()
      .then(async () => {
        if (typeof root.fetch !== "function") {
          messages[id] = {};
          log.warn("i18n-locale-load-skipped", "语言包加载跳过", {
            locale: id,
            reason: "fetch-unavailable",
          });
          return messages[id];
        }
        const response = await root.fetch(url(`_locales/${id}/messages.json`));
        const data = response?.ok === false ? {} : await response.json();
        messages[id] = cleanMessages(data);
        return messages[id];
      })
      .catch((error) => {
        log.warn("i18n-locale-load-failed", "语言包加载失败", {
          locale: id,
          error: safeError(error),
        });
        messages[id] = {};
        return messages[id];
      })
      .finally(() => {
        loading.delete(id);
      });
    loading.set(id, task);
    return task;
  }

  function area() {
    try {
      return root.chrome?.storage?.local || null;
    } catch {
      return null;
    }
  }

  function get(keys) {
    const box = area();
    if (!box) {
      return Promise.resolve({});
    }
    return new Promise((resolve) => {
      try {
        box.get(keys, (rt) => {
          if (root.chrome?.runtime?.lastError) {
            log.warn("i18n-storage-read-failed", "界面语言读取失败", {
              keyCount: Array.isArray(keys) ? keys.length : Object.keys(keys || {}).length,
              error: safeError(root.chrome.runtime.lastError),
            });
            resolve({});
            return;
          }
          resolve(rt || {});
        });
      } catch (error) {
        log.warn("i18n-storage-read-failed", "界面语言读取失败", {
          keyCount: Array.isArray(keys) ? keys.length : Object.keys(keys || {}).length,
          error: safeError(error),
        });
        resolve({});
      }
    });
  }

  function put(data) {
    const box = area();
    if (!box) {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      try {
        box.set(data, () => {
          const ok = !root.chrome?.runtime?.lastError;
          if (!ok) {
            log.warn("i18n-storage-write-failed", "界面语言保存失败", {
              keyCount: Object.keys(data || {}).length,
              error: safeError(root.chrome.runtime.lastError),
            });
          }
          resolve(ok);
        });
      } catch (error) {
        log.warn("i18n-storage-write-failed", "界面语言保存失败", {
          keyCount: Object.keys(data || {}).length,
          error: safeError(error),
        });
        resolve(false);
      }
    });
  }

  function datasetLocale() {
    try {
      return normalizeLocale(root.document?.documentElement?.dataset?.[DATASET_KEY]);
    } catch {
      return DEFAULT_LOCALE;
    }
  }

  async function storedLocale() {
    const rt = await get([STORAGE_KEY]);
    if (Object.hasOwn(rt, STORAGE_KEY)) {
      return normalizeLocale(rt[STORAGE_KEY]);
    }
    return datasetLocale();
  }

  function rawMessage(locale, key) {
    const item = messages[normalizeLocale(locale)]?.[messageKey(key)];
    return typeof item?.message === "string" ? item.message : "";
  }

  function syncSnapshot() {
    if (!area()) {
      const next = datasetLocale();
      if (next !== current) {
        current = next;
        load(next).catch((error) => {
          log.warn("i18n-locale-dataset-load-failed", "界面语言数据集快照加载失败", {
            locale: next,
            error: safeError(error),
          });
        });
      }
    }
  }

  function has(key) {
    syncSnapshot();
    const id = String(key || "");
    return !!(rawMessage(current, id) || rawMessage(DEFAULT_LOCALE, id));
  }

  function paramValue(params, name) {
    if (Array.isArray(params)) {
      const idx = Number.parseInt(name, 10);
      return Number.isFinite(idx) && idx > 0 ? params[idx - 1] : "";
    }
    if (params && typeof params === "object" && Object.hasOwn(params, name)) {
      return params[name];
    }
    return "";
  }

  function format(text, params) {
    return String(text || "").replace(/\$([A-Za-z0-9_]+)\$/g, (all, name) => {
      const value = paramValue(params, name);
      return value == null ? "" : String(value);
    });
  }

  function t(key, params) {
    syncSnapshot();
    const id = String(key || "");
    const msg = rawMessage(current, id) || rawMessage(DEFAULT_LOCALE, id);
    return msg ? format(msg, params) : id;
  }

  function text(key, fallback, params) {
    const id = String(key || "");
    if (has(id)) {
      return t(id, params);
    }
    return format(fallback == null ? id : fallback, params);
  }

  function locales() {
    syncSnapshot();
    return SUPPORTED.map(id => Object.freeze({
      id,
      value: id,
      label: has(`locale.${id}`) ? t(`locale.${id}`) : FALLBACK_LABELS[id],
    }));
  }

  function locale() {
    syncSnapshot();
    return current;
  }

  function emitChange(next) {
    try {
      const el = root.document?.documentElement;
      if (el?.dataset) {
        el.dataset[DATASET_KEY] = next;
      }
      root.dispatchEvent?.(new CustomEvent(CHANGE_EVENT, { detail: { locale: next } }));
    } catch (error) {
      log.warn("i18n-locale-change-dispatch-failed", "界面语言变更事件派发失败", {
        locale: next,
        error: safeError(error),
      });
    }
  }

  async function setLocale(value) {
    const next = normalizeLocale(value);
    await Promise.all([load(DEFAULT_LOCALE), load(next)]);
    current = next;
    const ok = await put({ [STORAGE_KEY]: next });
    if (ok === false) {
      log.warn("i18n-locale-save-failed", "界面语言保存失败", {
        locale: next,
      });
    }
    emitChange(next);
    return current;
  }

  function applySnapshot(value) {
    const next = normalizeLocale(value);
    current = next;
    load(next).catch((error) => {
      log.warn("i18n-locale-snapshot-load-failed", "界面语言快照加载失败", {
        locale: next,
        error: safeError(error),
      });
    });
  }

  async function init() {
    current = await storedLocale();
    await Promise.all(SUPPORTED.map(load));
    emitChange(current);
    log.info("i18n-init-success", "多语言运行时初始化完成", {
      locale: current,
      supportedCount: SUPPORTED.length,
    });
    return current;
  }

  function watchStorage() {
    try {
      root.chrome?.storage?.onChanged?.addListener?.((changes, changedArea) => {
        if (changedArea !== "local" || !Object.hasOwn(changes || {}, STORAGE_KEY)) {
          return;
        }
        const next = normalizeLocale(changes[STORAGE_KEY]?.newValue);
        current = next;
        load(next).catch((error) => {
          log.warn("i18n-locale-storage-load-failed", "界面语言存储变更加载失败", {
            locale: next,
            error: safeError(error),
          });
        });
        emitChange(next);
      });
    } catch (error) {
      log.warn("i18n-storage-watch-bind-failed", "界面语言监听绑定失败", {
        error: safeError(error),
      });
    }
  }

  const readyTask = init();
  watchStorage();

  try {
    root.addEventListener?.(CHANGE_EVENT, (event) => {
      applySnapshot(event?.detail?.locale || datasetLocale());
    });
  } catch (error) {
    log.warn("i18n-locale-event-bind-failed", "界面语言事件监听绑定失败", {
      error: safeError(error),
    });
  }

  root.STI18n = Object.freeze({
    CHANGE_EVENT,
    DATASET_KEY,
    DEFAULT_LOCALE,
    STORAGE_KEY,
    SUPPORTED,
    has,
    load,
    locale,
    locales,
    normalizeLocale,
    ready: () => readyTask,
    setLocale,
    t,
    text,
  });

  if (typeof module === "object" && module.exports) {
    module.exports = root.STI18n;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
