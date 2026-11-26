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

  const cloud = root.STSettingsCloud;
  const config = root.STConfig;
  const vault = root.STSettingsVault;
  const data = root.STSettingsCloudData;
  const remotes = root.STSettingsCloudRemotes;
  const ALARM = "steam-buff-settings-cloud";
  const JITTER_ALARM = "steam-buff-settings-cloud-jitter";
  const PERIOD_MIN = 5;
  const JITTER_MAX_MS = 20 * 1000;
  const MIN_ALARM_GAP_MS = 4 * 60 * 1000;
  const DEBOUNCE_MS = 45 * 1000;
  const PROMPT_FILES = [
    "shared/styles/theme.js", "shared/utils/dom.js", "shared/styles/components.js",
    "shared/dialog-lifecycle.js", "settings/settings-cloud-prompt.js",
  ];
  const log = root.STLoggerFactory.createLogger("background", "settings-cloud");
  const storage = root.STSettings.storage;

  let operations = Promise.resolve();
  let metaWrites = Promise.resolve();
  let waiting = 0;
  let editClock = 0;
  let migrated = false;
  let debounceTimer = 0;
  let settingsOpen = 0;
  let lastPrompt = "";

  function auto(input) {
    return ["alarm", "debounce", "startup", "login"].includes(input.reason);
  }

  function serialMeta(task) {
    const next = metaWrites.then(task, task);
    metaWrites = next;
    return next;
  }

  async function identity() {
    const value = await storage.getAuthIdentity({ strict: true, withSettingsCloud: true });
    return { ...value, sessionKey: root.STAuthSession.authKey(value.auth) };
  }

  async function context(input, { allowDisabled = false, requirePermission = true } = {}) {
    const who = await identity();
    if (!who.sessionKey || !who.userId) {
      if (input.action === "sync" && input.reason !== "manual") return null;
      throw cloud.error("login-required", "请先在设置中登录");
    }
    const stored = await cloud.readChannel({ credentials: true });
    const session = await root.STAuthSession.fingerprint(who.auth);
    const channel = stored.channel?.userId === who.userId && stored.channel.session === session ? stored.channel : null;
    const expectedId = stored.channel?.id ?? null;
    if (Object.hasOwn(input, "expectedSession") && input.expectedSession !== session) {
      throw cloud.error("owner-changed", "登录账号已变化，请重新操作");
    }
    if (Object.hasOwn(input, "channelId") && input.channelId !== (channel?.id ?? null)) {
      throw cloud.error("channel-changed", "备份位置已变化，请重新操作");
    }
    if (!allowDisabled && (!channel?.enabled || !who.settingsCloud)) {
      if (input.action === "sync" && input.reason !== "manual") return null;
      throw cloud.error("unavailable", "请先开启云同步并确认当前权益");
    }
    if (requirePermission && !who.settingsCloud) {
      throw cloud.error("no-entitlement", "当前权益不包含设置云同步");
    }
    const ctx = {
      channel, session, userId: who.userId, sessionKey: who.sessionKey, operationId: input.operationId,
      async check() {
        const [{ channel: actual, meta }, current] = await Promise.all([cloud.readChannel(), identity()]);
        if (current.sessionKey !== who.sessionKey || current.userId !== who.userId) {
          throw cloud.error("owner-changed", "登录账号已变化，请重新操作");
        }
        if (requirePermission && !current.settingsCloud) {
          throw cloud.error("no-entitlement", "当前权益不包含设置云同步");
        }
        if ((actual?.id ?? null) !== expectedId) {
          throw cloud.error("channel-changed", "备份位置已变化，请重新操作");
        }
        return channel ? meta : cloud.emptyMeta();
      },
    };
    await ctx.check();
    return ctx;
  }

  function changeMeta(ctx, update) {
    return serialMeta(async () => {
      const meta = await ctx.check();
      const next = update(meta);
      await cloud.saveMeta(ctx.channel.id, next);
      return next;
    });
  }

  function commitChannel(ctx, update) {
    return serialMeta(async () => {
      await ctx.check();
      const channel = { ...update, id: root.crypto.randomUUID(), userId: ctx.userId, session: ctx.session };
      await cloud.saveChannel(channel);
      lastPrompt = "";
      return channel;
    });
  }

  function requestRemote(ctx) {
    if (ctx.channel.provider === "official") return remotes.official(ctx);
    if (ctx.channel.dav) return remotes.webdav(ctx, ctx.channel.dav);
    throw cloud.error("webdav-config", "请先测试并保存 WebDAV 连接");
  }

  function selectedBackup(ctx) {
    return ctx.channel ? ctx : { ...ctx, channel: { provider: "official" } };
  }

  function shouldUpgrade(remote) {
    return remote.exists && (remote.requiresUpgrade === true
      || cloud.compareVersion(cloud.localVersion(), remote.extensionVersion) < 0);
  }

  function sameRemote(left, right) {
    return left.revision === right.revision && left.payloadHash === right.payloadHash
      && left.extensionVersion === right.extensionVersion;
  }

  function checked(patch = {}) {
    return { lastCheckedAt: Date.now(), lastError: "", ...patch };
  }

  async function synced(ctx, remote, atEdit, action) {
    const meta = await changeMeta(ctx, current => ({
      ...current, ...checked(),
      revision: remote.revision, payloadHash: remote.payloadHash, extensionVersion: remote.extensionVersion,
      dirty: editClock !== atEdit, lastSyncedAt: Date.now(), conflict: null, pending: null,
    }));
    if (action !== "unchanged") {
      log.info(action === "upload" ? "settings-cloud-upload-success" : "settings-cloud-download-success",
        action === "upload" ? "已写入远端设置备份" : "已恢复远端设置备份",
        { operationId: ctx.operationId, provider: ctx.channel.provider, payloadBytes: remote.payloadBytes, pending: meta.dirty });
    }
    return { success: true, action, pending: meta.dirty };
  }

  function tabsCall(invoke) {
    return new Promise((resolve, reject) => {
      invoke(value => {
        if (root.chrome.runtime.lastError) reject(new Error(root.chrome.runtime.lastError.message));
        else resolve(value);
      });
    });
  }

  function settingsTab(tab) {
    return String(tab.url || "").split(/[?#]/, 1)[0] === root.chrome.runtime.getURL("settings/center.html");
  }

  // 手动操作由发起它的设置窗口显示回执；后台继续沿用商店/社区的冲突通知范围
  async function notifyPrompt(payload, key, operationId) {
    if (lastPrompt === key || !root.chrome.tabs?.query) return;
    try {
      const tabs = await tabsCall(done => root.chrome.tabs.query({ url: [
        root.chrome.runtime.getURL("settings/center.html"), "https://store.steampowered.com/*",
        "https://checkout.steampowered.com/*", "https://steamcommunity.com/*", "https://*.steamcommunity.com/*",
      ] }, done));
      const candidates = tabs.filter(tab => Number.isInteger(tab.id) && tab.id >= 0);
      const target = candidates.find(settingsTab) || candidates.find(tab => tab.active) || candidates[0];
      if (!target) return;
      const privateTab = settingsTab(target);
      if (!privateTab) {
        await tabsCall(done => root.chrome.scripting.executeScript({ target: { tabId: target.id }, files: PROMPT_FILES }, done));
      }
      const message = privateTab ? payload : { kind: payload.kind };
      await tabsCall(done => root.chrome.tabs.sendMessage(target.id, { type: "SETTINGS_CLOUD_PROMPT", ...message }, done));
      lastPrompt = key;
    } catch (error) {
      // 备份状态已保存，打开设置仍可处理。页面关闭只影响当次投递
      log.warn("settings-cloud-prompt-delivery-failed", "云同步提示投递失败", { error, operationId });
    }
  }

  async function conflict(ctx, remote, input, { notify = false } = {}) {
    if (!remote.exists) {
      await changeMeta(ctx, meta => ({ ...meta, ...checked(), conflict: "remote-deleted", pending: null }));
      return { success: true, action: "remote-deleted" };
    }
    const upgrade = shouldUpgrade(remote);
    const kind = upgrade ? "upgrade" : "conflict";
    const saved = await changeMeta(ctx, meta => {
      const sameDecision = meta.pending && meta.pending.editSeq === meta.editSeq && sameRemote(meta.pending, remote);
      const pending = upgrade ? null : (sameDecision ? meta.pending : {
        ticket: root.crypto.randomUUID(), revision: remote.revision,
        payloadHash: remote.payloadHash, extensionVersion: remote.extensionVersion, editSeq: meta.editSeq,
      });
      return { ...meta, ...checked(), conflict: upgrade ? "upgrade" : "data", pending };
    });
    const prompt = { kind, ticket: saved.pending?.ticket, channelId: ctx.channel.id };
    if ((notify || upgrade || input.reason === "login") && auto(input) && !input.settingsClosed) {
      await notifyPrompt(prompt, prompt.ticket || ctx.channel.id + ":upgrade:" + remote.extensionVersion, ctx.operationId);
    }
    return { success: true, action: kind, prompt };
  }

  function beforeWrite(ctx, atEdit) {
    return async () => {
      await ctx.check();
      if (editClock !== atEdit) throw cloud.error("local-changed", "云同步期间本机数据已变化");
    };
  }

  async function readVault(ctx, adapter, remote, device, recovery = false) {
    const body = remote.bundle ? remote : await adapter.read();
    if (!sameRemote(body, remote) || !body.exists || shouldUpgrade(body)) {
      throw Object.assign(cloud.error("remote-changed", "读取时远端备份已变化"), { remote: body });
    }
    const { document, payload } = vault.decodeDocument(body.bundle);
    if (body.bundle.extensionVersion !== body.extensionVersion || payload.length !== body.payloadBytes || await cloud.hash(payload) !== body.payloadHash)
      throw vault.invalid();
    return vault.openRemote(ctx, document, device, recovery);
  }

  async function publish(ctx, adapter, prior, header, content, device, atEdit) {
    const next = { ...header, sequence: header.sequence + 1 };
    const document = await vault.seal(next, content);
    const bundle = vault.encodeDocument(document);
    const digest = await cloud.hash(vault.decodeDocument(bundle).payload);
    const opened = await vault.open(document, { ...device, vaultId: next.vaultId, rootKey: next.rootKey }, ctx.userId);
    await beforeWrite(ctx, atEdit)();
    const saved = await adapter.put(prior.revision, bundle, () => editClock === atEdit);
    if (saved.payloadHash !== digest || saved.extensionVersion !== bundle.extensionVersion) throw vault.invalid();
    return { saved, opened };
  }

  async function cached(ctx, device) {
    // 本机缓存是上次实际应用的内容，版本比较仍以当前远端验签为准
    return device.document ? vault.open(device.document, { ...device, seen: undefined }, ctx.userId) : null;
  }

  async function applySettings(ctx, checkedSettings, guard) {
    const ok = await root.STSettings.panelSnapshot.write(checkedSettings.panel, {
      reason: "settings-cloud-apply", operationId: ctx.operationId, beforeCloudWrite: guard, reportSections: true,
      cloudCredentials: checkedSettings.credentials,
    });
    if (ok !== true) throw cloud.error("apply-failed", "恢复设置没有完成");
  }

  async function writeChanges(ctx, adapter, remote, input, device, incoming, baseline) {
    const atEdit = editClock;
    const meta = await serialMeta(() => ctx.check());
    const guard = beforeWrite(ctx, atEdit);
    const selected = input.action === "use-local" || input.action === "use-cloud" ? input.action : "";
    const preceding = baseline?.data.settings;
    const local = preceding && !meta.dirty && meta.revision !== null ? preceding : await data.captureSettings();
    const received = incoming.data.settings;
    const verified = await data.unpackSettings(received);
    await vault.remember(ctx, device, incoming, false);
    const localChanged = !data.settingsEqual(local, preceding ?? received);
    const remoteChanged = !preceding || !data.settingsEqual(received, preceding);
    const settingConflict = localChanged && remoteChanged && !data.settingsEqual(local, received);
    if (settingConflict && !selected) return conflict(ctx, remote, input);
    const useRemote = settingConflict ? selected === "use-cloud" : remoteChanged && !localChanged;
    const settings = useRemote ? received : local;
    const checkedSettings = useRemote && !data.settingsEqual(local, received) ? verified : null;
    const store = root.STAchievementTranslationStore;
    await store.claimCloud(ctx.userId, meta.revision === null);
    const plan = await data.achievementPlan(adapter, incoming.header, baseline?.data.achievements ?? {}, incoming.data.achievements, selected, guard);
    if (plan.conflict && !selected) return conflict(ctx, remote, input);
    await guard();
    let result = { saved: remote, opened: incoming };
    const upload = !data.settingsEqual(settings, received) || plan.upload;
    if (upload) {
      const achievements = await data.publishAchievements(adapter, incoming.header, plan, () => editClock === atEdit);
      result = await publish(ctx, adapter, remote, incoming.header, { ...incoming.data, settings, achievements }, device, atEdit);
    }
    if (upload && !checkedSettings && !plan.changes.length) {
      // 上传完成后收到的本机修改保留为待上传状态。这里没有需要回写的本机业务数据
      await vault.remember(ctx, device, result.opened);
      return synced(ctx, result.saved, atEdit, "upload");
    }
    if (checkedSettings || plan.changes.length) {
      await guard();
      // 中途失败时保留冲突状态，避免下一轮把只恢复了一部分的本机数据误当作完整设置上传
      await changeMeta(ctx, current => ({ ...current, conflict: "applying", pending: null }));
      if (checkedSettings) await applySettings(ctx, checkedSettings, guard);
      await guard();
      await store.cloudApply(ctx.userId, plan.changes);
    }
    await guard();
    await vault.remember(ctx, device, result.opened);
    return synced(ctx, result.saved, atEdit, upload ? "upload" : (checkedSettings || plan.changes.length ? "download" : "unchanged"));
  }

  async function startVault(ctx, adapter, remote, device, input) {
    const atEdit = editClock;
    const store = root.STAchievementTranslationStore;
    const document = device.latest ?? device.document;
    const previous = document ? await vault.openRemote(ctx, document, device) : null;
    await store.claimCloud(ctx.userId, true);
    const baseline = await cached(ctx, device);
    const initial = previous ?? await vault.create(ctx, device);
    const guard = beforeWrite(ctx, atEdit);
    const settings = await data.captureSettings();
    const plan = await data.achievementPlan(adapter, initial.header, baseline?.data.achievements ?? {}, initial.data.achievements ?? {}, "use-local", guard);
    const achievements = await data.publishAchievements(adapter, initial.header, plan, () => editClock === atEdit);
    const result = await publish(ctx, adapter, remote, initial.header, { ...initial.data, settings, achievements }, device, atEdit);
    // 先保留新身份。即使后面的本地回执失败，本机也能再次解开已发布的备份
    await vault.remember(ctx, initial.recovery ? { ...device, pendingRecovery: initial.recovery } : device, result.opened);
    await guard();
    await store.cloudApply(ctx.userId, plan.changes);
    const status = await synced(ctx, result.saved, atEdit, "upload");
    if (input.action !== "enable" || !initial.recovery) return status;
    const recovery = input.embedded ? { pendingRecoveryId: initial.recovery.kid } : { recovery: initial.recovery };
    return { ...status, ...recovery, channelId: ctx.channel.id };
  }

  async function sync(ctx, adapter, input) {
    const atEdit = editClock;
    const meta = await serialMeta(() => ctx.check());
    const known = meta.revision === null ? null : {
      revision: meta.revision, payloadHash: meta.payloadHash, extensionVersion: meta.extensionVersion,
    };
    const remote = await adapter.check(known);
    if (!remote.exists) {
      if (input.action !== "enable" && !(await vault.readDevice(ctx))?.draft) return conflict(ctx, remote, input);
      return startVault(ctx, adapter, remote, await vault.newDevice(ctx), input);
    }
    if (shouldUpgrade(remote) || ["data", "applying"].includes(meta.conflict)) return conflict(ctx, remote, input);
    const device = await vault.readDevice(ctx);
    if (!device) throw cloud.error("vault-device", "请先生成配对请求并在已授权设备确认");
    if (!meta.dirty && editClock === atEdit && device.document && known && sameRemote(known, remote)
      && !(await root.STAchievementTranslationStore.cloudPending(ctx.userId)).size) {
      return synced(ctx, remote, atEdit, "unchanged");
    }
    const incoming = await readVault(ctx, adapter, remote, device);
    return writeChanges(ctx, adapter, remote, input, device, incoming, await cached(ctx, device));
  }

  async function resolve(ctx, adapter, input) {
    await metaWrites;
    const { pending } = await ctx.check();
    if (!pending || input.ticket !== pending.ticket) {
      throw cloud.error("stale-prompt", "同步提示已失效，请重新同步");
    }
    const remote = await adapter.check();
    await metaWrites;
    if (!sameRemote(pending, remote) || !remote.exists || shouldUpgrade(remote)
      || (await ctx.check()).editSeq !== pending.editSeq || editClock !== input.atEdit) {
      return conflict(ctx, remote, input);
    }
    const device = await vault.readDevice(ctx);
    if (!device) throw cloud.error("vault-device", "请先生成配对请求并在已授权设备确认");
    const incoming = await readVault(ctx, adapter, remote, device);
    await beforeWrite(ctx, input.atEdit)();
    return writeChanges(ctx, adapter, remote, input, device, incoming, await cached(ctx, device));
  }

  async function pairApproved(ctx, adapter, remote, device) {
    if (!device?.request || device.vaultId) return false;
    try {
      await readVault(ctx, adapter, remote, device);
      return true;
    } catch (error) {
      if (error?.code === "vault-device" || error?.code === "vault-pair") return false;
      throw error;
    }
  }

  // 只读取当前备份位置的状态，恢复文件继续通过原有下载操作交付
  async function deviceStatus(ctx) {
    const target = selectedBackup(ctx);
    const device = await vault.readDevice(target);
    const pendingRecoveryId = device?.pendingRecovery?.kid ?? null;
    try {
      const adapter = requestRemote(target);
      if (target.channel.provider === "webdav") await remotes.verifyEntitlement(ctx);
      const remote = await adapter.check();
      if (shouldUpgrade(remote)) throw cloud.error("vault-upgrade", "云端设置来自更高版本扩展");
      let deviceState = "empty";
      if (remote.exists) {
        deviceState = device?.vaultId ? "authorized" : await pairApproved(target, adapter, remote, device) ? "approved" : "unpaired";
      }
      return { success: true, action: "device-status", deviceState, pendingRecoveryId };
    } catch (cause) {
      if (!pendingRecoveryId || ["owner-changed", "channel-changed", "no-entitlement"].includes(cause?.code)) throw cause;
      await ctx.check();
      throw Object.assign(new Error("读取设备管理状态失败", { cause }), {
        name: cause?.name, code: cause?.code, status: cause?.status, pendingRecoveryId,
      });
    }
  }

  async function manageDevice(ctx, adapter, input) {
    const { action } = input;
    const atEdit = editClock;
    const remote = await adapter.check();
    if (!remote.exists) throw cloud.error("vault-missing", "当前备份位置没有可用的加密备份");
    if (shouldUpgrade(remote)) return conflict(ctx, remote, input);
    if (action === "pair-request") {
      const device = await vault.readDevice(ctx);
      if (device?.draft) {
        try {
          const opened = await readVault(ctx, adapter, remote, device);
          await vault.remember(ctx, device, opened, false);
          if (opened.header.vaultId === device.draft.header.vaultId)
            return { success: true, action, recovery: device.draft.recovery, channelId: ctx.channel.id };
          throw cloud.error("vault-authorized", "当前浏览器已经获得授权");
        } catch (error) {
          if (!["vault-device", "vault-pair"].includes(error.code)) throw error;
        }
      }
      if (await pairApproved(ctx, adapter, remote, device)) return { success: true, action, pairingApproved: true };
      // 在有效期内再次打开时沿用同一请求，避免覆盖另一端正在确认的凭据
      if (!device?.vaultId && device?.request?.expires > Date.now()) return { success: true, action, pair: device.request };
      const pair = await vault.pairRequest(ctx);
      return { success: true, action, pair };
    }
    const device = await (action === "recover-device" ? vault.newDevice(ctx) : vault.readDevice(ctx));
    if (action !== "recover-device" && !device?.vaultId)
      throw cloud.error("vault-device", "请先用已授权设备确认配对");
    if (action === "recover-device" && input.recovery?.owner !== ctx.userId)
      throw cloud.error("owner-changed", "所选恢复文件属于其他账号");
    const recoveryDevice = action === "recover-device" ? await vault.recoveryDevice(input.recovery) : null;
    const incoming = await readVault(ctx, adapter, remote, recoveryDevice ? { ...recoveryDevice, seen: device.seen } : device, !!recoveryDevice);
    if (device.vaultId && device.vaultId !== incoming.header.vaultId) throw vault.invalid();
    if (action === "export-archive") return { success: true, action, archive: await data.exportArchive(adapter, incoming) };

    let members = incoming.data.members;
    let recovery;
    if (action === "approve-device") {
      const member = await vault.parsePair(input.pair, ctx.userId);
      const old = members[input.pair.kid];
      if (input.pair.kid === device.id || old?.recovery) throw vault.invalid();
      if (old?.proof === member.proof) return { success: true, action };
      members = { ...members, [input.pair.kid]: member };
    } else if (action === "new-recovery") {
      const added = await vault.recoveryRecipient(incoming.header, members);
      members = added.members;
      recovery = added.file;
    } else {
      members = { ...members, [device.id]: { key: device.publicKey } };
      await vault.remember(ctx, device, incoming, false);
    }
    const result = await publish(ctx, adapter, remote, incoming.header, { ...incoming.data, members }, device, atEdit);
    await vault.remember(ctx, recovery ? { ...device, pendingRecovery: recovery } : device, result.opened, false);
    return { success: true, action, ...(recovery && { recovery, channelId: ctx.channel.id }) };
  }

  function restoreGuard(owner, sessionKey, atEdit) {
    return async () => {
      const current = await identity();
      if ((current.userId && current.userId !== owner) || current.sessionKey !== sessionKey)
        throw cloud.error("owner-changed", "恢复文件属于其他账号，或登录状态已变化");
      if (editClock !== atEdit) throw cloud.error("local-changed", "恢复期间本机数据已变化");
    };
  }

  async function applyRestore(input, reader, opened, guard, source) {
    await guard();
    const settings = await data.unpackSettings(opened.data.settings);
    const store = root.STAchievementTranslationStore;
    const plan = await data.achievementPlan(reader, opened.header, {}, opened.data.achievements, "use-cloud", guard);
    await guard();
    if (source) await vault.rememberRestore(source, opened);
    const channel = source ? source.channel : (await cloud.readChannel()).channel;
    if (channel?.enabled) {
      const ctx = source ?? await context({ ...input, channelId: channel.id }, { allowDisabled: true, requirePermission: false });
      await commitChannel(ctx, { ...ctx.channel, enabled: false });
    }
    await guard();
    try {
      await applySettings(input, settings, guard);
    } catch (cause) {
      const code = cause?.savedSections?.length ? "restore-settings-partial" : "restore-settings-interrupted";
      throw Object.assign(new Error("本机设置恢复中断", { cause }), { code });
    }
    try {
      await guard();
      await store.cloudApply(opened.header.owner, plan.changes, { claim: true });
    } catch (cause) {
      throw Object.assign(new Error("本机设置已恢复，成就译文恢复中断", { cause }), { code: "restore-achievements-interrupted" });
    }
    return { success: true, action: input.action };
  }

  async function restoreArchive(input) {
    const started = await identity();
    if (Object.hasOwn(input, "expectedSession")) {
      const session = started.sessionKey ? await root.STAuthSession.fingerprint(started.auth) : "";
      if (session !== input.expectedSession) throw cloud.error("owner-changed", "登录状态已变化，请重新打开恢复备份");
    }
    const reader = data.archiveReader(input.archive);
    const { document } = input.archive;
    const fromFile = input.recovery !== undefined;
    const { owner, device } = fromFile
      ? { owner: input.recovery?.owner, device: await vault.recoveryDevice(input.recovery) }
      : await vault.findArchiveDevice(document, started.userId);
    const guard = restoreGuard(owner, started.sessionKey, input.atEdit);
    await guard();
    if (!device) return { success: false, code: "vault-recovery-required" };
    // 手动选取的离线文件可以是较旧的备份。仍须验签，并且不清除已记录的云端版本。
    const opened = await vault.open(document, { ...device, seen: undefined }, owner, fromFile);
    return applyRestore(input, reader, opened, guard);
  }

  async function restoreRemote(ctx, input) {
    const guard = restoreGuard(ctx.userId, ctx.sessionKey, input.atEdit);
    if (input.recovery?.owner !== ctx.userId) throw cloud.error("owner-changed", "恢复文件属于其他账号");
    const recovery = await vault.recoveryDevice(input.recovery);
    const target = selectedBackup(ctx);
    const adapter = requestRemote(target);
    if (target.channel.provider === "webdav") await remotes.verifyEntitlement(ctx);
    const remote = await adapter.check();
    if (!remote.exists) throw cloud.error("vault-missing", "所选位置没有可用的加密备份");
    if (shouldUpgrade(remote)) throw cloud.error("vault-upgrade", "云端设置来自更高版本扩展");
    const device = await vault.readDevice(target);
    if (device?.vaultId && (device.vaultId !== recovery.vaultId || cloud.canonical(device.rootKey) !== cloud.canonical(recovery.rootKey)))
      throw vault.invalid();
    const opened = await readVault(target, adapter, remote, { ...recovery, seen: device?.seen }, true);
    return applyRestore(input, adapter, opened, guard, target);
  }

  async function deleteBackup(ctx, adapter, input) {
    const remote = await adapter.check();
    if (remote.exists) await adapter.remove(remote.revision);
    try {
      await commitChannel(ctx, { provider: ctx.channel.provider, dav: ctx.channel.dav ?? null, enabled: false });
    } catch (cause) {
      throw Object.assign(new Error("远端备份已删除，本机同步状态更新失败", { cause }),
        { code: "delete-partial", cloudCleared: true });
    }
    log.info("settings-cloud-delete-success", "已删除远端备份", { operationId: input.operationId, provider: ctx.channel.provider });
    return { success: true, action: "reset" };
  }

  async function synchronize(ctx, adapter, input) {
    try {
      if (input.action === "use-local" || input.action === "use-cloud") return await resolve(ctx, adapter, input);
      return await sync(ctx, adapter, input);
    } catch (error) {
      if (["remote-changed", "local-changed"].includes(error?.code)) {
        const remote = error.remote ?? await adapter.check();
        return conflict(ctx, remote, input, { notify: true });
      }
      throw error;
    }
  }

  async function execute(input) {
    let ctx, adapter;
    let accessVerified = false;
    try {
      if (!migrated) {
        const removed = await cloud.removeLegacy();
        migrated = true;
        if (removed) log.info("settings-cloud-v1-cleared", "已清理本机旧版云同步状态", { operationId: input.operationId });
      }
      if (input.action === "migrate") return { success: true };
      if (input.action === "restore-archive") return await restoreArchive(input);
      ctx = await context(input, { allowDisabled: CONFIG_ACTIONS.includes(input.action), requirePermission: input.action !== "disable" });
      if (!ctx) return { success: true, skipped: true, reason: "unavailable" };
      if (input.action === "restore-remote") return await restoreRemote(ctx, input);
      if (input.action === "device-status") return await deviceStatus(ctx);
      if (input.action === "new-recovery" && Object.hasOwn(input, "recoveryId")) {
        const recovery = (await vault.readDevice(selectedBackup(ctx)))?.pendingRecovery;
        await ctx.check();
        if (typeof input.recoveryId !== "string" || !recovery || input.recoveryId !== recovery.kid)
          throw cloud.error("recovery-changed", "待保存的恢复文件已变化，请重新打开设备管理");
        return { success: true, action: input.action, recovery, channelId: ctx.channel?.id ?? null };
      }
      if (input.action === "select-provider") {
        if (!cloud.PROVIDERS.includes(input.provider)) throw cloud.error("provider-invalid", "请选择有效的备份位置");
        if (ctx.channel?.provider !== input.provider) {
          await commitChannel(ctx, { provider: input.provider, enabled: false, dav: ctx.channel?.dav ?? null });
        }
        return { success: true, action: input.action };
      }
      if (input.action === "disable") {
        if (ctx.channel?.enabled) {
          await commitChannel(ctx, { ...ctx.channel, enabled: false });
          log.info("settings-cloud-disabled", "已关闭设置云同步", { operationId: input.operationId, provider: ctx.channel.provider });
        }
        return { success: true, action: input.action };
      }
      if (input.action === "configure-webdav") {
        if (ctx.channel?.provider !== "webdav") throw cloud.error("channel-changed", "请先选择 WebDAV 作为备份位置");
        const dav = cloud.webdavConfig(input.dav);
        await remotes.verifyEntitlement(ctx);
        await remotes.testWebdav(ctx, dav);
        await commitChannel(ctx, { provider: "webdav", dav, enabled: false });
        log.info("settings-cloud-webdav-configured", "WebDAV 连接测试通过并已保存", { operationId: input.operationId });
        return { success: true, action: input.action };
      }
      if (input.action === "enable") {
        if (ctx.channel?.enabled || input.consent !== true) throw cloud.error("consent-required", "请确认备份隐私说明后开启云同步");
        const provider = ctx.channel?.provider || "official";
        if (provider === "webdav" && !ctx.channel?.dav) throw cloud.error("webdav-config", "请先测试并保存 WebDAV 连接");
        await remotes.verifyEntitlement(ctx);
        accessVerified = true;
        const enabled = await commitChannel(ctx, { provider, enabled: true, dav: ctx.channel?.dav ?? null });
        ctx = await context({ ...input, channelId: enabled.id });
        log.info("settings-cloud-enabled", "已开启设置云同步", { operationId: input.operationId, provider });
      }
      if (!ctx.channel && DEVICE_ACTIONS.includes(input.action)) {
        const selected = await commitChannel(ctx, { provider: "official", enabled: false, dav: null });
        ctx = await context({ ...input, channelId: selected.id }, { allowDisabled: true });
      }
      if (!ctx.channel) throw cloud.error("channel-invalid", "请先选择备份位置");
      if (input.action === "recovery-saved") {
        if (typeof input.recoveryId !== "string" || !cloud.HASH.test(input.recoveryId)) throw vault.invalid();
        await vault.recoverySaved(ctx, input.recoveryId);
        return { success: true, action: input.action };
      }
      if (input.action === "new-recovery") {
        const device = await vault.readDevice(ctx);
        if (device?.pendingRecovery) {
          return { success: true, action: input.action, recovery: device.pendingRecovery, channelId: ctx.channel.id };
        }
      }
      if (input.reason === "alarm" && input.action === "sync"
        && Date.now() - (await ctx.check()).lastCheckedAt < MIN_ALARM_GAP_MS) {
        return { success: true, skipped: true, reason: "interval" };
      }
      adapter = requestRemote(ctx);
      if (ctx.channel.provider === "webdav" && !accessVerified) await remotes.verifyEntitlement(ctx);
      if (input.action === "reset") return await deleteBackup(ctx, adapter, input);
      if (DEVICE_ACTIONS.includes(input.action)) return await manageDevice(ctx, adapter, input);
      return await synchronize(ctx, adapter, input);
    } catch (error) {
      const changed = ["owner-changed", "channel-changed", "no-entitlement"].includes(error?.code);
      const code = error?.code ?? (error?.name === "TimeoutError" ? "timeout" : "sync-failed");
      const status = Number.isInteger(error?.status) ? error.status : undefined;
      const message = code === "sync-failed" ? "设置云同步失败，请稍后重试" : error.message;
      if (ctx?.channel && adapter && !changed && !error?.cloudCleared) {
        try {
          await changeMeta(ctx, meta => ({ ...meta, ...checked({ lastError: { code, status } }) }));
        } catch (statusError) {
          if (!["owner-changed", "channel-changed", "no-entitlement"].includes(statusError.code)) {
            log.warn("settings-cloud-status-save-failed", "云同步失败状态保存失败", { operationId: input.operationId, error: statusError });
          }
        }
      }
      log.error("settings-cloud-operation-failed", "设置云同步操作失败", {
        operationId: input.operationId, phase: input.action, provider: ctx?.channel?.provider, error,
      });
      return { success: false, error: message, code, status, cloudCleared: error?.cloudCleared === true,
        ...(input.action === "device-status" && error?.pendingRecoveryId && { pendingRecoveryId: error.pendingRecoveryId }) };
    }
  }

  function run(input = {}) {
    const request = { reason: "manual", action: "sync", ...input, atEdit: editClock };
    request.operationId ||= root.STLoggerFactory.createOperationId();
    if (waiting && request.action === "sync" && auto(request) && !request.settingsClosed) {
      return Promise.resolve({ success: true, skipped: true, reason: "busy" });
    }
    if (waiting >= 4) return Promise.resolve({ success: false, error: "云同步正在处理其它操作，请稍后再试" });
    waiting += 1;
    const after = async () => {
      try {
        return await execute(request);
      } finally {
        waiting -= 1;
      }
    };
    operations = operations.then(after, after);
    return operations;
  }

  function scheduleDebounce() {
    if (debounceTimer) root.clearTimeout(debounceTimer);
    debounceTimer = root.setTimeout(() => {
      debounceTimer = 0;
      void run({ reason: "debounce" });
    }, DEBOUNCE_MS);
  }

  function trackChange() {
    editClock += 1;
    return serialMeta(async () => {
      const { channel, meta } = await cloud.readChannel();
      if (!channel?.enabled) return;
      await cloud.saveMeta(channel.id, { ...meta, dirty: true, editSeq: meta.editSeq + 1 });
      if (settingsOpen > 0) scheduleDebounce();
    });
  }

  function trackEdit(event) {
    if (event.owner === "settings:storage" && event.reason === "settings-cloud-apply") return;
    if (event.changedKeys.some(cloud.isSyncedKey)) return trackChange();
  }

  function achievementEdited() {
    void trackChange().catch(error => log.error("settings-cloud-achievement-dirty-failed", "记录待同步成就译文失败", { error }));
  }

  const DEVICE_ACTIONS = ["pair-request", "approve-device", "new-recovery", "recovery-saved", "recover-device", "export-archive"];
  const CONFIG_ACTIONS = ["enable", "disable", "select-provider", "configure-webdav", "reset", "restore-remote", "device-status", ...DEVICE_ACTIONS];
  const ACTIONS = ["sync", "use-cloud", "use-local", "restore-archive", ...CONFIG_ACTIONS];

  /** 由消息路由验证来源。凭据只用于显式配置，不进入状态回复、日志或提示 */
  async function handleMessage(request, sender, sendResponse, { embedded = false } = {}) {
    const { action = "sync", reason = "manual", settingsClosed, channelId, provider, consent, dav, ticket, operationId, expectedSession } = request;
    if (!ACTIONS.includes(action)) {
      sendResponse({ success: false, error: "云同步操作无效" });
      return;
    }
    if ((CONFIG_ACTIONS.includes(action) || (embedded && action === "sync"))
      && (!Object.hasOwn(request, "channelId") || !cloud.HASH.test(expectedSession))) {
      sendResponse({ success: false, code: "owner-changed", error: "当前登录状态已变化，请重新打开设置" });
      return;
    }
    if (reason === "open-settings") settingsOpen += 1;
    if (settingsClosed === true && settingsOpen > 0) settingsOpen -= 1;
    const privateFiles = action === "approve-device" ? { pair: request.pair }
      : (action === "recovery-saved" || (action === "new-recovery" && Object.hasOwn(request, "recoveryId"))) ? { recoveryId: request.recoveryId }
      : (action === "recover-device" || action === "restore-remote") ? { recovery: request.recovery }
        : action === "restore-archive" ? { recovery: request.recovery, archive: request.archive } : {};
    sendResponse(await run({ action, reason, settingsClosed, provider, consent, dav, ticket, operationId, embedded,
      ...privateFiles,
      ...(Object.hasOwn(request, "channelId") && { channelId }),
      ...(Object.hasOwn(request, "expectedSession") && { expectedSession }),
    }));
  }

  root.STSettingsBus.subscribe(trackEdit, {
    owner: "background:settings-cloud", key: "dirty-tracker",
    keys: [storage.UI_LOCALE_KEY, config.updates.settingKey, root.STAutomation.TOOL_CREDENTIALS_KEY], prefixes: ["st.settings."],
  });

  root.chrome.alarms.get(ALARM, existing => {
    if (!existing) root.chrome.alarms.create(ALARM, { periodInMinutes: PERIOD_MIN });
  });
  root.chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === ALARM) {
      root.chrome.alarms.create(JITTER_ALARM, { delayInMinutes: Math.max(0.01, Math.random() * JITTER_MAX_MS / 60000) });
    } else if (alarm.name === JITTER_ALARM) {
      void run({ reason: "alarm" });
    }
  });
  root.chrome.runtime.onStartup.addListener(() => { void run({ reason: "startup" }); });
  void run({ action: "migrate", reason: "startup" });

  root.STBackgroundSettingsSync = Object.freeze({ ready: true, handleMessage, run, achievementEdited });
})(globalThis);
