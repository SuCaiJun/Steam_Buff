/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置面板|功能开关行
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  function fallback(value, name) {
    if (typeof value === "function") {
      return value;
    }
    return globalThis.STSettingsHtml?.[name] || ((text) => String(text ?? ""));
  }

  function create(options = {}) {
    const esc = fallback(options.esc, "esc");
    const escAttr = fallback(options.escAttr, "escAttr");
    const available = typeof options.available === "function" ? options.available : () => true;
    const depNames = typeof options.depNames === "function" ? options.depNames : () => "上级开关";
    const lockText = typeof options.lockText === "function" ? options.lockText : (item) => item.lock || `需开启 ${depNames(item)}`;
    const state = typeof options.state === "function" ? options.state : () => true;
    const tipIconUrl = typeof options.tipIconUrl === "function" ? options.tipIconUrl : () => "";
    const masterIcon = typeof options.masterIcon === "function" ? options.masterIcon : () => "";
    const tutorialUrl = typeof options.tutorialUrl === "function"
      ? options.tutorialUrl
      : (item, keyword) => globalThis.STConfig?.urls?.tutorialSearch?.(keyword || item?.name || "") || "";

    function switchHtml(item) {
      const checked = item.disabled === true ? false : state(item.id) !== false;
      const enabled = available(item);
      const tip = enabled ? item.name : lockText(item);
      return `
        <button class="switch" type="button" role="switch" aria-checked="${checked ? "true" : "false"}" data-feature="${escAttr(item.id)}" aria-label="${escAttr(item.name)}" title="${escAttr(tip)}" ${enabled ? "" : "disabled"}>
          <span class="knob"></span>
        </button>
      `;
    }

    function sourceTipHtml(item) {
      const tip = String(item?.sourceTip || "").trim();
      if (!tip) return "";
      return `
        <span class="source-tip" tabindex="0" aria-label="${escAttr(tip)}">
          <img class="source-tip-icon" src="${escAttr(tipIconUrl())}" alt="" aria-hidden="true">
          <span class="source-tip-popover" role="tooltip">${esc(tip)}</span>
        </span>
      `;
    }

    function tutorialIcon() {
      return `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9"/>
          <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4"/>
          <circle cx="12" cy="17.5" r="0.6" fill="currentColor" stroke="none"/>
        </svg>
      `;
    }

    function tutorialKeyword(item) {
      const raw = item?.tutorialKeyword ?? item?.tutorial?.keyword ?? item?.tutorial;
      if (raw === true) {
        return String(item?.name || item?.id || "").trim();
      }
      return String(raw || "").trim();
    }

    function tutorialLinkHtml(item) {
      const keyword = tutorialKeyword(item);
      if (!keyword) return "";
      const custom = typeof item?.tutorialUrl === "function"
        ? item.tutorialUrl(keyword, item)
        : typeof item?.tutorial?.url === "function"
          ? item.tutorial.url(keyword, item)
          : item?.tutorialUrl ?? item?.tutorial?.url;
      const href = String(custom || tutorialUrl(item, keyword) || "").trim();
      if (!href) return "";
      const label = `查看教程：${keyword}`;
      return `
        <a class="feature-tutorial" href="${escAttr(href)}" target="_blank" rel="noreferrer noopener" title="${escAttr(label)}" aria-label="${escAttr(label)}">
          ${tutorialIcon()}
        </a>
      `;
    }

    function itemHtml(cat, item) {
      const enabled = available(item);
      const tip = enabled ? "" : lockText(item);
      const badgeClass = item.member === true ? "feature-badge member" : "feature-badge";
      return `
        <article class="feature toggle-row${enabled ? "" : " disabled"}"${tip ? ` title="${escAttr(tip)}"` : ""}>
          <div class="feature-main row-info">
            <div class="feature-title row-name">
              <span>${esc(item.name)}</span>
              ${item.badge ? `<span class="${badgeClass}">${esc(item.badge)}</span>` : ""}
              ${tutorialLinkHtml(item)}
              ${enabled ? "" : `<span class="feature-lock">${esc(tip)}</span>`}
            </div>
            <div class="feature-desc row-desc">${sourceTipHtml(item)}<span>${esc(item.desc)}</span></div>
          </div>
          ${switchHtml(item)}
        </article>
      `;
    }

    function masterItemHtml(item, kind) {
      return `
        <article class="feature master-toggle">
          <div class="icon-pad">${masterIcon(kind)}</div>
          <div class="feature-main row-info">
            <div class="feature-title row-name"><span>${esc(item.name)}</span>${tutorialLinkHtml(item)}</div>
            <div class="feature-desc row-desc">${sourceTipHtml(item)}<span>${esc(item.desc)}</span></div>
          </div>
          ${switchHtml(item)}
        </article>
      `;
    }

    return Object.freeze({ itemHtml, masterItemHtml, sourceTipHtml, switchHtml, tutorialLinkHtml });
  }

  const api = Object.freeze({ create });
  globalThis.STSettingsFeatureRow = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
