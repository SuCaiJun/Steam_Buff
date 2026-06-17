/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置中心|会员权益门禁
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const settings = root.STSettings = root.STSettings || {};
  const KEY = "steam_buff_membership";

  function bool(value, fallback = false) {
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

  function authReady(value) {
    return !!(value && typeof value === "object" && (String(value.access_token || "") || String(value.refresh_token || "")));
  }

  function expiredDate(value) {
    const text = String(value || "").trim();
    if (!text) {
      return false;
    }
    const time = new Date(text).getTime();
    if (!Number.isFinite(time)) {
      return false;
    }
    return time < Date.now();
  }

  function empty() {
    return {
      active: false,
      level: "",
      badge: "普通用户",
      identity: "赞助者身份",
      expire: "",
      features: {
        searchSuggestions: false,
      },
      updatedAt: Date.now(),
    };
  }

  function normalize(value = {}, auth = {}) {
    const src = value && typeof value === "object" ? value : {};
    const sponsor = src.sponsor && typeof src.sponsor === "object" ? src.sponsor : src;
    const usage = src.usage && typeof src.usage === "object" ? src.usage : {};
    const features = src.features && typeof src.features === "object" ? src.features : {};
    const expire = String(sponsor.expire ?? src.expire ?? "");
    const active = bool(sponsor.active ?? src.active, false) && authReady(auth) && !expiredDate(expire);
    const search = usage.searchSuggestions || usage.search_suggestions || {};
    const searchEnabled = Object.hasOwn(features, "searchSuggestions")
      ? bool(features.searchSuggestions, active)
      : bool(search.enabled, active);

    return {
      active,
      level: String(sponsor.level ?? src.level ?? ""),
      badge: String(sponsor.badge ?? src.badge ?? (active ? "赞助者" : "普通用户")),
      identity: String(sponsor.identity ?? src.identity ?? "赞助者身份"),
      expire,
      features: {
        searchSuggestions: active && searchEnabled,
      },
      updatedAt: Number(src.updatedAt) || Date.now(),
    };
  }

  function canUse(item, membership) {
    if (item?.member !== true) {
      return true;
    }
    const value = membership || empty();
    if (value.active !== true) {
      return false;
    }
    const feature = item.memberFeature;
    return !feature || value.features?.[feature] !== false;
  }

  function lockText(item, membership) {
    if (item?.disabled === true) {
      return item.lock || "暂不可用";
    }
    if (item?.member === true && !canUse(item, membership)) {
      return item.lock || `${membership?.identity || "赞助者身份"}可用`;
    }
    return item?.lock || "";
  }

  function isChange(changes, area = "local") {
    return area === "local" && Object.hasOwn(changes || {}, KEY);
  }

  function watch(options = {}) {
    const storage = options.storage || settings.storage || {};
    const onChange = typeof options.onChange === "function" ? options.onChange : null;
    if (!onChange || typeof chrome === "undefined" || !chrome.storage?.onChanged) {
      return null;
    }
    const read = typeof options.getMembership === "function"
      ? options.getMembership
      : () => storage.getMembership?.();
    if (root.STSettingsBus?.subscribe) {
      return root.STSettingsBus.subscribe(() => {
        Promise.resolve(read()).then((next) => {
          onChange(next || empty());
        }).catch(() => {});
      }, {
        owner: options.owner || "settings:membership",
        key: options.key || "membership-watch",
        keys: [KEY],
      });
    }
    const listener = (changes, area) => {
      if (!isChange(changes, area)) {
        return;
      }
      Promise.resolve(read()).then((next) => {
        onChange(next || empty());
      }).catch(() => {});
    };
    try {
      chrome.storage.onChanged.addListener(listener);
      return listener;
    } catch {
      return null;
    }
  }

  const api = Object.freeze({
    KEY,
    empty,
    normalize,
    canUse,
    lockText,
    isChange,
    watch,
  });

  root.STSettings.membership = api;
  root.STSettingsMembership = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
