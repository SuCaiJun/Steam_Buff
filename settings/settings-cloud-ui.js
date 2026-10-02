/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置云同步扩展设置卡片与设置页弹窗
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

((root) => {
  "use strict";

  const settings = root.STSettings = root.STSettings || {};
  if (settings.cloudUi?.ready) {
    return;
  }

  const TYPE = "SETTINGS_CLOUD_SYNC";
  const PROMPT_TYPE = "SETTINGS_CLOUD_PROMPT";
  const AUTH_KEY = "steam_buff_auth";
  const log = root.STLoggerFactory?.createLogger?.("settings", "settings-cloud") || {
    info() {},
    warn() {},
    error() {},
  };
  let bound = false;
  let prompting = false;
  let lastSecret = "";
  let cachedState = null;
  let panelShadow = null;

  function tr(key, fallback, params) {
    return root.STI18n.text(key, fallback, params);
  }

  function esc(text) {
    return root.STSettingsHtml?.esc?.(text) || String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escAttr(value) {
    return root.STSettingsHtml?.escAttr?.(value) || esc(value);
  }

  function cloud() {
    return settings.cloud || root.STSettingsCloud;
  }

  function membership() {
    return settings.membership || root.STSettingsMembership;
  }

  function dialogs() {
    return root.STSettingsDialogs;
  }

  function loggedIn(auth) {
    if (typeof root.STAuthSession?.cleanAuth === "function") {
      return !!root.STAuthSession.cleanAuth(auth);
    }
    return !!(auth && (auth.access_token || auth.refresh_token));
  }

  function typedSecret(shadow) {
    return String(shadow?.querySelector?.("[data-cloud-secret]")?.value || "").trim();
  }

  // 关闭设置页仍用已保存密钥。本机还没有密钥时才收下输入框的第一串
  async function rememberSecret(shadow) {
    const api = cloud();
    const next = typedSecret(shadow);
    const stored = String(await api.getSecret() || "").trim();
    if (next && !stored) {
      await api.setSecret(next);
      return next;
    }
    return stored;
  }

  // 已有密钥时，另一串只交给后台做只读解密核对，这里不先写入本机
  async function candidateSecret(shadow) {
    const api = cloud();
    const next = typedSecret(shadow);
    const stored = String(await api.getSecret() || "").trim();
    if (next && !stored) {
      await api.setSecret(next);
      return {};
    }
    if (stored && next && next !== stored) {
      return { secret: next };
    }
    return {};
  }

  function request(payload) {
    const message = { type: TYPE, action: "sync", reason: "manual", ...payload };
    if (root.STMessageBus?.request) {
      return root.STMessageBus.request(message, { expectSuccess: false });
    }
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, (res) => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(new Error(error.message || String(error)));
            return;
          }
          resolve(res || {});
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // 登录写入后可传入同一份 token，避免卡片再读一次空的 steam_buff_auth 后画出去登录
  async function snapshot(authOverride, useOverride) {
    const api = cloud();
    const store = settings.storage || {};
    const authTask = useOverride
      ? Promise.resolve(authOverride)
      : (typeof store.getAuth === "function" ? store.getAuth() : Promise.resolve(null));
    const memTask = typeof store.getMembership === "function"
      ? store.getMembership()
      : Promise.resolve(membership()?.empty?.());
    const [enabled, secret, meta, auth, mem] = await Promise.all([
      api.getEnabled(),
      api.getSecret(),
      api.getMeta(),
      authTask,
      memTask,
    ]);
    lastSecret = String(secret || "");
    const logged = loggedIn(auth);
    const allowed = logged && membership()?.permission?.("settingsCloud", mem) === true;
    cachedState = { enabled, secret: lastSecret, meta, logged, allowed, mem };
    return cachedState;
  }

  function statusText(state) {
    if (state.logged === false) {
      return tr("settings.cloud.needLogin", "请先登录 Steam Buff 账号。");
    }
    if (state.logged !== true) {
      return "";
    }
    if (!state.allowed) {
      return membership()?.lockText?.({
        member: true,
        memberFeature: "settingsCloud",
      }, state.mem) || tr("settings.cloud.needPermission", "当前权益不包含设置云同步。");
    }
    if (!state.enabled) {
      return tr("settings.cloud.idle", "开启后，设置中心面板配置会加密同步到当前账号。");
    }
    if (!state.secret) {
      return tr("settings.cloud.needSecret", "请填写同步密钥后再同步。其它设备使用同一串密钥。");
    }
    if (state.meta?.conflict === "upgrade") {
      return tr("settings.cloud.upgradePending", "云端设置来自更高版本扩展，请先升级 Steam Buff。");
    }
    if (state.meta?.decryptBlocked) {
      return tr("settings.cloud.decryptPending", "密钥错误");
    }
    if (state.meta?.conflict) {
      return tr("settings.cloud.conflictPending", "本机和云端都改过设置，需要选择保留哪一份。");
    }
    if (state.meta?.lastError) {
      return String(state.meta.lastError);
    }
    if (state.meta?.dirty) {
      return tr("settings.cloud.dirty", "有未上传的本机改动，关闭设置页或点击立即同步后会上传。");
    }
    if (state.meta?.lastSyncedAt) {
      const time = new Date(state.meta.lastSyncedAt).toLocaleString();
      return tr("settings.cloud.lastSynced", "上次同步：$time$", { time });
    }
    return tr("settings.cloud.idle", "开启后，设置中心面板配置会加密同步到当前账号。");
  }

  function htmlFrom(state) {
    const loggedOut = state.logged === false;
    const locked = loggedOut || state.allowed !== true;
    const enabled = state.enabled === true && !locked;
    const lock = locked
      ? (loggedOut
        ? tr("settings.cloud.needLogin", "请先登录 Steam Buff 账号。")
        : statusText(state))
      : "";
    return `
        <section class="settings-card section-card settings-cloud-card">
          <div class="section-header">
            <div class="dot"></div>
            <div class="title">${esc(tr("settings.cloud.title", "设置云同步"))}</div>
          </div>
          <div class="settings-grid">
            <div class="settings-row form-row">
              <span class="settings-label label">
                <span>${esc(tr("settings.cloud.enable", "启用云同步"))}</span>
                <span class="feature-badge member">${esc(tr("settings.account.sponsor", "赞助者"))}</span>
              </span>
              <span class="settings-value control">
                <button class="switch" type="button" role="switch" aria-checked="${enabled ? "true" : "false"}" data-cloud-enabled aria-label="${escAttr(tr("settings.cloud.enable", "启用云同步"))}" title="${escAttr(lock || tr("settings.cloud.enable", "启用云同步"))}" ${locked ? "disabled" : ""}>
                  <span class="knob"></span>
                </button>
              </span>
            </div>
            <div class="settings-row form-row">
              <span class="settings-label label">${esc(tr("settings.cloud.secret", "同步密钥"))}</span>
              <span class="settings-value control">
                <input class="settings-control" type="password" data-cloud-secret autocomplete="new-password" spellcheck="false" ${locked ? "disabled" : ""} placeholder="${escAttr(tr("settings.cloud.secretPlaceholder", "只保存在本机，请在其它设备填写同一串"))}" value="${escAttr(state.secret || "")}">
              </span>
            </div>
          </div>
          <div class="settings-actions">
            ${locked && loggedOut
              ? `<button class="dialog-btn primary" type="button" data-cloud-login>${esc(tr("settings.cloud.login", "去登录"))}</button>`
              : `<button class="dialog-btn" type="button" data-cloud-reset ${locked ? "disabled" : ""}>${esc(tr("settings.cloud.reset", "重置"))}</button><button class="dialog-btn primary" type="button" data-cloud-sync ${locked ? "disabled" : ""}>${esc(tr("settings.cloud.syncNow", "立即同步"))}</button>`}
          </div>
          <div class="settings-card-note" data-cloud-status>${esc(statusText(state))}</div>
        </section>
    `;
  }

  function htmlSync() {
    return htmlFrom(cachedState || {
      enabled: false,
      secret: "",
      meta: cloud()?.emptyMeta?.() || {},
      logged: null,
      allowed: false,
      mem: membership()?.empty?.(),
    });
  }

  function replaceCard(shadow, htmlText) {
    const card = shadow?.querySelector?.(".settings-cloud-card");
    if (!card?.parentNode) {
      return false;
    }
    const wrap = card.ownerDocument.createElement("div");
    wrap.hidden = true;
    card.parentNode.insertBefore(wrap, card);
    try {
      const dom = root.STDomUtils;
      if (!dom?.setTrustedHTML || !dom.trustedHTML) {
        throw new Error("可信 HTML 接口不可用");
      }
      dom.setTrustedHTML(wrap, dom.trustedHTML(htmlText, "settings-cloud-card"));
      const next = wrap.firstElementChild;
      if (!next) {
        return false;
      }
      card.replaceWith(next);
      return true;
    } finally {
      wrap.remove();
    }
  }

  async function preload(...args) {
    try {
      await snapshot(args[0], args.length > 0);
    } catch (error) {
      log.warn("settings-cloud-card-failed", "设置云同步卡片读取失败", { error });
      return cachedState;
    }
    if (panelShadow?.querySelector?.(".settings-cloud-card")) {
      try {
        replaceCard(panelShadow, htmlSync());
      } catch (error) {
        log.warn("settings-cloud-card-refresh-failed", "设置云同步卡片刷新失败", { error });
      }
    }
    return cachedState;
  }

  async function html() {
    try {
      return htmlFrom(await snapshot());
    } catch (error) {
      log.warn("settings-cloud-card-failed", "设置云同步卡片读取失败", { error });
      return htmlSync();
    }
  }

  async function refresh(shadow) {
    let htmlText = "";
    try {
      htmlText = await html();
    } catch (error) {
      log.warn("settings-cloud-card-failed", "设置云同步卡片读取失败", { error });
      return;
    }
    try {
      replaceCard(shadow, htmlText);
    } catch (error) {
      log.warn("settings-cloud-card-refresh-failed", "设置云同步卡片刷新失败", { error });
    }
  }

  function setStatus(shadow, text) {
    const node = shadow?.querySelector?.("[data-cloud-status]");
    if (node) {
      node.textContent = text;
    }
  }

  async function dialog(shadow, options) {
    const fn = dialogs()?.dialog;
    if (typeof fn !== "function") {
      return "cancel";
    }
    return fn(shadow, options);
  }

  async function showPrompt(shadow, payload = {}) {
    if (prompting) {
      return;
    }
    prompting = true;
    try {
      const kind = String(payload.kind || "");
      if (kind === "upgrade") {
        await dialog(shadow, {
          title: tr("settings.cloud.upgradeTitle", "需要升级扩展"),
          message: tr("settings.cloud.upgradeMessage", "云端设置来自更高版本的 Steam Buff。升级后再同步，避免丢掉新字段。"),
          actions: [{ id: "ok", label: tr("common.confirm", "确定"), primary: true }],
        });
        return;
      }
      if (kind === "decrypt") {
        await dialog(shadow, {
          title: tr("settings.cloud.decryptPending", "密钥错误"),
          message: tr("settings.cloud.secretWrongMessage", "同步密钥无法解密云端设置。可以填写正确密钥后再同步，核对成功后才会替换本机密钥。要更换云端密文的加密密钥，请先重置清除云端设置，再重新开启并填写新密钥。"),
          actions: [{ id: "ok", label: tr("common.confirm", "确定"), primary: true }],
        });
        await request({ reason: "resolve", action: "defer" });
        return;
      }
      if (kind === "conflict") {
        const action = await dialog(shadow, {
          title: tr("settings.cloud.conflictTitle", "设置云同步冲突"),
          message: tr("settings.cloud.conflictMessage", "这台设备和云端都改过设置。使用云端会覆盖本机面板设置；使用本机则会覆盖云端。不会自动备份。"),
          actions: [
            { id: "cloud", label: tr("settings.cloud.useCloud", "使用云端") },
            { id: "local", label: tr("settings.cloud.useLocal", "使用本机") },
            { id: "later", label: tr("settings.cloud.later", "稍后"), primary: true },
          ],
        });
        if (action === "cloud") {
          const confirm = await dialog(shadow, {
            title: tr("settings.cloud.useCloud", "使用云端"),
            message: tr("settings.cloud.conflictMessage", "这台设备和云端都改过设置。使用云端会覆盖本机面板设置；使用本机则会覆盖云端。不会自动备份。"),
            actions: [
              { id: "cancel", label: tr("common.cancel", "取消") },
              { id: "ok", label: tr("common.confirm", "确定"), primary: true },
            ],
          });
          if (confirm === "ok") {
            await request({ reason: "resolve", action: "use-cloud" });
            await refresh(shadow);
          }
          return;
        }
        if (action === "local") {
          const confirm = await dialog(shadow, {
            title: tr("settings.cloud.useLocal", "使用本机"),
            message: tr("settings.cloud.overwriteConfirmMessage", "云端现有设置会被这台设备用当前密钥加密后覆盖，且不会保留历史版本。"),
            actions: [
              { id: "cancel", label: tr("common.cancel", "取消") },
              { id: "ok", label: tr("common.confirm", "确定"), primary: true },
            ],
          });
          if (confirm === "ok") {
            await request({ reason: "resolve", action: "use-local" });
            await refresh(shadow);
          }
          return;
        }
        await request({ reason: "resolve", action: "defer" });
      }
    } finally {
      prompting = false;
    }
  }

  async function toggleEnabled(shadow, enabled) {
    const api = cloud();
    await api.setEnabled(enabled);
    log.info(enabled ? "settings-cloud-enabled" : "settings-cloud-disabled", enabled ? "已开启设置云同步" : "已关闭设置云同步", {
      operationId: root.STLoggerFactory?.createOperationId?.() || "",
    });
    if (enabled) {
      const extra = await candidateSecret(shadow);
      await request({ reason: "manual", action: "sync", ...extra });
    }
    await refresh(shadow);
  }

  async function syncNow(shadow) {
    const extra = await candidateSecret(shadow);
    const result = await request({ reason: "manual", action: "sync", ...extra });
    if (result?.needSecret) {
      setStatus(shadow, tr("settings.cloud.needSecret", "请填写同步密钥后再同步。其它设备使用同一串密钥。"));
      return;
    }
    if (result?.success === false) {
      setStatus(shadow, result.error || tr("settings.cloud.syncFailed", "同步失败，请稍后重试。"));
      return;
    }
    if (result?.action === "conflict" || result?.action === "decrypt" || result?.action === "upgrade") {
      await showPrompt(shadow, { kind: result.action === "conflict" ? "conflict" : result.action, reason: result.reason });
    }
    await refresh(shadow);
  }

  async function resetCloud(shadow) {
    const confirm = await dialog(shadow, {
      title: tr("settings.cloud.resetTitle", "清除云端设置？"),
      message: tr("settings.cloud.resetMessage", "重置会删除当前账号在云端保存的设置副本，删除后不能恢复。本机的面板设置会保留。云同步会在这台设备上关闭，其他设备不能再从云端拉回这份设置。之后需要你自己重新开启云同步，并填写新的同步密钥。"),
      actions: [
        { id: "cancel", label: tr("common.cancel", "取消") },
        {
          id: "ok",
          label: tr("settings.cloud.resetConfirm", "确认"),
          primary: true,
          countdownSeconds: 10,
        },
      ],
    });
    if (confirm !== "ok") {
      return;
    }
    const result = await request({ reason: "resolve", action: "reset" });
    if (result?.success === false) {
      if (result.cloudCleared === true) {
        await refresh(shadow);
      }
      setStatus(shadow, result.error || tr("settings.cloud.resetFailed", "清除云端设置失败，云同步仍保持原状。"));
      return;
    }
    await refresh(shadow);
  }

  function watchAuth(shadow) {
    const keys = [AUTH_KEY, membership()?.KEY || "steam_buff_membership"];
    const refreshCard = () => {
      refresh(shadow).catch((error) => {
        log.warn("settings-cloud-auth-refresh-failed", "登录或权益变化后刷新云同步卡片失败", { error });
      });
    };
    if (root.STSettingsBus?.subscribe) {
      root.STSettingsBus.subscribe(refreshCard, {
        owner: "settings:cloud",
        key: "auth-membership",
        keys,
      });
      return;
    }
    if (!root.chrome?.storage?.onChanged) {
      return;
    }
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") {
        return;
      }
      if (!keys.some((key) => Object.hasOwn(changes || {}, key))) {
        return;
      }
      refreshCard();
    });
  }

  function bind(shadow) {
    if (!shadow) {
      return;
    }
    panelShadow = shadow;
    if (bound) {
      return;
    }
    bound = true;
    root.STSettingsCloudUi = api;
    watchAuth(shadow);
    if (root.STMessageBus?.listen) {
      root.STMessageBus.listen(PROMPT_TYPE, (request) => {
        showPrompt(shadow, request).catch((error) => {
          log.warn("settings-cloud-prompt-failed", "设置云同步弹窗失败", { error });
        });
      }, { owner: "settings:cloud", key: "prompt" });
    } else if (root.chrome?.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((request) => {
        if (request?.type !== PROMPT_TYPE) {
          return;
        }
        showPrompt(shadow, request).catch((error) => {
          log.warn("settings-cloud-prompt-failed", "设置云同步弹窗失败", { error });
        });
      });
    }
  }

  function handleClick(event, shadow, ctx) {
    const login = event.target.closest("[data-cloud-login]");
    if (login) {
      ctx?.openCat?.("account") || root.STSettingsMenu?.openCat?.("account");
      return true;
    }
    const sync = event.target.closest("[data-cloud-sync]");
    if (sync && !sync.disabled) {
      syncNow(shadow).catch((error) => {
        log.error("settings-cloud-manual-failed", "手动同步失败", { error });
        setStatus(shadow, error?.message || tr("settings.cloud.syncFailed", "同步失败，请稍后重试。"));
      });
      return true;
    }
    const reset = event.target.closest("[data-cloud-reset]");
    if (reset && !reset.disabled) {
      resetCloud(shadow).catch((error) => {
        log.error("settings-cloud-reset-failed", "重置设置云同步失败", { error });
        setStatus(shadow, error?.message || tr("settings.cloud.resetFailed", "清除云端设置失败，云同步仍保持原状。"));
      });
      return true;
    }
    const toggle = event.target.closest("[data-cloud-enabled]");
    if (toggle && !toggle.disabled) {
      const next = toggle.getAttribute("aria-checked") !== "true";
      toggleEnabled(shadow, next).catch((error) => {
        log.error("settings-cloud-toggle-failed", "切换设置云同步失败", { error });
      });
      return true;
    }
    return false;
  }

  function notifyOpen() {
    return request({ reason: "open-settings", action: "sync" }).then((result) => {
      if (result?.action === "conflict" || result?.action === "decrypt" || result?.action === "upgrade") {
        return result;
      }
      return result;
    }).catch((error) => {
      log.warn("settings-cloud-open-failed", "打开设置时检查云同步失败", { error });
      return null;
    });
  }

  function notifyClose() {
    return rememberSecret(panelShadow).then((secret) => request({
      reason: "debounce",
      action: "sync",
      settingsClosed: true,
      secret,
    })).catch((error) => {
      log.warn("settings-cloud-close-failed", "关闭设置时上传云同步失败", { error });
      return null;
    });
  }

  const api = Object.freeze({
    ready: true,
    html,
    htmlSync,
    preload,
    refresh,
    bind,
    handleClick,
    showPrompt,
    notifyOpen,
    notifyClose,
  });

  settings.cloudUi = api;
  root.STSettingsCloudUi = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
