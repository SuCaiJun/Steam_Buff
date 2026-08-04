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
      if (value == null) {
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

  function remainDays(sponsor) {
    const direct = num(sponsor?.remaining_days, NaN);
    if (Number.isFinite(direct)) {
      return Math.max(0, Math.round(direct));
    }
    const expire = new Date(sponsor?.expire_at || "").getTime();
    if (!Number.isFinite(expire)) {
      return 0;
    }
    return Math.max(0, Math.ceil((expire - Date.now()) / 86400000));
  }

  function sponsorLevel(level) {
    const value = String(level || "none").toLowerCase();
    return !["", "0", "none", "free", "normal", "basic"].includes(value);
  }

  function flag(value, fallback) {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      return value !== 0;
    }
    if (typeof value === "string") {
      const text = value.trim().toLowerCase();
      if (["1", "true", "yes", "on"].includes(text)) {
        return true;
      }
      if (["0", "false", "no", "off", "none"].includes(text)) {
        return false;
      }
    }
    return fallback;
  }

  function sponsorIdentityName(sponsor) {
    return first(
      sponsor.identity_name,
      sponsor.level_names?.[2],
      sponsor.name
    );
  }

  // 账号中心和引导页只消费当前 /user/center 契约字段。
  function normalizeData(snapshot = {}, auth = {}) {
    const snap = snapshot || {};
    const user = snap.user || {};
    const sponsor = snap.sponsor || {};
    const usage = snap.usage || {};
    const logged = !!(auth?.refresh_token || auth?.access_token)
      && user.is_loged_in !== false
      && user.is_logged_in !== false;
    const level = first(sponsor.level, "none");
    const active = logged && (
      sponsorLevel(level)
      || flag(sponsor.active, false)
    );
    const joined = num(user.joined_days, NaN);
    const gameNotes = usage.game_notes || {};
    const suggestions = usage.search_suggestions || {};
    const noteQuota = Object.hasOwn(gameNotes, "quota") ? num(gameNotes.quota, active ? -1 : 100) : (active ? -1 : 100);
    const searchQuota = Object.hasOwn(suggestions, "quota") ? num(suggestions.quota, active ? 500 : 0) : (active ? 500 : 0);
    const expire = dateText(sponsor.expire_at);
    const remainingDays = remainDays(sponsor);
    const identityName = sponsorIdentityName(sponsor);
    const badge = active ? first(sponsor.name, identityName) : "";

    return {
      logged,
      user: {
        avatar: first(user.avatar),
        name: first(user.nickname, user.name),
        id: first(user.id),
        joinedDays: Number.isFinite(joined) ? Math.max(0, Math.round(joined)) : null,
      },
      sponsor: {
        active,
        level,
        badge,
        identityName,
        expire,
        remainingDays,
        expiring: active && !!expire && remainingDays <= 30,
      },
      usage: {
        customNames: {
          count: Math.max(0, num(usage.custom_names?.count, 0)),
        },
        gameNotes: {
          used: Math.max(0, num(gameNotes.used, 0)),
          quota: noteQuota,
        },
        searchSuggestions: {
          enabled: flag(suggestions.enabled, active),
          used: Math.max(0, num(suggestions.used, 0)),
          quota: searchQuota,
        },
      },
    };
  }

  function membershipSnapshot(data = {}) {
    const src = data?.sponsor ? data : normalizeData(data);
    return {
      active: src.sponsor?.active === true,
      level: String(src.sponsor?.level || ""),
      badge: String(src.sponsor?.badge || ""),
      identity: String(src.sponsor?.identityName || ""),
      expire: String(src.sponsor?.expire || ""),
      features: {
        searchSuggestions: src.sponsor?.active === true && src.usage?.searchSuggestions?.enabled !== false,
      },
    };
  }

  const api = Object.freeze({
    first,
    num,
    clamp,
    dateText,
    normalizeData,
    membershipSnapshot,
  });

  root.STAccountProfile = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
