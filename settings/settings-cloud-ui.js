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
  if (settings.cloudUi?.ready) return;

  const cloud = settings.cloud;
  const bus = root.STSettingsBus;
  const log = root.STLoggerFactory.createLogger("settings", "settings-cloud");
  const view = bus.createSnapshotStore({ owner: "settings:cloud", key: "card" });
  const prompt = root.STSettingsCloudPrompt;
  const privatePage = root.location?.protocol === "chrome-extension:";
  const embeddedPage = privatePage && root.location.pathname === "/settings/cloud-card.html";
  const frameMessage = "steam-buff-cloud-card";
  let panelShadow = null;
  let cardFrame;
  let reportFrameDraft;
  let confirmationRead = false;
  let lifecycleOpen = false;
  let releases = [];
  let busy = false;
  let prompting = false;
  let openRev = 0;

  function tr(key, fallback, params) {
    return root.STI18n.text(key, fallback, params);
  }

  function request(action, payload = {}, operationId = root.STLoggerFactory.createOperationId()) {
    return new Promise((resolve, reject) => {
      root.chrome.runtime.sendMessage({ type: "SETTINGS_CLOUD_SYNC", action, reason: "manual", operationId, ...payload }, result => {
        const error = root.chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else if (!result || typeof result.success !== "boolean") reject(new Error("云同步没有返回有效结果"));
        else resolve(result);
      });
    });
  }

  function dialogs() {
    return root.STSettingsDialogs;
  }

  function active(shadow, stamp = openRev) {
    const overlay = shadow?.querySelector(".overlay");
    return shadow === panelShadow && stamp === openRev && overlay?.isConnected
      && !overlay.hidden && overlay.classList.contains("open");
  }

  function status(state) {
    if (state.failed) return tr("settings.cloud.readFailed", "无法读取云同步设置，请重新打开设置重试。");
    if (state.logged === false) return tr("settings.cloud.needLogin", "请先登录 Steam Buff 账号。");
    if (state.logged !== true) return "";
    if (!state.allowed) return tr("settings.cloud.needPermission", "当前权益不包含设置云同步。");
    if (state.channel?.provider === "webdav" && !state.channel.dav) {
      return tr("settings.cloud.webdavMissing", "请先测试并保存 WebDAV 连接。");
    }
    if (!state.channel?.enabled) return "";
    if (state.meta.lastError) return prompt.resultText({ success: false, ...state.meta.lastError });
    if (state.meta.conflict === "upgrade") {
      return tr("settings.cloud.upgradePending", "远端备份来自更高版本，请先升级 Steam Buff。");
    }
    if (state.meta.conflict === "remote-deleted") return prompt.resultText({ action: "remote-deleted" });
    if (state.meta.conflict) {
      return privatePage
        ? tr("settings.cloud.conflictPending", "本机与远端设置不同，点击「立即同步」选择要保留的版本。")
        : tr("settings.cloud.conflictNotice", "本机与远端备份的设置不同。");
    }
    if (state.meta.dirty) return tr("settings.cloud.dirty", "本机有未上传的设置。");
    if (!state.meta.lastSyncedAt) return "";
    const time = new Date(state.meta.lastSyncedAt).toLocaleString(root.STI18n.intlLocale());
    return tr("settings.cloud.lastSynced", "上次同步：$time$", { time });
  }

  function htmlSync() {
    const t = (key, fallback) => root.STSettingsHtml.esc(tr(key, fallback));
    if (!privatePage) return `<div class="settings-cloud-frame" data-cloud-frame>
      <section class="settings-card section-card" data-cloud-frame-note aria-labelledby="st-cloud-frame-title">
        <div class="section-header"><div class="dot"></div><div class="title" id="st-cloud-frame-title">${t("settings.cloud.title", "设置云同步")}</div></div>
        <div class="settings-card-note" role="status" data-cloud-frame-status>${t("settings.cloud.frameLoading", "正在加载云同步设置…")}</div>
        <div class="settings-actions" data-cloud-frame-fallback hidden>
          <button class="dialog-btn" type="button" data-cloud-open>${t("settings.cloud.openSettings", "打开云同步设置")}</button>
        </div>
      </section></div>`;
    return `
      <section class="settings-card section-card settings-cloud-card" aria-labelledby="st-cloud-title">
        <div class="section-header"><div class="dot"></div><div class="title" id="st-cloud-title">${t("settings.cloud.title", "设置云同步")}</div></div>
        <div class="settings-grid">
          <div class="settings-row form-row">
            <label for="st-cloud-source" class="settings-label label">${t("settings.cloud.provider", "备份位置")}</label>
            <span class="settings-value control">
              <select class="settings-control" id="st-cloud-source" data-cloud-provider disabled>
                <option value="official">${t("settings.cloud.official", "Steam Buff 云端")}</option>
                <option value="webdav">WebDAV</option>
              </select>
            </span>
          </div>
          <form class="cloud-dav-form" data-cloud-dav-form method="post" novalidate hidden aria-label="${t("settings.cloud.webdavTitle", "WebDAV 连接")}">
            <div class="settings-row form-row">
              <label for="st-cloud-dav-directory" class="settings-label label">${t("settings.cloud.webdavDirectory", "HTTPS 文件夹地址")}</label>
              <span class="settings-value control"><input class="settings-control" id="st-cloud-dav-directory" name="directory" type="url"
                autocomplete="url" autocapitalize="none" spellcheck="false" required></span>
            </div>
            <div class="settings-row form-row">
              <label for="st-cloud-dav-user" class="settings-label label">${t("settings.cloud.webdavUser", "用户名")}</label>
              <span class="settings-value control"><input class="settings-control" id="st-cloud-dav-user" name="username" type="text"
                autocomplete="username" autocapitalize="none" spellcheck="false" required></span>
            </div>
            <div class="settings-row form-row">
              <label for="st-cloud-dav-password" class="settings-label label">${t("settings.cloud.webdavPassword", "密码或应用密码")}</label>
              <span class="settings-value control"><input class="settings-control" id="st-cloud-dav-password" name="password" type="password"
                autocomplete="current-password" required></span>
            </div>
            <div class="settings-row form-row cloud-dav-actions">
              <p class="cloud-dav-feedback" data-cloud-dav-feedback role="status"></p>
              <button class="dialog-btn" type="submit">${t("settings.cloud.webdavTestSave", "测试连接并保存")}</button>
            </div>
          </form>
          <div class="settings-row form-row">
            <span class="settings-label label"><span id="st-cloud-enable">${t("settings.cloud.enable", "启用云同步")}</span>
              <span class="feature-badge member">${t("settings.account.sponsor", "赞助者")}</span>
            </span>
            <span class="settings-value control">
              <button class="switch" type="button" role="switch" aria-checked="false" aria-labelledby="st-cloud-enable" data-cloud-enabled disabled><span class="knob"></span></button>
            </span>
          </div>
        </div>
        <div class="settings-actions">
          <button class="dialog-btn primary" type="button" data-cloud-login hidden>${t("settings.cloud.login", "去登录")}</button>
          <button class="dialog-btn" type="button" data-cloud-offline>${t("settings.cloud.restoreBackup", "恢复备份")}</button>
          <button class="dialog-btn" type="button" data-cloud-devices hidden disabled>${t("settings.cloud.devices", "设备管理")}</button>
          <button class="dialog-btn danger" type="button" data-cloud-reset hidden disabled>${t("settings.cloud.reset", "删除远端备份")}</button>
          <button class="dialog-btn primary" type="button" data-cloud-sync disabled>${t("settings.cloud.syncNow", "立即同步")}</button>
        </div>
        <div class="settings-card-note" data-cloud-status role="status" hidden></div>
      </section>`;
  }

  function unmountCardFrame() {
    if (!cardFrame) return;
    root.clearTimeout(cardFrame.timeout);
    root.removeEventListener("message", cardFrame.receive);
    cardFrame.frame.remove();
    cardFrame = null;
  }

  function mountCardFrame(shadow) {
    const host = active(shadow) && shadow.querySelector("[data-cloud-frame]");
    if (host && cardFrame?.host === host) return;
    unmountCardFrame();
    if (!host) return;

    const frame = document.createElement("iframe");
    const address = new URL(root.chrome.runtime.getURL("settings/cloud-card.html"));
    const origin = "chrome-extension://" + address.hostname;
    address.hash = new URLSearchParams({ parent: root.location.origin }).toString();
    frame.title = tr("settings.cloud.title", "设置云同步");
    frame.referrerPolicy = "no-referrer";
    const note = host.querySelector("[data-cloud-frame-note]");
    const message = host.querySelector("[data-cloud-frame-status]");
    const fallback = host.querySelector("[data-cloud-frame-fallback]");
    note.hidden = false;
    fallback.hidden = true;
    message.textContent = tr("settings.cloud.frameLoading", "正在加载云同步设置…");
    frame.height = "0";
    const fail = () => {
      unmountCardFrame();
      note.hidden = false;
      message.textContent = tr("settings.cloud.frameFailed", "无法在此加载云同步设置。");
      fallback.hidden = false;
    };
    const receive = event => {
      if (!host.isConnected || !active(shadow) || event.source !== frame.contentWindow
        || event.origin !== origin || event.data?.type !== frameMessage) return;
      if (event.data.action === "layout" && Number.isSafeInteger(event.data.height) && event.data.height > 0) {
        root.clearTimeout(cardFrame.timeout);
        frame.height = String(Math.min(1400, event.data.height));
        note.hidden = true;
      } else if (event.data.action === "draft" && typeof event.data.pending === "boolean") {
        cardFrame.pending = event.data.pending;
      } else if (event.data.action === "account") {
        root.STSettingsMenu?.openCat("account");
      } else if (event.data.action === "close") {
        root.STSettingsMenu?.close();
      } else if (event.data.action === "failed") {
        fail();
      }
    };
    cardFrame = { host, frame, receive, timeout: root.setTimeout(() => {
      log.warn("settings-cloud-frame-timeout", "等待内嵌云同步设置超时");
      fail();
    }, 10000) };
    root.addEventListener("message", receive);
    frame.src = address.href;
    host.append(frame);
  }

  function paint(shadow) {
    const card = shadow?.querySelector(".settings-cloud-card");
    if (!card) return;
    const state = view.getSnapshot() || {};
    const provider = state.channel?.provider || "official";
    const available = state.logged && state.allowed && !state.failed;
    const note = card.querySelector("[data-cloud-status]");
    card.setAttribute("aria-busy", String(busy));
    note.textContent = status(state);
    note.hidden = !note.textContent;
    card.querySelector("[data-cloud-login]").hidden = state.logged !== false;
    const enabled = state.channel?.enabled === true;
    const configured = provider === "official" || !!state.channel?.dav;
    const select = card.querySelector("[data-cloud-provider]");
    const toggle = card.querySelector("[data-cloud-enabled]");
    const sync = card.querySelector("[data-cloud-sync]");
    const reset = card.querySelector("[data-cloud-reset]");
    const devices = card.querySelector("[data-cloud-devices]");
    const form = card.querySelector("[data-cloud-dav-form]");
    if (!busy) select.value = provider;
    select.disabled = !available || busy;
    form.hidden = provider !== "webdav";
    const formChannel = available && !form.hidden ? state.channel : null;
    const formChannelId = formChannel?.id ?? "";
    if (form.dataset.channelId !== formChannelId) {
      form.dataset.channelId = formChannelId;
      fillWebdav(form, formChannel?.dav);
    }
    for (const control of form.elements) control.disabled = busy || !formChannel;
    toggle.setAttribute("aria-checked", String(enabled));
    toggle.disabled = busy || (!enabled && (!available || !configured));
    toggle.title = !available || !configured ? status(state) : "";
    sync.hidden = state.logged === false;
    sync.disabled = !available || !enabled || busy;
    devices.hidden = !available;
    devices.disabled = !configured || busy;
    card.querySelector("[data-cloud-offline]").disabled = busy;
    reset.hidden = !state.channel || !configured || state.logged === false;
    reset.disabled = !available || busy;
    reportFrameDraft?.(busy || root.STSettingsFields.hasEdits(form));
  }

  // 登录回执传入的令牌只影响登录显示；远端选择始终按同一次存储读取确认账号
  async function snapshot(auth, override, source = {}) {
    const ticket = view.beginUpdate();
    try {
      const [local, identity] = await Promise.all([
        cloud.readChannel(), settings.storage.getAuthIdentity({ strict: true, withSettingsCloud: true }),
      ]);
      const actual = root.STAuthSession.authKey(identity.auth);
      const logged = !!root.STAuthSession.authKey(override ? auth : identity.auth);
      const sameSession = !override || root.STAuthSession.authKey(auth) === actual;
      const session = logged && sameSession ? await root.STAuthSession.fingerprint(identity.auth) : "";
      const channel = session && local.channel?.userId === identity.userId && local.channel.session === session ? local.channel : null;
      view.commitUpdate(ticket, { channel, session, logged, allowed: logged && sameSession && identity.settingsCloud,
        meta: channel ? local.meta : cloud.emptyMeta(), failed: false }, source);
    } catch (error) {
      view.commitUpdate(ticket, { failed: true, allowed: false }, source);
      log.warn("settings-cloud-card-failed", "读取云同步设置失败", { error, operationId: source.operationId });
    }
    return view.getSnapshot();
  }

  function preload(...args) {
    return privatePage ? snapshot(args[0], args.length > 0, args[1]) : Promise.resolve();
  }

  async function refresh(shadow, source) {
    if (!privatePage) {
      if (shadow === panelShadow) mountCardFrame(shadow);
      return;
    }
    await snapshot(undefined, false, source);
    if (shadow === panelShadow) paint(shadow);
  }

  async function html() {
    await preload();
    return htmlSync();
  }

  async function showPrompt(shadow, payload, stamp = openRev) {
    if (!active(shadow, stamp) || prompting) return;
    prompting = true;
    try {
      const result = await prompt.present(payload, options => dialogs().dialog(shadow, { ...options, native: true }),
        () => active(shadow, stamp));
      if (!result) return;
      await refresh(shadow);
      if (!active(shadow, stamp)) return;
      const message = prompt.resultText(result);
      if (message) void dialogs().notice(shadow, { message });
      else if (!result.skipped) void noticeSuccess(shadow, result);
    } finally {
      prompting = false;
    }
  }

  function noticeSuccess(shadow, result) {
    const message = result.pending
      ? tr("settings.cloud.dirty", "本机有未上传的设置。")
      : tr("settings.cloud.syncDoneBody", "设置云同步已完成。");
    return dialogs().notice(shadow, { title: tr("settings.cloud.title", "设置云同步"), message });
  }

  function confirm(shadow, title, message, label, danger = false) {
    return dialogs().dialog(shadow, { native: true, title, message, actions: [
      { id: "cancel", label: tr("common.cancel", "取消") },
      { id: "ok", label, primary: true, danger },
    ] });
  }

  function cloudTarget() {
    return view.getSnapshot()?.channel ?? null;
  }

  async function applyAction(shadow, input, stamp, state = view.getSnapshot()) {
    const channel = state?.channel;
    const { channelId, expectedSession } = deviceTarget(state);
    if (input.action === "enable") {
      const consent = channel?.provider === "webdav"
        ? tr("settings.cloud.consentDav", "API 密钥、设置和成就译文会在本机加密后上传至 WebDAV。可用已授权的设备或恢复文件解密。")
        : tr("settings.cloud.consentOfficial", "API 密钥、设置和成就译文会在本机加密后上传至 Steam Buff。可用已授权的设备或恢复文件解密。");
      if (await confirm(shadow, tr("settings.cloud.enable", "启用云同步"), consent,
        tr("settings.cloud.enableConfirm", "确认开启")) !== "ok" || !active(shadow, stamp)) return;
    }
    if (input.action === "reset") {
      const warning = channel?.provider === "webdav"
        ? tr("settings.cloud.resetMessageDav", "这将删除 WebDAV 上的当前备份并关闭本机同步。已下载的备份和本机数据会保留。")
        : tr("settings.cloud.resetMessage", "这将删除当前云同步备份并关闭本机同步。本机数据和独立归档会保留。");
      if (await confirm(shadow, tr("settings.cloud.resetTitle", "删除远端备份？"),
        warning,
        tr("settings.cloud.reset", "删除远端备份"), true) !== "ok" || !active(shadow, stamp)) return;
    }
    const { action, ...values } = input;
    const result = await request(action, { ...values, channelId, expectedSession, ...(action === "enable" && { consent: true }) });
    if (result.recovery && active(shadow, stamp)) saveRecovery(result.recovery);
    await refresh(shadow);
    if (!active(shadow, stamp)) return;
    if (embeddedPage && result.pendingRecoveryId) {
      return openCloudConfirmation(shadow, stamp, "recovery", { channelId: result.channelId, expectedSession }, result.pendingRecoveryId);
    }
    if (result.prompt) {
      if (embeddedPage && result.prompt.kind === "conflict") {
        return openCloudConfirmation(shadow, stamp, "conflict", { channelId: result.prompt.channelId, expectedSession });
      }
      await showPrompt(shadow, result.prompt, stamp);
      return;
    }
    const message = prompt.resultText(result);
    if (message) void dialogs().notice(shadow, { message });
    else if (result.recovery) await recoveryFollowup(shadow, stamp, result.recovery, { channelId: result.channelId, expectedSession });
    else if (action === "reset") void dialogs().notice(shadow, { message: tr("settings.cloud.resetDoneBody", "远端备份已删除。") });
    else if (action === "sync" && !result.skipped) void noticeSuccess(shadow, result);
  }

  function downloadJson(value, name) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name + ".json";
    link.click();
    root.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function saveRecovery(file) {
    downloadJson(file, "steam-buff-recovery-" + file.kid.slice(0, 12));
  }

  function recoveryNotice() {
    return tr("settings.cloud.recoveryNotice", "请单独保存恢复文件。新生成的恢复文件可打开从现在起下载的备份，旧备份要用原来的恢复文件。");
  }

  function deviceTarget(state) {
    return { channelId: state?.channel?.id ?? null, expectedSession: state?.session };
  }

  function deviceRequest(action, target, values = {}) {
    return request(action, { ...values, ...target });
  }

  async function openCloudConfirmation(shadow, stamp, intent, target, recoveryId) {
    const result = await request("open-private-settings", { intent, ...target, ...(recoveryId && { recoveryId }) });
    if (!result.success && active(shadow, stamp)) void dialogs().notice(shadow, { message: prompt.resultText(result) });
  }

  async function recoveryFollowup(shadow, stamp, file, target) {
    if (target.channelId !== null && (typeof target.channelId !== "string" || !target.channelId)) {
      throw new TypeError("恢复文件缺少对应的备份位置");
    }
    const choice = await dialogs().dialog(shadow, {
      native: true, title: tr("settings.cloud.recoveryFile", "恢复文件"), message: recoveryNotice(),
      actions: [
        { id: "saved", label: tr("settings.cloud.recoverySaved", "已保存恢复文件") },
        { id: "archive", label: tr("settings.cloud.downloadArchive", "下载加密备份"), primary: true },
      ],
    });
    if (!active(shadow, stamp)) return;
    if (choice === "archive") return downloadArchive(shadow, stamp, target);
    if (choice === "saved") {
      const reply = await deviceRequest("recovery-saved", target, { recoveryId: file.kid });
      const message = prompt.resultText(reply);
      if (message && active(shadow, stamp)) void dialogs().notice(shadow, { message });
    }
  }

  async function downloadArchive(shadow, stamp, target) {
    const result = await deviceRequest("export-archive", target);
    if (!active(shadow, stamp)) return;
    const message = prompt.resultText(result);
    if (message) return dialogs().notice(shadow, { message });
    downloadJson(result.archive, "steam-buff-backup-" + new Date().toISOString().slice(0, 10));
  }

  function vaultField(box, label, input) {
    const row = document.createElement("label");
    row.className = "cloud-dav-field";
    const caption = document.createElement("span");
    caption.textContent = label;
    input.className = "settings-control";
    row.append(caption, input);
    box.append(row);
    return input;
  }

  function vaultStatus(box) {
    const status = document.createElement("p");
    status.className = "cloud-dav-status";
    status.setAttribute("role", "status");
    box.append(status);
    return status;
  }

  async function parseVaultFile(input, maxBytes) {
    const file = input.files?.[0];
    if (!file || file.size > maxBytes) return null;
    try {
      return cloud.parseJson(await file.text());
    } catch (error) {
      // 保留浏览器读取异常。JSON 错误仅提示文件格式，避免解析器将文件内容带入日志
      if (!(error.cause instanceof SyntaxError)) throw error;
      return null;
    }
  }

  function showPairRequest(shadow, pair) {
    let field, status;
    return dialogs().dialog(shadow, {
      form: true, className: "cloud-vault-dialog", title: tr("settings.cloud.pairRequest", "配对此浏览器"),
      message: tr("settings.cloud.pairInstructions", "把这段配对请求复制到一台已授权的设备，在「授权新设备」中粘贴。请求 15 分钟内有效，请勿公开分享。"),
      render(box) {
        field = vaultField(box, tr("settings.cloud.pairCode", "配对请求"), document.createElement("textarea"));
        field.readOnly = true;
        field.rows = 4;
        field.value = JSON.stringify(pair);
        status = vaultStatus(box);
      },
      actions: [
        { id: "cancel", label: tr("common.close", "关闭") },
        { id: "copy", label: tr("settings.cloud.pairCopy", "复制请求"), primary: true },
      ],
      async onAction(action) {
        if (action !== "copy") return true;
        if (navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(field.value);
            status.textContent = tr("settings.cloud.pairCopied", "配对请求已复制。");
            return false;
          } catch (error) {
            if (error.name !== "NotAllowedError") throw error;
          }
        }
        field.focus();
        field.select();
        status.textContent = tr("settings.cloud.pairSelect", "已选中配对请求，请手动复制。");
        return false;
      },
    });
  }

  async function approvePair(shadow, stamp, target) {
    let field, status;
    const result = await dialogs().dialog(shadow, {
      form: true, className: "cloud-vault-dialog", title: tr("settings.cloud.approveDevice", "授权新设备"),
      message: tr("settings.cloud.approveInstructions", "仅粘贴从你自己的新浏览器取得的请求。授权后，它可以解密此备份。"),
      render(box) {
        field = vaultField(box, tr("settings.cloud.pairCode", "配对请求"), document.createElement("textarea"));
        field.rows = 4;
        field.maxLength = 8192;
        field.autocomplete = "off";
        field.spellcheck = false;
        status = vaultStatus(box);
      },
      actions: [
        { id: "cancel", label: tr("common.cancel", "取消") },
        { id: "approve", label: tr("settings.cloud.approveDevice", "授权新设备"), primary: true },
      ],
      async onAction(action) {
        if (action !== "approve") return true;
        let pair;
        try {
          pair = cloud.parseJson(field.value);
        } catch (error) {
          if (!(error.cause instanceof SyntaxError)) throw error;
          status.textContent = prompt.resultText({ success: false, code: "vault-pair" });
          return false;
        }
        const reply = await deviceRequest("approve-device", target, { pair });
        status.textContent = prompt.resultText(reply);
        return reply.action === "approve-device";
      },
    });
    if (result === "approve" && active(shadow, stamp)) {
      void dialogs().notice(shadow, { message: tr("settings.cloud.approved", "授权成功。请在新设备的「设备管理」中点「完成配对」。") });
    }
  }

  async function chooseRestore(shadow, stamp, state = view.getSnapshot() ?? {}) {
    const action = await dialogs().dialog(shadow, {
      native: true, className: "cloud-restore-choice", title: tr("settings.cloud.restoreBackup", "恢复备份"),
      actions: [
        { id: "restore-remote", label: tr("settings.cloud.restoreRemote", "从云端恢复") },
        { id: "restore-archive", label: tr("settings.cloud.restoreArchive", "从电脑恢复") },
      ],
    });
    if (!active(shadow, stamp) || (action !== "restore-remote" && action !== "restore-archive")) return;
    if (action === "restore-remote" && (!state.session || !state.allowed || state.failed
      || (state.channel?.provider === "webdav" && !state.channel.dav))) {
      const message = status(state) || tr("settings.cloud.readFailed", "无法读取云同步设置，请重新打开设置重试。");
      return dialogs().notice(shadow, { message });
    }
    return useRecovery(shadow, stamp, action, state);
  }

  async function useRecovery(shadow, stamp, action, state) {
    let keyInput, archiveInput, status;
    let focusRecovery = false;
    const offline = action === "restore-archive";
    const online = action === "restore-remote";
    const restoring = offline || online;
    const label = offline ? tr("settings.cloud.restoreArchive", "从电脑恢复")
      : online ? tr("settings.cloud.restoreRemote", "从云端恢复")
        : tr("settings.cloud.recoverDevice", "用恢复文件授权");
    const result = await dialogs().dialog(shadow, {
      form: true, className: "cloud-vault-dialog", title: label,
      message: restoring ? tr("settings.cloud.restoreArchiveMessage", "将用备份覆盖本机设置和同一条目的成就译文，并暂停本机云同步。") : "",
      render(box) {
        if (offline) {
          archiveInput = vaultField(box, tr("settings.cloud.archiveFile", "加密备份文件"), document.createElement("input"));
          archiveInput.type = "file";
          archiveInput.accept = ".json,application/json";
          archiveInput.addEventListener("change", () => {
            keyInput.value = "";
            keyInput.parentElement.hidden = true;
            status.textContent = "";
          });
        }
        keyInput = vaultField(box, tr("settings.cloud.recoveryFile", "恢复文件"), document.createElement("input"));
        keyInput.type = "file";
        keyInput.accept = ".json,application/json";
        keyInput.parentElement.hidden = offline;
        status = vaultStatus(box);
      },
      actions: [
        { id: "cancel", label: tr("common.cancel", "取消") },
        { id: "restore", label, primary: true, danger: restoring },
      ],
      async onAction(choice) {
        if (choice !== "restore") return true;
        const needsRecovery = !keyInput.parentElement.hidden;
        const recovery = needsRecovery ? await parseVaultFile(keyInput, 8192) : undefined;
        const archive = offline ? await parseVaultFile(archiveInput, cloud.ARCHIVE_FILE_LIMIT) : undefined;
        if (!active(shadow, stamp)) return true;
        if ((needsRecovery && !recovery) || (offline && !archive)) {
          status.textContent = prompt.resultText({ success: false, code: "vault-file" });
          return false;
        }
        status.textContent = tr("settings.cloud.restoreWorking", "正在验证并处理备份…");
        const reply = offline ? await request(action, { archive, expectedSession: state.session, ...(needsRecovery && { recovery }) })
          : online ? await request(action, { recovery, channelId: state.channel?.id ?? null, expectedSession: state.session })
            : await deviceRequest(action, deviceTarget(state), { recovery });
        if (offline && reply.code === "vault-recovery-required") {
          keyInput.parentElement.hidden = false;
          status.textContent = tr("settings.cloud.restoreNeedsKey", "请再选择与这份备份对应的恢复文件。");
          focusRecovery = true;
          return false;
        }
        if (online && reply.code === "vault-rollback") {
          status.textContent = tr("settings.cloud.restoreRollback", "所选云备份早于本机已验证的版本，无法恢复。");
          return false;
        }
        status.textContent = prompt.resultText(reply);
        return reply.action === action;
      },
      onActionSettled() {
        if (!focusRecovery) return;
        focusRecovery = false;
        keyInput.focus();
      },
    });
    if (result !== "restore" || !active(shadow, stamp)) return;
    await refresh(shadow);
    if (active(shadow, stamp)) void dialogs().notice(shadow, { message: offline
      ? tr("settings.cloud.archiveRestored", "已从加密备份恢复本机数据。")
      : online ? tr("settings.cloud.remoteRestored", "已从云端备份恢复本机数据。")
        : tr("settings.cloud.deviceRecovered", "本机已获得授权。可以开启或立即执行云同步。") });
  }

  function deviceButton(parent, action, label, className = "dialog-btn") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset.dialogAction = action;
    button.textContent = label;
    parent.append(button);
  }

  async function manageDevices(shadow, stamp, trigger) {
    const state = view.getSnapshot();
    const target = deviceTarget(state);
    const title = tr("settings.cloud.devices", "设备管理");
    trigger.textContent = tr("settings.cloud.deviceChecking", "正在检查设备…");
    let reply;
    try {
      reply = await deviceRequest("device-status", target);
    } finally {
      trigger.textContent = title;
    }
    if (!active(shadow, stamp) || !trigger.isConnected) return;
    const { deviceState, pendingRecoveryId } = reply;
    const hasPending = typeof pendingRecoveryId === "string" && cloud.HASH.test(pendingRecoveryId);
    if (reply.success && (reply.action !== "device-status"
      || !["empty", "unpaired", "approved", "authorized"].includes(deviceState)
      || (pendingRecoveryId !== null && !hasPending))) throw new TypeError("设备管理状态响应无效");
    const enabled = state?.channel?.enabled === true;
    const finishAction = enabled ? "sync" : "enable";
    const finish = tr("settings.cloud.finishPairing", "完成配对");
    const approved = tr("settings.cloud.pairApproved", "旧设备已确认配对。");
    const missing = reply.success && deviceState === "empty";
    const message = !reply.success ? prompt.resultText(reply) : missing && enabled
      ? tr("settings.cloud.deviceBackupMissing", "所选位置没有备份。关闭后重新开启云同步可创建备份。")
      : missing ? tr("settings.cloud.backupMissing", "所选位置没有可用的加密备份。")
        : deviceState === "approved" ? approved : "";
    const action = await dialogs().dialog(shadow, {
      native: true, className: "cloud-device-dialog", title,
      initial: box => box.querySelector("button"),
      render(box) {
        if (message) {
          const note = document.createElement("p");
          note.className = "cloud-device-note";
          note.textContent = message;
          box.append(note);
        }
        const save = tr("settings.cloud.downloadRecovery", "保存恢复文件");
        if (reply.success && deviceState === "authorized") {
          deviceButton(box, "approve-device", tr("settings.cloud.approveDevice", "授权新设备"), "dialog-btn primary");
          const details = document.createElement("details");
          const summary = document.createElement("summary");
          const downloads = document.createElement("div");
          summary.textContent = tr("settings.cloud.backupFiles", "备份文件");
          downloads.className = "cloud-vault-menu cloud-device-downloads";
          deviceButton(downloads, "export-archive", tr("settings.cloud.downloadArchive", "下载加密备份"));
          deviceButton(downloads, "new-recovery", save);
          details.append(summary, downloads);
          box.append(details);
        } else if (reply.success && deviceState === "unpaired") {
          deviceButton(box, "pair-request", tr("settings.cloud.pairRequest", "配对此浏览器"), "dialog-btn primary");
          deviceButton(box, "recover-device", tr("settings.cloud.recoverDevice", "用恢复文件授权"), "dialog-btn cloud-device-link");
        } else if (reply.success && deviceState === "approved") {
          deviceButton(box, finishAction, finish, "dialog-btn primary");
        } else {
          if (missing && !enabled) deviceButton(box, "enable", tr("settings.cloud.enable", "启用云同步"), "dialog-btn primary");
          if (hasPending) deviceButton(box, "new-recovery", save, "dialog-btn cloud-device-link");
        }
      },
      actions: [],
    });
    if (!active(shadow, stamp)) return;
    if (action === "enable" || action === "sync") return applyAction(shadow, { action }, stamp, state);
    if (action === "approve-device") return approvePair(shadow, stamp, target);
    if (action === "recover-device") return useRecovery(shadow, stamp, action, state);
    if (action === "export-archive") return downloadArchive(shadow, stamp, target);
    if (action !== "pair-request" && action !== "new-recovery") return;
    const values = action === "new-recovery" && hasPending ? { recoveryId: pendingRecoveryId } : {};
    const result = await deviceRequest(action, target, values);
    if (!active(shadow, stamp)) return;
    const failure = prompt.resultText(result);
    if (failure) return dialogs().notice(shadow, { message: failure });
    if (result.pairingApproved === true) {
      if (await confirm(shadow, title, approved, finish) === "ok" && active(shadow, stamp)) {
        return applyAction(shadow, { action: finishAction }, stamp, state);
      }
      return;
    }
    if (result.pair) return showPairRequest(shadow, result.pair);
    if (result.recovery) {
      saveRecovery(result.recovery);
      await refresh(shadow);
      if (active(shadow, stamp)) {
        return recoveryFollowup(shadow, stamp, result.recovery, { ...target, channelId: result.channelId });
      }
    }
  }

  async function openDeviceManager(shadow, trigger) {
    await perform(shadow, stamp => manageDevices(shadow, stamp, trigger));
    if (active(shadow) && trigger.isConnected && !trigger.disabled) trigger.focus();
  }

  function webdavFeedback(form, message, tone = "") {
    const feedback = form.querySelector("[data-cloud-dav-feedback]");
    feedback.dataset.tone = tone;
    feedback.textContent = message;
  }

  function fillWebdav(form, dav) {
    const { directory, username, password } = form.elements;
    directory.value = dav?.directory ?? "";
    username.value = dav?.username ?? "";
    password.value = "";
    password.placeholder = dav ? tr("settings.cloud.webdavPasswordSaved", "已保存") : "";
    for (const input of [directory, username, password]) root.STSettingsFields.acceptEdit(input);
    webdavFeedback(form, "");
  }

  async function saveWebdav(shadow, form) {
    const current = cloudTarget();
    const expectedSession = view.getSnapshot()?.session;
    if (form.hidden || !current || form.dataset.channelId !== current.id) return;
    const stamp = openRev;
    const { directory, username, password } = form.elements;
    const visible = () => active(shadow, stamp) && shadow.contains(form) && !form.hidden;
    const pending = () => visible() && form.dataset.channelId === current.id;
    let invalid;
    await perform(shadow, async () => {
      let dav;
      try {
        dav = cloud.webdavConfig({ directory: directory.value, username: username.value, password: password.value });
      } catch (error) {
        if (!["webdav-url", "webdav-credentials"].includes(error.code)) throw error;
        invalid = error.code === "webdav-url" ? directory : username;
        if (invalid === username && username.value.trim() && !password.value) invalid = password;
        webdavFeedback(form, prompt.resultText({ success: false, code: error.code }), "error");
        return;
      }
      const id = root.STLoggerFactory.createOperationId();
      webdavFeedback(form, "");
      // 原生提交的用户手势在这里传给后台，授予站点权限后才提交凭据进行测试。
      const permission = await request("authorize-webdav", { directory: dav.directory }, id);
      if (!pending()) return;
      if (!permission.success) {
        webdavFeedback(form, prompt.resultText(permission), "error");
        return;
      }
      webdavFeedback(form, tr("settings.cloud.webdavTesting", "正在测试 WebDAV 连接…"));
      const saved = await request("configure-webdav", { dav, channelId: current.id, expectedSession }, id);
      if (!saved.success) {
        if (pending()) webdavFeedback(form, prompt.resultText(saved), "error");
        return;
      }
      password.value = "";
      for (const input of [directory, username, password]) root.STSettingsFields.acceptEdit(input);
      await refresh(shadow, { reason: "configure-webdav", operationId: id });
      const state = view.getSnapshot();
      if (visible() && state.session === expectedSession && state.channel?.dav?.directory === dav.directory
        && state.channel.dav.username === dav.username && !state.failed) {
        webdavFeedback(form, tr("settings.cloud.webdavSaved", "连接已保存，可以开启云同步。"), "success");
      }
    }, message => {
      if (pending()) webdavFeedback(form, message, "error");
    });
    if (invalid && pending()) invalid.focus();
  }

  async function perform(shadow, fn, onFailure) {
    if (!active(shadow) || busy) return;
    busy = true;
    paint(shadow);
    const stamp = openRev;
    try {
      await fn(stamp);
    } catch (error) {
      log.error("settings-cloud-ui-operation-failed", "设置云同步操作失败", { error });
      if (active(shadow, stamp)) {
        const message = tr("settings.cloud.syncFailed", "同步失败，请稍后重试。");
        if (onFailure) onFailure(message);
        else void dialogs().notice(shadow, { message });
      }
    } finally {
      busy = false;
      paint(shadow);
    }
  }

  function dispose(shadow) {
    if (shadow && shadow !== panelShadow) return;
    unmountCardFrame();
    for (const release of releases.splice(0)) release();
    panelShadow = null;
    reportFrameDraft = undefined;
    openRev += 1;
  }

  function bind(shadow, onDraft) {
    if (shadow === panelShadow) return;
    dispose();
    panelShadow = shadow;
    if (onDraft) {
      reportFrameDraft = onDraft;
      const form = shadow.querySelector("[data-cloud-dav-form]");
      const recordEdit = event => {
        if (!event.isTrusted || !event.target.matches("input")) return;
        root.STSettingsFields.recordEdit(event.target);
        reportFrameDraft(true);
      };
      form.addEventListener("input", recordEdit);
      form.addEventListener("change", recordEdit);
      releases.push(() => {
        form.removeEventListener("input", recordEdit);
        form.removeEventListener("change", recordEdit);
      });
    }
    if (!embeddedPage) releases.push(root.STMessageBus.listen("SETTINGS_CLOUD_PROMPT", payload => showPrompt(shadow, payload),
      { owner: "settings:cloud", key: "prompt" }).dispose);
    if (privatePage) releases.push(
      view.subscribe(["channel", "logged", "allowed", "meta", "failed"], () => paint(shadow), { key: "render" }).dispose,
      bus.subscribe(event => refresh(shadow, event), {
        owner: "settings:cloud", key: "state", keys: [
          "steam_buff_auth", "steam_buff_membership", cloud.CHANNEL_KEY, cloud.META_KEY,
        ],
      }).dispose,
    );
    const onChange = event => {
      if (!event.target.matches("[data-cloud-provider]") || (embeddedPage && !event.isTrusted)) return;
      const provider = event.target.value;
      void perform(shadow, stamp => applyAction(shadow, { action: "select-provider", provider }, stamp));
    };
    if (privatePage) {
      const onSubmit = event => {
        if (!event.target.matches("[data-cloud-dav-form]")) return;
        event.preventDefault();
        if (embeddedPage && !event.isTrusted) return;
        void saveWebdav(shadow, event.target);
      };
      shadow.addEventListener("change", onChange);
      shadow.addEventListener("submit", onSubmit);
      releases.push(() => {
        shadow.removeEventListener("change", onChange);
        shadow.removeEventListener("submit", onSubmit);
      });
    }
    root.STRuntime?.current?.()?.registerResource({
      owner: "settings:cloud", key: "ui-bindings", type: "settings-ui", dispose: () => dispose(shadow),
    });
    paint(shadow);
  }

  function handleClick(event, shadow, ctx) {
    const target = event.target.closest("[data-cloud-login],[data-cloud-open],[data-cloud-enabled],[data-cloud-sync],[data-cloud-reset],[data-cloud-devices],[data-cloud-offline]");
    if (!target || target.disabled) return false;
    if (embeddedPage && !event.isTrusted) return true;
    if (target.hasAttribute("data-cloud-login")) {
      ctx?.openCat?.("account") || root.STSettingsMenu?.openCat?.("account");
    } else if (!privatePage) {
      if (event.isTrusted && target.hasAttribute("data-cloud-open")) void perform(shadow, async stamp => {
        const result = await prompt.openSettings();
        if (!result.success && active(shadow, stamp)) void dialogs().notice(shadow, { message: prompt.resultText(result) });
      });
    } else if (embeddedPage && target.matches("[data-cloud-devices],[data-cloud-offline],[data-cloud-reset]")) {
      const intent = target.hasAttribute("data-cloud-devices") ? "devices" : target.hasAttribute("data-cloud-offline") ? "restore" : "reset";
      void perform(shadow, stamp => openCloudConfirmation(shadow, stamp, intent, deviceTarget(view.getSnapshot())));
    } else if (target.hasAttribute("data-cloud-devices")) {
      void openDeviceManager(shadow, target);
    } else if (target.hasAttribute("data-cloud-offline")) {
      void perform(shadow, stamp => chooseRestore(shadow, stamp));
    } else {
      const action = target.hasAttribute("data-cloud-enabled")
        ? (target.getAttribute("aria-checked") === "true" ? "disable" : "enable")
        : (target.hasAttribute("data-cloud-reset") ? "reset" : "sync");
      void perform(shadow, stamp => applyAction(shadow, { action }, stamp));
    }
    return true;
  }

  async function handleCloudConfirmation(shadow, stamp, reply) {
    if (!active(shadow, stamp)) return;
    if (!reply.success) return dialogs().notice(shadow, { message: prompt.resultText(reply) });
    const { intent, channelId, expectedSession, recoveryId } = reply.confirmation;
    await refresh(shadow);
    if (!active(shadow, stamp)) return;
    const state = view.getSnapshot();
    const target = deviceTarget(state);
    if (target.channelId !== channelId || target.expectedSession !== expectedSession) {
      return dialogs().notice(shadow, { message: prompt.resultText({ success: false, code: "channel-changed" }) });
    }
    if (intent === "devices") {
      const trigger = shadow.querySelector("[data-cloud-devices]");
      if (!trigger || trigger.disabled || trigger.hidden) return dialogs().notice(shadow, { message: status(state) });
      return openDeviceManager(shadow, trigger);
    }
    if (intent === "restore") return perform(shadow, current => chooseRestore(shadow, current, state));
    if (intent === "reset") return perform(shadow, current => applyAction(shadow, { action: "reset" }, current, state));
    if (intent === "conflict") return perform(shadow, current => applyAction(shadow, { action: "sync" }, current, state));
    if (intent !== "recovery") throw new Error("云同步确认操作无效");
    return perform(shadow, async current => {
      const label = tr("settings.cloud.downloadRecovery", "保存恢复文件");
      if (await confirm(shadow, label, recoveryNotice(), label) !== "ok" || !active(shadow, current)) return;
      const result = await deviceRequest("new-recovery", target, { recoveryId });
      if (!active(shadow, current)) return;
      const failure = prompt.resultText(result);
      if (failure) return dialogs().notice(shadow, { message: failure });
      saveRecovery(result.recovery);
      return recoveryFollowup(shadow, current, result.recovery, { ...target, channelId: result.channelId });
    });
  }

  async function notifyOpen() {
    const shadow = panelShadow, stamp = ++openRev;
    if (!privatePage) mountCardFrame(shadow);
    try {
      if (privatePage && !embeddedPage && !confirmationRead) {
        confirmationRead = true;
        const requestId = new URL(root.location.href).searchParams.get("cloudRequest");
        if (requestId) {
          const confirmation = await request("take-private-confirmation", { requestId });
          await handleCloudConfirmation(shadow, stamp, confirmation);
          return;
        }
      }
      lifecycleOpen = true;
      const result = await request("sync", { reason: "open-settings" });
      if (result.prompt) await showPrompt(shadow, result.prompt, stamp);
    } catch (error) {
      log.warn("settings-cloud-open-failed", "打开设置时检查云同步失败", { error });
    }
  }

  async function notifyClose() {
    openRev += 1;
    unmountCardFrame();
    const form = panelShadow?.querySelector("[data-cloud-dav-form]");
    if (form) {
      const current = cloudTarget();
      fillWebdav(form, form.dataset.channelId === current?.id ? current?.dav : null);
    }
    if (!lifecycleOpen) return;
    lifecycleOpen = false;
    try {
      await request("sync", { reason: "debounce", settingsClosed: true });
    } catch (error) {
      log.warn("settings-cloud-close-failed", "关闭设置时同步失败", { error });
    }
  }

  const api = Object.freeze({ ready: true, html, htmlSync, preload, refresh, bind, dispose, handleClick, showPrompt, notifyOpen, notifyClose,
    hasFrameDraft: () => cardFrame?.pending === true });
  settings.cloudUi = api;
  root.STSettingsCloudUi = api;
})(globalThis);
