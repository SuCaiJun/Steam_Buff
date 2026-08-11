/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : 跨运行域共享登录令牌契约
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const DEFAULT_EXPIRY_SKEW_MS = 60 * 1000;
  const DEFAULT_ACCESS_TTL_SECONDS = 600;

  function cleanAuth(value) {
    if (!value || typeof value !== "object") {
      return null;
    }
    const access = String(value.access_token || "");
    const refresh = String(value.refresh_token || "");
    if (!access && !refresh) {
      return null;
    }
    return {
      access_token: access,
      refresh_token: refresh,
      expires_at: Number(value.expires_at) || 0,
      last_used_at: Number(value.last_used_at) || 0,
    };
  }

  function expired(auth, skewMs = DEFAULT_EXPIRY_SKEW_MS) {
    const time = Number(auth?.expires_at) || 0;
    return !time || Date.now() + Math.max(0, Number(skewMs) || 0) >= time;
  }

  function authKey(value) {
    return value?.refresh_token || value?.access_token || "";
  }

  function nextAuth(body, old = {}) {
    const now = Date.now();
    return cleanAuth({
      access_token: body?.access_token || old.access_token || "",
      refresh_token: body?.refresh_token || old.refresh_token || "",
      expires_at: now + Math.max(1, Number(body?.expires_in) || DEFAULT_ACCESS_TTL_SECONDS) * 1000,
      last_used_at: now,
    });
  }

  const api = Object.freeze({
    DEFAULT_EXPIRY_SKEW_MS,
    DEFAULT_ACCESS_TTL_SECONDS,
    cleanAuth,
    expired,
    authKey,
    nextAuth,
  });

  root.STAuthSession = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
