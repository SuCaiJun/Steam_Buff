/*
 * @Author        : 顾青离
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

  const core = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = core;
    return;
  }

  const api = root.STStore;
  if (!api) return;

  const FEATURE_ID = "store-title-custom-name";
  const API_GET = root.STConfig.steamBuff("/get");
  const API_SUBMIT = root.STConfig.steamBuff("/submit");
  const ALIAS_QUERY = root.STConfig.steamBuff("/aliases/query");
  const ALIAS_SAVE = root.STConfig.steamBuff("/aliases");
  const NOTE_QUERY = root.STConfig.steamBuff("/wishlist-notes/query");
  const NOTE_SAVE = root.STConfig.steamBuff("/wishlist-notes");
  const AUTH_REFRESH = root.STConfig.loginAuth("/auth/refresh");
  const NOTE_MAX = 2000;
  const NAME_BATCH_SIZE = 80;
  const HOST_ID = "st-title-custom-name";
  const MODAL_ID = "st-title-custom-name-modal";
  const TOAST_ID = "st-title-custom-name-toast";
  const TITLE_SEL = ".apphub_AppName, .apphub_AppName_responsive, h1";
  const RETRY_MS = 300;
  const RETRY_MAX = 30;
  const DETAIL_SETTLE_MAX = 10;
  const DETAIL_OBSERVER_DEBOUNCE_MS = 1000;
  const WISHLIST_RENDER_DEBOUNCE_MS = 1000;
  const WISHLIST_OBSERVER_DEBOUNCE_MS = 1000;
  const WISHLIST_SETTLE_RETRY_MS = 300;
  const WISHLIST_SETTLE_MAX = 8;
  const WISHLIST_SORT_REFRESH_MS = 700;
  const WISHLIST_SORT_TEXT_RE = /排序|您的排序|名称|价格|折扣|添加日期|最畅销|发行日期|总体评价|sort|your sort|name|price|discount|date added|top sellers|release date|review score/i;

  const { text, shouldShowName } = core;
  const wishlistDom = api.wishlistDom;
  const dom = root.STDomUtils || {};
  let state = null;
  let observer = null;
  let wishlistObserver = null;
  let wishlistShellObserver = null;
  let wishlistContainer = null;
  let wishlistShell = null;
  let wishlistTimer = 0;
  let wishlistSettleTimer = 0;
  let wishlistSortTimer = 0;
  let wishlistSettleChecks = 0;
  let detailSettleTimer = 0;
  let detailSettleChecks = 0;
  let renderingWishlist = false;
  let pendingWishlistRender = false;
  let started = false;
  let tries = 0;
  let refreshSeq = 0;
  let modalSeq = 0;
  let lastDetailTargetMissing = false;
  let lastWishlistTargetMissing = false;
  let lastWishlistRenderKey = "";
  const nameCache = new Map();
  const namePending = new Set();

  /* 授权与接口请求 */
  function storage() {
    return root.STSettings?.storage || null;
  }

  const authClient = root.STAuthClient?.createClient({
    storage: storage(),
    refreshUrl: AUTH_REFRESH,
    loginMessage: "请先在设置中登录",
    expiredMessage: "登录已过期，请重新登录",
  });
  const log = root.STLoggerFactory.createLogger("store", "title-custom-name");

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

  function pageInfo() {
    const info = api.ctx?.pageInfo?.();
    if (!info || info.type !== "app") return null;
    const appid = Number(info.appId) || 0;
    return appid > 0 ? { appid } : null;
  }

  function isWishlistPath() {
    return /^\/wishlist(?:\/|$)/i.test(location.pathname);
  }

  function isWishlistSortTarget(target) {
    const button = target?.closest?.("button");
    if (!button || button.closest?.(`#${MODAL_ID}, .st-title-custom-name-wishlist, #st-settings-root`)) return false;
    const label = text(button.getAttribute("aria-label") || button.title || button.textContent || "");
    return WISHLIST_SORT_TEXT_RE.test(label);
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

  function steamName() {
    return text(state?.item?.steam_name) || state?.steamTitle || "";
  }

  function addStyle() {
    api.styles?.ensureFeatureStyle?.("store-title-custom-name");
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
    renderNameHost(host, state.appid, state.item, steamTitle, "detail");
    return true;
  }

  function renderNameHost(host, appid, item, steamTitle, mode) {
    const visibleName = shouldShowName(item, steamTitle) ? text(item?.name) : "";
    const label = visibleName ? `[${visibleName}]` : "";
    const idText = String(appid || "");
    const key = JSON.stringify([appid, text(item?.name), text(item?.name_source), steamTitle, mode]);
    const labelReady = (host.dataset.label || "") === label;
    const idReady = (host.dataset.stAppid || "") === idText;
    if (host._stTitleCustomNameKey === key && host.querySelector(".st-title-custom-name-btn") && labelReady && idReady) {
      return;
    }
    host._stTitleCustomNameKey = key;
    if (host.hasAttribute("data-appid")) host.removeAttribute("data-appid");
    if (!idReady) host.dataset.stAppid = idText;
    if (label) host.dataset.label = label;
    else delete host.dataset.label;
    const button = document.createElement("button");
    button.className = "st-title-custom-name-btn";
    button.type = "button";
    button.textContent = "编辑";
    host.replaceChildren(button);
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
      });
    });
  }

  function setTrustedTemplate(element, html, reason) {
    dom.setTrustedHTML(element, dom.trustedHTML(html, reason));
  }

  function setMsg(message) {
    const el = document.querySelector(`#${MODAL_ID} .st-title-custom-name-msg`);
    if (el) el.textContent = message || "";
  }

  function toast(message) {
    let el = document.getElementById(TOAST_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = TOAST_ID;
      document.body.appendChild(el);
    }
    el.textContent = message;
    clearTimeout(el._stTimer);
    el._stTimer = setTimeout(() => el.remove(), 3200);
  }

  async function modalNote(appid) {
    if (api.features.gameNotes?.getNote) {
      return api.features.gameNotes.getNote(appid);
    }
    const body = await authedPost(NOTE_QUERY, { appids: [appid] });
    return body?.data?.[0] || { note: "" };
  }

  function setTab(modal, tab) {
    modal.querySelectorAll("[data-title-custom-name-tab]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.titleCustomNameTab === tab);
    });
    modal.querySelectorAll("[data-title-custom-name-panel]").forEach(panel => {
      panel.hidden = panel.dataset.titleCustomNamePanel !== tab;
    });
    modal.dataset.activeTab = tab;
    setMsg("");
  }

  function updateCount(modal) {
    const textarea = modal.querySelector("[data-title-custom-name-note]");
    const count = modal.querySelector("[data-title-custom-name-count]");
    if (textarea && count) count.textContent = `剩余 ${Math.max(0, NOTE_MAX - textarea.value.length)} / ${NOTE_MAX}`;
  }

  function currentModalContext(modal) {
    const appid = Number(modal?.dataset.appid) || 0;
    return {
      appid,
      steamTitle: modal?.dataset.steamTitle || "",
      mode: modal?.dataset.mode || "detail",
    };
  }

  function modalLoadCurrent(modal, appid, loadSeq) {
    return !!modal
      && !modal.hidden
      && modal.dataset.loadSeq === loadSeq
      && Number(modal.dataset.appid) === Number(appid);
  }

  function baseFields(ctx, currentName, currentAlias = "") {
    return [
      { id: "appid", label: "APPID", type: "text", value: String(ctx.appid || ""), readonly: true },
      { id: "steamName", label: "Steam 原名", type: "text", value: ctx.steamTitle || "", readonly: true },
      { id: "customName", label: "自定义名称", type: "text", value: currentName || "", attr: "data-title-custom-name-input" },
      {
        id: "alias",
        label: "自定义别名",
        type: "text",
        value: currentAlias || "",
        attr: "data-title-custom-name-alias",
        desc: "别名功能只针对steam商店页面搜索生效，添加别名后，可在steam商店搜索框中使用别名查找该游戏。",
      },
      {
        id: "hideCustomName",
        label: "隐藏自定义名称",
        type: "switch",
        checked: false,
        attr: "data-title-custom-name-hide",
        disabled: true,
        desc: "功能预留，后续接入后可用",
      },
    ];
  }

  function baseFieldHtml(field) {
    const common = `${field.attr || ""} data-title-custom-name-field="${attr(field.id)}"`;
    if (field.type === "switch") {
      const disabled = field.disabled ? "disabled" : "";
      return `
        <label>
          <span class="st-title-custom-name-field">${esc(field.label)}</span>
          <span class="st-title-custom-name-control">
            <span class="st-title-custom-name-switch">
              <input type="checkbox" ${common} ${field.checked ? "checked" : ""} ${disabled} role="switch" aria-checked="${field.checked ? "true" : "false"}" aria-disabled="${field.disabled ? "true" : "false"}">
              <span aria-hidden="true"></span>
            </span>
            ${field.desc ? `<span class="st-title-custom-name-desc">${esc(field.desc)}</span>` : ""}
          </span>
        </label>
      `;
    }
    return `
      <label>
        <span class="st-title-custom-name-field">${esc(field.label)}</span>
        <span class="st-title-custom-name-control">
          <input type="text" value="${attr(field.value)}" ${field.readonly ? "disabled" : ""} ${field.placeholder ? `placeholder="${attr(field.placeholder)}"` : ""} ${common}>
          ${field.desc ? `<span class="st-title-custom-name-desc">${esc(field.desc)}</span>` : ""}
        </span>
      </label>
    `;
  }

  function modalTemplate(ctx, currentName, currentAlias = "") {
    return `
      <div class="st-title-custom-name-panel">
        <div class="st-title-custom-name-head">
          <h3>编辑游戏信息</h3>
          <div class="st-title-custom-name-tabs">
            <button type="button" class="active" data-title-custom-name-tab="base">基础</button>
            <button type="button" data-title-custom-name-tab="note">备注</button>
          </div>
          <button type="button" class="st-title-custom-name-close" data-title-custom-name-close title="关闭">×</button>
        </div>
        <div class="st-title-custom-name-body">
          <div class="st-title-custom-name-card" data-title-custom-name-panel="base">
            ${baseFields(ctx, currentName, currentAlias).map(baseFieldHtml).join("")}
          </div>
          <div class="st-title-custom-name-card" data-title-custom-name-panel="note" hidden>
            <label>
              <span class="st-title-custom-name-field">游戏备注</span>
              <span class="st-title-custom-name-control">
                <span class="st-title-custom-name-note-wrap">
                  <textarea maxlength="${NOTE_MAX}" data-title-custom-name-note placeholder="支持 BBCode，例如 [b]粗体[/b]、[url=https://example.com]链接[/url]"></textarea>
                  <span class="st-title-custom-name-note-meta">
                    <button type="button" class="st-title-custom-name-clear-note" data-title-custom-name-clear-note title="清空备注">清空</button>
                    <span class="st-title-custom-name-count" data-title-custom-name-count>剩余 ${NOTE_MAX} / ${NOTE_MAX}</span>
                  </span>
                </span>
              </span>
            </label>
          </div>
          <div class="st-title-custom-name-msg"></div>
        </div>
        <div class="st-title-custom-name-actions">
          <button type="button" data-title-custom-name-close>取消</button>
          <button type="button" class="primary" data-title-custom-name-save>保存</button>
        </div>
      </div>
    `;
  }

  function populateModalValues(modal, ctx, currentName, currentAlias = "") {
    const values = {
      appid: String(ctx.appid || ""),
      steamName: ctx.steamTitle || "",
      customName: currentName || "",
      alias: currentAlias || "",
    };
    Object.entries(values).forEach(([id, value]) => {
      const input = modal.querySelector(`[data-title-custom-name-field="${id}"]`);
      if (input) {
        input.value = String(value || "");
      }
    });
  }

  async function openModal(ctx = null) {
    const source = ctx || state;
    if (!source?.appid) return;
    const openSeq = ++modalSeq;
    addStyle();
    let item = source.item || nameCache.get(Number(source.appid)) || null;
    if (!item) {
      try {
        item = await loadName(source.appid);
        if (openSeq !== modalSeq) return;
        nameCache.set(Number(source.appid), item);
      } catch {
        if (openSeq !== modalSeq) return;
        item = null;
      }
    }
    let modal = document.getElementById(MODAL_ID);
    if (!modal) {
      modal = document.createElement("section");
      modal.id = MODAL_ID;
      modal.addEventListener("click", onModalClick);
      modal.addEventListener("input", onModalInput);
      document.body.appendChild(modal);
    }
    const steamTitle = text(item?.steam_name) || source.steamTitle || "";
    const current = item && item.name_source !== "steam" ? item.name : "";
    modal.dataset.appid = String(source.appid);
    modal.dataset.steamTitle = steamTitle;
    modal.dataset.mode = source.mode || "detail";
    modal.dataset.loadSeq = `${Date.now()}-${Math.random()}`;
    const loadSeq = modal.dataset.loadSeq;
    setTrustedTemplate(modal, modalTemplate({ ...source, steamTitle }, current, ""), "title-custom-name-modal-static-template");
    populateModalValues(modal, { ...source, steamTitle }, current, "");
    modal.hidden = false;
    setTab(modal, "base");
    modal.querySelector("[data-title-custom-name-input]")?.focus?.();
    log.info("title-custom-name-modal-open-success", "商店标题自定义名弹窗已打开", {
      appid: source.appid,
      mode: source.mode || "detail",
      hasCachedName: !!item?.name,
      path: location.pathname,
    });
    modalAlias(source.appid).then(item => {
      if (!modalLoadCurrent(modal, source.appid, loadSeq)) return;
      const input = modal.querySelector("[data-title-custom-name-alias]");
      if (!input || input.hasAttribute("data-title-custom-name-user-touched")) return;
      input.value = String(item?.alias || "");
    }).catch(error => {
      if (modalLoadCurrent(modal, source.appid, loadSeq)) setMsg(error?.message || String(error));
    });
    modalNote(source.appid).then(note => {
      if (!modalLoadCurrent(modal, source.appid, loadSeq)) return;
      const textarea = modal.querySelector("[data-title-custom-name-note]");
      if (!textarea || textarea.hasAttribute("data-title-custom-name-user-touched")) return;
      textarea.value = String(note?.note || "");
      updateCount(modal);
    }).catch(error => {
      if (modalLoadCurrent(modal, source.appid, loadSeq)) setMsg(error?.message || String(error));
    });
  }

  function closeModal() {
    modalSeq += 1;
    const modal = document.getElementById(MODAL_ID);
    if (modal) {
      modal.dataset.loadSeq = "";
      modal.hidden = true;
      log.info("title-custom-name-modal-close", "商店标题自定义名弹窗已关闭", {
        appid: Number(modal.dataset.appid) || 0,
        mode: modal.dataset.mode || "detail",
      });
    }
  }

  function onModalClick(event) {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    const tab = event.target.closest("[data-title-custom-name-tab]");
    if (tab) {
      log.info("title-custom-name-tab-change", "商店标题自定义名弹窗切换标签", {
        appid: Number(modal.dataset.appid) || 0,
        tab: tab.dataset.titleCustomNameTab || "base",
      });
      setTab(modal, tab.dataset.titleCustomNameTab || "base");
      return;
    }
    if (event.target.closest("[data-title-custom-name-close]")) {
      closeModal();
      return;
    }
    if (event.target.closest("[data-title-custom-name-clear-note]")) {
      const textarea = modal.querySelector("[data-title-custom-name-note]");
      if (textarea) {
        textarea.value = "";
        textarea.setAttribute("data-title-custom-name-user-touched", "1");
      }
      updateCount(modal);
      setMsg("保存后将清空备注");
      log.info("title-custom-name-note-clear-click", "用户点击清空商店标题备注", {
        appid: Number(modal.dataset.appid) || 0,
      });
      return;
    }
    if (event.target.closest("[data-title-custom-name-save]")) {
      if (modal.dataset.activeTab === "note") {
        saveNoteFromModal(false).catch(error => setMsg(error?.message || String(error)));
      } else {
        submitName().catch(error => setMsg(error?.message || String(error)));
      }
    }
  }

  function onModalInput(event) {
    if (event.target.matches?.("input, textarea")) {
      event.target.setAttribute("data-title-custom-name-user-touched", "1");
    }
    if (event.target.matches?.("[data-title-custom-name-note]")) {
      updateCount(document.getElementById(MODAL_ID));
    }
    if (event.target.matches?.("[data-title-custom-name-hide]")) {
      event.target.setAttribute("aria-checked", event.target.checked ? "true" : "false");
    }
  }

  async function saveNoteFromModal(clear) {
    const modal = document.getElementById(MODAL_ID);
    const ctx = currentModalContext(modal);
    if (!ctx.appid) return;
    const textarea = modal.querySelector("[data-title-custom-name-note]");
    const note = clear ? "" : String(textarea?.value || "").trim();
    if (note.length > NOTE_MAX) {
      setMsg(`备注不能超过 ${NOTE_MAX} 个字符`);
      return;
    }
    setMsg(clear ? "正在删除备注..." : "正在保存备注...");
    const startedAt = Date.now();
    try {
      if (api.features.gameNotes?.saveNote) {
        await api.features.gameNotes.saveNote(ctx.appid, ctx.steamTitle, note);
      } else {
        await authedPost(NOTE_SAVE, { appid: ctx.appid, steam_name: ctx.steamTitle, note });
      }
      if (textarea) textarea.value = note;
      updateCount(modal);
      setMsg(clear ? "备注已删除" : "备注已保存");
      toast(clear ? "备注已删除" : "备注已保存");
      log.info("title-custom-name-note-save-success", "游戏备注保存完成", {
        appid: ctx.appid,
        noteLength: note.length,
        durationMs: Date.now() - startedAt,
        status: clear ? "deleted" : "saved",
      });
    } catch (error) {
      log.error("title-custom-name-note-save-failed", "游戏备注保存失败", {
        appid: ctx.appid,
        noteLength: note.length,
        durationMs: Date.now() - startedAt,
        error,
      });
      throw error;
    }
  }

  async function modalAlias(appid) {
    const body = await authedPost(ALIAS_QUERY, { appid });
    return body?.data || { alias: "" };
  }

  async function saveAliasFromModal(ctx, alias) {
    const startedAt = Date.now();
    if (alias) {
      await authedPost(ALIAS_SAVE, {
        appid: ctx.appid,
        steam_name: ctx.steamTitle,
        alias,
      });
    } else {
      await authedDelete(ALIAS_SAVE, { appid: ctx.appid });
    }
    log.info("title-custom-name-alias-save-success", "游戏别名保存完成", {
      appid: ctx.appid,
      aliasLength: alias.length,
      durationMs: Date.now() - startedAt,
      status: alias ? "saved" : "deleted",
    });
  }

  async function submitName() {
    const modal = document.getElementById(MODAL_ID);
    const ctx = currentModalContext(modal);
    const input = modal?.querySelector("[data-title-custom-name-input]");
    const aliasInput = modal?.querySelector("[data-title-custom-name-alias]");
    const custom = String(input?.value || "").trim();
    const alias = String(aliasInput?.value || "").trim();
    setMsg("正在保存基础信息...");
    const startedAt = Date.now();
    log.info("title-custom-name-submit-start", "开始提交商店标题中文名", {
      appid: ctx.appid,
      customNameLength: custom.length,
      steamNameLength: ctx.steamTitle.length,
    });
    try {
      let item = null;
      if (custom) {
        await authedPost(API_SUBMIT, {
          type: "Game",
          appid: ctx.appid,
          steam_name: ctx.steamTitle,
          custom_name: custom,
        });
        item = {
          ...(nameCache.get(ctx.appid) || {}),
          appid: ctx.appid,
          name: custom,
          steam_name: ctx.steamTitle,
          name_source: "user_custom",
        };
        nameCache.set(ctx.appid, item);
      }
      await saveAliasFromModal(ctx, alias);
      if (item && state?.appid === ctx.appid) {
        state.item = item;
        renderTitle();
      }
      renderWishlistName(ctx.appid);
      setMsg("基础信息已保存");
      toast("基础信息已保存");
      log.info("title-custom-name-submit-success", "商店标题中文名提交完成", {
        appid: ctx.appid,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      log.error("title-custom-name-submit-failed", "商店标题中文名提交失败", {
        appid: ctx.appid,
        durationMs: Date.now() - startedAt,
        error,
      });
      throw error;
    }
  }

  async function loadName(appid) {
    const startedAt = Date.now();
    log.info("title-custom-name-load-start", "开始读取商店标题中文名", { appid });
    try {
      const body = await authedPost(API_GET, { appid });
      const data = body?.data || null;
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

  async function batchFetchWishlistNames(appids) {
    const ids = Array.from(new Set((appids || [])
      .map(Number)
      .filter(id => id > 0 && !nameCache.has(id) && !namePending.has(id))));
    if (!ids.length) return;
    ids.forEach(id => namePending.add(id));
    for (const part of chunk(ids, NAME_BATCH_SIZE)) {
      const startedAt = Date.now();
      try {
        const body = await authedPost(API_GET, { appids: part });
        const found = new Set();
        for (const item of body?.data || []) {
          const appid = Number(item.appid) || 0;
          if (!appid) continue;
          found.add(appid);
          nameCache.set(appid, item);
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
        part.forEach(id => namePending.delete(id));
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

  function wishlistHostReady(row) {
    const appid = rowAppid(row);
    if (!appid) return true;
    const parent = wishlistTitleHost(row);
    const host = row.querySelector(".st-title-custom-name-wishlist");
    return !!host && host.parentElement === parent && host.dataset.stAppid === String(appid);
  }

  function wishlistRowsReady() {
    const rows = wishlistRows().filter(row => rowAppid(row));
    return rows.length > 0 && rows.every(wishlistHostReady);
  }

  function renderWishlistName(appid) {
    wishlistRows().forEach(row => {
      if (rowAppid(row) !== Number(appid)) return;
      const host = ensureWishlistHost(row);
      if (!host) return;
      renderNameHost(host, appid, nameCache.get(Number(appid)) || null, steamTitleFromRow(row), "wishlist");
    });
  }

  async function renderWishlistRows() {
    if (!isWishlistPath()) return false;
    if (renderingWishlist) {
      pendingWishlistRender = true;
      return false;
    }
    renderingWishlist = true;
    pendingWishlistRender = false;
    const seq = refreshSeq;
    try {
      addStyle();
      const rows = wishlistRows();
      const appids = [];
      for (const row of rows) {
        const appid = rowAppid(row);
        if (!appid) continue;
        appids.push(appid);
        const host = ensureWishlistHost(row);
        if (!host) continue;
        renderNameHost(host, appid, nameCache.get(appid) || null, steamTitleFromRow(row), "wishlist");
      }
      await batchFetchWishlistNames(appids);
      if (seq !== refreshSeq || !started || !api.settings?.on?.(FEATURE_ID)) return false;
      appids.forEach(renderWishlistName);
      const summaryKey = `${rows.length}:${appids.length}`;
      if (summaryKey !== lastWishlistRenderKey) {
        lastWishlistRenderKey = summaryKey;
        log.info("title-custom-name-wishlist-render-summary", "愿望单自定义名称渲染摘要", {
          rowCount: rows.length,
          appidCount: appids.length,
          path: location.pathname,
        });
      }
      return true;
    } finally {
      renderingWishlist = false;
      if (pendingWishlistRender && started && api.settings?.on?.(FEATURE_ID)) {
        pendingWishlistRender = false;
        scheduleWishlistRender();
      }
    }
  }

  function scheduleWishlistRender(delay = WISHLIST_RENDER_DEBOUNCE_MS) {
    clearTimeout(wishlistTimer);
    const waitMs = Math.max(0, Number(delay) || 0);
    wishlistTimer = setTimeout(() => {
      renderWishlistRows().catch(() => {});
    }, waitMs);
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
      if (!started || !isWishlistPath() || !api.settings?.on?.(FEATURE_ID)) return;
      const container = wishlistDom?.listContainer?.();
      if (container && container !== wishlistContainer) {
        bindWishlistObserver(container);
      }
      if (wishlistRowsReady()) return;
      wishlistSettleChecks += 1;
      renderWishlistRows().catch(() => {});
      scheduleWishlistSettleCheck();
    }, WISHLIST_SETTLE_RETRY_MS);
  }

  function scheduleWishlistSortRefresh() {
    clearTimeout(wishlistSortTimer);
    wishlistSortTimer = setTimeout(() => {
      wishlistSortTimer = 0;
      if (!started || !isWishlistPath() || !api.settings?.on?.(FEATURE_ID)) return;
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
    const container = wishlistDom?.listContainer?.();
    if (!container) {
      log.warn("title-custom-name-wishlist-observer-target-missing", "愿望单自定义名称监听目标未找到", {
        path: location.pathname,
      });
      return false;
    }
    renderWishlistRows().catch(() => {});
    bindWishlistObserver(container);
    document.addEventListener("click", onWishlistSortClick, true);
    scheduleWishlistSettleCheck();
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
        refresh().catch(() => {});
        return;
      }
      scheduleDetailSettleCheck(seq);
    }, RETRY_MS);
  }

  async function refresh() {
    const seq = ++refreshSeq;
    const info = pageInfo();
    const title = titleEl();
    if (!info || !title) {
      startWishlist();
      if (info && tries < RETRY_MAX) {
        tries += 1;
        setTimeout(() => {
          if (seq === refreshSeq) refresh().catch(() => {});
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
    };
    renderTitle();
    scheduleDetailSettleCheck(seq);
    try {
      const item = await loadName(info.appid);
      if (seq !== refreshSeq || state?.appid !== info.appid) return;
      state.item = item;
      nameCache.set(info.appid, item);
    } catch {
      if (seq !== refreshSeq || state?.appid !== info.appid) return;
      state.item = null;
    }
    renderTitle();
    scheduleDetailSettleCheck(seq);
  }

  function observeTarget() {
    return document.getElementById("game_highlights")
      || document.querySelector(".apphub_AppName")?.parentElement
      || null;
  }

  function observe() {
    if (observer) return;
    const target = observeTarget();
    if (!target) {
      log.warn("title-custom-name-observer-target-missing", "商店标题自定义名监听目标未找到", {
        selector: "responsive_page_template_content | game_highlights | app title parent",
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
      const info = pageInfo();
      if (info && (!state || state.appid !== info.appid || !detailMountedOnCurrentTitle())) {
        refresh().catch(() => {});
      }
    };
    observer = root.STObserverUtils?.createDebouncedObserver?.(callback, DETAIL_OBSERVER_DEBOUNCE_MS)
      || new MutationObserver(callback);
    // 只监听商店主内容容器；Steam 内部跳转会深层替换标题节点，保留 subtree。
    root.STObserverUtils?.createVisibilityGatedObserver?.(observer, target, { childList: true, subtree: true })
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
      observe();
      refresh().catch(() => {});
      startWishlist();
      log.info("title-custom-name-start-skipped", "商店标题自定义名已启动，本次只触发刷新", {
        reason: "already-started",
        path: location.pathname,
      });
      return true;
    }
    started = true;
    observe();
    refresh().catch(() => {});
    startWishlist();
    log.info("title-custom-name-start-success", "商店标题自定义名已启动", {
      path: location.pathname,
      durationMs: Date.now() - startedAt,
    });
    return true;
  }

  function stop() {
    refreshSeq += 1;
    started = false;
    tries = 0;
    observer?.disconnect();
    wishlistObserver?.disconnect();
    wishlistShellObserver?.disconnect();
    observer = null;
    wishlistObserver = null;
    wishlistShellObserver = null;
    wishlistContainer = null;
    wishlistShell = null;
    clearTimeout(detailSettleTimer);
    clearTimeout(wishlistTimer);
    clearTimeout(wishlistSettleTimer);
    clearTimeout(wishlistSortTimer);
    document.removeEventListener("click", onWishlistSortClick, true);
    detailSettleTimer = 0;
    wishlistTimer = 0;
    wishlistSettleTimer = 0;
    wishlistSortTimer = 0;
    detailSettleChecks = 0;
    wishlistSettleChecks = 0;
    state = null;
    document.getElementById(HOST_ID)?.remove();
    document.querySelectorAll(".st-title-custom-name-wishlist").forEach(node => node.remove());
    document.querySelectorAll(".st-title-custom-name-wishlist-row").forEach(node => {
      node.classList.remove("st-title-custom-name-wishlist-row");
    });
    document.querySelectorAll(".st-title-custom-name-wishlist-title").forEach(node => {
      node.classList.remove("st-title-custom-name-wishlist-title");
    });
    document.getElementById(TOAST_ID)?.remove();
    closeModal();
    lastDetailTargetMissing = false;
    lastWishlistTargetMissing = false;
    lastWishlistRenderKey = "";
    log.info("title-custom-name-stop-success", "商店标题自定义名已停止并清理资源", {
      path: location.pathname,
    });
  }

  api.features.titleCustomName = Object.freeze({
    start,
    refresh,
    stop,
    shouldShowName,
  });
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  "use strict";

  const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff]/;

  function text(value) {
    return String(value?.textContent ?? value ?? "").replace(/\s+/g, " ").trim();
  }

  function officialByTitle(value) {
    return CJK_RE.test(String(value || ""));
  }

  function nameEqual(a, b) {
    return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  }

  function shouldShowName(item, steamTitle) {
    if (!item || item.name_source === "steam") return false;
    const name = text(item.name);
    if (!name || nameEqual(name, steamTitle)) return false;
    const official = item.has_official_cn === true || text(item.official_cn_name) !== "" || officialByTitle(steamTitle);
    const userCustom = item.name_source === "user_custom";
    if (official && !userCustom) return false;
    return true;
  }

  return {
    text,
    shouldShowName,
  };
});
