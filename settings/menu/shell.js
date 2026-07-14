/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置面板|分类渲染与页面外壳
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  function fallback(value, name) {
    if (typeof value === "function") {
      return value;
    }
    return root.STSettingsHtml?.[name] || ((text) => String(text ?? ""));
  }

  function noop() {}

  function create(options = {}) {
    const api = options.api || root.STSettings || {};
    const storage = options.storage || api.storage || {};
    const deps = options.deps || {};
    const panels = options.panels || {};
    const getActiveCat = typeof options.getActiveCat === "function" ? options.getActiveCat : () => "account";
    const setActiveCat = typeof options.setActiveCat === "function" ? options.setActiveCat : noop;
    const getStates = typeof options.getStates === "function" ? options.getStates : () => ({});
    const esc = fallback(options.esc, "esc");
    const escAttr = fallback(options.escAttr, "escAttr");
    const dialog = typeof options.dialog === "function" ? options.dialog : () => Promise.resolve("");
    const assets = options.assets || {};
    const ctxCache = new WeakMap();
    const log = root.STLoggerFactory?.createLogger?.("settings", "menu-shell") || {
      warn() {},
    };

    function tr(key, fallback, params) {
      return root.STI18n?.text?.(key, fallback, params) || String(fallback ?? key ?? "");
    }

    function catName(cat) {
      const key = cat?.nameKey || (cat?.kind === "page" && cat?.id ? `settings.page.${cat.id}.name` : "");
      return tr(key, cat?.name || "");
    }

    function catDesc(cat) {
      const key = cat?.descKey || (cat?.kind === "page" && cat?.id ? `settings.page.${cat.id}.desc` : "");
      return tr(key, cat?.desc || "");
    }

    function pageApi() {
      return root.STSettingsPages || null;
    }

    function allCategories() {
      const cats = api.catalog?.list?.() || [];
      const pages = pageApi()?.categories?.() || [];
      const before = pages.filter(page => Number(page.order) < 0);
      const after = pages.filter(page => Number(page.order) >= 0);
      return [...before, ...cats, ...after];
    }

    function pageList() {
      return pageApi()?.list?.() || [];
    }

    function pageById(id) {
      return pageApi()?.get?.(id) || null;
    }

    function pageStyles() {
      return pageApi()?.styles?.() || "";
    }

    function settingsCss() {
      return root.STSettingsStyles?.css?.(pageStyles()) || pageStyles();
    }

    function refreshCat(shadow, id) {
      if (shadow && getActiveCat() === id) {
        render(shadow);
      }
    }

    function pageCtx(shadow) {
      if (shadow && ctxCache.has(shadow)) {
        return ctxCache.get(shadow);
      }
      const ctx = {
        storage,
        esc,
        parseJson: options.parseJson || (() => ({})),
        version: options.version || (() => ""),
        homepage: options.homepage || (() => ""),
        deviceName: options.deviceName || (() => "Steam Buff"),
        timeText: options.timeText || (() => "暂无"),
        dialog,
        refresh: (id) => refreshCat(shadow, id),
      };
      if (shadow) {
        ctxCache.set(shadow, ctx);
      }
      return ctx;
    }

    function hookMeta(meta, startedAt, error) {
      return {
        pageId: String(meta.pageId || ""),
        hook: String(meta.hook || ""),
        activeCat: getActiveCat(),
        error: error?.message || String(error),
        durationMs: Date.now() - startedAt,
      };
    }

    function runPage(fn, shadow, ctx, meta = {}) {
      const startedAt = Date.now();
      try {
        Promise.resolve(fn(shadow, ctx)).catch((error) => {
          log.warn(meta.event || "settings-page-hook-failed", meta.message || "设置页面 hook 执行失败", hookMeta(meta, startedAt, error));
        });
      } catch (error) {
        log.warn(meta.event || "settings-page-hook-failed", meta.message || "设置页面 hook 执行失败", hookMeta(meta, startedAt, error));
      }
    }

    function callPageOpen(shadow, id = getActiveCat()) {
      const page = pageById(id);
      if (typeof page?.onOpen === "function") {
        runPage(page.onOpen, shadow, pageCtx(shadow), {
          event: "settings-page-open-failed",
          message: "设置页面打开失败",
          pageId: id,
          hook: "onOpen",
        });
      }
    }

    function callPanelOpen(shadow) {
      const ctx = pageCtx(shadow);
      for (const page of pageList()) {
        if (typeof page.onPanelOpen === "function") {
          runPage(page.onPanelOpen, shadow, ctx, {
            event: "settings-panel-open-hook-failed",
            message: "设置面板打开 hook 执行失败",
            pageId: page.id,
            hook: "onPanelOpen",
          });
        }
      }
      callPageOpen(shadow);
    }

    async function loadPages() {
      await pageApi()?.load?.(pageCtx(null));
    }

    function showCat(cat) {
      return !!cat;
    }

    function navHtml(categories) {
      const activeCat = getActiveCat();
      return categories.filter(showCat).map((cat) => `
        <button class="nav-item${cat.id === activeCat ? " active" : ""}" type="button" data-cat="${escAttr(cat.id)}" role="tab" aria-selected="${cat.id === activeCat ? "true" : "false"}">
          <span>${esc(catName(cat))}</span>
        </button>
      `).join("");
    }

    function titleHelpHtml(cat) {
      return deps.helpLinkHtml?.(cat) || "";
    }

    function itemPanelHtml(cat, item) {
      if (item?.panel === "family-library") {
        return panels.familyLibrary().html(cat);
      }
      if (item?.panel === "search-suggestion") {
        return panels.searchSuggestion().html(cat);
      }
      if (item?.panel === "see") {
        return panels.see().html(cat);
      }
      return "";
    }

    function itemListHtml(cat, items, className = "feature-list") {
      const html = (items || []).map((item) => featureItemHtml(cat, item)).join("");
      return html ? `<div class="${className}">${html}</div>` : "";
    }

    function featureItemHtml(cat, item) {
      const children = Array.isArray(item?.children) ? item.children : [];
      const panelHtml = itemPanelHtml(cat, item);
      if (children.length || panelHtml) {
        const childrenHtml = itemListHtml(cat, children, "feature-list settings-drawer-list");
        const bodyHtml = item?.panelPosition === "before"
          ? `${panelHtml}${childrenHtml}`
          : `${childrenHtml}${panelHtml}`;
        return deps.drawerItemHtml?.(item, bodyHtml) || "";
      }
      return deps.itemHtml(cat, item);
    }

    function emptyHtml(cat) {
      const title = cat?.emptyTitle || "暂无可配置功能";
      const desc = cat?.emptyDesc || "此分类暂未接入独立功能。";
      return `
        <section class="settings-card section-card settings-empty-card">
          <div class="section-header">
            <div class="dot"></div>
            <div class="title">${esc(title)}</div>
          </div>
          <div class="settings-card-note">${esc(desc)}</div>
        </section>
      `;
    }

    function categoryBodyHtml(cat, page, items) {
      if (page) {
        return page.html?.(pageCtx(null)) || "";
      }
      if (cat.kind === "empty") {
        return emptyHtml(cat);
      }
      if (cat.kind === "see") {
        return panels.see().html(cat);
      }
      if (cat.kind === "search-suggestion") {
        return panels.searchSuggestion().html(cat);
      }
      if (cat.kind === "translate") {
        return panels.translate().html(cat);
      }
      if (cat.kind === "review-filter") {
        return panels.review().html(cat);
      }
      if (cat.kind === "ai") {
        return `${items.map((item) => deps.masterItemHtml?.(item) || "").join("")}${panels.ai().html(cat)}`;
      }
      if (cat.kind === "third-party-services") {
        return panels.thirdPartyServices().html(cat);
      }
      return itemListHtml(cat, items);
    }

    function contentHtml(categories) {
      const visible = categories.filter(showCat);
      const activeCat = getActiveCat();
      const cat = visible.find((item) => item.id === activeCat) || visible[0] || categories[0];
      if (!cat) {
        return "";
      }
      const page = pageById(cat.id);
      const items = cat.items || [];
      const localeHtml = cat.id === "extension-settings" ? uiLocaleHtml() : "";
      const body = categoryBodyHtml(cat, page, items);
      const header = page?.hideHeader ? "" : `
          <h2 class="page-title"><span>${esc(catName(cat))}</span>${titleHelpHtml(cat)}</h2>
          <p class="desc page-subtitle">${esc(catDesc(cat))}</p>
      `;
      return `
        <div class="content-swap" data-active="${escAttr(cat.id)}">
          ${header}
          ${localeHtml}
          ${body}
        </div>
      `;
    }

    function uiLocaleHtml() {
      const i18n = root.STI18n;
      const locale = i18n?.locale?.() || "zh_CN";
      const options = (i18n?.locales?.() || [
        { value: "zh_CN", label: "简体中文" },
        { value: "en", label: "English" },
        { value: "zh_TW", label: "繁體中文" },
      ]).map((item) => `
        <option value="${escAttr(item.value || item.id)}" ${String(item.value || item.id) === String(locale) ? "selected" : ""}>${esc(item.label)}</option>
      `).join("");
      return `
        <section class="settings-card section-card ui-locale-card">
          <div class="section-header">
            <div class="dot"></div>
            <div class="title">${esc(tr("settings.uiLocale.title", "界面语言"))}</div>
          </div>
          <div class="settings-grid">
            <div class="settings-row form-row">
              <span class="settings-label label">${esc(tr("settings.uiLocale.label", "显示语言"))}</span>
              <span class="settings-value control">
                <select class="settings-control" data-ui-locale aria-label="${escAttr(tr("settings.uiLocale.label", "显示语言"))}">
                  ${options}
                </select>
              </span>
            </div>
          </div>
          <div class="settings-card-note">${esc(tr("settings.uiLocale.desc", "选择 Steam Buff 扩展界面使用的语言。诊断日志仍保持中文，便于排查。"))}</div>
        </section>
      `;
    }

    function setTrustedTemplate(element, html, reason) {
      const dom = root.STDomUtils;
      dom.setTrustedHTML(element, dom.trustedHTML(html, reason));
    }

    function afterRender(shadow) {
      panels.review?.().renderDynamicLists?.(shadow);
    }

    function render(shadow) {
      const categories = allCategories();
      const nav = shadow.querySelector(".nav");
      const body = shadow.querySelector(".body");
      if (!categories.length || !nav || !body) {
        return;
      }

      syncChromeText(shadow);
      const visible = categories.filter(showCat);
      if (!visible.some((cat) => cat.id === getActiveCat())) {
        setActiveCat(visible[0]?.id || categories[0].id);
      }

      setTrustedTemplate(nav, navHtml(categories), "settings-shell-nav-template");
      setTrustedTemplate(body, contentHtml(categories), "settings-shell-content-template");
      afterRender(shadow);
    }

    function syncChromeText(shadow) {
      const settings = tr("settings.shell.settingsButton", "设置");
      const filtered = tr("settings.shell.filteredReviewsButton", "查看已过滤评论");
      const top = tr("settings.shell.topButton", "回到顶部");
      const title = tr("settings.shell.title", "扩展设置");
      const close = tr("settings.shell.close", "关闭");
      const nav = tr("settings.shell.navLabel", "设置分类");
      const round = shadow.querySelector(".round");
      const review = shadow.querySelector(".comment-filter");
      const topBtn = shadow.querySelector(".top");
      const overlay = shadow.querySelector(".overlay");
      const panel = shadow.querySelector(".panel");
      const titleText = shadow.querySelector(".head .title span");
      const closeBtn = shadow.querySelector(".close");
      const navEl = shadow.querySelector(".nav");
      round?.setAttribute("title", settings);
      round?.setAttribute("aria-label", settings);
      review?.setAttribute("title", filtered);
      review?.setAttribute("aria-label", filtered);
      topBtn?.setAttribute("title", top);
      topBtn?.setAttribute("aria-label", top);
      overlay?.setAttribute("aria-label", title);
      panel?.setAttribute("aria-label", title);
      if (titleText) {
        titleText.textContent = title;
      }
      closeBtn?.setAttribute("aria-label", close);
      navEl?.setAttribute("aria-label", nav);
    }

    function syncModuleNav(shadow) {
      const nav = shadow.querySelector(".nav");
      if (!nav) {
        return false;
      }

      const categories = allCategories();
      const visible = categories.filter(showCat);
      if (!visible.some(cat => cat.id === getActiveCat())) {
        render(shadow);
        return true;
      }

      setTrustedTemplate(nav, navHtml(categories), "settings-shell-nav-template");
      return true;
    }

    function template() {
      const settings = tr("settings.shell.settingsButton", "设置");
      const filtered = tr("settings.shell.filteredReviewsButton", "查看已过滤评论");
      const top = tr("settings.shell.topButton", "回到顶部");
      const title = tr("settings.shell.title", "扩展设置");
      const close = tr("settings.shell.close", "关闭");
      const nav = tr("settings.shell.navLabel", "设置分类");
      return `
        <style>${settingsCss()}</style>

        <div class="rail">
          <div class="item">
            <button class="round" type="button" title="${escAttr(settings)}" aria-label="${escAttr(settings)}" aria-expanded="false">
              <span class="content">
                <img alt="" src="${escAttr(assets.iconUrl?.() || "")}">
              </span>
            </button>
          </div>
          <div class="item">
            <button class="comment-filter" type="button" title="${escAttr(filtered)}" aria-label="${escAttr(filtered)}" hidden>
              <span class="content">
                <img alt="" src="${escAttr(assets.commentFilterUrl?.() || "")}">
              </span>
              <span class="comment-filter-count" hidden>0</span>
            </button>
          </div>
          <div class="item">
            <button class="top" type="button" title="${escAttr(top)}" aria-label="${escAttr(top)}" hidden>
              <span class="content">
                <img alt="" src="${escAttr(assets.topUrl?.() || "")}">
              </span>
            </button>
          </div>
        </div>

        <section class="overlay" hidden aria-label="${escAttr(title)}">
          <div class="panel" role="dialog" aria-modal="true" aria-label="${escAttr(title)}">
            <header class="head">
              <div class="title">
                <img class="logo" alt="" src="${escAttr(assets.appIconUrl?.() || "")}">
                <span>${esc(title)}</span>
              </div>
              <button class="close" type="button" aria-label="${escAttr(close)}">&times;</button>
            </header>
            <div class="main">
              <aside class="side">
                <nav class="nav" aria-label="${escAttr(nav)}" role="tablist"></nav>
              </aside>
              <section class="body" aria-live="polite"></section>
            </div>
          </div>
        </section>
      `;
    }

    return Object.freeze({
      allCategories,
      pageCtx,
      pageList,
      pageById,
      loadPages,
      callPageOpen,
      callPanelOpen,
      navHtml,
      contentHtml,
      render,
      syncChromeText,
      syncModuleNav,
      settingsCss,
      showCat,
      template,
      getActiveCat,
      setActiveCat,
    });
  }

  const api = Object.freeze({ create });
  root.STSettingsMenuShell = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
