/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置面板|内置业务面板工厂
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

  function create(options = {}) {
    const catalog = options.catalog || root.STSettings?.catalog || {};
    const storage = options.storage || root.STSettings?.storage || {};
    const deps = options.deps || {};
    const esc = fallback(options.esc, "esc");
    const escAttr = fallback(options.escAttr, "escAttr");
    const dialog = typeof options.dialog === "function" ? options.dialog : () => Promise.resolve("");
    const savePrompt = typeof options.savePrompt === "function" ? options.savePrompt : () => Promise.resolve();
    const fieldInput = options.fieldInput || root.STSettingsFields?.fieldInput;
    const render = typeof options.render === "function" ? options.render : () => {};
    const getExternalConfig = typeof options.getConfig === "function" ? options.getConfig : null;
    const setExternalConfig = typeof options.setConfig === "function" ? options.setConfig : null;
    const configs = {
      reviewFilter: {},
      searchSuggestion: {},
      translate: {},
      thirdPartyServices: {},
      storePriceChart: {},
      gameLinks: root.STGameLinks.defaults(),
      ...(options.configs || {}),
    };
    const instances = {};
    const names = {
      reviewFilter: "review",
      searchSuggestion: "searchSuggestion",
      ai: "ai",
      translate: "translate",
      thirdPartyServices: "thirdPartyServices",
      storePriceChart: "storePriceChart",
      gameLinks: "gameLinks",
    };

    function getConfig(name) {
      if (getExternalConfig) return getExternalConfig(name);
      return configs[name] || (name === "ai" ? root.STAI.normalizeServices() : {});
    }

    function setConfig(name, next) {
      const value = { ...(next || {}) };
      if (setExternalConfig) {
        setExternalConfig(name, value);
      } else {
        configs[name] = value;
      }
      const instance = instances[names[name]];
      instance?.setConfig?.(value);
      if ((name === "thirdPartyServices" || name === "storePriceChart") && instances.storePriceChart) {
        instances.storePriceChart.setConfigs({ [name]: value });
      }
    }

    function syncConfigs(next = {}) {
      for (const name of Object.keys(names)) {
        if (Object.prototype.hasOwnProperty.call(next, name)) {
          setConfig(name, next[name]);
        }
      }
    }

    function review() {
      if (!instances.review) {
        instances.review = root.STSettingsReviewFilterPanel.create({
          catalog,
          storage,
          config: getConfig("reviewFilter"),
          esc,
          escAttr,
          dialog,
          savePrompt,
          fieldInput,
          masterItemHtml: deps.masterItemHtml,
          onConfigChange: (next) => setConfig("reviewFilter", next),
        });
      }
      return instances.review;
    }

    function searchSuggestion() {
      if (!instances.searchSuggestion) {
        instances.searchSuggestion = root.STSettingsSearchSuggestionPanel.create({
          catalog,
          storage,
          config: getConfig("searchSuggestion"),
          esc,
          dialog,
          fieldInput,
          savePrompt,
          onConfigChange: (next) => setConfig("searchSuggestion", next),
        });
      }
      return instances.searchSuggestion;
    }

    function ai() {
      if (!instances.ai) {
        instances.ai = root.STSettingsAIPanel.create({
          catalog,
          storage,
          config: getConfig("ai"),
          esc,
          dialog,
          savePrompt,
          fieldInput,
          onConfigChange: (next) => setConfig("ai", next),
        });
      }
      return instances.ai;
    }

    function translate() {
      if (!instances.translate) {
        instances.translate = root.STSettingsTranslatePanel.create({
          catalog,
          storage,
          config: getConfig("translate"),
          esc,
          escAttr,
          dialog,
          savePrompt,
          fieldInput,
          masterItemHtml: deps.masterItemHtml,
          getAiConfig: () => getConfig("ai"),
          onConfigChange: (next) => setConfig("translate", next),
        });
      }
      return instances.translate;
    }

    function thirdPartyServices() {
      if (!instances.thirdPartyServices) {
        instances.thirdPartyServices = root.STSettingsThirdPartyServicesPanel.create({
          catalog,
          storage,
          config: getConfig("thirdPartyServices"),
          esc,
          dialog,
          savePrompt,
          fieldInput,
          onConfigChange: (next) => setConfig("thirdPartyServices", next),
        });
      }
      return instances.thirdPartyServices;
    }

    function storePriceChart() {
      if (!instances.storePriceChart) {
        instances.storePriceChart = root.STSettingsStorePriceChartPanel.create({
          catalog,
          storage,
          thirdPartyServices: getConfig("thirdPartyServices"),
          storePriceChart: getConfig("storePriceChart"),
          esc,
          escAttr,
          dialog,
          savePrompt,
          onThirdPartyChange: (next) => setConfig("thirdPartyServices", next),
          onChartChange: (next) => setConfig("storePriceChart", next),
        });
      }
      return instances.storePriceChart;
    }

    function gameLinks() {
      if (!instances.gameLinks) {
        instances.gameLinks = root.STSettingsGameLinksPanel.create({
          storage, config: getConfig("gameLinks"), esc, escAttr, fieldInput,
          onConfigChange: next => setConfig("gameLinks", next),
        });
      }
      return instances.gameLinks;
    }

    return Object.freeze({
      gameLinks,
      review,
      searchSuggestion,
      ai,
      translate,
      thirdPartyServices,
      storePriceChart,
      getConfig,
      setConfig,
      syncConfigs,
    });
  }

  const api = Object.freeze({ create });
  root.STSettingsPanelFactory = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
