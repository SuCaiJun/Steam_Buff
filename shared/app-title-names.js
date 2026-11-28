/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店与社区游戏标题名称查询契约
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

((root) => {
  "use strict";

  const FEATURE = "store-title-custom-name";
  const COMMUNITY = "store-title-community-fallback";
  const AI = "store-title-community-fallback-ai";

  function text(value) {
    return String(value?.textContent ?? value ?? "").replace(/\s+/g, " ").trim();
  }

  function nameEqual(a, b) {
    return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  }

  function shouldShowName(item, steamTitle) {
    if (!item || item.name_source === "none") return false;
    const name = text(item.name);
    return !!name && !nameEqual(name, steamTitle);
  }

  /** 保留已支持的旧字段。最终来源优先级由名称接口决定 */
  function decorateName(item) {
    if (!item || typeof item !== "object") return item;
    const name = text(item.name || item.mine);
    const source = text(item.source || item.name_source) || "none";
    return { ...item, name, name_source: source, mine: source === "mine" ? name : "" };
  }

  /** 生成显示时允许的来源，编辑器只读取自己保存的名称 */
  function sources(settings, editor = false) {
    if (editor || settings[COMMUNITY] === false) return "mine";
    return settings[AI] === true ? "mine,community,ai" : "mine,community";
  }

  function url(sourceList) {
    return `${root.STConfig.steamBuff("/store/names")}?sources=${encodeURIComponent(sourceList)}`;
  }

  function splitAliasDraft(value) {
    return String(value || "")
      .split(/[\s,，]+/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  function keepAliases(aliases, extra, max) {
    const out = [];
    for (const value of [...(aliases || []), ...(extra || [])]) {
      const name = String(value || "").trim();
      if (name && !out.includes(name) && out.length < max) out.push(name);
    }
    return out;
  }

  const buttonCss = `
      .st-title-custom-name-btn {
        height: 22px;
        border: 1px solid var(--st-color-border-primary);
        border-radius: 2px;
        padding: 0 8px;
        color: var(--st-color-text-secondary);
        background: var(--st-color-primary-surface);
        cursor: pointer;
        font-size: 12px;
        line-height: 20px;
        white-space: nowrap;
      }
      .st-title-custom-name-btn:hover {
        color: var(--st-color-white);
        border-color: var(--st-color-border-primary-strong);
        background: var(--st-color-primary-surface-hover);
      }
  `;

  const api = Object.freeze({
    FEATURE, COMMUNITY, AI, text, nameEqual, shouldShowName, decorateName, sources, url,
    splitAliasDraft, keepAliases, buttonCss,
  });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.STAppTitleNames = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
