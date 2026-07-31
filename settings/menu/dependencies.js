/*
 * @Author        : Ricky
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

  function featureIconHtml(id) {
    const url = root.STSettingsAssets.featureIcon(id);
    const safeUrl = root.STSettingsHtml?.escAttr?.(url) || String(url);
    return `<img class="feature-icon-img" src="${safeUrl}" alt="" aria-hidden="true">`;
  }

  function create(options = {}) {
    const catalog = options.catalog || root.STSettings?.catalog || {};
    const getStates = typeof options.getStates === "function" ? options.getStates : () => ({});
    const getMembership = typeof options.getMembership === "function" ? options.getMembership : () => ({ active: false, features: {} });
    const membershipGate = root.STSettingsMembership || root.STSettings?.membership || {};
    const esc = fallback(options.esc, "esc");
    const escAttr = fallback(options.escAttr, "escAttr");
    const tipIconUrl = options.tipIconUrl;
    const helpIconUrl = options.helpIconUrl;
    const drawerIconUrl = options.drawerIconUrl;
    const helpUrl = typeof options.helpUrl === "function" ? options.helpUrl : () => "";
    let rows = null;

    function tr(key, fallback, params) {
      return root.STI18n.text(key, fallback, params);
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
          helpIconUrl,
          drawerIconUrl,
          available,
          depNames,
          lockText,
          state,
          featureIconHtml,
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

    function masterItemHtml(item) {
      return featureRows().masterItemHtml?.(item) || "";
    }

    function drawerItemHtml(item, bodyHtml) {
      return featureRows().drawerItemHtml?.(item, bodyHtml) || "";
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
