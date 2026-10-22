/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : AI 翻译缓存工具
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = globalThis.STAITranslateCache = globalThis.STAITranslateCache || {};
  if (api.ready) {
    return;
  }

  const STORE_KEY = "st.ai.translate.cache.v1.";
  const KEY_PREFIX = STORE_KEY;
  const INDEX_KEY = "st.ai.translate.index";
  const TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const MAX_ITEMS = 1800;
  const LIMITS = Object.freeze({ batchItems: 30, textBytes: 64 * 1024, batchBytes: 256 * 1024 });
  const encoder = new TextEncoder();
  const log = globalThis.STLoggerFactory?.createLogger?.("translate", "ai-cache") || null;
  const activeFailures = new Set();
  let writeTask = Promise.resolve();

  function requestError(message) {
    const error = new TypeError(message);
    error.code = "AI_CACHE_REQUEST_REJECTED";
    return error;
  }

  function isCacheKey(key) {
    // cacheKey 现有 SHA-256 与后备哈希分别生成 64 位和 16 位小写十六进制值。
    return typeof key === "string" && (key.length === KEY_PREFIX.length + 64 || key.length === KEY_PREFIX.length + 16)
      && /^st\.ai\.translate\.cache\.v1\.(?:[a-f0-9]{64}|[a-f0-9]{16})$/.test(key);
  }

  function keyList(keys, limit) {
    if (!Array.isArray(keys)) throw requestError("AI 缓存键必须为数组");
    const length = keys.length;
    if (limit !== undefined && length > limit) throw requestError("AI 缓存读取批次超限");
    const list = [];
    for (let i = 0; i < length; i += 1) {
      const key = keys[i];
      if (!isCacheKey(key)) throw requestError("AI 缓存键格式无效");
      list.push(key);
    }
    return Array.from(new Set(list));
  }

  function validateKeys(keys) {
    return keyList(keys, LIMITS.batchItems);
  }

  function entryInfo(item) {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).length !== 2
      || !Object.hasOwn(item, "key") || !Object.hasOwn(item, "text")) throw requestError("AI 缓存条目格式无效");
    const { key, text } = item;
    if (!isCacheKey(key) || typeof text !== "string") throw requestError("AI 缓存条目格式无效");
    if (text.length > LIMITS.textBytes || encoder.encode(text).byteLength > LIMITS.textBytes) return null;
    const entry = { key, text };
    return { entry, bytes: encoder.encode(JSON.stringify(entry)).byteLength };
  }

  function validateEntries(entries) {
    if (!Array.isArray(entries)) throw requestError("AI 缓存条目必须为数组");
    const length = entries.length;
    if (length > LIMITS.batchItems) throw requestError("AI 缓存写入批次超限");
    const list = [];
    let bytes = 2;
    for (let i = 0; i < length; i += 1) {
      const info = entryInfo(entries[i]);
      if (!info) throw requestError("AI 缓存单条文本超限");
      bytes += info.bytes + (list.length ? 1 : 0);
      if (bytes > LIMITS.batchBytes) throw requestError("AI 缓存写入总字节超限");
      list.push(info.entry);
    }
    return list;
  }

  function batchKeys(keys) {
    const list = keyList(keys);
    const batches = [];
    for (let i = 0; i < list.length; i += LIMITS.batchItems) batches.push(list.slice(i, i + LIMITS.batchItems));
    return batches;
  }

  function batchEntries(entries) {
    if (!Array.isArray(entries)) throw requestError("AI 缓存条目必须为数组");
    const length = entries.length;
    const batches = [];
    let batch = [];
    let bytes = 2;
    let skipped = 0;
    for (let i = 0; i < length; i += 1) {
      const info = entryInfo(entries[i]);
      if (!info || info.bytes + 2 > LIMITS.batchBytes) {
        skipped += 1;
        continue;
      }
      if (batch.length && (batch.length >= LIMITS.batchItems || bytes + 1 + info.bytes > LIMITS.batchBytes)) {
        batches.push(batch);
        batch = [];
        bytes = 2;
      }
      bytes += info.bytes + (batch.length ? 1 : 0);
      batch.push(info.entry);
    }
    if (batch.length) batches.push(batch);
    return { batches, skipped };
  }

  function reportFailure(action, error, meta = {}) {
    activeFailures.add(action);
    try {
      log?.warn?.("ai-cache-storage-failed", "AI 翻译缓存存储操作失败，已降级为无缓存", {
        action,
        ...meta,
        error,
      });
    } catch {
    }
  }

  function reportRecovery(action) {
    if (!activeFailures.delete(action)) {
      return;
    }
    try {
      log?.warn?.("ai-cache-storage-recovered", "AI 翻译缓存存储操作已恢复", {
        action,
        recovery: {
          attempted: true,
          success: true,
          strategy: "next-operation-success",
        },
      });
    } catch {
    }
  }

  function area() {
    try {
      const storage = chrome.storage.local;
      reportRecovery("storage-area");
      return storage;
    } catch (error) {
      reportFailure("storage-area", error);
      return null;
    }
  }

  function get(keys) {
    const box = area();
    if (!box) {
      return Promise.resolve({});
    }
    return new Promise((resolve) => {
      try {
        box.get(keys, (rt) => {
          const error = chrome.runtime.lastError;
          if (error) {
            reportFailure("get", error, { keyCount: Array.isArray(keys) ? keys.length : 0 });
            resolve({});
            return;
          }
          reportRecovery("get");
          resolve(rt || {});
        });
      } catch (error) {
        reportFailure("get", error, { keyCount: Array.isArray(keys) ? keys.length : 0 });
        resolve({});
      }
    });
  }

  function put(data) {
    const box = area();
    if (!box) {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      try {
        box.set(data, () => {
          const error = chrome.runtime.lastError;
          if (error) {
            reportFailure("set", error, { keyCount: Object.keys(data || {}).length });
            resolve(false);
            return;
          }
          reportRecovery("set");
          resolve(true);
        });
      } catch (error) {
        reportFailure("set", error, { keyCount: Object.keys(data || {}).length });
        resolve(false);
      }
    });
  }

  function remove(keys) {
    const box = area();
    if (!box) {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      try {
        box.remove(keys, () => {
          const error = chrome.runtime.lastError;
          if (error) {
            reportFailure("remove", error, { keyCount: Array.isArray(keys) ? keys.length : 0 });
            resolve(false);
            return;
          }
          reportRecovery("remove");
          resolve(true);
        });
      } catch (error) {
        reportFailure("remove", error, { keyCount: Array.isArray(keys) ? keys.length : 0 });
        resolve(false);
      }
    });
  }

  async function indexKeys() {
    const rt = await get([INDEX_KEY]);
    return Array.isArray(rt[INDEX_KEY]) ? rt[INDEX_KEY].filter(isCacheKey) : [];
  }

  async function saveIndex(keys) {
    const list = Array.from(new Set(keys.filter(isCacheKey)));
    return put({ [INDEX_KEY]: list });
  }

  function stable(value) {
    if (Array.isArray(value)) {
      return `[${value.map(stable).join(",")}]`;
    }
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  function fallbackHash(value) {
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < value.length; i += 1) {
      const code = value.charCodeAt(i);
      h1 ^= code;
      h1 = Math.imul(h1, 0x01000193);
      h2 = Math.imul(h2 ^ code, 0x85ebca6b);
    }
    return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0).toString(16).padStart(8, "0")}`;
  }

  async function sha256(value) {
    try {
      const data = new TextEncoder().encode(value);
      const hash = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
    } catch {
      return fallbackHash(value);
    }
  }

  function fresh(item, now) {
    return item
      && typeof item.text === "string"
      && Number.isFinite(item.time)
      && now - item.time < TTL_MS;
  }

  async function cacheKey(payload) {
    return `${KEY_PREFIX}${await sha256(stable(payload || {}))}`;
  }

  /* AI 翻译缓存 */
  async function getMany(keys) {
    const list = validateKeys(keys);
    if (!list.length) {
      return {};
    }
    const now = Date.now();
    const map = await get(list);
    const out = {};
    const expired = [];
    let bytes = 2;

    for (const key of list) {
      const item = map[key];
      if (fresh(item, now)) {
        const info = entryInfo({ key, text: item.text });
        if (info && bytes + info.bytes + 1 <= LIMITS.batchBytes) {
          out[key] = item.text;
          bytes += info.bytes + 1;
        }
      } else if (item) {
        expired.push(key);
      }
    }
    if (expired.length) {
      await remove(expired);
      const index = await indexKeys();
      await saveIndex(index.filter((key) => !expired.includes(key)));
    }
    return out;
  }

  async function writeMany(entries) {
    if (!entries.length) {
      return false;
    }
    const now = Date.now();
    const data = {};
    const keys = [];
    for (const item of entries) {
      data[item.key] = {
        text: item.text,
        time: now,
      };
      keys.push(item.key);
    }
    const ok = await put(data);
    if (!ok) {
      return false;
    }
    const index = await indexKeys();
    const recent = Array.from(new Set(keys));
    const recentSet = new Set(recent);
    const ordered = [...index.filter((key) => !recentSet.has(key)), ...recent];
    const overflowCount = Math.max(0, ordered.length - MAX_ITEMS);
    const drop = ordered.slice(0, overflowCount);
    const keep = ordered.slice(overflowCount);
    const removed = drop.length ? await remove(drop) : true;
    const indexed = await saveIndex(keep);
    if (!removed || !indexed) {
      return false;
    }
    return true;
  }

  async function setMany(entries) {
    // 入队前复制已完整校验的条目，排队期间调用方不能再改写存储目标。
    const list = validateEntries(entries);
    const task = writeTask.then(
      () => writeMany(list),
      () => writeMany(list),
    );
    writeTask = task.then(() => undefined, () => undefined);
    return task;
  }

  async function sweep() {
    const now = Date.now();
    const keys = await indexKeys();
    const all = await get(keys);
    const entries = keys
      .map((key) => [key, all?.[key]])
      .filter(([, item]) => item)
      .sort((a, b) => (b[1]?.time || 0) - (a[1]?.time || 0));
    const drop = [];
    const keep = [];
    entries.forEach(([key, item], idx) => {
      if (!fresh(item, now) || idx >= MAX_ITEMS) {
        drop.push(key);
      } else {
        keep.push(key);
      }
    });
    if (drop.length) {
      await remove(drop);
    }
    await saveIndex(keep);
    return drop.length;
  }

  async function clear() {
    const keys = await indexKeys();
    if (keys.length) {
      await remove(keys);
    }
    await remove([INDEX_KEY]);
    return true;
  }

  Object.assign(api, {
    ready: true,
    STORE_KEY,
    INDEX_KEY,
    TTL_MS,
    limits: LIMITS,
    validateKeys,
    validateEntries,
    batchKeys,
    batchEntries,
    cacheKey,
    getMany,
    setMany,
    sweep,
    clear,
  });
})();
