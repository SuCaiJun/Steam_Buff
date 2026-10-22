/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 订阅信息接口封装
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const apiCache = api.cache;
  const sendRequest = api.net.sendRequest;
  const URL = globalThis.STConfig.urls.subscriptionInfoGameData;
  const VERSION = "2-1-2";
  const TTL = 6 * 60 * 60 * 1000;
  const mem = new Map();
  const pending = new Map();
  const queued = new Set();
  const MAX_REQUESTS = 2;
  let running = 0;
  let pumpQueued = false;

  function normIds(ids) {
    return Array.from(new Set((ids || [])
      .map((id) => parseInt(id, 10))
      .filter((id) => Number.isFinite(id) && id > 0)));
  }

  function key(id) {
    return `subscription_info::game::${id}`;
  }

  function normalizeGame(id, value) {
    if (!value || typeof value !== "object") {
      return { sid: id, status: "missing" };
    }
    return Object.assign({ sid: id, status: "missing" }, value);
  }

  function cached(id) {
    if (mem.has(id)) return mem.get(id);
    const value = apiCache.get(key(id));
    if (!value) return null;
    const game = normalizeGame(id, value);
    mem.set(id, game);
    return game;
  }

  function save(game) {
    const id = parseInt(game?.sid, 10);
    if (!Number.isFinite(id) || id <= 0) return;
    const value = normalizeGame(id, game);
    mem.set(id, value);
    apiCache.set(key(id), value, null, TTL);
  }

  function parseResponse(value) {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch (error) {
      globalThis.STLoggerFactory.reportError(error, { domain: "store", feature: "api-subscription-info", event: "parse-response-failed", message: "解析接口回复失败", level: "warn", phase: "parseResponse" });
      return [];
    }
  }

  async function fetchMissing(missing) {
    const out = new Map();
    const data = { ids: missing, v: VERSION };
    const response = parseResponse(await sendRequest({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      url: URL,
      data: JSON.stringify(data),
      parseJSON: true,
      requestData: data,
      timeoutMs: 10 * 1000,
      retries: 1,
      validate(value) {
        return Array.isArray(value);
      },
    }));

    const found = new Set();
    if (Array.isArray(response)) {
      response.forEach((item) => {
        const id = parseInt(item?.sid, 10);
        if (!Number.isFinite(id) || id <= 0) return;
        found.add(id);
        const game = normalizeGame(id, item);
        save(game);
        out.set(id, game);
      });
    }

    missing.forEach((id) => {
      if (found.has(id)) return;
      const game = { sid: id, status: "missing" };
      save(game);
      out.set(id, game);
    });
    return out;
  }

  function schedulePump() {
    if (pumpQueued || !queued.size || running >= MAX_REQUESTS) return;
    pumpQueued = true;
    queueMicrotask(() => {
      pumpQueued = false;
      const ids = Array.from(queued);
      if (!ids.length || running >= MAX_REQUESTS) return;
      queued.clear();
      running += 1;
      fetchMissing(ids).then((games) => {
        ids.forEach(id => {
          const entry = pending.get(id);
          pending.delete(id);
          entry.resolve(games.get(id));
        });
      }, (error) => {
        ids.forEach(id => {
          const entry = pending.get(id);
          pending.delete(id);
          entry.reject(error);
        });
      }).finally(() => {
        running -= 1;
        schedulePump();
      });
    });
  }

  // 同一服务同一 AppID 共用进行中的只读查询；同轮新增 ID 合成原有批量请求
  // 独立批次最多两个并发，失败释放占用后可重试，结果顺序和负缓存语义保持不变
  async function fetchGames(ids) {
    return Promise.all(normIds(ids).map(id => {
      const value = cached(id);
      if (value) return value;
      let entry = pending.get(id);
      if (!entry) {
        entry = {};
        entry.promise = new Promise((resolve, reject) => {
          entry.resolve = resolve;
          entry.reject = reject;
        });
        pending.set(id, entry);
        queued.add(id);
        schedulePump();
      }
      return entry.promise;
    }));
  }

  async function fetchGame(id) {
    const games = await fetchGames([id]);
    return games[0] || null;
  }

  api.subs = Object.assign(api.subs || {}, {
    fetchGames,
    fetchGame,
    // 返回现有内存/持久缓存中的游戏记录（含 missing），未命中返回 null，不发请求
    getCachedGame(id) {
      const value = normIds([id])[0];
      return value ? cached(value) : null;
    },
  });
})();
