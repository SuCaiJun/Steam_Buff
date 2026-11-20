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
  const SELECTION_KEY = "st.store.cartSelect.selectionByAccount";
  const LEGACY_SELECTION_KEY = "st.store.cartSelect.selection";
  const ITEMS_TYPE = "CART_RESTORE_ITEMS";

  function valid(batch) {
    return typeof batch?.id === "string" && batch.id.length > 0 && Array.isArray(batch.items)
      && Number.isFinite(Number(batch.createdAt)) && Number(batch.createdAt) > 0;
  }

  function records(value) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || !value.every(valid)) throw new TypeError("购物车暂存记录格式错误");
    return value;
  }

  function validAccount(id) {
    return typeof id === "string" && /^\d{17}$/.test(id);
  }

  function validLineId(id) {
    return typeof id === "string" && /^[1-9]\d{0,19}$/.test(id) && BigInt(id) <= 0xffffffffffffffffn;
  }

  function pageAccount(doc) {
    const config = doc.getElementById("application_config");
    if (!config) return null;
    let user;
    try {
      user = JSON.parse(config.getAttribute("data-userinfo"));
    } catch (error) {
      throw globalThis.STLoggerSchema.markJsonError(error);
    }
    return user?.logged_in === true && validAccount(user.steamid) ? user.steamid : null;
  }

  async function requestItems(action, fields, signal) {
    const timeoutMs = action === "checkout" ? 90_000 : 25_000;
    const reply = await globalThis.STMessageBus.request({ type: ITEMS_TYPE, action, ...fields }, { expectSuccess: true, signal, timeoutMs });
    if (reply?.success !== true) {
      throw new Error(globalThis.STI18n.text("store_cartSelect_checkoutFailed", "购物车选择处理失败"));
    }
    return reply;
  }

  globalThis.STCartRestore = Object.freeze({ KEY, SELECTION_KEY, LEGACY_SELECTION_KEY, ITEMS_TYPE, validAccount, validLineId, pageAccount,
    records, requestItems });
})();
