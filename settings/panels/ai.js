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

  const AI_GATEWAY_PERMISSION_CHECK = "AI_GATEWAY_PERMISSION_CHECK";
  const AI_GATEWAY_PERMISSION_REQUEST = "AI_GATEWAY_PERMISSION_REQUEST";
  const AI_GATEWAY_PERMISSION_OPEN = "AI_GATEWAY_PERMISSION_OPEN";
  const AI_GATEWAY_PERMISSION_CANCEL = "AI_GATEWAY_PERMISSION_CANCEL";
  const AI_GATEWAY_PERMISSION_RESULT = "AI_GATEWAY_PERMISSION_RESULT";
  const AI_PERMISSION_WAIT_TIMEOUT_MS = 5 * 60 * 1000;
  const RETRYABLE_PERMISSION_ERRORS = new Set([
    "AI_HOST_PERMISSION_PAGE_CLOSED",
    "AI_HOST_PERMISSION_DENIED",
    "AI_HOST_PERMISSION_TIMEOUT",
  ]);
  const log = root.STLoggerFactory.createLogger("settings", "ai");
  const CHAT_SHORTCUT = "ai-chat-send-shortcut";
  const CHAT_PROMPT = "ai-chat-prompt";

  function fallback(value, name) {
    if (typeof value === "function") {
      return value;
    }
    return root.STSettingsHtml?.[name] || ((text) => String(text ?? ""));
  }

  function create(options = {}) {
    const esc = fallback(options.esc, "esc");
    const fieldInput = options.fieldInput || root.STSettingsFields.fieldInput;
    const dialog = options.dialog || root.STSettingsDialogs.dialog;
    const storage = options.storage || root.STSettings?.storage;
    const ai = root.STAI;
    const chatEntries = ai.CHAT_ENTRY_FEATURES;
    let conf, busy = false;
    setConfig(options.config);

    function uiText(key, fallback, params) {
      return root.STI18n.text(key, fallback, params);
    }

    function setConfig(next) {
      conf = next?.unavailable === true ? null : ai.normalizeServices(next);
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

    function sendAiTest(testConf, operationId = "", signal) {
      if (globalThis.STMessageBus?.ready && globalThis.STMessageBus?.send) {
        return globalThis.STMessageBus.send({
          type: "AI_CHAT_COMPLETIONS",
          action: "test-connection",
          operationId,
          ai: testConf,
          messages: aiTestMessages(),
        }, {
          timeoutMs: 20_000, signal,
        });
      }
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: "AI_CHAT_COMPLETIONS",
          action: "test-connection",
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

    function sendPermissionMessage(payload, timeoutMs) {
      if (globalThis.STMessageBus?.ready && globalThis.STMessageBus?.send) {
        return globalThis.STMessageBus.send(payload, { timeoutMs });
      }
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(payload, (response) => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(new Error(error.message || String(error)));
            return;
          }
          resolve(response || null);
        });
      });
    }

    function permissionError(response, fallbackKey = "settings.ai.permissionFailed") {
      const denied = response?.code === "AI_HOST_PERMISSION_DENIED";
      const error = new Error(response?.error || (denied
        ? uiText("settings.ai.permissionDenied", "未获得当前 AI 网关的访问权限，请允许访问后重试。")
        : uiText(fallbackKey, "AI 网关访问权限申请失败，请稍后重试。")));
      error.code = response?.code || "AI_HOST_PERMISSION_REQUEST_FAILED";
      return error;
    }

    function beginPermissionWait(shadow, card = shadow.querySelector("[data-ai-modal]") || shadow.querySelector("[data-ai-card]")) {
      const overlay = card?.querySelector("[data-ai-permission-wait]");
      if (!card || !overlay) return () => {};
      const controls = Array.from(card.querySelectorAll("button, input, select, textarea"));
      const disabled = controls.map(node => node.disabled === true);
      const previousBusy = card.getAttribute("aria-busy");
      controls.forEach((node) => { node.disabled = true; });
      card.setAttribute("aria-busy", "true");
      overlay.hidden = false;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        controls.forEach((node, index) => {
          if (node.isConnected) node.disabled = disabled[index];
        });
        if (previousBusy === null) card.removeAttribute("aria-busy");
        else card.setAttribute("aria-busy", previousBusy);
        overlay.hidden = true;
      };
    }

    function permissionResultWaiter(requestId) {
      let subscription = null;
      let timer = 0;
      let settled = false;
      let resolvePromise;
      let rejectPromise;
      const promise = new Promise((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
      });
      const dispose = () => {
        if (timer) {
          root.clearTimeout(timer);
          timer = 0;
        }
        subscription?.dispose?.();
        subscription = null;
      };
      const finish = (error) => {
        if (settled) return;
        settled = true;
        dispose();
        if (error) rejectPromise(error);
        else resolvePromise(true);
      };
      subscription = globalThis.STMessageBus?.ready
        ? globalThis.STMessageBus.listen?.(AI_GATEWAY_PERMISSION_RESULT, (message, _sender, sendResponse) => {
        if (String(message?.requestId || "") !== requestId) {
          return false;
        }
        sendResponse?.({ success: true, received: true });
        finish(message?.granted === true ? null : permissionError(message));
        return false;
      }, {
        owner: "settings-ai",
        key: `permission-result:${requestId}`,
      })
        : null;
      if (!subscription) {
        const error = new Error(uiText("settings.ai.permissionFailed", "AI 网关访问权限申请失败，请稍后重试。"));
        error.code = "AI_HOST_PERMISSION_RESULT_UNAVAILABLE";
        finish(error);
      } else {
        timer = root.setTimeout(() => {
          const error = new Error(uiText("settings.ai.permissionTimeout", "等待授权超时，请重新操作。"));
          error.code = "AI_HOST_PERMISSION_TIMEOUT";
          finish(error);
        }, AI_PERMISSION_WAIT_TIMEOUT_MS);
      }
      return Object.freeze({
        promise,
        cancel() {
          if (settled) return;
          settled = true;
          dispose();
          resolvePromise(false);
        },
      });
    }

    function cancelPermissionRequest(requestId, operationId) {
      return sendPermissionMessage({
        type: AI_GATEWAY_PERMISSION_CANCEL,
        requestId,
        operationId,
      }, 5_000).then((response) => {
        if (response?.success !== true) throw permissionError(response);
        return response;
      });
    }

    function retryPermission(shadow, error) {
      return dialog(shadow, {
        title: uiText("settings.ai.permissionRetryTitle", "授权失败"),
        message: uiText("settings.ai.permissionRetryMessage", "原因：$reason$\n是否重试？", {
          reason: error?.message || uiText("common.unknownError", "未知错误"),
        }),
        actions: [
          { id: "cancel", label: uiText("common.cancel", "取消") },
          { id: "retry", label: uiText("common.retry", "重试"), primary: true },
        ],
      });
    }

    async function requestAiGatewayPermission(ai, shadow, operationId = "", signal, waitCard) {
      signal?.throwIfAborted();
      if (ai?.enabled !== true || !ai?.host) {
        return true;
      }
      const host = ai.host;
      const check = await sendPermissionMessage({
        type: AI_GATEWAY_PERMISSION_CHECK,
        operationId,
        host,
      }, 5_000);
      signal?.throwIfAborted();
      if (check?.success !== true) throw permissionError(check);
      if (check.granted === true) return true;
      if (root.STClientEnvironment.isSteamClientPage() !== true) {
        const response = await sendPermissionMessage({
          type: AI_GATEWAY_PERMISSION_REQUEST,
          operationId,
          host,
        }, 0);
        signal?.throwIfAborted();
        if (response?.granted !== true) throw permissionError(response);
        return true;
      }

      const action = await dialog(shadow, {
        title: uiText("settings.ai.permissionBrowserTitle", "需要浏览器授权"),
        message: uiText("settings.ai.permissionBrowserMessage", "该操作需要授权，需打开 Chromium 浏览器进行授权操作。是否继续？"),
        actions: [
          { id: "cancel", label: uiText("common.cancel", "取消") },
          { id: "continue", label: uiText("common.continue", "继续"), primary: true },
        ],
      });
      signal?.throwIfAborted();
      if (action !== "continue") {
        const error = new Error("");
        error.code = "AI_HOST_PERMISSION_CANCELLED";
        throw error;
      }

      let attempt = 0;
      while (true) {
        signal?.throwIfAborted();
        attempt += 1;
        const requestId = root.STLoggerFactory.createRequestId();
        const waiter = permissionResultWaiter(requestId);
        const abortWaiter = () => waiter.cancel();
        signal?.addEventListener("abort", abortWaiter, { once: true });
        const releaseWait = beginPermissionWait(shadow, waitCard);
        let opened = false;
        try {
          const response = await sendPermissionMessage({
            type: AI_GATEWAY_PERMISSION_OPEN,
            requestId,
            operationId,
            host,
          }, 10_000);
          if (response?.opened !== true) throw permissionError(response);
          opened = true;
          await waiter.promise;
          signal?.throwIfAborted();
          return true;
        } catch (error) {
          waiter.cancel();
          if (opened && (signal?.aborted || error?.code === "AI_HOST_PERMISSION_TIMEOUT")) {
            await cancelPermissionRequest(requestId, operationId);
          }
          if (!RETRYABLE_PERMISSION_ERRORS.has(error?.code)) throw error;
          releaseWait();
          const retry = await retryPermission(shadow, error);
          if (retry !== "retry") {
            const cancelled = new Error("");
            cancelled.code = "AI_HOST_PERMISSION_CANCELLED";
            throw cancelled;
          }
          log.warn("ai-permission-retry", "用户重试 AI 网关授权", {
            operationId,
            requestId,
            attempt,
            errorCode: error.code,
          });
        } finally {
          signal?.removeEventListener("abort", abortWaiter);
          releaseWait();
        }
      }
    }

    function row(label, value, attrs = "") {
      return `<label class="settings-row form-row" ${attrs}>
        <span class="settings-label label">${esc(label)}</span>
        <span class="settings-value control">${value}</span>
      </label>`;
    }

    function button(action, text, primary = false) {
      return `<button type="button" class="btn ${primary ? "btn-blue" : "btn-secondary"}" data-ai-action="${action}">${esc(text)}</button>`;
    }

    function serviceIcon(action, text, service, icon, pressed) {
      const assets = root.STSettingsAssets;
      const url = icon === "test" ? assets.retryIcon() : assets.gameLinkIcon(icon);
      const label = esc(`${text} ${service.name}`);
      return `<button type="button" class="ai-service-icon-button" data-ai-action="${action}" title="${label}" aria-label="${label}" ${pressed === undefined ? "" : `aria-pressed="${pressed}"`}>
        <span class="ai-service-icon" style="mask-image:url('${esc(url)}')" aria-hidden="true"></span>
      </button>`;
    }

    function providerLabel(preset) {
      return uiText("settings.ai.provider." + preset.id, preset.label);
    }

    function editorHtml(draft, providers, provider, concurrency) {
      const providerText = uiText("settings.ai.provider", "供应商");
      const chooser = fieldInput({ field: {
        key: "provider", label: providerText, type: "select",
        options: providers.map(preset => ({ value: preset.id, label: providerLabel(preset) })),
      }, value: provider.id, dataset: "data-ai" });
      const name = `<input class="settings-control" type="text" data-ai="name" value="${esc(draft.name)}" maxlength="200" autocomplete="off">`;
      const fields = (options.catalog?.aiFields?.() || ai.SERVICE_FIELDS).filter(field =>
        ["host", "keyMode", "keyName", "key"].includes(field.key));
      const field = key => {
        const item = fields.find(row => row.key === key);
        const hide = key === "key" && draft.keyMode === "none" || key === "keyName" && !["header", "param"].includes(draft.keyMode);
        return row(key === "key" ? uiText("settings_ai_apiKey", "API 密钥") : uiText(`settings_field_ai_${key}_label`, item.label), fieldInput({
          field: { ...item, options: item.options?.map(option => ({
            ...option, label: uiText(`settings_field_ai_${key}_option_${option.value}`, option.label),
          })) },
          value: key === "key" ? "" : draft[key], dataset: "data-ai", className: "settings-control",
        }), `data-ai-field="${key}" ${hide ? "hidden" : ""}`);
      };
      return `<div class="settings-grid" data-ai-editor>
          ${row(providerText, chooser)}${row(uiText("settings_ai_connectionName", "连接名称"), name)}${field("key")}
          <section class="ai-connection-models" aria-label="${esc(uiText("settings_ai_modelList", "模型列表"))}">
            <header class="ai-model-heading"><strong>${esc(uiText("settings_ai_modelList", "模型列表"))}</strong>
              <button type="button" class="btn btn-secondary" data-ai-editor-action="fetch">${esc(uiText("settings_ai_fetchModels", "获取可用模型"))}</button>
              <button type="button" class="btn btn-secondary" data-ai-editor-action="add">${esc(uiText("settings_ai_addModel", "添加模型"))}</button>
            </header>
            <div>
              <div data-ai-model-list></div>
              <p class="ai-service-empty" data-ai-model-empty>${esc(uiText("settings_ai_fetchModelsFirst", "请先获取可用模型"))}</p>
            </div>
            <span class="ai-model-announcement" role="status" data-ai-model-status></span>
          </section>
          <details class="ai-connection-settings"><summary>${esc(uiText("settings_ai_connectionOptions", "自定义设置"))}</summary>
            ${field("host")}${field("keyMode")}${field("keyName")}
            ${row(uiText("settings_ai_customHeaders", "自定义请求头"), `<textarea class="settings-control ai-connection-headers" data-ai="headers" rows="3" maxlength="65536" placeholder="X-Client: Steam Buff" autocomplete="off" spellcheck="false"></textarea>`)}
            ${concurrency === undefined ? "" : row(uiText("settings_field_ai_aiConcurrency_label", "AI 并发上限"),
              `<input class="settings-control" type="number" min="1" max="10" step="1" data-ai-concurrency value="${concurrency}">`)}
          </details>
        </div>
        <div class="ai-permission-wait" data-ai-permission-wait role="status" aria-label="${esc(uiText("settings_ai_permissionWaiting", "等待浏览器授权"))}" hidden>
          <span class="ai-permission-spinner" aria-hidden="true"></span>
        </div>`;
    }

    function modelIcon(action, label, url, attrs = "") {
      return `<button class="ai-service-icon-button" type="button" data-ai-editor-action="${action}" aria-label="${esc(label)}" title="${esc(label)}" ${attrs}>
        <span class="ai-service-icon" style="mask-image:url('${esc(url)}')" aria-hidden="true"></span></button>`;
    }

    function modelRowHtml(model) {
      const label = (key, fallback) => esc(uiText(key, fallback));
      const control = (key, caption, value, extra = "") => `<input class="settings-control" type="text" data-ai-model-field="${key}"
        aria-label="${caption}" value="${esc(value ?? "")}" ${extra}>`;
      const inputTypes = model.inputTypes ?? ["text"];
      const assets = root.STSettingsAssets;
      const details = `ai-model-${esc(model.id)}`;
      const textLabel = label("settings_ai_textInput", "文本");
      const imageLabel = label("settings_ai_imageInput", "图片");
      return `<div class="ai-model-main">
          ${modelIcon("drag", uiText("settings_ai_reorderModel", "拖动排序"), assets.gameLinkIcon("drag"), 'draggable="true" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"')}
          ${control("model", label("settings_ai_modelId", "模型 ID"), model.model, 'placeholder="模型 ID" maxlength="200"')}
          ${control("displayName", label("settings_ai_modelDisplayName", "显示名称"), model.displayName, `placeholder="${label("settings_ai_modelDisplayName", "显示名称")}" maxlength="200"`)}
          ${modelIcon("expand", uiText("settings_ai_modelOptions", "展开模型设置"), assets.drawerIcon(), `aria-expanded="false" aria-controls="${details}"`)}
          ${modelIcon("remove", uiText("settings_ai_removeModel", "删除模型"), assets.gameLinkIcon("delete"))}
        </div>
        <div class="ai-model-details" id="${details}" hidden>
          <div class="ai-model-fields">
            <label>${label("settings_ai_contextWindow", "上下文窗口")}${control("contextWindow", label("settings_ai_contextWindow", "上下文窗口"), model.contextWindow, 'inputmode="numeric"')}</label>
            <label>${label("settings_ai_maxOutputTokens", "最大输出 Token")}${control("maxOutputTokens", label("settings_ai_maxOutputTokens", "最大输出 Token"), model.maxOutputTokens, 'inputmode="numeric"')}</label>
            <label>${esc(root.STSettingsFields.label(ai.SERVICE_FIELDS.find(field => field.key === "temperature")))}${control("temperature", label("settings_field_ai_temperature_label", "温度"), model.temperature, 'inputmode="decimal"')}</label>
          </div>
          <fieldset class="ai-model-input-types"><legend>${label("settings_ai_inputTypes", "输入类型")}</legend>
            <label><input type="checkbox" data-ai-input="text" ${inputTypes.includes("text") ? "checked" : ""}> ${textLabel}</label>
            <label><input type="checkbox" data-ai-input="image" ${inputTypes.includes("image") ? "checked" : ""}> ${imageLabel}</label>
          </fieldset>
          <details class="ai-model-reasoning"><summary>${label("settings_ai_reasoningLevels", "推理等级与 API 参数值")}</summary>
            <p data-ai-reasoning-detected></p>
            <label><input type="checkbox" data-ai-reasoning-custom ${model.customReasoning ? "checked" : ""}> ${label("settings_ai_customizeEffort", "自定义推理档位")}</label>
            <div data-ai-reasoning-rows ${model.customReasoning ? "" : "hidden"}></div>
            <div data-ai-reasoning-actions ${model.customReasoning ? "" : "hidden"}>
              <button type="button" class="btn btn-secondary" data-ai-editor-action="add-effort">${label("settings_ai_addEffort", "添加档位")}</button>
              <label><input type="checkbox" data-ai-reasoning-history ${model.customReasoning?.continuation ? "checked" : ""}> ${label("settings_ai_replayReasoning", "随续答回传推理内容")}</label>
            </div>
          </details>
          <div class="ai-model-row-actions">
            <button type="button" class="btn btn-secondary" data-ai-editor-action="up">${label("settings.order.moveUp", "上移")}</button>
            <button type="button" class="btn btn-secondary" data-ai-editor-action="down">${label("settings.order.moveDown", "下移")}</button>
            <button type="button" class="btn btn-secondary" data-ai-editor-action="default">${label("settings_ai_makeDefault", "设为默认模型")}</button>
          </div>
        </div>`;
    }

    function servicesHtml() {
      const registry = ai.serviceSettings(conf);
      const rows = registry.connections.map((service) => {
        const fixed = service.models.some(model => model.id === registry.defaultModelId);
        const models = service.models.filter(model => model.model);
        const details = [service.host && models.length
          ? models.length === 1 ? models[0].displayName || models[0].model : uiText("settings_ai_modelCount", "$count$ 个模型", { count: models.length })
          : uiText("settings.ai.pendingSetup", "待配置"),
          service.provider ? providerLabel(root.STConfig.aiProviders.find(row => row.id === service.provider) || root.STConfig.aiProviders.at(-1)) : "",
          service.enabled ? "" : uiText("settings.ai.disabled", "已停用")].filter(Boolean).join(" · ");
        return `<div class="ai-service-row" data-ai-id="${esc(service.id)}">
          <div class="ai-service-copy"><strong>${esc(service.name)}</strong><small>${esc(details)}</small></div>
          <div class="ai-service-actions">
            ${serviceIcon("test", uiText("common_testConnection", "测试连接"), service, "test")}
            ${fixed ? "" : serviceIcon("toggle", service.enabled ? uiText("common_disable", "停用") : uiText("common_enable", "启用"), service, service.enabled ? "enabled" : "disabled", service.enabled)}
            ${serviceIcon("edit", uiText("store_titleCustomName_edit", "编辑"), service, "edit")}${fixed ? "" : serviceIcon("delete", uiText("common_delete", "删除"), service, "delete")}
          </div>
        </div>`;
      }).join("");
      const enabled = `<span class="switch form-switch${conf.enabled ? " checked" : ""}">
        <input type="checkbox" role="switch" class="switch-input" data-ai-global="enabled" ${conf.enabled ? "checked" : ""}>
        <span class="knob" aria-hidden="true"></span>
      </span>`;
      const concurrency = `<input class="settings-control" type="number" min="1" max="10" data-ai-global="aiConcurrency" value="${conf.aiConcurrency}">`;
      return `<section class="settings-card section-card">
        <header class="section-header ai-service-section">
          <h3 class="title">${esc(uiText("settings_ai_module_section", "模块设置"))}</h3>
        </header>
        <div class="settings-grid">${row(uiText("settings.ai.module", "AI 模块"), enabled)}${row(uiText("settings_field_ai_aiConcurrency_label", "AI 并发上限"), concurrency)}</div>
        <footer class="form-footer">${button("save-global", uiText("common.saveSettings", "保存设置"))}</footer>
      </section>
      <section class="settings-card section-card">
        <header class="section-header ai-service-section">
          <h3 class="title">${esc(uiText("settings_ai_services_section", "服务列表"))}</h3>
          ${button("new", uiText("settings.ai.add", "＋ 添加 AI 服务"), true)}
        </header>
        <div class="ai-service-list">${rows}</div>
      </section>`;
    }

    function content() {
      if (!conf) return `<section class="settings-card">
        <p class="settings-card-note" role="alert">${esc(uiText("settings.ai.loadFailedBody", "AI 服务配置读取失败，原配置已保留。"))}</p>
      </section>`;
      return `${servicesHtml()}

      <div class="ai-permission-wait" data-ai-permission-wait role="status" aria-label="${esc(uiText("settings_ai_permissionWaiting", "等待浏览器授权"))}" hidden>
        <span class="ai-permission-spinner" aria-hidden="true"></span>
      </div>`;
    }

    function html() {
      return `<div class="settings-form ai-settings-card" data-ai-card>${content()}</div>`;
    }

    function searchHtml() {
      const title = uiText("settings_ai_search_section", "搜索服务");
      const providers = root.STConfig.aiSearchProviders.map(provider => {
        const name = provider.id === "bocha" ? uiText("settings_ai_search_bocha", "博查 Web Search") : provider.name;
        return `<option value="${esc(provider.id)}">${esc(name)}</option>`;
      }).join("");
      return `<form class="settings-card section-card ai-entry-card" data-ai-search-form aria-labelledby="st-ai-search-title">
        <h3 class="section-header" id="st-ai-search-title"><span class="title">${esc(title)}</span></h3>
        <fieldset class="settings-grid ai-chat-entry-fields" disabled>
          ${row(uiText("settings.ai.provider", "供应商"), `<select name="provider" class="settings-control">
            <option value="">${esc(uiText("settings_ai_search_unconfigured", "未配置"))}</option>${providers}
          </select>`)}
          ${row(uiText("settings_ai_apiKey", "API 密钥"), `<input name="apiKey" class="settings-control" type="password"
            autocomplete="off" spellcheck="false" maxlength="2048" disabled>`)}
        </fieldset>
        <footer class="form-footer">
          <span data-ai-search-status role="status"></span>
          <button type="submit" class="btn btn-secondary" disabled>${esc(uiText("common.saveSettings", "保存设置"))}</button>
        </footer>
        <div class="ai-permission-wait" data-ai-permission-wait role="status" aria-label="${esc(uiText("settings_ai_permissionWaiting", "等待浏览器授权"))}" hidden>
          <span class="ai-permission-spinner" aria-hidden="true"></span>
        </div>
      </form>`;
    }

    async function loadSearchForm(shadow) {
      const form = shadow.querySelector("[data-ai-search-form]");
      if (!form) return;
      const fields = form.querySelector("fieldset");
      const provider = form.elements.namedItem("provider"), key = form.elements.namedItem("apiKey");
      const status = form.querySelector("[data-ai-search-status]");
      const save = form.querySelector('[type="submit"]');
      const saveFailed = () => uiText("settings_ai_chat_preferences_error", "读取或保存设置失败，请重试。");
      let saved;
      try { saved = await storage.getAiSearchState(); }
      catch (error) {
        log.error("ai-search-settings-read-failed", "读取搜索服务配置失败", { error });
        if (form.isConnected) status.textContent = saveFailed();
        return;
      }
      if (!form.isConnected) return;
      provider.value = saved.provider;
      fields.disabled = false;
      if (saved.invalid) status.textContent = uiText("settings_ai_search_invalid_config", "搜索服务配置无效，请重新配置或保存为未配置。");

      function sync() {
        key.disabled = !provider.value;
        key.placeholder = provider.value && provider.value === saved.provider
          ? uiText("settings_ai_search_key_saved", "已保存 API 密钥") : "";
        save.disabled = fields.disabled || (provider.value
          ? provider.value !== saved.provider && !key.value.trim() : !saved.provider && !saved.invalid);
      }
      sync();
      provider.addEventListener("change", () => {
        key.value = "";
        status.textContent = "";
        sync();
      });
      key.addEventListener("input", () => {
        status.textContent = "";
        sync();
      });
      form.addEventListener("submit", async event => {
        event.preventDefault();
        if (fields.disabled || save.disabled) return;
        const selection = ai.searchProvider(provider.value);
        const apiKey = key.value.trim();
        const reuseKey = Boolean(selection && selection.id === saved.provider && !apiKey);
        if (selection && !reuseKey && !ai.isSearchKey(apiKey)) {
          status.textContent = uiText("settings_ai_search_invalid_key", "请输入有效的 API 密钥。");
          key.focus();
          return;
        }
        const operationId = root.STLoggerFactory.createOperationId();
        status.textContent = "";
        fields.disabled = save.disabled = true;
        try {
          if (selection) await requestAiGatewayPermission({ enabled: true, host: selection.endpoint }, shadow, operationId, undefined, form);
          if (!form.isConnected) return;
          if (reuseKey) {
            const current = await storage.getAiSearchState();
            if (current.provider !== selection.id) {
              saved = current;
              provider.value = saved.provider;
              status.textContent = uiText("settings_ai_search_changed", "搜索服务设置已更新，请检查当前配置。");
              return;
            }
          } else await storage.setAiSearch(selection ? { provider: selection.id, apiKey } : null, { operationId });
          saved = { provider: selection?.id || "", invalid: false };
          key.value = "";
          status.textContent = uiText("common_saved", "已保存");
        } catch (error) {
          if (error.code === "AI_HOST_PERMISSION_CANCELLED") return;
          log.error("ai-search-settings-save-failed", "保存搜索服务失败", { operationId, error });
          status.textContent = error.code?.startsWith("AI_HOST_PERMISSION_") ? error.message : saveFailed();
        } finally {
          fields.disabled = false;
          sync();
        }
      });
    }

    function chatHtml() {
      const catalog = options.catalog || root.STSettings.catalog;
      const title = uiText("settings_ai_entry_section", "对话入口");
      const prompt = catalog.featureById(CHAT_PROMPT);
      const switches = chatEntries.map(id => {
        const item = catalog.featureById(id);
        return `<label class="settings-row form-row">
          <span class="settings-label label">${esc(uiText(item.nameKey, item.name))}<small class="ai-chat-entry-description">${esc(uiText(item.descKey, item.desc))}</small></span>
          <span class="switch form-switch"><input class="switch-input" type="checkbox" role="switch" name="${id}"><span class="knob" aria-hidden="true"></span></span>
        </label>`;
      }).join("");
      const shortcut = catalog.featureById(CHAT_SHORTCUT);
      const shortcutName = uiText(shortcut.nameKey, shortcut.name);
      return `<form class="settings-card section-card ai-entry-card" data-ai-chat-form aria-labelledby="st-ai-chat-entry-title">
        <h3 class="section-header" id="st-ai-chat-entry-title"><span class="title">${esc(title)}</span></h3>
        <fieldset class="settings-grid ai-chat-entry-fields" disabled>
          ${row(uiText(prompt.nameKey, prompt.name), `<select class="settings-control" name="${CHAT_PROMPT}"></select>`)}
          ${switches}
          <div class="settings-row form-row">
            <span class="settings-label label">${esc(shortcutName)}<small class="ai-chat-entry-description">${esc(uiText(shortcut.descKey, shortcut.desc))}</small></span>
            <span class="setting-mode" role="radiogroup" aria-label="${esc(shortcutName)}">
              ${shortcut.options.map(({ value, label }) => `<label class="setting-mode-option"><input type="radio" name="${CHAT_SHORTCUT}" value="${value}"><span>${esc(label)}</span></label>`).join("")}
            </span>
          </div>
        </fieldset>
        <footer class="form-footer">
          <span id="st-ai-chat-entry-status" data-ai-chat-status role="status"></span>
          <button type="submit" class="btn btn-secondary" disabled>${esc(uiText("common.saveSettings", "保存设置"))}</button>
        </footer>
      </form>`;
    }

    async function loadChatForm(shadow) {
      const form = shadow.querySelector("[data-ai-chat-form]");
      if (!form) return;
      const fields = form.querySelector("fieldset");
      const save = form.querySelector('[type="submit"]');
      const status = form.querySelector("[data-ai-chat-status]");
      const select = form.elements.namedItem(CHAT_PROMPT);
      const shortcut = form.elements.namedItem(CHAT_SHORTCUT);
      const syncShortcut = () => {
        for (const input of shortcut) input.parentElement.classList.toggle("selected", input.checked);
      };
      const unavailable = () => uiText("ai_chat_prompt_unavailable", "关联提示词不可用，请在「AI 服务 → 对话入口」重新选择。");
      function showStatus(message = "") {
        const invalid = select.selectedOptions[0]?.disabled === true;
        select.setAttribute("aria-invalid", String(invalid));
        if (invalid) select.setAttribute("aria-describedby", status.id);
        else select.removeAttribute("aria-describedby");
        status.textContent = invalid ? unavailable() : message;
      }
      let saved;
      try {
        const [states, workflow] = await Promise.all([storage.getAll({ strict: true }), storage.getWorkflow()]);
        if (!form.isConnected) return;
        saved = states;
        for (const [id, name] of root.STWorkflowView.promptChoices(workflow.prompts)) {
          select.add(new Option(name, id));
        }
        if (![...select.options].some(option => option.value === states[CHAT_PROMPT])) {
          const option = new Option(uiText("common.unavailable", "暂不可用"), states[CHAT_PROMPT]);
          option.disabled = true;
          select.add(option);
        }
        select.value = states[CHAT_PROMPT];
        showStatus();
        for (const id of chatEntries) {
          const toggle = form.elements.namedItem(id);
          toggle.checked = states[id];
          toggle.closest(".form-switch").classList.toggle("checked", toggle.checked);
        }
        shortcut.value = states[CHAT_SHORTCUT];
        syncShortcut();
        fields.disabled = false;
      } catch (error) {
        log.error("ai-chat-settings-load-failed", "读取对话入口设置失败", { error });
        status.textContent = uiText("settings_ai_chat_preferences_error", "读取或保存设置失败，请重试。");
        return;
      }
      function draft() {
        return Object.fromEntries([
          ...chatEntries.map(id => [id, form.elements.namedItem(id).checked]),
          [CHAT_SHORTCUT, shortcut.value], [CHAT_PROMPT, select.value],
        ]);
      }
      function changes() {
        return Object.fromEntries(Object.entries(draft()).filter(([key, value]) => saved[key] !== value));
      }
      form.addEventListener("change", () => {
        syncShortcut();
        showStatus();
        save.disabled = !Object.keys(changes()).length;
      });
      form.addEventListener("submit", async event => {
        event.preventDefault();
        const values = changes();
        if (fields.disabled || !Object.keys(values).length) return;
        const operationId = root.STLoggerFactory.createOperationId();
        fields.disabled = save.disabled = true;
        try {
          await storage.setChatPreferences(values, { operationId });
          Object.assign(saved, values);
          if (Object.hasOwn(values, CHAT_PROMPT)) {
            for (const option of select.querySelectorAll("option[disabled]")) option.remove();
          }
          for (const input of fields.elements) root.STSettingsFields.acceptEdit(input);
          showStatus();
        } catch (error) {
          log.error("ai-chat-settings-save-failed", "保存对话入口设置失败", { operationId, error });
          if (error.code === "CHAT_PROMPT_UNAVAILABLE") {
            const missing = select.selectedOptions[0];
            select.value = saved[CHAT_PROMPT];
            missing.remove();
            showStatus(unavailable());
          } else status.textContent = uiText("settings_ai_chat_preferences_error", "读取或保存设置失败，请重试。");
          return;
        } finally {
          fields.disabled = false;
          save.disabled = !Object.keys(changes()).length;
        }
        if (!form.isConnected) return;
        await root.STSettingsDialogs.notice(shadow, {
          title: uiText("settings_savePrompt_title", "保存成功"),
          message: uiText("settings.ai.settingsSaved", "AI 设置已保存。"),
          focus: select,
        });
      });
    }

    function render(shadow, focus) {
      const card = shadow.querySelector("[data-ai-card]");
      if (!card) return;
      const enabled = card.querySelector('[data-ai-global="enabled"]').checked;
      const concurrency = card.querySelector('[data-ai-global="aiConcurrency"]').value;
      root.STDomUtils.setTrustedHTML(card, root.STDomUtils.trustedHTML(content(), "settings-ai-services"));
      const toggle = card.querySelector('[data-ai-global="enabled"]');
      toggle.checked = enabled;
      toggle.closest(".form-switch").classList.toggle("checked", enabled);
      card.querySelector('[data-ai-global="aiConcurrency"]').value = concurrency;
      if (focus) card.querySelector(focus)?.focus();
    }

    function draftValues(card) {
      return Object.fromEntries(Array.from(card.querySelectorAll("[data-ai]"))
        .map((control) => [control.dataset.ai, control.value]));
    }

    function tokenLimit(value) {
      const text = value.trim().toUpperCase();
      if (!text) return undefined;
      const match = /^(\d+(?:\.\d+)?)([KM])?$/.exec(text);
      const count = match && Number(match[1]) * ({ K: 1000, M: 1000000 }[match[2]] || 1);
      if (!Number.isSafeInteger(count) || count < 1)
        throw new Error(uiText("settings_ai_tokenLimitInvalid", "请填写正整数，或使用 K、M 单位。"));
      return count;
    }

    const hasDirectoryCapabilities = model => model?.reasoning !== undefined ||
      model?.contextWindow !== undefined || model?.maxOutputTokens !== undefined;

    function readConnection(form, draft) {
      const { headers, ...values } = draftValues(form);
      const name = values.name.trim();
      if (!name) throw new Error(uiText("settings.ai.nameRequired", "请填写服务名称"));
      const entries = headers.split(/\r?\n/).filter(line => line.trim()).map(line => {
        const colon = line.indexOf(":");
        if (colon < 1) throw new Error(uiText("settings_ai_headerInvalid", "每行填写一个请求头，名称和值用冒号分隔。"));
        return { name: line.slice(0, colon).trim(), value: line.slice(colon + 1).trim() };
      });
      const { models, headers: previous, ...connection } = draft;
      return { ...connection, ...values, name, ...(entries.length && { headers: entries }) };
    }

    const effortLevels = ["off", "on", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"];

    function appendEffort(container, level, body) {
      const node = document.createElement("div");
      node.className = "ai-model-effort";
      const captions = {
        level: uiText("settings_ai_effortLevel", "档位"),
        value: uiText("settings_ai_effortValue", "API 参数值"),
      };
      root.STDomUtils.setTrustedHTML(node, root.STDomUtils.trustedHTML(`<label>${esc(captions.level)}
        <select class="settings-control" data-ai-effort-level>${effortLevels.map(choice =>
          `<option value="${choice}">${choice}</option>`).join("")}</select></label>
        <label>${esc(captions.value)}<input class="settings-control" data-ai-effort-value type="text" maxlength="400" placeholder='low' spellcheck="false"></label>
        ${modelIcon("remove-effort", uiText("settings_ai_removeEffort", "删除档位"), root.STSettingsAssets.gameLinkIcon("delete"))}`,
        "settings-ai-services"));
      node.querySelector("select").value = level;
      node.querySelector("input").value = body ? Object.keys(body).length === 1 && body.reasoning_effort
        ? body.reasoning_effort : JSON.stringify(body) : "";
      container.append(node);
      return node;
    }

    function readModel(row, original, connection, catalog, keepDirectory) {
      const fields = Object.fromEntries([...row.querySelectorAll("[data-ai-model-field]")].map(control =>
        [control.dataset.aiModelField, control.value.trim()]));
      const { model, displayName, temperature } = fields;
      if (!model) throw new Error(uiText("settings_ai_modelIdRequired", "请填写模型 ID"));
      const inputTypes = [...row.querySelectorAll("[data-ai-input]:checked")].map(input => input.dataset.aiInput);
      const contextWindow = tokenLimit(fields.contextWindow), maxOutputTokens = tokenLimit(fields.maxOutputTokens);
      const next = { id: row.dataset.aiModelRow, model, displayName, temperature, inputTypes,
        contextWindow, maxOutputTokens, enabled: original?.enabled ?? true, revision: original?.revision || "draft" };
      const match = catalog?.find(item => item.id === model);
      const previous = keepDirectory && original?.model === model ? original.directoryModel : undefined;
      if (match && (match.name || hasDirectoryCapabilities(match) || hasDirectoryCapabilities(previous)))
        next.directoryModel = { ...previous, ...match, endpoint: ai.endpoint(connection),
          reasoning: match.reasoning, contextWindow: match.contextWindow, maxOutputTokens: match.maxOutputTokens };
      else if (previous) next.directoryModel = previous;
      if (row.querySelector("[data-ai-reasoning-custom]").checked) {
        const choices = {};
        for (const item of row.querySelectorAll(".ai-model-effort")) {
          const level = item.querySelector("select").value, value = item.querySelector("input").value.trim();
          if (Object.hasOwn(choices, level)) throw new Error(uiText("settings_ai_effortDuplicate", "推理档位不能重复"));
          try { choices[level] = value.startsWith("{") ? JSON.parse(value) : { reasoning_effort: value }; }
          catch (cause) { throw new TypeError(uiText("settings_ai_effortInvalid", "推理参数需要有效的 JSON。"), { cause }); }
        }
        next.customReasoning = ai.normalizeCustomReasoning({ choices, ...(row.querySelector("[data-ai-reasoning-history]").checked &&
          { continuation: "reasoning_content" }) });
      }
      return next;
    }

    function readConcurrency(input) {
      const concurrency = input.valueAsNumber;
      if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10)
        throw new Error(uiText("settings.ai.limitInvalid", "AI 并发上限须为 1–10 的整数"));
      return concurrency;
    }

    function readGlobal(card) {
      return { enabled: card.querySelector('[data-ai-global="enabled"]').checked,
        aiConcurrency: readConcurrency(card.querySelector('[data-ai-global="aiConcurrency"]')) };
    }

    function checkConnection(service) {
      if (!service.host?.trim() || !service.model?.trim()) throw new Error(uiText("settings.ai.gatewayRequired", "请填写 AI 网关地址和模型"));
      ai.endpoint(service);
    }

    async function persist(next, operationId) {
      const saved = await storage.setAi(next, { operationId });
      setConfig(saved);
      options.onConfigChange?.(saved);
    }

    const catalogNotice = (error, fallback) => {
      const help = ai.modelListIssue(error?.code);
      return help ? uiText(help[1], help[2]) : error?.message || fallback;
    };

    async function testConnection(item, authorize, operationId, signal, aiConcurrency) {
      checkConnection(item);
      const test = { ...item, enabled: true, aiConcurrency };
      await authorize(test, operationId, signal);
      signal?.throwIfAborted();
      const runChat = async () => {
        const response = await sendAiTest(test, operationId, signal);
        if (response?.success !== true) throw Object.assign(new Error(response?.error || uiText("settings.ai.testFailed", "AI 连接测试失败")),
          { code: response?.code });
      };
      const [chat, models] = await Promise.allSettled([
        runChat(),
        ai.detectModels(test, () => undefined, { operationId, signal, details: true }),
      ]);
      signal?.throwIfAborted();
      if (chat.status === "fulfilled") log.info("ai-test-success", "AI 连接测试成功", { operationId });
      if (models.status === "rejected" && !ai.modelListIssue(models.reason?.code))
        log.warn("ai-models-test-failed", "测试连接时刷新模型失败", { operationId, error: models.reason });
      return { chat, models };
    }

    function showTestResult(shadow, { chat, models }) {
      const passed = chat.status === "fulfilled";
      const title = passed ? uiText("settings.ai.testOk", "连接测试成功") : uiText("settings.ai.testFailed", "AI 连接测试失败");
      const message = passed ? uiText("settings.ai.testOkBody", "AI 服务连接正常。") : chat.reason.message;
      const detail = models.status === "fulfilled" ? uiText("settings.ai.modelsDetected", "找到 $count$ 个模型", { count: models.value.length })
        : catalogNotice(models.reason, uiText("settings.ai.modelsFailed", "模型检测失败"));
      void root.STSettingsDialogs.notice(shadow, { title, message: message + "\n" + detail });
    }

    async function chooseModels(ask, loadModels, existing, signal) {
      const life = new AbortController();
      const requestSignal = AbortSignal.any([life.signal, signal]);
      const closure = new Set();
      let available = [], canRefresh = false, list, search, selectAll, confirm, status, body;
      function syncConfirm() {
        confirm.disabled = !closure.size && !canRefresh;
        confirm.textContent = canRefresh && !closure.size
          ? uiText("settings_ai_refreshModelInfo", "更新模型信息") : uiText("settings_ai_addSelectedModels", "添加所选模型");
      }

      function update() {
        const terms = search.value.trim().toLowerCase();
        const shown = available.filter(model => [model.id, model.name].some(value => value?.toLowerCase().includes(terms)));
        const selectable = shown.filter(model => !existing.has(model.id));
        selectAll.disabled = !selectable.length;
        selectAll.textContent = selectable.length && selectable.every(model => closure.has(model.id))
          ? uiText("settings_ai_unselectModels", "取消全选") : uiText("settings_ai_selectModels", "全选");
        syncConfirm();
        const rows = shown.map(model => {
          const row = document.createElement("label");
          const check = document.createElement("input");
          check.type = "checkbox";
          check.value = model.id;
          check.disabled = existing.has(model.id);
          check.checked = check.disabled || closure.has(model.id);
          row.append(check, model.name ? `${model.name} · ${model.id}` : model.id);
          return row;
        });
        list.replaceChildren(...rows);
        return selectable;
      }
      const selection = ask({
        title: uiText("settings_ai_chooseModels", "选择模型"),
        form: true,
        signal: requestSignal,
        className: "ai-model-picker",
        initial: () => search,
        render(node) {
          body = node;
          root.STDomUtils.setTrustedHTML(node, root.STDomUtils.trustedHTML(`<div class="ai-model-picker-search">
            <input class="settings-control" type="search" aria-label="${esc(uiText("settings_ai_searchModels", "搜索模型"))}" placeholder="${esc(uiText("settings_ai_searchModels", "搜索模型"))}">
            <button type="button" class="btn btn-secondary" data-ai-select-models disabled></button></div>
            <p role="status"></p><div class="ai-model-picker-list"></div>`, "settings-ai-services"));
          search = node.querySelector("input");
          status = node.querySelector("[role='status']");
          list = node.querySelector(".ai-model-picker-list");
          selectAll = node.querySelector("[data-ai-select-models]");
          selectAll.textContent = uiText("settings_ai_selectModels", "全选");
          status.textContent = uiText("settings_ai_modelsLoading", "正在获取可用模型…");
          search.addEventListener("input", update, { signal: life.signal });
          selectAll.addEventListener("click", () => {
            const shown = update();
            const all = shown.every(model => closure.has(model.id));
            for (const model of shown) {
              if (all) closure.delete(model.id);
              else closure.add(model.id);
            }
            update();
            selectAll.focus();
          }, { signal: life.signal });
          list.addEventListener("change", event => {
            const check = event.target;
            if (check.checked) closure.add(check.value);
            else closure.delete(check.value);
            syncConfirm();
            const visible = [...list.querySelectorAll("input:not(:disabled)")];
            selectAll.textContent = visible.every(input => input.checked)
              ? uiText("settings_ai_unselectModels", "取消全选") : uiText("settings_ai_selectModels", "全选");
          }, { signal: life.signal });
        },
        renderFooter(footer) {
          confirm = footer.querySelector("[data-dialog-action='apply']");
          confirm.disabled = true;
        },
        actions: [
          { id: "cancel", label: uiText("common_cancel", "取消") },
          { id: "apply", label: uiText("settings_ai_addSelectedModels", "添加所选模型"), primary: true },
        ],
      });
      if (body) void loadModels(requestSignal).then(models => {
        if (!body.isConnected || requestSignal.aborted) return;
        available = [...new Map(models.map(model => [model.id, model])).values()];
        canRefresh = available.some(model => existing.has(model.id) &&
          (hasDirectoryCapabilities(model) || hasDirectoryCapabilities(existing.get(model.id))));
        status.textContent = available.length ? "" : uiText("settings.ai.modelsEmpty", "接口未返回模型，可手动输入。");
        update();
      }, error => {
        if (!body.isConnected || requestSignal.aborted) return;
        status.textContent = error.code === "AI_HOST_PERMISSION_CANCELLED"
          ? uiText("onboarding_authorizationCanceled", "已取消授权。")
          : catalogNotice(error, uiText("settings.ai.modelsFailed", "模型检测失败"));
      });
      try {
        const action = await selection;
        return action === "apply" ? { models: available, selected: available.filter(model => closure.has(model.id)) } : null;
      } finally { life.abort(); }
    }

    /** 保存与页面导航由宿主负责，编辑器统一维护连接、目录和模型草稿 */
    function createEditor(registry, savedConnection, { ask, notice, authorize, onChange, wizard = false, defaultName }) {
      const providers = root.STConfig.aiProviders;
      const draft = savedConnection || {
        id: ai.newServiceId(), name: "", enabled: true, protocol: ai.DEFAULTS.protocol,
        host: "", key: "", keyMode: ai.DEFAULTS.keyMode, keyName: "", models: [],
      };
      const prefill = !savedConnection || (!draft.provider && !draft.host && !draft.key && !draft.models.some(model => model.model));
      let provider = providers.find(preset => preset.id === (prefill ? "deepseek" : draft.provider)) || providers.at(-1);
      const requiresTest = !draft.host || !draft.models.some(model => model.model);
      const preset = prefill ? ai.presetConnection(provider) : null;
      const values = { ...draft, ...preset, name: defaultName ?? (draft.name || providerLabel(provider)) };
      let form, list, initial, initialConnection, catalog, catalogRequest, dragging;
      let activeModel, defaultModelId = registry.defaultModelId;
      let autoName = !savedConnection, seedName = defaultName !== undefined;
      const life = new AbortController();
      const reasoningTargets = new WeakMap();
      const control = name => form.querySelector(`[data-ai="${name}"]`);
      const rows = () => [...list.children];
      const original = row => draft.models.find(model => model.id === row.dataset.aiModelRow);
      const field = (row, name) => row.querySelector(`[data-ai-model-field="${name}"]`);
      const actionButton = (row, action) => row.querySelector(`[data-ai-editor-action="${action}"]`);
      const reasoningKey = row => JSON.stringify([control("host").value.trim(), field(row, "model").value.trim()]);
      const origin = host => URL.canParse(host) ? new URL(host).origin : "";
      let hostOrigin = origin(values.host);
      const connectionKey = () => {
        const v = draftValues(form);
        return JSON.stringify([v.provider, v.host.trim(), v.keyMode, v.keyName.trim(), v.key, v.headers.trim()]);
      };
      const directoryFor = row => {
        const model = field(row, "model").value.trim();
        const cached = catalog?.find(item => item.id === model);
        const previous = original(row);
        return cached ?? (initialConnection === connectionKey() && previous?.model === model ? previous.directoryModel : undefined);
      };
      const tokenNumbers = new Intl.NumberFormat(root.STI18n.intlLocale());
      const selectedRow = () => [wizard ? null : activeModel, rows().find(row => row.dataset.aiModelRow === defaultModelId), list.firstElementChild]
        .find(row => row?.parentNode === list);
      const concurrencyField = () => form.querySelector("[data-ai-concurrency]");
      const aiConcurrency = () => wizard ? readConcurrency(concurrencyField()) : registry.aiConcurrency;
      const testKey = (row = selectedRow()) => row && JSON.stringify([connectionKey(), row.dataset.aiModelRow,
        field(row, "model").value.trim(), field(row, "temperature").value.trim(), field(row, "maxOutputTokens").value.trim(),
        concurrencyField()?.value]);
      const snapshot = () => JSON.stringify([draftValues(form), defaultModelId, rows().map(row => {
        const directory = directoryFor(row);
        return [row.dataset.aiModelRow, directory?.reasoning, directory?.contextWindow, directory?.maxOutputTokens,
          ...[...row.querySelectorAll("input,select")].map(input => input.type === "checkbox" ? input.checked : input.value)];
      })]);
      function syncRows() {
        const ordered = rows();
        form.querySelector("[data-ai-model-empty]").hidden = ordered.length > 0;
        ordered.forEach((row, index) => {
          actionButton(row, "up").disabled = index === 0;
          actionButton(row, "down").disabled = index === ordered.length - 1;
          const isDefault = row.dataset.aiModelRow === defaultModelId;
          const button = actionButton(row, "default");
          button.disabled = isDefault || !draft.enabled || original(row)?.enabled === false;
          button.textContent = isDefault ? uiText("settings_ai_currentDefault", "当前默认模型") : uiText("settings_ai_makeDefault", "设为默认模型");
          row.toggleAttribute("data-ai-model-default", isDefault);
        });
        onChange?.();
      }
      function refreshModelDetails(row) {
        const model = field(row, "model").value.trim();
        const directoryModel = directoryFor(row);
        const host = control("host").value;
        const url = URL.canParse(host) ? new URL(host) : null;
        const canDescribe = url && !url.username && !url.password && ai.hostPermissionPattern(host);
        const deepSeek = canDescribe && ai.reasoningGateway({ host }) === "deepseek";
        for (const name of ["contextWindow", "maxOutputTokens"]) {
          const input = field(row, name);
          const value = directoryModel?.[name];
          const hint = value === undefined ? "" :
            uiText("settings_ai_directoryTokenLimit", "$count$ · API", { count: tokenNumbers.format(value) });
          input.placeholder = input.title = hint;
        }
        const temperature = field(row, "temperature");
        temperature.placeholder = deepSeek ? uiText("settings_ai_deepseekDefaultTemperature", "默认 1.0")
          : uiText("settings_ai_defaultTemperature", "供应商默认");
        temperature.title = deepSeek
          ? uiText("settings_ai_deepseekTemperatureHint", "留空使用默认温度 1.0。温度在思考模式下不生效。") : temperature.placeholder;
        const choices = canDescribe ? ai.describeReasoning({ host, model, directoryModel }).choices : [];
        row.querySelector("[data-ai-reasoning-detected]").textContent = choices.length
          ? uiText("settings_ai_detectedEffort", "识别到的档位 $levels$", { levels: choices.join(" · ") }) : "";
      }
      function refreshOpenModels() {
        for (const row of rows())
          if (!row.querySelector(".ai-model-details").hidden) refreshModelDetails(row);
      }
      function appendModel(model) {
        const row = document.createElement("div");
        row.className = "ai-model-row";
        row.dataset.aiModelRow = model.id;
        root.STDomUtils.setTrustedHTML(row, root.STDomUtils.trustedHTML(modelRowHtml(model), "settings-ai-services"));
        const efforts = row.querySelector("[data-ai-reasoning-rows]");
        for (const [level, body] of Object.entries(model.customReasoning?.choices || {})) appendEffort(efforts, level, body);
        if (model.customReasoning) reasoningTargets.set(row, reasoningKey(row));
        list.append(row);
        return row;
      }
      function move(row, target, before, focus = true) {
        if (!target || row === target) return;
        target[before ? "before" : "after"](row);
        syncRows();
        if (focus) actionButton(row, "drag").focus();
        form.querySelector("[data-ai-model-status]").textContent = uiText("settings_ai_modelPosition", "$name$ 已移到第 $position$ 项", {
          name: field(row, "model").value, position: rows().indexOf(row) + 1,
        });
      }
      function toggleDetails(row) {
        const button = actionButton(row, "expand"), details = row.querySelector(".ai-model-details");
        if (details.hidden) refreshModelDetails(row);
        details.hidden = !details.hidden;
        button.setAttribute("aria-expanded", String(!details.hidden));
      }
      function addNew(model = {}) {
        const row = appendModel({ id: ai.newServiceId(), model: "", temperature: provider.temperature, ...model });
        syncRows();
        if (!model.model) field(row, "model").focus();
        return row;
      }
      async function remove(row) {
        if (row.dataset.aiModelRow === defaultModelId) {
          void notice({ message: uiText("settings_ai_selectOtherDefault", "请先选择其他默认模型，再删除这一项。") });
          return;
        }
        if (original(row)) {
          const answer = await ask({
            title: uiText("settings_ai_removeModel", "删除模型"),
            signal: life.signal,
            message: uiText("settings_ai_removeModelWarning", "保存后将移除「$name$」。正在使用该模型的功能需重新选择。", { name: field(row, "model").value }),
            actions: [{ id: "cancel", label: uiText("common_cancel", "取消") },
              { id: "remove", label: uiText("common_delete", "删除"), danger: true }],
          });
          if (answer !== "remove" || !row.isConnected) return;
        }
        row.remove();
        syncRows();
        (selectedRow() ? actionButton(selectedRow(), "expand") : actionButton(form, "add")).focus();
      }
      async function fetchModels() {
        if (catalogRequest) return;
        const key = connectionKey();
        const operationId = root.STLoggerFactory.createOperationId();
        const existing = new Map(rows().map(row => [field(row, "model").value.trim(), directoryFor(row)]));
        const controller = new AbortController();
        catalogRequest = controller;
        try {
          const result = await chooseModels(ask, async signal => {
            try {
              const connection = readConnection(form, draft);
              return await ai.detectModels(connection, item => authorize(item, operationId, signal),
                { operationId, signal, details: true });
            } catch (error) {
              if (!signal.aborted && !ai.modelListIssue(error.code) && error.code !== "AI_HOST_PERMISSION_CANCELLED")
                log.error("ai-models-action-failed", "读取模型目录失败", { operationId, error });
              throw error;
            }
          }, existing, AbortSignal.any([controller.signal, life.signal]));
          if (!result || !form.isConnected || controller.signal.aborted || connectionKey() !== key) return;
          if (result.models.length) catalog = result.models;
          for (const model of result.selected) addNew({ model: model.id, displayName: model.name });
          refreshOpenModels();
          onChange?.();
        } finally { catalogRequest = null; }
      }
      function changeProvider() {
        provider = providers.find(preset => preset.id === control("provider").value);
        control("key").value = "";
        control("headers").value = "";
        if (provider.id !== "custom") {
          const next = ai.presetConnection(provider);
          for (const name of ["host", "keyMode", "keyName"]) control(name).value = next[name];
          if (autoName || !control("name").value.trim()) {
            control("name").value = providerLabel(provider);
            autoName = true;
          }
        }
        hostOrigin = origin(control("host").value);
        handleChange({ target: control("keyMode") });
      }
      function mount(node) {
        form = node;
        node.classList.add("ai-service-editor");
        node.dataset.aiModal = "";
        root.STDomUtils.setTrustedHTML(node, root.STDomUtils.trustedHTML(
          editorHtml(values, providers, provider, wizard ? registry.aiConcurrency : undefined), "settings-ai-services"));
        control("key").value = draft.key;
        control("headers").value = (draft.headers || []).map(({ name, value }) => `${name}: ${value}`).join("\n");
        list = node.querySelector("[data-ai-model-list]");
        draft.models.forEach((model, index) => appendModel(prefill && index === 0
          ? { ...model, model: preset.model || "", temperature: provider.temperature } : model));
        initialConnection = connectionKey();
        initial = snapshot();
        syncRows();
        node.addEventListener("focusin", event => {
          const row = event.target.closest("[data-ai-model-row]");
          if (row) activeModel = row;
          onChange?.();
        }, { signal: life.signal });
        node.addEventListener("input", event => {
          const name = event.target.dataset.ai;
          if (name === "name") autoName = seedName = false;
          if (name === "host") {
            const next = origin(event.target.value);
            if (hostOrigin !== next) {
              control("key").value = "";
              control("headers").value = "";
            }
            hostOrigin = next;
          }
          if (["host", "key", "keyName", "headers"].includes(name)) catalog = undefined;
          const row = event.target.closest("[data-ai-model-row]");
          if (row && event.target.closest(".ai-model-reasoning")) reasoningTargets.set(row, reasoningKey(row));
          onChange?.();
        }, { signal: life.signal });
        node.addEventListener("change", event => {
          const name = event.target.dataset.ai;
          if (name === "provider") changeProvider();
          if (name === "provider" || name === "keyMode") catalog = undefined;
          const row = event.target.closest("[data-ai-model-row]");
          if (row && event.target.closest(".ai-model-reasoning")) reasoningTargets.set(row, reasoningKey(row));
          if (event.target.matches("[data-ai-reasoning-custom]")) {
            const efforts = row.querySelector("[data-ai-reasoning-rows]");
            const checked = event.target.checked;
            efforts.hidden = row.querySelector("[data-ai-reasoning-actions]").hidden = !checked;
            if (checked && !efforts.children.length) appendEffort(efforts, "low");
          }
          if (event.target === control("keyMode")) handleChange(event);
          if (row && event.target.dataset.aiModelField === "model") refreshModelDetails(row);
          if (["provider", "host", "key", "keyMode", "keyName", "headers"].includes(name)) refreshOpenModels();
          onChange?.();
        }, { signal: life.signal });
        node.addEventListener("click", event => {
          const button = event.target.closest("[data-ai-editor-action]");
          if (!button) return;
          const row = button.closest("[data-ai-model-row]");
          const action = button.dataset.aiEditorAction;
          if (action === "add") addNew();
          if (action === "fetch") void fetchModels().catch(error => {
            log.error("ai-model-picker-failed", "选择模型失败", { error });
            void notice({ message: error.message });
          });
          if (action === "expand") toggleDetails(row);
          if (action === "up") move(row, row.previousElementSibling, true);
          if (action === "down") move(row, row.nextElementSibling, false);
          if (action === "default") { defaultModelId = row.dataset.aiModelRow; syncRows(); }
          if (action === "remove") void remove(row).catch(error => {
            log.error("ai-model-remove-failed", "删除模型失败", { error });
            void notice({ message: error.message });
          });
          if (action === "add-effort") {
            reasoningTargets.set(row, reasoningKey(row));
            const items = row.querySelector("[data-ai-reasoning-rows]");
            const used = [...items.querySelectorAll("select")].map(select => select.value);
            const level = effortLevels.find(choice => !used.includes(choice));
            if (level) appendEffort(items, level).querySelector("select").focus();
            onChange?.();
          }
          if (action === "remove-effort") {
            reasoningTargets.set(row, reasoningKey(row));
            button.closest(".ai-model-effort").remove();
            onChange?.();
          }
        }, { signal: life.signal });
        list.addEventListener("keydown", event => {
          const handle = event.target.closest('[data-ai-editor-action="drag"]');
          if (!handle || !event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
          event.preventDefault();
          const row = handle.closest("[data-ai-model-row]");
          const up = event.key === "ArrowUp";
          move(row, up ? row.previousElementSibling : row.nextElementSibling, up);
        }, { signal: life.signal });
        list.addEventListener("dragstart", event => {
          if (!event.target.matches('[data-ai-editor-action="drag"]:enabled')) { event.preventDefault(); return; }
          dragging = event.target.closest("[data-ai-model-row]");
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", dragging.dataset.aiModelRow);
          dragging.classList.add("dragging");
        }, { signal: life.signal });
        list.addEventListener("dragover", event => {
          if (!dragging || !event.target.closest("[data-ai-model-row]")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }, { signal: life.signal });
        list.addEventListener("drop", event => {
          const target = event.target.closest("[data-ai-model-row]");
          if (!dragging || !target) return;
          event.preventDefault();
          const rect = target.getBoundingClientRect();
          move(dragging, target, event.clientY < rect.top + rect.height / 2, false);
        }, { signal: life.signal });
        list.addEventListener("dragend", () => {
          dragging?.classList.remove("dragging");
          dragging = null;
        }, { signal: life.signal });
      }

      function read(row, connection) {
        if (row.querySelector("[data-ai-reasoning-custom]").checked && reasoningTargets.get(row) !== reasoningKey(row)) {
          const section = row.querySelector(".ai-model-reasoning");
          if (section.parentElement.hidden) toggleDetails(row);
          section.open = true;
          throw Object.assign(new Error(uiText("settings.ai.reasoningMapStale",
            "网关或模型已更换，请更新自定义推理参数，或清空后自动识别。")),
          { code: "CHAT_REASONING_INVALID", focus: section.querySelector("[data-ai-effort-value]") });
        }
        return readModel(row, original(row), connection, catalog, initialConnection === connectionKey());
      }

      async function test(operationId, signal = life.signal) {
        const row = selectedRow();
        if (!row) throw new Error(uiText("settings_ai_modelIdRequired", "请填写模型 ID"));
        const key = testKey(row);
        const connection = readConnection(form, draft);
        const item = { ...connection, ...read(row, connection) };
        if (wizard && item.keyMode !== "none" && !item.key)
          throw new Error(uiText("onboarding_enterAnAccessKey", "请填写访问密钥。"));
        const result = await testConnection(item, authorize, operationId, signal, aiConcurrency());
        if (!form.isConnected || row !== selectedRow() || key !== testKey()) return null;
        if (result.models.status === "fulfilled") {
          catalog = result.models.value;
          refreshOpenModels();
        }
        return { ...result, key };
      }

      function candidate(enabled = registry.enabled) {
        const flags = { enabled, aiConcurrency: aiConcurrency() };
        if (wizard && !enabled) return { value: { ...registry, ...flags } };
        const connection = readConnection(form, draft);
        const models = rows().filter(row => row.dataset.aiModelRow !== ai.DEFAULT_SERVICE_ID ||
          defaultModelId === ai.DEFAULT_SERVICE_ID || field(row, "model").value.trim());
        const item = { ...connection, models: models.map(row => read(row, connection)) };
        if (!item.models.length) throw new Error(uiText("settings_ai_modelIdRequired", "请填写模型 ID"));
        checkConnection({ ...item, ...item.models[0] });
        const connections = savedConnection
          ? registry.connections.map(row => row.id === item.id ? item : row) : [...registry.connections, item];
        const value = { ...registry, ...flags, defaultModelId, connections: structuredClone(connections) };
        if (defaultModelId !== ai.DEFAULT_SERVICE_ID) {
          const previous = value.connections.find(row => row.models.some(model => model.id === ai.DEFAULT_SERVICE_ID));
          if (previous) previous.models = previous.models.flatMap(model => model.id !== ai.DEFAULT_SERVICE_ID
            ? [model] : model.model ? [{ ...model, id: ai.newServiceId() }] : []);
        }
        return { value: ai.serviceSettings(value), connection: item };
      }

      return {
        mount, test, testKey, candidate, control, syncRows, requiresTest,
        isDirty: () => snapshot() !== initial,
        usesDefaultName: () => seedName,
        revealGateway() {
          if (!control("host").value.trim()) form.querySelector(".ai-connection-settings").open = true;
        },
        cancelCatalog() { catalogRequest?.abort(); },
        dispose() { life.abort(); },
      };
    }

    async function openEditor(savedConnection, shadow) {
      const life = new AbortController();
      const authorize = (item, operationId, signal) => requestAiGatewayPermission(item, shadow, operationId, signal);
      let saveButton, testButton, verified, savedId;
      const editor = createEditor(ai.serviceSettings(conf), savedConnection, {
        ask: opts => dialog(shadow, opts),
        notice: opts => root.STSettingsDialogs.notice(shadow, opts),
        authorize,
        onChange: syncActions,
      });
      function syncActions() {
        if (!saveButton) return;
        const key = editor.testKey();
        const ready = Boolean(key) && (!editor.requiresTest || verified === key);
        saveButton.disabled = !ready;
        saveButton.classList.toggle("primary", ready);
        testButton.disabled = !key;
        testButton.classList.toggle("primary", !ready);
      }
      const action = await dialog(shadow, {
        title: savedConnection ? uiText("settings.ai.editService", "编辑 AI 服务") : uiText("settings.ai.newService", "新建 AI 服务"),
        form: true,
        className: "ai-service-dialog",
        isDirty: editor.isDirty,
        initial: () => editor.control("name"),
        render: editor.mount,
        actions: [
          { id: "cancel", label: uiText("common_cancel", "取消") },
          { id: "test", label: uiText("common_testConnection", "测试连接") },
          { id: "save", label: uiText("settings.ai.saveService", "保存服务") },
        ],
        renderFooter(footer) {
          testButton = footer.querySelector('[data-dialog-action="test"]');
          saveButton = footer.querySelector('[data-dialog-action="save"]');
          syncActions();
        },
        onActionSettled: editor.syncRows,
        async onAction(id) {
          if (id === "cancel") return true;
          const operationId = root.STLoggerFactory.createOperationId();
          try {
            if (id === "test") {
              const result = await editor.test(operationId, life.signal);
              if (!result) return false;
              verified = result.chat.status === "fulfilled" ? result.key : undefined;
              if (!verified) log.error("ai-test-failed", "AI 连接测试失败", { operationId, error: result.chat.reason });
              showTestResult(shadow, result);
              return false;
            }
            if (editor.requiresTest && verified !== editor.testKey()) return false;
            const { value, connection } = editor.candidate();
            if (connection.enabled) await authorize(connection, operationId, life.signal);
            life.signal.throwIfAborted();
            await persist(value, operationId);
            savedId = connection.id;
            return true;
          } catch (error) {
            if (error.code !== "AI_HOST_PERMISSION_CANCELLED" && error.name !== "AbortError") {
              editor.revealGateway();
              void root.STSettingsDialogs.notice(shadow, { title: uiText("common_operationFailed", "操作失败"), message: error.message,
                focus: error.focus });
              log.error("ai-service-action-failed", "AI 服务操作失败", { operationId, error });
            }
            return false;
          }
        },
      }).finally(() => { life.abort(); editor.dispose(); });
      if (action === "save") {
        render(shadow, `[data-ai-id="${CSS.escape(savedId)}"] [data-ai-action="edit"]`);
        void root.STSettingsDialogs.notice(shadow, { title: uiText("settings_savePrompt_title", "保存成功"), message: uiText("settings.ai.savedService", "AI 服务已保存。") });
      }
    }

    async function editService(action, service, registry, card, shadow, operationId) {
      if (action === "save-global") {
        await persist({ ...registry, ...readGlobal(card) }, operationId);
        return '[data-ai-action="save-global"]';
      }
      const primary = service.models.find(model => model.id === registry.defaultModelId) || service.models[0];
      const item = { ...service, ...primary };
      const fixed = service.models.some(model => model.id === registry.defaultModelId);
      if (action === "test") {
        const result = await testConnection(item, (connection, id) => requestAiGatewayPermission(connection, shadow, id),
          operationId, undefined, registry.aiConcurrency);
        if (result.chat.status === "rejected") log.error("ai-test-failed", "AI 连接测试失败", { operationId, error: result.chat.reason });
        showTestResult(shadow, result);
        return "";
      }
      if (action === "delete") {
        if (fixed) throw new Error(uiText("settings.ai.defaultDelete", "默认 AI 服务不可删除"));
        const choice = await dialog(shadow, {
          title: uiText("settings.ai.deleteService", "删除 AI 服务"),
          className: "wf-danger-dialog",
          message: uiText("settings.ai.deleteConfirm", "将删除「$name$」的连接和密钥。使用此服务的功能需要重新选择 AI 服务。", { name: service.name }),
          actions: [{ id: "cancel", label: uiText("common_cancel", "取消") }, { id: "delete", label: uiText("common_delete", "删除"), primary: true }],
        });
        if (choice !== "delete") return "";
        await persist({ ...registry, connections: registry.connections.filter((row) => row.id !== service.id) }, operationId);
        return '[data-ai-action="new"]';
      }
      if (action !== "toggle") throw new Error("未知的 AI 服务操作");
      if (fixed) throw new Error(uiText("settings.ai.defaultDisable", "默认 AI 服务不可停用"));
      const enabled = !service.enabled;
      if (enabled) {
        checkConnection(item);
        await requestAiGatewayPermission({ ...item, enabled }, shadow, operationId);
      }
      await persist({ ...registry, connections: registry.connections.map((row) => row.id === service.id ? { ...row, enabled } : row) }, operationId);
      return `[data-ai-id="${CSS.escape(service.id)}"] [data-ai-action="toggle"]`;
    }

    function handleClick(event, shadow) {
      const control = event.target.closest("[data-ai-action]");
      if (!control || !conf) return false;
      const card = control.closest("[data-ai-card]");
      if (busy || control.disabled) return true;
      const action = control.dataset.aiAction;
      const registry = ai.serviceSettings(conf);
      const service = registry.connections.find(item => item.id === control.closest("[data-ai-id]")?.dataset.aiId);
      if (action === "new" || action === "edit") {
        void openEditor(service, shadow).catch((error) => {
          log.error("ai-service-editor-failed", "打开 AI 服务编辑器失败", { error });
          void root.STSettingsDialogs.notice(shadow, { message: error.message });
        });
        return true;
      }
      busy = true;
      const operationId = root.STLoggerFactory.createOperationId();
      const inputs = [...card.querySelectorAll("input, select, button")].filter((input) => !input.disabled);
      inputs.forEach((input) => { input.disabled = true; });
      card.setAttribute("aria-busy", "true");
      void editService(action, service, registry, card, shadow, operationId).then((focus) => {
        if (focus) render(shadow, focus);
        if (focus && (action === "save-global" || action === "delete")) void root.STSettingsDialogs.notice(shadow, {
          title: action === "delete" ? uiText("settings.ai.deleted", "删除成功") : uiText("settings_savePrompt_title", "保存成功"),
          message: action === "delete" ? uiText("settings.ai.serviceDeleted", "AI 服务已删除。") : uiText("settings.ai.settingsSaved", "AI 设置已保存。"),
        });
      }).catch((error) => {
        if (error.code === "AI_HOST_PERMISSION_CANCELLED") return;
        void root.STSettingsDialogs.notice(shadow, { title: uiText("common_operationFailed", "操作失败"), message: error.message });
        log.error("ai-service-action-failed", "AI 服务操作失败", { operationId, error });
      }).finally(() => {
        busy = false;
        card.removeAttribute("aria-busy");
        inputs.forEach((input) => { if (input.isConnected) input.disabled = false; });
      });
      return true;
    }

    function handleChange(event) {
      const mode = event.target.closest('[data-ai="keyMode"]');
      if (!mode) return false;
      const editor = mode.closest("[data-ai-editor]");
      editor.querySelector('[data-ai-field="key"]').hidden = mode.value === "none";
      editor.querySelector('[data-ai-field="keyName"]').hidden = !["header", "param"].includes(mode.value);
      return true;
    }

    return Object.freeze({ handleChange, handleClick, html, searchHtml, chatHtml, loadSearchForm, loadChatForm, setConfig,
      createEditor, catalogNotice });
  }

  const api = Object.freeze({
    create,
  });
  root.STSettingsAIPanel = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
