/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店搜索框中文名称联想
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

  const API_QUERY = root.STConfig.steamBuff("/search/suggestions");
  const API_CLICK = root.STConfig.steamBuff("/search/suggestions/click");
  const AUTH_REFRESH = root.STConfig.loginAuth("/auth/refresh");
  const STEAM_STORE = root.STConfig.vendors?.steamStore;
  const STEAM_SHARED_CDN = root.STConfig.vendors?.steamSharedCdn;
  const DEBOUNCE_MS = 250;
  const CACHE_MS = 45 * 1000;
  const STYLE_ID = "st-search-suggestions-style";
  const HOST_CLASS = "st-search-suggestions";
  const INPUT_SEL = [
    "#store_nav_search_term",
    "#term",
    "input[name='term'][type='text']",
    "form[action*='/search'] input[type='text']",
  ].join(",");
  const FALLBACK_IMG = (() => {
    try {
      return root.chrome?.runtime?.getURL?.("images/search.png") || "";
    } catch {
      return "";
    }
  })();

  const bound = new WeakSet();
  const states = new WeakMap();
  const cache = new Map();
  let options = core.defaultOptions();
  let started = false;
  let observer = null;
  let scanPending = false;

  /* 授权与接口请求 */
  function storage() {
    return root.STSettings?.storage || null;
  }

  const authClient = root.STAuthClient?.createClient({
    storage: storage(),
    refreshUrl: AUTH_REFRESH,
  });

  function log(level, event, message, meta = {}) {
    try {
      const entry = {
        domain: "store",
        feature: "search-suggestions",
        event,
        message,
        meta,
      };
      if (level === "error") {
        root.STLogger?.error?.(entry);
      } else if (level === "warn") {
        root.STLogger?.warn?.(entry);
      } else {
        root.STLogger?.info?.(entry);
      }
    } catch {
    }
  }

  async function loadOptions() {
    const next = core.normalizeOptions(await storage()?.getSearchSuggestions?.());
    if (next.limit !== options.limit || next.nativeMode !== options.nativeMode) {
      cache.clear();
    }
    options = next;
    return options;
  }

  async function requestSuggestions(keyword, sources, modes) {
    if (!authClient) {
      return [];
    }
    const startedAt = Date.now();
    log("info", "search-suggestions-query-start", "开始查询搜索联想词", {
      keywordLength: String(keyword || "").length,
      sources,
      modes,
      limit: options.limit,
    });
    try {
      const { body, code } = await authClient.authedPost(API_QUERY, { keyword, limit: options.limit, sources, modes: modes });
      if (code === 401 || code === 403) {
        log("warn", "search-suggestions-query-failed", "搜索联想词查询未授权", {
          keywordLength: String(keyword || "").length,
          status: code,
          durationMs: Date.now() - startedAt,
        });
        return [];
      }
      if (code < 200 || code >= 300) {
        log("warn", "search-suggestions-query-failed", "搜索联想词查询失败", {
          keywordLength: String(keyword || "").length,
          status: code,
          durationMs: Date.now() - startedAt,
        });
        return [];
      }
      const items = Array.isArray(body?.data) ? core.mergeByApp(body.data, options.limit) : [];
      log("info", "search-suggestions-query-success", "搜索联想词查询完成", {
        keywordLength: String(keyword || "").length,
        count: items.length,
        durationMs: Date.now() - startedAt,
      });
      return items;
    } catch (error) {
      log("error", "search-suggestions-query-failed", "搜索联想词查询异常", {
        keywordLength: String(keyword || "").length,
        durationMs: Date.now() - startedAt,
        error: error?.message || String(error),
      });
      return [];
    }
  }

  async function reportClick(keyword, item) {
    if (!Number(item?.appid)) {
      return false;
    }
    if (!authClient) {
      return false;
    }
    log("info", "search-suggestion-click-start", "开始上报搜索联想点击", {
      appid: Number(item.appid) || 0,
      source: item.source || "",
      keywordLength: String(keyword || "").length,
    });
    await authClient.authedPost(API_CLICK, {
      keyword,
      appid: item.appid,
      source: item.source,
    });
    log("info", "search-suggestion-click-success", "搜索联想点击已上报", {
      appid: Number(item.appid) || 0,
      source: item.source || "",
      keywordLength: String(keyword || "").length,
    });
    return true;
  }

  function sources() {
    return core.sourcesFromSettings(api.settings?.all?.() || {});
  }

  function modes() {
    return core.modesFromSettings(api.settings?.all?.() || {});
  }

  // 缓存 key 包含来源和匹配模式，避免切换开关后复用旧候选。
  function cached(keyword, src, mode) {
    const key = core.cacheKey(keyword, src, mode);
    const item = cache.get(key);
    if (!item || Date.now() - item.time >= CACHE_MS) {
      cache.delete(key);
      return null;
    }
    return item.items;
  }

  function setCache(keyword, src, mode, items) {
    cache.set(core.cacheKey(keyword, src, mode), {
      time: Date.now(),
      items,
    });
  }

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function visible(el) {
    return !!(el?.offsetWidth || el?.offsetHeight || el?.getClientRects?.().length);
  }

  // 优先挂到 Steam 原生搜索联想层；搜索结果页没有弹层时再落到表单下方。
  function nativeLayer(input) {
    const direct = [
      document.getElementById("search_suggestion_contents"),
      document.querySelector(".search_suggestion_contents"),
      document.querySelector(".search_suggestion_popup"),
      document.querySelector('[id^="searchSuggestions_"]'),
    ].find(visible);
    if (direct) {
      return direct;
    }
    const form = input?.closest?.("form");
    return form?.querySelector?.('#search_suggestion_contents, .search_suggestion_contents, .search_suggestion_popup, [id^="searchSuggestions_"]') || null;
  }

  function findAdvancedAnchor(native) {
    const direct = native.querySelector(":scope > .search_suggest_advanced");
    if (direct) return direct;
    const links = Array.from(native.querySelectorAll(":scope > a, :scope > .search_suggest_advanced"));
    return links.reverse().find(el => /高级|advanced/i.test(el.textContent || "")) || null;
  }

  function nativeCandidates(native) {
    if (!native) {
      return [];
    }
    const advanced = findAdvancedAnchor(native);
    return Array.from(native.children).filter((el) => (
      el !== advanced
      && !el.classList?.contains(HOST_CLASS)
      && !el.classList?.contains("st-search-suggestion-head")
      && !el.classList?.contains("search_suggest_advanced")
      && !["SCRIPT", "STYLE", "TEMPLATE"].includes(el.tagName)
    ));
  }

  function setNativeHidden(el, hidden) {
    if (!el) {
      return;
    }
    if (hidden) {
      if (el.dataset.stSearchNativeHidden !== "1") {
        el.dataset.stSearchNativeHidden = "1";
        el.dataset.stSearchNativeDisplay = el.style.display || "";
      }
      el.style.display = "none";
      return;
    }
    if (el.dataset.stSearchNativeHidden !== "1") {
      return;
    }
    el.style.display = el.dataset.stSearchNativeDisplay || "";
    delete el.dataset.stSearchNativeHidden;
    delete el.dataset.stSearchNativeDisplay;
  }

  function applyNativeResults(input) {
    const native = nativeLayer(input);
    if (!native) {
      return;
    }
    const mode = options.nativeMode;
    nativeCandidates(native).forEach((el, idx) => {
      setNativeHidden(el, options.nativeMode === "hide" || (options.nativeMode === "one" && idx > 0));
    });
    if (mode === "default") {
      nativeCandidates(native).forEach(el => setNativeHidden(el, false));
    }
  }

  function host(input) {
    const native = nativeLayer(input);
    if (native) {
      let el = Array.from(native.children).find(child => child.classList?.contains(HOST_CLASS));
      if (!el) {
        el = document.createElement("div");
        el.className = HOST_CLASS;
        const advanced = findAdvancedAnchor(native);
        if (advanced && advanced.parentElement === native) {
          native.insertBefore(el, advanced);
        } else {
          native.appendChild(el);
        }
      }
      applyNativeResults(input);
      return el;
    }

    if (!/^\/search\/?/i.test(location.pathname)) {
      return null;
    }
    const anchor = input.closest("form") || input.parentElement;
    if (!anchor) {
      return null;
    }
    let el = anchor.parentElement?.querySelector?.(`:scope > .${HOST_CLASS}`) || null;
    if (!el) {
      el = document.createElement("div");
      el.className = `${HOST_CLASS} page-mode`;
      anchor.insertAdjacentElement("afterend", el);
    }
    return el;
  }

  /* 候选渲染 */
  function clear(input) {
    const layer = host(input);
    if (layer) {
      layer.remove();
    }
    applyNativeResults(input);
  }

  function clearAll() {
    for (const input of document.querySelectorAll(INPUT_SEL)) {
      if (input instanceof HTMLInputElement) {
        clear(input);
      }
    }
  }

  function fallbackThumb(img) {
    const fallback = img?.dataset?.stSearchFallback || "";
    if (!fallback || img.src === fallback) {
      return;
    }
    img.src = fallback;
  }

  function bindThumbFallbacks(layer) {
    for (const img of layer.querySelectorAll(".st-search-suggestion-img[data-st-search-fallback]")) {
      img.addEventListener("error", () => fallbackThumb(img), { once: true });
      if (img.complete && img.naturalWidth === 0) {
        fallbackThumb(img);
      }
    }
  }

  function itemHtml(item) {
    const title = esc(item.label);
    const steamName = esc(item.steam_name || "");
    const sourceLabel = esc(item.source_label || item.source || "");
    const appid = Number(item.appid) || 0;
    const capsule = appid > 0
      ? STEAM_SHARED_CDN?.appCapsule?.(appid) || ""
      : "";
    const img = capsule || FALLBACK_IMG;
    const fallbackAttr = FALLBACK_IMG ? ` data-st-search-fallback="${esc(FALLBACK_IMG)}"` : "";
    const thumb = img
      ? `<img class="st-search-suggestion-img" src="${esc(img)}"${fallbackAttr} alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=this.dataset.stSearchFallback||this.src;"/>`
      : `<span class="st-search-suggestion-img st-search-suggestion-img-empty"></span>`;
    const subParts = [];
    if (sourceLabel) subParts.push(sourceLabel);
    if (steamName) subParts.push(steamName);
    const sub = subParts.length
      ? `<div class="st-search-suggestion-sub">${subParts.join("&nbsp;·&nbsp;")}</div>`
      : "";
    return `
      <a class="st-search-suggestion-item match" href="${esc(item.url || appUrl(appid) || "#")}" data-idx="${Number(item._idx) || 0}" data-source="${esc(item.source)}">
        ${thumb}
        <div class="st-search-suggestion-body">
          <div class="st-search-suggestion-title">${title}</div>
          ${sub}
        </div>
      </a>
    `;
  }

  function render(input, keyword, items, tries = 0) {
    if (!items.length) {
      clear(input);
      return;
    }
    const layer = host(input);
    if (!layer) {
      if (tries < 4) {
        setTimeout(() => render(input, keyword, items, tries + 1), 120);
      }
      return;
    }
    layer.dataset.keyword = keyword;
    layer.innerHTML = `
      <div class="st-search-suggestion-head">Steam Buff 中文名称匹配</div>
      <div class="st-search-suggestion-list">
        ${items.map(itemHtml).join("")}
      </div>
    `;
    applyNativeResults(input);
    bindThumbFallbacks(layer);
    bindClicks(layer, input, keyword, items);
  }

  function fallbackSearch(input, item) {
    input.value = item.steam_name || item.label || "";
    const form = input.closest("form");
    if (form?.requestSubmit) {
      form.requestSubmit();
      return;
    }
    form?.submit?.();
  }

  function bindClicks(layer, input, keyword, items) {
    const map = new Map(items.map((item, idx) => [String(idx), item]));
    for (const link of layer.querySelectorAll(".st-search-suggestion-item")) {
      link.addEventListener("click", (event) => {
        const item = map.get(link.dataset.idx);
        if (!item) {
          return;
        }
        event.preventDefault();
        const url = item.url || appUrl(item.appid);
        let moved = false;
        const go = () => {
          if (moved) return;
          moved = true;
          if (url) {
            location.href = url;
          } else {
            fallbackSearch(input, item);
          }
        };
        reportClick(keyword, item).catch(() => {}).finally(go);
        // 点击统计只是热度参考，网络失败或接口慢都不能阻断用户跳转。
        setTimeout(go, 180);
      });
    }
  }

  async function update(input) {
    if (!api.settings?.on?.("search-suggestions")) {
      clear(input);
      return;
    }
    const state = states.get(input);
    const keyword = core.readyKeyword(input.value);
    if (!keyword) {
      clear(input);
      return;
    }
    const src = sources();
    if (!src.user_custom && !src.user_alias && !src.community && !src.community_alias && !src.ai) {
      clear(input);
      return;
    }
    const mode = modes();
    const hit = cached(keyword, src, mode);
    if (hit) {
      render(input, keyword, hit);
      return;
    }

    const seq = (state.seq || 0) + 1;
    state.seq = seq;
    const items = await requestSuggestions(keyword, src, mode).catch(() => []);
    // 输入框内容或请求序号变化说明这是旧响应，直接丢弃，避免覆盖新关键词结果。
    if (state.seq !== seq || core.readyKeyword(input.value) !== keyword) {
      return;
    }
    setCache(keyword, src, mode, items);
    render(input, keyword, items);
  }

  // 中文 IME 组合输入期间不触发请求，compositionend 后再按防抖节奏查询。
  function schedule(input) {
    const state = states.get(input);
    if (!state || state.composing) {
      return;
    }
    clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      update(input).catch(() => clear(input));
    }, DEBOUNCE_MS);
  }

  function bind(input) {
    if (bound.has(input)) {
      return;
    }
    bound.add(input);
    states.set(input, { timer: 0, seq: 0, composing: false });
    input.addEventListener("compositionstart", () => {
      const state = states.get(input);
      if (state) state.composing = true;
    });
    input.addEventListener("compositionend", () => {
      const state = states.get(input);
      if (state) state.composing = false;
      schedule(input);
    });
    input.addEventListener("input", () => schedule(input));
    input.addEventListener("focus", () => schedule(input));
    input.addEventListener("blur", () => {
      setTimeout(() => clear(input), 300);
    });
  }

  function scan() {
    for (const input of document.querySelectorAll(INPUT_SEL)) {
      if (input instanceof HTMLInputElement && input.offsetParent !== null) {
        bind(input);
        applyNativeResults(input);
      }
    }
  }

  function scheduleScan() {
    if (scanPending) {
      return;
    }
    scanPending = true;
    setTimeout(() => {
      scanPending = false;
      scan();
    }, 120);
  }

  function addStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${HOST_CLASS} {
        margin-top: 1px;
        border-top: 1px solid rgba(58, 75, 95, .55);
        background: transparent;
        box-sizing: border-box;
        width: 100%;
      }
      .${HOST_CLASS}.page-mode {
        margin: 8px 0 12px;
        max-width: 640px;
        border: 1px solid rgba(58, 75, 95, .55);
        background: rgba(15, 24, 36, .96);
      }
      .st-search-suggestion-head {
        padding: 4px 12px 2px;
        color: #56707f;
        font-size: 11px;
        line-height: 14px;
      }
      .${HOST_CLASS} .st-search-suggestion-list {
        display: block;
        width: 100%;
      }
      .${HOST_CLASS} .st-search-suggestion-item {
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 4px 12px;
        color: #c5c3c0;
        text-decoration: none;
        min-width: 0;
      }
      .${HOST_CLASS} .st-search-suggestion-item:hover,
      .${HOST_CLASS} .st-search-suggestion-item:focus {
        background: #417a9b;
        color: #fff;
        text-decoration: none;
        outline: none;
      }
      .st-search-suggestion-img {
        flex-shrink: 0;
        width: 120px;
        height: 45px;
        object-fit: cover;
        background: #1b2838;
      }
      .st-search-suggestion-img-empty {
        display: inline-block;
      }
      .st-search-suggestion-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 1px;
      }
      .st-search-suggestion-title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 14px;
        line-height: 18px;
        color: inherit;
      }
      .st-search-suggestion-sub {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 12px;
        line-height: 15px;
        color: #8f98a0;
      }
      .st-search-suggestion-item:hover .st-search-suggestion-sub,
      .st-search-suggestion-item:focus .st-search-suggestion-sub {
        color: #cfe1ee;
      }
    `;
    document.head.appendChild(style);
  }

  function observerTarget(input) {
    const form = input?.closest?.("form");
    return form?.parentElement
      || document.getElementById("store_header")
      || document.getElementById("global_header")
      || document.getElementById("responsive_page_template_content")
      || document.body
      || document.documentElement;
  }

  function observe() {
    if (observer || !document.documentElement) {
      return;
    }
    const target = observerTarget(document.querySelector(INPUT_SEL));
    if (!target) {
      return;
    }
    observer = new MutationObserver(scheduleScan);
    observer.observe(target, {
      childList: true,
      subtree: true,
    });
  }

  function appUrl(appid) {
    return STEAM_STORE?.app?.(appid) || core.appUrl(appid, STEAM_STORE?.origin || "");
  }

  function refresh() {
    loadOptions().then(() => {
      scan();
      for (const input of document.querySelectorAll(INPUT_SEL)) {
        if (input instanceof HTMLInputElement) {
          applyNativeResults(input);
        }
      }
    }).catch(() => {});
  }

  function start() {
    if (!api.settings?.on?.("search-suggestions")) {
      return false;
    }
    if (started) {
      refresh();
      return true;
    }
    started = true;
    addStyle();
    refresh();
    observe();
    window.addEventListener("STStoreSettingsChanged", refresh);
    return true;
  }

  function stop() {
    if (!started) {
      return false;
    }
    started = false;
    observer?.disconnect?.();
    observer = null;
    scanPending = false;
    window.removeEventListener("STStoreSettingsChanged", refresh);
    clearAll();
    return true;
  }

  api.features.searchSuggestions = Object.freeze({
    start,
    stop,
    scan,
  });
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";

  const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff]/;
  const SUGGESTION_DEFAULT = 5;
  const SUGGESTION_MAX = 10;
  const DEFAULT_OPTIONS = Object.freeze({
    limit: SUGGESTION_DEFAULT,
    nativeMode: "default",
  });
  const NATIVE_MODES = new Set(["default", "one", "hide"]);

  function norm(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function readyKeyword(value) {
    const keyword = norm(value);
    if (!keyword) {
      return "";
    }
    if (CJK_RE.test(keyword)) {
      return keyword;
    }
    return Array.from(keyword).length >= 2 ? keyword : "";
  }

  function sourcesFromSettings(settings) {
    const src = settings || {};
    return {
      user_custom: src["search-suggestions-user-custom"] !== false,
      user_alias: src["search-suggestions-user-alias"] !== false,
      community: src["search-suggestions-community"] !== false,
      community_alias: src["search-suggestions-community-alias"] !== false,
      ai: src["search-suggestions-ai"] !== false,
    };
  }

  function modesFromSettings(settings) {
    const src = settings || {};
    return {
      pinyin: src["search-suggestions-pinyin"] !== false,
      mnemonic: src["search-suggestions-mnemonic"] !== false,
    };
  }

  function normalizeLimit(value) {
    const num = Number.parseInt(value, 10);
    if (!Number.isFinite(num)) {
      return SUGGESTION_DEFAULT;
    }
    return Math.max(1, Math.min(SUGGESTION_MAX, num));
  }

  function defaultOptions() {
    return { ...DEFAULT_OPTIONS };
  }

  function normalizeOptions(value) {
    const src = value && typeof value === "object" ? value : {};
    const nativeMode = NATIVE_MODES.has(src.nativeMode) ? src.nativeMode : DEFAULT_OPTIONS.nativeMode;
    return {
      limit: normalizeLimit(src.limit),
      nativeMode,
    };
  }

  function mergeByApp(items, limit = SUGGESTION_DEFAULT) {
    const max = normalizeLimit(limit);
    const out = [];
    const seen = new Set();
    for (const item of Array.isArray(items) ? items : []) {
      const appid = Number(item?.appid) || 0;
      if (!appid) {
        const key = `missing:${item?.steam_name || item?.label || out.length}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        out.push({ ...item, appid: 0, _idx: out.length });
        if (out.length >= max) {
          break;
        }
        continue;
      }
      if (seen.has(appid)) {
        continue;
      }
      seen.add(appid);
      out.push({ ...item, appid, _idx: out.length });
      if (out.length >= max) {
        break;
      }
    }
    return out;
  }

  function cacheKey(keyword, sources, modes) {
    const src = sources || {};
    const mode = modes || {};
    return [
      norm(keyword),
      src.user_custom === false ? 0 : 1,
      src.user_alias === false ? 0 : 1,
      src.community === false ? 0 : 1,
      src.community_alias === false ? 0 : 1,
      src.ai === false ? 0 : 1,
      mode.pinyin === false ? 0 : 1,
      mode.mnemonic === false ? 0 : 1,
    ].join("|");
  }

  function appUrl(appid, origin = "") {
    const id = Number(appid) || 0;
    const base = String(origin || "").replace(/\/+$/, "");
    return id > 0 && base ? `${base}/app/${id}/` : "";
  }

  return {
    readyKeyword,
    defaultOptions,
    normalizeOptions,
    sourcesFromSettings,
    modesFromSettings,
    mergeByApp,
    cacheKey,
    appUrl,
    SUGGESTION_LIMIT: SUGGESTION_DEFAULT,
    SUGGESTION_MAX,
  };
});
