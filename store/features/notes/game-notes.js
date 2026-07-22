/*
 * @Author        : 顾青离
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
  const WISHLIST_RENDER_DEBOUNCE_MS = 1000;
  const WISHLIST_OBSERVER_DEBOUNCE_MS = 1000;
  const WISHLIST_SETTLE_RETRY_MS = 300;
  const WISHLIST_SETTLE_MAX = 8;
  const WISHLIST_SORT_REFRESH_MS = 700;
  const WISHLIST_SORT_TEXT_RE = /排序|您的排序|名称|价格|折扣|添加日期|最畅销|发行日期|总体评价|sort|your sort|name|price|discount|date added|top sellers|release date|review score/i;

  const wishlistDom = api.wishlistDom;
  const dom = root.STDomUtils || {};
  let detailTimer = 0;
  let detailSettleTimer = 0;
  let detailRetries = 0;
  let detailSettleChecks = 0;
  let wishlistObserver = null;
  let wishlistShellObserver = null;
  let wishlistContainer = null;
  let wishlistShell = null;
  let wishlistTimer = 0;
  let wishlistSettleTimer = 0;
  let wishlistSortTimer = 0;
  let wishlistSettleChecks = 0;
  let renderingWishlist = false;
  let detailAppid = 0;
  let cache = new Map();
  let pending = new Set();

  function storage() {
    return root.STSettings?.storage || null;
  }

  const authClient = root.STAuthClient?.createClient({
    storage: storage(),
    refreshUrl: AUTH_REFRESH,
    loginMessage: "请先在设置中登录",
    expiredMessage: "登录已过期，请重新登录",
  });
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

  function isWishlistSortTarget(target) {
    const button = target?.closest?.("button");
    if (!button || button.closest?.(".st-game-notes, .st-game-notes-wishlist, #st-settings-root")) return false;
    const label = text(button.getAttribute("aria-label") || button.title || button.textContent || "");
    return WISHLIST_SORT_TEXT_RE.test(label);
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

  async function authedPost(url, body) {
    if (!authClient) throw new Error("请先在设置中登录");
    const { body: data, code } = await authClient.authedPost(url, body, { throwOnMissingAuth: true });
    if (code < 200 || code >= 300) throw new Error(data?.message || `请求失败：${code}`);
    return data || {};
  }

  async function authedDelete(url, body) {
    if (!authClient) throw new Error("请先在设置中登录");
    const auth = await authClient.readyAuth();
    if (!auth?.access_token) throw new Error("请先在设置中登录");
    const response = await authClient.fetchBg({
      url,
      method: "DELETE",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.access_token}`,
      },
      data: body || {},
      allowHttpError: true,
    });
    const data = authClient.parseJson(response.data);
    const code = Number(data?.code) || response.status || 0;
    if (code < 200 || code >= 300) throw new Error(data?.message || `请求失败：${code}`);
    return data || {};
  }

  async function hasAuth() {
    if (!authClient) return false;
    const auth = await authClient.readyAuth();
    return !!auth?.access_token;
  }

  function chunk(values, size) {
    const out = [];
    for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
    return out;
  }

  async function fetchNotes(appids) {
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
    ids.forEach(id => pending.add(id));
    for (const part of chunk(ids, BATCH_SIZE)) {
      const startedAt = Date.now();
      try {
        const body = await authedPost(QUERY_URL, { appids: part });
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
        part.forEach(id => pending.delete(id));
      }
    }
  }

  function isClamped(body) {
    return !!body && body.scrollHeight > body.clientHeight + 1;
  }

  function updateMore(host) {
    const body = host.querySelector(".st-game-notes-body");
    const more = host.querySelector(".st-game-notes-more");
    if (!body || !more) return;
    more.style.display = isClamped(body) ? "" : "none";
  }

  function renderNote(host, appid, note, steamName) {
    host.classList.add("st-game-notes");
    const idText = String(appid || "");
    const nameText = steamName || "";
    if (host.hasAttribute("data-appid")) host.removeAttribute("data-appid");
    if (host.dataset.stAppid !== idText) host.dataset.stAppid = idText;
    if (host.dataset.steamName !== nameText) host.dataset.steamName = nameText;
    const key = JSON.stringify([appid, String(note || ""), steamName || ""]);
    if (host._stGameNotesKey === key && host.querySelector(".st-game-notes-body")) {
      requestAnimationFrame(() => updateMore(host));
      return;
    }
    host._stGameNotesKey = key;
    host.replaceChildren();

    const line = document.createElement("div");
    line.className = "st-game-notes-line";
    const body = document.createElement("span");
    body.className = "st-game-notes-body";
    const value = String(note || "");
    if (value) {
      const rendered = core.renderBBCode(value).html;
      dom.setTrustedHTML(body, dom.trustedHTML(rendered, "game-notes-bbcode-sanitized"));
    }
    else {
      body.textContent = "暂无备注";
      body.classList.add("st-game-notes-empty");
    }
    line.appendChild(body);

    const more = document.createElement("button");
    more.type = "button";
    more.className = "st-game-notes-more";
    more.textContent = "[查看更多]";
    more.addEventListener("click", () => {
      host.classList.toggle("expanded");
      updateMore(host);
    });
    line.appendChild(more);
    host.appendChild(line);
    requestAnimationFrame(() => updateMore(host));
  }

  function updateVisible(appid) {
    const current = cache.get(appid) || { note: "", steamName: "" };
    document.querySelectorAll(`.st-game-notes[data-st-appid="${appid}"]`).forEach(host => {
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
    renderNote(host, info.appid, cache.get(info.appid)?.note || "", steamNameForApp(info.appid));
    fetchNotes([info.appid]).then(() => updateVisible(info.appid)).catch(() => {});
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

  function wishlistTitleHost(row) {
    return wishlistDom?.titleHost?.(row) || null;
  }

  function wishlistGrid(row) {
    const grid = wishlistTitleHost(row)?.parentElement || null;
    return grid instanceof HTMLElement ? grid : null;
  }

  function wishlistNoteHost(row) {
    const grid = wishlistGrid(row);
    const parent = grid || wishlistTitleHost(row) || row.querySelector("[class*='Content'], .content, .wishlist_row") || row;
    let host = row.querySelector(".st-game-notes-wishlist");
    if (host) {
      if (host.parentElement !== parent) parent.appendChild(host);
      if (grid) grid.classList.add("st-game-notes-wishlist-row");
      host.style.gridArea = "stnote";
      return host;
    }
    host = document.createElement("div");
    host.className = "st-game-notes-wishlist";
    if (grid) {
      grid.classList.add("st-game-notes-wishlist-row");
      host.style.gridArea = "stnote";
      grid.appendChild(host);
    } else {
      parent.appendChild(host);
    }
    return host;
  }

  function wishlistHostReady(row) {
    const appid = rowAppid(row);
    if (!appid) return true;
    const host = row.querySelector(".st-game-notes-wishlist");
    return !!host && host.dataset.stAppid === String(appid);
  }

  function wishlistRowsReady() {
    const rows = (wishlistDom?.rows?.(document) || []).filter(row => rowAppid(row));
    return rows.length > 0 && rows.every(wishlistHostReady);
  }

  async function batchFetchWishlistNotes(appids) {
    const ids = Array.from(new Set((appids || []).map(Number).filter(id => id > 0 && !cache.has(id) && !pending.has(id))));
    if (!ids.length) return;
    await fetchNotes(ids);
    ids.forEach(updateVisible);
  }

  function renderWishlistRows() {
    if (renderingWishlist) return;
    renderingWishlist = true;
    const rows = wishlistDom?.rows?.(document) || [];
    const appids = [];
    try {
      for (const row of rows) {
        const appid = rowAppid(row);
        if (!appid) continue;
        appids.push(appid);
        const host = wishlistNoteHost(row);
        const cached = cache.get(appid) || { note: "", steamName: steamNameForApp(appid, row) };
        renderNote(host, appid, cached.note, cached.steamName || steamNameForApp(appid, row));
      }
    } finally {
      renderingWishlist = false;
    }
    batchFetchWishlistNotes(appids).catch(() => {});
  }

  function scheduleWishlistRender(delay = WISHLIST_RENDER_DEBOUNCE_MS) {
    if (renderingWishlist) return;
    clearTimeout(wishlistTimer);
    const waitMs = Math.max(0, Number(delay) || 0);
    wishlistTimer = setTimeout(renderWishlistRows, waitMs);
  }

  function bindWishlistShell(container) {
    const shell = wishlistDom?.listShell?.(container) || null;
    if (wishlistShell === shell && wishlistShellObserver) return;
    wishlistShellObserver?.disconnect();
    wishlistShellObserver = null;
    wishlistShell = shell;
    if (!shell) return;
    const refreshContainer = () => {
      const next = wishlistDom?.listContainer?.();
      if (!next || next === wishlistContainer) return;
      bindWishlistObserver(next);
      scheduleWishlistRender(0);
      scheduleWishlistSettleCheck();
    };
    wishlistShellObserver = root.STObserverUtils?.createDebouncedObserver?.(refreshContainer, WISHLIST_OBSERVER_DEBOUNCE_MS)
      || new MutationObserver(refreshContainer);
    root.STObserverUtils?.createVisibilityGatedObserver?.(wishlistShellObserver, shell, { childList: true })
      || wishlistShellObserver.observe(shell, { childList: true });
  }

  function bindWishlistObserver(container) {
    if (wishlistContainer === container && wishlistObserver) {
      bindWishlistShell(container);
      return;
    }
    wishlistObserver?.disconnect();
    wishlistContainer = container;
    wishlistSettleChecks = 0;
    wishlistObserver = root.STObserverUtils?.createDebouncedObserver?.(() => scheduleWishlistRender(0), WISHLIST_OBSERVER_DEBOUNCE_MS)
      || new MutationObserver(() => scheduleWishlistRender());
    // 只监听愿望单真实列表容器；虚拟列表会深层替换行节点，保留 subtree。
    root.STObserverUtils?.createVisibilityGatedObserver?.(wishlistObserver, container, { childList: true, subtree: true })
      || wishlistObserver.observe(container, { childList: true, subtree: true });
    bindWishlistShell(container);
  }

  function scheduleWishlistSettleCheck() {
    if (wishlistSettleTimer || wishlistSettleChecks >= WISHLIST_SETTLE_MAX) return;
    wishlistSettleTimer = setTimeout(() => {
      wishlistSettleTimer = 0;
      if (!api.settings?.on?.(FEATURE_ID) || !isWishlistPath()) return;
      const container = wishlistDom?.listContainer?.();
      if (container && container !== wishlistContainer) {
        bindWishlistObserver(container);
      }
      if (wishlistRowsReady()) return;
      wishlistSettleChecks += 1;
      renderWishlistRows();
      scheduleWishlistSettleCheck();
    }, WISHLIST_SETTLE_RETRY_MS);
  }

  function scheduleWishlistSortRefresh() {
    clearTimeout(wishlistSortTimer);
    wishlistSortTimer = setTimeout(() => {
      wishlistSortTimer = 0;
      if (!api.settings?.on?.(FEATURE_ID) || !isWishlistPath()) return;
      const container = wishlistDom?.listContainer?.();
      if (container && container !== wishlistContainer) {
        bindWishlistObserver(container);
      }
      wishlistSettleChecks = 0;
      scheduleWishlistRender(0);
      scheduleWishlistSettleCheck();
    }, WISHLIST_SORT_REFRESH_MS);
  }

  function onWishlistSortClick(event) {
    if (!isWishlistPath() || !api.settings?.on?.(FEATURE_ID) || !isWishlistSortTarget(event.target)) return;
    scheduleWishlistSortRefresh();
  }

  function startWishlist() {
    if (!isWishlistPath()) return false;
    addStyle();
    const container = wishlistDom?.listContainer?.();
    if (!container) return false;
    renderWishlistRows();
    bindWishlistObserver(container);
    document.addEventListener("click", onWishlistSortClick, true);
    scheduleWishlistSettleCheck();
    return true;
  }

  async function saveNote(appid, steamName, value) {
    const noteText = String(value || "").trim();
    const startedAt = Date.now();
    const body = noteText
      ? await authedPost(SAVE_URL, { appid, steam_name: steamName || "", note: noteText })
      : await authedDelete(SAVE_URL, { appid });
    cache.set(Number(appid), {
      note: String(body.data?.note || ""),
      steamName: String(body.data?.steam_name || steamName || ""),
      updatedAt: String(body.data?.updated_at || ""),
    });
    updateVisible(Number(appid));
    log.info("game-notes-save-success", "游戏备注保存完成", {
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
    wishlistObserver?.disconnect();
    wishlistShellObserver?.disconnect();
    clearTimeout(detailTimer);
    clearTimeout(detailSettleTimer);
    clearTimeout(wishlistTimer);
    clearTimeout(wishlistSettleTimer);
    clearTimeout(wishlistSortTimer);
    document.removeEventListener("click", onWishlistSortClick, true);
    detailTimer = 0;
    detailSettleTimer = 0;
    wishlistSettleTimer = 0;
    wishlistSortTimer = 0;
    detailRetries = 0;
    detailSettleChecks = 0;
    wishlistSettleChecks = 0;
    wishlistObserver = null;
    wishlistShellObserver = null;
    wishlistContainer = null;
    wishlistShell = null;
    wishlistTimer = 0;
    document.querySelectorAll(".st-game-notes").forEach(node => node.remove());
    document.querySelectorAll(".st-game-notes-wishlist-row").forEach(node => {
      node.classList.remove("st-game-notes-wishlist-row");
    });
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
      return safe ? `<a href="${attr(safe)}" target="_blank" rel="noopener noreferrer">${body}</a>` : body;
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
