/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页|中文译名与备注统一编辑
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root, factory) => {
  "use strict";

  const commonJs = typeof module === "object" && module.exports;
  const titleNames = commonJs ? require("../../../shared/app-title-names.js") : root.STAppTitleNames;
  const core = factory(titleNames);
  if (commonJs) {
    module.exports = core;
    return;
  }

  const api = root.STStore;
  if (!api) return;

  const { FEATURE: FEATURE_ID, decorateName } = titleNames;
  const AUTH_REFRESH = root.STConfig.loginAuth("/auth/refresh");
  const NAME_BATCH_SIZE = 80;
  const HOST_ID = "st-title-custom-name";
  const TITLE_SEL = ".apphub_AppName, .apphub_AppName_responsive, h1";
  const RETRY_MS = 300;
  const RETRY_MAX = 30;
  const DETAIL_SETTLE_MAX = 10;
  const DETAIL_OBSERVER_DEBOUNCE_MS = 1000;

  function i18n(key, fallback, params) {
    return root.STI18n.text(key, fallback, params);
  }

  const { text, shouldShowName } = core;
  const wishlistDom = api.wishlistDom;
  let state = null;
  let observer = null;
  let wishlistSubscription = null;
  let detailSettleTimer = 0;
  let detailSettleChecks = 0;
  let started = false;
  let tries = 0;
  let refreshSeq = 0;
  let detailRefresh = null;
  let editor = null;
  let editorSeq = 0;
  let lastDetailTargetMissing = false;
  let lastWishlistTargetMissing = false;
  const nameCache = new Map();
  const nameListeners = new Set();
  let publishedName = '';
  const namePending = new Set();

  /* 授权与接口请求 */
  function storage() {
    return root.STSettings?.storage || null;
  }

  let authClient = null;

  function getAuthClient() {
    if (!authClient) {
      authClient = root.STAuthClient?.createClient({
        storage: storage(),
        refreshUrl: AUTH_REFRESH,
        loginMessage: i18n("store.titleCustomName.loginRequired", "请先在设置中登录"),
        expiredMessage: i18n("store.titleCustomName.loginExpired", "登录已过期，请重新登录"),
      }) || null;
    }
    return authClient;
  }
  const log = root.STLoggerFactory.createLogger("store", "title-custom-name");

  function namesUrl(editor = false) {
    return titleNames.url(titleNames.sources(api.settings?.all?.() || {}, editor));
  }

  async function authedPost(url, body, diagnostics = {}) {
    const client = getAuthClient();
    if (!client) throw new Error(i18n("store.titleCustomName.loginRequired", "请先在设置中登录"));
    const { body: data, code } = await client.authedPost(url, body, {
      throwOnMissingAuth: true,
      operationId: diagnostics.operationId || "",
      ownerId: diagnostics.ownerId,
      sessionKey: diagnostics.sessionKey,
      beforeSend: diagnostics.beforeSend,
    });
    if (code < 200 || code >= 300) throw new Error(data?.message || i18n("common.requestFailedCode", "请求失败：$code$", { code }));
    return data || {};
  }

  function pageInfo() {
    const info = api.ctx?.pageInfo?.();
    if (!info || info.type !== "app") return null;
    const appid = Number(info.appId) || 0;
    return appid > 0 ? { appid } : null;
  }

  function isWishlistPath() {
    return /^\/wishlist(?:\/|$)/i.test(location.pathname);
  }

  function isDetailPath() {
    return /^\/app\/\d+(?:\/|$)/i.test(location.pathname);
  }

  function visibleTitleElement(el) {
    if (!(el instanceof HTMLElement) || !text(el)) {
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


  function steamName() {
    return text(state?.item?.steam_name) || state?.steamTitle || "";
  }

  function addStyle() {
    api.styles?.ensureFeatureStyle?.("store-title-custom-name");
    root.STComponents.ensureStyle("st-title-custom-name-button-style", titleNames.buttonCss);
  }

  function ensureHost(title) {
    addStyle();
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement("span");
      host.id = HOST_ID;
      title.appendChild(host);
    } else if (host.parentElement !== title) {
      title.appendChild(host);
    }
    return host;
  }

  /** 只读取当前已加载的选定名称，不查询网络；无名称时返回空字符串。 */
  function currentName(appid) {
    const id = Number(appid);
    const item = state?.appid === id ? state.item : nameCache.get(id);
    return item?.name_source === 'none' ? '' : text(item?.name);
  }

  function publishName(appid) {
    const name = currentName(appid), signature = JSON.stringify([appid, name]);
    if (signature === publishedName) return;
    publishedName = signature;
    for (const listener of nameListeners) {
      try { listener({ appId: appid }); }
      catch (error) { log.error('title-name-subscriber-failed', '通知当前游戏名称变化失败', { appid, error }); }
    }
  }

  function renderTitle() {
    const title = titleEl();
    if (!title || !state) {
      if (state?.appid && !lastDetailTargetMissing) {
        lastDetailTargetMissing = true;
        log.warn("title-custom-name-mount-target-missing", "商店标题自定义名挂载目标未找到", {
          appid: state.appid,
          selector: TITLE_SEL,
          path: location.pathname,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            dpr: window.devicePixelRatio,
          },
        });
      }
      return false;
    }
    lastDetailTargetMissing = false;
    const host = ensureHost(title);
    const steamTitle = state.steamTitle || text(title.childNodes[0] || title);
    renderNameHost(host, state.appid, decorateName(state.item), steamTitle, "detail", state.loading === true);
    publishName(state.appid);
    return true;
  }

  function renderNameHost(host, appid, item, steamTitle, mode, loading = false) {
    const visibleName = !loading && shouldShowName(item, steamTitle) ? text(item?.name) : "";
    const label = visibleName ? `[${visibleName}]` : "";
    const idText = String(appid || "");
    const key = JSON.stringify([appid, text(item?.name), text(item?.name_source), steamTitle, mode, loading]);
    const labelReady = (host.dataset.label || "") === label;
    const idReady = (host.dataset.stAppid || "") === idText;
    const contentReady = loading
      ? !!host.querySelector(".st-store-skeleton")
      : !!host.querySelector(".st-title-custom-name-btn");
    if (host._stTitleCustomNameKey === key && contentReady && labelReady && idReady) {
      return;
    }
    host._stTitleCustomNameKey = key;
    if (host.hasAttribute("data-appid")) host.removeAttribute("data-appid");
    if (!idReady) host.dataset.stAppid = idText;
    if (label) host.dataset.label = label;
    else delete host.dataset.label;
    api.dom.loading.clear(host);
    host.replaceChildren();
    // 名称和编辑入口作为一个加载区域，结果结束前不暴露可点击按钮
    if (loading) {
      host.appendChild(api.dom.loading.create("line"));
      api.dom.loading.activate(host);
      return;
    }
    const button = document.createElement("button");
    button.className = "st-title-custom-name-btn";
    button.type = "button";
    button.textContent = i18n("store.titleCustomName.edit", "编辑");
    host.appendChild(button);
    api.dom.loading.activate(host);
    if (mode === "detail") {
      log.info("title-custom-name-button-mounted", "商店标题自定义名按钮已挂载", {
        appid,
        mode,
        hasVisibleName: !!visibleName,
        hostClass: host.className || "",
        path: location.pathname,
      });
    }
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      log.info("title-custom-name-modal-open-start", "用户打开商店标题自定义名弹窗", {
        appid,
        mode,
      });
      openModal({
        appid,
        steamTitle,
        item: item || null,
        mode,
        trigger: button,
      });
    });
  }

  async function editorIdentity() {
    const { auth, userId } = await storage().getAuthIdentity({ strict: true });
    return { ownerId: userId, sessionKey: root.STAuthSession.authKey(auth) };
  }

  async function sameEditorIdentity(ctx) {
    const current = await editorIdentity();
    return ctx.routeSeq === refreshSeq && ctx.ownerId === current.ownerId && ctx.sessionKey === current.sessionKey;
  }

  async function guardEditor(ctx) {
    if (await sameEditorIdentity(ctx) && ctx.editorSeq === editorSeq) return;
    throw Object.assign(new Error("游戏或登录状态已变化"), { code: "request-obsolete" });
  }

  function editorOptions(ctx, diagnostics = {}) {
    return { ...diagnostics, ownerId: ctx.ownerId, sessionKey: ctx.sessionKey, beforeSend: () => guardEditor(ctx) };
  }

  async function openModal(ctx = null, initialTab = "base") {
    const source = ctx || state;
    if (!source?.appid) return;
    const seq = ++editorSeq;
    const routeSeq = refreshSeq;
    try {
      const identity = await editorIdentity();
      if (seq !== editorSeq || routeSeq !== refreshSeq) return;
      editor ||= root.STGameInfoEditor.create({
        domain: "store",
        feature: "search",
        log,
        async post(url, body, diagnostics, edit) {
          const data = await authedPost(url, body, editorOptions(edit, diagnostics));
          if (url === root.STConfig.steamBuff("/aliases/query")) await guardEditor(edit);
          return data;
        },
        loadName,
        async getNote(appid, edit) {
          await guardEditor(edit);
          const note = await modalNote(appid, editorOptions(edit));
          await guardEditor(edit);
          return note;
        },
        async saveNote(appid, steamTitle, note, diagnostics, edit) {
          if (typeof api.features.gameNotes?.saveNote !== "function") throw notesUnavailable();
          await guardEditor(edit);
          return api.features.gameNotes.saveNote(appid, steamTitle, note, {
            ...editorOptions(edit, diagnostics),
            canCommit: () => sameEditorIdentity(edit),
          });
        },
        onNameSaved,
        onClose() { editorSeq += 1; },
      });
      // 标题缓存供页面显示。编辑表单按打开时的会话读取个人名称
      await editor.open({ ...source, ...identity, item: null, routeSeq, editorSeq: seq }, initialTab);
    } catch (error) {
      if (seq !== editorSeq || routeSeq !== refreshSeq || error?.code === "request-obsolete" || error?.code === "owner-changed") return;
      log.warn("title-custom-name-modal-open-failed", "打开游戏信息编辑器失败", { error });
      void root.STFeedback.show(document.body, { message: error.message });
    }
  }

  function notesUnavailable() {
    const error = new Error(i18n("store.titleCustomName.notesUnavailable", "游戏备注模块未加载"));
    error.code = "GAME_NOTES_API_UNAVAILABLE";
    return error;
  }

  async function modalNote(appid, diagnostics) {
    if (typeof api.features.gameNotes?.getNote !== "function") throw notesUnavailable();
    return api.features.gameNotes.getNote(appid, diagnostics);
  }

  async function onNameSaved(ctx, { custom, aliases }) {
    if (!await sameEditorIdentity(ctx)) return;
    const item = decorateName({
      ...(nameCache.get(ctx.appid) || {}),
      appid: ctx.appid,
      name: custom,
      source: custom ? "mine" : "none",
      mine: custom,
      steam_name: ctx.steamTitle,
      ...(aliases ? { aliases } : {}),
    });
    nameCache.set(ctx.appid, item);
    if (state?.appid === ctx.appid) {
      state.item = item;
      renderTitle();
    }
    renderWishlistName(ctx.appid);
  }

  async function loadName(appid, edit) {
    const startedAt = Date.now();
    log.info("title-custom-name-load-start", "开始读取商店标题中文名", { appid });
    try {
      const body = await authedPost(namesUrl(true), { appids: [appid] }, edit ? editorOptions(edit) : {});
      if (edit) await guardEditor(edit);
      const data = decorateName(Array.isArray(body?.data) ? body.data[0] : null);
      log.info("title-custom-name-load-success", "商店标题中文名读取完成", {
        appid,
        hasName: !!data?.name,
        durationMs: Date.now() - startedAt,
      });
      return data;
    } catch (error) {
      log.error("title-custom-name-load-failed", "商店标题中文名读取失败", {
        appid,
        durationMs: Date.now() - startedAt,
        error,
      });
      throw error;
    }
  }

  function chunk(values, size) {
    const out = [];
    for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
    return out;
  }

  async function batchFetchWishlistNames(appids, requestSeq = refreshSeq) {
    const ids = Array.from(new Set((appids || [])
      .map(Number)
      .filter(id => id > 0 && !nameCache.has(id) && !namePending.has(id))));
    if (!ids.length) return;
    ids.forEach(id => namePending.add(id));
    for (const part of chunk(ids, NAME_BATCH_SIZE)) {
      if (requestSeq !== refreshSeq || !started || !api.settings?.on?.(FEATURE_ID)) {
        break;
      }
      const startedAt = Date.now();
      try {
        const body = await authedPost(namesUrl(false), { appids: part });
        if (requestSeq !== refreshSeq || !started || !api.settings?.on?.(FEATURE_ID)) {
          break;
        }
        const found = new Set();
        for (const item of body?.data || []) {
          const appid = Number(item.appid) || 0;
          if (!appid) continue;
          found.add(appid);
          nameCache.set(appid, decorateName(item));
        }
        for (const appid of part) {
          if (!found.has(appid)) nameCache.set(appid, null);
        }
        log.info("title-custom-name-wishlist-load-success", "愿望单中文译名批量读取完成", {
          count: part.length,
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        log.warn("title-custom-name-wishlist-load-failed", "愿望单中文译名批量读取失败", {
          count: part.length,
          durationMs: Date.now() - startedAt,
          error,
        });
      } finally {
        if (requestSeq === refreshSeq) {
          part.forEach(id => namePending.delete(id));
        }
      }
    }
  }

  function wishlistRows() {
    return wishlistDom?.rows?.(document) || [];
  }

  function rowAppid(row) {
    return wishlistDom?.rowAppid?.(row) || 0;
  }

  function wishlistTitleNode(row) {
    return wishlistDom?.titleNode?.(row) || null;
  }

  function wishlistTitleHost(row) {
    return wishlistDom?.titleHost?.(row) || null;
  }

  function steamTitleFromRow(row) {
    const title = wishlistTitleNode(row);
    return wishlistDom?.titleText?.(title) || text(title?.textContent || title?.getAttribute?.("title") || "");
  }

  function ensureWishlistHost(row) {
    const title = wishlistTitleNode(row);
    const parent = wishlistTitleHost(row);
    if (!title || !parent) {
      if (!lastWishlistTargetMissing) {
        lastWishlistTargetMissing = true;
        log.warn("title-custom-name-wishlist-target-missing", "愿望单自定义名称挂载目标未找到", {
          path: location.pathname,
          hasTitle: !!title,
          hasParent: !!parent,
        });
      }
      return null;
    }
    lastWishlistTargetMissing = false;
    parent.classList.add("st-title-custom-name-wishlist-row");
    title.classList.add("st-title-custom-name-wishlist-title");
    let host = parent.querySelector(":scope > .st-title-custom-name-wishlist")
      || row.querySelector(".st-title-custom-name-wishlist");
    if (!host) {
      host = document.createElement("span");
      host.className = "st-title-custom-name-wishlist";
    }
    if (host.previousElementSibling !== title || host.parentElement !== parent) {
      title.insertAdjacentElement("afterend", host);
    }
    return host;
  }

  function renderWishlistRow(row, completed = false) {
    const appid = rowAppid(row);
    if (!appid) {
      const host = row.querySelector(".st-title-custom-name-wishlist");
      if (host) { api.dom.loading.clear(host); host.remove(); }
      row.querySelector(".st-title-custom-name-wishlist-row")?.classList.remove("st-title-custom-name-wishlist-row");
      row.querySelector(".st-title-custom-name-wishlist-title")?.classList.remove("st-title-custom-name-wishlist-title");
      return 0;
    }
    const host = ensureWishlistHost(row);
    if (!host) return 0;
    const steamTitle = steamTitleFromRow(row);
    const loading = !completed && !nameCache.has(appid)
      && (!host._stTitleCustomNameKey || host.dataset.stAppid !== String(appid) || !!host.querySelector(".st-store-skeleton"));
    renderNameHost(host, appid, decorateName(nameCache.get(appid) || null), steamTitle, "wishlist", loading);
    return loading ? appid : 0;
  }

  function renderWishlistName(appid) {
    for (const row of wishlistRows()) {
      if (rowAppid(row) === Number(appid)) renderWishlistRow(row, true);
    }
  }

  function renderWishlistRows(targets) {
    addStyle();
    return targets.map(row => renderWishlistRow(row)).filter(Boolean);
  }

  async function loadWishlistNames(appids) {
    const seq = refreshSeq;
    await batchFetchWishlistNames(appids, seq);
    if (seq !== refreshSeq || !started || !isWishlistPath() || !api.settings.on(FEATURE_ID) || document.hidden) return;
    const ids = new Set(appids);
    for (const row of wishlistRows()) {
      if (ids.has(rowAppid(row))) renderWishlistRow(row, true);
    }
  }

  function startWishlist() {
    if (!isWishlistPath()) return false;
    if (wishlistSubscription) {
      wishlistSubscription.refresh();
    } else {
      if (!wishlistDom.listContainer()) {
        log.debug("title-custom-name-wishlist-observer-target-missing", "愿望单自定义名称监听目标尚未挂载", { path: location.pathname });
      }
      wishlistSubscription = wishlistDom.observeRows(FEATURE_ID, {
        render: renderWishlistRows,
        load: loadWishlistNames,
      });
    }
    return true;
  }

  function detailMountedOnCurrentTitle() {
    const title = titleEl();
    const host = document.getElementById(HOST_ID);
    return !!title && !!host && host.parentElement === title;
  }

  function scheduleDetailSettleCheck(seq) {
    if (detailSettleTimer || detailSettleChecks >= DETAIL_SETTLE_MAX) {
      return;
    }
    detailSettleTimer = setTimeout(() => {
      detailSettleTimer = 0;
      if (seq !== refreshSeq || !started || !api.settings?.on?.(FEATURE_ID)) {
        return;
      }
      detailSettleChecks += 1;
      if (!detailMountedOnCurrentTitle()) {
        refresh().catch((error) => {
          globalThis.STLoggerFactory.reportError(error, { domain: "store", feature: "search", event: "schedule-detail-settle-check-failed", message: "商店功能处理失败", level: "error", phase: "scheduleDetailSettleCheck" });});
        return;
      }
      scheduleDetailSettleCheck(seq);
    }, RETRY_MS);
  }

  async function refresh() {
    if (isWishlistPath()) {
      startWishlist();
      return;
    }
    if (!isDetailPath()) {
      return;
    }
    const info = pageInfo();
    // 同一轮详情读取只重挂当前标题，保留在途结果与原绘制等待。
    if (info && detailRefresh?.appid === info.appid && detailRefresh.seq === refreshSeq) {
      const title = titleEl();
      if (title) state.steamTitle = text(title.childNodes[0] || title);
      renderTitle();
      return detailRefresh.task;
    }
    const seq = ++refreshSeq;
    const title = titleEl();
    if (!info || !title) {
      if (info && tries < RETRY_MAX) {
        tries += 1;
        setTimeout(() => {
          if (seq === refreshSeq) refresh().catch((error) => {
            globalThis.STLoggerFactory.reportError(error, { domain: "store", feature: "search", event: "refresh-failed", message: "刷新功能状态失败", level: "error", phase: "refresh" });});
        }, RETRY_MS);
      }
      return;
    }
    lastDetailTargetMissing = false;
    tries = 0;
    if (state?.appid !== info.appid) {
      detailSettleChecks = 0;
    }
    state = {
      appid: info.appid,
      steamTitle: text(title.childNodes[0] || title),
      item: nameCache.get(info.appid) || null,
      loading: !nameCache.has(info.appid),
    };
    renderTitle();
    scheduleDetailSettleCheck(seq);
    const request = { appid: info.appid, seq, task: readDetailName(info.appid, seq) };
    detailRefresh = request;
    try {
      await request.task;
    } finally {
      if (detailRefresh === request) detailRefresh = null;
    }
  }

  async function readDetailName(appid, seq) {
    try {
      if (state.loading && !await api.dom.loading.afterPaint(() => seq === refreshSeq && started && pageInfo()?.appid === appid)) return;
      const item = await loadName(appid);
      if (seq !== refreshSeq || state?.appid !== appid) return;
      state.item = item;
      nameCache.set(appid, item);
    } catch (error) {
      globalThis.STLoggerFactory.reportError(error, { domain: "store", feature: "search", event: "refresh-failed", message: "刷新功能状态失败", level: "warn", phase: "refresh" });
      if (seq !== refreshSeq || state?.appid !== appid) return;
      state.item = null;
    }
    state.loading = false;
    renderTitle();
    scheduleDetailSettleCheck(seq);
  }

  function applyCachedDecorations() {
    for (const [appid, item] of nameCache.entries()) {
      if (item && typeof item === "object") {
        nameCache.set(appid, decorateName(item));
      }
    }
    if (state?.appid) {
      state.item = decorateName(state.item);
      renderTitle();
    }
  }

  function observeTarget() {
    return document.getElementById("game_highlights")
      || document.querySelector(".apphub_AppName")?.parentElement
      || null;
  }

  function observe() {
    if (observer || isWishlistPath() || !isDetailPath()) return;
    const target = observeTarget();
    if (!target) {
      log.warn("title-custom-name-observer-target-missing", "商店标题自定义名监听目标未找到", {
        selector: "game_highlights | app title parent",
        path: location.pathname,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          dpr: window.devicePixelRatio,
        },
      });
      return;
    }
    const callback = () => {
      if (!started || document.hidden || !isDetailPath() || !api.settings?.on?.(FEATURE_ID)) return;
      const info = pageInfo();
      if (info && (!state || state.appid !== info.appid || !detailMountedOnCurrentTitle())) {
        refresh().catch((error) => {
          globalThis.STLoggerFactory.reportError(error, { domain: "store", feature: "search", event: "observe-failed", message: "商店功能处理失败", level: "error", phase: "observe" });});
      }
    };
    observer = root.STObserverUtils?.createDebouncedObserver?.(callback, DETAIL_OBSERVER_DEBOUNCE_MS, { records: false })
      || new MutationObserver(callback);
    // 只监听商店主内容容器；Steam 内部跳转会深层替换标题节点，保留 subtree。
    root.STObserverUtils?.createVisibilityGatedObserver?.(observer, target, { childList: true, subtree: true }, {
      resolveTarget: () => started && isDetailPath() && api.settings?.on?.(FEATURE_ID) ? observeTarget() : null,
      onResume: callback,
    })
      || observer.observe(target, { childList: true, subtree: true });
    log.info("title-custom-name-observer-start", "商店标题自定义名监听已启动", {
      targetId: target.id || "",
      targetClass: target.className || "",
      path: location.pathname,
    });
  }

  function start() {
    const startedAt = Date.now();
    if (!api.settings?.on?.(FEATURE_ID)) {
      log.info("title-custom-name-start-skipped", "商店标题自定义名开关关闭，跳过启动", {
        reason: "settings-disabled",
        path: location.pathname,
      });
      return false;
    }
    if (started) {
      applyCachedDecorations();
      if (isWishlistPath()) {
        startWishlist();
      } else if (isDetailPath()) {
        observe();
        const appid = state?.appid || pageInfo()?.appid;
        if (!nameCache.has(appid)) {
          refresh().catch((error) => {
            globalThis.STLoggerFactory.reportError(error, { domain: "store", feature: "search", event: "start-failed", message: "启动功能失败", level: "error", phase: "start" });});
        }
      }
      log.info("title-custom-name-start-skipped", "商店标题自定义名已启动，本次只触发刷新", {
        reason: "already-started",
        path: location.pathname,
      });
      return true;
    }
    started = true;
    if (isWishlistPath()) {
      startWishlist();
    } else if (isDetailPath()) {
      observe();
      refresh().catch((error) => {
        globalThis.STLoggerFactory.reportError(error, { domain: "store", feature: "search", event: "start-failed", message: "启动功能失败", level: "error", phase: "start" });});
    }
    log.info("title-custom-name-start-success", "商店标题自定义名已启动", {
      path: location.pathname,
      durationMs: Date.now() - startedAt,
    });
    return true;
  }

  function stop() {
    const previousAppId = state?.appid;
    refreshSeq += 1;
    editorSeq += 1;
    detailRefresh = null;
    started = false;
    tries = 0;
    observer?.disconnect();
    wishlistSubscription?.dispose();
    wishlistSubscription = null;
    observer = null;
    clearTimeout(detailSettleTimer);
    detailSettleTimer = 0;
    detailSettleChecks = 0;
    state = null;
    nameCache.clear();
    if (previousAppId) publishName(previousAppId);
    namePending.clear();
    const host = document.getElementById(HOST_ID);
    if (host) { api.dom.loading.clear(host); host.remove(); }
    document.querySelectorAll(".st-title-custom-name-wishlist").forEach(node => { api.dom.loading.clear(node); node.remove(); });
    document.querySelectorAll(".st-title-custom-name-wishlist-row").forEach(node => {
      node.classList.remove("st-title-custom-name-wishlist-row");
    });
    document.querySelectorAll(".st-title-custom-name-wishlist-title").forEach(node => {
      node.classList.remove("st-title-custom-name-wishlist-title");
    });
    editor?.close();
    lastDetailTargetMissing = false;
    lastWishlistTargetMissing = false;
    log.info("title-custom-name-stop-success", "商店标题自定义名已停止并清理资源", {
      path: location.pathname,
    });
  }

  api.features.titleCustomName = Object.freeze({
    prepareStyles: addStyle,
    start,
    refresh,
    stop,
    openEditor: openModal,
    shouldShowName,
    currentName,
    /** 订阅已选名称的真实变化，返回释放句柄；不向订阅者传递名称记录。 */
    subscribeNames(listener) {
      if (typeof listener !== 'function') throw new TypeError('名称订阅者必须是函数');
      nameListeners.add(listener);
      return { dispose: () => nameListeners.delete(listener) };
    },
  });
})(typeof globalThis !== "undefined" ? globalThis : window, titleNames => {
  "use strict";

  const { text, nameEqual, shouldShowName, splitAliasDraft, keepAliases } = titleNames;
  const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff]/;

  function officialByTitle(value) {
    return CJK_RE.test(String(value || ""));
  }


  return {
    text,
    shouldShowName,
    nameEqual,
    officialByTitle,
    splitAliasDraft,
    keepAliases,
  };
});
