/*
 * @Author        : 顾青离
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
        enableInternalCapabilities: itad.enableInternalCapabilities === true,
      },
      routes: {
        prices: routes.prices === PROVIDER ? PROVIDER : PROVIDER,
        history: routes.history === PROVIDER ? PROVIDER : PROVIDER,
        discountForecast: routes.discountForecast === PROVIDER ? PROVIDER : PROVIDER,
        reviews: routes.reviews === PROVIDER ? PROVIDER : "",
        players: routes.players === PROVIDER ? PROVIDER : "",
        playtime: routes.playtime === PROVIDER ? PROVIDER : "",
        mediaScore: routes.mediaScore === PROVIDER ? PROVIDER : "",
      },
    };
  }

  function testUrl() {
    const vendor = root.STConfig?.vendors?.isthereanydeal;
    if (typeof vendor?.statsMostPopular === "function") {
      return vendor.statsMostPopular(1, 0);
    }
    if (typeof vendor?.endpoint === "function") {
      return `${vendor.endpoint("/stats/most-popular/v1")}?limit=1&offset=0`;
    }
    return "https://api.isthereanydeal.com/stats/most-popular/v1?limit=1&offset=0";
  }

  function testFailureFromStatus(status) {
    if (status === 401 || status === 403) {
      return {
        code: "PROVIDER_AUTH_FAILED",
        message: "ITAD API Key 验证失败，请检查密钥是否正确或权限是否可用。",
        retryable: false,
      };
    }
    if (status === 429) {
      return {
        code: "PROVIDER_RATE_LIMITED",
        message: "ITAD 请求已触发限流，请稍后再试。",
        retryable: true,
      };
    }
    if (status >= 500) {
      return {
        code: "PROVIDER_UNAVAILABLE",
        message: "ITAD 服务暂时不可用，请稍后重试。",
        retryable: true,
      };
    }
    if (status > 0) {
      return {
        code: "PROVIDER_HTTP_ERROR",
        message: `ITAD 测试接口返回状态码 ${status}。`,
        retryable: status >= 500,
      };
    }
    return {
      code: "NETWORK_FAILED",
      message: "网络请求失败，请检查网络连接或稍后重试。",
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
      const err = new Error("ITAD 测试接口响应格式异常。");
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

    function setConfig(next) {
      conf = normalize(next || {}, getDefaults());
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

    async function save(shadow, button, nextConfig, reason = "save") {
      const next = normalize(nextConfig || read(shadow), getDefaults());
      conf = next;
      onConfigChange(conf);
      const startedAt = Date.now();
      log.info("third-party-services-save-start", "开始保存第三方服务配置", {
        enabled: next.enabled === true,
        provider: next.defaultProvider,
        hasItadKey: hasItadKey(next),
        reason,
      });
      if (button) {
        button.disabled = true;
      }
      try {
        const saved = await storage.setThirdPartyServices?.(next);
        if (button) {
          button.disabled = false;
        }
        if (saved === false) {
          log.warn("third-party-services-save-failed", "第三方服务配置保存失败", {
            enabled: next.enabled === true,
            provider: next.defaultProvider,
            hasItadKey: hasItadKey(next),
            durationMs: Date.now() - startedAt,
            errorCode: "STORAGE_REJECTED",
          });
          dialog(shadow, { title: "保存失败", message: "第三方服务配置保存失败，请稍后重试。" });
          return false;
        }
        conf = normalize(saved || next, getDefaults());
        onConfigChange(conf);
        log.info("third-party-services-save-success", "第三方服务配置保存成功", {
          enabled: conf.enabled === true,
          provider: conf.defaultProvider,
          hasItadKey: hasItadKey(conf),
          durationMs: Date.now() - startedAt,
        });
        savePrompt(shadow);
        return true;
      } catch (error) {
        if (button) {
          button.disabled = false;
        }
        log.error("third-party-services-save-failed", "第三方服务配置保存异常", {
          enabled: next.enabled === true,
          provider: next.defaultProvider,
          hasItadKey: hasItadKey(next),
          durationMs: Date.now() - startedAt,
          errorCode: "STORAGE_THROWN",
          error: error?.message || String(error),
        });
        dialog(shadow, { title: "保存失败", message: "第三方服务配置保存异常，请稍后重试。" });
        return false;
      }
    }

    async function testConnection(shadow, button) {
      const next = read(shadow);
      conf = next;
      onConfigChange(conf);
      const key = String(next.isthereanydeal?.key || "").trim();
      const id = requestId();

      if (!key) {
        log.warn("itad-test-failed", "ITAD 连接测试缺少 API Key", {
          requestId: id,
          status: 0,
          durationMs: 0,
          retryable: false,
          errorCode: "PROVIDER_CONFIG_MISSING",
        });
        dialog(shadow, { title: "ITAD 测试", message: "请先填写 ITAD API Key。" });
        return;
      }

      const oldText = button?.textContent || "";
      if (button) {
        button.disabled = true;
        button.textContent = "测试中";
      }
      const startedAt = Date.now();
      log.info("itad-test-start", "开始测试 ITAD 连接", {
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
          label: "ITAD 测试接口",
        });
        const status = Number(response?.status) || 0;
        if (response?.ok === false) {
          const failure = testFailureFromStatus(status);
          log.warn("itad-test-failed", "ITAD 连接测试失败", {
            requestId: id,
            status,
            durationMs: Date.now() - startedAt,
            retryable: failure.retryable,
            errorCode: failure.code,
          });
          dialog(shadow, { title: "ITAD 测试失败", message: failure.message });
          return;
        }
        parseTestPayload(response);
        log.info("itad-test-success", "ITAD 连接测试成功", {
          requestId: id,
          status,
          durationMs: Date.now() - startedAt,
        });
        dialog(shadow, { title: "ITAD 测试成功", message: "已收到 ITAD 测试接口响应。" });
      } catch (error) {
        const status = Number(error?.status) || 0;
        const failure = error?.name === "ValidationError"
          ? { code: "RESPONSE_SHAPE_INVALID", message: "ITAD 测试接口响应格式异常。", retryable: false }
          : testFailureFromStatus(status);
        log[failure.retryable ? "warn" : "error"]("itad-test-failed", "ITAD 连接测试异常", {
          requestId: id,
          status,
          durationMs: Date.now() - startedAt,
          retryable: failure.retryable,
          errorCode: failure.code,
          error: error?.message || String(error),
        });
        dialog(shadow, { title: "ITAD 测试失败", message: failure.message });
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
              <div class="title">第三方服务</div>
              <div class="hint">${hasItadKey(conf) ? "已填写 ITAD Key" : "未填写 ITAD Key"}</div>
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
              <button class="settings-save third-party-services-test btn btn-secondary" type="button">测试连接</button>
              <button class="settings-save third-party-services-save btn btn-blue" type="button">保存设置</button>
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
      save(shadow, submit);
      return true;
    }

    function handleChange(event, shadow) {
      const node = event.target.closest("[data-third-party-services]");
      if (!node) {
        return false;
      }
      conf = read(shadow);
      onConfigChange(conf);
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
