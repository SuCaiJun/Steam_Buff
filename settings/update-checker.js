/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 更新检查公共客户端
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  if (root.STUpdateChecker) {
    return;
  }

  const CFG = root.STConfig || {};
  const CACHE_KEY = "steam_buff_update_check_cache";
  const MUTE_KEY = "steam_buff_update_prompt_mute";
  const ABOUT_STATUS_SOURCE = "about-status";
  const UPDATE_PAGE = CFG.urls?.updatePage || CFG.urls?.homepage || root.chrome?.runtime?.getManifest?.()?.homepage_url || "";
  const detailCache = new Map();
  const log = root.STLoggerFactory.createLogger("settings", "update-reminder");

  function text(key, fallback, params) {
    return root.STI18n.text(key, fallback, params);
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

  function verLabel(value, fallback = null) {
    const version = verText(value);
    const missing = fallback == null ? text("about.common.unknownVersion", "未知版本") : fallback;
    return version ? `v${version}` : String(value || missing);
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
      return root.chrome?.runtime?.getManifest?.()?.version || "";
    } catch {
      return "";
    }
  }

  function storageGet(keys) {
    return new Promise((resolve) => {
      try {
        root.chrome?.storage?.local?.get(keys, (data) => {
          resolve(root.chrome?.runtime?.lastError ? {} : (data || {}));
        });
      } catch {
        resolve({});
      }
    });
  }

  function storageSet(data) {
    return new Promise((resolve) => {
      try {
        root.chrome?.storage?.local?.set(data, () => {
          resolve(!root.chrome?.runtime?.lastError);
        });
      } catch {
        resolve(false);
      }
    });
  }

  function normalizeCheckResponse(response) {
    return response?.data || response;
  }

  function send(message) {
    return new Promise((resolve, reject) => {
      try {
        if (root.STMessageBus?.send) {
          root.STMessageBus.send(message, {
            timeoutMs: message?.type === "UPDATE_CHECK" ? 10_000 : 12_000,
          }).then((response) => {
            if (!response?.success) {
              reject(new Error(response?.error || text("about.update.checkFailedTitle", "更新检查失败")));
              return;
            }
            resolve(normalizeCheckResponse(response));
          }).catch(reject);
          return;
        }
        root.chrome.runtime.sendMessage(message, (response) => {
          const error = root.chrome?.runtime?.lastError;
          if (error) {
            reject(new Error(error.message || text("about.logs.backgroundFailed", "后台请求失败")));
            return;
          }
          if (!response?.success) {
            reject(new Error(response?.error || text("about.update.checkFailedTitle", "更新检查失败")));
            return;
          }
          resolve(normalizeCheckResponse(response));
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function check(options = {}) {
    if (isStoreVersion()) {
      throw new Error(text("about.update.storeVersionDisabled", "商店版已禁用主动更新检查"));
    }
    return send({ type: "UPDATE_CHECK", manual: options.manual === true });
  }

  async function checkStatus() {
    return send({ type: "UPDATE_CHECK", manual: false, source: ABOUT_STATUS_SOURCE });
  }

  function isStoreVersion() {
    return CFG.distribution.isStoreVersion();
  }

  async function cached() {
    const data = await storageGet([CACHE_KEY]);
    const box = data[CACHE_KEY];
    const result = box?.result || null;
    if (!result || verText(result.current) !== verText(version())) {
      return null;
    }
    return result;
  }

  async function muteToday(versionValue) {
    const versionText = verText(versionValue);
    const ok = await storageSet({
      [MUTE_KEY]: {
        date: todayKey(),
        version: versionText,
        ts: Date.now(),
      },
    });
    log[ok ? "info" : "warn"]("update-prompt-mute-today", ok ? "用户选择今天不再提醒更新" : "今天不再提醒状态保存失败", {
      version: versionText,
    });
    return ok;
  }

  async function isMuted(info) {
    const remote = verText(info?.remote || info?.latest?.version);
    if (!remote) {
      return false;
    }
    const data = await storageGet([MUTE_KEY]);
    const mute = data[MUTE_KEY] || {};
    return mute.date === todayKey() && verText(mute.version) === remote;
  }

  function openDownload(url, meta = {}) {
    const target = String(url || UPDATE_PAGE || "").trim();
    if (!target) {
      return false;
    }
    log.info("update-prompt-open-download", "用户打开官网下载新版", meta);
    return CFG.externalNavigation.open(target);
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function cleanText(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function apiData(payload) {
    return payload && typeof payload === "object" ? payload.data : null;
  }

  function updateDetailUrl(versionValue) {
    const value = verText(versionValue) || String(versionValue || "").trim();
    if (!value) {
      return "";
    }
    if (typeof CFG.urls?.updateLog === "function") {
      return CFG.urls.updateLog(value);
    }
    return typeof CFG.steamBuff === "function" ? CFG.steamBuff(`/update-logs/${encodeURIComponent(value)}`) : "";
  }

  function htmlFromContent(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return "";
    }
    const html = root.STUpdateLogRenderer?.contentHtml?.(raw);
    return html || esc(cleanText(raw));
  }

  function latestHtml(latest) {
    const html = htmlFromContent(latest?.content || latest?.html || "");
    if (html) {
      return html;
    }
    const empty = text("about.update.noLog", "无更新日志");
    const contentText = cleanText(latest?.desc || latest?.summary || latest?.title || empty);
    return esc(contentText || empty);
  }

  function normalizeDetail(payload) {
    const row = apiData(payload);
    if (!row || typeof row !== "object") {
      throw new Error("官网更新日志详情格式异常");
    }
    const versionText = verText(row.version) || String(row.version || "").trim();
    const content = String(row.content || "");
    const contentText = root.STUpdateLogRenderer?.contentText?.(content) || content.replace(/<[^>]+>/g, " ");
    return {
      version: versionText,
      title: cleanText(row.title || ""),
      summary: cleanText(row.summary || ""),
      content,
      desc: cleanText(row.summary || row.title || contentText),
      releaseDate: cleanText(row.release_date || ""),
      publishedAt: cleanText(row.published_at || ""),
      updatedAt: cleanText(row.updated_at || ""),
    };
  }

  function fetchJson(url, label) {
    return root.STSettingsApiRequest.getJson(url, { label });
  }

  async function detail(versionValue) {
    const versionText = verText(versionValue);
    if (!versionText) {
      return null;
    }
    if (detailCache.has(versionText)) {
      return detailCache.get(versionText);
    }
    const url = updateDetailUrl(versionText);
    if (!url) {
      return null;
    }
    const startedAt = Date.now();
    try {
      const item = normalizeDetail(await fetchJson(url, "官网更新日志详情"));
      detailCache.set(versionText, item);
      log.info("update-log-detail-success", "更新日志详情读取成功", {
        version: versionText,
        durationMs: Date.now() - startedAt,
      });
      return item;
    } catch (error) {
      log.warn("update-log-detail-failed", "更新日志详情读取失败", {
        version: versionText,
        error,
        durationMs: Date.now() - startedAt,
      });
      return null;
    }
  }

  async function withDetail(latest) {
    const versionText = verText(latest?.version);
    if (!versionText) {
      return latest || {};
    }
    const item = await detail(versionText);
    return item ? { ...(latest || {}), ...item } : (latest || {});
  }

  root.STUpdateChecker = Object.freeze({
    CACHE_KEY,
    MUTE_KEY,
    UPDATE_PAGE,
    todayKey,
    verText,
    verLabel,
    cmpVer,
    version,
    check,
    checkStatus,
    isStoreVersion,
    cached,
    muteToday,
    isMuted,
    openDownload,
    latestHtml,
    detail,
    withDetail,
    esc,
    cleanText,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
