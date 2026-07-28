/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置面板|商店详情价格图表
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const catalog = root.STPriceComparisonCatalog;
  const log = root.STLoggerFactory?.createLogger?.("settings", "store-price-chart");
  const MAX_STORE_PRICE_SERIES = catalog.MAX_STORE_PRICE_SERIES;
  const CHART_SETTING_VALUES = Object.freeze({
    lowCriterion: Object.freeze(["discount", "price"]),
    lowReferenceScope: Object.freeze(["allRegular", "currentRegular", "recent12Months"]),
  });

  function create(options = {}) {
    const esc = options.esc || root.STSettingsHtml?.esc || ((value) => String(value ?? ""));
    const escAttr = options.escAttr || root.STSettingsHtml?.escAttr || esc;
    const storage = options.storage || root.STSettings?.storage || {};
    const dialog = options.dialog || (() => Promise.resolve());
    const savePrompt = options.savePrompt || (() => Promise.resolve());
    const onThirdPartyChange = options.onThirdPartyChange || (() => {});
    const onChartChange = options.onChartChange || (() => {});
    const chartDefaults = options.catalog?.storePriceChartDefaults?.()
      || root.STSettings?.catalog?.storePriceChartDefaults?.()
      || {};
    let thirdPartyServices = clone(options.thirdPartyServices);
    let chart = normalizeChart(options.storePriceChart);
    let saving = false;

    function clone(value) {
      try {
        return JSON.parse(JSON.stringify(value ?? {}));
      } catch {
        return {};
      }
    }

    function normalizeChart(value) {
      const main = mainCountry();
      const src = value && typeof value === "object" ? value : {};
      const selection = catalog.limitStorePriceSelection({
        mainCountry: main,
        additionalSteamRegions: src.additionalSteamRegions,
        shops: configuredShopIds(),
      });
      return {
        additionalSteamRegions: selection.additionalSteamRegions,
        lowCriterion: src.lowCriterion === "price" ? "price" : "discount",
        lowReferenceScope: ["allRegular", "currentRegular", "recent12Months"].includes(src.lowReferenceScope)
          ? src.lowReferenceScope
          : "currentRegular",
        lineColors: src.lineColors && typeof src.lineColors === "object" && !Array.isArray(src.lineColors)
          ? { ...src.lineColors }
          : {},
      };
    }

    function mainCountry() {
      const cc = String(thirdPartyServices?.isthereanydeal?.country || "CN").toUpperCase();
      return cc === "AUTO" ? "auto" : cc;
    }

    function activeMainCountry() {
      const cc = mainCountry();
      return catalog?.getSteamPriceRegion?.(cc) ? cc : "CN";
    }

    function configuredShopIds() {
      const values = Array.isArray(thirdPartyServices?.isthereanydeal?.shops)
        ? thirdPartyServices.isthereanydeal.shops
        : [61];
      return values;
    }

    function selection() {
      return catalog.limitStorePriceSelection({
        mainCountry: mainCountry(),
        additionalSteamRegions: chart?.additionalSteamRegions,
        shops: configuredShopIds(),
      });
    }

    function shops() {
      return selection().shops;
    }

    function seriesCount() {
      return selection().seriesCount;
    }

    async function showSeriesLimitDialog(shadow) {
      await dialog(shadow, {
        title: `最多 ${MAX_STORE_PRICE_SERIES} 条价格线`,
        message: `Steam 定价区和游戏商店合计最多 ${MAX_STORE_PRICE_SERIES} 条，主 Steam 定价区也计入其中。请先删除一个已添加项。`,
      });
    }

    function setConfigs(next = {}) {
      if (Object.hasOwn(next, "thirdPartyServices")) thirdPartyServices = clone(next.thirdPartyServices);
      if (Object.hasOwn(next, "storePriceChart")) chart = normalizeChart(next.storePriceChart);
    }

    function defaultColor(seriesId) {
      const ids = [
        catalog.steamSeriesId(activeMainCountry()),
        ...chart.additionalSteamRegions.map(catalog.steamSeriesId),
        ...shops().filter(id => id !== 61).map(catalog.shopSeriesId),
      ].filter(Boolean);
      const index = Math.max(0, ids.indexOf(seriesId));
      const colors = root.STTheme?.colors?.chartSeries || ["#66C0F4"];
      return colors[index % colors.length] || "#66C0F4";
    }

    function colorValue(seriesId) {
      const value = String(chart.lineColors?.[seriesId] || "").toUpperCase();
      return /^#[0-9A-F]{6}$/.test(value) ? value : defaultColor(seriesId);
    }

    function colorInput(seriesId, label) {
      return `<input class="store-price-chart-color" type="color" value="${escAttr(colorValue(seriesId))}" data-store-price-chart-color="${escAttr(seriesId)}" aria-label="${escAttr(`${label}线条颜色`)}">`;
    }

    function regionRows() {
      const mainCc = activeMainCountry();
      const rows = [{ cc: mainCc, fixed: true }, ...chart.additionalSteamRegions.map(cc => ({ cc, fixed: false }))];
      return rows.map(({ cc, fixed }) => {
        const region = catalog.getSteamPriceRegion(cc);
        const id = catalog.steamSeriesId(cc);
        return `
          <div class="store-price-chart-entry">
            <span class="store-price-chart-swatch" style="background-color:${escAttr(colorValue(id))}"></span>
            <span class="store-price-chart-entry__name">${esc(catalog.steamSeriesLabel(cc))}</span>
            ${colorInput(id, region.label)}
            ${fixed
              ? `<span class="store-price-chart-entry__fixed">主区域</span>`
              : `<button class="store-price-chart-icon" type="button" data-store-price-chart-remove-region="${escAttr(cc)}" title="删除${escAttr(region.label)}" aria-label="删除${escAttr(region.label)}">&times;</button>`}
          </div>`;
      }).join("");
    }

    function shopRows() {
      return shops().map((id) => {
        const shop = catalog.getItadPriceShop(id);
        const seriesId = id === 61 ? catalog.steamSeriesId(activeMainCountry()) : catalog.shopSeriesId(id);
        return `
          <div class="store-price-chart-entry">
            <span class="store-price-chart-swatch" style="background-color:${escAttr(colorValue(seriesId))}"></span>
            <span class="store-price-chart-entry__name">${esc(shop.label)}</span>
            ${id === 61 ? `<span class="store-price-chart-color-placeholder" aria-hidden="true"></span>` : colorInput(seriesId, shop.label)}
            ${id === 61
              ? `<span class="store-price-chart-entry__fixed">固定</span>`
              : `<button class="store-price-chart-icon" type="button" data-store-price-chart-remove-shop="${id}" title="删除${escAttr(shop.label)}" aria-label="删除${escAttr(shop.label)}">&times;</button>`}
          </div>`;
      }).join("");
    }

    function regionOptions() {
      const used = new Set([activeMainCountry(), ...chart.additionalSteamRegions]);
      return catalog.STEAM_PRICE_REGIONS
        .filter(item => !used.has(item.cc))
        .map(item => `<option value="${escAttr(item.cc)}">${esc(`${item.cc} - ${item.label}`)}</option>`)
        .join("");
    }

    function shopOptions() {
      const used = new Set(shops());
      return catalog.ITAD_PRICE_SHOPS
        .filter(item => !used.has(item.id))
        .map(item => `<option value="${item.id}">${esc(item.label)}</option>`)
        .join("");
    }

    function segment(name, value, items) {
      return `<div class="store-price-chart-segment" role="radiogroup">${items.map(item => `
        <label class="store-price-chart-segment__item${value === item.value ? " is-active" : ""}">
          <input type="radio" name="${escAttr(name)}" value="${escAttr(item.value)}" data-store-price-chart-setting="${escAttr(name)}" ${value === item.value ? "checked" : ""}>
          <span>${esc(item.label)}</span>
        </label>`).join("")}</div>`;
    }

    function html() {
      const selectedMain = mainCountry();
      const mainOptions = [
        ...(selectedMain === "auto" ? [{ cc: "auto", label: "跟随 Steam 页面（旧设置）" }] : []),
        ...(selectedMain !== "auto" && !catalog.getSteamPriceRegion(selectedMain)
          ? [{ cc: selectedMain, label: `${selectedMain} - 目录外旧设置（请重新选择）` }]
          : []),
        ...catalog.STEAM_PRICE_REGIONS,
      ];
      return `
        <div class="store-price-chart-panel" data-store-price-chart-panel>
          <section class="store-price-chart-section">
            <h4>Steam 定价区</h4>
            <label class="store-price-chart-field">
              <span>主定价区</span>
              <select data-store-price-chart-main-country>${mainOptions.map(item => `<option value="${escAttr(item.cc)}" ${selectedMain === item.cc ? "selected" : ""}>${esc(item.cc === "auto" ? item.label : `${item.cc} - ${item.label}`)}</option>`).join("")}</select>
            </label>
            <div class="store-price-chart-list">${regionRows()}</div>
            <div class="store-price-chart-add">
              <input type="text" list="store-price-chart-region-options" data-store-price-chart-region-input placeholder="搜索区域代码或名称" autocomplete="off">
              <datalist id="store-price-chart-region-options">${regionOptions()}</datalist>
              <button class="btn btn-secondary" type="button" data-store-price-chart-add-region>添加区域</button>
            </div>
          </section>
          <section class="store-price-chart-section">
            <h4>游戏商店</h4>
            <div class="store-price-chart-list">${shopRows()}</div>
            <div class="store-price-chart-add">
              <input type="text" list="store-price-chart-shop-options" data-store-price-chart-shop-input placeholder="搜索商店名称" autocomplete="off">
              <datalist id="store-price-chart-shop-options">${shopOptions()}</datalist>
              <button class="btn btn-secondary" type="button" data-store-price-chart-add-shop>添加商店</button>
            </div>
          </section>
          <section class="store-price-chart-section">
            <h4>图表</h4>
            <div class="store-price-chart-field"><span>汇率来源</span><a class="store-price-chart-source-link" href="https://api.frankfurter.dev" target="_blank" rel="noreferrer noopener">Frankfurter</a></div>
            <div class="store-price-chart-field"><span>史低判定</span>${segment("lowCriterion", chart.lowCriterion, [{ value: "discount", label: "按折扣力度" }, { value: "price", label: "按到手价" }])}</div>
            <div class="store-price-chart-field"><span>史低参考范围</span>${segment("lowReferenceScope", chart.lowReferenceScope, [{ value: "allRegular", label: "全部原价" }, { value: "currentRegular", label: "当前原价" }, { value: "recent12Months", label: "最近12个月" }])}</div>
            <button class="btn btn-secondary" type="button" data-store-price-chart-reset-colors>恢复全部默认颜色</button>
          </section>
          <div class="store-price-chart-actions">
            <button class="btn btn-blue" type="button" data-store-price-chart-save ${saving ? "disabled" : ""}>保存设置</button>
          </div>
        </div>`;
    }

    function render(shadow, focusSelector = "") {
      const current = shadow.querySelector("[data-store-price-chart-panel]");
      if (!current) return;
      const wrap = document.createElement("div");
      root.STDomUtils.setTrustedHTML(wrap, root.STDomUtils.trustedHTML(html(), "store-price-chart-panel-render"));
      current.replaceWith(wrap.firstElementChild);
      if (focusSelector) shadow.querySelector(focusSelector)?.focus?.();
    }

    function updateSegmentState(shadow, key, value) {
      for (const input of shadow.querySelectorAll(`[data-store-price-chart-setting="${key}"]`)) {
        const active = input.value === value;
        input.checked = active;
        input.closest(".store-price-chart-segment__item")?.classList.toggle("is-active", active);
      }
    }

    function readColor(node) {
      const key = String(node.dataset.storePriceChartColor || "");
      const color = String(node.value || "").toUpperCase();
      if (!/^#[0-9A-F]{6}$/.test(color)) return;
      chart.lineColors[key] = color;
      const swatch = node.closest(".store-price-chart-entry")?.querySelector(".store-price-chart-swatch");
      if (swatch) swatch.style.backgroundColor = color;
    }

    function resolveRegionInput(shadow) {
      const value = String(shadow.querySelector("[data-store-price-chart-region-input]")?.value || "").trim();
      const code = value.split(/\s+-\s+/)[0].toUpperCase();
      return catalog.getSteamPriceRegion(code)
        || catalog.STEAM_PRICE_REGIONS.find(item => item.label.toLowerCase() === value.toLowerCase())
        || null;
    }

    function resolveShopInput(shadow) {
      const value = String(shadow.querySelector("[data-store-price-chart-shop-input]")?.value || "").trim();
      const byId = catalog.getItadPriceShop(value.split(/\s+-\s+/)[0]);
      return byId || catalog.ITAD_PRICE_SHOPS.find(item => item.label.toLowerCase() === value.toLowerCase()) || null;
    }

    async function save(shadow, button) {
      if (saving) return;
      const selectedMain = mainCountry();
      if (selectedMain !== "auto" && !catalog.getSteamPriceRegion(selectedMain)) {
        await dialog(shadow, { title: "需要选择主定价区", message: "当前旧设置不在固定目录中，请先选择一个主定价区。" });
        return;
      }
      saving = true;
      button.disabled = true;
      const operationId = root.STLoggerFactory?.createOperationId?.() || "";
      try {
        const result = await storage.setStorePriceChartSettings?.({ thirdPartyServices, storePriceChart: chart }, { operationId });
        if (!result) throw new Error("STORAGE_REJECTED");
        thirdPartyServices = clone(result.thirdPartyServices);
        chart = normalizeChart(result.storePriceChart);
        onThirdPartyChange(thirdPartyServices);
        onChartChange(chart);
        log?.info?.("store-price-chart-settings-save-success", "商店详情价格图表设置保存成功", {
          operationId,
          mainCountry: thirdPartyServices?.isthereanydeal?.country,
          shopCount: shops().length,
          additionalRegionCount: chart.additionalSteamRegions.length,
        });
        await savePrompt(shadow);
        saving = false;
        render(shadow, "[data-store-price-chart-save]");
      } catch (error) {
        log?.error?.("store-price-chart-settings-save-failed", "商店详情价格图表设置保存失败", { operationId, error });
        dialog(shadow, { title: "保存失败", message: "价格图表设置保存失败，请稍后重试。" });
      } finally {
        saving = false;
        if (button.isConnected) button.disabled = false;
      }
    }

    function handleClick(event, shadow) {
      const addRegion = event.target.closest("[data-store-price-chart-add-region]");
      if (addRegion) {
        const region = resolveRegionInput(shadow);
        if (!region) {
          dialog(shadow, { title: "无法添加", message: "请选择固定目录中的 Steam 定价区。" });
          return true;
        }
        if (region.cc !== activeMainCountry() && !chart.additionalSteamRegions.includes(region.cc)) {
          if (seriesCount() >= MAX_STORE_PRICE_SERIES) {
            void showSeriesLimitDialog(shadow);
            return true;
          }
          chart.additionalSteamRegions.push(region.cc);
        }
        render(shadow, "[data-store-price-chart-region-input]");
        return true;
      }
      const addShop = event.target.closest("[data-store-price-chart-add-shop]");
      if (addShop) {
        const shop = resolveShopInput(shadow);
        if (!shop || shop.id === 61) {
          dialog(shadow, { title: "无法添加", message: "请选择固定目录中的游戏商店。" });
          return true;
        }
        if (!shops().includes(shop.id)) {
          if (seriesCount() >= MAX_STORE_PRICE_SERIES) {
            void showSeriesLimitDialog(shadow);
            return true;
          }
          thirdPartyServices.isthereanydeal = { ...(thirdPartyServices.isthereanydeal || {}), shops: [...shops(), shop.id] };
        }
        render(shadow, "[data-store-price-chart-shop-input]");
        return true;
      }
      const removeRegion = event.target.closest("[data-store-price-chart-remove-region]");
      if (removeRegion) {
        chart.additionalSteamRegions = chart.additionalSteamRegions.filter(cc => cc !== removeRegion.dataset.storePriceChartRemoveRegion);
        render(shadow, "[data-store-price-chart-region-input]");
        return true;
      }
      const removeShop = event.target.closest("[data-store-price-chart-remove-shop]");
      if (removeShop) {
        const id = Number(removeShop.dataset.storePriceChartRemoveShop);
        thirdPartyServices.isthereanydeal = { ...(thirdPartyServices.isthereanydeal || {}), shops: shops().filter(shopId => shopId !== id) };
        render(shadow, "[data-store-price-chart-shop-input]");
        return true;
      }
      if (event.target.closest("[data-store-price-chart-reset-colors]")) {
        chart.lineColors = {};
        render(shadow, "[data-store-price-chart-reset-colors]");
        return true;
      }
      const saveButton = event.target.closest("[data-store-price-chart-save]");
      if (saveButton) {
        void save(shadow, saveButton);
        return true;
      }
      return false;
    }

    function handleChange(event, shadow) {
      const country = event.target.closest("[data-store-price-chart-main-country]");
      if (country) {
        const previous = activeMainCountry();
        const next = String(country.value || "CN");
        thirdPartyServices.isthereanydeal = { ...(thirdPartyServices.isthereanydeal || {}), country: next };
        chart.additionalSteamRegions = chart.additionalSteamRegions.filter(cc => cc !== activeMainCountry());
        if (next !== "auto" && previous !== next && catalog.getSteamPriceRegion(previous)) chart.additionalSteamRegions.unshift(previous);
        chart = normalizeChart(chart);
        render(shadow, "[data-store-price-chart-main-country]");
        return true;
      }
      const color = event.target.closest("[data-store-price-chart-color]");
      if (color) {
        readColor(color);
        return true;
      }
      const setting = event.target.closest("[data-store-price-chart-setting]");
      if (setting) {
        const key = setting.dataset.storePriceChartSetting;
        const value = String(setting.value || "");
        if (!CHART_SETTING_VALUES[key]?.includes(value)) return true;
        chart = normalizeChart({ ...chart, [key]: value });
        updateSegmentState(shadow, key, chart[key]);
        return true;
      }
      return false;
    }

    return Object.freeze({ handleChange, handleClick, html, setConfigs });
  }

  root.STSettingsStorePriceChartPanel = Object.freeze({ create });
})(typeof globalThis !== "undefined" ? globalThis : window);
