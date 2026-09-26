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
// 任务开始时记下 userId，发请求和写回前都再核对；对不上就停，不改其他账号的槽
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
  const SNAPSHOT_KEY = "st.userNames.snapshot";
  const MODE_KEY = `st.settings.${root.STConfig.libraryNameMode.key}.value`;
  const MEMBERSHIP_KEY = "steam_buff_membership";
  const AUTH_KEY = "steam_buff_auth";
  const log = root.STLoggerFactory.createLogger("background", "library-independent-name");
  let inflight = null;
  let client = null;
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

  // 失败和键不存在都是空对象。名称名册不能拿这个结果写回
  function readLocal(keys) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(keys, (data) => {
          if (chrome.runtime.lastError) {
            resolve({});
            return;
          }
          resolve(data || {});
        });
      } catch {
        resolve({});
      }
    });
  }

  function writeLocal(data) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set(data, () => {
          resolve(!chrome.runtime.lastError);
        });
      } catch {
        resolve(false);
      }
    });
  }

  function loginError(message) {
    const error = new Error(message);
    error.code = 401;
    return error;
  }

  async function readOwner() {
    const stored = await readLocal([MEMBERSHIP_KEY, AUTH_KEY]);
    return {
      ownerId: store.signedInUserId(stored[MEMBERSHIP_KEY], stored[AUTH_KEY]),
      auth: stored[AUTH_KEY],
    };
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

  async function denyCustomNames(operationId) {
    const api = storageApi();
    const current = await api?.getMembership?.();
    if (!current || typeof current !== "object") {
      return false;
    }
    const permissions = { ...(current.permissions || {}), customNames: false };
    const features = { ...(current.features || {}), customNames: false };
    const saved = await api.setMembership?.({ ...current, permissions, features }, { operationId });
    return !!saved;
  }

  // 刷新、401 重发和登录态写回都走公共认证客户端，并绑定这次操作开始时的账号
  async function requestFor(ownerId, method, url, body, operationId) {
    const client = authClient();
    const boundOwner = String(ownerId || "").trim();
    if (!client || !boundOwner) {
      throw loginError("请先在设置中登录");
    }
    let result;
    try {
      result = await client.authedRequest(url, {
        method,
        body,
        operationId,
        ownerId: boundOwner,
        timeoutMs: FETCH_TIMEOUT_MS,
        throwOnMissingAuth: true,
        logFailures: false,
        lenientJson: true,
        touchAuth: false,
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
    if (result.code < 200 || result.code >= 300) {
      const error = new Error(String(result.body?.message || "名称同步失败"));
      error.code = result.code;
      throw error;
    }
    return result.body;
  }

  function namesUrl(local) {
    const since = Number(local.revision) || 0;
    const proved = Number(local.confirmedRevision) === since && since > 0;
    // 额度拦住、又还没有这次 revision 的确认集时，不带 sinceRevision，才能拿到全量有名记录
    if (since > 0 && (proved || !store.quotaBlocked(local))) {
      return `${CFG.steamBuff("/user/names")}?sinceRevision=${encodeURIComponent(String(since))}`;
    }
    return CFG.steamBuff("/user/names");
  }

  async function pullBody(local, ownerId, operationId) {
    return requestFor(ownerId, "GET", namesUrl(local), undefined, operationId);
  }

  function enqueue(task) {
    const run = writeChain.then(task, task);
    writeChain = run.then(() => undefined, () => undefined);
    return run;
  }

  function unchanged(left, right) {
    return JSON.stringify(store.normalize(left)) === JSON.stringify(store.normalize(right));
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
    if (kind === "apply-many") {
      if (!Array.isArray(op.items)) {
        throw new TypeError("名称变更无效");
      }
      return (snapshot) => store.applyLocalMany(snapshot, op.items);
    }
    if (kind === "merge") {
      if (!op.cloud || typeof op.cloud !== "object" || Array.isArray(op.cloud)) {
        throw new TypeError("名称变更无效");
      }
      return (snapshot) => store.mergeCloud(snapshot, op.cloud);
    }
    if (kind === "set-allowed") {
      if (op.allowed !== false) {
        throw new TypeError("名称变更无效");
      }
      return (snapshot) => {
        const next = store.normalize(snapshot);
        next.allowed = false;
        return next;
      };
    }
    throw new TypeError("名称变更无效");
  }

  async function applyOwner(ownerId, mutate) {
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
    if (!store.sameUser(currentOwner.ownerId, id)) {
      return { ok: false, reason: "owner-changed" };
    }
    // 当前账号没变化就不写回，其他账号的槽留到真正写入时再整理
    const index = indexOf(loaded);
    const current = store.readUser(index, id);
    const nextSnap = mutate(current);
    if (unchanged(current, nextSnap)) {
      return { ok: true, snapshot: current };
    }
    const drafted = store.writeUser(index, id, nextSnap);
    const ok = await writeBook(drafted);
    if (!ok) {
      return { ok: false, reason: "write-failed" };
    }
    return { ok: true, snapshot: store.readUser(drafted, id) };
  }

  function commitOwner(ownerId, mutate) {
    return enqueue(() => applyOwner(ownerId, mutate));
  }

  function writeBook(book) {
    return writeLocal({ [SNAPSHOT_KEY]: book });
  }

  function handleMessage(request, sendResponse) {
    const operationId = String(request?.operationId || "");
    const requestId = String(request?.requestId || "");
    let mutate;
    try {
      mutate = mutationFor(request?.op);
    } catch (error) {
      log.warn("user-names-commit-rejected", "独立名称变更无法识别", {
        operationId,
        requestId,
        error,
      });
      sendResponse({ success: false, error: "名称变更无效", code: "invalid" });
      return;
    }
    commitOwner(request?.ownerId, mutate).then((result) => {
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
        sendResponse({
          success: false,
          reason: result?.reason || "write-failed",
          error: "名称本地保存失败",
          code: result?.reason || "write-failed",
        });
        return;
      }
      sendResponse({ success: true, snapshot: result.snapshot });
    }).catch((error) => {
      log.error("user-names-commit-failed", "独立名称写入失败", {
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

  async function run(reason = "alarm") {
    if (inflight) {
      return inflight;
    }
    inflight = runOnce(reason).finally(() => {
      inflight = null;
    });
    return inflight;
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

  async function uploadBatch(ownerId, batch, operationId, reason) {
    if (!batch.length) {
      return { done: false };
    }
    try {
      const body = await requestFor(ownerId, "POST", CFG.steamBuff("/submit"), { items: batch }, operationId);
      const rejected = permanentRejections(body, batch);
      let stopped = 0;
      if (rejected.length) {
        const committed = await commitOwner(ownerId, (snapshot) => {
          let next = snapshot;
          for (const item of rejected) {
            next = store.blockPending(next, [item.payload], item.message);
          }
          return next;
        });
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
      return { done: false };
    } catch (error) {
      if (error?.code === "owner-changed") {
        await logOwnerChanged(ownerId, operationId, reason);
        return { done: true, result: { ok: false, reason: "owner-changed", kept: true } };
      }
      const code = Number(error?.code) || 0;
      if (code === 403) {
        const committed = await commitOwner(ownerId, (snapshot) => {
          const next = store.normalize(snapshot);
          next.allowed = false;
          return next;
        });
        if (!committed.ok) {
          if (committed.reason === "owner-changed") {
            await logOwnerChanged(ownerId, operationId, reason);
            return { done: true, result: { ok: false, reason: "owner-changed", kept: true } };
          }
          if (committed.reason === "read-failed") {
            return { done: true, result: { ok: false, reason: "read-failed", kept: true } };
          }
          log.warn("user-names-upload-failed", "独立名称权益失效后的本地写回失败", {
            operationId,
            error,
            ownerId,
            reason,
          });
          return { done: true, result: { ok: false, code } };
        }
        const still = await readOwner();
        if (!store.sameUser(still.ownerId, ownerId)) {
          await logOwnerChanged(ownerId, operationId, reason);
          return { done: true, result: { ok: false, reason: "owner-changed", kept: true } };
        }
        await denyCustomNames(operationId);
        log.warn("user-names-entitlement-denied", "独立名称权益已失效，停止上传", {
          operationId,
          error,
          ownerId,
          reason,
        });
        return { done: true, result: { ok: false, code } };
      }
      if (code === 400) {
        const blocked = await commitOwner(ownerId, (snapshot) => store.blockPending(snapshot, batch, error.message));
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
      return { done: false };
    }
  }

  async function takeCloud(ownerId, local, operationId, reason) {
    try {
      const body = await pullBody(local, ownerId, operationId);
      if (body?.unchanged === true) {
        const quota = Number(body.quota);
        if (!Number.isInteger(quota)) {
          const current = await readOwner();
          if (!store.sameUser(current.ownerId, ownerId)) {
            await logOwnerChanged(ownerId, operationId, reason);
            return { done: true, result: { ok: false, reason: "owner-changed", kept: true } };
          }
          return { done: false, local };
        }
        const committed = await commitOwner(ownerId, (snapshot) => store.withQuota(snapshot, quota));
        if (committed.reason === "owner-changed") {
          await logOwnerChanged(ownerId, operationId, reason);
          return { done: true, result: { ok: false, reason: "owner-changed", kept: true } };
        }
        if (committed.reason === "read-failed") {
          return { done: true, result: { ok: false, reason: "read-failed", kept: true } };
        }
        if (!committed.ok) {
          log.warn("user-names-upload-failed", "独立名称云端额度写回本地失败", {
            operationId,
            ownerId,
            reason,
          });
          return { done: true, result: { ok: false } };
        }
        return { done: false, local: committed.snapshot };
      }
      const committed = await commitOwner(ownerId, (snapshot) => (
        store.mergeCloud(snapshot, store.compactCloud(body))
      ));
      if (committed.reason === "owner-changed") {
        await logOwnerChanged(ownerId, operationId, reason);
        return { done: true, result: { ok: false, reason: "owner-changed", kept: true } };
      }
      if (committed.reason === "read-failed") {
        return { done: true, result: { ok: false, reason: "read-failed", kept: true } };
      }
      if (!committed.ok) {
        log.warn("user-names-upload-failed", "独立名称云端结果写回本地失败", {
          operationId,
          reason,
        });
        return { done: true, result: { ok: false } };
      }
      return { done: false, local: committed.snapshot };
    } catch (error) {
      if (error?.code === "owner-changed") {
        await logOwnerChanged(ownerId, operationId, reason);
        return { done: true, result: { ok: false, reason: "owner-changed", kept: true } };
      }
      log.warn("user-names-snapshot-failed", "独立名称云端快照读取失败", {
        operationId,
        error,
        reason,
      });
      return { done: true, result: { ok: false, kept: true } };
    }
  }

  async function runOnce(reason) {
    const operationId = root.STLoggerFactory?.createOperationId?.() || "";
    const stored = await readLocal([MODE_KEY, MEMBERSHIP_KEY, AUTH_KEY]);
    const ownerId = store.signedInUserId(stored[MEMBERSHIP_KEY], stored[AUTH_KEY]);
    if (!ownerId) {
      return { skipped: true, reason: "signed-out" };
    }
    const mode = root.STConfig.effectiveLibraryNameMode({
      [root.STConfig.libraryNameMode.key]: stored[MODE_KEY],
      customNamesAllowed: root.STConfig.customNamesAllowed(stored[MEMBERSHIP_KEY]),
    });
    if (mode !== root.STConfig.libraryNameMode.values.INDEPENDENT) {
      return { skipped: true, reason: "independent-off" };
    }
    const gated = await commitOwner(ownerId, (snapshot) => store.applyQuotaHold(snapshot));
    if (gated.reason === "owner-changed") {
      await logOwnerChanged(ownerId, operationId, reason);
      return { ok: false, reason: "owner-changed", kept: true };
    }
    if (gated.reason === "read-failed") {
      return { ok: false, reason: "read-failed", kept: true };
    }
    let local = gated.snapshot;
    if (!local) {
      try {
        local = store.readUser(indexOf(await readBook()), ownerId);
      } catch (error) {
        log.error("user-names-read-failed", "独立名称快照读取失败，已停止写入", {
          ownerId,
          error,
        });
        return { ok: false, reason: "read-failed", kept: true };
      }
    }
    let batch = store.pendingBatch(local);
    const recover = !batch.length && store.quotaBlocked(local);
    if (!batch.length && !recover) {
      return { skipped: true, reason: "empty" };
    }
    let uploaded = false;
    if (batch.length) {
      const sent = await uploadBatch(ownerId, batch, operationId, reason);
      if (sent.done) {
        return sent.result;
      }
      uploaded = true;
    }
    const cloud = await takeCloud(ownerId, local, operationId, reason);
    if (cloud.done) {
      return cloud.result;
    }
    local = cloud.local;
    if (!uploaded) {
      batch = store.pendingBatch(local);
      if (batch.length) {
        const sent = await uploadBatch(ownerId, batch, operationId, reason);
        if (sent.done) {
          return sent.result;
        }
        const again = await takeCloud(ownerId, local, operationId, reason);
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
