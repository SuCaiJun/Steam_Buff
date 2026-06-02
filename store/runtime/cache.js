/*
 * @Author        : 顾青离
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

function trySave(storageKey, cache) {
    try {
        localStorage.setItem(storageKey, JSON.stringify(cache));
        return true;
    } catch {
        return false;
    }
}

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

function pruneOverflow(cache) {
    const entries = Object.entries(cache);
    if (!entries.length) return false;

    entries.sort((left, right) => {
        const timeDiff = entryTime(left[1]) - entryTime(right[1]);
        if (timeDiff !== 0) return timeDiff;
        return entrySize(right[0], right[1]) - entrySize(left[0], left[1]);
    });

    const count = Math.max(1, Math.ceil(entries.length * 0.15));
    entries.slice(0, count).forEach(([key]) => {
        delete cache[key];
    });
    return true;
}

class CacheManager {
    constructor() {
        this.storageKey = 'steam_helper_api_cache';
        this.defaultTTL = 30 * 60 * 1000;
        this.cache = this._loadCache();
    }

    _loadCache() {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (data) {
                const cache = JSON.parse(data);
                return cache;
            }
        } catch (e) {
        }
        return {};
    }

    _saveCache() {
        if (trySave(this.storageKey, this.cache)) return;

        // 存储写满时先清过期项，再按旧项/大项逐步淘汰，避免把全部缓存清空。
        this.clearExpired(false);
        if (trySave(this.storageKey, this.cache)) return;

        while (pruneOverflow(this.cache)) {
            if (trySave(this.storageKey, this.cache)) return;
        }
    }

    _generateKey(url, data = null) {
        if (!data) {
            return url;
        }
        const dataStr = JSON.stringify(data);
        return `${url}::${dataStr}`;
    }

    get(url, data = null) {
        const key = this._generateKey(url, data);
        const cached = this.cache[key];

        if (!cached) {
            return null;
        }

        const now = Date.now();
        if (now > cached.expiresAt) {
            delete this.cache[key];
            this._saveCache();
            return null;
        }

        return cached.data;
    }

    set(url, data, requestData = null, ttl = null) {
        const key = this._generateKey(url, requestData);
        const expiresAt = Date.now() + (ttl || this.defaultTTL);

        this.cache[key] = {
            data: data,
            expiresAt: expiresAt,
            createdAt: Date.now()
        };

        this._saveCache();
    }

    delete(url, data = null) {
        const key = this._generateKey(url, data);
        const existed = key in this.cache;
        if (existed) {
            delete this.cache[key];
            this._saveCache();
        }
        return existed;
    }

    clear() {
        const size = Object.keys(this.cache).length;
        this.cache = {};
        this._saveCache();
    }

    clearExpired(save = true) {
        const now = Date.now();
        let count = 0;

        for (const key in this.cache) {
            if (this.cache.hasOwnProperty(key)) {
                const value = this.cache[key];
                if (now > value.expiresAt) {
                    delete this.cache[key];
                    count++;
                }
            }
        }

        if (save && count > 0) {
            this._saveCache();
        }
    }

    getStats() {
        const now = Date.now();
        let active = 0;
        let expired = 0;

        for (const key in this.cache) {
            if (this.cache.hasOwnProperty(key)) {
                const value = this.cache[key];
                if (now > value.expiresAt) {
                    expired++;
                } else {
                    active++;
                }
            }
        }

        return {
            total: Object.keys(this.cache).length,
            active: active,
            expired: expired
        };
    }
}

const apiCache = new CacheManager();

if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        apiCache.clearExpired();
    }, 5 * 60 * 1000);
}

  api.CacheManager = CacheManager;
  api.cache = apiCache;
})();
