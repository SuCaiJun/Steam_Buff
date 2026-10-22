/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页设置门禁
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const SETTINGS_PREFIX = "st.settings.";
  const SETTINGS_SUFFIX = ".enabled";
  const SEARCH_SUGGESTION_PREFIX = `${SETTINGS_PREFIX}searchSuggestions.`;
  const FAMILY_LIBRARY_PREFIX = `${SETTINGS_PREFIX}familyLibrary.`;
  const MEMBERSHIP_KEY = globalThis.STSettingsMembership?.KEY || "steam_buff_membership";


  let settings = {};
  let membership = { active: false, features: {} };
  let watchingSettings = false;
  let refreshQueue = Promise.resolve();
  const logger = globalThis.STLoggerFactory?.createLogger?.("store", "settings-gate");


  function log(level, event, message, meta = {}) {
    try {
      const fn = logger?.[level] || logger?.info;
      fn?.(event, message, meta);
    } catch {
    }
  }

  async function load() {
    const startedAt = Date.now();
    try {
      const storage = globalThis.STSettings?.storage || {};
      const [nextSettings, nextMembership] = await Promise.all([
        storage.getAll?.(),
        storage.getMembership?.(),
      ]);
      settings = nextSettings || {};
      membership = nextMembership || { active: false, features: {} };
      globalThis.STPageContext?.setSettingsSnapshot?.(settings);
      log("info", "settings-load-success", "商店页设置快照加载完成", {
        count: Object.keys(settings).length,
        membershipActive: membership.active === true,
        durationMs: Date.now() - startedAt,
        path: location.pathname,
      });
    } catch (error) {
      settings = {};
      membership = { active: false, features: {} };
      globalThis.STPageContext?.setSettingsSnapshot?.(settings);
      log("warn", "settings-load-failed", "商店页设置快照加载失败，已使用默认配置", {
        durationMs: Date.now() - startedAt,
        path: location.pathname,
        error,
      });
    }
  }

  function on(id) {
    const item = globalThis.STSettings?.catalog?.featureById?.(id);
    if (item?.disabled === true) {
      return false;
    }
    if (settings[id] === false) {
      return false;
    }
    if (globalThis.STSettingsMembership?.canUse?.(item, membership) === false) {
      return false;
    }
    if (!item) {
      return true;
    }
    const dep = globalThis.STSettings?.catalog?.dependency?.(item) || { mode: "all", ids: [] };
    if (!dep.ids.length) return true;
    return dep.mode === "any"
      ? dep.ids.some(depId => on(depId))
      : dep.ids.every(depId => on(depId));
  }

  function settingsChanged(changes, area) {
    if (area !== "local") return false;
    return Object.keys(changes || {}).some(key => (
      key === (globalThis.STSettings?.storage?.MEMBERSHIP_KEY || MEMBERSHIP_KEY)
      || globalThis.STSettingsMembership?.isChange?.(changes, area)
      || (key.startsWith(SETTINGS_PREFIX)
        && (key.endsWith(SETTINGS_SUFFIX) || key.endsWith(".value") || key.startsWith(SEARCH_SUGGESTION_PREFIX) || key.startsWith(FAMILY_LIBRARY_PREFIX)))
    ));
  }

  function membershipStorageKey() {
    return globalThis.STSettings?.storage?.MEMBERSHIP_KEY || MEMBERSHIP_KEY;
  }

  function settingIdFromKey(key) {
    if (!key.startsWith(SETTINGS_PREFIX)) return "";
    if (key.endsWith(SETTINGS_SUFFIX)) {
      return key.slice(SETTINGS_PREFIX.length, -SETTINGS_SUFFIX.length);
    }
    if (key.endsWith(".value")) {
      return key.slice(SETTINGS_PREFIX.length, -".value".length);
    }
    return "";
  }


  /** 设置层只定位受影响 ID，启停方法和实例状态统一归注册器所有。 */
  function planChange(keys) {
    const ids = new Set();
    const restart = new Set();
    const current = api.reg.pageIds();
    for (const id of api.reg.state.active.keys()) current.add(id);
    let shouldLoad = false;
    for (const key of keys) {
      if (key === membershipStorageKey()) {
        shouldLoad = true;
        for (const id of current) ids.add(id);
        continue;
      }
      if (key.startsWith(FAMILY_LIBRARY_PREFIX)) {
        shouldLoad = true;
        continue;
      }
      if (key.startsWith(SEARCH_SUGGESTION_PREFIX)) continue;
      const settingId = settingIdFromKey(key);
      if (!settingId) continue;
      const targets = api.reg.settingIds(settingId);
      for (const id of targets) {
        if (!current.has(id)) continue;
        ids.add(id);
        if (api.reg.state.definitions.get(id).settingsIds?.includes(settingId)) restart.add(id);
      }
      if (ids.size) shouldLoad = true;
    }
    return { load: shouldLoad, ids, restart };
  }

  /** 保留 refresh 入口，具体生命周期只执行注册器中的唯一实现。 */
  function refreshActiveFeatureSet(reason = "settings", change = {}) {
    const startedAt = Date.now();
    const meta = { reason, path: location.pathname, pageType: globalThis.STPageContext.storePageType() };
    log("info", "settings-refresh-start", "商店页设置快照刷新开始", meta);
    return api.reg.refresh(reason, change).then(refreshed => {
      const allowed = api.settings.on("store-enhancements");
      globalThis.STRuntime?.current?.()?.markFeature?.({
        domain: "store", id: "store-enhancements",
        status: allowed ? "started" : "disabled", meta,
      });
      log("info", "settings-refresh-success", "商店页设置快照刷新完成", {
        ...meta, active: allowed, refreshed, durationMs: Date.now() - startedAt,
      });
      return refreshed;
    }).catch(error => {
      logger.error("settings-refresh-failed", "商店页设置快照刷新失败", { ...meta, error });
      return [];
    });
  }

  /** 一次读取可能包含后续事件的设置；比较整份快照的实际变化，避免漏掉并发变更。 */
  function applySettingsChange(keys, reason) {
    refreshQueue = refreshQueue.then(async () => {
      if (!planChange(keys).load) return;
      const previous = settings;
      await load();
      const actualKeys = new Set(keys);
      for (const id of new Set([...Object.keys(previous), ...Object.keys(settings)])) {
        if (previous[id] !== settings[id]) actualKeys.add(SETTINGS_PREFIX + id + SETTINGS_SUFFIX);
      }
      const plan = planChange(actualKeys);
      const current = api.reg.pageIds();
      for (const id of api.reg.state.dirty) {
        if (current.has(id)) plan.ids.add(id);
      }
      if (plan.ids.size) await refreshActiveFeatureSet(reason, plan);
    }).catch(error => {
      log("error", "settings-refresh-failed", "商店页设置快照刷新失败", {
        reason, path: location.pathname, error,
      });
    });
  }


  function watch() {
    if (watchingSettings) return;
    watchingSettings = true;
    try {
      if (globalThis.STSettingsBus?.subscribe) {
        globalThis.STSettingsBus.subscribe((event) => {
          const changes = {};
          for (const key of event.changedKeys || []) {
            changes[key] = true;
          }
          if (!settingsChanged(changes, "local")) return;
          applySettingsChange(event.changedKeys || [], event.reason || "settings");
        }, {
          owner: "store:settings-gate",
          key: "settings-watch",
          prefixes: [SETTINGS_PREFIX, SEARCH_SUGGESTION_PREFIX, FAMILY_LIBRARY_PREFIX],
          keys: [membershipStorageKey()],
        });
        log("info", "settings-watch-start", "商店页设置变化监听已启动", {
          transport: "settings-bus",
          path: location.pathname,
        });
        return;
      }
      chrome.storage.onChanged.addListener((changes, area) => {
        if (!settingsChanged(changes, area)) return;
        applySettingsChange(Object.keys(changes || {}), "settings");
      });
      log("info", "settings-watch-start", "商店页设置变化监听已启动", {
        transport: "chrome-storage",
        path: location.pathname,
      });
    } catch (error) {
      watchingSettings = false;
      log("warn", "settings-watch-failed", "商店页设置变化监听启动失败", {
        path: location.pathname,
        error,
      });
    }
  }


  api.settings = Object.freeze({
    on,
    all() { return { ...settings }; },
    membership() { return membership; },
  });
  api.settingsGate = Object.freeze({ load, watch, refresh: refreshActiveFeatureSet });
})();
