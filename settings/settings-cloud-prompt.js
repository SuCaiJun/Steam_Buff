/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店和社区页的设置云同步冲突弹窗
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

((root) => {
  "use strict";

  if (root.STSettingsCloudPrompt?.ready) {
    return;
  }

  const PROMPT_TYPE = "SETTINGS_CLOUD_PROMPT";
  const SYNC_TYPE = "SETTINGS_CLOUD_SYNC";
  const HOST_ID = "__SteamBuffSettingsCloudPrompt";
  const log = root.STLoggerFactory?.createLogger?.("settings", "settings-cloud-prompt") || {
    info() {},
    warn() {},
    error() {},
  };
  let prompting = false;

  function tr(key, fallback, params) {
    return root.STI18n?.text?.(key, fallback, params) ?? fallback;
  }

  function settingsUiReady() {
    return root.STSettingsCloudUi?.ready === true;
  }

  function request(payload) {
    const message = { type: SYNC_TYPE, ...payload };
    if (root.STMessageBus?.request) {
      return root.STMessageBus.request(message, { expectSuccess: false });
    }
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (res) => {
          resolve(chrome.runtime.lastError ? { success: false } : (res || {}));
        });
      } catch {
        resolve({ success: false });
      }
    });
  }

  function themeCss() {
    const variables = root.STTheme?.cssVariables;
    if (!variables || typeof variables !== "object") {
      return "";
    }
    const body = Object.entries(variables)
      .map(([name, value]) => `${name}: ${String(value)};`)
      .join("");
    return `:host{${body}}`;
  }

  function styleText() {
    const components = root.STComponents?.css;
    const shared = components?.compose?.(
      components.dialog({
        variant: "content",
        layerSelectors: ".layer",
        openLayerSelectors: ".layer.show",
        surfaceSelectors: ".dialog",
        openSurfaceSelectors: ".layer.show .dialog",
        headerSelectors: ".head",
        titleSelectors: ".title",
        closeSelectors: ".close",
        bodySelectors: ".message",
      }),
      components.button(".action", { variant: "secondary", minWidth: "108px" }),
      components.button(".action.primary", { variant: "primary", minWidth: "108px" }),
    ) || "";
    return `${themeCss()}
      :host {
        all: initial;
        color-scheme: dark;
        font-family: var(--st-font-family-base, "Motiva Sans", "Microsoft YaHei", Arial, sans-serif);
      }
      ${shared}
      .layer {
        align-items: center;
        padding: 24px;
      }
      .message {
        margin: 0;
        color: var(--st-color-text-secondary);
        font-size: 13px;
        line-height: 1.6;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 16px;
      }
    `;
  }

  function removeHost() {
    document.getElementById(HOST_ID)?.remove();
  }

  function showDialog(options) {
    removeHost();
    const host = document.createElement("div");
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = styleText();
    const layer = document.createElement("div");
    layer.className = "layer show";
    const box = document.createElement("div");
    box.className = "dialog";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "st-cloud-prompt-title");
    box.setAttribute("aria-describedby", "st-cloud-prompt-message");
    const title = document.createElement("div");
    title.id = "st-cloud-prompt-title";
    title.className = "title";
    title.textContent = String(options.title || "");
    const message = document.createElement("p");
    message.id = "st-cloud-prompt-message";
    message.className = "message";
    message.textContent = String(options.message || "");
    const actions = document.createElement("div");
    actions.className = "actions";
    shadow.append(style, layer);
    layer.appendChild(box);
    box.append(title, message, actions);
    document.documentElement.appendChild(host);
    return new Promise((resolve) => {
      let done = false;
      let life = null;
      const close = (value) => {
        if (done) {
          return;
        }
        done = true;
        life?.close?.();
        removeHost();
        resolve(value);
      };
      for (const action of options.actions || []) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `action${action.primary ? " primary" : ""}`;
        btn.textContent = String(action.label || "");
        btn.addEventListener("click", () => close(action.id));
        actions.appendChild(btn);
      }
      life = root.STDialogLifecycle?.open?.({
        root: host,
        trap: box,
        restore: document.activeElement,
        initial: () => actions.querySelector("button:not(:disabled)") || actions.querySelector("button"),
        onEscape: () => close("cancel"),
      });
      life?.focusInitial?.();
    });
  }

  async function handle(payload) {
    if (settingsUiReady() || prompting) {
      return;
    }
    prompting = true;
    try {
      const kind = String(payload?.kind || "");
      if (kind === "upgrade") {
        await showDialog({
          title: tr("settings.cloud.upgradeTitle", "需要升级扩展"),
          message: tr("settings.cloud.upgradeMessage", "云端设置来自更高版本的 Steam Buff。升级后再同步，避免丢掉新字段。"),
          actions: [{ id: "ok", label: tr("common.confirm", "确定"), primary: true }],
        });
        return;
      }
      if (kind === "decrypt") {
        await showDialog({
          title: tr("settings.cloud.decryptPending", "密钥错误"),
          message: tr("settings.cloud.secretWrongMessage", "同步密钥无法解密云端设置。可以填写正确密钥后再同步，核对成功后才会替换本机密钥。要更换云端密文的加密密钥，请先重置清除云端设置，再重新开启并填写新密钥。"),
          actions: [{ id: "ok", label: tr("common.confirm", "确定"), primary: true }],
        });
        await request({ reason: "resolve", action: "defer" });
        return;
      }
      if (kind === "conflict") {
        const action = await showDialog({
          title: tr("settings.cloud.conflictTitle", "设置云同步冲突"),
          message: tr("settings.cloud.conflictMessage", "这台设备和云端都改过设置。使用云端会覆盖本机面板设置；使用本机则会覆盖云端。不会自动备份。"),
          actions: [
            { id: "cloud", label: tr("settings.cloud.useCloud", "使用云端") },
            { id: "local", label: tr("settings.cloud.useLocal", "使用本机") },
            { id: "later", label: tr("settings.cloud.later", "稍后"), primary: true },
          ],
        });
        if (action === "cloud") {
          const confirm = await showDialog({
            title: tr("settings.cloud.useCloud", "使用云端"),
            message: tr("settings.cloud.conflictMessage", "这台设备和云端都改过设置。使用云端会覆盖本机面板设置；使用本机则会覆盖云端。不会自动备份。"),
            actions: [
              { id: "cancel", label: tr("common.cancel", "取消") },
              { id: "ok", label: tr("common.confirm", "确定"), primary: true },
            ],
          });
          if (confirm === "ok") {
            await request({ reason: "resolve", action: "use-cloud" });
          }
          return;
        }
        if (action === "local") {
          const confirm = await showDialog({
            title: tr("settings.cloud.useLocal", "使用本机"),
            message: tr("settings.cloud.overwriteConfirmMessage", "云端现有设置会被这台设备用当前密钥加密后覆盖，且不会保留历史版本。"),
            actions: [
              { id: "cancel", label: tr("common.cancel", "取消") },
              { id: "ok", label: tr("common.confirm", "确定"), primary: true },
            ],
          });
          if (confirm === "ok") {
            await request({ reason: "resolve", action: "use-local" });
          }
          return;
        }
        await request({ reason: "resolve", action: "defer" });
      }
    } finally {
      prompting = false;
    }
  }

  if (root.STMessageBus?.listen) {
    root.STMessageBus.listen(PROMPT_TYPE, (request) => {
      handle(request).catch((error) => {
        log.warn("settings-cloud-prompt-failed", "设置云同步弹窗失败", { error });
      });
    }, { owner: "settings:cloud-prompt", key: "prompt" });
  } else if (root.chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((request) => {
      if (request?.type !== PROMPT_TYPE) {
        return;
      }
      handle(request).catch((error) => {
        log.warn("settings-cloud-prompt-failed", "设置云同步弹窗失败", { error });
      });
    });
  }

  root.STSettingsCloudPrompt = Object.freeze({
    ready: true,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
