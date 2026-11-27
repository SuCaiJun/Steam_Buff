/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 游戏备注接口与响应校验
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

((root) => {
  "use strict";

  function error() {
    return new TypeError(root.STI18n.text("store.gameNotes.invalidResponse", "游戏备注响应格式错误"));
  }

  function read(appids, body) {
    if (!Array.isArray(body.data) || body.data.some(row => !appids.includes(Number(row?.appid)) || typeof row.note !== "string")) {
      throw error();
    }
    const rows = new Map(body.data.map(row => [Number(row.appid), row]));
    const missing = new Set(body.missing_appids);
    if (appids.some(id => !rows.has(id) && !missing.has(id))) throw error();
    return new Map(appids.map(appid => {
      const row = rows.get(appid);
      return [appid, { note: row?.note || "", steamName: row?.steam_name || "", updatedAt: row?.updated_at || "" }];
    }));
  }

  function change(appid, steamName, note) {
    return note ? { method: "POST", body: { appid, steam_name: steamName || "", note } }
      : { method: "DELETE", body: { appid } };
  }

  root.STGameNotesApi = Object.freeze({
    queryUrl: root.STConfig.steamBuff("/wishlist-notes/query"),
    saveUrl: root.STConfig.steamBuff("/wishlist-notes"),
    read,
    change,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
