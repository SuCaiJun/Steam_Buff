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

  /** a/b为非空的已校验摘要；按时间、ID倒序返回负/零/正值表示a在前/同键/在后，无I/O、不修改输入。 */
  function compare(a, b) { return b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0); }

  const ICONS = Object.freeze({
    clear: "images/ui/message-clear-unread.svg", mute: "images/ui/message-mute.svg",
    upgrade: "images/ui/message-upgrade.svg", view: "images/ui/message-view.svg", read: "images/ui/message-read.svg", retry: "images/ui/message-retry.svg",
    delete: "images/ui/delete.svg",
  });
  const BUSINESS_STATES = Object.freeze(["pending", "approved", "rejected", "expired", "cancelled", "completed"]);

  function link(value) {
    const url = new URL(text(value, "链接", 4096));
    if (url.protocol !== "https:" || url.username || url.password) throw new TypeError("消息链接必须是无凭据的 HTTPS 地址");
    return url.href;
  }

  // context 只承载业务引用的 JSON 数据；限制深度和大小，不接受函数或运行时对象。
  function context(value) {
    if (value === undefined) return {};
    let count = 0;
    function copy(item, depth) {
      if (++count > 128 || depth > 4) throw new TypeError("消息业务引用过大");
      if (item === null || typeof item === "boolean" || typeof item === "string") return item;
      if (typeof item === "number" && Number.isFinite(item)) return item;
      if (Array.isArray(item)) return item.map(next => copy(next, depth + 1));
      if (!item || typeof item !== "object" || Object.prototype.toString.call(item) !== "[object Object]") throw new TypeError("消息业务引用必须是 JSON 对象");
      const out = {};
      for (const [key, next] of Object.entries(item)) {
        if (["__proto__", "constructor", "prototype"].includes(key)) throw new TypeError("消息业务引用字段无效");
        out[key] = copy(next, depth + 1);
      }
      return out;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("消息业务引用无效");
    const result = copy(value, 0);
    if (JSON.stringify(result).length > 8192) throw new TypeError("消息业务引用过大");
    return result;
  }

  function normalizeAction(input) {
    if (!input || typeof input !== "object") throw new TypeError("消息操作无效");
    // 已发布的第一版只有 id/label；新动作显式声明 kind，由后台统一执行。
    const kind = input.kind === undefined ? "legacy" : input.kind;
    if (!["legacy", "link", "command", "read"].includes(kind)) throw new TypeError("消息操作类型无效");
    const icon = input.icon === undefined ? "" : input.icon;
    if (icon !== "" && !Object.hasOwn(ICONS, icon)) throw new TypeError("消息操作图标未注册");
    return { id: id(input.id), label: text(input.label, "操作名称", 100), kind, icon,
      ...(kind === "link" ? { url: link(input.url) } : {}) };
  }

  function businessState(value) {
    if (value === undefined || value === null) return null;
    if (!BUSINESS_STATES.includes(value)) throw new TypeError("消息业务状态无效");
    return value;
  }

  function t(key, fallback, value) {
    if (root.STI18n) return root.STI18n.text(key, fallback, value === undefined ? undefined : { value });
    const translated = root.chrome?.i18n?.getMessage(key.replace(/\./g, "_"), value === undefined ? undefined : [String(value)]);
    return translated || fallback.replace(/\$value\$/g, String(value));
  }

  /**
   * 校验由扩展自身生产的消息；ID 与发生时间必须由生产者明确提供。
   * 相同事件 ID 只接收一次，独立检查使用新事件 ID；链接仅支持 HTTPS，命令只保存注册标识。
   * 设备消息保持原语义；Steam 账号消息只由后台真实会话核验后查询与操作。
   */
  function message(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("消息内容无效");
    if (!Number.isSafeInteger(input.createdAt) || input.createdAt <= 0) throw new TypeError("消息时间无效");
    const actions = input.actions === undefined ? [] : input.actions;
    if (!Array.isArray(actions)) throw new TypeError("消息操作无效");
    const seen = new Set();
    const scope = input.scope === undefined ? "device" : input.scope;
    if (!["device", "steam-account"].includes(scope)) throw new TypeError("消息范围无效");
    if (scope === "steam-account" && (typeof input.steamAccountId !== "string" || !/^\d{17}$/.test(input.steamAccountId))) throw new TypeError("消息 Steam 账号无效");
    return {
      id: id(input.id), source: text(input.source, "来源", 100), type: text(input.type, "类型", 100),
      title: text(input.title, "标题", 500), summary: text(input.summary, "摘要", 2000, true),
      body: text(input.body, "正文", 20000, true), createdAt: input.createdAt,
      scope, ...(scope === "steam-account" ? { steamAccountId: input.steamAccountId } : {}), context: context(input.context), businessState: businessState(input.businessState),
      ...(input.group === undefined ? {} : { group: id(input.group) }),
      actions: actions.map(action => {
        if (!action || typeof action !== "object") throw new TypeError("消息操作无效");
        const actionId = id(action.id);
        if (seen.has(actionId)) throw new TypeError("消息操作 ID 重复");
        seen.add(actionId);
        return normalizeAction(action);
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
    DATABASE: "SteamBuffMessageCenter", DATABASE_VERSION: 3, STATE_KEY: "steam_buff_message_center_state_v1", PAGE_SIZE: 20,
    IDENTITY_KEY: "steam_buff_message_identity_revision_v1",
    RETENTION_MS: 30 * 24 * 60 * 60 * 1000, READ_LIMIT: 100,
    READ_ACTIONS: Object.freeze(["summary", "list", "get", "read", "read-all", "delete", "delete-all", "act"]),
    ICONS, BUSINESS_STATES, id, compare, message, list, action: normalizeAction, context, businessState, link, text: t,
  });
})(globalThis);
