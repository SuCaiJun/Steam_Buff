/*
 * @Author        : 顾青离
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
  const MEMBERSHIP_KEY = globalThis.STSettingsMembership?.KEY || "steam_buff_membership";
  const REFRESHABLE_FEATURES = Object.freeze([
    {
      id: "wishlist-price-history",
      module: "wishlistPriceHistory",
      start(api) {
        return api.features.wishlistPriceHistory?.start?.();
      },
      stop(api) {
        return api.features.wishlistPriceHistory?.stop?.();
      },
    },
    {
      id: "store-title-custom-name",
      module: "titleCustomName",
      start(api) {
        return api.features.titleCustomName?.start?.();
      },
      stop(api) {
        return api.features.titleCustomName?.stop?.();
      },
    },
    {
      id: "game-notes",
      module: "gameNotes",
      start(api) {
        return api.features.gameNotes?.start?.();
      },
      stop(api) {
        return api.features.gameNotes?.stop?.();
      },
    },
  ]);

  let settings = {};
  let membership = { active: false, features: {} };
  let watchingSettings = false;

  function log(level, event, message, meta = {}) {
    try {
      const entry = {
        domain: "store",
        feature: "settings-gate",
        event,
        message,
        meta,
      };
      if (level === "error") {
        globalThis.STLogger?.error?.(entry);
      } else if (level === "warn") {
        globalThis.STLogger?.warn?.(entry);
      } else {
        globalThis.STLogger?.info?.(entry);
      }
    } catch {
    }
  }

  // 商店页运行时复用设置页同一套依赖规则，避免子功能在父开关关闭时仍被单独启动。
  async function load() {
    try {
      const storage = globalThis.STSettings?.storage || {};
      const [nextSettings, nextMembership] = await Promise.all([
        storage.getAll?.(),
        storage.getMembership?.(),
      ]);
      settings = nextSettings || {};
      membership = nextMembership || { active: false, features: {} };
      globalThis.STPageContext?.setSettingsSnapshot?.(settings);
    } catch {
      settings = {};
      membership = { active: false, features: {} };
      globalThis.STPageContext?.setSettingsSnapshot?.(settings);
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
      || (key.startsWith(SETTINGS_PREFIX) && (key.endsWith(SETTINGS_SUFFIX) || key.startsWith(SEARCH_SUGGESTION_PREFIX)))
    ));
  }

  function refreshFeature(feature, meta) {
    const mod = api.features?.[feature.module];
    if (!mod) {
      return { id: feature.id, status: "missing" };
    }
    if (on(feature.id)) {
      const result = feature.start(api);
      return { id: feature.id, status: result === false ? "skipped" : "started" };
    }
    feature.stop(api);
    return { id: feature.id, status: "stopped" };
  }

  function refreshFeatureLifecycles(meta) {
    const results = [];
    for (const feature of REFRESHABLE_FEATURES) {
      try {
        results.push(refreshFeature(feature, meta));
      } catch (error) {
        results.push({ id: feature.id, status: "failed", error: error?.message || String(error) });
        log("error", "settings-refresh-feature-failed", "商店页功能生命周期刷新失败", {
          ...meta,
          feature: feature.id,
          error: error?.message || String(error),
        });
      }
    }
    return results;
  }

  function refreshActiveFeatureSet(reason = "settings") {
    const startedAt = Date.now();
    const context = globalThis.STPageContext?.snapshot?.() || {};
    const meta = { reason, path: context.path || location.pathname, pageType: context.pageType || "" };
    log("info", "settings-refresh-start", "商店页设置快照刷新开始", meta);
    try {
      const gate = globalThis.STPageContext?.canRunFeature?.({
        domain: "store",
        id: "store-enhancements",
        settingsKey: "store-enhancements",
        settingsSnapshot: settings,
        settingOn: on,
      }) || { allowed: true, reason: "" };
      const runtime = globalThis.STRuntime?.current?.();
      runtime?.markFeature?.({
        domain: "store",
        id: "store-enhancements",
        status: gate.allowed ? "started" : "disabled",
        reason: gate.reason || "",
        meta,
      });
      const refreshed = refreshFeatureLifecycles(meta);
      log("info", "settings-refresh-success", "商店页设置快照刷新完成", {
        ...meta,
        active: gate.allowed === true,
        skippedReason: gate.reason || "",
        refreshed,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      log("error", "settings-refresh-failed", "商店页设置快照刷新失败", {
        ...meta,
        durationMs: Date.now() - startedAt,
        error: error?.message || String(error),
      });
    }
  }

  function watch() {
    if (watchingSettings) return;
    watchingSettings = true;
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (!settingsChanged(changes, area)) return;
        load().then(() => {
          refreshActiveFeatureSet("settings");
        }).catch(() => {});
      });
    } catch {
    }
  }

  api.settings = Object.freeze({
    on,
    all() {
      return { ...settings };
    },
  });

  api.settingsGate = Object.freeze({
    load,
    watch,
    refresh: refreshActiveFeatureSet,
  });
})();
