/*
 * @Author        : 顾青离
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
  const UPDATE_PAGE = CFG.urls?.updatePage || CFG.urls?.homepage || root.chrome?.runtime?.getManifest?.()?.homepage_url || "";
  const detailCache = new Map();

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

  function verLabel(value, fallback = "未知版本") {
    const version = verText(value);
    return version ? `v${version}` : String(value || fallback);
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

  function log(level, event, message, meta = {}) {
    try {
      const entry = { domain: "settings", feature: "update-reminder", event, message, meta };
      if (level === "error") root.STLogger?.error?.(entry);
      else if (level === "warn") root.STLogger?.warn?.(entry);
      else root.STLogger?.info?.(entry);
    } catch {
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

  function send(message) {
    return new Promise((resolve, reject) => {
      try {
        root.chrome.runtime.sendMessage(message, (response) => {
          const error = root.chrome?.runtime?.lastError;
          if (error) {
            reject(new Error(error.message || "后台请求失败"));
            return;
          }
          if (!response?.success) {
            reject(new Error(response?.error || "更新检查失败"));
            return;
          }
          resolve(response.data || response);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function check(options = {}) {
    return send({ type: "UPDATE_CHECK", manual: options.manual === true });
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
    log(ok ? "info" : "warn", "update-prompt-mute-today", ok ? "用户选择今天不再提醒更新" : "今天不再提醒状态保存失败", {
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

  function externalUrl(url) {
    const value = String(url || UPDATE_PAGE || "").trim();
    if (!value) {
      return "";
    }
    return typeof CFG.toSteamExternalUrl === "function" ? CFG.toSteamExternalUrl(value) : value;
  }

  function openDownload(url, meta = {}) {
    const target = externalUrl(url || UPDATE_PAGE);
    if (!target) {
      return false;
    }
    log("info", "update-prompt-open-download", "用户打开官网下载新版", meta);
    const link = document.createElement("a");
    link.href = target;
    link.rel = "noreferrer noopener";
    link.style.display = "none";
    (document.body || document.documentElement).appendChild(link);
    link.click();
    link.remove();
    return true;
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

  function parseJson(text) {
    try {
      return JSON.parse(text || "{}");
    } catch {
      throw new Error("官网接口返回解析失败");
    }
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

  function nodeText(node) {
    const text = cleanText(node?.textContent || "");
    return text ? esc(text) : "";
  }

  function safeNode(node) {
    if (!node) {
      return "";
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return esc(node.textContent || "");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }
    const tag = String(node.tagName || "").toLowerCase();
    if (tag === "script" || tag === "style" || tag === "button") {
      return "";
    }
    if (tag === "br") {
      return "<br>";
    }
    const inner = Array.from(node.childNodes || []).map(safeNode).join("");
    if (/^h[1-6]$/.test(tag)) {
      return `<h3>${inner || nodeText(node)}</h3>`;
    }
    if (["p", "ul", "ol", "li", "strong", "b", "em", "i", "code"].includes(tag)) {
      return `<${tag}>${inner || nodeText(node)}</${tag}>`;
    }
    return inner;
  }

  function htmlFromContent(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return "";
    }
    try {
      const doc = new DOMParser().parseFromString(raw, "text/html");
      return Array.from(doc.body?.childNodes || []).map(safeNode).join("").trim();
    } catch {
      return esc(cleanText(raw));
    }
  }

  function latestHtml(latest) {
    const html = htmlFromContent(latest?.content || latest?.html || "");
    if (html) {
      return html;
    }
    const text = cleanText(latest?.desc || latest?.summary || latest?.title || "无更新日志");
    return esc(text || "无更新日志");
  }

  function normalizeDetail(payload) {
    const row = apiData(payload);
    if (!row || typeof row !== "object") {
      throw new Error("官网更新日志详情格式异常");
    }
    const versionText = verText(row.version) || String(row.version || "").trim();
    const content = String(row.content || "");
    return {
      version: versionText,
      title: cleanText(row.title || ""),
      summary: cleanText(row.summary || ""),
      content,
      desc: cleanText(row.summary || row.title || content.replace(/<[^>]+>/g, " ")),
      releaseDate: cleanText(row.release_date || ""),
      publishedAt: cleanText(row.published_at || ""),
      updatedAt: cleanText(row.updated_at || ""),
    };
  }

  function fetchJson(url, label) {
    return new Promise((resolve, reject) => {
      try {
        root.chrome.runtime.sendMessage({
          type: "STORE_FETCH",
          url,
          method: "GET",
          headers: { Accept: "application/json" },
          allowHttpError: true,
        }, (response) => {
          const error = root.chrome?.runtime?.lastError;
          if (error) {
            reject(new Error(error.message || "后台请求失败"));
            return;
          }
          if (!response?.success) {
            reject(new Error(response?.error || `${label}请求失败`));
            return;
          }
          if (response.ok === false) {
            reject(new Error(`${label}返回状态码 ${response.status || 0}`));
            return;
          }
          try {
            const payload = parseJson(response.data);
            if (payload?.code && Number(payload.code) !== 200) {
              reject(new Error(payload.message || `${label}请求失败`));
              return;
            }
            resolve(payload);
          } catch (parseError) {
            reject(parseError);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
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
      log("info", "update-log-detail-success", "更新日志详情读取成功", {
        version: versionText,
        durationMs: Date.now() - startedAt,
      });
      return item;
    } catch (error) {
      log("warn", "update-log-detail-failed", "更新日志详情读取失败", {
        version: versionText,
        error: error?.message || String(error),
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
    cached,
    muteToday,
    isMuted,
    openDownload,
    externalUrl,
    latestHtml,
    detail,
    withDetail,
    esc,
    cleanText,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
