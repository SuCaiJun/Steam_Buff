/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置面板|翻译业务面板
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const AI_SERVICE = "steam-buff.ai";

  function fallback(value, name) {
    if (typeof value === "function") {
      return value;
    }
    return root.STSettingsHtml?.[name] || ((text) => String(text ?? ""));
  }

  function create(options = {}) {
    const esc = fallback(options.esc, "esc");
    const escAttr = fallback(options.escAttr, "escAttr");
    const fieldInput = typeof options.fieldInput === "function"
      ? options.fieldInput
      : (...args) => root.STSettingsFields?.fieldInput?.(...args) || "";
    const storage = options.storage || root.STSettings?.storage || {};
    const dialog = typeof options.dialog === "function" ? options.dialog : () => Promise.resolve("");
    const log = root.STLoggerFactory?.createLogger?.("settings", "translate-panel") || {
      info() {},
      warn() {},
      error() {},
    };
    const savePrompt = typeof options.savePrompt === "function" ? options.savePrompt : () => Promise.resolve();
    const onConfigChange = typeof options.onConfigChange === "function" ? options.onConfigChange : () => {};
    const getAiConfig = typeof options.getAiConfig === "function" ? options.getAiConfig : () => ({});
    const getFields = typeof options.getFields === "function"
      ? options.getFields
      : () => options.catalog?.translateFields?.() || root.STSettings?.catalog?.translateFields?.() || [];
    let conf = { ...(options.config || {}) };
    let persistedConf = { ...conf };
    let publishingConfig = false;

    function uiText(key, fallback) {
      return root.STI18n.text(key, fallback);
    }

    function setConfig(next) {
      conf = { ...(next || {}) };
      if (!publishingConfig) {
        persistedConf = { ...conf };
      }
    }

    function publishConfig() {
      publishingConfig = true;
      try {
        onConfigChange(conf);
      } finally {
        publishingConfig = false;
      }
    }

    function getConfig() {
      return { ...conf };
    }

    function input(field) {
      if (field.type === "select") {
        const ai = getAiConfig() || {};
        const aiOff = (field.key === "service" || field.key === "selectionService" || field.key === "newsPopupService") && ai.enabled !== true;
        const value = String(conf[field.key] ?? "");
        return fieldInput({
          field,
          value,
          dataset: "data-translate",
          className: "translate-control",
          disabledOption: (opt) => aiOff && opt.value === AI_SERVICE,
        });
      }

      if (field.type === "number") {
        const value = String(conf[field.key] ?? "");
        return fieldInput({
          field: { ...field, min: field.min ?? "", max: field.max ?? "", step: field.step ?? "1" },
          value,
          dataset: "data-translate",
          className: "translate-control",
        });
      }

      const checked = conf[field.key] !== false;
      return fieldInput({
        field,
        value: checked,
        dataset: "data-translate",
        checkClass: "translate-check",
      });
    }

    function fieldVisible(field) {
      if (field.aiOnly === true && conf.service !== AI_SERVICE) {
        return false;
      }
      if (field.aiHidden === true && conf.service === AI_SERVICE) {
        return false;
      }
      if (field.showWhen?.key) {
        const values = Array.isArray(field.showWhen.values) ? field.showWhen.values : [field.showWhen.value];
        return values.map(String).includes(String(conf[field.showWhen.key] ?? ""));
      }
      return true;
    }

    function syncFields(shadow) {
      const fields = getFields();
      const rows = new Map(Array.from(shadow.querySelectorAll("[data-translate-row]"))
        .map((row) => [row.dataset.translateRow, row]));
      for (const field of fields) {
        const row = rows.get(field.key);
        if (row) {
          row.hidden = !fieldVisible(field);
        }
      }
      const select = shadow.querySelector('[data-translate="select"]');
      if (select && select.type === "checkbox") {
        select.checked = conf.select !== false;
      }
    }

    function syncInputs(shadow) {
      shadow.querySelectorAll("[data-translate]").forEach((node) => {
        const id = node.dataset.translate;
        if (!id) return;
        if (node.type === "checkbox") {
          node.checked = conf[id] !== false;
          return;
        }
        node.value = String(conf[id] ?? "");
      });
      syncFields(shadow);
    }

    function setInputsDisabled(shadow, disabled) {
      shadow.querySelectorAll("[data-translate]").forEach((node) => {
        node.disabled = disabled;
      });
    }

    function showSavePrompt(shadow, operationId) {
      void Promise.resolve()
        .then(() => savePrompt(shadow))
        .catch((error) => {
          log.warn("translate-settings-save-prompt-failed", "翻译设置已保存，但成功提示显示失败", {
            operationId,
            error,
          });
        });
    }

    function read(shadow) {
      const fields = getFields();
      const map = new Map(fields.map((field) => [field.key, field]));
      const next = {};
      shadow.querySelectorAll("[data-translate]").forEach((node) => {
        const id = node.dataset.translate;
        if (!id) return;
        const field = map.get(id) || {};
        if (node.type === "checkbox") {
          next[id] = node.checked;
          return;
        }
        if (node.type === "number") {
          const raw = String(node.value ?? "").trim();
          const fallbackValue = String(conf[id] ?? field.min ?? "");
          let num = Number(raw || fallbackValue);
          if (!Number.isFinite(num)) {
            num = Number(field.min);
          }
          if (Number.isFinite(field.min)) {
            num = Math.max(Number(field.min), num);
          }
          if (Number.isFinite(field.max)) {
            num = Math.min(Number(field.max), num);
          }
          if (Number.isFinite(num)) {
            num = Math.round(num);
          }
          next[id] = String(Number.isFinite(num) ? num : fallbackValue);
          node.value = next[id];
          return;
        }
        next[id] = node.value;
      });
      if (next.service === AI_SERVICE) {
        next.select = false;
      }
      return next;
    }

    function section(title, fields) {
      return `
        <section class="translate-card section-card">
          <div class="section-header">
            <div class="dot"></div>
            <div class="title">${esc(title)}</div>
          </div>
          <div class="translate-grid">
            ${fields.map((field) => `
              <div class="translate-row form-row" data-translate-row="${escAttr(field.key)}" ${fieldVisible(field) ? "" : "hidden"}>
                <span class="translate-label label">${esc(root.STSettingsFields?.label?.(field) || field.label)}</span>
                <span class="translate-value control">${input(field)}</span>
              </div>
            `).join("")}
          </div>
        </section>
      `;
    }

    function html(cat) {
      const fields = getFields();
      const selectionKeys = new Set([
        "selection",
        "selectionTrigger",
        "selectionAction",
        "selectionClose",
        "selectionService",
      ]);
      const newsKeys = new Set([
        "newsPopup",
        "newsPopupService",
      ]);
      const base = fields.filter((field) => !selectionKeys.has(field.key) && !newsKeys.has(field.key));
      const selection = fields.filter((field) => selectionKeys.has(field.key));
      const news = fields.filter((field) => newsKeys.has(field.key));
      return `
        ${cat.items.map((item) => options.masterItemHtml?.(item) || "").join("")}
        <div class="translate-form">
          ${section(uiText("settings.translate.scope", "翻译范围"), base)}
          ${section(uiText("settings.translate.selection", "划词翻译"), selection)}
          ${section(uiText("settings.translate.newsPopup", "Steam 新闻弹窗翻译"), news)}
          <div class="translate-actions form-footer">
            <button class="translate-save btn btn-blue" type="button">${esc(uiText("common.saveSettings", "保存设置"))}</button>
          </div>
        </div>
      `;
    }

    function handleClick(event, shadow) {
      const save = event.target.closest(".translate-save");
      if (!save) {
        return false;
      }
      if (save.disabled) {
        return true;
      }
      const previous = { ...persistedConf };
      const next = read(shadow);
      conf = { ...conf, ...next };
      publishConfig();
      const startedAt = Date.now();
      const operationId = root.STLoggerFactory?.createOperationId?.() || "";
      log.info("translate-settings-save-start", "开始保存翻译设置", { operationId });
      const oldText = save.textContent || "";
      save.disabled = true;
      save.textContent = uiText("common.saving", "保存中...");
      setInputsDisabled(shadow, true);
      Promise.resolve()
        .then(() => typeof storage.setTranslate === "function"
          ? storage.setTranslate(next, { operationId })
          : false)
        .then((ok) => {
          if (ok !== true) {
            conf = { ...previous };
            publishConfig();
            syncInputs(shadow);
            log.warn("translate-settings-save-failed", "翻译设置保存失败", {
              operationId,
              durationMs: Date.now() - startedAt,
              errorCode: ok === false ? "STORAGE_REJECTED" : "STORAGE_RESULT_UNCONFIRMED",
            });
            dialog(shadow, {
              title: uiText("common.saveFailed", "保存失败"),
              message: uiText("settings.translate.saveFailed", "翻译设置未能保存，请稍后重试。"),
            });
            return;
          }
          persistedConf = { ...conf };
          log.info("translate-settings-save-success", "翻译设置保存成功", {
            operationId,
            durationMs: Date.now() - startedAt,
          });
          showSavePrompt(shadow, operationId);
        })
        .catch((error) => {
          conf = { ...previous };
          publishConfig();
          syncInputs(shadow);
          log.error("translate-settings-save-failed", "翻译设置保存异常", {
            operationId,
            durationMs: Date.now() - startedAt,
            error,
          });
          dialog(shadow, {
            title: uiText("common.saveFailed", "保存失败"),
            message: uiText("settings.translate.saveError", "翻译设置保存异常，请稍后重试。"),
          });
        })
        .finally(() => {
          setInputsDisabled(shadow, false);
          save.disabled = false;
          save.textContent = oldText;
        });
      return true;
    }

    function handleChange(event, shadow) {
      const node = event.target.closest("[data-translate]");
      if (!node) {
        return false;
      }
      conf = { ...conf, ...read(shadow) };
      publishConfig();
      syncFields(shadow);
      return true;
    }

    return Object.freeze({
      getConfig,
      handleChange,
      handleClick,
      html,
      read,
      setConfig,
      syncFields,
    });
  }

  const api = Object.freeze({
    create,
  });
  root.STSettingsTranslatePanel = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
