/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置快照与缓存总线
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  if (root.STSettingsBus?.ready) {
    return;
  }

  const PREFIX = "st.settings.";
  const SUFFIX = ".enabled";
  const EVENT = "STSettingsSnapshotChanged";
  const POLICY = Object.freeze({
    version: 1,
    keyPrefix: PREFIX,
    featureSuffix: SUFFIX,
    cacheKeyPrefix: "st.settings.snapshot.",
    defaultTtlMs: 30 * 1000,
    maxEntries: 24,
    cleanup: "read/write/onChanged/clearOwner",
    ownerRequired: true,
  });

  const cache = new Map();
  const subscribers = new Map();
  const stats = {
    reads: 0,
    writes: 0,
    removes: 0,
    hits: 0,
    misses: 0,
    pruned: 0,
    broadcasts: 0,
    lastChangeSeq: 0,
    lastReason: "",
    lastOwner: "",
  };
  let boundStorage = false;

  function text(value) {
    return value == null ? "" : String(value);
  }

  function now() {
    return Date.now();
  }

  function featureKey(id) {
    return `${PREFIX}${text(id)}${SUFFIX}`;
  }

  function ownerOf(options = {}) {
    return text(options.owner || "settings-bus");
  }

  function cacheId(owner, key) {
    return `${text(owner) || "settings-bus"}:${text(key)}`;
  }

  function list(value) {
    return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
  }

  function store() {
    return root.chrome?.storage?.local || null;
  }

  function runtime() {
    return root.STRuntime?.current?.() || root.STRuntime?.get?.({ id: "steam-buff-page-runtime" }) || null;
  }

  function changedKeysFrom(data) {
    return Object.keys(data || {});
  }

  function normalizeKeys(keys) {
    if (Array.isArray(keys)) {
      return keys.map(String);
    }
    if (typeof keys === "string") {
      return [keys];
    }
    if (keys && typeof keys === "object") {
      return Object.keys(keys);
    }
    return [];
  }

  function prune() {
    const time = now();
    let removed = 0;
    for (const [key, item] of cache.entries()) {
      if (item.expiresAt <= time) {
        cache.delete(key);
        removed += 1;
      }
    }
    if (cache.size > POLICY.maxEntries) {
      const entries = Array.from(cache.entries())
        .sort((left, right) => left[1].createdAt - right[1].createdAt);
      for (const [key] of entries.slice(0, cache.size - POLICY.maxEntries)) {
        cache.delete(key);
        removed += 1;
      }
    }
    stats.pruned += removed;
    return removed;
  }

  function cacheGet(owner, key) {
    prune();
    const item = cache.get(cacheId(owner, key));
    if (!item || item.expiresAt <= now()) {
      stats.misses += 1;
      return null;
    }
    stats.hits += 1;
    return item.value;
  }

  function cacheSet(owner, key, value, options = {}) {
    prune();
    const ttlMs = Number(options.ttlMs ?? POLICY.defaultTtlMs);
    cache.set(cacheId(owner, key), {
      owner: text(owner) || "settings-bus",
      key: text(key),
      storageKeys: list(options.storageKeys),
      value,
      createdAt: now(),
      expiresAt: now() + (Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : POLICY.defaultTtlMs),
    });
    prune();
    return value;
  }

  function invalidateKeys(keys = []) {
    const target = new Set(list(keys));
    if (!target.size) {
      return 0;
    }
    let count = 0;
    for (const [key, item] of Array.from(cache.entries())) {
      if (!item.storageKeys?.length || item.storageKeys.some(storageKey => target.has(storageKey))) {
        cache.delete(key);
        count += 1;
      }
    }
    return count;
  }

  function rawGet(keys, options = {}) {
    const box = store();
    if (!box) {
      return Promise.resolve({});
    }
    stats.reads += 1;
    return new Promise((resolve) => {
      try {
        box.get(keys, (rt) => {
          if (root.chrome?.runtime?.lastError) {
            resolve({});
            return;
          }
          resolve(rt || {});
        });
      } catch {
        resolve({});
      }
    });
  }

  function rawSet(data, options = {}) {
    const box = store();
    if (!box) {
      return Promise.resolve(false);
    }
    stats.writes += 1;
    return new Promise((resolve) => {
      try {
        box.set(data, () => {
          const ok = !root.chrome?.runtime?.lastError;
          if (ok) {
            const keys = changedKeysFrom(data);
            invalidateKeys(keys);
            if (!boundStorage) {
              publish({
                owner: ownerOf(options),
                reason: options.reason || "write",
                changedKeys: keys,
              });
            }
          }
          resolve(ok);
        });
      } catch {
        resolve(false);
      }
    });
  }

  function rawRemove(keys, options = {}) {
    const box = store();
    if (!box) {
      return Promise.resolve(false);
    }
    const cleanKeys = normalizeKeys(keys);
    stats.removes += 1;
    return new Promise((resolve) => {
      try {
        box.remove(cleanKeys, () => {
          const ok = !root.chrome?.runtime?.lastError;
          if (ok) {
            invalidateKeys(cleanKeys);
            if (!boundStorage) {
              publish({
                owner: ownerOf(options),
                reason: options.reason || "remove",
                changedKeys: cleanKeys,
              });
            }
          }
          resolve(ok);
        });
      } catch {
        resolve(false);
      }
    });
  }

  async function loadSettingsSnapshot(options = {}) {
    const owner = ownerOf(options);
    const defaults = options.defaults && typeof options.defaults === "object" ? options.defaults : {};
    const ids = list(options.ids?.length ? options.ids : Object.keys(defaults));
    const keyBuilder = typeof options.keyBuilder === "function" ? options.keyBuilder : featureKey;
    const storageKeys = ids.map(keyBuilder);
    const cacheKey = `${POLICY.cacheKeyPrefix}${ids.join(",")}`;
    if (options.force !== true) {
      const cached = cacheGet(owner, cacheKey);
      if (cached) {
        root.STPageContext?.setSettingsSnapshot?.(cached);
        return { ...cached };
      }
    }
    const rt = await rawGet(storageKeys, { owner, reason: "snapshot-read" });
    const out = {};
    for (const id of ids) {
      const def = Object.hasOwn(defaults, id) ? defaults[id] : true;
      const value = rt[keyBuilder(id)];
      out[id] = typeof value === "boolean" ? value : def;
    }
    cacheSet(owner, cacheKey, out, {
      ttlMs: options.ttlMs,
      storageKeys,
    });
    root.STPageContext?.setSettingsSnapshot?.(out);
    publish({
      owner,
      reason: options.reason || "snapshot-load",
      snapshot: out,
      changedKeys: options.changedKeys || [],
    });
    return { ...out };
  }

  function isSettingsKey(key) {
    const value = text(key);
    return value.startsWith(PREFIX) || value === "steam_buff_membership" || value === "steam_buff_auth" || value === "SETTING_UI_LOCALE";
  }

  function isSettingsChange(changes, area = "local", options = {}) {
    if (area !== "local") {
      return false;
    }
    const prefixes = [PREFIX, ...list(options.prefixes)];
    const keys = new Set(list(options.keys));
    return Object.keys(changes || {}).some((key) => (
      keys.has(key) || prefixes.some(prefix => key.startsWith(prefix)) || isSettingsKey(key)
    ));
  }

  function subscriberHit(item, event) {
    if (!item.keys.length && !item.prefixes.length) {
      return true;
    }
    const keys = event.changedKeys || [];
    return keys.some(key => item.keys.includes(key) || item.prefixes.some(prefix => key.startsWith(prefix)));
  }

  function publish(input = {}) {
    const event = {
      type: EVENT,
      seq: stats.lastChangeSeq + 1,
      time: now(),
      owner: text(input.owner || "settings-bus"),
      reason: text(input.reason || "change"),
      changedKeys: list(input.changedKeys),
      snapshot: input.snapshot && typeof input.snapshot === "object" ? { ...input.snapshot } : null,
    };
    stats.lastChangeSeq = event.seq;
    stats.lastReason = event.reason;
    stats.lastOwner = event.owner;
    stats.broadcasts += 1;
    root.STPageContext?.setSettingsSnapshot?.(event.snapshot || root.STPageContext?.getSettingsSnapshot?.() || {});
    try {
      root.dispatchEvent?.(new CustomEvent(EVENT, { detail: event }));
    } catch {
    }
    for (const item of Array.from(subscribers.values())) {
      if (!subscriberHit(item, event)) {
        continue;
      }
      try {
        item.callback(event);
      } catch (error) {
        runtime()?.markError?.("settings-bus-subscriber-failed", error, {
          owner: item.owner,
          key: item.key,
        });
      }
    }
    return event;
  }

  function bindStorageWatcher() {
    if (boundStorage || !root.chrome?.storage?.onChanged) {
      return false;
    }
    boundStorage = true;
    try {
      root.chrome.storage.onChanged.addListener((changes, area) => {
        if (!isSettingsChange(changes, area)) {
          return;
        }
        const keys = Object.keys(changes || {});
        invalidateKeys(keys);
        publish({
          owner: "chrome.storage.onChanged",
          reason: "storage-change",
          changedKeys: keys,
        });
      });
      return true;
    } catch {
      boundStorage = false;
      return false;
    }
  }

  function subscribe(callback, options = {}) {
    if (typeof callback !== "function") {
      return null;
    }
    bindStorageWatcher();
    const owner = ownerOf(options);
    const key = text(options.key || "settings");
    const id = `${owner}:${key}:${now()}:${Math.random().toString(16).slice(2)}`;
    const item = {
      id,
      owner,
      key,
      keys: list(options.keys),
      prefixes: list(options.prefixes?.length ? options.prefixes : [PREFIX]),
      callback,
      createdAt: now(),
    };
    subscribers.set(id, item);
    const dispose = () => {
      subscribers.delete(id);
    };
    runtime()?.registerResource?.({
      owner,
      key,
      type: "settings-subscription",
      dispose,
    });
    return Object.freeze({ id, owner, key, dispose });
  }

  function clearOwner(owner) {
    const target = text(owner);
    let count = 0;
    for (const [key, item] of Array.from(cache.entries())) {
      if (item.owner === target) {
        cache.delete(key);
        count += 1;
      }
    }
    for (const [key, item] of Array.from(subscribers.entries())) {
      if (item.owner === target) {
        subscribers.delete(key);
        count += 1;
      }
    }
    return count;
  }

  function diagnostics() {
    prune();
    return {
      policy: POLICY,
      stats: { ...stats },
      cache: Array.from(cache.values()).map(item => ({
        owner: item.owner,
        key: item.key,
        storageKeys: item.storageKeys.slice(),
        expiresInMs: Math.max(0, item.expiresAt - now()),
      })),
      subscribers: Array.from(subscribers.values()).map(item => ({
        owner: item.owner,
        key: item.key,
        prefixes: item.prefixes.slice(),
        keys: item.keys.slice(),
        ageMs: now() - item.createdAt,
      })),
    };
  }

  root.STSettingsBus = Object.freeze({
    ready: true,
    EVENT,
    POLICY,
    PREFIX,
    SUFFIX,
    featureKey,
    rawGet,
    rawSet,
    rawRemove,
    loadSettingsSnapshot,
    isSettingsChange,
    subscribe,
    publish,
    clearOwner,
    prune,
    diagnostics,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
