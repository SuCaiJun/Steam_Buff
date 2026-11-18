/*
 * @Author        : Ricky
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
  const FRANKFURTER_URL = root.STConfig.vendors.frankfurter.origin;
  const MAX_STORE_PRICE_SERIES = catalog.MAX_STORE_PRICE_SERIES;
  const CHART_SETTING_VALUES = Object.freeze({
    lowCriterion: Object.freeze(["api", "discount", "price"]),
    lowReferenceScope: Object.freeze(["allRegular", "currentRegular", "recent12Months"]),
    lowOccurrence: Object.freeze(["latest", "earliest"]),
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

    function uiText(key, fallback, params) {
      return root.STI18n.text(key, fallback, params);
    }

    function regionLabel(regionOrCc) {
      const region = typeof regionOrCc === "object"
        ? regionOrCc
        : catalog.getSteamPriceRegion(regionOrCc);
      if (!region) return "";
      return uiText(`settings.storePriceChart.region.${region.cc}`, region.label);
    }

    function steamSeriesLabel(cc) {
      return uiText("settings.storePriceChart.series.steam", "Steam（$region$）", {
        region: regionLabel(cc),
      });
    }

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
        lowCriterion: ["api", "discount", "price"].includes(src.lowCriterion)
          ? src.lowCriterion
          : "api",
        lowReferenceScope: ["allRegular", "currentRegular", "recent12Months"].includes(src.lowReferenceScope)
          ? src.lowReferenceScope
          : "currentRegular",
        lowOccurrence: ["latest", "earliest"].includes(src.lowOccurrence)
          ? src.lowOccurrence
          : "latest",
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
        title: uiText("settings.storePriceChart.seriesLimit.title", "最多 $max$ 条价格线", { max: MAX_STORE_PRICE_SERIES }),
        message: uiText("settings.storePriceChart.seriesLimit.message", "Steam 定价区和游戏商店合计最多 $max$ 条，主 Steam 定价区也计入其中。请先删除一个已添加项。", { max: MAX_STORE_PRICE_SERIES }),
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
      const ariaLabel = uiText("settings.storePriceChart.color.ariaLabel", "$name$线条颜色", { name: label });
      return `<input class="store-price-chart-color" type="color" value="${escAttr(colorValue(seriesId))}" data-store-price-chart-color="${escAttr(seriesId)}" aria-label="${escAttr(ariaLabel)}">`;
    }

    function regionRows() {
      const mainCc = activeMainCountry();
      const rows = [{ cc: mainCc, fixed: true }, ...chart.additionalSteamRegions.map(cc => ({ cc, fixed: false }))];
      return rows.map(({ cc, fixed }) => {
        const region = catalog.getSteamPriceRegion(cc);
        const id = catalog.steamSeriesId(cc);
        const label = regionLabel(region);
        return `
          <div class="store-price-chart-entry">
            <span class="store-price-chart-swatch" style="background-color:${escAttr(colorValue(id))}"></span>
            <span class="store-price-chart-entry__name">${esc(steamSeriesLabel(cc))}</span>
            ${colorInput(id, label)}
            ${fixed
              ? `<span class="store-price-chart-entry__fixed">${esc(uiText("settings.storePriceChart.entry.mainRegion", "主区域"))}</span>`
              : `<button class="store-price-chart-icon" type="button" data-store-price-chart-remove-region="${escAttr(cc)}" title="${escAttr(uiText("settings.storePriceChart.action.remove", "删除$name$", { name: label }))}" aria-label="${escAttr(uiText("settings.storePriceChart.action.remove", "删除$name$", { name: label }))}">&times;</button>`}
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
              ? `<span class="store-price-chart-entry__fixed">${esc(uiText("settings.storePriceChart.entry.fixed", "固定"))}</span>`
              : `<button class="store-price-chart-icon" type="button" data-store-price-chart-remove-shop="${id}" title="${escAttr(uiText("settings.storePriceChart.action.remove", "删除$name$", { name: shop.label }))}" aria-label="${escAttr(uiText("settings.storePriceChart.action.remove", "删除$name$", { name: shop.label }))}">&times;</button>`}
          </div>`;
      }).join("");
    }

    function availableRegions() {
      const used = new Set([activeMainCountry(), ...chart.additionalSteamRegions]);
      return catalog.STEAM_PRICE_REGIONS
        .filter(item => !used.has(item.cc));
    }

    function availableShops() {
      const used = new Set(shops());
      return catalog.ITAD_PRICE_SHOPS
        .filter(item => !used.has(item.id));
    }

    function combo(kind, items, options = {}) {
      const label = options.ariaLabel;
      return root.STSettingsFields.searchComboHtml(items, {
        id: "st-price-chart-" + kind,
        label,
        value: options.value,
        text: options.label,
        placeholder: options.placeholder,
        expandLabel: uiText("settings.storePriceChart.combo.expand", "展开$name$列表", { name: label }),
        emptyLabel: uiText("settings.storePriceChart.combo.empty", "没有匹配项"),
      });
    }

    function segment(name, value, items, options = {}) {
      const disabled = options.disabled === true;
      const stateAttribute = options.stateAttribute ? ` ${options.stateAttribute}` : "";
      return `<div class="store-price-chart-segment${disabled ? " is-disabled" : ""}" role="radiogroup"${disabled ? ' aria-disabled="true"' : ""}${stateAttribute}>${items.map(item => `
        <label class="store-price-chart-segment__item${value === item.value ? " is-active" : ""}">
          <input type="radio" name="${escAttr(name)}" value="${escAttr(item.value)}" data-store-price-chart-setting="${escAttr(name)}" ${value === item.value ? "checked" : ""}${disabled ? " disabled" : ""}>
          <span>${esc(item.label)}</span>
        </label>`).join("")}</div>`;
    }

    function html() {
      const selectedMain = mainCountry();
      const sourceNavigation = root.STConfig.externalNavigation.resolve(FRANKFURTER_URL);
      const sourceTarget = sourceNavigation.target ? ` target="${escAttr(sourceNavigation.target)}"` : "";
      const mainOptions = [
        ...(selectedMain === "auto" ? [{ cc: "auto", label: uiText("settings.storePriceChart.legacy.followSteam", "跟随 Steam 页面（旧设置）") }] : []),
        ...(selectedMain !== "auto" && !catalog.getSteamPriceRegion(selectedMain)
          ? [{ cc: selectedMain, label: uiText("settings.storePriceChart.legacy.outsideCatalog", "$code$ - 目录外旧设置（请重新选择）", { code: selectedMain }) }]
          : []),
        ...catalog.STEAM_PRICE_REGIONS.map(item => ({ ...item, label: regionLabel(item) })),
      ];
      const selectedMainOption = mainOptions.find(item => item.cc === selectedMain) || mainOptions[0];
      return `
        <div class="store-price-chart-panel" data-store-price-chart-panel>
          <section class="store-price-chart-section">
            <h4>${esc(uiText("settings.storePriceChart.section.steamRegions", "Steam 定价区"))}</h4>
            <div class="store-price-chart-field">
              <span>${esc(uiText("settings.storePriceChart.field.mainRegion", "主定价区"))}</span>
              ${combo("main-country", mainOptions.map(item => ({
                value: item.cc,
                label: item.label,
                search: `${item.cc} ${item.label}`,
              })), {
                value: selectedMain,
                label: selectedMainOption?.label || "",
                placeholder: uiText("settings.storePriceChart.placeholder.searchMainRegion", "搜索主定价区"),
                ariaLabel: uiText("settings.storePriceChart.field.mainRegion", "主定价区"),
              })}
            </div>
            <div class="store-price-chart-list">${regionRows()}</div>
            <div class="store-price-chart-add">
              ${combo("region", availableRegions().map(item => ({ value: item.cc, label: regionLabel(item), search: `${item.cc} ${item.label} ${regionLabel(item)}` })), {
                placeholder: uiText("settings.storePriceChart.placeholder.searchRegion", "搜索区域名称"),
                ariaLabel: uiText("settings.storePriceChart.section.steamRegions", "Steam 定价区"),
              })}
              <button class="btn btn-secondary" type="button" data-store-price-chart-add-region>${esc(uiText("settings.storePriceChart.action.addRegion", "添加区域"))}</button>
            </div>
          </section>
          <section class="store-price-chart-section">
            <h4>${esc(uiText("settings.storePriceChart.section.shops", "游戏商店"))}</h4>
            <div class="store-price-chart-list">${shopRows()}</div>
            <div class="store-price-chart-add">
              ${combo("shop", availableShops().map(item => ({ value: item.id, label: item.label, search: item.label })), {
                placeholder: uiText("settings.storePriceChart.placeholder.searchShop", "搜索商店名称"),
                ariaLabel: uiText("settings.storePriceChart.section.shops", "游戏商店"),
              })}
              <button class="btn btn-secondary" type="button" data-store-price-chart-add-shop>${esc(uiText("settings.storePriceChart.action.addShop", "添加商店"))}</button>
            </div>
          </section>
          <section class="store-price-chart-section">
            <h4>${esc(uiText("settings.storePriceChart.section.chart", "图表"))}</h4>
            <div class="store-price-chart-field"><span>${esc(uiText("settings.storePriceChart.field.exchangeRateSource", "汇率来源"))}</span><a class="store-price-chart-source-link" href="${escAttr(sourceNavigation.href)}"${sourceTarget} rel="${escAttr(sourceNavigation.rel)}">Frankfurter</a></div>
            <div class="store-price-chart-field"><span>${esc(uiText("settings.storePriceChart.field.lowCriterion", "史低判定"))}</span>${segment("lowCriterion", chart.lowCriterion, [{ value: "api", label: uiText("settings.storePriceChart.lowCriterion.api", "使用API数据") }, { value: "discount", label: uiText("settings.storePriceChart.lowCriterion.discount", "按折扣力度") }, { value: "price", label: uiText("settings.storePriceChart.lowCriterion.price", "按到手价") }])}</div>
            <div class="store-price-chart-field${chart.lowCriterion === "api" ? " is-disabled" : ""}" data-store-price-chart-reference-field${chart.lowCriterion === "api" ? ' aria-disabled="true"' : ""}><span>${esc(uiText("settings.storePriceChart.field.lowReferenceScope", "史低范围"))}</span>${segment("lowReferenceScope", chart.lowReferenceScope, [{ value: "allRegular", label: uiText("settings.storePriceChart.lowReferenceScope.allRegular", "全部原价") }, { value: "currentRegular", label: uiText("settings.storePriceChart.lowReferenceScope.currentRegular", "当前原价") }, { value: "recent12Months", label: uiText("settings.storePriceChart.lowReferenceScope.recent12Months", "最近12个月") }], { disabled: chart.lowCriterion === "api", stateAttribute: "data-store-price-chart-reference-scope" })}</div>
            <div class="store-price-chart-field${chart.lowCriterion === "api" ? " is-disabled" : ""}" data-store-price-chart-occurrence-field${chart.lowCriterion === "api" ? ' aria-disabled="true"' : ""}><span>${esc(uiText("settings.storePriceChart.field.lowOccurrence", "史低时间"))}</span>${segment("lowOccurrence", chart.lowOccurrence, [{ value: "latest", label: uiText("settings.storePriceChart.lowOccurrence.latest", "最近史低") }, { value: "earliest", label: uiText("settings.storePriceChart.lowOccurrence.earliest", "最先史低") }], { disabled: chart.lowCriterion === "api", stateAttribute: "data-store-price-chart-occurrence" })}</div>
            <button class="btn btn-secondary" type="button" data-store-price-chart-reset-colors>${esc(uiText("settings.storePriceChart.action.resetColors", "恢复全部默认颜色"))}</button>
          </section>
          <div class="store-price-chart-actions">
            <button class="btn btn-blue" type="button" data-store-price-chart-save ${saving ? "disabled" : ""}>${esc(uiText("settings.storePriceChart.action.save", "保存设置"))}</button>
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

    function updateManualLowSettingsState(shadow) {
      const disabled = chart.lowCriterion === "api";
      const controls = [
        ["[data-store-price-chart-reference-field]", "[data-store-price-chart-reference-scope]", "lowReferenceScope"],
        ["[data-store-price-chart-occurrence-field]", "[data-store-price-chart-occurrence]", "lowOccurrence"],
      ];
      for (const [fieldSelector, segmentSelector, key] of controls) {
        const field = shadow.querySelector(fieldSelector);
        const segmentNode = shadow.querySelector(segmentSelector);
        field?.classList?.toggle?.("is-disabled", disabled);
        segmentNode?.classList?.toggle?.("is-disabled", disabled);
        if (disabled) {
          field?.setAttribute?.("aria-disabled", "true");
          segmentNode?.setAttribute?.("aria-disabled", "true");
        } else {
          field?.removeAttribute?.("aria-disabled");
          segmentNode?.removeAttribute?.("aria-disabled");
        }
        for (const input of shadow.querySelectorAll(`[data-store-price-chart-setting="${key}"]`)) {
          input.disabled = disabled;
        }
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
      const input = shadow.querySelector("#st-price-chart-region");
      const value = String(input?.value || "").trim();
      const selected = input?.dataset.stComboValue;
      const code = value.toUpperCase();
      if (selected) return catalog.getSteamPriceRegion(selected);
      return catalog.getSteamPriceRegion(code)
        || catalog.STEAM_PRICE_REGIONS.find(item => item.label.toLowerCase() === value.toLowerCase())
        || catalog.STEAM_PRICE_REGIONS.find(item => regionLabel(item).toLowerCase() === value.toLowerCase())
        || null;
    }

    function resolveShopInput(shadow) {
      const input = shadow.querySelector("#st-price-chart-shop");
      const value = String(input?.value || "").trim();
      const selected = input?.dataset.stComboValue;
      if (selected) return catalog.getItadPriceShop(selected);
      return catalog.ITAD_PRICE_SHOPS.find(item => item.label.toLowerCase() === value.toLowerCase()) || null;
    }

    function selectMainCountry(shadow, next) {
      const previous = activeMainCountry();
      thirdPartyServices.isthereanydeal = { ...(thirdPartyServices.isthereanydeal || {}), country: next };
      chart.additionalSteamRegions = chart.additionalSteamRegions.filter(cc => cc !== activeMainCountry());
      if (next !== "auto" && previous !== next && catalog.getSteamPriceRegion(previous)) chart.additionalSteamRegions.unshift(previous);
      chart = normalizeChart(chart);
      render(shadow, "#st-price-chart-main-country");
    }

    async function save(shadow, button) {
      if (saving) return;
      const selectedMain = mainCountry();
      if (selectedMain !== "auto" && !catalog.getSteamPriceRegion(selectedMain)) {
        await dialog(shadow, {
          title: uiText("settings.storePriceChart.validation.mainRegion.title", "需要选择主定价区"),
          message: uiText("settings.storePriceChart.validation.mainRegion.message", "当前旧设置不在固定目录中，请先选择一个主定价区。"),
        });
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
        dialog(shadow, {
          title: uiText("settings.storePriceChart.saveFailed.title", "保存失败"),
          message: uiText("settings.storePriceChart.saveFailed.message", "价格图表设置保存失败，请稍后重试。"),
        });
      } finally {
        saving = false;
        if (button.isConnected) button.disabled = false;
      }
    }

    function handleComboEvent(event, shadow) {
      if (event.type !== "click" && !event.target.closest("[data-st-combo]")) return false;
      const panel = shadow.querySelector("[data-store-price-chart-panel]");
      return !!panel && root.STSettingsFields.handleSearchCombo(event, panel, (input, value) => {
        if (input.id === "st-price-chart-main-country") selectMainCountry(shadow, value);
      });
    }

    function handleClick(event, shadow) {
      if (handleComboEvent(event, shadow)) return true;
      const addRegion = event.target.closest("[data-store-price-chart-add-region]");
      if (addRegion) {
        const region = resolveRegionInput(shadow);
        if (!region) {
          dialog(shadow, {
            title: uiText("settings.storePriceChart.addFailed.title", "无法添加"),
            message: uiText("settings.storePriceChart.addFailed.region", "请选择固定目录中的 Steam 定价区。"),
          });
          return true;
        }
        if (region.cc !== activeMainCountry() && !chart.additionalSteamRegions.includes(region.cc)) {
          if (seriesCount() >= MAX_STORE_PRICE_SERIES) {
            void showSeriesLimitDialog(shadow);
            return true;
          }
          chart.additionalSteamRegions.push(region.cc);
        }
        render(shadow, "#st-price-chart-region");
        return true;
      }
      const addShop = event.target.closest("[data-store-price-chart-add-shop]");
      if (addShop) {
        const shop = resolveShopInput(shadow);
        if (!shop || shop.id === 61) {
          dialog(shadow, {
            title: uiText("settings.storePriceChart.addFailed.title", "无法添加"),
            message: uiText("settings.storePriceChart.addFailed.shop", "请选择固定目录中的游戏商店。"),
          });
          return true;
        }
        if (!shops().includes(shop.id)) {
          if (seriesCount() >= MAX_STORE_PRICE_SERIES) {
            void showSeriesLimitDialog(shadow);
            return true;
          }
          thirdPartyServices.isthereanydeal = { ...(thirdPartyServices.isthereanydeal || {}), shops: [...shops(), shop.id] };
        }
        render(shadow, "#st-price-chart-shop");
        return true;
      }
      const removeRegion = event.target.closest("[data-store-price-chart-remove-region]");
      if (removeRegion) {
        chart.additionalSteamRegions = chart.additionalSteamRegions.filter(cc => cc !== removeRegion.dataset.storePriceChartRemoveRegion);
        render(shadow, "#st-price-chart-region");
        return true;
      }
      const removeShop = event.target.closest("[data-store-price-chart-remove-shop]");
      if (removeShop) {
        const id = Number(removeShop.dataset.storePriceChartRemoveShop);
        thirdPartyServices.isthereanydeal = { ...(thirdPartyServices.isthereanydeal || {}), shops: shops().filter(shopId => shopId !== id) };
        render(shadow, "#st-price-chart-shop");
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
      const color = event.target.closest("[data-store-price-chart-color]");
      if (color) {
        readColor(color);
        return true;
      }
      const setting = event.target.closest("[data-store-price-chart-setting]");
      if (setting) {
        if (setting.disabled) return true;
        const key = setting.dataset.storePriceChartSetting;
        const value = String(setting.value || "");
        if (!CHART_SETTING_VALUES[key]?.includes(value)) return true;
        chart = normalizeChart({ ...chart, [key]: value });
        updateSegmentState(shadow, key, chart[key]);
        if (key === "lowCriterion") updateManualLowSettingsState(shadow);
        return true;
      }
      return false;
    }

    return Object.freeze({ handleChange, handleClick, handleInput: handleComboEvent, handleKeydown: handleComboEvent, html, setConfigs });
  }

  root.STSettingsStorePriceChartPanel = Object.freeze({ create });
})(typeof globalThis !== "undefined" ? globalThis : window);
