/*
 * @Author        : 顾青离
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
  const ALARM = "ai-cache-sweep";
  const TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const MAX_ITEMS = 1800;

  function area() {
    try {
      return chrome.storage.local;
    } catch {
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
          resolve(chrome.runtime.lastError ? {} : rt || {});
        });
      } catch {
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
          resolve(!chrome.runtime.lastError);
        });
      } catch {
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
          resolve(!chrome.runtime.lastError);
        });
      } catch {
        resolve(false);
      }
    });
  }

  async function indexKeys() {
    const rt = await get([INDEX_KEY]);
    return Array.isArray(rt[INDEX_KEY]) ? rt[INDEX_KEY].filter((key) => typeof key === "string" && key.startsWith(KEY_PREFIX)) : [];
  }

  async function saveIndex(keys) {
    const list = Array.from(new Set((keys || []).filter((key) => typeof key === "string" && key.startsWith(KEY_PREFIX))));
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
    const list = Array.from(new Set((keys || []).filter(Boolean)));
    if (!list.length) {
      return {};
    }
    const now = Date.now();
    const map = await get(list);
    const out = {};
    const expired = [];

    for (const key of list) {
      const item = map[key];
      if (fresh(item, now)) {
        out[key] = item.text;
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

  async function setMany(entries) {
    const list = (entries || []).filter((item) => item?.key && typeof item.text === "string");
    if (!list.length) {
      return false;
    }
    const now = Date.now();
    const data = {};
    const keys = [];
    for (const item of list) {
      data[item.key] = {
        text: item.text,
        time: now,
      };
      keys.push(item.key);
    }
    const ok = await put(data);
    if (ok) {
      const index = await indexKeys();
      await saveIndex([...index, ...keys]);
    }
    scheduleSweep();
    return ok;
  }

  function scheduleSweep() {
    try {
      chrome.alarms.create(ALARM, { periodInMinutes: 60 });
    } catch {
    }
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

  function installAlarm() {
    try {
      chrome.alarms.create(ALARM, { periodInMinutes: 60 });
      chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm?.name === ALARM) {
          sweep().catch(() => {});
        }
      });
    } catch {
    }
  }

  installAlarm();

  Object.assign(api, {
    ready: true,
    STORE_KEY,
    INDEX_KEY,
    TTL_MS,
    cacheKey,
    getMany,
    setMany,
    sweep,
    clear,
  });
})();
