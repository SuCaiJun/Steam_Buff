/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 后台更新检查与定时缓存
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  if (root.STBackgroundUpdate?.ready) {
    return;
  }

  const CFG = root.STConfig;
  const CACHE_KEY = "steam_buff_update_check_cache";
  const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
  const UPDATE_FETCH_TIMEOUT_MS = 10 * 1000;
  const logger = root.STLoggerFactory.createLogger("background", "update");

  function log(level, event, message, details) {
    const fn = logger[level] || logger.info;
    fn(event, message, details || {});
  }

  function pad(value) {
    return String(Math.max(0, Number(value) || 0)).padStart(2, "0");
  }

  function todayKey(ts = Date.now()) {
    const date = new Date(Number(ts) || Date.now());
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function verText(value) {
    const match = String(value || "").match(/v?\d+(?:\.\d+){1,3}/i);
    return match ? match[0].replace(/^v/i, "") : "";
  }

  function cmpVer(left, right) {
    const a = verText(left).split(".").map(num => Number.parseInt(num, 10) || 0);
    const b = verText(right).split(".").map(num => Number.parseInt(num, 10) || 0);
    const len = Math.max(a.length, b.length);
    for (let idx = 0; idx < len; idx += 1) {
      const diff = (a[idx] || 0) - (b[idx] || 0);
      if (diff !== 0) {
        return diff > 0 ? 1 : -1;
      }
    }
    return 0;
  }

  function version() {
    try {
      return chrome.runtime.getManifest().version || "";
    } catch {
      return "";
    }
  }

  function storageGet(keys) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.get(keys, (data) => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(new Error(error.message || "读取更新缓存失败"));
            return;
          }
          resolve(data || {});
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function storageSet(data) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.set(data, () => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(new Error(error.message || "写入更新缓存失败"));
            return;
          }
          resolve(true);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function parseJson(text) {
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function httpError(status, text) {
    void text;
    return `HTTP状态码错误: ${status}`;
  }

  function timeoutError(timeoutMs) {
    const error = new Error(`请求超时（${Math.round(timeoutMs)}ms）`);
    error.name = "TimeoutError";
    return error;
  }

  async function fetchWithTimeout(url, init, timeoutMs = UPDATE_FETCH_TIMEOUT_MS) {
    const timeout = Number(timeoutMs) || 0;
    if (timeout <= 0) {
      return fetch(url, init);
    }
    if (typeof AbortController === "function") {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(timeoutError(timeout)), timeout);
      try {
        return await fetch(url, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    }
    let timer = 0;
    return Promise.race([
      fetch(url, init),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(timeout)), timeout);
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  function cleanText(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function normalizeLatest(payload) {
    const row = payload && typeof payload === "object" ? payload.data : null;
    if (!row || typeof row !== "object") {
      throw new Error("官网最新版本格式异常");
    }
    const latest = {
      version: verText(row.version) || String(row.version || "").trim(),
      title: cleanText(row.title || ""),
      summary: cleanText(row.summary || ""),
      content: String(row.content || ""),
      desc: cleanText(row.summary || row.title || String(row.content || "").replace(/<[^>]+>/g, " ")),
      releaseDate: cleanText(row.release_date || ""),
      publishedAt: cleanText(row.published_at || ""),
      updatedAt: cleanText(row.updated_at || ""),
    };
    if (!latest.version) {
      throw new Error("官网最新版本缺少版本号");
    }
    return latest;
  }

  function resultFromLatest(latest, checkedAt = Date.now(), fromCache = false) {
    const current = version() || "未知版本";
    const remote = verText(latest?.version);
    return {
      current,
      remote,
      latest,
      link: CFG.urls.updatePage,
      hasNew: !!remote && !!verText(current) && cmpVer(remote, current) > 0,
      checkedAt,
      fromCache,
    };
  }

  async function readCache() {
    const data = await storageGet([CACHE_KEY]);
    return data[CACHE_KEY] || null;
  }

  function cacheFresh(cache, now = Date.now()) {
    const checkedAt = Number(cache?.checkedAt || cache?.result?.checkedAt) || 0;
    const age = Math.max(0, (Number(now) || Date.now()) - checkedAt);
    return checkedAt > 0 && age < AUTO_CHECK_INTERVAL_MS;
  }

  async function writeCache(result) {
    const box = {
      date: todayKey(result.checkedAt),
      checkedAt: result.checkedAt,
      result,
    };
    await storageSet({ [CACHE_KEY]: box });
    return box;
  }

  async function fetchLatest(manual, operationId = "") {
    const response = await fetchWithTimeout(CFG.urls.updateLatest, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-cache",
      credentials: "omit",
    }, UPDATE_FETCH_TIMEOUT_MS);
    const text = await response.text();
    if (!response.ok) {
      throw new Error(httpError(response.status, text));
    }
    const data = parseJson(text);
    if (!data) {
      throw new Error("官网最新版本返回解析失败");
    }
    const result = resultFromLatest(normalizeLatest(data), Date.now(), false);
    await writeCache(result);
    if (manual) {
      log("info", "update-manual-check-success", "手动检查更新成功", {
        operationId,
        current: result.current,
        remote: result.remote,
        hasNew: result.hasNew,
      });
    } else if (result.hasNew) {
      log("info", "update-new-version-found", "自动检查发现新版本", {
        current: result.current,
        remote: result.remote,
      });
    }
    return result;
  }

  let autoPending = null;

  async function autoCheck() {
    const cache = await readCache();
    if (cacheFresh(cache) && cache.result && verText(cache.result.current) === verText(version())) {
      const result = { ...cache.result, fromCache: true };
      return result;
    }
    if (!autoPending) {
      autoPending = fetchLatest(false)
        .catch((error) => {
          log("error", "update-auto-check-failed", "自动检查更新失败", {
            error,
          });
          throw error;
        })
        .finally(() => {
          autoPending = null;
        });
    }
    return autoPending;
  }

  async function updateCheck(request, sender, sendResponse) {
    const manual = request?.manual === true;
    const operationId = manual ? root.STLoggerFactory?.createOperationId?.() || "" : "";
    try {
      if (manual) {
        log("info", "update-manual-check-start", "开始手动检查更新", { operationId });
        sendResponse({ success: true, data: await fetchLatest(true, operationId) });
        return;
      }
      sendResponse({ success: true, data: await autoCheck() });
    } catch (error) {
      if (manual) {
        log("error", "update-manual-check-failed", "手动检查更新失败", {
          operationId,
          error,
        });
      }
      sendResponse({ success: false, error: error?.message || String(error) });
    }
  }

  root.STBackgroundUpdate = Object.freeze({
    ready: true,
    CACHE_KEY,
    AUTO_CHECK_INTERVAL_MS,
    todayKey,
    cacheFresh,
    updateCheck,
  });
})(typeof globalThis !== "undefined" ? globalThis : self);
