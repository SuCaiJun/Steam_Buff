/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 网页云同步提示与独立设置页的冲突确认
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
  if (typeof root.STLoggerFactory?.createLogger !== "function") {
    throw new Error("设置云同步弹窗缺少日志依赖，请先加载 shared/logger-factory.js");
  }
  const log = root.STLoggerFactory.createLogger("settings", "settings-cloud-prompt");
  let prompting = false;

  function tr(key, fallback, params) {
    return root.STI18n?.text?.(key, fallback, params) ?? fallback;
  }

  function settingsUiReady() {
    return root.STSettingsCloudUi?.ready === true;
  }

  function request(payload) {
    return new Promise((resolve, reject) => {
      root.chrome.runtime.sendMessage({ type: SYNC_TYPE, reason: "resolve", ...payload }, result => {
        const error = root.chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else if (!result || typeof result.success !== "boolean") reject(new Error("云同步没有返回有效结果"));
        else resolve(result);
      });
    });
  }

  function openSettings() {
    return request({ action: "open-private-settings", operationId: root.STLoggerFactory.createOperationId() });
  }

  function themeCss() {
    const variables = root.STTheme?.cssVariables;
    if (!variables || typeof variables !== "object") {
      return "";
    }
    const body = Object.entries({ ...variables, ...root.STTheme.flatDialogVariables })
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
        btn.addEventListener("click", event => { if (event.isTrusted) close(action.id); });
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

  /** 网页只提示冲突，用户在独立设置页确认保留哪一份备份 */
  async function present(payload, dialog, active = () => true) {
    if (!active()) return null;
    if (payload.kind === "upgrade") {
      await dialog({
        title: tr("settings.cloud.upgradeTitle", "需要升级扩展"),
        message: tr("settings.cloud.upgradeMessage", "远端备份来自更高版本的 Steam Buff，请升级后再同步。"),
        actions: [{ id: "ok", label: tr("common.confirm", "确定"), primary: true }],
      });
      return null;
    }
    if (payload.kind !== "conflict") return null;
    if (root.location?.protocol !== "chrome-extension:") {
      const choice = await dialog({
        title: tr("settings.cloud.conflictTitle", "设置云同步冲突"),
        message: tr("settings.cloud.conflictNotice", "本机与远端备份的设置不同。"),
        actions: [
          { id: "later", label: tr("settings.cloud.later", "稍后") },
          { id: "open", label: tr("settings.cloud.openSettings", "打开云同步设置"), primary: true },
        ],
      });
      if (!active() || choice !== "open") return null;
      const result = await openSettings();
      return result.success ? null : result;
    }
    if (!payload.ticket || !payload.channelId) return null;
    const choice = await dialog({
      title: tr("settings.cloud.conflictTitle", "设置云同步冲突"),
      message: tr("settings.cloud.conflictMessage", "本机与远端的设置或成就译文有冲突。请选择冲突部分要保留的版本，其他译文会合并。"),
      actions: [
        { id: "cloud", label: tr("settings.cloud.useCloud", "使用远端") },
        { id: "local", label: tr("settings.cloud.useLocal", "使用本机") },
        { id: "later", label: tr("settings.cloud.later", "稍后"), primary: true },
      ],
    });
    if (!active() || (choice !== "cloud" && choice !== "local")) return null;
    const answer = await dialog({
      title: choice === "cloud" ? tr("settings.cloud.useCloud", "使用远端") : tr("settings.cloud.useLocal", "使用本机"),
      message: choice === "cloud"
        ? tr("settings.cloud.restoreConfirm", "冲突的设置或译文将使用远端版本。请确认要继续。")
        : tr("settings.cloud.overwriteConfirmMessage", "冲突的设置或译文将使用这台设备的版本。请确认要继续。"),
      actions: [
        { id: "cancel", label: tr("common.cancel", "取消") },
        { id: "ok", label: tr("common.confirm", "确定"), primary: true, danger: true },
      ],
    });
    if (!active() || answer !== "ok") return null;
    return request({ action: choice === "cloud" ? "use-cloud" : "use-local", channelId: payload.channelId, ticket: payload.ticket });
  }

  function failureText({ code, status }) {
    if (status === 429) return tr("settings.cloud.rateLimited", "备份请求过于频繁，请稍后重试。");
    if (code === "webdav-http") {
      if (status === 401) return tr("settings.cloud.invalidDavCredentials", "WebDAV 用户名或密码不正确。");
      if (status === 403 || status === 404 || status === 409) {
        return tr("settings.cloud.invalidDavFolder", "请检查 WebDAV 文件夹地址和读写权限。");
      }
      return tr("settings.cloud.davHttpFailed", "WebDAV 请求失败（HTTP $status$）。", { status });
    }
    if (code === "official-http" && status === 503)
      return tr("settings.cloud.officialUnavailable", "官方云备份或独立归档暂不可用。");
    if (code === "official-http" && status === 422)
      return tr("settings.cloud.objectsMissing", "官方云备份缺少加密分片，请从独立归档恢复。");
    if (code === "no-entitlement" || status === 403) return tr("settings.cloud.needPermission", "当前权益不包含设置云同步。");
    if (code === "login-required" || status === 401) return tr("settings.cloud.needLogin", "请先登录 Steam Buff 账号。");
    if (code === "cloud-open") return tr("onboarding.openSettingsFailed", "设置中心打开失败，请稍后重试。");
    if (code === "cloud-sender") return tr("settings.cloud.privateSettingsRequired", "请在扩展设置中心操作云同步。");
    if (["owner-changed", "channel-changed", "stale-prompt", "remote-changed", "local-changed"].includes(code))
      return tr("settings.cloud.conflictChanged", "同步期间设置发生变化，请重新打开设置处理。");
    if (["webdav-permission", "webdav-permission-denied"].includes(code))
      return tr("settings.cloud.davPermission", "未获得 WebDAV 站点访问权限。");
    if (code === "webdav-url") return tr("settings.cloud.invalidDavUrl", "请输入不含登录信息和查询参数的 HTTPS 文件夹地址。");
    if (code === "webdav-credentials") return tr("settings.cloud.invalidDavCredentials", "请输入有效的 WebDAV 用户名和密码。");
    if (code === "webdav-config") return tr("settings.cloud.webdavMissing", "请先测试并保存 WebDAV 连接。");
    if (code === "webdav-etag" || code === "webdav-conditions")
      return tr("settings.cloud.davIncompatible", "WebDAV 不支持强 ETag 或条件写入，无法安全同步。");
    if (code === "webdav-cleanup")
      return tr("settings.cloud.davCleanupFailed", "连接测试失败，远端可能留有 steam-buff-webdav-test 临时文件。");
    if (code === "too-large") return tr("settings.cloud.tooLarge", "设置备份体积过大，请精简设置后重试。");
    if (code === "bundle-invalid" || code === "reply-invalid")
      return tr("settings.cloud.invalidBundle", "远端备份或服务器响应格式无效。");
    if (code === "vault-device") return tr("settings.cloud.deviceRequired", "此浏览器尚未获得授权。请在「设备管理」中配对。");
    if (code === "vault-authorized") return tr("settings.cloud.deviceAlreadyAuthorized", "此浏览器已获得授权。");
    if (code === "vault-pair") return tr("settings.cloud.pairInvalid", "配对请求无效、已过期或属于其他账号。请重新生成请求。");
    if (code === "recovery-changed") return tr("settings.cloud.recoveryChanged", "待保存的恢复文件已变化，请重新打开「设备管理」。");
    if (code === "vault-missing") return tr("settings.cloud.backupMissing", "所选位置没有可用的加密备份。");
    if (code === "vault-upgrade") return tr("settings.cloud.upgradePending", "云端设置来自更高版本扩展，请先升级 Steam Buff。");
    if (code === "vault-file") return tr("settings.cloud.fileInvalid", "请选择有效且未超出大小限制的备份或恢复文件。");
    if (code === "vault-file-mismatch") return tr("settings.cloud.fileMismatch", "这个恢复文件无法打开所选备份，请使用对应版本的恢复文件。");
    if (code === "vault-invalid") return tr("settings.cloud.vaultInvalid", "加密备份、签名或恢复文件验证失败。");
    if (code === "vault-rollback") return tr("settings.cloud.vaultRollback", "远端备份早于本机已验证的版本，已暂停同步。");
    if (code === "restore-settings-partial")
      return tr("settings.cloud.restoreSettingsPartial", "已恢复部分本机设置。成就译文等待恢复，请检查后重试。");
    if (code === "restore-settings-interrupted")
      return tr("settings.cloud.restoreSettingsInterrupted", "设置恢复中断，部分设置可能已写入。请检查后重试。");
    if (code === "restore-achievements-interrupted")
      return tr("settings.cloud.restoreAchievementsInterrupted", "本机设置已恢复。成就译文恢复中断，请检查后重试。");
    if (code === "achievement-owner") return tr("settings.cloud.achievementOwner", "本机成就译文已关联其他 Steam Buff 账号。请为不同账号使用各自的浏览器配置。");
    if (code === "delete-partial")
      return tr("settings.cloud.deletePartial", "远端备份已删除，但关闭本机同步失败。请手动关闭。");
    return tr("settings.cloud.syncFailed", "同步失败，请稍后重试。");
  }

  function resultText(result) {
    if (result?.success === false) return failureText(result);
    if (result?.prompt) return tr("settings.cloud.conflictChanged", "同步期间设置发生变化，请重新打开设置处理。");
    if (result?.action === "remote-deleted") {
      return tr("settings.cloud.remoteDeleted", "远端备份已不存在。关闭后重新开启云同步，可以创建新的备份。");
    }
    return "";
  }

  async function handle(payload) {
    if (settingsUiReady() || prompting) return;
    prompting = true;
    try {
      const result = await present(payload, showDialog);
      const message = resultText(result);
      if (message) await showDialog({ title: tr("settings.cloud.title", "设置云同步"), message,
        actions: [{ id: "ok", label: tr("common.confirm", "确定"), primary: true }] });
    } finally {
      prompting = false;
    }
  }

  function onPrompt(payload) {
    void handle(payload).catch(error => {
      log.warn("settings-cloud-prompt-failed", "设置云同步弹窗失败", { error });
    });
  }

  if (root.STMessageBus?.ready && root.STMessageBus.listen) {
    root.STMessageBus.listen(PROMPT_TYPE, onPrompt, { owner: "settings:cloud-prompt", key: "prompt" });
  } else {
    root.chrome.runtime.onMessage.addListener(payload => { if (payload?.type === PROMPT_TYPE) onPrompt(payload); });
  }

  root.STSettingsCloudPrompt = Object.freeze({ ready: true, openSettings, present, resultText });
})(globalThis);
