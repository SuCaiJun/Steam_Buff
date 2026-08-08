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

  // 账号中心和引导页共享当前 /user/center 模型；badge 是既有会员快照字段，只代表 VIP 名称。
  function normalizeData(snapshot = {}, auth = {}) {
    const snap = snapshot || {};
    const user = snap.user || {};
    const sponsor = snap.sponsor || {};
    const usage = snap.usage || {};
    const logged = !!(auth?.refresh_token || auth?.access_token)
      && user.is_loged_in !== false
      && user.is_logged_in !== false;
    const medal = user.medal || {};
    const vipLevel = Number.isInteger(sponsor.vip_level)
      ? clamp(sponsor.vip_level, 0, 2)
      : 0;
    const active = logged && sponsor.active === true && vipLevel > 0;
    const vipName = active
      ? first(sponsor.name, sponsor.level_names?.[vipLevel], `VIP${vipLevel}`)
      : "";
    const joined = num(user.joined_days, NaN);
    const gameNotes = usage.game_notes || {};
    const suggestions = usage.search_suggestions || {};
    const noteQuota = Object.hasOwn(gameNotes, "quota") ? num(gameNotes.quota, active ? -1 : 100) : (active ? -1 : 100);
    const searchQuota = Object.hasOwn(suggestions, "quota") ? num(suggestions.quota, active ? 500 : 0) : (active ? 500 : 0);
    const expire = active ? dateText(sponsor.expire_at) : "";
    const remainingDays = active && Number.isInteger(sponsor.remaining_days)
      ? Math.max(0, sponsor.remaining_days)
      : null;
    const medalWorn = medal.worn === true;

    return {
      logged,
      user: {
        avatar: first(user.avatar),
        name: first(user.nickname, user.name),
        id: first(user.id),
        joinedDays: Number.isFinite(joined) ? Math.max(0, Math.round(joined)) : null,
        medal: {
          available: medal.available === true,
          enabled: medal.enabled === true,
          worn: medalWorn,
          name: medalWorn ? first(medal.name) : "",
          description: medalWorn ? first(medal.description) : "",
          icon: medalWorn ? first(medal.icon) : "",
          category: medalWorn ? first(medal.category) : "",
          acquiredAt: medalWorn ? dateText(medal.acquired_at) : "",
        },
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
      usage: {
        customNames: {
          count: Math.max(0, num(usage.custom_names?.count, 0)),
        },
        gameNotes: {
          used: Math.max(0, num(gameNotes.used, 0)),
          quota: noteQuota,
        },
        searchSuggestions: {
          enabled: suggestions.enabled === true,
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
