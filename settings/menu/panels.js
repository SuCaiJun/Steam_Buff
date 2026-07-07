/*
 * @Author        : 顾青离
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

  function createFamilyLibraryPanel(options = {}) {
    const esc = fallback(options.esc, "esc");
    const escAttr = fallback(options.escAttr, "escAttr");
    const fieldInput = typeof options.fieldInput === "function"
      ? options.fieldInput
      : (...args) => root.STSettingsFields?.fieldInput?.(...args) || "";
    const dialog = typeof options.dialog === "function" ? options.dialog : () => Promise.resolve("");
    const savePrompt = typeof options.savePrompt === "function" ? options.savePrompt : () => Promise.resolve();
    const storage = options.storage || root.STSettings?.storage || {};
    const onConfigChange = typeof options.onConfigChange === "function" ? options.onConfigChange : () => {};
    const getDefaults = typeof options.getDefaults === "function"
      ? options.getDefaults
      : () => options.catalog?.familyLibraryDefaults?.() || root.STSettings?.catalog?.familyLibraryDefaults?.() || {};
    const getFields = typeof options.getFields === "function"
      ? options.getFields
      : () => options.catalog?.familyLibraryFields?.() || root.STSettings?.catalog?.familyLibraryFields?.() || [];
    const log = root.STLoggerFactory?.createLogger?.("settings", "family-library") || {
      info() {},
      warn() {},
      error() {},
    };
    let conf = normalize(options.config || {});
    let saveJob = Promise.resolve();

    function normalize(values) {
      const defs = getDefaults();
      const fields = getFields();
      const intervalField = fields.find(field => field.key === "refreshInterval") || {};
      const intervals = new Set((intervalField.options || []).map(opt => String(opt.value)));
      const refreshInterval = String(values?.refreshInterval ?? defs.refreshInterval ?? "1d");
      return {
        refreshInterval: intervals.has(refreshInterval) ? refreshInterval : String(defs.refreshInterval || "1d"),
        autoRefresh: typeof values?.autoRefresh === "boolean" ? values.autoRefresh : defs.autoRefresh !== false,
      };
    }

    function setConfig(next) {
      conf = normalize(next || {});
    }

    function getConfig() {
      return { ...conf };
    }

    function switchInput(field) {
      const checked = conf[field.key] === true;
      const label = field.label || "";
      return `
        <label class="switch form-switch${checked ? " checked" : ""}" role="switch" aria-checked="${checked ? "true" : "false"}" title="${escAttr(label)}">
          <input class="switch-input" type="checkbox" data-family-library="${escAttr(field.key)}" aria-label="${escAttr(label)}" ${checked ? "checked" : ""}>
          <span class="knob"></span>
        </label>
      `;
    }

    function input(field) {
      if (field.type === "switch") {
        return switchInput(field);
      }
      return fieldInput({
        field,
        value: conf[field.key],
        dataset: "data-family-library",
        className: "settings-control",
      });
    }

    function read(shadow) {
      const next = { ...conf };
      shadow.querySelectorAll("[data-family-library]").forEach((node) => {
        const id = node.dataset.familyLibrary;
        if (!id) return;
        next[id] = node.type === "checkbox" ? node.checked : node.value;
      });
      return normalize(next);
    }

    async function save(shadow, nextConfig) {
      const next = normalize(nextConfig || conf);
      conf = next;
      onConfigChange(conf);
      const startedAt = Date.now();
      log.info("family-library-settings-save-start", "开始保存家庭库刷新设置", {
        refreshInterval: next.refreshInterval,
        autoRefresh: next.autoRefresh === true,
      });
      try {
        const saved = await storage.setFamilyLibrary?.(next);
        if (saved === false) {
          log.warn("family-library-settings-save-failed", "家庭库刷新设置保存失败", {
            refreshInterval: next.refreshInterval,
            autoRefresh: next.autoRefresh === true,
            durationMs: Date.now() - startedAt,
            errorCode: "STORAGE_REJECTED",
          });
          dialog(shadow, { title: "保存失败", message: "家庭库刷新设置保存失败，请稍后重试。" });
          return false;
        }
        conf = normalize(saved || next);
        onConfigChange(conf);
        log.info("family-library-settings-save-success", "家庭库刷新设置保存成功", {
          refreshInterval: conf.refreshInterval,
          autoRefresh: conf.autoRefresh === true,
          durationMs: Date.now() - startedAt,
        });
        savePrompt(shadow);
        return true;
      } catch (error) {
        log.error("family-library-settings-save-failed", "家庭库刷新设置保存异常", {
          refreshInterval: next.refreshInterval,
          autoRefresh: next.autoRefresh === true,
          durationMs: Date.now() - startedAt,
          error: error?.message || String(error),
        });
        dialog(shadow, { title: "保存失败", message: "家庭库刷新设置保存异常，请稍后重试。" });
        return false;
      }
    }

    function queueSave(shadow, nextConfig) {
      const next = normalize(nextConfig || conf);
      saveJob = saveJob.catch(() => {}).then(() => save(shadow, next));
      return saveJob;
    }

    function html() {
      const fields = getFields();
      return `
        <div class="settings-form family-library-form">
          <section class="settings-card section-card family-library-settings-card">
            <div class="settings-grid">
              ${fields.map((field) => `
                <div class="settings-row form-row">
                  <span class="settings-label label">${esc(field.label)}</span>
                  <span class="settings-value control">${input(field)}</span>
                </div>
              `).join("")}
            </div>
          </section>
        </div>
      `;
    }

    function syncSwitch(node) {
      if (node?.type !== "checkbox") {
        return;
      }
      const wrap = node.closest(".form-switch");
      wrap?.classList.toggle("checked", node.checked);
      wrap?.setAttribute("aria-checked", node.checked ? "true" : "false");
    }

    function handleChange(event, shadow) {
      const node = event.target.closest("[data-family-library]");
      if (!node) {
        return false;
      }
      syncSwitch(node);
      queueSave(shadow, read(shadow));
      return true;
    }

    return Object.freeze({
      getConfig,
      handleChange,
      html,
      read,
      setConfig,
    });
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
      familyLibrary: {},
      see: {},
      ai: {},
      translate: {},
      thirdPartyServices: {},
      ...(options.configs || {}),
    };
    const instances = {};
    const names = {
      reviewFilter: "review",
      searchSuggestion: "searchSuggestion",
      familyLibrary: "familyLibrary",
      see: "see",
      ai: "ai",
      translate: "translate",
      thirdPartyServices: "thirdPartyServices",
    };

    function getConfig(name) {
      return getExternalConfig ? getExternalConfig(name) : (configs[name] || {});
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
          fieldInput,
          savePrompt,
          onConfigChange: (next) => setConfig("searchSuggestion", next),
        });
      }
      return instances.searchSuggestion;
    }

    function familyLibrary() {
      if (!instances.familyLibrary) {
        instances.familyLibrary = createFamilyLibraryPanel({
          catalog,
          storage,
          config: getConfig("familyLibrary"),
          esc,
          escAttr,
          dialog,
          savePrompt,
          fieldInput,
          onConfigChange: (next) => setConfig("familyLibrary", next),
        });
      }
      return instances.familyLibrary;
    }

    function see() {
      if (!instances.see) {
        instances.see = root.STSettingsSeePanel.create({
          catalog,
          storage,
          config: getConfig("see"),
          esc,
          escAttr,
          fieldInput,
          savePrompt,
          onConfigChange: (next) => setConfig("see", next),
        });
      }
      return instances.see;
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
          getTranslateConfig: () => getConfig("translate"),
          onConfigChange: (next) => setConfig("ai", next),
          onRenderRequest: (targetShadow) => render(targetShadow),
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

    return Object.freeze({
      review,
      searchSuggestion,
      familyLibrary,
      see,
      ai,
      translate,
      thirdPartyServices,
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
