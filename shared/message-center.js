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
  const PROTOCOL = 2;
  if (root.STMessageCenter?.PROTOCOL === PROTOCOL) return;
  const TYPES = Object.freeze({ notification: "通知", interactive: "交互" });
  const LEVELS = Object.freeze({ info: "普通", success: "成功", warning: "警告", error: "错误" });
  const STATES = Object.freeze({ preparing: "正在投递", waiting: "待处理", handled: "已操作", expired: "已超时", cancelled: "已终止" });
  const ICONS = Object.freeze({
    clear: "images/ui/message-clear-unread.svg", mute: "images/ui/message-mute.svg",
    upgrade: "images/ui/message-upgrade.svg", view: "images/ui/message-view.svg",
    read: "images/ui/message-read.svg", retry: "images/ui/message-retry.svg", delete: "images/ui/delete.svg",
  });
  function text(value, name, max, optional = false) {
    if (optional && value === undefined) return "";
    if (typeof value !== "string" || value.length > max || (!optional && !value.trim())) throw new TypeError("消息" + name + "无效");
    return value;
  }
  const id = value => text(value, " ID", 200);
  function compare(a, b) { return b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0); }
  function context(value) {
    if (value === undefined) return {};
    let count = 0;
    function copy(item, depth) {
      if (++count > 128 || depth > 4) throw new TypeError("消息业务引用过大");
      if (item === null || typeof item === "boolean" || typeof item === "string") return item;
      if (typeof item === "number" && Number.isFinite(item)) return item;
      if (Array.isArray(item)) return item.map(next => copy(next, depth + 1));
      if (!item || Object.prototype.toString.call(item) !== "[object Object]") throw new TypeError("消息业务引用必须是 JSON 数据");
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
  function link(value) {
    const url = new URL(text(value, "链接", 4096));
    if (url.protocol !== "https:" || url.username || url.password) throw new TypeError("消息链接必须是无凭据的 HTTPS 地址");
    return url.href;
  }
  function action(input) {
    if (!input || !["command", "link"].includes(input.kind)) throw new TypeError("消息按钮类型无效");
    if (!Object.hasOwn(ICONS, input.icon)) throw new TypeError("消息按钮图标无效");
    return { id: id(input.id), label: text(input.label, "按钮名称", 100), icon: input.icon, kind: input.kind,
      target: id(input.target) };
  }
  function interaction(value) {
    if (!value || !Object.hasOwn(STATES, value.state)) throw new TypeError("消息交互状态无效");
    const deadline = value.deadline ?? 0;
    if (!Number.isSafeInteger(deadline) || deadline < 0) throw new TypeError("消息截止时间无效");
    return { state: value.state, deadline, waiting: value.waiting === true };
  }
  /** 标准消息只在可信模块发送或更新时校验；通知没有按钮或交互字段 */
  function message(input) {
    if (!input || !Object.hasOwn(TYPES, input.kind) || !Object.hasOwn(LEVELS, input.level)) throw new TypeError("消息类型或级别无效");
    if (!Number.isSafeInteger(input.createdAt) || input.createdAt <= 0) throw new TypeError("消息时间无效");
    if (!["device", "steam-account"].includes(input.scope)) throw new TypeError("消息范围无效");
    if (input.scope === "steam-account" && (typeof input.steamAccountId !== "string" || !/^\d{17}$/.test(input.steamAccountId))) throw new TypeError("消息 Steam 账号无效");
    const value = {
      version: 3, id: id(input.id), moduleId: id(input.moduleId), moduleTitle: text(input.moduleTitle, "模块名称", 100),
      icon: text(input.icon, "模块图标", 300), brand: input.brand === true,
      title: text(input.title, "标题", 603), body: text(input.body, "正文", 20000),
      kind: input.kind, level: input.level, scope: input.scope, createdAt: input.createdAt,
      ...(input.scope === "steam-account" ? { steamAccountId: input.steamAccountId } : {}),
      context: context(input.context), ...(input.group === undefined ? {} : { group: id(input.group) }),
      details: input.details === undefined ? [] : input.details.map(row => ({
        label: text(row.label, "说明名称", 100), value: text(row.value, "说明内容", 2000, true),
      })),
    };
    if (input.kind === "notification") {
      if (input.actions !== undefined || input.interaction !== undefined) throw new TypeError("通知不能包含业务按钮或交互属性");
    } else {
      if (!Array.isArray(input.actions) || !input.actions.length) throw new TypeError("交互消息至少需要一个按钮");
      const seen = new Set();
      value.actions = input.actions.map(item => { const next = action(item); if (seen.has(next.id)) throw new TypeError("消息按钮 ID 重复"); seen.add(next.id); return next; });
      if (input.interaction !== undefined) value.interaction = interaction(input.interaction);
    }
    return value;
  }
  const content = value => value.body;
  const preview = value => value.preview === undefined ? content(value).replace(/\s+/gu, " ").trim().slice(0, 2000) : value.preview;
  const searchText = value => value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
  function searchTokens(value) {
    const chars = Array.from(searchText(value)), tokens = new Set();
    for (let i = 0; i < chars.length; i++) { tokens.add(chars[i]); if (i + 1 < chars.length) tokens.add(chars[i] + chars[i + 1]); }
    return [...tokens];
  }
  function list(input = {}) {
    const filter = input.filter ?? "all", kind = input.kind || null, level = input.level || null;
    if (!["all", "unread", "read"].includes(filter) || (kind !== null && !Object.hasOwn(TYPES, kind)) || (level !== null && !Object.hasOwn(LEVELS, level))) throw new TypeError("消息筛选条件无效");
    const before = input.before ?? null;
    if (before !== null && (!Array.isArray(before) || before.length !== 2 || !Number.isSafeInteger(before[0]) || before[0] <= 0)) throw new TypeError("消息分页位置无效");
    if (before !== null) id(before[1]);
    return { filter, before, kind, level, origin: input.origin ? id(input.origin) : null, query: searchText(text(input.query ?? "", "搜索词", 200, true)) };
  }
  function t(key, fallback, value) {
    if (root.STI18n) return root.STI18n.text(key, fallback, value === undefined ? undefined : { value });
    const translated = root.chrome?.i18n?.getMessage(key.replace(/\./g, "_"), value === undefined ? undefined : [String(value)]);
    return translated || fallback.replace(/\$value\$/g, String(value));
  }
  function presentation(value) { return { title: value.title, icon: value.icon, brand: value.brand, origin: value.moduleId }; }
  function origins(modules = []) { return modules.map(item => ({ id: item.id, title: item.title })); }
  root.STMessageCenter = Object.freeze({
    FEATURE: "message-center", ROUTE: "MESSAGE_CENTER", BRIDGE: "steam-buff-message-center-v1", PROTOCOL,
    OPEN_CHANNEL: "steam-buff-message-center-open-v1",
    DATABASE: "SteamBuffMessageCenter", DATABASE_VERSION: 5,
    STATE_KEY: "steam_buff_message_center_state_v1", IDENTITY_KEY: "steam_buff_message_identity_revision_v1",
    PAGE_SIZE: 20, RETENTION_MS: 30 * 86400000, READ_LIMIT: 300,
    READ_ACTIONS: Object.freeze(["summary", "list", "get", "read", "read-all", "delete", "delete-all", "act"]),
    TYPES, LEVELS, STATES, ICONS, id, subtitle: value => text(value, "标题", 500), compare, message, list, action, interaction, context, link,
    text: t, presentation, origins, content, preview, searchText, searchTokens,
  });
})(globalThis);
