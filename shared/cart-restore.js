/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 购物车暂存批次与后台写入协议
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const KEY = "st.store.cartSelect.restore";
  const TYPE = "CART_RESTORE_MUTATE";
  const TTL = 30 * 60 * 1000;

  function valid(batch) {
    return typeof batch?.id === "string" && batch.id.length > 0 && Array.isArray(batch.items)
      && Number.isFinite(Number(batch.createdAt)) && Number(batch.createdAt) > 0;
  }

  function records(value) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || !value.every(valid)) throw new TypeError("购物车暂存记录格式错误");
    return value;
  }

  function active(batch) {
    return Date.now() - batch.createdAt <= TTL;
  }

  function validAccount(id) {
    return typeof id === "string" && /^\d{17}$/.test(id);
  }

  function pageSession(doc) {
    const node = doc.getElementById("application_config");
    if (!node) return null;
    let user, storeUser;
    try {
      user = JSON.parse(node.getAttribute("data-userinfo"));
      storeUser = JSON.parse(node.getAttribute("data-store_user_config"));
    } catch (cause) {
      throw new Error(globalThis.STI18n.text("store_cartCheckout_sessionUnavailable", "无法确认当前 Steam 账号或商店国家。暂存已保留，请回到购物车恢复。"),
        { cause: globalThis.STLoggerSchema.markJsonError(cause) });
    }
    if (user?.logged_in !== true || !validAccount(user.steamid)) return null;
    return { accountSteamId: user.steamid, country: user.country_code, token: storeUser?.webapi_token };
  }

  function owned(batches, accountSteamId, token) {
    if (!validAccount(accountSteamId)) return [];
    return batches.filter(batch => Object.hasOwn(batch, "accountSteamId")
      ? batch.accountSteamId === accountSteamId
      : typeof token === "string" && token.length > 0 && batch.token === token);
  }

  async function mutate(action, fields = {}) {
    const reply = await globalThis.STMessageBus.request({ type: TYPE, action, ...fields }, { expectSuccess: true });
    if (reply?.success !== true || !Number.isInteger(reply.remaining)) {
      throw new Error(globalThis.STI18n.text("store_cartSelect_restoreWriteUnconfirmed", "未收到购物车暂存写入确认，请刷新购物车页面后重试。"));
    }
    return reply.remaining;
  }

  async function read(value) {
    const all = records(value);
    const current = all.filter(active);
    if (current.length !== all.length) await mutate("prune");
    return current;
  }

  globalThis.STCartRestore = Object.freeze({ KEY, TYPE, valid, active, validAccount, pageSession, owned, records, read, mutate });
})();
