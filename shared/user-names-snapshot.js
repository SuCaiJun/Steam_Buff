/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 独立名称本地快照、待上传与云端合并
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

// 本地 items 是库列表显示源。pending 只保留尚未被云端快照确认的提交。
// confirmed 只来自云端有名记录，用来判断待上传算不算新增占额，本地 items 已经混入 pending，不能拿它当云端原值
// 云端 GET /user/names 在 revision 变化时返回全量有名记录，不是按行差量。
// 存储值是 { byUser: { [userId]: 快照 } }，槽位只认 WordPress userId，退出登录不删除
// 没有 byUser 的旧扁平快照没有主人，不能挂到当前账号，也不能上传
// writeUser 不接受 null、undefined 或非对象。键不存在时由调用方传入 emptyIndex()，避免读失败覆盖其他账号
((root) => {
  "use strict";

  if (root.STUserNamesSnapshot?.ready) {
    return;
  }

  const BATCH_MAX = 2000;
  const ALIAS_MAX = 10;
  const QUOTA_EXHAUSTED = "自定义名称额度已用完";
  const QUOTA_DENIED = "当前权益不包含自定义名称";

  function emptySnapshot() {
    return {
      userId: "",
      revision: 0,
      updatedAt: "",
      count: 0,
      quota: -1,
      allowed: false,
      items: {},
      pending: {},
      syncErrors: {},
      confirmed: {},
      confirmedRevision: 0,
    };
  }

  // 只保留 byUser，存储里残留的写入标记不参与读取，下次写回时去掉
  function emptyIndex() {
    return { byUser: {} };
  }

  function userIdOf(value) {
    if (!value || typeof value !== "object") {
      return String(value ?? "").trim();
    }
    return String(value.userId || value.user?.id || "").trim();
  }

  // 没有 access/refresh 就不是当前登录用户，即使会员快照里还留着 userId
  function signedInUserId(membership, auth) {
    const record = auth && typeof auth === "object" ? auth : null;
    if (!String(record?.access_token || "") && !String(record?.refresh_token || "")) {
      return "";
    }
    return userIdOf(membership);
  }

  function sameUser(left, right) {
    const a = userIdOf(left);
    const b = userIdOf(right);
    return a !== "" && a === b;
  }

  function text(value) {
    return String(value || "").trim();
  }

  // 与服务端 alias normalize 一致：去首尾和内部空白后比较小写，保留先出现的原文
  function aliasKey(value) {
    return text(value).toLowerCase().replace(/\s+/g, "");
  }

  function aliasesOf(value) {
    if (!Array.isArray(value)) {
      return [];
    }
    const out = [];
    const seen = new Set();
    for (const item of value) {
      const name = text(item);
      const key = aliasKey(name);
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push(name);
      if (out.length >= ALIAS_MAX) {
        break;
      }
    }
    return out;
  }

  function rowFrom(raw) {
    const source = raw && typeof raw === "object" ? raw : { custom_name: raw };
    return {
      custom_name: text(source.custom_name),
      aliases: aliasesOf(source.aliases),
      mnemonic: String(source.mnemonic || ""),
      pinyin: String(source.pinyin || ""),
      mnemonic_locked: source.mnemonic_locked === true,
      pinyin_locked: source.pinyin_locked === true,
      steam_name: text(source.steam_name),
    };
  }

  function sameAliases(left, right) {
    const a = aliasesOf(left).map(aliasKey).sort();
    const b = aliasesOf(right).map(aliasKey).sort();
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }

  function payloadFingerprint(payload) {
    const row = rowFrom(payload);
    return JSON.stringify({
      custom_name: row.custom_name,
      aliases: aliasesOf(row.aliases).map(aliasKey).sort(),
      mnemonic: row.mnemonic,
      pinyin: row.pinyin,
      mnemonic_locked: row.mnemonic_locked === true,
      pinyin_locked: row.pinyin_locked === true,
      steam_name: row.steam_name,
    });
  }

  function hasNameData(value) {
    const row = rowFrom(value);
    return !!row.custom_name || row.aliases.length > 0 || !!row.mnemonic || !!row.pinyin;
  }

  function syncErrorsOf(raw, pending = null) {
    const source = raw?.syncErrors && typeof raw.syncErrors === "object" ? raw.syncErrors : {};
    const out = {};
    for (const [id, value] of Object.entries(source)) {
      const appid = Number(id) || 0;
      const message = text(value?.message);
      const fingerprint = text(value?.fingerprint);
      if (!appid || !message || !fingerprint) {
        continue;
      }
      out[String(appid)] = { message, fingerprint };
    }
    // 没有对应待上传，或指纹已经不是这份内容时，旧拒绝不再有效
    if (pending) {
      for (const id of Object.keys(out)) {
        const payload = pending[id];
        if (!payload || out[id].fingerprint !== payloadFingerprint(payload)) {
          delete out[id];
        }
      }
    }
    return out;
  }

  function confirmedOf(raw) {
    const source = raw?.confirmed && typeof raw.confirmed === "object" && !Array.isArray(raw.confirmed)
      ? raw.confirmed
      : null;
    const out = {};
    if (!source) {
      return out;
    }
    for (const id of Object.keys(source)) {
      const appid = Number(id) || 0;
      if (appid) {
        out[String(appid)] = true;
      }
    }
    return out;
  }

  function confirmedRevisionOf(raw) {
    const revision = Number(raw?.confirmedRevision);
    return Number.isInteger(revision) && revision > 0 ? revision : 0;
  }

  function isQuotaReason(message) {
    return message === QUOTA_EXHAUSTED || message === QUOTA_DENIED;
  }

  function normalize(raw) {
    const base = emptySnapshot();
    if (!raw || typeof raw !== "object") {
      return base;
    }
    const items = {};
    const source = raw.items && typeof raw.items === "object" ? raw.items : {};
    for (const [id, row] of Object.entries(source)) {
      const appid = Number(id) || 0;
      const next = rowFrom(row);
      if (!appid || !hasNameData(next)) {
        continue;
      }
      items[String(appid)] = next;
    }
    const pending = {};
    const pendingSource = raw.pending && typeof raw.pending === "object" ? raw.pending : {};
    for (const [id, row] of Object.entries(pendingSource)) {
      const appid = Number(row?.appid || id) || 0;
      if (!appid) {
        continue;
      }
      pending[String(appid)] = { ...rowFrom(row), appid, type: "Game" };
    }
    const quota = Number(raw.quota);
    return {
      userId: userIdOf(raw.userId),
      revision: Number(raw.revision) || 0,
      updatedAt: String(raw.updatedAt || ""),
      count: Object.values(items).filter((row) => !!row.custom_name).length,
      quota: Number.isInteger(quota) ? quota : -1,
      allowed: raw.allowed !== false,
      items,
      pending,
      syncErrors: syncErrorsOf(raw, pending),
      confirmed: confirmedOf(raw),
      confirmedRevision: confirmedRevisionOf(raw),
    };
  }

  function normalizeIndex(raw) {
    const index = emptyIndex();
    const source = raw?.byUser && typeof raw.byUser === "object" && !Array.isArray(raw.byUser)
      ? raw.byUser
      : null;
    if (!source) {
      return index;
    }
    for (const [id, snapshot] of Object.entries(source)) {
      const userId = userIdOf(id);
      if (!userId) {
        continue;
      }
      const next = normalize(snapshot);
      if (next.userId && next.userId !== userId) {
        continue;
      }
      next.userId = userId;
      index.byUser[userId] = next;
    }
    return index;
  }

  function readUser(index, userId) {
    const id = userIdOf(userId);
    if (!id) {
      return emptySnapshot();
    }
    const source = index?.byUser && typeof index.byUser === "object" ? index.byUser : null;
    if (!source || !Object.hasOwn(source, id)) {
      return emptySnapshot();
    }
    const next = normalize(source[id]);
    if (next.userId && next.userId !== id) {
      return emptySnapshot();
    }
    next.userId = id;
    return next;
  }

  // 注: null、undefined 和非对象不能当成空名册。读失败若传进来，会写成只剩当前账号的新索引
  function writeUser(index, userId, snapshot) {
    const id = userIdOf(userId);
    if (!id) {
      const error = new Error("缺少账号身份");
      error.code = 401;
      throw error;
    }
    if (!index || typeof index !== "object" || Array.isArray(index)) {
      const error = new Error("名称快照索引无效");
      error.code = "invalid-index";
      throw error;
    }
    const stored = normalize(snapshot);
    if (stored.userId && stored.userId !== id) {
      const error = new Error("名称快照账号不一致");
      error.code = "owner-changed";
      throw error;
    }
    const next = normalizeIndex(index);
    stored.userId = id;
    next.byUser[id] = stored;
    return next;
  }

  function compactCloud(body = {}) {
    const items = {};
    for (const row of Array.isArray(body.data) ? body.data : []) {
      const appid = Number(row?.appid) || 0;
      const next = rowFrom(row);
      if (!appid || !hasNameData(next)) {
        continue;
      }
      items[String(appid)] = next;
    }
    const quota = Number(body.quota);
    return {
      revision: Number(body.revision) || 0,
      updatedAt: String(body.updatedAt || ""),
      count: Object.values(items).filter((row) => !!row.custom_name).length,
      quota: Number.isInteger(quota) ? quota : -1,
      allowed: true,
      items,
      pending: {},
    };
  }

  function displayMap(snapshot) {
    const out = {};
    const items = snapshot?.items && typeof snapshot.items === "object" ? snapshot.items : {};
    for (const [id, row] of Object.entries(items)) {
      const name = typeof row === "string" ? text(row) : text(row?.custom_name);
      if (name) {
        out[id] = name;
      }
    }
    return out;
  }

  // 库搜索只发布当前账号的五个名称字段，显示层仍使用 displayMap 的字符串快照。
  function searchMap(snapshot) {
    const out = {};
    const items = snapshot?.items && typeof snapshot.items === "object" ? snapshot.items : {};
    for (const [id, value] of Object.entries(items)) {
      const appid = Number(id) || 0;
      const row = rowFrom(value);
      if (!appid || !row.custom_name) {
        continue;
      }
      out[String(appid)] = {
        steam_name: row.steam_name,
        custom_name: row.custom_name,
        aliases: row.aliases,
        mnemonic: row.mnemonic,
        pinyin: row.pinyin,
      };
    }
    return out;
  }

  function payloadOf(item) {
    const appid = Number(item?.appid) || 0;
    const row = rowFrom(item);
    return {
      type: "Game",
      appid,
      steam_name: row.steam_name,
      custom_name: row.custom_name,
      aliases: row.aliases,
      mnemonic: row.mnemonic,
      pinyin: row.pinyin,
      mnemonic_locked: row.mnemonic_locked,
      pinyin_locked: row.pinyin_locked,
    };
  }

  function applyInto(current, item) {
    const appid = Number(item?.appid) || 0;
    if (!appid) {
      const error = new Error("无效的 AppID");
      error.code = 400;
      throw error;
    }
    const key = String(appid);
    // 不在待上传里的名称只来自已合并的云端有名记录，写入 pending 后 items 不再是云端原值，要先记下
    if (current.items[key]?.custom_name && !current.pending[key]) {
      current.confirmed[key] = true;
    }
    const previous = current.pending[key] || current.items[key] || {};
    const payload = payloadOf({
      ...previous,
      ...item,
      appid,
      steam_name: text(item?.steam_name) || previous.steam_name,
      aliases: Object.hasOwn(item || {}, "aliases") ? item.aliases : previous.aliases,
      mnemonic: Object.hasOwn(item || {}, "mnemonic") ? item.mnemonic : previous.mnemonic,
      pinyin: Object.hasOwn(item || {}, "pinyin") ? item.pinyin : previous.pinyin,
      mnemonic_locked: Object.hasOwn(item || {}, "mnemonic_locked") ? item.mnemonic_locked === true : previous.mnemonic_locked === true,
      pinyin_locked: Object.hasOwn(item || {}, "pinyin_locked") ? item.pinyin_locked === true : previous.pinyin_locked === true,
    });
    if (hasNameData(payload)) {
      current.items[key] = rowFrom(payload);
    } else {
      delete current.items[key];
    }
    current.pending[key] = payload;
    // 内容和上次被拒绝的提交一样时保留拒绝。只有内容变了才去掉，避免原样再存把旧错误清掉后又上传
    const kept = current.syncErrors[key];
    if (!kept || kept.fingerprint !== payloadFingerprint(payload)) {
      delete current.syncErrors[key];
    }
    current.allowed = true;
    return current;
  }

  function finishApply(current) {
    current.count = Object.values(current.items).filter((row) => !!row.custom_name).length;
    return current;
  }

  function applyLocal(snapshot, item) {
    return finishApply(applyInto(normalize(snapshot), item));
  }

  // 一批导入只规范化一次，再逐条改同一份快照，避免每条都复制全部名称
  function applyLocalMany(snapshot, items) {
    const current = normalize(snapshot);
    for (const item of Array.isArray(items) ? items : []) {
      applyInto(current, item);
    }
    return finishApply(current);
  }

  function beginLocalApply(snapshot) {
    return normalize(snapshot);
  }

  function cloudHasPending(payload, cloudItems) {
    const cloud = cloudItems[String(payload.appid)];
    if (!hasNameData(payload)) {
      return !cloud;
    }
    if (!cloud || !hasNameData(cloud)) {
      return false;
    }
    return cloud.custom_name === payload.custom_name
      && cloud.mnemonic === payload.mnemonic
      && cloud.pinyin === payload.pinyin
      && cloud.mnemonic_locked === payload.mnemonic_locked
      && cloud.pinyin_locked === payload.pinyin_locked
      && sameAliases(cloud.aliases, payload.aliases);
  }

  // 仍在 pending 里的 AppID 保留本地；云端已确认的待上传项才删掉。
  function mergeCloud(local, cloud) {
    const current = normalize(local);
    const remote = normalize(cloud);
    if (remote.revision < current.confirmedRevision) {
      return current;
    }
    const items = {};
    for (const [id, row] of Object.entries(remote.items)) {
      if (current.pending[id]) {
        continue;
      }
      items[id] = row;
    }
    for (const [id, payload] of Object.entries(current.pending)) {
      if (cloudHasPending(payload, remote.items)) {
        delete current.pending[id];
        delete current.syncErrors[id];
        if (remote.items[id]) {
          items[id] = remote.items[id];
        }
        continue;
      }
      if (current.items[id]) {
        items[id] = current.items[id];
      }
    }
    const confirmed = {};
    for (const [id, row] of Object.entries(remote.items)) {
      if (row.custom_name) {
        confirmed[id] = true;
      }
    }
    // 这次全量有名记录替换确认集，再按当前额度重算拦截，避免旧额度标记留在已经放行的内容上
    return applyQuotaHold({
      userId: current.userId,
      revision: remote.revision,
      updatedAt: remote.updatedAt,
      count: Object.values(items).filter((row) => !!row.custom_name).length,
      quota: remote.quota,
      allowed: true,
      items,
      pending: current.pending,
      syncErrors: current.syncErrors,
      confirmed,
      confirmedRevision: remote.revision,
    });
  }

  // 失败请求的指纹必须仍等于当前待上传。飞行期间又保存过的新内容不能带上旧错误
  function blockPending(snapshot, payloads, message) {
    const current = normalize(snapshot);
    const reason = text(message) || "云端没有收下这项名称";
    for (const payload of payloads || []) {
      const appid = Number(payload?.appid) || 0;
      const key = String(appid);
      const pending = current.pending[key];
      if (!appid || !pending) {
        continue;
      }
      const failed = payloadFingerprint(payload);
      const fingerprint = payloadFingerprint(pending);
      if (failed !== fingerprint) {
        continue;
      }
      const prev = current.syncErrors[key];
      if (prev && prev.fingerprint === fingerprint && prev.message === reason) {
        continue;
      }
      current.syncErrors[key] = { message: reason, fingerprint };
    }
    return current;
  }

  // 还没进 pending 的名称也是云端确认过的，补进确认集后占额只数这份集合，不数本地改过的 items
  function rememberConfirmed(current) {
    for (const id of Object.keys(current.items)) {
      if (!current.pending[id] && current.items[id]?.custom_name) {
        current.confirmed[id] = true;
      }
    }
  }

  // 与提交过滤一致：额度小于 0 不限制；等于 0 时修改和清空都不收；大于 0 时只拒绝超出的新名称
  function quotaHolds(current) {
    const held = new Map();
    if (current.quota < 0) {
      return held;
    }
    if (current.quota === 0) {
      for (const payload of Object.values(current.pending)) {
        held.set(String(payload.appid), QUOTA_DENIED);
      }
      return held;
    }
    let used = Object.keys(current.confirmed).length;
    for (const payload of Object.values(current.pending)) {
      const key = String(payload.appid);
      if (!payload.custom_name || current.confirmed[key]) {
        continue;
      }
      if (used >= current.quota) {
        held.set(key, QUOTA_EXHAUSTED);
        continue;
      }
      used += 1;
    }
    return held;
  }

  function applyQuotaHold(snapshot) {
    const current = normalize(snapshot);
    rememberConfirmed(current);
    const held = quotaHolds(current);
    for (const [key, error] of Object.entries(current.syncErrors)) {
      if (!isQuotaReason(error.message)) {
        continue;
      }
      const reason = held.get(key);
      const pending = current.pending[key];
      if (!reason || !pending) {
        delete current.syncErrors[key];
        held.delete(key);
        continue;
      }
      const fingerprint = payloadFingerprint(pending);
      if (error.message !== reason || error.fingerprint !== fingerprint) {
        current.syncErrors[key] = { message: reason, fingerprint };
      }
      held.delete(key);
    }
    for (const [key, reason] of held) {
      const pending = current.pending[key];
      if (!pending || current.syncErrors[key]) {
        continue;
      }
      current.syncErrors[key] = {
        message: reason,
        fingerprint: payloadFingerprint(pending),
      };
    }
    return current;
  }

  function withQuota(snapshot, quota) {
    const current = normalize(snapshot);
    if (!Number.isInteger(quota) || current.quota === quota) {
      return current;
    }
    current.quota = quota;
    return applyQuotaHold(current);
  }

  function quotaBlocked(snapshot) {
    const current = normalize(snapshot);
    return Object.values(current.pending).some((payload) => {
      const blocked = current.syncErrors[String(payload.appid)];
      return !!blocked
        && isQuotaReason(blocked.message)
        && blocked.fingerprint === payloadFingerprint(payload);
    });
  }

  function pendingBatch(snapshot, limit = BATCH_MAX) {
    const size = Math.max(1, Math.min(BATCH_MAX, Number(limit) || BATCH_MAX));
    const current = normalize(snapshot);
    return Object.values(current.pending).filter((payload) => {
      const blocked = current.syncErrors[String(payload.appid)];
      return !blocked || blocked.fingerprint !== payloadFingerprint(payload);
    }).slice(0, size).map(payloadOf);
  }

  root.STUserNamesSnapshot = Object.freeze({
    ready: true,
    BATCH_MAX,
    emptySnapshot,
    emptyIndex,
    normalize,
    normalizeIndex,
    readUser,
    writeUser,
    userIdOf,
    signedInUserId,
    sameUser,
    compactCloud,
    displayMap,
    searchMap,
    applyLocal,
    applyLocalMany,
    beginLocalApply,
    applyInto,
    finishApply,
    mergeCloud,
    blockPending,
    applyQuotaHold,
    withQuota,
    quotaBlocked,
    payloadFingerprint,
    pendingBatch,
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
