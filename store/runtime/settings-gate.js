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
    } catch {
      settings = {};
      membership = { active: false, features: {} };
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

  function refreshEnabledFeatures(reason = "settings") {
    const startedAt = Date.now();
    const meta = { reason, path: location.pathname };
    log("info", "settings-refresh-start", "商店页设置刷新开始", meta);
    try {
      let started = 0;
      let stopped = 0;
      if (on("search-suggestions")) {
        api.features.searchSuggestions?.start?.();
        api.features.searchSuggestions?.scan?.();
        started += 1;
      } else {
        api.features.searchSuggestions?.stop?.();
        stopped += 1;
      }
      if (on("store-title-custom-name")) {
        api.features.titleCustomName?.start?.();
        api.features.titleCustomName?.refresh?.();
        started += 1;
      } else {
        api.features.titleCustomName?.stop?.();
        stopped += 1;
      }
      if (on("game-notes")) {
        api.features.gameNotes?.start?.();
        api.features.gameNotes?.refresh?.();
        started += 1;
      } else {
        api.features.gameNotes?.stop?.();
        stopped += 1;
      }
      if (on("review-filter")) {
        api.features.reviewFilter?.start?.();
        started += 1;
      }
      if (on("wishlist-price-history")) {
        api.features.wishlistPriceHistory?.start?.();
        started += 1;
      } else {
        api.features.wishlistPriceHistory?.stop?.();
        stopped += 1;
      }
      if (on("purchase-history-classifier")) {
        api.features.purchaseHistoryClassifier?.start?.();
        started += 1;
      }
      api.purchaseRecover?.schedule?.(reason);
      log("info", "settings-refresh-success", "商店页设置刷新完成", {
        ...meta,
        started,
        stopped,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      log("error", "settings-refresh-failed", "商店页设置刷新失败", {
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
          window.dispatchEvent(new CustomEvent("STStoreSettingsChanged", {
            detail: api.settings.all(),
          }));
          refreshEnabledFeatures("settings");
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
    refresh: refreshEnabledFeatures,
  });
})();
