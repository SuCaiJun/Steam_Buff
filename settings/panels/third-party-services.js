/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置面板|第三方服务业务面板
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const PROVIDER = "isthereanydeal";
  const TEST_TIMEOUT_MS = 12 * 1000;
  const log = root.STLoggerFactory.createLogger("settings", "third-party-services");

  function text(key, fallback, params) {
    return root.STI18n.text(key, fallback, params);
  }

  function fallback(value, name) {
    if (typeof value === "function") {
      return value;
    }
    return root.STSettingsHtml?.[name] || ((text) => String(text ?? ""));
  }

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value ?? {}));
    } catch {
      return {};
    }
  }

  function getPath(src, path, fallbackValue = "") {
    const parts = String(path || "").split(".").filter(Boolean);
    let cur = src;
    for (const part of parts) {
      if (!cur || typeof cur !== "object" || !Object.hasOwn(cur, part)) {
        return fallbackValue;
      }
      cur = cur[part];
    }
    return cur === undefined ? fallbackValue : cur;
  }

  function setPath(target, path, value) {
    const parts = String(path || "").split(".").filter(Boolean);
    if (!parts.length) {
      return;
    }
    let cur = target;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i];
      if (!cur[part] || typeof cur[part] !== "object" || Array.isArray(cur[part])) {
        cur[part] = {};
      }
      cur = cur[part];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function requestId() {
    return `itad-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function hasItadKey(conf) {
    return String(conf?.isthereanydeal?.key || "").trim() !== "";
  }

  function normalize(values, defaults) {
    const src = values && typeof values === "object" ? values : {};
    const defs = defaults && typeof defaults === "object" ? defaults : {};
    const itad = src.isthereanydeal && typeof src.isthereanydeal === "object" ? src.isthereanydeal : {};
    const defItad = defs.isthereanydeal || {};
    const routes = { ...(defs.routes || {}), ...(src.routes || {}) };
    return {
      enabled: src.enabled === true,
      defaultProvider: PROVIDER,
      isthereanydeal: {
        key: String(itad.key ?? defItad.key ?? "").trim(),
        country: String(itad.country || defItad.country || "auto"),
        shops: Array.isArray(itad.shops) ? itad.shops : clone(defItad.shops || [61]),
      },
      routes: {
        prices: routes.prices === PROVIDER ? PROVIDER : PROVIDER,
        history: routes.history === PROVIDER ? PROVIDER : PROVIDER,
        discountForecast: routes.discountForecast === PROVIDER ? PROVIDER : PROVIDER,
      },
    };
  }

  function testUrl() {
    const endpoint = root.STConfig?.vendors?.isthereanydeal?.statsMostPopular;
    if (typeof endpoint !== "function") {
      const error = new Error(text("settings.thirdParty.testEndpointUnavailable", "ITAD 测试接口配置未就绪。"));
      error.name = "ConfigurationError";
      throw error;
    }
    return endpoint(1, 0);
  }

  function testFailureFromStatus(status) {
    if (status === 401 || status === 403) {
      return {
        code: "PROVIDER_AUTH_FAILED",
        message: text("settings.thirdParty.authFailed", "ITAD API Key 验证失败，请检查密钥是否正确或权限是否可用。"),
        retryable: false,
      };
    }
    if (status === 429) {
      return {
        code: "PROVIDER_RATE_LIMITED",
        message: text("settings.thirdParty.rateLimited", "ITAD 请求已触发限流，请稍后再试。"),
        retryable: true,
      };
    }
    if (status >= 500) {
      return {
        code: "PROVIDER_UNAVAILABLE",
        message: text("settings.thirdParty.unavailable", "ITAD 服务暂时不可用，请稍后重试。"),
        retryable: true,
      };
    }
    if (status > 0) {
      return {
        code: "PROVIDER_HTTP_ERROR",
        message: text("settings.thirdParty.httpError", "ITAD 测试接口返回状态码 $status$。", { status }),
        retryable: status >= 500,
      };
    }
    return {
      code: "NETWORK_FAILED",
      message: text("common.networkFailed", "网络请求失败，请检查网络连接或稍后重试。"),
      retryable: true,
    };
  }

  function parseTestPayload(response) {
    try {
      const payload = JSON.parse(response?.data || "null");
      if (!payload || (typeof payload !== "object" && !Array.isArray(payload))) {
        throw new Error("invalid-shape");
      }
      return payload;
    } catch (error) {
      const err = new Error(text("settings.thirdParty.invalidResponse", "ITAD 测试接口响应格式异常。"));
      err.name = "ValidationError";
      err.cause = error;
      throw err;
    }
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
    const getDefaults = typeof options.getDefaults === "function"
      ? options.getDefaults
      : () => options.catalog?.thirdPartyServicesDefaults?.() || root.STSettings?.catalog?.thirdPartyServicesDefaults?.() || {};
    const getFields = typeof options.getFields === "function"
      ? options.getFields
      : () => options.catalog?.thirdPartyServicesFields?.() || root.STSettings?.catalog?.thirdPartyServicesFields?.() || [];
    let conf = normalize(options.config || {}, getDefaults());
    let persistedConf = clone(conf);
    let publishingConfig = false;

    function setConfig(next) {
      conf = normalize(next || {}, getDefaults());
      if (!publishingConfig) {
        persistedConf = clone(conf);
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
      return clone(conf);
    }

    function input(field) {
      const value = getPath(conf, field.key, "");
      if (field.type === "checkbox") {
        return fieldInput({
          field,
          value: value === true,
          dataset: "data-third-party-services",
          checkClass: "settings-check",
        });
      }
      return fieldInput({
        field,
        value: String(value ?? ""),
        dataset: "data-third-party-services",
        className: "settings-control",
      });
    }

    function read(shadow) {
      const next = normalize(conf, getDefaults());
      shadow.querySelectorAll("[data-third-party-services]").forEach((node) => {
        const id = node.dataset.thirdPartyServices;
        if (!id) return;
        setPath(next, id, node.type === "checkbox" ? node.checked : node.value);
      });
      return normalize(next, getDefaults());
    }

    function restoreInputs(shadow, source) {
      shadow.querySelectorAll("[data-third-party-services]").forEach((node) => {
        const id = node.dataset.thirdPartyServices;
        if (!id) return;
        const value = getPath(source, id, "");
        if (node.type === "checkbox") {
          node.checked = value === true;
          return;
        }
        node.value = String(value ?? "");
      });
    }

    function setInputsDisabled(shadow, disabled) {
      shadow.querySelectorAll("[data-third-party-services]").forEach((node) => {
        node.disabled = disabled;
      });
    }

    function showSavePrompt(shadow, operationId) {
      void Promise.resolve()
        .then(() => savePrompt(shadow))
        .catch((error) => {
          log.warn("third-party-services-save-prompt-failed", "第三方服务配置已保存，但成功提示显示失败", {
            operationId,
            error,
          });
        });
    }

    async function save(shadow, button, nextConfig, reason = "save") {
      const previous = clone(persistedConf);
      const next = normalize(nextConfig || read(shadow), getDefaults());
      conf = next;
      publishConfig();
      const startedAt = Date.now();
      const operationId = root.STLoggerFactory?.createOperationId?.() || "";
      log.info("third-party-services-save-start", "开始保存第三方服务配置", {
        operationId,
        enabled: next.enabled === true,
        provider: next.defaultProvider,
        hasItadKey: hasItadKey(next),
        reason,
      });
      if (button) {
        button.disabled = true;
      }
      setInputsDisabled(shadow, true);
      try {
        const saved = typeof storage.setThirdPartyServices === "function"
          ? await storage.setThirdPartyServices(next, { operationId })
          : false;
        if (!saved || typeof saved !== "object") {
          conf = previous;
          publishConfig();
          restoreInputs(shadow, conf);
          log.warn("third-party-services-save-failed", "第三方服务配置保存失败", {
            operationId,
            enabled: next.enabled === true,
            provider: next.defaultProvider,
            hasItadKey: hasItadKey(next),
            durationMs: Date.now() - startedAt,
            errorCode: saved === false ? "STORAGE_REJECTED" : "STORAGE_RESULT_UNCONFIRMED",
          });
          dialog(shadow, {
            title: text("common.saveFailed", "保存失败"),
            message: text("settings.thirdParty.saveFailed", "第三方服务配置保存失败，请稍后重试。"),
          });
          return false;
        }
        conf = normalize(saved, getDefaults());
        persistedConf = clone(conf);
        publishConfig();
        log.info("third-party-services-save-success", "第三方服务配置保存成功", {
          operationId,
          enabled: conf.enabled === true,
          provider: conf.defaultProvider,
          hasItadKey: hasItadKey(conf),
          durationMs: Date.now() - startedAt,
        });
        showSavePrompt(shadow, operationId);
        return true;
      } catch (error) {
        conf = previous;
        publishConfig();
        restoreInputs(shadow, conf);
        log.error("third-party-services-save-failed", "第三方服务配置保存异常", {
          operationId,
          enabled: next.enabled === true,
          provider: next.defaultProvider,
          hasItadKey: hasItadKey(next),
          durationMs: Date.now() - startedAt,
          errorCode: "STORAGE_THROWN",
          error,
        });
        dialog(shadow, {
          title: text("common.saveFailed", "保存失败"),
          message: text("settings.thirdParty.saveException", "第三方服务配置保存异常，请稍后重试。"),
        });
        return false;
      } finally {
        setInputsDisabled(shadow, false);
        if (button) {
          button.disabled = false;
        }
      }
    }

    async function testConnection(shadow, button) {
      const next = read(shadow);
      conf = next;
      publishConfig();
      const key = String(next.isthereanydeal?.key || "").trim();
      const id = requestId();
      const operationId = root.STLoggerFactory?.createOperationId?.() || "";

      if (!key) {
        log.warn("itad-test-failed", "ITAD 连接测试缺少 API Key", {
          operationId,
          requestId: id,
          status: 0,
          durationMs: 0,
          retryable: false,
          errorCode: "PROVIDER_CONFIG_MISSING",
        });
        dialog(shadow, {
          title: text("settings.thirdParty.testTitle", "ITAD 测试"),
          message: text("settings.thirdParty.keyRequired", "请先填写 ITAD API Key。"),
        });
        return;
      }

      const oldText = button?.textContent || "";
      if (button) {
        button.disabled = true;
        button.textContent = text("settings.thirdParty.testing", "测试中");
      }
      const startedAt = Date.now();
      log.info("itad-test-start", "开始测试 ITAD 连接", {
        operationId,
        requestId: id,
        hasItadKey: true,
      });
      try {
        const response = await root.STSettingsApiRequest.request({
          url: testUrl(),
          method: "GET",
          headers: {
            Accept: "application/json",
            "ITAD-API-Key": key,
          },
          allowHttpError: true,
          timeoutMs: TEST_TIMEOUT_MS,
          label: text("settings.thirdParty.testRequestLabel", "ITAD 测试接口"),
          operationId,
          requestId: id,
        });
        const status = Number(response?.status) || 0;
        if (response?.ok === false) {
          const failure = testFailureFromStatus(status);
          log.warn("itad-test-failed", "ITAD 连接测试失败", {
            operationId,
            requestId: id,
            status,
            durationMs: Date.now() - startedAt,
            retryable: failure.retryable,
            errorCode: failure.code,
          });
          dialog(shadow, { title: text("settings.thirdParty.testFailedTitle", "ITAD 测试失败"), message: failure.message });
          return;
        }
        parseTestPayload(response);
        log.info("itad-test-success", "ITAD 连接测试成功", {
          operationId,
          requestId: id,
          status,
          durationMs: Date.now() - startedAt,
        });
        dialog(shadow, {
          title: text("settings.thirdParty.testSucceededTitle", "ITAD 测试成功"),
          message: text("settings.thirdParty.testSucceededMessage", "已收到 ITAD 测试接口响应。"),
        });
      } catch (error) {
        const status = Number(error?.status) || 0;
        const failure = error?.name === "ValidationError"
          ? { code: "RESPONSE_SHAPE_INVALID", message: text("settings.thirdParty.invalidResponse", "ITAD 测试接口响应格式异常。"), retryable: false }
          : error?.name === "ConfigurationError"
            ? { code: "TEST_ENDPOINT_UNAVAILABLE", message: error.message, retryable: false }
            : testFailureFromStatus(status);
        log[failure.retryable ? "warn" : "error"]("itad-test-failed", "ITAD 连接测试异常", {
          operationId,
          requestId: id,
          status,
          durationMs: Date.now() - startedAt,
          retryable: failure.retryable,
          errorCode: failure.code,
          error,
        });
        dialog(shadow, { title: text("settings.thirdParty.testFailedTitle", "ITAD 测试失败"), message: failure.message });
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = oldText;
        }
      }
    }

    function html() {
      const startedAt = Date.now();
      const fields = getFields();
      const body = `
        <div class="settings-form">
          <section class="settings-card section-card">
            <div class="section-header">
              <div class="dot"></div>
              <div class="title">${text("settings.thirdParty.title", "第三方服务")}</div>
              <div class="hint">${hasItadKey(conf)
                ? text("settings.thirdParty.keyConfigured", "已填写 ITAD Key")
                : text("settings.thirdParty.keyMissing", "未填写 ITAD Key")}</div>
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
              <button class="settings-save third-party-services-test btn btn-secondary" type="button">${text("settings.thirdParty.testConnection", "测试连接")}</button>
              <button class="settings-save third-party-services-save btn btn-blue" type="button">${text("common.saveSettings", "保存设置")}</button>
            </div>
          </section>
        </div>
      `;
      log.info("third-party-services-panel-open", "第三方服务面板打开", {
        enabled: conf.enabled === true,
        defaultProvider: conf.defaultProvider,
        hasItadKey: hasItadKey(conf),
        durationMs: Date.now() - startedAt,
      });
      return body;
    }

    function handleClick(event, shadow) {
      const test = event.target.closest(".third-party-services-test");
      if (test) {
        testConnection(shadow, test);
        return true;
      }
      const submit = event.target.closest(".third-party-services-save");
      if (!submit) {
        return false;
      }
      if (submit.disabled) {
        return true;
      }
      save(shadow, submit);
      return true;
    }

    function handleChange(event, shadow) {
      const node = event.target.closest("[data-third-party-services]");
      if (!node) {
        return false;
      }
      conf = read(shadow);
      publishConfig();
      return true;
    }

    return Object.freeze({
      getConfig,
      handleChange,
      handleClick,
      html,
      read,
      setConfig,
    });
  }

  const api = Object.freeze({ create });
  root.STSettingsThirdPartyServicesPanel = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
