/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 家庭组游戏库本地缓存
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore = window.STStore || {};
  const STORAGE_KEY = "st.store.familyLibraryOwnedMarker.cache.v1";
  const REFRESH_STATE_KEY = "st.store.familyLibraryOwnedMarker.refreshState.v1";
  const SCHEMA_VERSION = 1;
  const TTL_SECONDS = 24 * 60 * 60;
  const log = window.STLoggerFactory?.createLogger?.("store", "family-library-cache");

  function nowSeconds() {
    return Math.floor(Date.now() / 1000);
  }

  function storage() {
    return globalThis.chrome?.storage?.local || null;
  }

  function getStorage(keys) {
    return new Promise((resolve, reject) => {
      const box = storage();
      if (!box) {
        reject(new Error("chrome.storage.local 不可用"));
        return;
      }
      box.get(keys, (data) => {
        const err = globalThis.chrome?.runtime?.lastError;
        if (err) reject(new Error(err.message || "读取缓存失败"));
        else resolve(data || {});
      });
    });
  }

  function setStorage(data) {
    return new Promise((resolve, reject) => {
      const box = storage();
      if (!box) {
        reject(new Error("chrome.storage.local 不可用"));
        return;
      }
      box.set(data, () => {
        const err = globalThis.chrome?.runtime?.lastError;
        if (err) reject(new Error(err.message || "写入缓存失败"));
        else resolve(true);
      });
    });
  }

  function asObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function seconds(value) {
    const next = Number(value) || 0;
    return next > 10_000_000_000 ? Math.floor(next / 1000) : Math.floor(next);
  }

  function normalizeMembers(input) {
    const out = {};
    Object.entries(asObject(input)).forEach(([steamid, member]) => {
      const key = String(steamid || "").trim();
      if (!key) return;
      out[key] = {
        name: String(member?.name || ""),
        role: Number(member?.role) || 0,
      };
    });
    return out;
  }

  function normalizeApps(input) {
    const out = {};
    Object.entries(asObject(input)).forEach(([key, app]) => {
      const appid = Number(app?.appid || key) || 0;
      if (appid <= 0) return;
      out[String(appid)] = {
        appid,
        ownerSteamids: Array.isArray(app?.ownerSteamids)
          ? app.ownerSteamids.map(String).filter(Boolean)
          : [],
        excludeReason: Number(app?.excludeReason) || 0,
        appType: Number(app?.appType) || 0,
        acquiredAt: Number(app?.acquiredAt) || 0,
      };
    });
    return out;
  }

  function normalizeCache(raw) {
    if (!raw || typeof raw !== "object") return null;
    const updatedAt = seconds(raw.updatedAt);
    const expiresAt = seconds(raw.expiresAt) || updatedAt + TTL_SECONDS;
    const membersBySteamId = normalizeMembers(raw.membersBySteamId);
    const appsById = normalizeApps(raw.appsById);
    return {
      version: SCHEMA_VERSION,
      accountSteamId: String(raw.accountSteamId || ""),
      familyGroupId: String(raw.familyGroupId || ""),
      familyName: String(raw.familyName || ""),
      updatedAt,
      expiresAt,
      membersBySteamId,
      appsById,
      stats: {
        appCount: Number(raw.stats?.appCount) || Object.keys(appsById).length,
        memberCount: Number(raw.stats?.memberCount) || Object.keys(membersBySteamId).length,
      },
    };
  }

  function normalizeRefreshState(raw) {
    return {
      skippedAt: seconds(raw?.skippedAt),
    };
  }

  async function read() {
    try {
      const data = await getStorage([STORAGE_KEY]);
      return normalizeCache(data[STORAGE_KEY]);
    } catch (error) {
      log?.warn?.("family-library-cache-read-failed", "家庭组游戏库缓存读取失败", {
        error,
      });
      return null;
    }
  }

  async function write(cache) {
    const normalized = normalizeCache(cache);
    if (!normalized) {
      throw new Error("家庭组游戏库缓存格式异常");
    }
    await setStorage({ [STORAGE_KEY]: normalized });
    return normalized;
  }

  async function readRefreshState() {
    try {
      const data = await getStorage([REFRESH_STATE_KEY]);
      return normalizeRefreshState(data[REFRESH_STATE_KEY]);
    } catch (error) {
      log?.warn?.("family-library-refresh-state-read-failed", "家庭组游戏库刷新跳过状态读取失败", {
        error,
      });
      return null;
    }
  }

  async function skipRefreshCycle() {
    const state = normalizeRefreshState({ skippedAt: nowSeconds() });
    await setStorage({ [REFRESH_STATE_KEY]: state });
    return state;
  }

  function nextRefreshAt(cache, refreshState, intervalSeconds) {
    const interval = seconds(intervalSeconds);
    if (interval <= 0) return 0;
    const lastSuccessfulAt = seconds(cache?.updatedAt);
    const skippedAt = seconds(refreshState?.skippedAt);
    return Math.max(lastSuccessfulAt, skippedAt) + interval;
  }

  function appEntry(cache, appId) {
    const key = String(Number(appId) || "");
    return key ? cache?.appsById?.[key] || null : null;
  }

  function cacheAgeMs(cache) {
    if (!cache?.updatedAt) return 0;
    return Math.max(0, (nowSeconds() - Number(cache.updatedAt)) * 1000);
  }

  function isStale(cache) {
    if (!cache?.expiresAt) return true;
    return nowSeconds() >= Number(cache.expiresAt);
  }

  api.familyLibraryCache = Object.freeze({
    STORAGE_KEY,
    REFRESH_STATE_KEY,
    SCHEMA_VERSION,
    TTL_SECONDS,
    nowSeconds,
    normalizeCache,
    read,
    write,
    normalizeRefreshState,
    readRefreshState,
    skipRefreshCycle,
    nextRefreshAt,
    appEntry,
    cacheAgeMs,
    isStale,
  });
})();
