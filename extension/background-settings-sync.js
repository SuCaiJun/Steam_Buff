/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置云同步后台心跳、发网与弹窗投递
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

((root) => {
  "use strict";

  if (root.STBackgroundSettingsSync?.ready) {
    return;
  }

  const CFG = root.STConfig;
  const TYPE = "SETTINGS_CLOUD_SYNC";
  const PROMPT_TYPE = "SETTINGS_CLOUD_PROMPT";
  const ALARM = "steam-buff-settings-cloud";
  const JITTER_ALARM = "steam-buff-settings-cloud-jitter";
  const PERIOD_MIN = 5;
  const JITTER_MAX_MS = 20 * 1000;
  const DEBOUNCE_MS = 45 * 1000;
  const FETCH_TIMEOUT_MS = 15 * 1000;
  const MIN_ALARM_GAP_MS = 4 * 60 * 1000;
  const UPLOAD_PASSES = 8;
  const PROMPT_FILES = Object.freeze([
    "shared/styles/theme.js",
    "shared/utils/dom.js",
    "shared/styles/components.js",
    "shared/dialog-lifecycle.js",
    "settings/settings-cloud-prompt.js",
  ]);
  const log = root.STLoggerFactory.createLogger("background", "settings-cloud");

  let inflight = null;
  let queued = null;
  let debounceTimer = 0;
  let settingsOpen = 0;
  let authClient = null;
  const sessionPrompted = new Set();

  function cloud() {
    return root.STSettingsCloud || root.STSettings?.cloud;
  }

  function storage() {
    return root.STSettings?.storage || null;
  }

  function getAuthClient() {
    if (!authClient) {
      authClient = root.STAuthClient?.createClient?.({
        storage: storage(),
        refreshUrl: CFG.loginAuth("/auth/refresh"),
      }) || null;
    }
    return authClient;
  }

  function opId(value) {
    const text = String(value || "").trim();
    if (text) {
      return text;
    }
    return root.STLoggerFactory?.createOperationId?.() || "";
  }

  function details(operationId, extra = {}) {
    const out = { ...extra };
    if (operationId) {
      out.operationId = operationId;
    }
    return out;
  }

  async function readyAuth(operationId, userId) {
    const client = getAuthClient();
    if (!client) {
      return null;
    }
    return client.readyAuth({
      operationId,
      ownerId: String(userId || ""),
    });
  }

  async function currentUserId() {
    const membership = await storage()?.getMembership?.();
    return String(membership?.userId || "").trim();
  }

  async function sameAccount(userId) {
    const current = await currentUserId();
    return !!userId && current === userId;
  }

  function logOwnerChanged(operationId, reason) {
    log.warn("settings-cloud-owner-changed", "设置云同步时账号已切换，已停止", details(operationId, { reason }));
  }

  function ownerStop(error, operationId, reason) {
    if (error?.code !== "owner-changed") {
      return null;
    }
    logOwnerChanged(operationId, reason);
    return { success: false, reason: "account-changed" };
  }

  // 使用云端、使用本机只接受已保存密钥。另一串不能从这两条路径上传或删除云端
  function lockedSecret(saved, requested) {
    const stored = String(saved || "").trim();
    const typed = String(requested || "").trim();
    if (stored && typed && typed !== stored) {
      return null;
    }
    return stored;
  }

  function rejectSecretMismatch(operationId, reason, stage) {
    const verify = stage === "verify";
    log.warn("settings-cloud-secret-rejected", verify
      ? "候选密钥无法解密已有云端设置，已拒绝"
      : "同步密钥与已保存密钥不一致，已拒绝", details(operationId, { reason, stage }));
    return { success: false, error: "密钥错误", code: "secret-mismatch" };
  }

  async function reportCheckFailure(error, operationId, reason) {
    const status = Number(error?.status) || 0;
    await markChecked({ lastError: error.message || "检查云端设置失败" });
    if (status === 403) {
      log.error("settings-cloud-forbidden", "当前权益不包含设置云同步", details(operationId, { reason, error }));
    } else if (status === 401) {
      log.warn("settings-cloud-unauthorized", "设置云同步登录已失效", details(operationId, { reason, error }));
    } else {
      log.error("settings-cloud-check-failed", "检查云端设置失败", details(operationId, { reason, error }));
    }
    return { success: false, error: error.message || "检查云端设置失败" };
  }

  function asMeta(body) {
    const src = body && typeof body === "object" ? body : {};
    return {
      exists: src.exists === true,
      revision: Number(src.revision) || 0,
      payloadHash: String(src.payloadHash || ""),
      extensionVersion: String(src.extensionVersion || ""),
      updatedAt: String(src.updatedAt || ""),
      payloadBytes: Number(src.payloadBytes) || 0,
      alg: String(src.alg || ""),
      ciphertext: typeof src.ciphertext === "string" ? src.ciphertext : "",
    };
  }

  // userId 是这次操作开始时的账号，令牌必须和这个账号在同一次身份读取里对上，401 刷新也沿用该约束
  async function api(method, url, body, operationId, userId) {
    const client = getAuthClient();
    const ownerId = String(userId || "").trim();
    if (!client || !ownerId) {
      const error = new Error("请先在设置中登录");
      error.status = 401;
      throw error;
    }
    const result = await client.authedRequest(url, {
      method,
      body,
      operationId,
      ownerId,
      timeoutMs: FETCH_TIMEOUT_MS,
      throwOnMissingAuth: true,
      logFailures: false,
      lenientJson: true,
      touchAuth: false,
    });
    if (result.code >= 400) {
      const error = new Error(String(result.body?.message || `HTTP状态码错误: ${result.code}`));
      error.status = result.code;
      error.meta = asMeta(result.body);
      throw error;
    }
    return asMeta(result.body);
  }

  function promptAllowed(urlText) {
    try {
      const url = new URL(String(urlText || ""));
      if (url.protocol === "chrome-extension:" && url.pathname.endsWith("/settings/center.html")) {
        return true;
      }
      const host = url.hostname;
      const match = CFG.matchers;
      if (match.isSteamStoreHost(host) || match.isSteamCheckoutHost(host)) {
        return true;
      }
      return match.isSteamCommunityHost(host) || match.isSteamCommunityLikeHost(host);
    } catch {
      return false;
    }
  }

  function isSettingsTab(tab) {
    try {
      const url = new URL(String(tab?.url || ""));
      return url.protocol === "chrome-extension:" && url.pathname.endsWith("/settings/center.html");
    } catch {
      return false;
    }
  }

  function queryPromptTabs() {
    return new Promise((resolve) => {
      try {
        chrome.tabs.query({
          url: [
            chrome.runtime.getURL("settings/center.html"),
            "https://store.steampowered.com/*",
            "https://checkout.steampowered.com/*",
            "https://steamcommunity.com/*",
            "https://*.steamcommunity.com/*",
          ],
        }, (tabs) => {
          if (chrome.runtime.lastError) {
            resolve([]);
            return;
          }
          resolve((tabs || []).filter((tab) => promptAllowed(tab.url)));
        });
      } catch {
        resolve([]);
      }
    });
  }

  function execFiles(tabId, files) {
    return new Promise((resolve) => {
      try {
        chrome.scripting.executeScript({
          target: { tabId },
          files,
        }, () => {
          resolve(!chrome.runtime.lastError);
        });
      } catch {
        resolve(false);
      }
    });
  }

  function sendTab(tabId, payload) {
    return new Promise((resolve) => {
      try {
        chrome.tabs.sendMessage(tabId, payload, () => {
          resolve(!chrome.runtime.lastError);
        });
      } catch {
        resolve(false);
      }
    });
  }

  function fingerprint(kind, payload) {
    return `${kind}:${payload.reason || ""}:${payload.revision || 0}:${payload.payloadHash || ""}`;
  }

  async function notifyPrompt(kind, payload, options = {}) {
    const force = options.force === true;
    const key = fingerprint(kind, payload);
    if (!force && sessionPrompted.has(key)) {
      return false;
    }
    const tabs = await queryPromptTabs();
    if (!tabs.length) {
      return false;
    }
    const settingsTabs = tabs.filter(isSettingsTab);
    const targets = settingsTabs.length ? settingsTabs : tabs;
    let sent = false;
    for (const tab of targets) {
      if (!tab?.id) {
        continue;
      }
      if (!isSettingsTab(tab)) {
        await execFiles(tab.id, PROMPT_FILES);
      }
      if (await sendTab(tab.id, { type: PROMPT_TYPE, kind, ...payload })) {
        sent = true;
      }
    }
    if (sent) {
      sessionPrompted.add(key);
    }
    return sent;
  }

  async function writeMeta(patch) {
    const apiCloud = cloud();
    const meta = await apiCloud.getMeta();
    return apiCloud.setMeta({ ...meta, ...patch });
  }

  async function markChecked(patch = {}) {
    return writeMeta({ lastCheckedAt: Date.now(), ...patch });
  }

  async function bindSyncedMeta(patch, userId) {
    const apiCloud = cloud();
    const meta = await apiCloud.getMeta();
    return apiCloud.setMeta({
      ...meta,
      ...patch,
      userId: String(userId || meta.userId || ""),
    });
  }

  function downloadMayPrompt(reason) {
    return reason === "open-settings" || reason === "manual" || reason === "resolve";
  }

  // 自动下载看到 dirty 就停。显式使用云端只接受确认时的 editSeq，确认后再加代次仍停
  async function downloadGuard(userId, remote, operationId, reason, seq, acceptedSeq) {
    if (!(await sameAccount(userId))) {
      logOwnerChanged(operationId, reason);
      return { ok: false, result: { success: false, reason: "account-changed" } };
    }
    const meta = await cloud().getMeta();
    const pinned = Number.isInteger(acceptedSeq);
    if (seq === undefined) {
      if (pinned) {
        if (meta.editSeq !== acceptedSeq) {
          return {
            ok: false,
            result: await promptConflict("both-dirty", remote, operationId, downloadMayPrompt(reason)),
          };
        }
        return { ok: true, seq: meta.editSeq };
      }
      if (meta.dirty === true) {
        return {
          ok: false,
          result: await promptConflict("both-dirty", remote, operationId, downloadMayPrompt(reason)),
        };
      }
      return { ok: true, seq: meta.editSeq };
    }
    if (meta.editSeq !== seq || (!pinned && meta.dirty === true)) {
      return {
        ok: false,
        result: await promptConflict("both-dirty", remote, operationId, downloadMayPrompt(reason)),
      };
    }
    return { ok: true, seq };
  }

  async function download(secret, remote, operationId, reason, userId, acceptedSeq) {
    const apiCloud = cloud();
    if (remote.alg && remote.alg !== apiCloud.ALG) {
      const error = new Error("云端设置格式需要升级扩展");
      error.code = "alg";
      throw error;
    }
    const opened = await downloadGuard(userId, remote, operationId, reason, undefined, acceptedSeq);
    if (!opened.ok) {
      return opened.result;
    }
    const packed = await apiCloud.decrypt(remote.ciphertext, secret, remote.alg || apiCloud.ALG);
    const beforeApply = await downloadGuard(userId, remote, operationId, reason, opened.seq, acceptedSeq);
    if (!beforeApply.ok) {
      return beforeApply.result;
    }
    await apiCloud.apply(packed);
    const applied = await downloadGuard(userId, remote, operationId, reason, opened.seq, acceptedSeq);
    if (!applied.ok) {
      return applied.result;
    }
    await bindSyncedMeta({
      revision: remote.revision,
      payloadHash: remote.payloadHash,
      dirty: false,
      editSeq: opened.seq,
      conflict: null,
      decryptBlocked: false,
      lastCheckedAt: Date.now(),
      lastSyncedAt: Date.now(),
      lastError: "",
    }, userId);
    log.info("settings-cloud-download-success", "已从云端拉取设置", details(operationId, {
      reason,
      revision: remote.revision,
      extensionVersion: remote.extensionVersion,
      payloadBytes: remote.payloadBytes,
    }));
    return { success: true, action: "download", revision: remote.revision };
  }

  async function upload(secret, basedOnRevision, force, operationId, reason, userId) {
    const apiCloud = cloud();
    let based = Number(basedOnRevision) || 0;
    let forceFlag = force === true;
    let saved = null;
    let envelope = null;
    // 代次还在变就接着传。超过次数仍保留 dirty，交给下一次同步
    for (let pass = 0; pass < UPLOAD_PASSES; pass += 1) {
      if (!(await sameAccount(userId))) {
        logOwnerChanged(operationId, reason);
        return { success: false, reason: "account-changed" };
      }
      const seq = (await apiCloud.getMeta()).editSeq;
      const packed = await apiCloud.pack();
      if (!(await sameAccount(userId))) {
        logOwnerChanged(operationId, reason);
        return { success: false, reason: "account-changed" };
      }
      envelope = await apiCloud.encrypt(packed, secret);
      if (!(await sameAccount(userId))) {
        logOwnerChanged(operationId, reason);
        return { success: false, reason: "account-changed" };
      }
      saved = await api("PUT", CFG.urls.userSettings, {
        basedOnRevision: based,
        force: forceFlag,
        extensionVersion: apiCloud.localVersion(),
        alg: envelope.alg,
        ciphertext: envelope.ciphertext,
      }, operationId, userId);
      if (!(await sameAccount(userId))) {
        logOwnerChanged(operationId, reason);
        return { success: true, action: "upload", revision: saved.revision, kept: true };
      }
      const after = await apiCloud.getMeta();
      const clean = after.editSeq === seq;
      await bindSyncedMeta({
        revision: saved.revision,
        payloadHash: saved.payloadHash,
        dirty: clean ? false : true,
        editSeq: seq,
        conflict: null,
        decryptBlocked: false,
        lastCheckedAt: Date.now(),
        lastSyncedAt: Date.now(),
        lastError: "",
      }, userId);
      const confirmed = await apiCloud.getMeta();
      if (clean && confirmed.editSeq === seq && confirmed.dirty !== true) {
        log.info("settings-cloud-upload-success", "已上传本机设置到云端", details(operationId, {
          reason,
          revision: saved.revision,
          extensionVersion: saved.extensionVersion,
          payloadBytes: saved.payloadBytes || envelope.payloadBytes,
        }));
        return { success: true, action: "upload", revision: saved.revision };
      }
      log.warn("settings-cloud-upload-stale", "上传期间本地设置又有修改，继续上传", details(operationId, {
        reason,
        revision: saved.revision,
      }));
      based = Number(saved.revision) || based;
      forceFlag = false;
    }
    log.warn("settings-cloud-upload-stale", "上传期间本地设置仍在变化，保留待同步", details(operationId, {
      reason,
      revision: saved?.revision || based,
    }));
    return { success: true, action: "upload", revision: saved?.revision, pending: true };
  }

  async function fetchMeta(operationId, userId) {
    return api("GET", CFG.urls.userSettingsMeta, undefined, operationId, userId);
  }

  async function fetchBody(operationId, userId) {
    return api("GET", CFG.urls.userSettings, undefined, operationId, userId);
  }

  // 立即同步附带的另一串只读解开已有密文。成功后才写入本机密钥，失败不上传、不删除
  async function verifyCandidate(typed, operationId, reason, userId, forcePrompt) {
    let body;
    try {
      body = await fetchBody(operationId, userId);
    } catch (error) {
      const stopped = ownerStop(error, operationId, reason);
      if (stopped) {
        return { result: stopped };
      }
      return { result: await reportCheckFailure(error, operationId, reason) };
    }
    const ciphertext = String(body.ciphertext || "");
    if (body.exists !== true || !ciphertext) {
      return { result: rejectSecretMismatch(operationId, reason, "verify") };
    }
    const apiCloud = cloud();
    try {
      await apiCloud.decrypt(ciphertext, typed, body.alg || apiCloud.ALG);
    } catch (error) {
      if (error?.code === "alg") {
        return { result: await promptUpgrade(body, operationId, forcePrompt) };
      }
      return { result: rejectSecretMismatch(operationId, reason, "verify") };
    }
    const saved = await apiCloud.setSecret(typed);
    if (saved !== true) {
      const error = new Error("同步密钥保存失败");
      log.error("settings-cloud-secret-save-failed", "核对成功但本机同步密钥保存失败", details(operationId, {
        reason,
        error,
      }));
      return { result: { success: false, error: "同步密钥保存失败", code: "secret-save" } };
    }
    log.info("settings-cloud-secret-corrected", "已用云端密文核对并保存本机同步密钥", details(operationId, { reason }));
    return { secret: typed };
  }

  async function promptConflict(reason, remote, operationId, forcePrompt) {
    await writeMeta({
      conflict: "data",
      decryptBlocked: false,
      lastCheckedAt: Date.now(),
      lastError: "",
    });
    log.info("settings-cloud-conflict", "设置云同步出现数据冲突", details(operationId, {
      reason,
      revision: remote.revision,
      extensionVersion: remote.extensionVersion,
      payloadBytes: remote.payloadBytes,
    }));
    await notifyPrompt("conflict", {
      reason,
      revision: remote.revision,
      extensionVersion: remote.extensionVersion,
      payloadHash: remote.payloadHash,
    }, { force: forcePrompt });
    return { success: true, action: "conflict", reason };
  }

  async function promptUpgrade(remote, operationId, forcePrompt) {
    await writeMeta({
      conflict: "upgrade",
      lastCheckedAt: Date.now(),
      lastError: "",
    });
    log.info("settings-cloud-version-low", "本机扩展版本低于云端设置", details(operationId, {
      reason: "version-low",
      revision: remote.revision,
      extensionVersion: remote.extensionVersion,
      payloadBytes: remote.payloadBytes,
    }));
    await notifyPrompt("upgrade", {
      reason: "version-low",
      revision: remote.revision,
      extensionVersion: remote.extensionVersion,
      payloadHash: remote.payloadHash,
    }, { force: forcePrompt });
    return { success: true, action: "upgrade", reason: "version-low" };
  }

  async function promptDecrypt(error, remote, operationId, forcePrompt) {
    const alg = error?.code === "alg";
    if (alg) {
      return promptUpgrade(remote, operationId, forcePrompt);
    }
    await writeMeta({
      decryptBlocked: true,
      conflict: null,
      lastCheckedAt: Date.now(),
      lastError: "密钥错误",
    });
    log.warn("settings-cloud-decrypt-failed", "无法解密云端设置", details(operationId, {
      reason: "decrypt",
      revision: remote.revision,
      extensionVersion: remote.extensionVersion,
      payloadBytes: remote.payloadBytes,
      error,
    }));
    await notifyPrompt("decrypt", {
      reason: "decrypt",
      revision: remote.revision,
      extensionVersion: remote.extensionVersion,
      payloadHash: remote.payloadHash,
    }, { force: forcePrompt });
    return { success: true, action: "decrypt", reason: "decrypt" };
  }

  async function syncNow(input = {}) {
    const apiCloud = cloud();
    if (!apiCloud?.ready) {
      return { success: false, error: "云同步模块未加载" };
    }
    const reason = String(input.reason || "alarm");
    const operationId = opId(input.operationId);
    const forcePrompt = reason === "open-settings" || reason === "manual" || reason === "resolve";
    const auto = reason === "alarm" || reason === "debounce" || reason === "startup";
    const membership = await storage()?.getMembership?.() || null;
    const hasPermission = membership?.permissions?.settingsCloud === true;
    const userId = String(membership?.userId || "").trim();
    // 当前账号未知时不能沿用上一账号通道，否则空云端会把本机残留面板上传到新账号
    if (!userId) {
      if (reason === "manual" || reason === "login") {
        log.info("settings-cloud-skip", "设置云同步当前不可用", details(operationId, { reason }));
      }
      return { success: true, skipped: true, reason: "unavailable" };
    }
    const adopted = await apiCloud.adoptForUser(userId);
    if (adopted.switched) {
      log.info("settings-cloud-account-switched", "设置云同步已断开上一账号通道", details(operationId, { reason }));
    }
    if (!adopted.enabled || !hasPermission) {
      if (!adopted.switched && (reason === "manual" || reason === "login")) {
        log.info("settings-cloud-skip", "设置云同步当前不可用", details(operationId, { reason }));
      }
      return { success: true, skipped: true, reason: "unavailable" };
    }
    let auth;
    try {
      auth = await readyAuth(operationId, userId);
    } catch (error) {
      const stopped = ownerStop(error, operationId, reason);
      if (stopped) {
        return stopped;
      }
      throw error;
    }
    if (!auth?.access_token) {
      if (reason === "manual" || reason === "login") {
        log.info("settings-cloud-skip", "设置云同步当前不可用", details(operationId, { reason }));
      }
      return { success: true, skipped: true, reason: "unavailable" };
    }

    const adoptedSecret = String(adopted.secret || "").trim();
    const typedSecret = String(input.secret || "").trim();
    let secret = adoptedSecret;
    if (adoptedSecret && typedSecret && typedSecret !== adoptedSecret) {
      const verified = await verifyCandidate(typedSecret, operationId, reason, userId, forcePrompt);
      if (verified.result) {
        return verified.result;
      }
      secret = verified.secret;
    }
    const meta = adopted.meta;
    if (reason === "alarm" && meta.lastCheckedAt && (Date.now() - meta.lastCheckedAt) < MIN_ALARM_GAP_MS) {
      return { success: true, skipped: true, reason: "interval" };
    }
    if (!secret) {
      await markChecked({ lastError: "需要同步密钥" });
      return { success: false, error: "需要同步密钥", needSecret: true };
    }

    let remote;
    try {
      remote = await fetchMeta(operationId, userId);
    } catch (error) {
      const stopped = ownerStop(error, operationId, reason);
      if (stopped) {
        return stopped;
      }
      return reportCheckFailure(error, operationId, reason);
    }

    const localPack = await apiCloud.pack();
    const allowEmptyUpload = reason === "manual" || reason === "resolve" || reason === "open-settings"
      || (!adopted.unbound && !adopted.switched);
    const decided = apiCloud.decide({
      enabled: true,
      loggedIn: true,
      hasPermission: true,
      cloud: remote,
      meta,
      localVersion: apiCloud.localVersion(),
      localIsDefault: apiCloud.isDefaultPack(localPack),
      allowEmptyUpload,
    });

    if (decided.action === "skip") {
      await markChecked({ lastError: "", conflict: decided.reason === "unchanged" ? null : meta.conflict });
      return { success: true, skipped: true, reason: decided.reason };
    }

    if (decided.action === "upgrade") {
      return promptUpgrade(remote, operationId, forcePrompt);
    }

    if (decided.action === "decrypt" && auto) {
      await markChecked({});
      return { success: true, skipped: true, action: "decrypt", reason: "decrypt-blocked" };
    }

    if (decided.action === "conflict") {
      if (auto) {
        await markChecked({ conflict: meta.conflict || decided.reason || "data" });
        return { success: true, skipped: true, action: "conflict", reason: decided.reason };
      }
      return promptConflict(decided.reason, remote, operationId, forcePrompt);
    }

    try {
      if (decided.action === "decrypt") {
        const body = await fetchBody(operationId, userId);
        if (body.exists !== true) {
          return await upload(secret, 0, false, operationId, reason, userId);
        }
        if (meta.dirty === true) {
          await apiCloud.decrypt(body.ciphertext, secret, body.alg || apiCloud.ALG);
          return promptConflict("both-dirty", body, operationId, forcePrompt);
        }
        return await download(secret, body, operationId, reason, userId);
      }
      if (decided.action === "upload") {
        return await upload(secret, remote.revision, false, operationId, reason, userId);
      }
      const body = await fetchBody(operationId, userId);
      if (body.exists !== true) {
        return await upload(secret, 0, false, operationId, reason, userId);
      }
      return await download(secret, body, operationId, reason, userId);
    } catch (error) {
      const stopped = ownerStop(error, operationId, reason);
      if (stopped) {
        return stopped;
      }
      const status = Number(error?.status) || 0;
      if (error?.code === "decrypt" || error?.code === "alg") {
        const body = error?.code === "alg" ? remote : (remote.exists ? remote : await fetchBody(operationId, userId).catch((fetchError) => {
          if (fetchError?.code === "owner-changed") {
            throw fetchError;
          }
          return remote;
        }));
        return promptDecrypt(error, body, operationId, forcePrompt);
      }
      if (error?.code === "too-large") {
        await markChecked({ lastError: error.message });
        log.warn("settings-cloud-too-large", "设置体积过大无法上传", details(operationId, { reason, error }));
        return { success: false, error: error.message, code: "too-large" };
      }
      if (status === 409) {
        log.warn("settings-cloud-put-conflict", "上传设置时云端已更新", details(operationId, {
          reason,
          revision: error.meta?.revision,
          extensionVersion: error.meta?.extensionVersion,
          error,
        }));
        return promptConflict("put-409", error.meta || remote, operationId, forcePrompt);
      }
      if (status === 403) {
        await markChecked({ lastError: error.message || "当前权益不包含设置云同步" });
        log.error("settings-cloud-forbidden", "当前权益不包含设置云同步", details(operationId, { reason, error }));
        return { success: false, error: error.message };
      }
      await markChecked({ lastError: error.message || "设置云同步失败" });
      log.error("settings-cloud-sync-failed", "设置云同步失败", details(operationId, { reason, error }));
      return { success: false, error: error.message || "设置云同步失败" };
    }
  }

  async function useCloud(input = {}) {
    const apiCloud = cloud();
    const operationId = opId(input.operationId);
    const userId = await currentUserId();
    const adopted = await apiCloud.adoptForUser(userId);
    const secret = lockedSecret(adopted.secret, input.secret);
    if (secret === null) {
      return rejectSecretMismatch(operationId, "resolve", "locked");
    }
    if (!secret) {
      return { success: false, error: "需要同步密钥", needSecret: true };
    }
    try {
      // 这一代是用户确认要舍弃的修改。拉取期间再改设置会加代次，下载保护会停
      const acceptedSeq = (await apiCloud.getMeta()).editSeq;
      const body = await fetchBody(operationId, userId);
      if (body.exists !== true) {
        return syncNow({ ...input, reason: input.reason || "resolve", action: "sync" });
      }
      sessionPrompted.clear();
      return await download(secret, body, operationId, input.reason || "resolve", userId, acceptedSeq);
    } catch (error) {
      const stopped = ownerStop(error, operationId, "resolve");
      if (stopped) {
        return stopped;
      }
      if (error?.code === "decrypt" || error?.code === "alg") {
        return promptDecrypt(error, error.meta || {}, operationId, true);
      }
      await markChecked({ lastError: error.message || "拉取云端设置失败" });
      log.error("settings-cloud-sync-failed", "使用云端设置失败", details(operationId, {
        reason: "resolve",
        error,
      }));
      return { success: false, error: error.message || "使用云端设置失败" };
    }
  }

  async function useLocal(input = {}) {
    const apiCloud = cloud();
    const operationId = opId(input.operationId);
    const userId = await currentUserId();
    const adopted = await apiCloud.adoptForUser(userId);
    const secret = lockedSecret(adopted.secret, input.secret);
    if (secret === null) {
      return rejectSecretMismatch(operationId, "resolve", "locked");
    }
    if (!secret) {
      return { success: false, error: "需要同步密钥", needSecret: true };
    }
    try {
      let remote = { revision: 0 };
      try {
        remote = await fetchMeta(operationId, userId);
      } catch (error) {
        if (Number(error?.status) !== 404) {
          throw error;
        }
      }
      sessionPrompted.clear();
      return await upload(secret, remote.revision, true, operationId, input.reason || "resolve", userId);
    } catch (error) {
      const stopped = ownerStop(error, operationId, "resolve");
      if (stopped) {
        return stopped;
      }
      await markChecked({ lastError: error.message || "覆盖云端设置失败" });
      log.error("settings-cloud-sync-failed", "使用本机覆盖云端失败", details(operationId, {
        reason: "resolve",
        error,
      }));
      return { success: false, error: error.message || "使用本机覆盖云端失败" };
    }
  }

  async function resetCloud(input = {}) {
    const apiCloud = cloud();
    const operationId = opId(input.operationId);
    const userId = await currentUserId();
    if (!userId) {
      return { success: false, error: "请先登录后再重置云同步" };
    }
    let cloudCleared = false;
    try {
      if (!(await sameAccount(userId))) {
        logOwnerChanged(operationId, "reset");
        return { success: false, reason: "account-changed" };
      }
      await api("DELETE", CFG.urls.userSettings, undefined, operationId, userId);
      cloudCleared = true;
      if (!(await sameAccount(userId))) {
        logOwnerChanged(operationId, "reset");
        return { success: false, reason: "account-changed", cloudCleared: true };
      }
      const cleared = await apiCloud.resetChannel();
      if (cleared !== true) {
        const error = new Error("云端设置已清除，但本地云同步关闭失败");
        log.error("settings-cloud-reset-failed", "云端设置已清除，但本地云同步关闭失败", details(operationId, {
          reason: "reset",
          error,
        }));
        return { success: false, error: error.message, cloudCleared: true };
      }
      sessionPrompted.clear();
      log.info("settings-cloud-reset", "已清除云端设置并关闭本地云同步", details(operationId, { reason: "reset" }));
      return { success: true, action: "reset" };
    } catch (error) {
      const stopped = ownerStop(error, operationId, "reset");
      if (stopped) {
        return stopped;
      }
      if (!cloudCleared) {
        await markChecked({ lastError: error.message || "清除云端设置失败" });
      }
      log.error("settings-cloud-reset-failed", "清除云端设置失败", details(operationId, {
        reason: "reset",
        error,
      }));
      return { success: false, error: error.message || "清除云端设置失败", cloudCleared };
    }
  }

  async function deferConflict() {
    const apiCloud = cloud();
    const meta = await apiCloud.getMeta();
    await apiCloud.setMeta({
      ...meta,
      lastCheckedAt: Date.now(),
    });
    return { success: true, action: "defer" };
  }

  async function execute(input = {}) {
    const action = String(input.action || "sync");
    if (action === "use-cloud") {
      return useCloud(input);
    }
    if (action === "use-local") {
      return useLocal(input);
    }
    if (action === "reset") {
      return resetCloud(input);
    }
    if (action === "defer") {
      return deferConflict();
    }
    return syncNow(input);
  }

  function run(input = {}) {
    const reason = String(input.reason || "alarm");
    const action = String(input.action || "sync");
    const skipQueue = action === "sync" && (reason === "alarm" || reason === "debounce") && input.settingsClosed !== true;
    if (inflight) {
      if (skipQueue) {
        return Promise.resolve({ success: true, skipped: true });
      }
      queued = input;
      return inflight.then(() => {
        if (queued !== input) {
          return { success: true, skipped: true };
        }
        queued = null;
        return run(input);
      });
    }
    inflight = execute(input).finally(() => {
      inflight = null;
    });
    return inflight;
  }

  function scheduleDebounce() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = 0;
      run({ reason: "debounce", action: "sync" });
    }, DEBOUNCE_MS);
  }

  function handleMessage(request, sender, sendResponse) {
    const reason = String(request?.reason || "manual");
    if (reason === "open-settings") {
      settingsOpen += 1;
    }
    if (request?.settingsClosed === true && settingsOpen > 0) {
      settingsOpen -= 1;
    }
    run({
      reason,
      action: request?.action || "sync",
      secret: request?.secret,
      operationId: request?.operationId,
      settingsClosed: request?.settingsClosed === true,
    }).then((result) => {
      sendResponse({ success: result?.success !== false, ...result });
    }).catch((error) => {
      sendResponse({ success: false, error: error?.message || String(error) });
    });
  }

  function markStorageDirty(apiCloud) {
    return apiCloud.markDirty().then((dirty) => {
      if (dirty && settingsOpen > 0) {
        scheduleDebounce();
      }
    }).catch((error) => {
      log.warn("settings-cloud-dirty-failed", "标记设置云同步改动失败", { error });
    });
  }

  function bindStorage() {
    const apiCloud = cloud();
    if (root.STSettingsBus?.subscribe && apiCloud) {
      const localeKey = root.STSettings?.storage?.UI_LOCALE_KEY || "SETTING_UI_LOCALE";
      root.STSettingsBus.subscribe((event) => {
        const keys = Array.isArray(event?.changedKeys) ? event.changedKeys : [];
        if (!keys.some((key) => apiCloud.isSyncedKey(key))) {
          return;
        }
        // 云端应用自己发出的设置总线事件不能被当成本地新编辑；应用期间其他事件仍会递增 editSeq。
        if (event?.owner === "settings:storage" && event?.reason === "settings-cloud-apply") {
          return;
        }
        void markStorageDirty(apiCloud);
      }, {
        owner: "background:settings-cloud",
        key: "dirty-tracker",
        keys: [localeKey],
        prefixes: ["st.settings."],
      });
      return;
    }
    if (!chrome.storage?.onChanged) {
      return;
    }
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") {
        return;
      }
      if (!apiCloud || apiCloud.isApplying()) {
        return;
      }
      const keys = Object.keys(changes || {});
      if (!keys.some((key) => apiCloud.isSyncedKey(key))) {
        return;
      }
      void markStorageDirty(apiCloud);
    });
  }

  function ensureAlarm() {
    if (!chrome.alarms?.create) {
      return;
    }
    chrome.alarms.get(ALARM, (existing) => {
      if (existing) {
        return;
      }
      chrome.alarms.create(ALARM, { periodInMinutes: PERIOD_MIN });
    });
  }

  function handleAlarm(alarm) {
    if (alarm?.name === ALARM) {
      const delayMin = Math.max(0.01, Math.random() * (JITTER_MAX_MS / 60000));
      chrome.alarms.create(JITTER_ALARM, { delayInMinutes: delayMin });
      return;
    }
    if (alarm?.name === JITTER_ALARM) {
      run({ reason: "alarm", action: "sync" });
    }
  }

  bindStorage();
  ensureAlarm();
  chrome.alarms?.onAlarm?.addListener(handleAlarm);
  chrome.runtime.onStartup.addListener(() => {
    run({ reason: "startup", action: "sync" });
  });

  root.STBackgroundSettingsSync = Object.freeze({
    ready: true,
    TYPE,
    PROMPT_TYPE,
    handleMessage,
    run,
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
