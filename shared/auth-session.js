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

  function accessSeq(value) {
    const seq = Number(value);
    return Number.isSafeInteger(seq) && seq > 0 ? seq : 0;
  }

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
      access_seq: accessSeq(value.access_seq),
    };
  }

  function expired(auth, skewMs = DEFAULT_EXPIRY_SKEW_MS) {
    const time = Number(auth?.expires_at) || 0;
    return !time || Date.now() + Math.max(0, Number(skewMs) || 0) >= time;
  }

  // 同一次登录只认 refresh token，access 换发不能当成账号切换
  function authKey(value) {
    return value?.refresh_token || value?.access_token || "";
  }

  // 刷新接口只在令牌不存在、已撤销或已过期时返回 401
  function refreshRejected(code) {
    return Number(code) === 401;
  }

  function nextAuth(body, old = {}) {
    const now = Date.now();
    return cleanAuth({
      access_token: body?.access_token || old.access_token || "",
      refresh_token: body?.refresh_token || old.refresh_token || "",
      expires_at: now + Math.max(1, Number(body?.expires_in) || DEFAULT_ACCESS_TTL_SECONDS) * 1000,
      last_used_at: now,
      access_seq: body?.access_seq,
    });
  }

  function sameLogin(left, right) {
    const key = authKey(left);
    return key !== "" && key === authKey(right);
  }

  // 写回前比较刚读到的存储和这次请求
  // refresh / reject：会话已变则不写、不清除，也不返回新会话凭据
  // 同一枚 refresh 下存储序号更大则留下存储里的 access
  // touch：只改同一登录的 last_used_at，access、refresh 和序号用刚读到的值
  // replace：登录写入整份凭据。clear：只清除仍是这次会话的存储
  // 两边序号都是 0 时无法判断先后，refresh 仍写回
  // 有 ownerId 且用户或登录已变时返回 owner-changed
  function commitAuth(input = {}) {
    const kind = input.kind;
    const stored = cleanAuth(input.stored);
    const sent = cleanAuth(input.sent);
    const ownerId = String(input.ownerId || "").trim();
    const storedUserId = String(input.storedUserId || "").trim();
    if (ownerId && (storedUserId !== ownerId || !sameLogin(stored, sent))) {
      return { action: "owner-changed" };
    }
    if (kind === "replace") {
      const incoming = cleanAuth(input.incoming);
      if (!incoming) return { action: "clear" };
      return { action: "write", auth: incoming };
    }
    if (kind === "clear") {
      if (!stored) return { action: "keep", auth: null };
      if (sent && !sameLogin(stored, sent)) return { action: "session-changed" };
      return { action: "clear" };
    }
    if (kind === "touch") {
      if (!stored || !sameLogin(stored, sent)) return { action: "session-changed" };
      return {
        action: "write",
        auth: cleanAuth({
          ...stored,
          last_used_at: Number(input.lastUsedAt) || Date.now(),
        }),
      };
    }
    const sentRefresh = String(sent?.refresh_token || "");
    const storedRefresh = String(stored?.refresh_token || "");
    if (!stored || storedRefresh === "" || storedRefresh !== sentRefresh) {
      return { action: "session-changed" };
    }
    if (kind === "reject") {
      if ((stored.access_seq || 0) > (sent?.access_seq || 0)) {
        return { action: "keep", auth: stored };
      }
      return { action: "clear" };
    }
    const incoming = cleanAuth(input.incoming);
    const incomingRefresh = String(incoming?.refresh_token || "");
    if (!incoming || incomingRefresh !== storedRefresh) {
      return { action: "keep", auth: stored };
    }
    if ((stored.access_seq || 0) > (incoming.access_seq || 0)) {
      return { action: "keep", auth: stored };
    }
    return { action: "write", auth: incoming };
  }

  const api = Object.freeze({
    DEFAULT_EXPIRY_SKEW_MS,
    DEFAULT_ACCESS_TTL_SECONDS,
    cleanAuth,
    expired,
    authKey,
    refreshRejected,
    nextAuth,
    commitAuth,
  });

  root.STAuthSession = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
