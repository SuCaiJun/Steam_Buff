/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页缓存工具
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore = window.STStore || {};
  const CACHE_CLEANUP_TASK = "store-cache-cleanup";
  const CACHE_CLEANUP_MS = 5 * 60 * 1000;
  const CACHE_WRITE_TASK = "store-cache-write";
  const CACHE_WRITE_MS = 1000;
  const CACHE_RETRY_MS = 5000;
  const CACHE_MAX_WRITE_ATTEMPTS = 3;
  const CACHE_MAX_ENTRIES = 300;
  const CACHE_MAX_STORAGE_BYTES = 1024 * 1024;
  let managerSequence = 0;

  function entrySize(key, value) {
    try {
      return key.length + JSON.stringify(value).length;
    } catch {
      return key.length;
    }
  }

  function entryTime(value) {
    return Number(value?.createdAt || value?.expiresAt || 0);
  }

  function emptyCapacity() {
    return { sizes: new Map(), bytes: 2 };
  }

  function updateCapacity(capacity, key, size) {
    if (capacity.sizes.has(key)) {
      capacity.bytes += size - capacity.sizes.get(key);
    } else {
      capacity.bytes += size + (capacity.sizes.size > 0 ? 1 : 0);
    }
    capacity.sizes.set(key, size);
  }

  function removeCapacity(capacity, key) {
    if (!capacity.sizes.has(key)) return;
    capacity.bytes -= capacity.sizes.get(key) + (capacity.sizes.size > 1 ? 1 : 0);
    capacity.sizes.delete(key);
  }

  function serializeEntry(key, value) {
    // 沿用 JSON 字符长度口径，并计入 key 转义、引号和冒号。
    return JSON.stringify({ [key]: value }).slice(1, -1);
  }

  function prepareCache(cache) {
    const capacity = emptyCapacity();
    const parts = new Map();
    for (const key of Object.keys(cache)) {
      const part = serializeEntry(key, cache[key]);
      parts.set(key, part);
      updateCapacity(capacity, key, part.length);
    }
    return { capacity, parts };
  }

  function pruneOverflow(cache) {
    const entries = Object.entries(cache).map(([key, value]) => ({
      key,
      time: entryTime(value),
      size: entrySize(key, value),
    }));
    entries.sort((left, right) => left.time - right.time || right.size - left.size);
    const count = Math.max(1, Math.ceil(entries.length * 0.15));
    const removed = entries.slice(0, count).map(entry => entry.key);
    removed.forEach(key => delete cache[key]);
    return removed;
  }

  function quotaAttemptLimit(count) {
    let attempts = 1;
    while (count > 0) {
      count -= Math.max(1, Math.ceil(count * 0.15));
      attempts++;
    }
    return attempts;
  }

  function cacheStorageBytes(cache) {
    try {
      return JSON.stringify(cache).length;
    } catch {
      return Object.entries(cache).reduce((sum, [key, value]) => sum + entrySize(key, value), 0);
    }
  }

  function pruneCapacity(cache, maxEntries, maxBytes, capacity) {
    if (capacity.sizes.size <= maxEntries && capacity.bytes <= maxBytes) return 0;
    const entries = Object.entries(cache);
    entries.sort((left, right) => entryTime(left[1]) - entryTime(right[1]));
    let removed = 0;
    for (const [key] of entries) {
      if (capacity.sizes.size <= maxEntries && capacity.bytes <= maxBytes) break;
      delete cache[key];
      removeCapacity(capacity, key);
      removed++;
    }
    return removed;
  }

  class CacheManager {
    constructor() {
      this.storageKey = 'steam_helper_api_cache';
      this.defaultTTL = 30 * 60 * 1000;
      this.maxEntries = CACHE_MAX_ENTRIES;
      this.maxStorageBytes = CACHE_MAX_STORAGE_BYTES;
      this.capacity = emptyCapacity();
      this.cache = this._loadCache();
      this.dirty = false;
      this.failedWrites = 0;
      this.writeFailed = false;
      this.quotaMaxAttempts = 0;
      this.retryAt = 0;
      this.writeBlocked = false;
      this.disposed = false;
      this.resource = null;
      const sequence = managerSequence++;
      this.writeTaskName = sequence === 0 ? CACHE_WRITE_TASK : `${CACHE_WRITE_TASK}-${sequence}`;
      this.cleanupTaskName = null;

      this.onVisibilityChange = () => {
        if (!this.dirty || this.disposed) return;
        if (document.hidden) {
          this._forceFlush("hidden");
        } else {
          this.failedWrites = 0;
          this.quotaMaxAttempts = 0;
          this.retryAt = 0;
          this.writeBlocked = false;
        }
      };
      this.onPageHide = event => {
        if (event.persisted) this._forceFlush("pagehide");
        else this._dispose();
      };
      document.addEventListener("visibilitychange", this.onVisibilityChange);
      window.addEventListener("pagehide", this.onPageHide);
      window.STScheduler.register(
        this.writeTaskName,
        () => this._flushCache("scheduled"),
        () => this._canRun() && this.dirty && !this.writeBlocked && Date.now() >= this.retryAt,
        { intervalMs: CACHE_WRITE_MS },
      );
    }

    _loadCache() {
      try {
        const data = localStorage.getItem(this.storageKey);
        if (data) {
          const cache = JSON.parse(data);
          if (cache && typeof cache === "object" && !Array.isArray(cache)) {
            this.capacity = prepareCache(cache).capacity;
            pruneCapacity(cache, this.maxEntries, this.maxStorageBytes, this.capacity);
            return cache;
          }
        }
      } catch (e) {
      }
      this.capacity = emptyCapacity();
      return {};
    }

    _canRun() {
      if (this.disposed) return false;
      // 内核在后续 Store 注册器中建立，登记资源不提前改变启动顺序。
      if (!this.resource) {
        this.resource = window.STRuntime?.current?.()?.registerResource?.({
          owner: "store:cache",
          key: this.writeTaskName,
          type: "custom",
          dispose: () => this._dispose(),
        }) || null;
      }
      if (document.hidden) return false;
      const type = window.STPageContext.storePageType();
      return !!type && type !== "age";
    }

    _saveCache() {
      if (this.capacity.sizes.size > this.maxEntries || this.capacity.bytes > this.maxStorageBytes) {
        this.clearExpired(false);
        pruneCapacity(this.cache, this.maxEntries, this.maxStorageBytes, this.capacity);
      }
      this.dirty = true;
    }

    _flushCache(reason) {
      if (!this.dirty || this.disposed) return true;
      if (this.writeBlocked || Date.now() < this.retryAt) return false;
      try {
        this.clearExpired(false);
        // 重新读取当前对象，兼容调用方持有的数据引用；每个条目只序列化一次。
        const prepared = prepareCache(this.cache);
        this.capacity = prepared.capacity;
        pruneCapacity(this.cache, this.maxEntries, this.maxStorageBytes, this.capacity);
        const serialized = `{${Object.keys(this.cache).map(key => prepared.parts.get(key)).join(",")}}`;
        localStorage.setItem(this.storageKey, serialized);
        this.dirty = false;
        if (this.writeFailed) {
          window.STLoggerFactory.createLogger("store", "cache").warn(
            "cache-write-recovered", "商店缓存恢复保存", { reason, attempts: this.failedWrites + 1 },
          );
        }
        this.failedWrites = 0;
        this.writeFailed = false;
        this.quotaMaxAttempts = 0;
        this.retryAt = 0;
        return true;
      } catch (error) {
        this.reportFailure(error, reason);
        return false;
      }
    }

    reportFailure(error, reason) {
      this.failedWrites++;
      this.writeFailed = true;
      const quota = error.name === "QuotaExceededError";
      if (quota && this.quotaMaxAttempts === 0) {
        // 以首次失败时的条目数限定重试，新请求补入缓存也不能延长这轮重试。
        this.quotaMaxAttempts = quotaAttemptLimit(this.capacity.sizes.size);
      }
      const removed = quota ? pruneOverflow(this.cache) : [];
      removed.forEach(key => removeCapacity(this.capacity, key));
      const retry = quota
        ? removed.length > 0 && this.failedWrites < this.quotaMaxAttempts
        : this.failedWrites < CACHE_MAX_WRITE_ATTEMPTS;
      this.writeBlocked = !retry;
      this.retryAt = Date.now() + CACHE_RETRY_MS;
      window.STLoggerFactory.reportError(error, {
        domain: "store", feature: "cache",
        event: retry ? "cache-write-retry" : "cache-write-failed",
        message: retry ? "商店缓存保存失败，稍后重试" : "商店缓存保存失败，保留内存缓存并暂停重试",
        level: retry ? "warn" : "error", phase: "persist",
        details: { reason, evictedCount: removed.length, retry: { attempt: this.failedWrites, delayMs: retry ? CACHE_RETRY_MS : 0 } },
      });
    }

    _forceFlush(reason) {
      return this._flushCache(reason);
    }

    _dispose() {
      if (this.disposed) return;
      this._forceFlush("dispose");
      this.disposed = true;
      window.STScheduler.unregister(this.writeTaskName);
      if (this.cleanupTaskName) window.STScheduler.unregister(this.cleanupTaskName);
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
      window.removeEventListener("pagehide", this.onPageHide);
    }

    _generateKey(url, data = null) {
      if (!data) return url;
      return `${url}::${JSON.stringify(data)}`;
    }

    _deleteEntry(key) {
      delete this.cache[key];
      removeCapacity(this.capacity, key);
    }

    get(url, data = null) {
      const key = this._generateKey(url, data);
      const cached = this.cache[key];
      if (!cached) return null;
      if (Date.now() > cached.expiresAt) {
        this._deleteEntry(key);
        this._saveCache();
        return null;
      }
      return cached.data;
    }

    set(url, data, requestData = null, ttl = null) {
      const key = this._generateKey(url, requestData);
      const now = Date.now();
      const value = { data, expiresAt: now + (ttl || this.defaultTTL), createdAt: now };
      let size;
      try {
        size = serializeEntry(key, value).length;
      } catch (error) {
        window.STLoggerFactory.reportError(error, {
          domain: "store", feature: "cache", event: "cache-entry-serialize-failed",
          message: "商店缓存数据无法序列化，保留已有缓存", phase: "set",
        });
        return;
      }
      this.cache[key] = value;
      updateCapacity(this.capacity, key, size);
      this._saveCache();
    }

    delete(url, data = null) {
      const key = this._generateKey(url, data);
      const existed = key in this.cache;
      if (existed) {
        this._deleteEntry(key);
        this._saveCache();
      }
      return existed;
    }

    clear() {
      this.cache = {};
      this.capacity = emptyCapacity();
      this.failedWrites = 0;
      this.quotaMaxAttempts = 0;
      this.retryAt = 0;
      this.writeBlocked = false;
      this._saveCache();
      // 手动清理仍立即持久化空缓存，DLC 刷新不能读回旧数据。
      this._forceFlush("clear");
    }

    clearExpired(save = true) {
      const now = Date.now();
      let count = 0;
      for (const key in this.cache) {
        if (this.cache.hasOwnProperty(key) && now > this.cache[key].expiresAt) {
          this._deleteEntry(key);
          count++;
        }
      }
      if (save && count > 0) this._saveCache();
    }

    getStats() {
      const now = Date.now();
      let active = 0;
      let expired = 0;
      for (const key in this.cache) {
        if (this.cache.hasOwnProperty(key)) {
          if (now > this.cache[key].expiresAt) expired++;
          else active++;
        }
      }
      return {
        total: Object.keys(this.cache).length,
        active,
        expired,
        defaultTTL: this.defaultTTL,
        maxEntries: this.maxEntries,
        maxStorageBytes: this.maxStorageBytes,
        cleanupIntervalMs: CACHE_CLEANUP_MS,
        storageBytes: cacheStorageBytes(this.cache),
      };
    }
  }

  const apiCache = new CacheManager();

  function registerCleanupTask() {
    apiCache.cleanupTaskName = CACHE_CLEANUP_TASK;
    window.STScheduler.register(
      CACHE_CLEANUP_TASK,
      () => apiCache.clearExpired(),
      () => apiCache._canRun(),
      { intervalMs: CACHE_CLEANUP_MS },
    );
  }

  registerCleanupTask();
  api.CacheManager = CacheManager;
  api.cache = apiCache;
})();
