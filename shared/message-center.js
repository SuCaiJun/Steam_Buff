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
  const RESULTS = Object.freeze(["info", "pending", "success", "error"]);
  const ORIGINS = Object.freeze({
    family: Object.freeze({ key: "messageCenter.familySource", title: "家庭库自动更新", icon: "images/features/family-library-owned-marker.svg", brand: false }),
    update: Object.freeze({ key: "messageCenter.updateSource", title: "Steam Buff 更新", icon: "images/icon.png", brand: true }),
  });
  const CATALOG = Object.freeze({
    "family-library-result": Object.freeze({ origin: "family", scope: "steam-account", results: ["success", "error"], actions: ["retry", "login", "read"] }),
    "family-library-login": Object.freeze({ origin: "family", scope: "device", results: ["error"], actions: ["retry", "login", "read"] }),
    "extension-update-available": Object.freeze({ origin: "update", scope: "device", results: ["info"], actions: ["go-update", "ignore-version"] }),
    "extension-update-installed": Object.freeze({ origin: "update", scope: "device", results: ["success"], actions: ["view-changelog", "mark-read"] }),
  });
  const ACTIONS = Object.freeze({
    retry: { key: "familyTask.retry", label: "重试", kind: "command", icon: "retry" },
    login: { key: "familyTask.login", label: "打开商店", kind: "link", icon: "view", url: () => root.STConfig.vendors.steamStore.familyManagement() },
    read: { key: "messageCenter.markRead", label: "已读", kind: "read", icon: "read" },
    "mark-read": { key: "messageCenter.markRead", label: "已读", kind: "read", icon: "read" },
    "go-update": { key: "messageCenter.goUpdate", label: "去更新", kind: "link", icon: "upgrade", url: () => root.STConfig.urls.updatePage },
    "ignore-version": { key: "messageCenter.ignoreVersion", label: "不再提醒", kind: "command", icon: "mute" },
    "view-changelog": { key: "messageCenter.view", label: "查看", kind: "link", icon: "view", url: () => root.STConfig.urls.updateChangelog },
  });
  function registeredActions(type, actionIds) {
    const entry = Object.hasOwn(CATALOG, type) ? CATALOG[type] : null;
    if (!entry || !Array.isArray(actionIds)) throw new TypeError("消息动作目录无效");
    return actionIds.map(actionId => {
      if (typeof actionId !== "string" || !entry.actions.includes(actionId)) throw new TypeError("消息动作未登记");
      const action = ACTIONS[actionId];
      return { id: actionId, kind: action.kind, label: t(action.key, action.label), icon: action.icon, ...(action.url ? { url: action.url() } : {}) };
    });
  }

  /** 集中目录只定义已接入的生产者；旧自定义来源沿已发布协议使用来源名称和通用图标 */
  function presentation(value) {
    const entry = value.source === "Steam Buff" && Object.hasOwn(CATALOG, value.type) ? CATALOG[value.type] : null;
    if (!entry) return { title: value.source, icon: "images/ui/message-center.svg", brand: false, origin: "legacy:" + value.source };
    const item = ORIGINS[entry.origin];
    return { title: t(item.key, item.title), icon: item.icon, brand: item.brand, origin: entry.origin };
  }
  function origins() { return Object.entries(ORIGINS).map(([id, item]) => ({ id, title: t(item.key, item.title) })); }
  function tone(value) {
    if (value.result !== undefined) {
      if (!RESULTS.includes(value.result)) throw new TypeError("消息结果无效");
      if (value.result === "error") return "error";
    }
    if (value.businessState === "pending") return "pending";
    if (value.businessState === "completed" || value.businessState === "approved") return "success";
    if (value.result !== undefined) return value.result;
    if (value.source === "Steam Buff") {
      if (value.type === "family-library-login") return "error";
      if (value.type === "extension-update-installed") return "success";
      // 已发布家庭库契约：失败带 retry，成功只带 read；不从翻译后的正文猜结果
      if (value.type === "family-library-result") {
        if (value.actions?.some(action => action.id === "retry" && action.kind === "command")) return "error";
        if (value.actions?.some(action => action.id === "read" && action.kind === "read")) return "success";
      }
    }
    return "info";
  }
  function content(value) {
    if (value.format === 2) return value.body;
    // 第一版原文保留在存储中，只在这个适配点拼成连续内容，不保留旧副标题布局
    return [value.title, value.summary, value.body].filter((part, index, all) => part && all.indexOf(part) === index).join("\n");
  }
  function preview(value) {
    if (value.preview !== undefined) return text(value.preview, "预览", 2000, true);
    return content(value).replace(/\s+/gu, " ").trim().slice(0, 2000);
  }
  function searchText(value) { return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim(); }
  // 写入时派生一/二字符索引；查询先定位候选，不在输入回调中扫描全部消息正文
  function searchTokens(value) {
    const chars = Array.from(searchText(value)), tokens = new Set();
    for (let i = 0; i < chars.length; i++) { tokens.add(chars[i]); if (i + 1 < chars.length) tokens.add(chars[i] + chars[i + 1]); }
    return [...tokens];
  }

  /** 新生产入口只接收业务内容和已登记动作 ID，展示定义由目录产生；旧 notify/publish 仍读取已发布格式 */
  function create(input) {
    const allowed = ["type", "body", "result", "actions", "scope", "steamAccountId", "context", "group", "businessState", "id", "eventId", "createdAt"];
    if (!input || typeof input !== "object" || Object.keys(input).some(key => !allowed.includes(key))) throw new TypeError("注册消息包含未允许的字段");
    const entry = Object.hasOwn(CATALOG, input.type) ? CATALOG[input.type] : null;
    if (!entry) throw new TypeError("消息类型未登记");
    if (!entry.results.includes(input.result)) throw new TypeError("此消息类型不支持该结果");
    if (input.scope !== undefined && input.scope !== entry.scope) throw new TypeError("注册消息范围不符");
    if (!Array.isArray(input.actions)) throw new TypeError("注册消息必须明确提供动作列表");
    const actions = registeredActions(input.type, input.actions);
    const title = presentation({ source: "Steam Buff", type: input.type }).title;
    const body = text(input.body, "正文", 20000);
    const value = message({ ...input, source: "Steam Buff", scope: entry.scope, format: 2, title, body, summary: body.replace(/\s+/gu, " ").trim().slice(0, 2000), actions,
      id: input.id === undefined ? input.eventId === undefined ? "notification:" + root.crypto.randomUUID() : id(input.eventId) : input.id,
      createdAt: input.createdAt === undefined ? Date.now() : input.createdAt });
    return { ...value, ...(input.eventId === undefined ? {} : { eventId: id(input.eventId) }) };
  }

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
    if (input.format !== undefined && input.format !== 2) throw new TypeError("消息格式版本无效");
    if (input.result !== undefined && !RESULTS.includes(input.result)) throw new TypeError("消息结果无效");
    if (input.format === 2 && (input.source !== "Steam Buff" || !Object.hasOwn(CATALOG, input.type) || !CATALOG[input.type].results.includes(input.result))) throw new TypeError("注册消息契约无效");
    return {
      id: id(input.id), source: text(input.source, "来源", 100), type: text(input.type, "类型", 100),
      title: text(input.title, "标题", 500), summary: text(input.summary, "摘要", 2000, true),
      body: text(input.body, "正文", 20000, true), createdAt: input.createdAt,
      ...(input.format === undefined ? {} : { format: input.format }), ...(input.result === undefined ? {} : { result: input.result }),
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
    if (!["all", "unread", "read"].includes(filter)) throw new TypeError("消息筛选条件无效");
    const before = input.before === undefined ? null : input.before;
    if (before !== null && (!Array.isArray(before) || before.length !== 2 || !Number.isSafeInteger(before[0]) || before[0] <= 0)) {
      throw new TypeError("消息分页位置无效");
    }
    if (before !== null) id(before[1]);
    const query = input.query === undefined ? "" : searchText(text(input.query, "搜索词", 200, true));
    const origin = input.origin === undefined || input.origin === "" ? null : input.origin;
    if (origin !== null && !Object.hasOwn(ORIGINS, origin)) throw new TypeError("消息来源筛选无效");
    const outcome = input.result === undefined || input.result === "" ? null : input.result;
    if (outcome !== null && !RESULTS.includes(outcome)) throw new TypeError("消息结果筛选无效");
    return { filter, before, query, origin, result: outcome };
  }

  root.STMessageCenter = Object.freeze({
    FEATURE: "message-center", ROUTE: "MESSAGE_CENTER", BRIDGE: "steam-buff-message-center-v1",
    DATABASE: "SteamBuffMessageCenter", DATABASE_VERSION: 4, STATE_KEY: "steam_buff_message_center_state_v1", PAGE_SIZE: 20,
    IDENTITY_KEY: "steam_buff_message_identity_revision_v1",
    RETENTION_MS: 30 * 24 * 60 * 60 * 1000, READ_LIMIT: 300,
    READ_ACTIONS: Object.freeze(["summary", "list", "get", "read", "read-all", "delete", "delete-all", "act"]),
    ICONS, BUSINESS_STATES, RESULTS, id, compare, message, create, list, action: normalizeAction, registeredActions, context, businessState, link, text: t, presentation, origins, tone, content, preview, searchText, searchTokens,
  });
})(globalThis);
