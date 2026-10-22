/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : 游戏相关链接目录、配置契约和 URL 模板解析
 * @File          : 游戏相关链接共享模型
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const KEY = root.STConfig.gameLinks.key;
  const TOKENS = Object.freeze(["APPID", "GAME_NAME", "CUSTOM_NAME"]);
  const TOKEN_RE = /\{(APPID|GAME_NAME|CUSTOM_NAME)\}/g;
  const TYPES = Object.freeze(["web", "qrcode"]);
  const SCOPES = Object.freeze(["all", "store", "library"]);
  const presets = Object.freeze([
    ["itad", "IsThereAnyDeal", true],
    ["steamdb", "SteamDB", true],
    ["pcgamingwiki", "PCGamingWiki", true],
    ["bilibili", "Bilibili", true],
    ["baidu", "百度搜索", true],
    ["steam-guides", "Steam 社区指南", true],
    ["protondb", "ProtonDB", false],
    ["youtube", "YouTube", false],
  ].map(([id, name, enabled]) => Object.freeze({ id, name, enabled })));
  const byId = new Map(presets.map(item => [item.id, item]));
  // 旧配置和备份中的三个已下线内置项只在读取时移除，不影响自定义链接。
  const retiredIds = new Set(["metacritic", "opencritic", "hltb"]);
  const validationCodes = new Set(["URL_INVALID", "URL_REQUIRED", "TOKEN_LOCATION", "TOKEN_UNKNOWN", "CONFIG_INVALID", "NAME_REQUIRED", "APPID_REQUIRED", "GAME_NAME_REQUIRED", "GAME_NAME_INVALID"]);

  function invalid(code, cause) {
    const error = new TypeError(code, cause ? { cause } : undefined);
    error.code = code;
    return error;
  }

  function webUrl(value) {
    if (typeof value !== "string" || !/^https?:\/\//i.test(value) || /[\u0000-\u001f\u007f]/.test(value)) {
      throw invalid("URL_INVALID");
    }
    let url;
    try { url = new URL(value); } catch (error) { throw invalid("URL_INVALID", error); }
    if (!url.hostname || url.username || url.password) throw invalid("URL_INVALID");
    return url;
  }

  /** 网址占位符仅允许位于路径、查询参数和片段；校验不访问网络。 */
  function validateTemplate(value) {
    if (typeof value !== "string" || !value.trim()) throw invalid("URL_REQUIRED");
    if (/[\u0000-\u001f\u007f]/.test(value)) throw invalid("URL_INVALID");
    const template = value.trim();
    const authority = template.match(/^[^/]*\/\/[^/?#]*/)?.[0] || "";
    if (/[{}]/.test(authority)) throw invalid("TOKEN_LOCATION");
    const replaced = template.replace(/\{([^{}]*)\}/g, (_token, name) => {
      if (!TOKENS.includes(name)) throw invalid("TOKEN_UNKNOWN");
      return "value";
    });
    if (/[{}]/.test(replaced)) throw invalid("TOKEN_UNKNOWN");
    webUrl(replaced);
    return template;
  }

  function defaults() {
    return { columns: 1, items: presets.map(({ id, enabled }) => ({ id, enabled, type: "web", scope: "all" })) };
  }

  /** 严格检查配置；内置项的 name/urlTemplate 为可选覆盖，旧配置缺少 columns 时迁移为单列 */
  function normalize(value) {
    if (value === undefined) return defaults();
    if (!value || typeof value !== "object" || !Array.isArray(value.items)) throw invalid("CONFIG_INVALID");
    const columns = Object.hasOwn(value, "columns") ? value.columns : 1;
    if (columns !== 1 && columns !== 2) throw invalid("CONFIG_INVALID");
    const previousRemoved = Object.hasOwn(value, "removedBuiltins") ? value.removedBuiltins : [];
    if (!Array.isArray(previousRemoved) || previousRemoved.some(id => !byId.has(id) && !retiredIds.has(id)) || new Set(previousRemoved).size !== previousRemoved.length) throw invalid("CONFIG_INVALID");
    const removed = previousRemoved.filter(id => !retiredIds.has(id));
    const removedIds = new Set(removed);
    const seen = new Set();
    const items = value.items.filter(item => !retiredIds.has(item?.id)).map(item => {
      if (!item || typeof item.id !== "string" || seen.has(item.id) || typeof item.enabled !== "boolean") {
        throw invalid("CONFIG_INVALID");
      }
      seen.add(item.id);
      const type = Object.hasOwn(item, "type") ? item.type : "web";
      const scope = Object.hasOwn(item, "scope") ? item.scope : "all";
      if (!TYPES.includes(type) || !SCOPES.includes(scope)) throw invalid("CONFIG_INVALID");
      const builtin = byId.has(item.id);
      if (builtin && removedIds.has(item.id)) throw invalid("CONFIG_INVALID");
      if (!builtin && !/^custom-[a-zA-Z0-9-]+$/.test(item.id)) throw invalid("NAME_REQUIRED");
      const entry = { id: item.id, enabled: item.enabled, type, scope };
      if (!builtin || Object.hasOwn(item, "name")) {
        if (typeof item.name !== "string" || !item.name.trim()) throw invalid("NAME_REQUIRED");
        entry.name = item.name.trim();
      }
      if (!builtin || Object.hasOwn(item, "urlTemplate")) entry.urlTemplate = validateTemplate(item.urlTemplate);
      return entry;
    });
    for (const { id, enabled } of presets) {
      if (!seen.has(id) && !removedIds.has(id)) items.push({ id, enabled, type: "web", scope: "all" });
    }
    return removed.length ? { columns, items, removedBuiltins: removed.slice() } : { columns, items };
  }

  /** 删除内置项时记录其 id，防止归一化补回；恢复默认会清除此记录。 */
  function remove(value, id) {
    const next = normalize(value);
    if (!next.items.some(item => item.id === id)) return next;
    next.items = next.items.filter(item => item.id !== id);
    if (byId.has(id)) next.removedBuiltins = [...(next.removedBuiltins || []), id];
    return next;
  }

  function resetBuiltins(value) {
    const current = normalize(value);
    return { columns: current.columns, items: [...defaults().items, ...current.items.filter(item => !byId.has(item.id))] };
  }

  function tokenValue(key, context) {
    const gameName = String(context.gameName ?? "").trim();
    const value = key === "APPID" ? String(context.appId ?? "")
      : key === "CUSTOM_NAME" ? String(context.customName ?? "").trim() || gameName : gameName;
    if (key === "APPID" && (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))) throw invalid("APPID_REQUIRED");
    if (key !== "APPID" && !value) throw invalid("GAME_NAME_REQUIRED");
    return value;
  }

  /** 名称按原文替换三个已知占位符，保留其他文字和花括号，不进行网址编码。 */
  function expandName(template, context = {}) {
    return String(template).replace(TOKEN_RE, (_token, key) => tokenValue(key, context));
  }

  /** 先编码每个替换值，再验证最终地址，防止名称注入参数或片段。 */
  function expand(template, context = {}) {
    return webUrl(validateTemplate(template).replace(TOKEN_RE, (_token, key) => {
      const value = tokenValue(key, context);
      try { return encodeURIComponent(value); } catch (error) { throw invalid("GAME_NAME_INVALID", error); }
    })).href;
  }

  function definition(item) {
    const preset = byId.get(item.id);
    return preset ? { ...item,
      name: Object.hasOwn(item, "name") ? item.name : preset.name,
      urlTemplate: Object.hasOwn(item, "urlTemplate") ? item.urlTemplate : root.STConfig.gameLinkTemplates[item.id] || "",
      builtin: true
    } : { ...item, builtin: false };
  }

  /** 编辑与展示共用网址模板，仅替换占位符，不请求或切换地址。 */
  function resolve(item, context = {}) {
    const entry = definition(item);
    if (!entry.builtin || Object.hasOwn(item, "name")) entry.name = expandName(entry.name, context);
    return { ...entry, url: expand(entry.urlTemplate, context) };
  }

  root.STGameLinks = Object.freeze({ KEY, TOKENS, presets, defaults, normalize, remove, resetBuiltins, validateTemplate, expand, expandName, definition, resolve,
    TYPES, SCOPES, visible: (item, surface) => item.enabled && (item.scope === "all" || item.scope === surface),
    isValidationError: error => error?.name === "TypeError" && validationCodes.has(error.code),
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
