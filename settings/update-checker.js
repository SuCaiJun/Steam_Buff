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
  if (root.STUpdateChecker) return;
  const CFG = root.STConfig;
  const CACHE_KEY = "steam_buff_update_check_cache";
  const MUTE_KEY = "steam_buff_update_prompt_state";
  const PLAN_KEY = "steam_buff_update_schedule";
  const PORT = "steam-buff-update-prompt";
  const UPDATE_PAGE = CFG.urls.updatePage;
  const detailCache = new Map();
  const log = root.STLoggerFactory.createLogger("settings", "update-reminder");
  function text(key, fallback, params) { return root.STI18n.text(key, fallback, params); }
  function verText(value) { return CFG.versions.text(value); }
  function cmpVer(left, right) { return CFG.versions.compare(left, right); }
  function verLabel(value, fallback = null) {
    const valueText = verText(value);
    return valueText ? `v${valueText}` : String(value || (fallback ?? text("about.common.unknownVersion", "未知版本")));
  }
  function version() { return root.chrome.runtime.getManifest().version; }
  function isStoreVersion() { return CFG.distribution.isStoreVersion(); }
  async function storageGet(keys) { return root.chrome.storage.local.get(keys); }

  async function send(message) {
    const response = root.STMessageBus?.ready
      ? await root.STMessageBus.send(message, { timeoutMs: 12_000 })
      : await root.chrome.runtime.sendMessage(message);
    if (!response?.success) throw new Error(response?.error || text("about.update.checkFailedTitle", "更新检查失败"));
    return response.data;
  }
  async function check(options = {}) { return send({ type: "UPDATE_CHECK", manual: options.manual === true }); }
  async function checkStatus() { return check(); }
  async function cached() {
    const data = await storageGet([CACHE_KEY]); const box = data[CACHE_KEY];
    if (!box || box.installedVersion !== version() || box.channel !== CFG.distribution.channel()) return null;
    return box.result ? { ...box.result, fromCache: true } : null;
  }

  async function mute(info, kind) {
    return send({ type: "UPDATE_CHECK", action: kind === "version" ? "mute-version" : "mute-cycle", version: info.remote, cycleId: info.cycleId });
  }

  function updateAction(info) {
    const labels = {
      opensource: ["updateReminder.openDownload", "打开官网下载"],
      chrome: ["updateReminder.openChrome", "打开 Chrome 商店"],
      edge: ["updateReminder.openEdge", "打开 Edge 商店"],
    };
    const label = labels[info?.channel];
    if (!label || typeof info.link !== "string" || !info.link) return null;
    const url = new URL(info.link);
    if (url.protocol !== "https:" || (info.channel === "chrome" && url.hostname !== "chromewebstore.google.com")
        || (info.channel === "edge" && url.hostname !== "microsoftedge.microsoft.com")) throw new TypeError("更新页面与渠道不匹配");
    return { label: text(...label), url: url.href };
  }
  function openUpdate(info) {
    const action = updateAction(info);
    if (!action) throw new Error("更新页面尚未配置");
    log.info("update-prompt-open-page", "用户打开对应渠道更新页面", { channel: info.channel, version: info.remote });
    return CFG.externalNavigation.open(action.url);
  }
  // 保留已有公共调用名，目标校验与导航只由 openUpdate 维护
  function openDownload(url, meta = {}) { return openUpdate({ link: url, channel: CFG.distribution.channel(), remote: meta.version }); }

  /** Port 只持有当前弹窗展示权；拒绝或断开时调用方必须释放本地弹窗 */
  function claim() {
    return new Promise((resolve, reject) => {
      const port = root.chrome.runtime.connect({ name: PORT });
      let settled = false;
      const finish = (value, error) => {
        if (settled) return;
        settled = true; root.clearTimeout(timer);
        port.onMessage.removeListener(onMessage); port.onDisconnect.removeListener(onDisconnect);
        if (error) { port.disconnect(); reject(error); } else resolve(value);
      };
      const onMessage = message => {
        if (message?.granted === true) finish({ port, info: message.info });
        else if (message?.granted === false) { finish(null); port.disconnect(); }
        else finish(null, new TypeError("更新弹窗展示权响应无效"));
      };
      const onDisconnect = () => {
        const failure = root.chrome.runtime.lastError;
        finish(null, failure ? new Error(failure.message) : undefined);
      };
      const timer = root.setTimeout(() => finish(null, new Error("更新弹窗展示权请求超时")), 5000);
      port.onMessage.addListener(onMessage); port.onDisconnect.addListener(onDisconnect);
    });
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
    return CFG.urls.updateLog(value);
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
      html: htmlFromContent(content),
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
    CACHE_KEY, MUTE_KEY, PLAN_KEY, UPDATE_PAGE,
    verText, verLabel, cmpVer, version, check, checkStatus, isStoreVersion,
    cached, mute, claim, updateAction, openUpdate, openDownload,
    cachedDetail: value => detailCache.get(verText(value)) || null,
    latestHtml, detail, withDetail, esc, cleanText,
  });
})(globalThis);
