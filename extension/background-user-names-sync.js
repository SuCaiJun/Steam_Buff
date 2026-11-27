/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 独立名称待上传批量同步
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

// 两分钟上传当前登录用户还能提交的 pending，没有待上传、也没有额度拦截时不打网
// 待上传全被额度拦住时仍拉一次云端状态，额度或确认集变化后同一轮再提交
// 同步绑定本次登录会话。403 暂停云同步，账号中心才能确认独立名称权益失效
// 独立名称或权益没开时只看登录和开关，不读名册
// 批量 /submit 入队后，要等该账号的云端快照对上才清 pending
// 响应里的 rejected 只停止入队时已确定、且仍与当前待上传一致的项；没有该字段或快照 unchanged 都不表示已处理
// 名册只有这一条写路径，保存、合并和上传写回都排进同一条队列，读到最新槽之后才修改
((root) => {
  "use strict";

  if (root.STBackgroundUserNamesSync?.ready) {
    return;
  }

  const store = root.STUserNamesSnapshot;
  if (!store) {
    throw new Error("shared/user-names-snapshot.js must load before background-user-names-sync.js");
  }

  const CFG = root.STConfig;
  const ALARM = "steam-buff-user-names";
  const COMMIT_TYPE = "USER_NAMES_COMMIT";
  const PERIOD_MIN = 2;
  const FETCH_TIMEOUT_MS = 20_000;
  const CENTER_TIMEOUT_MS = 8_000;
  const SNAPSHOT_KEY = "st.userNames.snapshot";
  const MODE_KEY = `st.settings.${root.STConfig.libraryNameMode.key}.value`;
  const MEMBERSHIP_KEY = "steam_buff_membership";
  const AUTH_KEY = "steam_buff_auth";
  const log = root.STLoggerFactory.createLogger("background", "library-independent-name");
  let inflight = null;
  let client = null;
  const entitlementChecks = new Map();
  // 前一个写完才开始下一个，队列外先读到的旧快照不能直接写回
  let writeChain = Promise.resolve();

  function storageApi() {
    return root.STSettings?.storage || null;
  }

  function authClient() {
    if (!client) {
      client = root.STAuthClient?.createClient?.({
        storage: storageApi(),
        refreshUrl: CFG.loginAuth("/auth/refresh"),
      }) || null;
    }
    return client;
  }

  function writeLocal(data) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set(data, () => {
          resolve(!chrome.runtime.lastError);
        });
      } catch (error) {
        globalThis.STLoggerFactory.reportError(error, { domain: "extension", feature: "background-user-names-sync", event: "write-local-failed", message: "扩展后台或桥接处理失败", level: "error", phase: "writeLocal" });
        resolve(false);
      }
    });
  }

  function loginError(message) {
    const error = new Error(message);
    error.code = 401;
    return error;
  }

  function ownerFrom(stored) {
    const auth = stored[AUTH_KEY];
    const membership = stored[MEMBERSHIP_KEY];
    return {
      ownerId: store.signedInUserId(membership, auth),
      sessionKey: root.STAuthSession.authKey(auth),
      auth,
      membership,
    };
  }

  async function readOwner() {
    return ownerFrom(await readStorage([MEMBERSHIP_KEY, AUTH_KEY]));
  }

  function sameOwner(current, expected) {
    return store.sameUser(current.ownerId, expected.ownerId) && current.sessionKey === expected.sessionKey;
  }

  function checkedOwner(current, owner) {
    if (!sameOwner(current, owner)) {
      throw Object.assign(new Error("账号已切换"), { code: "owner-changed" });
    }
    return current;
  }

  async function assertOwner(owner) {
    return checkedOwner(await readOwner(), owner);
  }

  async function logOwnerChanged(ownerId, operationId, reason) {
    const current = await readOwner();
    log.warn("user-names-owner-changed", "独立名称上传时账号已切换，未写回", {
      operationId,
      ownerId,
      currentUserId: current.ownerId,
      reason,
    });
  }

  // 名称请求的刷新与 401 重发走公共认证客户端，始终绑定发起时的会话
  async function requestFor(owner, method, url, body, operationId, { retry = false, touchAuth = false } = {}) {
    const client = authClient();
    const boundOwner = owner.ownerId;
    if (!client || !boundOwner || !owner.sessionKey) {
      throw loginError("请先在设置中登录");
    }
    let result;
    try {
      result = await client.authedRequest(url, {
        method,
        body,
        operationId,
        ownerId: boundOwner,
        sessionKey: owner.sessionKey,
        timeoutMs: touchAuth ? 12_000 : FETCH_TIMEOUT_MS,
        throwOnMissingAuth: true,
        logFailures: false,
        lenientJson: true,
        touchAuth,
        async beforeSend() {
          if (retry) {
            await assertOwner(owner);
            return;
          }
          const stored = await readStorage([MEMBERSHIP_KEY, AUTH_KEY, SNAPSHOT_KEY]);
          checkedOwner(ownerFrom(stored), owner);
          if (store.syncHoldOf(stored[SNAPSHOT_KEY]?.byUser?.[boundOwner]?.syncHold)) {
            throw Object.assign(new Error("名称云同步已暂停"), { code: "sync-paused" });
          }
        },
      });
    } catch (error) {
      if (error?.code === "owner-changed") {
        throw error;
      }
      if (Number(error?.status) === 401) {
        throw loginError(error.message || "请先在设置中登录");
      }
      throw error;
    }
    await assertOwner(owner);
    const status = result.response?.status;
    const code = status >= 400 ? status : result.code;
    if (code < 200 || code >= 300) {
      const error = new Error(String(result.body?.message || "名称同步失败"));
      error.code = code;
      throw error;
    }
    return result.body;
  }

  function sinceRevision(local) {
    const since = Number(local.revision) || 0;
    const proved = Number(local.confirmedRevision) === since && since > 0;
    // 额度拦住、又还没有这次 revision 的确认集时，不带 sinceRevision，才能拿到全量有名记录
    return since > 0 && (proved || !store.quotaBlocked(local)) ? since : 0;
  }

  function enqueue(task) {
    const run = writeChain.then(task, task);
    writeChain = run.then(() => undefined, () => undefined);
    return run;
  }

  // readUser 和变更函数已返回规范快照，比较时不再重建副本
  function unchanged(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function readStorage(keys) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.get(keys, (data) => {
          const failure = chrome.runtime.lastError;
          if (failure) {
            const error = new Error(failure.message || "本地存储读取失败");
            error.code = "read-failed";
            reject(error);
            return;
          }
          if (!data || typeof data !== "object" || Array.isArray(data)) {
            const error = new Error("本地存储读取失败");
            error.code = "read-failed";
            reject(error);
            return;
          }
          resolve(data);
        });
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error("本地存储读取失败");
        if (!error.code) {
          error.code = "read-failed";
        }
        reject(error);
      }
    });
  }

  // 注: 读取失败必须抛出。键不存在才是 missing，两种结果不能再合成同一个空对象
  async function readBook() {
    const data = await readStorage([SNAPSHOT_KEY]);
    if (!Object.hasOwn(data, SNAPSHOT_KEY)) {
      return { missing: true, book: null };
    }
    return { missing: false, book: data[SNAPSHOT_KEY] };
  }

  // 只处理本次已经读到的值。键不存在或值不是对象时从空索引开始，读失败不能进这里
  function indexOf(loaded) {
    const book = loaded?.missing ? null : loaded?.book;
    if (book == null || typeof book !== "object" || Array.isArray(book)) {
      return store.emptyIndex();
    }
    return book;
  }

  // 调用方只能提交变更，函数拿到的是队列里刚读到的槽，不能改成整份替换旧快照
  function mutationFor(op) {
    const kind = String(op?.op || "");
    if (kind === "apply") {
      return (snapshot) => store.applyLocal(snapshot, op.item);
    }
    if (kind === "apply-many" && Array.isArray(op.items)) {
      return (snapshot) => store.applyLocalMany(snapshot, op.items);
    }
    throw Object.assign(new TypeError("名称变更无效"), { code: "invalid" });
  }

  async function applyOwner(ownerId, mutate, { requireCustomNames = false, sessionKey = "", confirmedDenied = false } = {}) {
    const id = store.userIdOf(ownerId);
    if (!id) {
      const error = new Error("缺少账号身份");
      error.code = 401;
      throw error;
    }
    if (typeof mutate !== "function") {
      throw new TypeError("名称变更无效");
    }
    let loaded;
    try {
      loaded = await readBook();
    } catch (error) {
      log.error("user-names-read-failed", "独立名称快照读取失败，已停止写入", {
        ownerId: id,
        error,
      });
      return { ok: false, reason: "read-failed" };
    }
    const currentOwner = await readOwner();
    if (!store.sameUser(currentOwner.ownerId, id) || (sessionKey && currentOwner.sessionKey !== sessionKey)) {
      return { ok: false, reason: "owner-changed" };
    }
    if (requireCustomNames && root.STSettingsMembership.normalize(currentOwner.membership, currentOwner.auth).permissions.customNames !== true) {
      return { ok: false, reason: "entitlement-denied" };
    }
    // 当前账号没变化就不写回，其他账号的槽留到真正写入时再整理
    const index = indexOf(loaded);
    const current = store.readUser(index, id);
    const next = mutate(current);
    const updates = {};
    if (!unchanged(current, next)) {
      updates[SNAPSHOT_KEY] = store.writeUser(index, id, next);
    }
    if (confirmedDenied) {
      const membership = currentOwner.membership;
      if (membership.permissions?.customNames !== false || membership.features?.customNames !== false) {
        // 从刚核对过身份的快照仅更新这一项，保留其他权益与会话凭据
        updates[MEMBERSHIP_KEY] = {
          ...membership,
          permissions: { ...membership.permissions, customNames: false },
          features: { ...membership.features, customNames: false },
        };
      }
    }
    if (Object.keys(updates).length && !await writeLocal(updates)) {
      return { ok: false, reason: "write-failed" };
    }
    return { ok: true, snapshot: updates[SNAPSHOT_KEY]?.byUser[id] || current };
  }

  function commitOwner(ownerId, mutate, options) {
    return enqueue(() => applyOwner(ownerId, mutate, options));
  }

  async function verifyCustomNames(owner, operationId) {
    const current = await assertOwner(owner);
    if (!current.auth?.access_token) {
      throw loginError("缺少账号中心复核凭据");
    }
    // 复核只使用当前会话已持有的 access token。复核失败不能触发刷新或清理登录态。
    const client = authClient();
    const response = await client.fetchBg({
      url: CFG.steamBuff("/user/center"),
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${current.auth.access_token}` },
      allowHttpError: true,
      timeoutMs: CENTER_TIMEOUT_MS,
      operationId,
    }, { logFailures: false });
    if (!response.ok) {
      throw Object.assign(new Error("账号中心复核请求失败"), { code: response.status });
    }
    const body = client.parseJson(response.data);
    if (body?.code !== 200
      || !store.sameUser(body?.user?.id, owner.ownerId)
      || typeof body?.permissions?.customNames !== "boolean") {
      throw new Error("账号中心未返回当前账号的明确名称权益");
    }
    if (body.permissions.customNames) return;

    const result = await commitOwner(owner.ownerId, (snapshot) => ({ ...snapshot, allowed: false }), {
      sessionKey: owner.sessionKey,
      confirmedDenied: true,
    });
    if (!result.ok) {
      throw Object.assign(new Error("独立名称权益复核未能写回"), { code: result.reason });
    }
    log.warn("user-names-entitlement-denied", "账号中心已确认独立名称权益失效", {
      operationId,
      ownerId: owner.ownerId,
    });
  }

  function recheckCustomNames(owner, operationId) {
    let check = entitlementChecks.get(owner.sessionKey);
    if (!check) {
      check = verifyCustomNames(owner, operationId).catch((error) => {
        log.warn("user-names-entitlement-check-failed", "未能复核独立名称权益，保留本地权益", {
          operationId,
          ownerId: owner.ownerId,
          error,
        });
      }).finally(() => entitlementChecks.delete(owner.sessionKey));
      entitlementChecks.set(owner.sessionKey, check);
    }
    return check;
  }

  async function pauseSync(owner, stage, operationId, reason, { forbidden = false, retry = false } = {}) {
    let newHold = false;
    const result = await commitOwner(owner.ownerId, (snapshot) => {
      if (snapshot.syncHold && !(forbidden && snapshot.syncHold === "read-pending")) return snapshot;
      newHold = true;
      return { ...snapshot, syncHold: forbidden ? stage : "read-pending" };
    }, { sessionKey: owner.sessionKey });
    if (!result.ok) return result;
    if (newHold || (forbidden && retry)) {
      log.warn("user-names-sync-paused", "独立名称云同步已暂停", {
        operationId,
        ownerId: owner.ownerId,
        stage,
        reason,
        status: forbidden ? 403 : undefined,
      });
    }
    if (forbidden && (newHold || retry)) await recheckCustomNames(owner, operationId);
    return { ok: false, reason: "sync-paused", code: forbidden ? 403 : undefined, kept: true };
  }

  function syncMode(stored) {
    return CFG.effectiveLibraryNameMode({
      [CFG.libraryNameMode.key]: stored[MODE_KEY],
      customNamesAllowed: CFG.customNamesAllowed(stored[MEMBERSHIP_KEY]),
    });
  }

  async function handleOperation(request, operationId) {
    const kind = request?.op?.op;
    if (kind === "merge") {
      // 旧内容脚本没有随云端响应附带会话标识。只回读当前账号的本地快照。
      return commitOwner(request.ownerId, (snapshot) => snapshot);
    }
    if (kind !== "pull" && kind !== "retry") {
      const mutate = mutationFor(request?.op);
      return commitOwner(request?.ownerId, mutate);
    }
    const stored = await readStorage([MODE_KEY, MEMBERSHIP_KEY, AUTH_KEY]);
    const owner = ownerFrom(stored);
    if (!store.sameUser(owner.ownerId, request.ownerId) || !request.session
      || request.session !== await root.STAuthSession.fingerprint(owner.auth)) {
      return { ok: false, reason: "owner-changed" };
    }
    if (kind === "retry") return run("manual", owner, operationId);
    if (syncMode(stored) !== CFG.libraryNameMode.values.INDEPENDENT) {
      return { ok: false, reason: "entitlement-denied" };
    }
    const local = store.readUser(indexOf(await readBook()), owner.ownerId);
    await assertOwner(owner);
    if (local.syncHold) return { ok: true, snapshot: local };
    const result = await takeCloud(owner, local, operationId, "page", { touchAuth: true });
    return result.done ? result.result : { ok: true, snapshot: result.local };
  }

  function handleMessage(request, sendResponse) {
    const operationId = String(request?.operationId || "");
    const requestId = String(request?.requestId || "");
    handleOperation(request, operationId).then((result) => {
      if (result?.reason === "owner-changed") {
        sendResponse({
          success: false,
          reason: "owner-changed",
          error: "账号已切换",
          code: "owner-changed",
        });
        return;
      }
      if (!result?.ok || !result.snapshot) {
        const reason = result?.reason || "write-failed";
        const operation = request?.op?.op;
        sendResponse({
          success: false,
          reason,
          error: operation === "retry" || operation === "pull" ? "名称云同步未完成" : "名称本地保存失败",
          code: result?.code || reason,
        });
        return;
      }
      sendResponse({ success: true, snapshot: result.snapshot });
    }).catch((error) => {
      const invalid = error?.code === "invalid";
      log[invalid ? "warn" : "error"](
        invalid ? "user-names-commit-rejected" : "user-names-commit-failed",
        invalid ? "独立名称变更无法识别" : "独立名称操作失败", {
        operationId,
        requestId,
        error,
      });
      sendResponse({
        success: false,
        error: error?.message || "名称本地保存失败",
        code: error?.code || "commit-failed",
      });
    });
  }

  async function run(reason = "alarm", retryOwner = null, operationId = "") {
    if (inflight) {
      if (!retryOwner || (inflight.owner && sameOwner(retryOwner, inflight.owner))) return inflight.task;
      await inflight.task;
      return run(reason, retryOwner, operationId);
    }
    const task = runOnce(reason, retryOwner, operationId).finally(() => {
      inflight = null;
    });
    inflight = { task, owner: retryOwner };
    return task;
  }

  function rejectionMessage(value) {
    const message = typeof value === "string" ? value.trim() : "";
    return message || "云端没有收下这项名称";
  }

  // 只认本次提交里、服务端明确给出的永久拒绝，缺 rejected 或快照没变化都不能推断该项已处理
  function permanentRejections(body, batch) {
    if (!Array.isArray(body?.rejected)) {
      return [];
    }
    const byApp = new Map();
    for (const payload of batch) {
      const appid = Number(payload?.appid) || 0;
      if (appid) {
        byApp.set(appid, payload);
      }
    }
    const out = [];
    for (const row of body.rejected) {
      const appid = Number(row?.appid) || 0;
      const code = Number(row?.code) || 0;
      const payload = byApp.get(appid);
      if (!payload || code < 400) {
        continue;
      }
      out.push({ payload, message: rejectionMessage(row?.message) });
    }
    return out;
  }

  async function uploadBatch(owner, batch, operationId, reason, retry) {
    if (!batch.length) {
      return { done: false };
    }
    const { ownerId, sessionKey } = owner;
    try {
      const body = await requestFor(owner, "POST", CFG.steamBuff("/submit"), { items: batch }, operationId, { retry });
      const rejected = permanentRejections(body, batch);
      let stopped = 0;
      if (rejected.length) {
        const committed = await commitOwner(ownerId, (snapshot) => {
          let next = snapshot;
          for (const item of rejected) {
            next = store.blockPending(next, [item.payload], item.message);
          }
          return next;
        }, { sessionKey });
        if (committed.reason === "owner-changed") {
          await logOwnerChanged(ownerId, operationId, reason);
          return { done: true, result: { ok: false, reason: "owner-changed", kept: true } };
        }
        if (committed.reason === "read-failed") {
          return { done: true, result: { ok: false, reason: "read-failed", kept: true } };
        }
        if (!committed.ok) {
          log.warn("user-names-upload-failed", "独立名称永久拒绝写回本地失败", {
            operationId,
            ownerId,
            count: rejected.length,
            reason,
          });
          return { done: true, result: { ok: false } };
        }
        for (const item of rejected) {
          const mark = committed.snapshot?.syncErrors?.[String(item.payload.appid)];
          if (mark?.fingerprint === store.payloadFingerprint(item.payload) && mark.message === item.message) {
            stopped += 1;
          }
        }
        if (stopped) {
          log.warn("user-names-upload-blocked", "独立名称待上传被拒绝，已停止重复提交", {
            operationId,
            count: stopped,
            reason,
          });
        }
      }
      const queued = batch.length - rejected.length;
      if (queued > 0) {
        log.info("user-names-upload-queued", "独立名称待上传已进入云端队列", {
          operationId,
          ownerId,
          count: queued,
          reason,
        });
      }
      return { done: false, accepted: queued > 0 };
    } catch (error) {
      if (error?.code === "owner-changed") {
        await logOwnerChanged(ownerId, operationId, reason);
        return { done: true, result: { ok: false, reason: "owner-changed", kept: true } };
      }
      const code = Number(error?.code) || 0;
      if (code === 403) {
        return { done: true, result: await pauseSync(owner, "upload", operationId, reason, { forbidden: true, retry }) };
      }
      if (error?.code === "sync-paused") {
        return { done: true, result: { ok: false, reason: "sync-paused", kept: true } };
      }
      if (code === 400) {
        const blocked = await commitOwner(ownerId, (snapshot) => store.blockPending(snapshot, batch, error.message), { sessionKey });
        if (blocked.reason === "owner-changed") {
          await logOwnerChanged(ownerId, operationId, reason);
          return { done: true, result: { ok: false, reason: "owner-changed", kept: true } };
        }
        if (blocked.reason === "read-failed") {
          return { done: true, result: { ok: false, reason: "read-failed", kept: true } };
        }
        log.warn("user-names-upload-blocked", "独立名称待上传被拒绝，已停止重复提交", {
          operationId,
          error,
          count: batch.length,
          reason,
        });
        return { done: true, result: { ok: false, code, blocked: true } };
      }
      if (code !== 429) {
        log.warn("user-names-upload-failed", "独立名称待上传失败", {
          operationId,
          error,
          count: batch.length,
          reason,
        });
        return { done: true, result: { ok: false, code } };
      }
      log.warn("user-names-upload-deferred", "独立名称待上传延后", {
        operationId,
        error,
        count: batch.length,
        reason,
      });
      return retry ? { done: true, result: { ok: false, code } } : { done: false };
    }
  }

  async function takeCloud(owner, local, operationId, reason, { retry = false, touchAuth = false, postAccepted = false } = {}) {
    const { ownerId, sessionKey } = owner;
    try {
      const since = sinceRevision(local);
      const url = CFG.steamBuff("/user/names") + (since ? `?sinceRevision=${encodeURIComponent(String(since))}` : "");
      const body = await requestFor(owner, "GET", url, undefined, operationId, { retry, touchAuth });
      const sameRevision = body?.unchanged === true;
      if (!Number.isSafeInteger(body?.revision) || body.revision < 0
        || !Number.isSafeInteger(body.quota) || body.quota < -1
        || (sameRevision ? !since || body.revision !== since : !Array.isArray(body.data))) {
        throw new TypeError("名称云端快照响应无效");
      }
      const cloud = sameRevision ? null : store.compactCloud(body);
      const committed = await commitOwner(ownerId, (snapshot) => {
        if (!retry && snapshot.syncHold) return snapshot;
        let next = snapshot;
        if (cloud) next = store.mergeCloud(snapshot, cloud);
        else if (snapshot.revision === body.revision) next = store.withQuota(snapshot, body.quota);
        return retry ? { ...next, syncHold: "" } : next;
      }, { sessionKey, requireCustomNames: true });
      if (committed.reason === "owner-changed") {
        await logOwnerChanged(ownerId, operationId, reason);
        return { done: true, result: { ok: false, reason: "owner-changed", kept: true } };
      }
      if (!committed.ok) {
        log.warn("user-names-snapshot-failed", "独立名称云端结果写回本地失败", {
          operationId,
          reason,
          failure: committed.reason,
        });
        return { done: true, result: committed };
      }
      return { done: false, local: committed.snapshot };
    } catch (error) {
      if (error?.code === "owner-changed") {
        await logOwnerChanged(ownerId, operationId, reason);
        return { done: true, result: { ok: false, reason: "owner-changed", kept: true } };
      }
      if (Number(error?.code) === 403) {
        return { done: true, result: await pauseSync(owner, "read", operationId, reason, { forbidden: true, retry }) };
      }
      if (error?.code === "sync-paused") {
        return { done: true, result: { ok: false, reason: "sync-paused", kept: true } };
      }
      log.warn("user-names-snapshot-failed", "独立名称云端快照读取失败", {
        operationId,
        error,
        reason,
      });
      if (postAccepted) {
        return { done: true, result: await pauseSync(owner, "read", operationId, reason) };
      }
      return { done: true, result: { ok: false, reason: "pull-failed", kept: true } };
    }
  }

  async function runOnce(reason, retryOwner, operationId) {
    operationId ||= root.STLoggerFactory.createOperationId();
    if (retryOwner) await entitlementChecks.get(retryOwner.sessionKey);
    const stored = await readStorage([MODE_KEY, MEMBERSHIP_KEY, AUTH_KEY]);
    const owner = ownerFrom(stored);
    const { ownerId, sessionKey } = owner;
    const retry = retryOwner !== null;
    if (retry && !sameOwner(owner, retryOwner)) {
      return { ok: false, reason: "owner-changed", kept: true };
    }
    if (!ownerId) {
      return { skipped: true, reason: "signed-out" };
    }
    if (syncMode(stored) !== CFG.libraryNameMode.values.INDEPENDENT) {
      return { skipped: true, reason: "independent-off" };
    }
    const gated = await commitOwner(ownerId, (snapshot) => snapshot.syncHold && !retry ? snapshot : store.applyQuotaHold(snapshot), {
      sessionKey,
      requireCustomNames: true,
    });
    if (gated.reason === "owner-changed") {
      await logOwnerChanged(ownerId, operationId, reason);
      return { ok: false, reason: "owner-changed", kept: true };
    }
    if (!gated.ok) {
      return { ...gated, kept: true };
    }
    let local = gated.snapshot;
    if (local.syncHold && !retry) {
      return { skipped: true, reason: "sync-paused" };
    }
    if (retry && !local.syncHold) {
      return { ok: true, snapshot: local };
    }
    let batch = local.syncHold && local.syncHold !== "upload" ? [] : store.pendingBatch(local);
    const recover = !batch.length && store.quotaBlocked(local);
    if (!retry && !batch.length && !recover) {
      return { skipped: true, reason: "empty" };
    }
    let sent = null;
    if (batch.length) {
      sent = await uploadBatch(owner, batch, operationId, reason, retry);
      if (sent.done) {
        return sent.result;
      }
      if (retry && sent.accepted) {
        // 重新提交已入队。后续读不到快照时，下一次点击先继续读云端。
        const waiting = await commitOwner(ownerId, (snapshot) => (
          snapshot.syncHold === "upload" ? { ...snapshot, syncHold: "read-pending" } : snapshot
        ), { sessionKey });
        if (!waiting.ok) return waiting;
        local = waiting.snapshot;
      }
    }
    const cloud = await takeCloud(owner, local, operationId, reason, { retry, postAccepted: sent?.accepted });
    if (cloud.done) {
      return cloud.result;
    }
    local = cloud.local;
    if (retry) {
      return { ok: true, snapshot: local };
    }
    if (!sent) {
      batch = store.pendingBatch(local);
      if (batch.length) {
        const sent = await uploadBatch(owner, batch, operationId, reason, false);
        if (sent.done) {
          return sent.result;
        }
        const again = await takeCloud(owner, local, operationId, reason, { postAccepted: sent.accepted });
        if (again.done) {
          return again.result;
        }
        local = again.local;
      }
    }
    return { ok: true, pending: Object.keys(local.pending || {}).length };
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
    if (alarm?.name !== ALARM) {
      return;
    }
    run("alarm").catch((error) => {
      log.warn("user-names-upload-failed", "独立名称定时上传异常", { error });
    });
  }

  ensureAlarm();
  chrome.alarms?.onAlarm?.addListener(handleAlarm);

  root.STBackgroundUserNamesSync = Object.freeze({
    ready: true,
    ALARM,
    PERIOD_MIN,
    TYPE: COMMIT_TYPE,
    run,
    commitOwner,
    handleMessage,
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
