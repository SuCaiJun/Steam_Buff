/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 账号资料与权益数据归一化
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  function first(...values) {
    for (const value of values) {
      if (value == null || typeof value === "object") {
        continue;
      }
      const text = String(value).trim();
      if (text) {
        return text;
      }
    }
    return "";
  }

  function num(value, fallback = 0) {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
  }

  function usageValue(source, key) {
    if (!source || typeof source !== "object" || !Object.hasOwn(source, key)) {
      return null;
    }
    const value = source[key];
    return typeof value === "number" && Number.isInteger(value) && value >= 0
      ? value
      : null;
  }

  function quotaValue(source, key = "quota") {
    if (!source || typeof source !== "object" || !Object.hasOwn(source, key)) {
      return null;
    }
    const value = source[key];
    return typeof value === "number" && Number.isInteger(value) && value >= -1
      ? value
      : null;
  }

  const PERMISSION_KEYS = ["customNames", "gameNotes", "priceMonitor", "searchSuggestions"];

  function explicitPermissions(source) {
    const result = {};
    if (!source || typeof source !== "object") {
      return result;
    }
    for (const key of PERMISSION_KEYS) {
      if (typeof source[key] === "boolean") {
        result[key] = source[key];
      }
    }
    return result;
  }

  function permissionsValue(source, usage) {
    const explicit = explicitPermissions(source?.permissions);
    const customNames = usage?.custom_names || {};
    const gameNotes = usage?.game_notes || {};
    const suggestions = usage?.search_suggestions || {};
    // 旧版 /user/center 已正式返回这些 usage 字段；仅在新 permissions 缺少对应项时保留这组有限兼容。
    const legacy = {
      customNames: quotaValue(customNames) !== null ? quotaValue(customNames) !== 0 : false,
      gameNotes: quotaValue(gameNotes) !== null ? quotaValue(gameNotes) !== 0 : false,
      priceMonitor: false,
      searchSuggestions: typeof suggestions.enabled === "boolean" ? suggestions.enabled : false,
    };
    return Object.fromEntries(PERMISSION_KEYS.map((key) => [
      key,
      Object.hasOwn(explicit, key) ? explicit[key] : legacy[key],
    ]));
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function dateText(value) {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
      return "";
    }
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}/${m}/${d}`;
  }

  function entitlementSource(value) {
    if (!value || typeof value !== "object") {
      return null;
    }
    const type = ["vip", "medal", "normal"].includes(value.type) ? value.type : "";
    const sourceKey = first(value.source_key);
    const name = first(value.name);
    if (!type || !sourceKey || !name) {
      return null;
    }
    const rawValidity = value.validity;
    const validityType = rawValidity && typeof rawValidity === "object" && rawValidity.type === "limited"
      ? "limited"
      : "permanent";
    const expiresAt = validityType === "limited" ? dateText(rawValidity.expires_at) : "";
    const remainingDays = validityType === "limited" && Number.isInteger(rawValidity.remaining_days)
      ? Math.max(0, rawValidity.remaining_days)
      : null;
    return {
      sourceKey,
      type,
      vipLevel: type === "vip" && Number.isInteger(value.vip_level)
        ? clamp(value.vip_level, 1, 2)
        : 0,
      name,
      icon: first(value.icon),
      description: first(value.description),
      category: first(value.category),
      acquiredAt: dateText(value.acquired_at),
      validity: {
        type: validityType,
        expiresAt,
        remainingDays,
      },
    };
  }

  // 账号中心和引导页共享当前 /user/center 模型；当前权益以 entitlement.active 为准，sponsor.badge 仅保留旧版 VIP 快照。
  function normalizeData(snapshot = {}, auth = {}) {
    const snap = snapshot || {};
    const user = snap.user || {};
    const sponsor = snap.sponsor || {};
    const entitlement = snap.entitlement || {};
    const usage = snap.usage || {};
    const logged = !!(auth?.refresh_token || auth?.access_token)
      && user.is_loged_in !== false
      && user.is_logged_in !== false;
    const vipLevel = Number.isInteger(sponsor.vip_level)
      ? clamp(sponsor.vip_level, 0, 2)
      : 0;
    const active = logged && sponsor.active === true && vipLevel > 0;
    const vipName = active
      ? first(sponsor.name, sponsor.level_names?.[vipLevel], `VIP${vipLevel}`)
      : "";
    const joined = num(user.joined_days, NaN);
    const customNames = usage.custom_names || {};
    const gameNotes = usage.game_notes || {};
    const suggestions = usage.search_suggestions || {};
    const permissions = permissionsValue(snap, usage);
    const expire = active ? dateText(sponsor.expire_at) : "";
    const remainingDays = active && Number.isInteger(sponsor.remaining_days)
      ? Math.max(0, sponsor.remaining_days)
      : null;
    const activeEntitlement = entitlementSource(entitlement.active);
    const entitlementOwned = Array.isArray(entitlement.owned)
      ? entitlement.owned.map(entitlementSource).filter(Boolean)
      : [];

    return {
      logged,
      user: {
        avatar: first(user.avatar),
        name: first(user.nickname, user.name),
        id: first(user.id),
        levelName: first(user.level_name),
        levelIcon: first(user.level_icon),
        joinedDays: Number.isFinite(joined) ? Math.max(0, Math.round(joined)) : null,
      },
      sponsor: {
        active,
        level: first(sponsor.level),
        vipLevel,
        name: vipName,
        badge: vipName,
        identityName: first(sponsor.identity_name),
        expire,
        remainingDays,
        expiring: active && !!expire && Number.isFinite(remainingDays) && remainingDays <= 30,
      },
      entitlement: {
        available: activeEntitlement !== null,
        active: activeEntitlement,
        owned: entitlementOwned,
      },
      permissions,
      usage: {
        customNames: {
          count: usageValue(customNames, "count"),
          quota: quotaValue(customNames),
        },
        gameNotes: {
          used: usageValue(gameNotes, "used"),
          quota: quotaValue(gameNotes),
        },
        searchSuggestions: {
          enabled: suggestions.enabled === true,
          used: usageValue(suggestions, "used"),
          quota: quotaValue(suggestions),
          dailyUsed: usageValue(suggestions, "daily_used"),
          dailyQuota: quotaValue(suggestions, "daily_quota"),
        },
      },
    };
  }

  function membershipSnapshot(data = {}) {
    const src = data?.sponsor ? data : normalizeData(data);
    const activeSource = src.entitlement?.active || null;
    const entitled = src.logged === true && activeSource && activeSource.type !== "normal";
    const permissions = explicitPermissions(src.permissions || src.features);
    const normalizedPermissions = Object.fromEntries(PERMISSION_KEYS.map((key) => [
      key,
      permissions[key] === true,
    ]));
    return {
      active: !!entitled,
      level: activeSource?.type === "vip" ? String(src.sponsor?.level || "") : String(activeSource?.type || ""),
      badge: String(activeSource?.name || ""),
      identity: String(activeSource?.name || ""),
      expire: activeSource?.type === "vip" && activeSource.validity?.type === "limited"
        ? String(activeSource.validity.expiresAt || "")
        : "",
      permissions: normalizedPermissions,
      // 兼容旧设置页读取路径；新代码统一读取 permissions。
      features: normalizedPermissions,
    };
  }

  const api = Object.freeze({
    first,
    num,
    clamp,
    dateText,
    explicitPermissions,
    permissionsValue,
    normalizeData,
    membershipSnapshot,
  });

  root.STAccountProfile = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
