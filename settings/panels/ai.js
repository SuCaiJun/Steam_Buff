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
    const storage = options.storage || root.STSettings.storage;
    const ai = root.STAI;
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

    function sendAiTest(testConf, operationId = "") {
      if (globalThis.STMessageBus?.ready && globalThis.STMessageBus?.send) {
        return globalThis.STMessageBus.send({
          type: "AI_CHAT_COMPLETIONS",
          action: "test-connection",
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

    function beginPermissionWait(shadow) {
      const card = shadow.querySelector("[data-ai-modal]") || shadow.querySelector("[data-ai-card]");
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

    async function requestAiGatewayPermission(ai, shadow, operationId = "") {
      if (ai?.enabled !== true || !ai?.host) {
        return true;
      }
      const host = ai.host;
      const check = await sendPermissionMessage({
        type: AI_GATEWAY_PERMISSION_CHECK,
        operationId,
        host,
      }, 5_000);
      if (check?.success !== true) throw permissionError(check);
      if (check.granted === true) return true;
      if (root.STClientEnvironment.isSteamClientPage() !== true) {
        const response = await sendPermissionMessage({
          type: AI_GATEWAY_PERMISSION_REQUEST,
          operationId,
          host,
        }, 0);
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
      if (action !== "continue") {
        const error = new Error("");
        error.code = "AI_HOST_PERMISSION_CANCELLED";
        throw error;
      }

      let attempt = 0;
      while (true) {
        attempt += 1;
        const requestId = root.STLoggerFactory.createRequestId();
        const waiter = permissionResultWaiter(requestId);
        const releaseWait = beginPermissionWait(shadow);
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
          return true;
        } catch (error) {
          waiter.cancel();
          if (opened && error?.code === "AI_HOST_PERMISSION_TIMEOUT") {
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

    function presetConnection(preset) {
      return {
        host: ai.endpoint({ host: preset.base }),
        model: preset.models[0],
        keyMode: preset.keyMode || "bearer",
        keyName: preset.keyName || "",
      };
    }

    function modelControl(form, models, value, serviceId) {
      const fields = root.STSettingsFields;
      const label = uiText("settings.field.ai.model.label", "模型");
      const slot = form.querySelector("[data-ai-model-control]");
      const html = fields.searchComboHtml(models.map(id => ({ value: id, label: id })), {
        id: serviceId + "-model",
        label,
        text: value,
        value,
        placeholder: uiText("settings.ai.modelPlaceholder", "选择或输入模型"),
        expandLabel: uiText("settings.controls.expand", "展开$label$", { label }),
        emptyLabel: uiText("settings.controls.empty", "暂无可选项"),
        modal: true,
      });
      root.STDomUtils.setTrustedHTML(slot, root.STDomUtils.trustedHTML(html, "settings-ai-services"));
      const input = slot.querySelector("[data-st-combo-input]");
      input.classList.add("settings-control");
      input.dataset.ai = "model";
      return input;
    }

    function editorHtml(draft, providers, provider) {
      const { keyMode } = draft;
      const name = `<input class="settings-control" type="text" data-ai="name" value="${esc(draft.name)}" maxlength="200" autocomplete="off">`;
      const providerLabelText = uiText("settings.ai.provider", "供应商");
      const chooser = fieldInput({ field: {
        key: "provider", label: providerLabelText, type: "select",
        options: providers.map(preset => ({ value: preset.id, label: providerLabel(preset) })),
      }, value: provider.id, dataset: "data-ai" });
      const fields = (options.catalog?.aiFields?.() || ai.SERVICE_FIELDS).filter((field) =>
        field.key !== "enabled" && field.key !== "aiConcurrency").map((field) => {
        if (field.key === "model") return row(root.STSettingsFields.label(field), '<span data-ai-model-control></span>');
        const hide = field.key === "key" && keyMode === "none" ||
          field.key === "keyName" && !["header", "param"].includes(keyMode);
        return row(root.STSettingsFields.label(field), fieldInput({
          field, value: draft[field.key], dataset: "data-ai", className: "settings-control",
        }), `data-ai-field="${field.key}" ${hide ? "hidden" : ""}`);
      }).join("");
      return `<div class="settings-grid" data-ai-editor>${row(providerLabelText, chooser)}${row(uiText("settings.ai.serviceName", "服务名称"), name)}${fields}</div>

        <div class="ai-permission-wait" data-ai-permission-wait role="status" aria-label="${esc(uiText("settings_ai_permissionWaiting", "等待浏览器授权"))}" hidden>
          <span class="ai-permission-spinner" aria-hidden="true"></span>
        </div>`;
    }

    function servicesHtml() {
      const rows = conf.services.map((service) => {
        const fixed = service.id === ai.DEFAULT_SERVICE_ID;
        const details = [service.host && service.model ? service.model : uiText("settings.ai.pendingSetup", "待配置"),
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
      const enabled = `<input type="checkbox" class="settings-check" data-ai-global="enabled" ${conf.enabled ? "checked" : ""}>`;
      const concurrency = `<input class="settings-control" type="number" min="1" max="10" data-ai-global="aiConcurrency" value="${conf.aiConcurrency}">`;
      return `<div class="settings-grid">${row(uiText("settings.ai.module", "AI 模块"), enabled)}${row(uiText("settings_field_ai_aiConcurrency_label", "AI 并发上限"), concurrency)}</div>
      <div class="settings-actions form-footer">${button("save-global", uiText("common.saveSettings", "保存设置"))}${button("new", uiText("settings.ai.add", "＋ 添加 AI 服务"), true)}</div>
      <div class="ai-service-list">${rows}</div>`;
    }

    function content() {
      if (!conf) return `<summary class="section-header settings-fold-title"><span class="dot"></span><span class="title">${esc(uiText("onboarding_aiServices", "AI 服务"))}</span>
        <span class="hint">${esc(uiText("settings.ai.loadFailed", "读取失败"))}</span></summary>
        <p class="settings-card-note" role="alert">${esc(uiText("settings.ai.loadFailedBody", "AI 服务配置读取失败，原配置已保留。"))}</p>`;
      return `<summary class="section-header settings-fold-title"><span class="dot"></span><span class="title">${esc(uiText("onboarding_aiServices", "AI 服务"))}</span>
        <span class="hint">${conf.enabled ? uiText("common_enabled", "已启用") : uiText("onboarding_off", "已关闭")} · ${esc(uiText("settings.ai.serviceCount", "$count$ 个服务", { count: conf.services.length }))}</span></summary>
      ${servicesHtml()}

      <div class="ai-permission-wait" data-ai-permission-wait role="status" aria-label="${esc(uiText("settings_ai_permissionWaiting", "等待浏览器授权"))}" hidden>
        <span class="ai-permission-spinner" aria-hidden="true"></span>
      </div>`;
    }

    function html() {
      return `<div class="settings-form"><details class="settings-card section-card ai-settings-card" data-ai-card>${content()}</details></div>`;
    }

    function render(shadow, focus) {
      const card = shadow.querySelector("[data-ai-card]");
      if (!card) return;
      const enabled = card.querySelector('[data-ai-global="enabled"]').checked;
      const concurrency = card.querySelector('[data-ai-global="aiConcurrency"]').value;
      root.STDomUtils.setTrustedHTML(card, root.STDomUtils.trustedHTML(content(), "settings-ai-services"));
      card.querySelector('[data-ai-global="enabled"]').checked = enabled;
      card.querySelector('[data-ai-global="aiConcurrency"]').value = concurrency;
      if (focus) card.querySelector(focus)?.focus();
    }

    function draftValues(card) {
      return Object.fromEntries(Array.from(card.querySelectorAll("[data-ai]"))
        .map((control) => [control.dataset.ai, control.value]));
    }

    function readDraft(card, draft) {
      const values = draftValues(card);
      const next = { ...draft, ...values, name: values.name.trim() };
      if (!next.name) throw new Error(uiText("settings.ai.nameRequired", "请填写服务名称"));
      return next;
    }

    function readGlobal(card) {
      const concurrency = card.querySelector('[data-ai-global="aiConcurrency"]').valueAsNumber;
      if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10)
        throw new Error(uiText("settings.ai.limitInvalid", "AI 并发上限须为 1–10 的整数"));
      return { enabled: card.querySelector('[data-ai-global="enabled"]').checked, aiConcurrency: concurrency };
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

    async function testConnection(item, shadow, operationId) {
      checkConnection(item);
      const test = { ...item, enabled: true, aiConcurrency: conf.aiConcurrency };
      await requestAiGatewayPermission(test, shadow, operationId);
      const response = await sendAiTest(test, operationId);
      if (response?.success !== true) throw new Error(response?.error || uiText("settings.ai.testFailed", "AI 连接测试失败"));
      log.info("ai-test-success", "AI 连接测试成功", { operationId });
    }

    async function openEditor(service, shadow) {
      const draft = service ? { ...service } : {
        ...ai.defaults(), id: ai.newServiceId(), revision: "draft", name: "", enabled: true,
      };
      const providers = root.STConfig.aiProviders;
      const prefill = !service || (draft.id === ai.DEFAULT_SERVICE_ID &&
        !draft.provider && !draft.host && !draft.model && !draft.key);
      let provider = prefill
        ? providers.find(row => row.id === "deepseek")
        : providers.find(row => row.id === draft.provider) || providers.at(-1);
      if (prefill) {
        Object.assign(draft, presetConnection(provider), { provider: provider.id });
        if (!draft.name) draft.name = providerLabel(provider);
      }
      let form, initial, modelsButton;
      let autoName = !service;
      let autoTemperature = false;
      let detected = false;
      const life = new AbortController();
      const control = name => form.querySelector(`[data-ai="${name}"]`);
      const origin = value => URL.canParse(value) ? new URL(value).origin : "";
      let hostOrigin = origin(draft.host);
      const modelsLabel = uiText("settings.ai.detectModels", "检测模型");
      const clearDetected = () => {
        if (!detected) return;
        detected = false;
        modelControl(form, provider.models, control("model").value, draft.id);
      };
      const action = await dialog(shadow, {
        title: service ? uiText("settings.ai.editService", "编辑 AI 服务") : uiText("settings.ai.newService", "新建 AI 服务"),
        form: true,
        className: "ai-service-dialog",
        isDirty: () => JSON.stringify(draftValues(form)) !== initial,
        initial: (node) => node.querySelector('[data-ai="name"]'),
        render: (node) => {
          form = node;
          node.classList.add("ai-service-editor");
          node.setAttribute("data-ai-modal", "");
          root.STDomUtils.setTrustedHTML(node, root.STDomUtils.trustedHTML(editorHtml(draft, providers, provider), "settings-ai-services"));
          modelControl(form, provider.models, draft.model, draft.id);
          initial = JSON.stringify(draftValues(node));
          root.STSettingsFields.bindSearchCombos(node, life.signal);
          node.addEventListener("input", event => {
            const field = event.target.dataset.ai;
            if (field === "name") autoName = false;
            if (field === "temperature") autoTemperature = false;
            if (field === "host") {
              const nextOrigin = origin(event.target.value);
              if (hostOrigin && hostOrigin !== nextOrigin) control("key").value = "";
              hostOrigin = nextOrigin;
            }
            if (["host", "key", "keyName"].includes(field)) clearDetected();
            if (field === "model") root.STSettingsFields.handleSearchCombo(event, node);
          });
          node.addEventListener("change", event => {
            const field = event.target.dataset.ai;
            if (field === "keyMode") clearDetected();
            if (field !== "provider") return;
            provider = providers.find(row => row.id === event.target.value);
            detected = false;
            control("key").value = "";
            if (autoTemperature || provider.temperature !== undefined) control("temperature").value = provider.temperature ?? "";
            autoTemperature = provider.temperature !== undefined;
            if (provider.id === "custom") {
              modelControl(form, [], control("model").value, draft.id);
              return;
            }
            const { host, model, keyMode, keyName } = presetConnection(provider);
            control("host").value = host;
            hostOrigin = origin(host);
            control("keyMode").value = keyMode;
            control("keyName").value = keyName;
            handleChange({ target: control("keyMode") });
            modelControl(form, provider.models, model, draft.id);
            if (autoName || !control("name").value.trim()) {
              control("name").value = providerLabel(provider);
              autoName = true;
            }
          });
        },
        actions: [
          { id: "cancel", label: uiText("common_cancel", "取消") },
          { id: "models", label: modelsLabel },
          { id: "test", label: uiText("common_testConnection", "测试连接") },
          { id: "save", label: uiText("settings.ai.saveService", "保存服务"), primary: true },
        ],
        renderFooter: (footer) => { modelsButton = footer.querySelector('[data-dialog-action="models"]'); },
        onAction: async (id) => {
          if (id === "cancel") return true;
          const operationId = root.STLoggerFactory.createOperationId();
          if (id === "models") {
            modelsButton.setAttribute("aria-busy", "true");
            modelsButton.textContent = uiText("settings.ai.detectingModels", "正在检测模型…");
            try {
              const { host, key, keyMode, keyName, provider } = draftValues(form);
              const connection = { host, key, keyMode, keyName, provider };
              ai.modelListRequest(connection);
              await requestAiGatewayPermission({ host, enabled: true }, shadow, operationId);
              if (!form.isConnected) return false;
              const response = await root.STMessageBus.send({
                type: "AI_CHAT_COMPLETIONS", action: "list-models", ai: connection, operationId, timeoutMs: 15_000,
              }, { timeoutMs: 20_000, signal: life.signal });
              if (!form.isConnected) return false;
              if (response?.success !== true) throw Object.assign(new Error(response?.error), { code: response?.code });
              detected = true;
              const input = modelControl(form, response.models, control("model").value, draft.id);
              void root.STSettingsDialogs.notice(shadow, {
                title: modelsLabel,
                message: response.models.length
                  ? uiText("settings.ai.modelsDetected", "找到 $count$ 个模型", { count: response.models.length })
                  : uiText("settings.ai.modelsEmpty", "接口未返回模型，可手动输入。"),
                focus: input,
              });
            } catch (error) {
              if (!form.isConnected || error.name === "AbortError" || error.code === "AI_HOST_PERMISSION_CANCELLED") return false;
              const help = {
                AI_MODELS_UNAVAILABLE: [uiText("settings.ai.modelsUnavailable", "此网关无法检测模型，请选择预设或手动输入。"), "model"],
                AI_MODEL_WORKSPACE_REQUIRED: [uiText("settings.ai.modelWorkspaceRequired", "请填写百炼业务空间的 API 地址后检测。"), "host"],
                AI_MODEL_HOST_REQUIRED: [uiText("settings.ai.modelHostRequired", "请填写 AI 网关地址。"), "host"],
                AI_MODEL_HOST_INVALID: [uiText("settings.ai.modelHostInvalid", "请输入有效的 HTTP 或 HTTPS 网关地址。"), "host"],
                AI_MODEL_KEY_REQUIRED: [uiText("settings.ai.modelKeyRequired", "请填写访问密钥。"), "key"],
                AI_MODEL_KEY_MODE_REQUIRED: [uiText("settings.ai.modelKeyModeRequired", "千问模型检测需要使用 Authorization Bearer。"), "keyMode"],
              }[error.code];
              const failure = uiText("settings.ai.modelsFailed", "模型检测失败");
              void root.STSettingsDialogs.notice(shadow, {
                title: failure,
                message: help?.[0] || error.message || failure,
                focus: help ? control(help[1]) : modelsButton,
              });
              if (!help) log.error("ai-models-action-failed", failure, { operationId, error });
            } finally {
              modelsButton.removeAttribute("aria-busy");
              modelsButton.textContent = modelsLabel;
            }
            return false;
          }
          try {
            const item = readDraft(form, draft);
            if (id === "test") {
              await testConnection(item, shadow, operationId);
              void root.STSettingsDialogs.notice(shadow, { title: uiText("settings.ai.testOk", "连接测试成功"), message: uiText("settings.ai.testOkBody", "AI 服务连接正常。") });
              return false;
            }
            checkConnection(item);
            if (item.enabled) await requestAiGatewayPermission(item, shadow, operationId);
            const services = service
              ? conf.services.map((row) => row.id === item.id ? item : row)
              : [...conf.services, item];
            await persist({ ...conf, services }, operationId);
            return true;
          } catch (error) {
            if (error.code !== "AI_HOST_PERMISSION_CANCELLED") {
              void root.STSettingsDialogs.notice(shadow, { title: uiText("common_operationFailed", "操作失败"), message: error.message,
                focus: ["name", "host", "model"].map(field => form.querySelector(`[data-ai="${field}"]`)).find(input => !input.value.trim()),
              });
              log.error("ai-service-action-failed", "AI 服务操作失败", { operationId, error });
            }
            return false;
          }
        },
      }).finally(() => life.abort());
      if (action === "save") {
        render(shadow, `[data-ai-id="${CSS.escape(draft.id)}"] [data-ai-action="edit"]`);
        void root.STSettingsDialogs.notice(shadow, { title: uiText("settings_savePrompt_title", "保存成功"), message: uiText("settings.ai.savedService", "AI 服务已保存。") });
      }
    }

    async function editService(action, service, card, shadow, operationId) {
      if (action === "save-global") {
        await persist({ ...conf, ...readGlobal(card) }, operationId);
        return '[data-ai-action="save-global"]';
      }
      if (action === "test") {
        await testConnection(service, shadow, operationId);
        void root.STSettingsDialogs.notice(shadow, { title: uiText("settings.ai.testOk", "连接测试成功"), message: uiText("settings.ai.testOkBody", "AI 服务连接正常。") });
        return "";
      }
      if (action === "delete") {
        if (service.id === ai.DEFAULT_SERVICE_ID) throw new Error(uiText("settings.ai.defaultDelete", "默认 AI 服务不可删除"));
        const choice = await dialog(shadow, {
          title: uiText("settings.ai.deleteService", "删除 AI 服务"),
          className: "wf-danger-dialog",
          message: uiText("settings.ai.deleteConfirm", "将删除「$name$」的连接和密钥。使用此服务的功能需要重新选择 AI 服务。", { name: service.name }),
          actions: [{ id: "cancel", label: uiText("common_cancel", "取消") }, { id: "delete", label: uiText("common_delete", "删除"), primary: true }],
        });
        if (choice !== "delete") return "";
        await persist({ ...conf, services: conf.services.filter((row) => row.id !== service.id) }, operationId);
        return '[data-ai-action="new"]';
      }
      if (action !== "toggle") throw new Error("未知的 AI 服务操作");
      if (service.id === ai.DEFAULT_SERVICE_ID) throw new Error(uiText("settings.ai.defaultDisable", "默认 AI 服务不可停用"));
      const item = { ...service, enabled: !service.enabled };
      if (item.enabled) {
        checkConnection(item);
        await requestAiGatewayPermission(item, shadow, operationId);
      }
      await persist({ ...conf, services: conf.services.map((row) => row.id === item.id ? item : row) }, operationId);
      return `[data-ai-id="${CSS.escape(item.id)}"] [data-ai-action="toggle"]`;
    }

    function handleClick(event, shadow) {
      const control = event.target.closest("[data-ai-action]");
      if (!control || !conf) return false;
      const card = control.closest("[data-ai-card]");
      if (busy || control.disabled) return true;
      const action = control.dataset.aiAction;
      const service = ai.findService(conf, control.closest("[data-ai-id]")?.dataset.aiId || "");
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
      void editService(action, service, card, shadow, operationId).then((focus) => {
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

    return Object.freeze({ handleChange, handleClick, html, setConfig });
  }

  const api = Object.freeze({
    create,
  });
  root.STSettingsAIPanel = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
