/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置面板|依赖联动与功能行渲染
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  function fallback(value, name) {
    if (typeof value === "function") {
      return value;
    }
    return root.STSettingsHtml?.[name] || ((text) => String(text ?? ""));
  }

  function defaultMasterIcon(kind) {
    if (kind === "ai") {
      return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 2a4 4 0 0 1 4 4v2"/>
          <path d="M8 8V6a4 4 0 0 1 4-4"/>
          <rect x="4" y="8" width="16" height="12" rx="2"/>
          <path d="M9 14h.01"/>
          <path d="M15 14h.01"/>
          <path d="M9 18h6"/>
        </svg>
      `;
    }
    if (kind === "review-filter") {
      return `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 5h18"/>
          <path d="M6 12h12"/>
          <path d="M10 19h4"/>
        </svg>
      `;
    }
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m5 8 6 6"/>
        <path d="M4 14 10 8l2-3"/>
        <path d="M2 5h12"/>
        <path d="M7 2h1"/>
        <path d="m22 22-5-10-5 10"/>
        <path d="M14 18h6"/>
      </svg>
    `;
  }

  function create(options = {}) {
    const catalog = options.catalog || root.STSettings?.catalog || {};
    const getStates = typeof options.getStates === "function" ? options.getStates : () => ({});
    const getMembership = typeof options.getMembership === "function" ? options.getMembership : () => ({ active: false, features: {} });
    const membershipGate = root.STSettingsMembership || root.STSettings?.membership || {};
    const esc = fallback(options.esc, "esc");
    const escAttr = fallback(options.escAttr, "escAttr");
    const tipIconUrl = typeof options.tipIconUrl === "function" ? options.tipIconUrl : () => "";
    const helpUrl = typeof options.helpUrl === "function" ? options.helpUrl : () => "";
    const masterIcon = typeof options.masterIcon === "function" ? options.masterIcon : defaultMasterIcon;
    let rows = null;

    function tr(key, fallback, params) {
      return root.STI18n?.text?.(key, fallback, params) || String(fallback ?? key ?? "");
    }

    function itemName(item) {
      return tr(item?.nameKey, item?.name || "");
    }

    function state(id) {
      return (getStates() || {})[id];
    }

    function memberState() {
      return getMembership() || membershipGate.empty?.() || { active: false, features: {}, identity: "赞助者身份" };
    }

    function dependency(item) {
      return catalog.dependency?.(item) || { mode: "all", ids: [] };
    }

    function depReady(id, seen) {
      if (state(id) === false) {
        return false;
      }
      const item = catalog.featureById?.(id);
      if (!item || seen.has(id)) {
        return true;
      }
      return available(item, seen);
    }

    function available(item, seen = new Set()) {
      if (item?.disabled === true) {
        return false;
      }
      if (membershipGate.canUse?.(item, memberState()) === false) {
        return false;
      }
      const dep = dependency(item);
      if (!dep.ids.length) return true;
      if (item?.id) {
        seen.add(item.id);
      }
      return dep.mode === "any"
        ? dep.ids.some(id => depReady(id, seen))
        : dep.ids.every(id => depReady(id, seen));
    }

    function depNames(item) {
      const dep = dependency(item);
      const sep = dep.mode === "any" ? tr("settings.lock.depOr", " 或 ") : tr("settings.lock.depAnd", " 和 ");
      return dep.ids.map(id => itemName(catalog.featureById?.(id) || {}) || tr("settings.lock.parentSwitch", "上级开关")).join(sep);
    }

    function lockText(item) {
      if (item?.disabled === true) {
        return tr(item.lockKey, item.lock || tr("settings.lock.disabled", "暂不可用"));
      }
      if (membershipGate.canUse?.(item, memberState()) === false) {
        return tr(item.lockKey, membershipGate.lockText?.(item, memberState()) || item.lock || "赞助者身份可用");
      }
      return tr(item.lockKey, item.lock || tr("settings.lock.depRequired", "需开启 $names$", { names: depNames(item) }));
    }

    function depAvailable(id) {
      const item = catalog.featureById?.(id);
      return item ? available(item) : true;
    }

    function dependentIds(id) {
      return catalog.dependentsOf?.(id) || [];
    }

    function featureRows() {
      if (!rows) {
        rows = root.STSettingsFeatureRow?.create?.({
          esc,
          escAttr,
          tipIconUrl,
          available,
          depNames,
          lockText,
          state,
          masterIcon,
          helpUrl,
        }) || {};
      }
      return rows;
    }

    function switchHtml(item) {
      return featureRows().switchHtml?.(item) || "";
    }

    function sourceTipHtml(item) {
      return featureRows().sourceTipHtml?.(item) || "";
    }

    function itemHtml(cat, item) {
      return featureRows().itemHtml?.(cat, item) || "";
    }

    function masterItemHtml(item, kind) {
      return featureRows().masterItemHtml?.(item, kind) || "";
    }

    function drawerItemHtml(cat, item, bodyHtml, options) {
      return featureRows().drawerItemHtml?.(cat, item, bodyHtml, options) || "";
    }

    function helpLinkHtml(item) {
      return featureRows().helpLinkHtml?.(item) || "";
    }

    function featureSwitch(shadow, id) {
      return Array.from(shadow.querySelectorAll(".switch"))
        .find(sw => sw.dataset.feature === id) || null;
    }

    function updateFeature(shadow, id) {
      const item = catalog.featureById?.(id);
      const sw = featureSwitch(shadow, id);
      const row = sw?.closest(".feature");
      if (!item || !sw || !row) {
        return false;
      }

      const enabled = available(item);
      const checked = item.disabled === true ? false : state(id) !== false;
      const tip = enabled ? "" : lockText(item);
      const title = row.querySelector(".feature-title");
      let lock = title?.querySelector(".feature-lock");

      row.classList.toggle("disabled", !enabled);
      if (tip) {
        row.setAttribute("title", tip);
        sw.setAttribute("title", tip);
      } else {
        row.removeAttribute("title");
        sw.setAttribute("title", itemName(item));
      }
      sw.disabled = !enabled;
      sw.setAttribute("aria-checked", checked ? "true" : "false");

      if (!enabled) {
        if (!lock && title) {
          lock = document.createElement("span");
          lock.className = "feature-lock";
          title.appendChild(lock);
        }
        if (lock) {
          lock.textContent = tip;
        }
      } else {
        lock?.remove();
      }

      return true;
    }

    return Object.freeze({
      available,
      depNames,
      lockText,
      depAvailable,
      dependentIds,
      itemHtml,
      masterItemHtml,
      drawerItemHtml,
      sourceTipHtml,
      switchHtml,
      helpLinkHtml,
      updateFeature,
    });
  }

  const api = Object.freeze({ create });
  root.STSettingsMenuDependencies = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
