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
    } catch {
      return [];
    }
  }

  async function fetchGames(ids) {
    const uniq = normIds(ids);
    if (uniq.length === 0) return [];

    const out = new Map();
    const missing = [];

    uniq.forEach((id) => {
      const value = cached(id);
      if (value) {
        out.set(id, value);
      } else {
        missing.push(id);
      }
    });

    if (missing.length > 0) {
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
    }

    return uniq.map((id) => out.get(id)).filter(Boolean);
  }

  async function fetchGame(id) {
    const games = await fetchGames([id]);
    return games[0] || null;
  }

  api.subs = Object.assign(api.subs || {}, {
    fetchGames,
    fetchGame,
  });
})();
