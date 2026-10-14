/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页|游戏备注展示与编辑
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root, factory) => {
  "use strict";

  const core = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = core;
    return;
  }

  const api = root.STStore;
  if (!api) return;

  const FEATURE_ID = "game-notes";
  const NOTE_MAX = 2000;
  const BATCH_SIZE = 80;
  const DETAIL_HOST_ID = "st-game-notes-detail";
  const QUERY_URL = root.STConfig.steamBuff("/wishlist-notes/query");
  const SAVE_URL = root.STConfig.steamBuff("/wishlist-notes");
  const AUTH_REFRESH = root.STConfig.loginAuth("/auth/refresh");
  const TITLE_SEL = ".apphub_AppName, .apphub_AppName_responsive, h1";
  const DETAIL_RETRY_LIMIT = 20;
  const DETAIL_RETRY_MS = 250;
  const DETAIL_SETTLE_LIMIT = 10;

  const wishlistDom = api.wishlistDom;
  const dom = root.STDomUtils || {};
  let detailTimer = 0;
  let wishlistSubscription = null;
  let detailSettleTimer = 0;
  let detailRetries = 0;
  let detailSettleChecks = 0;
  let detailAppid = 0;
  let loadSeq = 0;
  let cache = new Map();
  let pending = new Set();

  function storage() {
    return root.STSettings?.storage || null;
  }

  function i18n(key, fallback, params) {
    return root.STI18n.text(key, fallback, params);
  }

  let authClient = null;

  function getAuthClient() {
    if (!authClient) {
      authClient = root.STAuthClient?.createClient({
        storage: storage(),
        refreshUrl: AUTH_REFRESH,
        loginMessage: i18n("store.gameNotes.loginRequired", "请先在设置中登录"),
        expiredMessage: i18n("store.gameNotes.loginExpired", "登录已过期，请重新登录"),
      }) || null;
    }
    return authClient;
  }
  const log = root.STLoggerFactory.createLogger("store", FEATURE_ID);

  function text(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function pageInfo() {
    const info = api.ctx?.pageInfo?.();
    const appid = Number(info?.appId) || 0;
    return info?.type === "app" && appid > 0 ? { appid } : null;
  }

  function isWishlistPath() {
    return /^\/wishlist(?:\/|$)/i.test(location.pathname);
  }

  function visibleTitleElement(el) {
    if (!(el instanceof HTMLElement) || !text(el.textContent)) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function titleEl() {
    return Array.from(document.querySelectorAll(TITLE_SEL))
      .find(visibleTitleElement);
  }

  function wishlistTitleText(node) {
    return wishlistDom?.titleText?.(node) || text(node?.getAttribute?.("title") || node?.textContent || "");
  }

  function wishlistTitleNode(row) {
    return wishlistDom?.titleNode?.(row) || null;
  }

  function steamNameForApp(appid, source) {
    if (source) {
      const title = wishlistTitleNode(source);
      return wishlistTitleText(title);
    }
    if (appid === detailAppid) {
      return text(titleEl()?.childNodes?.[0]?.textContent || titleEl()?.textContent || "");
    }
    return "";
  }

  function addStyle() {
    api.styles?.ensureFeatureStyle?.("game-notes");
  }

  async function authedPost(url, body, diagnostics = {}) {
    const client = getAuthClient();
    if (!client) throw new Error(i18n("store.gameNotes.loginRequired", "请先在设置中登录"));
    const { body: data, code } = await client.authedPost(url, body, {
      throwOnMissingAuth: true,
      operationId: diagnostics.operationId || "",
    });
    if (code < 200 || code >= 300) throw new Error(data?.message || i18n("store.gameNotes.requestFailed", "请求失败：$code$", { code }));
    return data || {};
  }

  async function authedDelete(url, body, diagnostics = {}) {
    const client = getAuthClient();
    if (!client) throw new Error(i18n("store.gameNotes.loginRequired", "请先在设置中登录"));
    const operationId = diagnostics.operationId || "";
    const requestId = root.STLoggerFactory?.createRequestId?.() || "";
    const auth = await client.readyAuth({ operationId, requestId });
    if (!auth?.access_token) throw new Error(i18n("store.gameNotes.loginRequired", "请先在设置中登录"));
    const response = await client.fetchBg({
      url,
      method: "DELETE",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.access_token}`,
      },
      data: body || {},
      allowHttpError: true,
      operationId,
      requestId,
    });
    const data = client.parseJson(response.data);
    const code = Number(data?.code) || response.status || 0;
    if (code < 200 || code >= 300) throw new Error(data?.message || i18n("store.gameNotes.requestFailed", "请求失败：$code$", { code }));
    return data || {};
  }

  async function hasAuth() {
    const client = getAuthClient();
    if (!client) return false;
    const auth = await client.readyAuth();
    return !!auth?.access_token;
  }

  function chunk(values, size) {
    const out = [];
    for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
    return out;
  }

  async function fetchNotes(appids) {
    const ticket = loadSeq;
    const requestPending = pending;
    const ids = Array.from(new Set((appids || []).map(Number).filter(id => id > 0 && !cache.has(id) && !pending.has(id))));
    if (!ids.length) return;
    try {
      if (!await hasAuth()) return;
    } catch (error) {
      log.warn("game-notes-query-failed", "游戏备注鉴权检查失败", {
        count: ids.length,
        error,
      });
      return;
    }
    if (ticket !== loadSeq) return;
    ids.forEach(id => requestPending.add(id));
    for (const part of chunk(ids, BATCH_SIZE)) {
      if (ticket !== loadSeq) break;
      const startedAt = Date.now();
      try {
        const body = await authedPost(QUERY_URL, { appids: part });
        if (ticket !== loadSeq) return;
        const found = new Set();
        for (const row of body.data || []) {
          const appid = Number(row.appid) || 0;
          if (!appid) continue;
          found.add(appid);
          cache.set(appid, {
            note: String(row.note || ""),
            steamName: String(row.steam_name || ""),
            updatedAt: String(row.updated_at || ""),
          });
        }
        for (const appid of part) {
          if (!found.has(appid)) cache.set(appid, { note: "", steamName: "", updatedAt: "" });
        }
        log.info("game-notes-query-success", "游戏备注查询完成", {
          count: part.length,
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        log.warn("game-notes-query-failed", "游戏备注查询失败", {
          count: part.length,
          durationMs: Date.now() - startedAt,
          status: error?.status || 0,
          error,
        });
      } finally {
        part.forEach(id => requestPending.delete(id));
      }
    }
  }

  function isClamped(body) {
    return !!body && (body.scrollHeight > body.clientHeight + 1 || body.scrollWidth > body.clientWidth + 1);
  }

  function updateMore(host) {
    const body = host.querySelector(".st-game-notes-body");
    const more = host.querySelector(".st-game-notes-more");
    if (!body || !more) return;
    more.style.display = isClamped(body) ? "" : "none";
  }

  function openNoteEditor(appid, steamName) {
    const openEditor = api.features.titleCustomName?.openEditor;
    if (typeof openEditor !== "function") {
      log.error("game-notes-editor-unavailable", "统一游戏信息编辑窗口不可用", {
        appid: Number(appid) || 0,
        path: location.pathname,
      });
      return;
    }
    openEditor({
      appid: Number(appid) || 0,
      steamTitle: steamName || "",
      mode: "wishlist",
    }, "note");
  }

  function renderNote(host, appid, note, steamName, loading = false) {
    host.classList.add("st-game-notes");
    const isWishlist = host.classList.contains("st-game-notes-wishlist");
    const idText = String(appid || "");
    const nameText = steamName || "";
    if (host.hasAttribute("data-appid")) host.removeAttribute("data-appid");
    if (host.dataset.stAppid !== idText) host.dataset.stAppid = idText;
    if (host.dataset.steamName !== nameText) host.dataset.steamName = nameText;
    const key = JSON.stringify([appid, String(note || ""), steamName || "", loading]);
    if (host._stGameNotesKey === key && host.querySelector(".st-game-notes-body")) {
      if (!loading) requestAnimationFrame(() => updateMore(host));
      return;
    }
    host._stGameNotesKey = key;
    api.dom.loading.clear(host);
    host.replaceChildren();

    const line = document.createElement("div");
    line.className = "st-game-notes-line";
    if (isWishlist) {
      line.classList.add("st-game-notes-open-editor");
      line.tabIndex = 0;
      line.setAttribute("role", "button");
      line.setAttribute("aria-label", i18n("store.gameNotes.openFull", "查看完整备注"));
      line.title = i18n("store.gameNotes.openFull", "查看完整备注");
      const label = document.createElement("span");
      label.className = "st-game-notes-label";
      label.textContent = i18n("store.gameNotes.label", "备注：");
      line.appendChild(label);
    }
    const body = document.createElement("span");
    body.className = "st-game-notes-body";
    const value = String(note || "");
    if (loading) {
      api.dom.loading.show(body, "line");
    } else if (value) {
      const rendered = core.renderBBCode(value).html;
      dom.setTrustedHTML(body, dom.trustedHTML(rendered, "game-notes-bbcode-sanitized"));
      body.querySelectorAll("a[href]").forEach(link => {
        root.STConfig.externalNavigation.applyToLink(link, link.href);
      });
    }
    else {
      body.textContent = i18n("store.gameNotes.empty", "暂无备注");
      body.classList.add("st-game-notes-empty");
    }
    line.appendChild(body);

    if (isWishlist) {
      const activate = () => openNoteEditor(appid, nameText);
      line.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        activate();
      });
      line.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        activate();
      });
      host.appendChild(line);
      api.dom.loading.activate(host);
      return;
    }

    const more = document.createElement("button");
    more.type = "button";
    more.className = "st-game-notes-more";
    more.textContent = i18n("store.gameNotes.viewMore", "[查看更多]");
    more.addEventListener("click", () => {
      host.classList.toggle("expanded");
      updateMore(host);
    });
    line.appendChild(more);
    host.appendChild(line);
    api.dom.loading.activate(host);
    if (!loading) requestAnimationFrame(() => updateMore(host));
  }

  function updateVisible(appid) {
    if (!api.settings.on(FEATURE_ID)) return;
    const current = cache.get(appid) || { note: "", steamName: "" };
    document.querySelectorAll(`.st-game-notes[data-st-appid="${appid}"]`).forEach(host => {
      const currentId = host.classList.contains("st-game-notes-wishlist")
        ? rowAppid(wishlistDom.rowFromNode(host)) : pageInfo()?.appid;
      if (currentId !== appid) { api.dom.loading.clear(host); return; }
      renderNote(host, appid, current.note, current.steamName || host.dataset.steamName || "");
    });
  }

  function detailInsertTarget(title) {
    return title?.parentElement || null;
  }

  function detailMountedOnCurrentTitle() {
    const title = titleEl();
    const host = document.getElementById(DETAIL_HOST_ID);
    return !!title && !!host && host.previousElementSibling === title;
  }

  function scheduleDetailSettleCheck() {
    if (detailSettleTimer || detailSettleChecks >= DETAIL_SETTLE_LIMIT) {
      return;
    }
    detailSettleTimer = setTimeout(() => {
      detailSettleTimer = 0;
      if (!api.settings?.on?.(FEATURE_ID)) {
        return;
      }
      detailSettleChecks += 1;
      if (!detailMountedOnCurrentTitle()) {
        startDetail();
        return;
      }
      scheduleDetailSettleCheck();
    }, DETAIL_RETRY_MS);
  }

  function startDetail() {
    const info = pageInfo();
    if (!info) return false;
    if (detailAppid !== info.appid) {
      detailSettleChecks = 0;
    }
    const title = titleEl();
    const target = detailInsertTarget(title);
    if (!title || !target) return false;
    detailAppid = info.appid;
    addStyle();
    let host = document.getElementById(DETAIL_HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = DETAIL_HOST_ID;
      title.insertAdjacentElement("afterend", host);
    } else if (host.previousElementSibling !== title) {
      title.insertAdjacentElement("afterend", host);
    }
    const loading = !cache.has(info.appid) && (!host._stGameNotesKey || host.dataset.stAppid !== String(info.appid) || !!host.querySelector(".st-store-skeleton"));
    renderNote(host, info.appid, cache.get(info.appid)?.note || "", steamNameForApp(info.appid), loading);
    const ticket = loadSeq;
    const valid = () => ticket === loadSeq && host.isConnected && host.dataset.stAppid === String(info.appid) && pageInfo()?.appid === info.appid && api.settings.on(FEATURE_ID);
    (loading ? api.dom.loading.afterPaint(valid).then(ready => ready ? fetchNotes([info.appid]) : null) : Promise.resolve()).then(() => { if (valid()) updateVisible(info.appid); }).catch((error) => {
      globalThis.STLoggerFactory.reportError(error, { domain: "store", feature: "notes", event: "start-detail-failed", message: "商店功能处理失败", level: "error", phase: "startDetail" });});
    scheduleDetailSettleCheck();
    return true;
  }

  function scheduleDetailRetry() {
    if (detailTimer || detailRetries >= DETAIL_RETRY_LIMIT) return;
    detailRetries += 1;
    detailTimer = setTimeout(() => {
      detailTimer = 0;
      if (!api.settings?.on?.(FEATURE_ID)) return;
      if (startDetail()) return;
      scheduleDetailRetry();
    }, DETAIL_RETRY_MS);
  }

  function rowAppid(row) {
    return wishlistDom?.rowAppid?.(row) || 0;
  }

  function wishlistMetadataHost(row) {
    return wishlistDom?.metadataHost?.(row) || null;
  }

  function wishlistNoteHost(row) {
    const parent = wishlistMetadataHost(row);
    if (!parent) return null;
    let host = row.querySelector(".st-game-notes-wishlist");
    if (host) {
      if (host.parentElement !== parent) parent.appendChild(host);
      return host;
    }
    host = document.createElement("div");
    host.className = "st-game-notes-wishlist";
    parent.appendChild(host);
    return host;
  }

  function renderWishlistRow(row, completed = false) {
    const appid = rowAppid(row);
    if (!appid) {
      const host = row.querySelector(".st-game-notes-wishlist");
      if (host) { api.dom.loading.clear(host); host.remove(); }
      return 0;
    }
    const host = wishlistNoteHost(row);
    if (!host) return 0;
    const cached = cache.get(appid) || { note: "", steamName: steamNameForApp(appid, row) };
    const loading = !completed && !cache.has(appid)
      && (!host._stGameNotesKey || host.dataset.stAppid !== String(appid) || !!host.querySelector(".st-store-skeleton"));
    renderNote(host, appid, cached.note, cached.steamName || steamNameForApp(appid, row), loading);
    return loading ? appid : 0;
  }

  function renderWishlistRows(targets) {
    return targets.map(row => renderWishlistRow(row)).filter(Boolean);
  }

  async function batchFetchWishlistNotes(appids) {
    const ticket = loadSeq;
    await fetchNotes(appids);
    if (ticket !== loadSeq || !isWishlistPath() || !api.settings.on(FEATURE_ID) || document.hidden) return;
    const ids = new Set(appids);
    for (const row of wishlistDom.rows()) {
      if (ids.has(rowAppid(row))) renderWishlistRow(row, true);
    }
  }

  function startWishlist() {
    if (!isWishlistPath()) return false;
    if (wishlistSubscription) {
      wishlistSubscription.refresh();
    } else {
      wishlistSubscription = wishlistDom.observeRows(FEATURE_ID, {
        render: renderWishlistRows,
        load: batchFetchWishlistNotes,
      });
    }
    return true;
  }

  async function saveNote(appid, steamName, value, diagnostics = {}) {
    const noteText = String(value || "").trim();
    const startedAt = Date.now();
    const operationId = String(diagnostics.operationId || "");
    const body = noteText
      ? await authedPost(SAVE_URL, { appid, steam_name: steamName || "", note: noteText }, { operationId })
      : await authedDelete(SAVE_URL, { appid }, { operationId });
    cache.set(Number(appid), {
      note: String(body.data?.note || ""),
      steamName: String(body.data?.steam_name || steamName || ""),
      updatedAt: String(body.data?.updated_at || ""),
    });
    updateVisible(Number(appid));
    log.info("game-notes-save-success", "游戏备注保存完成", {
      operationId,
      appid: Number(appid),
      noteLength: noteText.length,
      durationMs: Date.now() - startedAt,
      status: noteText ? "saved" : "deleted",
    });
    return cache.get(Number(appid));
  }

  async function getNote(appid) {
    const id = Number(appid) || 0;
    if (!id) return { note: "", steamName: "", updatedAt: "" };
    if (!cache.has(id)) await fetchNotes([id]);
    return cache.get(id) || { note: "", steamName: "", updatedAt: "" };
  }

  function refresh() {
    if (!api.settings?.on?.(FEATURE_ID)) {
      stop();
      return false;
    }
    const detail = startDetail();
    if (!detail && pageInfo()) scheduleDetailRetry();
    const wishlist = startWishlist();
    return Boolean(detail || wishlist);
  }

  function stop() {
    loadSeq += 1;
    pending = new Set();
    wishlistSubscription?.dispose();
    wishlistSubscription = null;
    clearTimeout(detailTimer);
    clearTimeout(detailSettleTimer);
    detailTimer = 0;
    detailSettleTimer = 0;
    detailRetries = 0;
    detailSettleChecks = 0;
    document.querySelectorAll(".st-game-notes").forEach(node => { api.dom.loading.clear(node); node.remove(); });
  }

  function start() {
    if (!api.settings?.on?.(FEATURE_ID)) return false;
    addStyle();
    return refresh();
  }

  api.features.gameNotes = Object.freeze({
    start,
    refresh,
    stop,
    getNote,
    saveNote,
    noteMax: NOTE_MAX,
  });
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";

  const COLORS = new Set(["red", "green", "blue", "white", "black", "yellow", "orange", "purple", "gray", "grey"]);
  const FONTS = new Set(["微软雅黑", "Microsoft YaHei", "Arial", "Helvetica", "Tahoma", "Verdana", "SimSun", "宋体"]);

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function attr(value) {
    return esc(value).replace(/'/g, "&#39;");
  }

  function sanitizeUrl(value) {
    const url = String(value || "").trim();
    return /^https?:\/\/[^\s<>"']+$/i.test(url) ? url : "";
  }

  function allowedColor(value) {
    const color = String(value || "").trim();
    if (COLORS.has(color.toLowerCase())) return color.toLowerCase();
    return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(color) ? color : "";
  }

  function safeSize(value) {
    const size = Math.max(10, Math.min(28, Number(value) || 0));
    return size ? `${size}px` : "";
  }

  function safeFont(value) {
    const font = String(value || "").trim();
    return FONTS.has(font) ? font : "";
  }

  function inline(text) {
    let html = esc(text);
    html = html.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, "<strong>$1</strong>");
    html = html.replace(/\[i\]([\s\S]*?)\[\/i\]/gi, "<em>$1</em>");
    html = html.replace(/\[u\]([\s\S]*?)\[\/u\]/gi, "<u>$1</u>");
    html = html.replace(/\[s\]([\s\S]*?)\[\/s\]/gi, "<s>$1</s>");
    html = html.replace(/\[h1\]([\s\S]*?)\[\/h1\]/gi, "<h1>$1</h1>");
    html = html.replace(/\[h2\]([\s\S]*?)\[\/h2\]/gi, "<h2>$1</h2>");
    html = html.replace(/\[h3\]([\s\S]*?)\[\/h3\]/gi, "<h3>$1</h3>");
    html = html.replace(/\[color=([^\]]+)\]([\s\S]*?)\[\/color\]/gi, (_, color, body) => {
      const safe = allowedColor(color);
      return safe ? `<span style="color:${attr(safe)}">${body}</span>` : body;
    });
    html = html.replace(/\[font=([^\]]+)\]([\s\S]*?)\[\/font\]/gi, (_, font, body) => {
      const safe = safeFont(font);
      return safe ? `<span style="font-family:${attr(safe)}">${body}</span>` : body;
    });
    html = html.replace(/\[size=([^\]]+)\]([\s\S]*?)\[\/size\]/gi, (_, size, body) => {
      const safe = safeSize(size);
      return safe ? `<span style="font-size:${safe}">${body}</span>` : body;
    });
    html = html.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, (_, url, body) => {
      const safe = sanitizeUrl(url);
      return safe ? `<a href="${attr(safe)}" rel="noopener noreferrer">${body}</a>` : body;
    });
    html = html.replace(/\[img\]([\s\S]*?)\[\/img\]/gi, (_, url) => {
      const safe = sanitizeUrl(url);
      return safe ? `<img src="${attr(safe)}" alt="">` : esc(url);
    });
    return html.replace(/\n/g, "<br>");
  }

  function listBlock(text, ordered) {
    const tag = ordered ? "ol" : "ul";
    const items = String(text || "").split(/\[\*\]/).map(item => item.trim()).filter(Boolean);
    return `<${tag}>${items.map(item => `<li>${inline(item)}</li>`).join("")}</${tag}>`;
  }

  function tableBlock(text) {
    return `<table>${inline(text)
      .replace(/\[tr\]/gi, "<tr>").replace(/\[\/tr\]/gi, "</tr>")
      .replace(/\[th\]/gi, "<th>").replace(/\[\/th\]/gi, "</th>")
      .replace(/\[td\]/gi, "<td>").replace(/\[\/td\]/gi, "</td>")}</table>`;
  }

  function renderBBCode(value) {
    let input = String(value || "");
    const blocks = [];
    function block(html) {
      const key = `\u0000${blocks.length}\u0000`;
      blocks.push(html);
      return key;
    }
    input = input.replace(/\[code\]([\s\S]*?)\[\/code\]/gi, (_, body) => {
      return block(`<pre><code>${esc(body)}</code></pre>`);
    });
    input = input.replace(/\[quote(?:=([^\]]+))?\]([\s\S]*?)\[\/quote\]/gi, (_, author, body) => {
      const by = author ? `<cite>${esc(author)}</cite>` : "";
      return block(`<blockquote>${by}${inline(body)}</blockquote>`);
    });
    input = input.replace(/\[olist\]([\s\S]*?)\[\/olist\]/gi, (_, body) => block(listBlock(body, true)));
    input = input.replace(/\[list\]([\s\S]*?)\[\/list\]/gi, (_, body) => block(listBlock(body, false)));
    input = input.replace(/\[table\]([\s\S]*?)\[\/table\]/gi, (_, body) => block(tableBlock(body)));
    let html = inline(input);
    blocks.forEach((block, index) => {
      html = html.replace(new RegExp(`\\u0000${index}\\u0000`, "g"), block);
    });
    return { html };
  }

  return {
    renderBBCode,
    sanitizeUrl,
    allowedColor,
  };
});
