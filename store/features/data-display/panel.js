/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店详情统一占位与提醒卡片容器
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";
  const api = window.STStore;
  const ID = "st-store-detail-panel";
  const kinds = Object.freeze([
    api.dom.MODULE_CLASSES.AUDIO_CHECK, api.dom.MODULE_CLASSES.WORKSHOP_CHECK,
    api.dom.MODULE_CLASSES.DRM_WARNING, api.dom.MODULE_CLASSES.SUBSCRIPTION,
    api.dom.MODULE_CLASSES.FAMILY_SHARING, api.dom.MODULE_CLASSES.FAMILY_LIBRARY_OWNED,
  ]);
  let active = null;
  const t = (key, fallback) => globalThis.STI18n.text(key, fallback);
  function node(tag, className, text = "") {
    const element = document.createElement(tag);
    element.className = className;
    if (text) element.textContent = text;
    return element;
  }
  function brand() {
    const wrap = node("div", "st-detail-brand");
    wrap.append(api.assets.createBrandMark(), node("div", "st-detail-slogan", "ENHANCE · TRACK · SAVE"));
    return wrap;
  }
  function noticeHost(state, kind) {
    if (state.root.dataset.mode !== "compact") return state.notices;
    if (kind === api.dom.MODULE_CLASSES.DRM_WARNING) return state.warning;
    if (kind === api.dom.MODULE_CLASSES.FAMILY_LIBRARY_OWNED) return state.footer;
    return state.notices;
  }
  /** 底栏只收纳家庭库原节点和 AI 按钮，两者按自身可用状态显示 */
  function syncFooter(state) {
    state.ai.hidden = !state.onAi;
    state.footer.hidden = state.root.dataset.mode !== "compact" || (!state.onAi && state.footer.childElementCount === 1);
  }
  function syncData(state) {
    const visible = state.root.dataset.mode === "compact" && !!state.owner;
    state.price.hidden = !visible;
    state.right.hidden = !visible;
  }
  function reveal(state) {
    if (state !== active) return;
    const pending = state.jobs.size || state.root.querySelector('[data-st-detail-loading="1"]');
    if (!state.revealed && !pending) {
      state.revealed = true;
      api.dom.loading.clear(state.loader);
      state.loader.hidden = true;
      state.content.hidden = false;
    }
  }
  function compactNotice(card, kind) {
    if (card.querySelector('[data-st-detail-loading="1"]') || card.dataset.stDetailLoading) return;
    let label = "";
    if (kind === api.dom.MODULE_CLASSES.AUDIO_CHECK) {
      if (card.classList.contains("supported")) label = t("store.detail.audioYes", "有简中配音");
      if (card.classList.contains("not-supported")) label = t("store.detail.audioNo", "无简中配音");
    } else if (kind === api.dom.MODULE_CLASSES.WORKSHOP_CHECK) {
      if (card.classList.contains("supported")) label = t("store.detail.workshopYes", "支持创意工坊");
      if (card.classList.contains("not-supported")) label = t("store.detail.workshopNo", "不支持创意工坊");
    } else if (kind === api.dom.MODULE_CLASSES.FAMILY_SHARING) {
      label = t("store.detail.sharingNo", "不支持家庭共享");
    }
    card.classList.toggle("st-detail-short-ready", !!label);
    if (!label) return;
    let short = card.querySelector(".st-detail-short-notice");
    if (!short) { short = node("span", "st-detail-short-notice"); card.appendChild(short); }
    if (short.textContent !== label) short.textContent = label;
  }
  /** 仅合并自有卡片的离散完成通知，不观察 DOM，也不调用功能注册器 */
  function changed() {
    const state = active;
    if (!state || state.queued) return;
    state.queued = true;
    queueMicrotask(() => {
      state.queued = false;
      if (state !== active) return;
      for (const card of state.notices.children) compactNotice(card, kinds.find(kind => card.classList.contains(kind)));
      state.warning.hidden = !state.warning.childElementCount;
      syncFooter(state);
      reveal(state);
    });
  }
  function setMode(compact, pending = false) {
    const state = active;
    if (!state) return;
    state.compact = compact;
    const summaryVisible = compact || pending;
    state.root.dataset.mode = summaryVisible ? "compact" : "full";
    syncData(state);
    state.data.hidden = summaryVisible;
    state.expand.textContent = compact
      ? t("store.detail.expand", "展开详情 ↓")
      : pending ? t("store.detail.detailsLoading", "正在加载详情 · 收起 ↑") : t("store.detail.collapse", "收起详情 ↑");
    state.expand.setAttribute("aria-expanded", String(!summaryVisible));
    state.expand.setAttribute("aria-busy", String(pending));
    if (pending) { const select = state.selector.querySelector("select"); if (select) select.disabled = true; }
    for (const kind of kinds) {
      const card = state.root.querySelector("." + kind);
      if (!card) continue;
      const host = noticeHost(state, kind);
      host.insertBefore(card, host === state.footer ? state.ai : null);
    }
    state.warning.hidden = !state.warning.childElementCount;
    syncFooter(state);
  }
  /** 将现有提醒节点原样交给统一容器；事件、链接和各功能已有 DOM 协议保持不变 */
  function insertNotice(element, kind) {
    const state = active;
    if (!state || !kinds.includes(kind)) return false;
    const host = noticeHost(state, kind);
    const rank = kinds.indexOf(kind);
    const next = host === state.footer ? state.ai
      : Array.from(host.children).find(child => kinds.findIndex(name => child.classList.contains(name)) > rank);
    host.insertBefore(element, next || null);
    state.warning.hidden = !state.warning.childElementCount;
    changed();
    return true;
  }
  function prepareStyles() {
    api.styles.ensureFeatureStyle("store-detail-panel");
  }
  /** 页面实例拥有整个面板；只收纳已确认购买区的直接提醒兄弟，不扫描整页 */
  function start(info = api.ctx.pageInfo()) {
    stop();
    const anchor = api.features.dataDisplay.mountState().target;
    if (!anchor?.parentNode) return false;
    prepareStyles();
    const root = node("section", "st-store-detail-panel notranslate");
    root.id = ID;
    root.setAttribute("translate", "no");
    root.dataset.entityId = String(info.appId || info.id || "");
    const loader = node("div", "st-detail-loader-host");
    const skeleton = api.dom.loading.create("brand");
    skeleton.classList.add("st-detail-loader");
    skeleton.replaceChildren(
      brand(),
      node("div", "st-detail-loader__hint", t("store.detail.loading", "正在整理游戏信息…")),
      node("div", "st-detail-loader__sweep"),
    );
    loader.appendChild(skeleton);
    const content = node("div", "st-detail-content");
    content.hidden = true;
    const header = node("div", "st-detail-header");
    const actions = node("div", "st-detail-actions");
    const selector = node("div", "st-detail-product");
    selector.hidden = true;
    const expand = node("button", "st-detail-toggle");
    expand.type = "button";
    expand.setAttribute("aria-controls", "st-detail-data");
    actions.append(selector, expand);
    header.append(brand(), actions);
    const warning = node("div", "st-detail-warning");
    const summary = node("div", "st-detail-summary");
    const left = node("div", "st-detail-left");
    const price = node("div", "st-detail-price");
    const notices = node("div", "st-detail-notices");
    const right = node("div", "st-detail-right");
    left.append(price, notices);
    summary.append(left, right);
    const data = node("div", "st-detail-data");
    data.id = "st-detail-data";
    const footer = node("div", "st-detail-footer");
    const ai = node("button", "st-detail-ai-entry", t("store.detail.ai", "AI对话"));
    ai.type = "button";
    ai.disabled = true;
    footer.appendChild(ai);
    content.append(header, warning, summary, data, footer);
    root.append(loader, content);
    const cards = Array.from(anchor.parentNode.children).filter(child => kinds.some(kind => child.classList.contains(kind)));
    anchor.parentNode.insertBefore(root, anchor);
    const state = {
      root, anchor, loader, content, notices, warning, price, right, data, footer, selector, expand, ai,
      jobs: new Set(["startup"]), revealed: false, queued: false, owner: null, onMode: null, onAi: null,
      compact: api.settings.on("store-detail-compact"),
    };
    active = state;
    for (const card of cards) insertNotice(card, kinds.find(kind => card.classList.contains(kind)));
    expand.addEventListener("click", () => {
      setMode(!state.compact);
      state.onMode?.(state.compact);
    });
    ai.addEventListener("click", () => state.onAi?.(ai));
    setMode(state.compact);
    api.dom.loading.activate(loader);
    queueMicrotask(() => { state.jobs.delete("startup"); changed(); });
    return true;
  }
  function restoreChildren(state, anchor) {
    if (!anchor?.isConnected || !anchor.parentNode) return;
    for (const host of [state.warning, state.notices, state.footer, state.data]) {
      for (const child of Array.from(host.children)) {
        if (child === state.ai) continue;
        if (host !== state.data) {
          child.querySelector(".st-detail-short-notice")?.remove();
          child.classList.remove("st-detail-short-ready");
        }
        anchor.parentNode.insertBefore(child, anchor);
      }
    }
  }
  /** 停用容器时归还业务节点。旧购买区已经不在文档中时改挂到当前购买区，避免提醒节点随面板一起被移除 */
  function stop() {
    const state = active;
    if (!state) return true;
    active = null;
    state.onDispose?.();
    const anchor = state.anchor?.isConnected
      ? state.anchor
      : api.features.dataDisplay.mountState().target;
    restoreChildren(state, anchor);
    api.dom.loading.clear(state.loader);
    state.root.remove();
    api.styles.removeFeatureStyle("store-detail-panel");
    return true;
  }
  api.features.dataDisplayPanel = Object.freeze({
    prepareStyles, start, stop, insertNotice, changed, setMode,
    mountState() { return { target: api.features.dataDisplay.mountState().target, host: active?.root || null }; },
    /** 返回当前面板的固定插槽；无活动页面时返回 null，不创建备用容器 */
    current() { return active; },
    loading(owner, pending) {
      if (!active) return;
      if (pending) active.jobs.add(owner);
      else active.jobs.delete(owner);
      changed();
    },
    bind({ owner, onMode, onAi, onDispose }) {
      if (!active) return;
      Object.assign(active, { owner, onMode, onAi, onDispose });
      active.ai.disabled = !onAi;
      syncData(active);
      syncFooter(active);
    },
    /** 只释放匹配 owner 的数据插槽，保留其他功能的提醒节点 */
    unbind(owner) {
      if (!active || active.owner !== owner) return;
      Object.assign(active, { owner: null, onMode: null, onAi: null, onDispose: null });
      for (const slot of [active.price, active.right, active.selector]) slot.replaceChildren();
      active.selector.hidden = true;
      delete active.root.dataset.detailsLoading;
      setMode(active.compact);
      active.ai.disabled = true;
    },
  });
})();
