/*
 * @Author        : 顾青离
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

    function setConfig(next) {
      conf = normalize(next || {});
    }

    function getConfig() {
      return { ...conf };
    }

    function setEnabled(enabled) {
      conf = normalize({ ...conf, enabled });
      onConfigChange(conf);
      return getConfig();
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
        out.push("翻译");
      }
      if (trans.selectionService === AI_SERVICE) {
        out.push("划词翻译");
      }
      return out;
    }

    function aiTestMessages() {
      return [
        {
          role: "system",
          content: "你是接口连通性测试助手，只回复纯文本。",
        },
        {
          role: "user",
          content: "请只回复：Steam Buff AI 测试成功",
        },
      ];
    }

    function sendAiTest(testConf) {
      if (globalThis.STMessageBus?.send) {
        return globalThis.STMessageBus.send({
          type: "AI_CHAT_COMPLETIONS",
          ai: testConf,
          messages: aiTestMessages(),
        }, {
          timeoutMs: 20_000,
        });
      }
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: "AI_CHAT_COMPLETIONS",
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
        dialog(shadow, { title: "AI 测试", message: "请先启用 AI模块。" });
        return;
      }
      if (!testConf.host || !testConf.model) {
        dialog(shadow, { title: "AI 测试", message: "请填写 AI 网关地址和模型。" });
        return;
      }

      const oldText = button?.textContent || "";
      if (button) {
        button.disabled = true;
        button.textContent = "测试中";
      }
      const started = performance.now();
      log.info("ai-test-start", "开始测试 AI 连接", { enabled: testConf.enabled === true });
      try {
        sendAiTest(testConf).then((response) => {
          const used = ((performance.now() - started) / 1000).toFixed(1);
          if (button) {
            button.disabled = false;
            button.textContent = oldText;
          }
          if (!response?.success) {
            log.error("ai-test-failed", "AI 连接测试失败", {
              durationMs: Math.round(performance.now() - started),
              status: Number(response?.status) || 0,
              error: response?.error || "未知错误",
            });
            dialog(shadow, { title: "AI 测试失败", message: `${response?.error || "未知错误"}\n用时 ${used} 秒` });
            return;
          }
          log.info("ai-test-success", "AI 连接测试成功", {
            durationMs: Math.round(performance.now() - started),
          });
          dialog(shadow, { title: "AI 测试成功", message: `${response.text || "已收到响应"}\n用时 ${used} 秒` });
        }).catch((error) => {
          const used = ((performance.now() - started) / 1000).toFixed(1);
          if (button) {
            button.disabled = false;
            button.textContent = oldText;
          }
          log.error("ai-test-failed", "AI 连接测试异常", {
            durationMs: Math.round(performance.now() - started),
            error: error?.message || String(error),
          });
          dialog(shadow, { title: "AI 测试失败", message: `${error?.message || String(error)}\n用时 ${used} 秒` });
        });
      } catch (error) {
        if (button) {
          button.disabled = false;
          button.textContent = oldText;
        }
        const used = ((performance.now() - started) / 1000).toFixed(1);
        log.error("ai-test-failed", "AI 连接测试异常", {
          durationMs: Math.round(performance.now() - started),
          error: error?.message || String(error),
        });
        dialog(shadow, { title: "AI 测试失败", message: `${error?.message || String(error)}\n用时 ${used} 秒` });
      }
    }

    function html() {
      const fields = getFields().filter((field) => field.key !== "enabled").filter(fieldVisible);
      return `
        <div class="settings-form">
          <section class="settings-card section-card">
            <div class="section-header">
              <div class="dot"></div>
              <div class="title">AI 通用配置</div>
              <div class="hint">用于全局 AI 调用</div>
            </div>
            <div class="settings-grid">
              ${fields.map((field) => `
                <div class="settings-row form-row">
                  <span class="settings-label label">${esc(field.label)}</span>
                  <span class="settings-value control">${input(field)}</span>
                </div>
              `).join("")}
            </div>
            <div class="settings-actions form-footer">
              <button class="settings-save ai-test btn btn-secondary" type="button">测试连接</button>
              <button class="settings-save ai-save btn btn-blue" type="button">保存设置</button>
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
      const next = read(shadow);
      const nextConf = normalize({ ...conf, ...next });
      if (nextConf.enabled !== true) {
        const users = aiUsers();
        if (users.length) {
          const msg = `${users.join("、")}正在使用AI服务，无法关闭AI服务。`;
          dialog(shadow, { title: "无法关闭 AI 服务", message: msg });
          onRenderRequest(shadow);
          return true;
        }
      }
      conf = nextConf;
      onConfigChange(conf);
      const startedAt = Date.now();
      log.info("ai-config-save-start", "开始保存 AI 配置", { enabled: nextConf.enabled === true });
      try {
        const job = storage.setAi?.(next);
        if (job?.then) {
          job.then((ok) => {
            log[ok === false ? "warn" : "info"](ok === false ? "ai-config-save-failed" : "ai-config-save-success", ok === false ? "AI 配置保存失败" : "AI 配置保存成功", {
              enabled: nextConf.enabled === true,
              durationMs: Date.now() - startedAt,
            });
            savePrompt(shadow);
          }).catch((error) => {
            log.error("ai-config-save-failed", "AI 配置保存失败", {
              error: error?.message || String(error),
              durationMs: Date.now() - startedAt,
            });
            savePrompt(shadow);
          });
        } else {
          log.info("ai-config-save-success", "AI 配置保存成功", {
            enabled: nextConf.enabled === true,
            durationMs: Date.now() - startedAt,
          });
          savePrompt(shadow);
        }
      } catch (error) {
        log.error("ai-config-save-failed", "AI 配置保存异常", {
          error: error?.message || String(error),
          durationMs: Date.now() - startedAt,
        });
        savePrompt(shadow);
      }
      return true;
    }

    function handleChange(event, shadow) {
      const node = event.target.closest("[data-ai]");
      if (!node) {
        return false;
      }
      if (node.dataset.ai === "keyMode") {
        conf = normalize({ ...conf, ...read(shadow) });
        onConfigChange(conf);
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
