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
    const tipIconUrl = options.tipIconUrl;
    const helpIconUrl = options.helpIconUrl;
    const drawerIconUrl = options.drawerIconUrl;
    const featureIconHtml = options.featureIconHtml;
    const helpUrl = typeof options.helpUrl === "function"
      ? options.helpUrl
      : (item, key) => {
          const search = globalThis.STConfig?.urls?.helpSearch;
          return search?.(key || item?.name || "") || "";
        };

    function tr(key, fallback, params) {
      return globalThis.STI18n?.text?.(key, fallback, params) || String(fallback ?? key ?? "");
    }

    function itemName(item) {
      return tr(item?.nameKey, item?.name || "");
    }

    function itemDesc(item) {
      return tr(item?.descKey, item?.desc || "");
    }

    function itemBadge(item) {
      return tr(item?.badgeKey, item?.badge || "");
    }

    function switchHtml(item) {
      const checked = item.disabled === true ? false : state(item.id) !== false;
      const enabled = available(item);
      const name = itemName(item);
      const tip = enabled ? name : lockText(item);
      return `
        <button class="switch" type="button" role="switch" aria-checked="${checked ? "true" : "false"}" data-feature="${escAttr(item.id)}" aria-label="${escAttr(name)}" title="${escAttr(tip)}" ${enabled ? "" : "disabled"}>
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

    function helpKey(value, item) {
      if (value === true) {
        return String(itemName(item) || item?.id || "").trim();
      }
      return String(value || "").trim();
    }

    function customUrl(value, key, item) {
      if (typeof value === "function") {
        return value(key, item);
      }
      return value;
    }

    function helpMeta(item) {
      const help = item?.help;
      const helpObj = help && typeof help === "object" ? help : null;
      const raw = helpObj
        ? helpObj.key
        : help;
      const key = helpKey(raw, item);
      const url = customUrl(helpObj?.url, key, item);
      return Object.freeze({
        key: key || (url ? helpKey(true, item) : ""),
        url: String(url || "").trim(),
      });
    }

    function helpLinkHtml(item) {
      const meta = helpMeta(item);
      if (!meta.key && !meta.url) return "";
      const href = String(meta.url || helpUrl(item, meta.key) || "").trim();
      if (!href) return "";
      const label = `查看教程：${meta.key || itemName(item) || "教程"}`;
      return `
        <a class="feature-tutorial" href="${escAttr(href)}" target="_blank" rel="noreferrer noopener" title="${escAttr(label)}" aria-label="${escAttr(label)}">
          <img class="feature-tutorial-icon" src="${escAttr(helpIconUrl())}" alt="" aria-hidden="true">
        </a>
      `;
    }

    function itemHtml(cat, item) {
      const enabled = available(item);
      const tip = enabled ? "" : lockText(item);
      const badgeClass = item.member === true ? "feature-badge member" : "feature-badge";
      const badge = item.badge ? itemBadge(item) : "";
      return `
        <article class="feature toggle-row${enabled ? "" : " disabled"}"${tip ? ` title="${escAttr(tip)}"` : ""}>
          <div class="feature-main row-info">
            <div class="feature-title row-name">
              <span>${esc(itemName(item))}</span>
              ${badge ? `<span class="${badgeClass}">${esc(badge)}</span>` : ""}
              ${helpLinkHtml(item)}
              ${enabled ? "" : `<span class="feature-lock">${esc(tip)}</span>`}
            </div>
            <div class="feature-desc row-desc">${sourceTipHtml(item)}<span>${esc(itemDesc(item))}</span></div>
          </div>
          ${switchHtml(item)}
        </article>
      `;
    }

    function masterItemHtml(item) {
      return `
        <article class="feature master-toggle">
          <div class="icon-pad">${featureIconHtml(item.id)}</div>
          <div class="feature-main row-info">
            <div class="feature-title row-name"><span>${esc(itemName(item))}</span>${helpLinkHtml(item)}</div>
            <div class="feature-desc row-desc">${sourceTipHtml(item)}<span>${esc(itemDesc(item))}</span></div>
          </div>
          ${switchHtml(item)}
        </article>
      `;
    }

    function drawerItemHtml(item, bodyHtml) {
      const enabled = available(item);
      const tip = enabled ? "" : lockText(item);
      const open = false;
      const badgeClass = item.member === true ? "feature-badge member" : "feature-badge";
      const badge = item.badge ? itemBadge(item) : "";
      const drawerId = `settings-drawer-${String(item.id || "").replace(/[^a-z0-9_-]/gi, "-")}`;
      return `
        <section class="settings-drawer${open ? " open" : ""}" data-settings-drawer="${escAttr(item.id)}">
          <article class="feature master-toggle settings-drawer-head${enabled ? "" : " disabled"}" data-settings-drawer-head${tip ? ` title="${escAttr(tip)}"` : ""}>
            <div class="icon-pad">${featureIconHtml(item.id)}</div>
            <div class="feature-main row-info">
              <div class="feature-title row-name">
                <span>${esc(itemName(item))}</span>
                ${badge ? `<span class="${badgeClass}">${esc(badge)}</span>` : ""}
                ${helpLinkHtml(item)}
                ${enabled ? "" : `<span class="feature-lock">${esc(tip)}</span>`}
              </div>
              <div class="feature-desc row-desc">${sourceTipHtml(item)}<span>${esc(itemDesc(item))}</span></div>
            </div>
            <div class="settings-drawer-actions">
              <button class="settings-drawer-toggle" type="button" data-settings-drawer-toggle="${escAttr(item.id)}" aria-controls="${escAttr(drawerId)}" aria-expanded="${open ? "true" : "false"}" title="${escAttr(open ? "收起" : "展开")}" aria-label="${escAttr(open ? "收起子功能" : "展开子功能")}">
                <img class="settings-drawer-icon" src="${escAttr(drawerIconUrl())}" alt="" aria-hidden="true">
              </button>
              ${switchHtml(item)}
            </div>
          </article>
          <div class="settings-drawer-content" id="${escAttr(drawerId)}">
            <div class="settings-drawer-body">
              ${bodyHtml || ""}
            </div>
          </div>
        </section>
      `;
    }

    return Object.freeze({ itemHtml, masterItemHtml, drawerItemHtml, sourceTipHtml, switchHtml, helpLinkHtml });
  }

  const api = Object.freeze({ create });
  globalThis.STSettingsFeatureRow = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
