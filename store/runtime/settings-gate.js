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
  const FAMILY_LIBRARY_PREFIX = `${SETTINGS_PREFIX}familyLibrary.`;
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
    {
      id: "family-library-detail-card",
      module: "familyLibraryOwnedMarker",
      pageScope: ["store-app"],
      start(api) {
        const info = api.ctx?.pageInfo?.();
        if (info?.type !== "app") return false;
        return api.features.familyLibraryOwnedMarker?.addDetail?.(info.appId);
      },
      stop(api) {
        return api.features.familyLibraryOwnedMarker?.stopDetail?.();
      },
    },
    {
      id: "family-library-store-badge",
      module: "familyLibraryOwnedMarker",
      pageScope: ["store-details", "store-search", "store-other"],
      start(api) {
        return api.features.familyLibraryOwnedMarker?.startBadges?.("store");
      },
      stop(api) {
        return api.features.familyLibraryOwnedMarker?.stopBadges?.("store");
      },
    },
    {
      id: "family-library-wishlist-badge",
      module: "familyLibraryOwnedMarker",
      pageScope: ["store-wishlist"],
      start(api) {
        return api.features.familyLibraryOwnedMarker?.startBadges?.("wishlist");
      },
      stop(api) {
        return api.features.familyLibraryOwnedMarker?.stopBadges?.("wishlist");
      },
    },
    {
      id: "family-library-cart-badge",
      module: "familyLibraryOwnedMarker",
      pageScope: ["store-cart"],
      start(api) {
        return api.features.familyLibraryOwnedMarker?.startBadges?.("cart");
      },
      stop(api) {
        return api.features.familyLibraryOwnedMarker?.stopBadges?.("cart");
      },
    },
    {
      id: "subscription-detail-card",
      module: "subscriptionInfo",
      pageScope: ["store-app"],
      start(api) {
        const info = api.ctx?.pageInfo?.();
        if (info?.type !== "app") return false;
        return api.features.subscriptionInfo?.addDetail?.(info.appId, location.protocol);
      },
      stop(api) {
        return api.features.subscriptionInfo?.stopDetail?.();
      },
    },
    {
      id: "subscription-store-badge",
      module: "subscriptionInfo",
      pageScope: ["store-details", "store-search", "store-other"],
      start(api) {
        return api.features.subscriptionInfo?.startBadges?.("store");
      },
      stop(api) {
        return api.features.subscriptionInfo?.stopBadges?.("store");
      },
    },
    {
      id: "subscription-wishlist-badge",
      module: "subscriptionInfo",
      pageScope: ["store-wishlist"],
      start(api) {
        return api.features.subscriptionInfo?.startBadges?.("wishlist");
      },
      stop(api) {
        return api.features.subscriptionInfo?.stopBadges?.("wishlist");
      },
    },
    {
      id: "subscription-cart-badge",
      module: "subscriptionInfo",
      pageScope: ["store-cart"],
      start(api) {
        return api.features.subscriptionInfo?.startBadges?.("cart");
      },
      stop(api) {
        return api.features.subscriptionInfo?.stopBadges?.("cart");
      },
    },
  ]);

  let settings = {};
  let membership = { active: false, features: {} };
  let watchingSettings = false;
  const logger = globalThis.STLoggerFactory?.createLogger?.("store", "settings-gate");

  function log(level, event, message, meta = {}) {
    try {
      const fn = logger?.[level] || logger?.info;
      fn?.(event, message, meta);
    } catch {
    }
  }

  // 商店页运行时复用设置页同一套依赖规则，避免子功能在父开关关闭时仍被单独启动。
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
        && (key.endsWith(SETTINGS_SUFFIX) || key.startsWith(SEARCH_SUGGESTION_PREFIX) || key.startsWith(FAMILY_LIBRARY_PREFIX)))
    ));
  }

  function featureGate(feature) {
    const fallbackAllowed = on(feature.id);
    return globalThis.STPageContext?.canRunFeature?.({
      domain: "store",
      id: feature.id,
      settingsKey: feature.id,
      pageScope: feature.pageScope,
      settingsSnapshot: settings,
      settingOn: on,
    }) || { allowed: fallbackAllowed, reason: fallbackAllowed ? "" : "settings-disabled" };
  }

  function refreshFeature(feature, meta) {
    const gate = featureGate(feature);
    const mod = api.features?.[feature.module];
    if (!mod) {
      if (gate.allowed === false) {
        return { id: feature.id, status: "skipped", reason: gate.reason || "disabled" };
      }
      log("warn", "settings-refresh-feature-missing", "商店页刷新功能模块缺失", {
        ...meta,
        featureId: feature.id,
        module: feature.module,
        skippedReason: gate.reason || "",
      });
      return { id: feature.id, status: "missing" };
    }
    if (gate.allowed) {
      const result = feature.start(api);
      return { id: feature.id, status: result === false ? "skipped" : "started" };
    }
    feature.stop(api);
    return { id: feature.id, status: "stopped", reason: gate.reason || "disabled" };
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
          error,
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
        error,
      });
    }
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
          load().then(() => {
            refreshActiveFeatureSet(event.reason || "settings");
          }).catch(() => {});
        }, {
          owner: "store:settings-gate",
          key: "settings-watch",
          prefixes: [SETTINGS_PREFIX, SEARCH_SUGGESTION_PREFIX, FAMILY_LIBRARY_PREFIX],
          keys: [globalThis.STSettings?.storage?.MEMBERSHIP_KEY || MEMBERSHIP_KEY],
        });
        log("info", "settings-watch-start", "商店页设置变化监听已启动", {
          transport: "settings-bus",
          path: location.pathname,
        });
        return;
      }
      chrome.storage.onChanged.addListener((changes, area) => {
        if (!settingsChanged(changes, area)) return;
        load().then(() => {
          refreshActiveFeatureSet("settings");
        }).catch(() => {});
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
