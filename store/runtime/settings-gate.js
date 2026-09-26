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
      id: "custom-wallet-amount",
      module: "customWalletAmount",
      pageScope: ["store-other"],
      start(api) {
        return api.features.customWalletAmount?.start?.();
      },
      stop(api) {
        return api.features.customWalletAmount?.stop?.();
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
  const FEATURE_BY_ID = new Map(REFRESHABLE_FEATURES.map((feature) => [feature.id, feature]));
  // 来源顺序和悬浮穿透不改变门禁，仍允许时重跑对应 start
  const DISPLAY_RESTART_IDS = Object.freeze({
    "wishlist-price-history-hover-through": Object.freeze(["wishlist-price-history"]),
    "store-title-name-sources": Object.freeze(["store-title-custom-name"]),
  });
  const FAMILY_PAGE_IDS = Object.freeze([
    "family-library-detail-card",
    "family-library-store-badge",
    "family-library-wishlist-badge",
    "family-library-cart-badge",
  ]);

  let settings = {};
  let membership = { active: false, features: {} };
  let watchingSettings = false;
  // 一次 load 会读到整份设置。比较实际已执行的门禁，不能只用这次事件的键和加载前快照
  const applied = new Map();
  let appliedReady = false;
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
        && (key.endsWith(SETTINGS_SUFFIX) || key.endsWith(".value") || key.startsWith(SEARCH_SUGGESTION_PREFIX) || key.startsWith(FAMILY_LIBRARY_PREFIX)))
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

  function dependentsInRefresh(id) {
    const deps = globalThis.STSettings?.catalog?.dependentsOf?.(id) || [];
    const out = [];
    for (const depId of deps) {
      if (FEATURE_BY_ID.has(depId)) out.push(depId);
    }
    return out;
  }

  // 注: 设置键只处理受影响项。无键 refresh 是页面重判，会按当前页面启动或停止全部 12 项
  function planChange(keys) {
    const ids = new Set();
    const restart = new Set();
    let shouldLoad = false;
    let membership = false;
    for (const key of keys || []) {
      if (typeof key !== "string" || !key) continue;
      if (key === membershipStorageKey()) {
        membership = true;
        shouldLoad = true;
        continue;
      }
      if (key.startsWith(FAMILY_LIBRARY_PREFIX)) {
        shouldLoad = true;
        continue;
      }
      if (key.startsWith(SEARCH_SUGGESTION_PREFIX)) continue;
      const id = settingIdFromKey(key);
      if (!id) continue;
      if (id === "family-library-exclude-self") {
        shouldLoad = true;
        for (const childId of FAMILY_PAGE_IDS) {
          const feature = FEATURE_BY_ID.get(childId);
          if (feature && featureGate(feature).allowed === true) restart.add(childId);
        }
        continue;
      }
      const displayTargets = DISPLAY_RESTART_IDS[id];
      if (displayTargets) {
        shouldLoad = true;
        for (const targetId of displayTargets) restart.add(targetId);
        continue;
      }
      const affected = FEATURE_BY_ID.has(id) ? [id] : [];
      affected.push(...dependentsInRefresh(id));
      if (!affected.length) continue;
      shouldLoad = true;
      for (const affectedId of affected) ids.add(affectedId);
    }
    if (membership) {
      for (const featureId of FEATURE_BY_ID.keys()) ids.add(featureId);
    }
    for (const restartId of restart) ids.add(restartId);
    return { load: shouldLoad, refresh: ids.size > 0, ids, restart };
  }

  function ensureApplied() {
    if (appliedReady) return;
    for (const feature of REFRESHABLE_FEATURES) {
      applied.set(feature.id, featureGate(feature).allowed === true);
    }
    appliedReady = true;
  }

  function rememberApplied(feature, allowed, status) {
    if (status === "failed" || status === "missing") {
      applied.delete(feature.id);
      return;
    }
    applied.set(feature.id, allowed === true);
    appliedReady = true;
  }

  function driftedIds() {
    const ids = new Set();
    for (const feature of REFRESHABLE_FEATURES) {
      const allowed = featureGate(feature).allowed === true;
      if (!applied.has(feature.id) || applied.get(feature.id) !== allowed) ids.add(feature.id);
    }
    return ids;
  }

  function failStatus(feature, meta, error) {
    log("error", "settings-refresh-feature-failed", "商店页功能生命周期刷新失败", {
      ...meta,
      feature: feature.id,
      error,
    });
    return { id: feature.id, status: "failed", error: error?.message || String(error) };
  }

  function watchResult(feature, meta, value, map) {
    if (value && typeof value.then === "function") {
      return value.then((result) => map(result), (error) => failStatus(feature, meta, error));
    }
    return map(value);
  }

  function lifecycleMode(feature, allowed, change) {
    if (!change) return allowed ? "start" : "stop";
    if (!change.applied?.has(feature.id)) return allowed ? "start" : "stop";
    const wasAllowed = change.applied.get(feature.id) === true;
    if (wasAllowed !== allowed) return allowed ? "start" : "stop";
    if (change.restart?.has(feature.id) && allowed) return "start";
    return "unchanged";
  }

  function runFeature(feature, meta, change) {
    const gate = featureGate(feature);
    const allowed = gate.allowed === true;
    const mode = lifecycleMode(feature, allowed, change);
    if (mode === "unchanged") {
      return { id: feature.id, status: "unchanged" };
    }
    const mod = api.features?.[feature.module];
    if (!mod) {
      if (!allowed) {
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
    try {
      if (mode === "start") {
        return watchResult(feature, meta, feature.start(api), (result) => (
          result === false
            ? { id: feature.id, status: "skipped" }
            : { id: feature.id, status: "started" }
        ));
      }
      return watchResult(feature, meta, feature.stop(api), () => ({
        id: feature.id,
        status: "stopped",
        reason: gate.reason || "disabled",
      }));
    } catch (error) {
      return failStatus(feature, meta, error);
    }
  }

  function refreshActiveFeatureSet(reason = "settings", change = null) {
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
      const selected = change?.ids
        ? REFRESHABLE_FEATURES.filter((feature) => change.ids.has(feature.id))
        : REFRESHABLE_FEATURES;
      const jobs = [];
      for (const feature of selected) {
        const allowed = featureGate(feature).allowed === true;
        const modeChange = change?.ids ? change : null;
        jobs.push(Promise.resolve(runFeature(feature, meta, modeChange)).then((row) => {
          rememberApplied(feature, allowed, row?.status);
          return row;
        }));
      }
      // 同一轮里的 start/stop 仍按原顺序立刻调用；成功日志等到 Promise 落定
      return Promise.all(jobs).then((refreshed) => {
        log("info", "settings-refresh-success", "商店页设置快照刷新完成", {
          ...meta,
          active: gate.allowed === true,
          skippedReason: gate.reason || "",
          refreshed,
          durationMs: Date.now() - startedAt,
        });
      }).catch((error) => {
        log("error", "settings-refresh-failed", "商店页设置快照刷新失败", {
          ...meta,
          durationMs: Date.now() - startedAt,
          error,
        });
      });
    } catch (error) {
      log("error", "settings-refresh-failed", "商店页设置快照刷新失败", {
        ...meta,
        durationMs: Date.now() - startedAt,
        error,
      });
      return Promise.resolve();
    }
  }

  // 同一页面的设置变更串行执行。load 之后把已执行状态和当前门禁不一致的功能一并处理
  let refreshQueue = Promise.resolve();

  function applySettingsChange(keys, reason) {
    refreshQueue = refreshQueue.then(() => {
      const plan = planChange(keys);
      if (!plan.load) return null;
      ensureApplied();
      return load().then(() => {
        const ids = new Set(plan.ids);
        for (const id of driftedIds()) ids.add(id);
        if (ids.size === 0) return null;
        return refreshActiveFeatureSet(reason, {
          ids,
          restart: plan.restart,
          applied,
        });
      });
    }).catch((error) => {
      log("error", "settings-refresh-failed", "商店页设置快照刷新失败", {
        reason,
        path: location.pathname,
        error,
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
    all() {
      return { ...settings };
    },
    membership() {
      return membership;
    },
  });

  api.settingsGate = Object.freeze({
    load,
    watch,
    refresh: refreshActiveFeatureSet,
  });
})();
