/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 消息中心数据与跨上下文协议
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  if (root.STMessageCenter) return;

  function text(value, name, max, optional = false) {
    if (optional && value === undefined) return "";
    if (typeof value !== "string" || value.length > max || (!optional && !value.trim())) {
      throw new TypeError(`消息${name}无效`);
    }
    return value;
  }

  function id(value) { return text(value, " ID", 200); }

  /**
   * 校验由扩展自身生产的消息；ID 与发生时间必须由生产者明确提供。
   * 相同 ID 只接收一次；actions 只保存动作标识和文案，不保存代码或跳转地址。
   */
  function message(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("消息内容无效");
    if (!Number.isSafeInteger(input.createdAt) || input.createdAt <= 0) throw new TypeError("消息时间无效");
    const actions = input.actions === undefined ? [] : input.actions;
    if (!Array.isArray(actions)) throw new TypeError("消息操作无效");
    const seen = new Set();
    return {
      id: id(input.id), source: text(input.source, "来源", 100), type: text(input.type, "类型", 100),
      title: text(input.title, "标题", 500), summary: text(input.summary, "摘要", 2000, true),
      body: text(input.body, "正文", 20000, true), createdAt: input.createdAt,
      actions: actions.map(action => {
        if (!action || typeof action !== "object") throw new TypeError("消息操作无效");
        const actionId = id(action.id);
        if (seen.has(actionId)) throw new TypeError("消息操作 ID 重复");
        seen.add(actionId);
        return { id: actionId, label: text(action.label, "操作名称", 100) };
      }),
    };
  }

  function list(input = {}) {
    const filter = input.filter === undefined ? "all" : input.filter;
    if (filter !== "all" && filter !== "unread") throw new TypeError("消息筛选条件无效");
    const before = input.before === undefined ? null : input.before;
    if (before !== null && (!Array.isArray(before) || before.length !== 2 || !Number.isSafeInteger(before[0]) || before[0] <= 0)) {
      throw new TypeError("消息分页位置无效");
    }
    if (before !== null) id(before[1]);
    return { filter, before };
  }

  root.STMessageCenter = Object.freeze({
    FEATURE: "message-center", ROUTE: "MESSAGE_CENTER", BRIDGE: "steam-buff-message-center-v1",
    DATABASE: "SteamBuffMessageCenter", STATE_KEY: "steam_buff_message_center_state_v1", PAGE_SIZE: 20,
    RETENTION_MS: 30 * 24 * 60 * 60 * 1000, READ_LIMIT: 100,
    READ_ACTIONS: Object.freeze(["summary", "list", "get", "read", "read-all", "delete"]),
    id, message, list,
  });
})(globalThis);
