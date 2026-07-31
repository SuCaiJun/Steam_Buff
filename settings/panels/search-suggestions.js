/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置面板|搜索联想业务面板
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
    const esc = fallback(options.esc, "esc");
    const fieldInput = typeof options.fieldInput === "function"
      ? options.fieldInput
      : (...args) => root.STSettingsFields?.fieldInput?.(...args) || "";
    const storage = options.storage || root.STSettings?.storage || {};
    const dialog = typeof options.dialog === "function" ? options.dialog : () => Promise.resolve("");
    const log = root.STLoggerFactory?.createLogger?.("settings", "search-suggestions-panel") || {
      info() {},
      warn() {},
      error() {},
    };
    const savePrompt = typeof options.savePrompt === "function" ? options.savePrompt : () => Promise.resolve();
    const onConfigChange = typeof options.onConfigChange === "function" ? options.onConfigChange : () => {};
    const getFields = typeof options.getFields === "function"
      ? options.getFields
      : () => options.catalog?.searchSuggestionFields?.() || root.STSettings?.catalog?.searchSuggestionFields?.() || [];
    let conf = { ...(options.config || {}) };

    function uiText(key, fallback, params) {
      return root.STI18n.text(key, fallback, params);
    }

    function setConfig(next) {
      conf = { ...(next || {}) };
    }

    function getConfig() {
      return { ...conf };
    }

    function syncInputs(shadow) {
      shadow.querySelectorAll("[data-search-suggestion]").forEach((node) => {
        const id = node.dataset.searchSuggestion;
        if (!id) return;
        node.value = String(conf[id] ?? "");
      });
    }

    function setInputsDisabled(shadow, disabled) {
      shadow.querySelectorAll("[data-search-suggestion]").forEach((node) => {
        node.disabled = disabled;
      });
    }

    function showSavePrompt(shadow, operationId) {
      void Promise.resolve()
        .then(() => savePrompt(shadow))
        .catch((error) => {
          log.warn("search-suggestions-settings-save-prompt-failed", "搜索联想设置已保存，但成功提示显示失败", {
            operationId,
            error,
          });
        });
    }

    function input(field) {
      const value = conf[field.key] ?? "";
      if (field.type === "select") {
        return fieldInput({
          field,
          value,
          dataset: "data-search-suggestion",
          className: "settings-control",
        });
      }
      return fieldInput({
        field: { ...field, min: field.min ?? "1", max: field.max ?? "10", step: field.step ?? "1" },
        value,
        dataset: "data-search-suggestion",
        className: "settings-control",
      });
    }

    function read(shadow) {
      const fields = getFields();
      const map = new Map(fields.map((field) => [field.key, field]));
      const next = {};

      shadow.querySelectorAll("[data-search-suggestion]").forEach((node) => {
        const id = node.dataset.searchSuggestion;
        if (!id) return;
        const field = map.get(id) || {};
        if (field.type === "number") {
          const min = Number(field.min ?? 1);
          const max = Number(field.max ?? 10);
          const fallbackValue = Number(conf[id] ?? field.min ?? 1);
          let num = Number.parseInt(node.value || String(fallbackValue), 10);
          if (!Number.isFinite(num)) {
            num = fallbackValue;
          }
          if (Number.isFinite(min)) {
            num = Math.max(min, num);
          }
          if (Number.isFinite(max)) {
            num = Math.min(max, num);
          }
          next[id] = num;
          node.value = String(num);
          return;
        }
        next[id] = node.value;
      });

      return next;
    }

    function html() {
      const fields = getFields();
      return `
        <div class="settings-form">
          <section class="settings-card section-card">
            <div class="section-header">
              <div class="dot"></div>
              <div class="title">${esc(uiText("settings.searchSuggestions.title", "搜索联想词设置"))}</div>
              <div class="hint">${esc(uiText("settings.searchSuggestions.hint", "控制联想条数和 Steam 原生结果显示"))}</div>
            </div>
            <div class="settings-grid">
              ${fields.map((field) => `
                <div class="settings-row form-row">
                  <span class="settings-label label">${esc(root.STSettingsFields?.label?.(field) || field.label)}</span>
                  <span class="settings-value control">${input(field)}</span>
                </div>
              `).join("")}
            </div>
            <div class="settings-actions form-footer">
              <button class="settings-save search-suggestion-save btn btn-blue" type="button">${esc(uiText("common.saveSettings", "保存设置"))}</button>
            </div>
          </section>
        </div>
      `;
    }

    function handleClick(event, shadow) {
      const save = event.target.closest(".search-suggestion-save");
      if (!save) {
        return false;
      }
      if (save.disabled) {
        return true;
      }
      const previous = { ...conf };
      const next = read(shadow);
      conf = { ...conf, ...next };
      onConfigChange(conf);
      const startedAt = Date.now();
      const operationId = root.STLoggerFactory?.createOperationId?.() || "";
      log.info("search-suggestions-settings-save-start", "开始保存搜索联想设置", { operationId });
      const oldText = save.textContent || "";
      save.disabled = true;
      save.textContent = uiText("common.saving", "保存中...");
      setInputsDisabled(shadow, true);
      Promise.resolve()
        .then(() => typeof storage.setSearchSuggestions === "function"
          ? storage.setSearchSuggestions(next, { operationId })
          : false)
        .then((saved) => {
          if (!saved || typeof saved !== "object") {
            conf = { ...previous };
            onConfigChange(conf);
            syncInputs(shadow);
            log.warn("search-suggestions-settings-save-failed", "搜索联想设置保存失败", {
              operationId,
              durationMs: Date.now() - startedAt,
              errorCode: saved === false ? "STORAGE_REJECTED" : "STORAGE_RESULT_UNCONFIRMED",
            });
            dialog(shadow, {
              title: uiText("common.saveFailed", "保存失败"),
              message: uiText("settings.searchSuggestions.saveFailed", "搜索联想设置未能保存，请稍后重试。"),
            });
            return;
          }
          conf = { ...saved };
          onConfigChange(conf);
          syncInputs(shadow);
          log.info("search-suggestions-settings-save-success", "搜索联想设置保存成功", {
            operationId,
            durationMs: Date.now() - startedAt,
          });
          showSavePrompt(shadow, operationId);
        })
        .catch((error) => {
          conf = { ...previous };
          onConfigChange(conf);
          syncInputs(shadow);
          log.error("search-suggestions-settings-save-failed", "搜索联想设置保存异常", {
            operationId,
            durationMs: Date.now() - startedAt,
            error,
          });
          dialog(shadow, {
            title: uiText("common.saveFailed", "保存失败"),
            message: uiText("settings.searchSuggestions.saveError", "搜索联想设置保存异常，请稍后重试。"),
          });
        })
        .finally(() => {
          setInputsDisabled(shadow, false);
          save.disabled = false;
          save.textContent = oldText;
        });
      return true;
    }

    return Object.freeze({
      getConfig,
      handleClick,
      html,
      read,
      setConfig,
    });
  }

  const api = Object.freeze({
    create,
  });
  root.STSettingsSearchSuggestionPanel = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
