/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置面板|AI 服务业务面板
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const AI_SERVICE = "steam-buff.ai";
  const log = root.STLoggerFactory.createLogger("settings", "ai");

  function fallback(value, name) {
    if (typeof value === "function") {
      return value;
    }
    return root.STSettingsHtml?.[name] || ((text) => String(text ?? ""));
  }

  function normalize(values) {
    return root.STAI?.normalize?.(values) || { ...(values || {}) };
  }

  function create(options = {}) {
    const esc = fallback(options.esc, "esc");
    const fieldInput = typeof options.fieldInput === "function"
      ? options.fieldInput
      : (...args) => root.STSettingsFields?.fieldInput?.(...args) || "";
    const dialog = typeof options.dialog === "function" ? options.dialog : () => Promise.resolve("");
    const savePrompt = typeof options.savePrompt === "function" ? options.savePrompt : () => Promise.resolve();
    const storage = options.storage || root.STSettings?.storage || {};
    const onConfigChange = typeof options.onConfigChange === "function" ? options.onConfigChange : () => {};
    const onRenderRequest = typeof options.onRenderRequest === "function" ? options.onRenderRequest : () => {};
    const getTranslateConfig = typeof options.getTranslateConfig === "function" ? options.getTranslateConfig : () => ({});
    const getFields = typeof options.getFields === "function"
      ? options.getFields
      : () => options.catalog?.aiFields?.() || root.STSettings?.catalog?.aiFields?.() || [];
    let conf = normalize(options.config || {});
    let persistedConf = normalize(conf);
    let publishingConfig = false;

    function uiText(key, fallback, params) {
      return root.STI18n.text(key, fallback, params);
    }

    function showSavePrompt(shadow, operationId) {
      void Promise.resolve()
        .then(() => savePrompt(shadow))
        .catch((error) => {
          log.warn("ai-config-save-prompt-failed", "AI 配置已保存，但成功提示显示失败", {
            operationId,
            error,
          });
        });
    }

    function setConfig(next) {
      conf = normalize(next || {});
      if (!publishingConfig) {
        persistedConf = normalize(conf);
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

    function setEnabled(enabled) {
      conf = normalize({ ...conf, enabled });
      persistedConf = normalize(conf);
      publishConfig();
      return getConfig();
    }

    function restoreInputs(shadow) {
      shadow.querySelectorAll("[data-ai]").forEach((node) => {
        const id = node.dataset.ai;
        if (!id) return;
        if (node.type === "checkbox") {
          node.checked = conf[id] === true;
          return;
        }
        node.value = String(conf[id] ?? "");
      });
    }

    function setInputsDisabled(shadow, disabled) {
      shadow.querySelectorAll("[data-ai]").forEach((node) => {
        node.disabled = disabled;
      });
    }

    function restoreSavedState(shadow, previous, operationId) {
      conf = normalize(previous);
      publishConfig();
      restoreInputs(shadow);
      void Promise.resolve()
        .then(() => onRenderRequest(shadow))
        .catch((error) => {
          log.warn("ai-config-restore-render-failed", "AI 配置已回滚，但设置面板刷新失败", {
            operationId,
            error,
          });
        });
    }

    function input(field) {
      if (field.type === "select") {
        const value = String(conf[field.key] ?? "");
        return fieldInput({
          field,
          value,
          dataset: "data-ai",
          className: "settings-control",
        });
      }
      if (field.type === "checkbox") {
        const checked = conf[field.key] === true;
        return fieldInput({
          field,
          value: checked,
          dataset: "data-ai",
          checkClass: "settings-check",
        });
      }
      const value = String(conf[field.key] ?? "");
      return fieldInput({
        field,
        value,
        dataset: "data-ai",
        className: "settings-control",
      });
    }

    function fieldVisible(field) {
      const mode = String(conf.keyMode || "none");
      if (field.key === "key") {
        return mode !== "none";
      }
      if (field.key === "keyName") {
        return mode === "header" || mode === "param";
      }
      return true;
    }

    function read(shadow) {
      const next = {};
      shadow.querySelectorAll("[data-ai]").forEach((node) => {
        const id = node.dataset.ai;
        if (!id) return;
        next[id] = node.type === "checkbox" ? node.checked : node.value;
      });
      return next;
    }

    function aiUsers() {
      const trans = getTranslateConfig() || {};
      const out = [];
      if (trans.service === AI_SERVICE) {
        out.push(uiText("settings.ai.user.translation", "翻译"));
      }
      if (trans.selectionService === AI_SERVICE) {
        out.push(uiText("settings.ai.user.selection", "划词翻译"));
      }
      return out;
    }

    function aiTestMessages() {
      return [
        {
          role: "system",
          content: uiText("settings.ai.test.systemPrompt", "你是接口连通性测试助手，只回复纯文本。"),
        },
        {
          role: "user",
          content: uiText("settings.ai.test.userPrompt", "请只回复：Steam Buff AI 测试成功"),
        },
      ];
    }

    function sendAiTest(testConf, operationId = "") {
      if (globalThis.STMessageBus?.send) {
        return globalThis.STMessageBus.send({
          type: "AI_CHAT_COMPLETIONS",
          operationId,
          ai: testConf,
          messages: aiTestMessages(),
        }, {
          timeoutMs: 20_000,
        });
      }
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: "AI_CHAT_COMPLETIONS",
          operationId,
          ai: testConf,
          messages: aiTestMessages(),
        }, (response) => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(new Error(err.message || String(err)));
            return;
          }
          resolve(response || null);
        });
      });
    }

    function testAi(shadow, button) {
      const next = read(shadow);
      const testConf = normalize({ ...conf, ...next });
      if (testConf.enabled !== true) {
        dialog(shadow, {
          title: uiText("settings.ai.test.title", "AI 测试"),
          message: uiText("settings.ai.test.enableFirst", "请先启用 AI模块。"),
        });
        return;
      }
      if (!testConf.host || !testConf.model) {
        dialog(shadow, {
          title: uiText("settings.ai.test.title", "AI 测试"),
          message: uiText("settings.ai.test.missingConfig", "请填写 AI 网关地址和模型。"),
        });
        return;
      }

      const oldText = button?.textContent || "";
      if (button) {
        button.disabled = true;
        button.textContent = uiText("common.testing", "测试中");
      }
      const started = performance.now();
      const operationId = root.STLoggerFactory?.createOperationId?.() || "";
      log.info("ai-test-start", "开始测试 AI 连接", { operationId, enabled: testConf.enabled === true });
      try {
        sendAiTest(testConf, operationId).then((response) => {
          const used = ((performance.now() - started) / 1000).toFixed(1);
          if (button) {
            button.disabled = false;
            button.textContent = oldText;
          }
          if (!response?.success) {
            log.error("ai-test-failed", "AI 连接测试失败", {
              operationId,
              durationMs: Math.round(performance.now() - started),
              status: Number(response?.status) || 0,
              error: response?.error || "未知错误",
            });
            dialog(shadow, {
              title: uiText("settings.ai.test.failed", "AI 测试失败"),
              message: `${response?.error || uiText("common.unknownError", "未知错误")}\n${uiText("common.elapsedSeconds", "用时 $seconds$ 秒", { seconds: used })}`,
            });
            return;
          }
          log.info("ai-test-success", "AI 连接测试成功", {
            operationId,
            durationMs: Math.round(performance.now() - started),
          });
          dialog(shadow, {
            title: uiText("settings.ai.test.success", "AI 测试成功"),
            message: `${response.text || uiText("settings.ai.test.responseReceived", "已收到响应")}\n${uiText("common.elapsedSeconds", "用时 $seconds$ 秒", { seconds: used })}`,
          });
        }).catch((error) => {
          const used = ((performance.now() - started) / 1000).toFixed(1);
          if (button) {
            button.disabled = false;
            button.textContent = oldText;
          }
          log.error("ai-test-failed", "AI 连接测试异常", {
            operationId,
            durationMs: Math.round(performance.now() - started),
            error,
          });
          dialog(shadow, {
            title: uiText("settings.ai.test.failed", "AI 测试失败"),
            message: `${error?.message || String(error)}\n${uiText("common.elapsedSeconds", "用时 $seconds$ 秒", { seconds: used })}`,
          });
        });
      } catch (error) {
        if (button) {
          button.disabled = false;
          button.textContent = oldText;
        }
        const used = ((performance.now() - started) / 1000).toFixed(1);
        log.error("ai-test-failed", "AI 连接测试异常", {
          operationId,
          durationMs: Math.round(performance.now() - started),
          error,
        });
        dialog(shadow, {
          title: uiText("settings.ai.test.failed", "AI 测试失败"),
          message: `${error?.message || String(error)}\n${uiText("common.elapsedSeconds", "用时 $seconds$ 秒", { seconds: used })}`,
        });
      }
    }

    function html() {
      const fields = getFields().filter((field) => field.key !== "enabled").filter(fieldVisible);
      return `
        <div class="settings-form">
          <section class="settings-card section-card">
            <div class="section-header">
              <div class="dot"></div>
              <div class="title">${esc(uiText("settings.ai.title", "AI 通用配置"))}</div>
              <div class="hint">${esc(uiText("settings.ai.hint", "用于全局 AI 调用"))}</div>
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
              <button class="settings-save ai-test btn btn-secondary" type="button">${esc(uiText("common.testConnection", "测试连接"))}</button>
              <button class="settings-save ai-save btn btn-blue" type="button">${esc(uiText("common.saveSettings", "保存设置"))}</button>
            </div>
          </section>
        </div>
      `;
    }

    function handleClick(event, shadow) {
      const test = event.target.closest(".ai-test");
      if (test) {
        testAi(shadow, test);
        return true;
      }

      const save = event.target.closest(".ai-save");
      if (!save) {
        return false;
      }
      if (save.disabled) {
        return true;
      }
      const next = read(shadow);
      const nextConf = normalize({ ...conf, ...next });
      if (nextConf.enabled !== true) {
        const users = aiUsers();
        if (users.length) {
          const msg = uiText("settings.ai.disableBlocked", "$users$正在使用AI服务，无法关闭AI服务。", {
            users: users.join(uiText("common.listSeparator", "、")),
          });
          dialog(shadow, { title: uiText("settings.ai.disableBlockedTitle", "无法关闭 AI 服务"), message: msg });
          onRenderRequest(shadow);
          return true;
        }
      }
      const previous = normalize(persistedConf);
      conf = nextConf;
      publishConfig();
      const startedAt = Date.now();
      const operationId = root.STLoggerFactory?.createOperationId?.() || "";
      log.info("ai-config-save-start", "开始保存 AI 配置", { operationId, enabled: nextConf.enabled === true });
      const oldText = save.textContent || "";
      save.disabled = true;
      save.textContent = uiText("common.saving", "保存中...");
      setInputsDisabled(shadow, true);
      Promise.resolve()
        .then(() => typeof storage.setAi === "function"
          ? storage.setAi(next, { operationId })
          : false)
        .then((ok) => {
          if (ok !== true) {
            restoreSavedState(shadow, previous, operationId);
            log.warn("ai-config-save-failed", "AI 配置保存失败", {
              operationId,
              enabled: nextConf.enabled === true,
              durationMs: Date.now() - startedAt,
              errorCode: ok === false ? "STORAGE_REJECTED" : "STORAGE_RESULT_UNCONFIRMED",
            });
            dialog(shadow, {
              title: uiText("common.saveFailed", "保存失败"),
              message: uiText("settings.ai.saveFailed", "AI 配置未能保存，请稍后重试。"),
            });
            return;
          }
          persistedConf = normalize(conf);
          log.info("ai-config-save-success", "AI 配置保存成功", {
            operationId,
            enabled: nextConf.enabled === true,
            durationMs: Date.now() - startedAt,
          });
          showSavePrompt(shadow, operationId);
        })
        .catch((error) => {
          restoreSavedState(shadow, previous, operationId);
          log.error("ai-config-save-failed", "AI 配置保存异常", {
            operationId,
            error,
            durationMs: Date.now() - startedAt,
          });
          dialog(shadow, {
            title: uiText("common.saveFailed", "保存失败"),
            message: uiText("settings.ai.saveError", "AI 配置保存异常，请稍后重试。"),
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
      const node = event.target.closest("[data-ai]");
      if (!node) {
        return false;
      }
      if (node.dataset.ai === "keyMode") {
        conf = normalize({ ...conf, ...read(shadow) });
        publishConfig();
        onRenderRequest(shadow);
      }
      return true;
    }

    return Object.freeze({
      getConfig,
      handleChange,
      handleClick,
      html,
      read,
      setConfig,
      setEnabled,
    });
  }

  const api = Object.freeze({
    create,
  });
  root.STSettingsAIPanel = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
