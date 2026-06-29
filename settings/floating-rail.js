/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置中心轻量悬浮入口
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const VERSION = "steam-buff-floating-rail-v2";
  if (root.STSettingsFloatingRail?.version === VERSION) {
    root.STSettingsFloatingRail.mount?.();
    return;
  }

  const ROOT_ID = "st-settings-root";
  const RAIL_MARK = "steamBuffSettingsRail";
  const PANEL_MARK = "steamBuffSettingsUi";
  const OPEN_REQUEST_EVT = "STSettingsOpenRequest";
  const REVIEW_UPDATE_EVT = "STReviewFilterUpdate";
  const RAIL_TOP_KEY = "st.settings.rail.top";
  const RAIL_SIDE_KEY = "st.settings.rail.side";
  const RAIL_MIN_TOP = 24;
  const RAIL_MARGIN = 24;
  const DRAG_THRESHOLD = 10;
  const TOP_SHOW_Y = 1500;
  const OWNER = "settings:floating-rail";

  const runtime = root.STRuntime?.get?.({ id: "steam-buff-page-runtime" });
  const log = root.STLoggerFactory?.createLogger?.("settings", "floating-rail");

  let host = null;
  let shadow = null;
  let rail = null;
  let settingsBtn = null;
  let topBtn = null;
  let reviewBtn = null;
  let reviewCount = null;
  let railTop = null;
  let railSide = "right";
  let mounted = false;
  let topFrameRaf = 0;
  let latestReview = { count: 0, items: [] };
  let disposers = [];

  function topFrame() {
    try {
      return root.top === root;
    } catch {
      return false;
    }
  }

  function targetPage() {
    return root.STPageContext?.settingsPage?.() === "settings-web";
  }

  function ready(fn) {
    if (root.document?.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
      return;
    }
    fn();
  }

  function runtimeUrl(path) {
    try {
      return root.chrome?.runtime?.getURL?.(path) || "";
    } catch {
      return "";
    }
  }

  function iconUrl() {
    return root.STSettingsAssets?.settingsIcon?.() || runtimeUrl("images/Settings.svg");
  }

  function topUrl() {
    return root.STSettingsAssets?.topIcon?.() || runtimeUrl("images/TOP.svg");
  }

  function commentFilterUrl() {
    return root.STSettingsAssets?.commentFilterIcon?.() || runtimeUrl("images/commentFilter.svg");
  }

  function tr(key, fallback, params) {
    return root.STI18n?.text?.(key, fallback, params) || String(fallback ?? key ?? "");
  }

  function addDisposer(dispose) {
    if (typeof dispose === "function") {
      disposers.push(dispose);
    }
  }

  function listen(target, type, handler, options) {
    if (!target?.addEventListener || typeof handler !== "function") {
      return;
    }
    target.addEventListener(type, handler, options);
    addDisposer(() => target.removeEventListener(type, handler, options));
  }

  function clampRailTop(value) {
    const height = rail?.offsetHeight || 54;
    const max = Math.max(RAIL_MIN_TOP, root.innerHeight - height - RAIL_MARGIN);
    const top = Number(value);
    if (!Number.isFinite(top)) {
      return Math.round((root.innerHeight - height) / 2);
    }
    return Math.min(Math.max(top, RAIL_MIN_TOP), max);
  }

  function applyRailPos(value, side, save) {
    if (!rail) {
      return;
    }
    railTop = clampRailTop(value);
    railSide = side === "left" ? "left" : "right";
    rail.style.top = `${railTop}px`;
    rail.style.left = "auto";
    rail.style.right = "auto";
    rail.classList.toggle("left", railSide === "left");
    rail.classList.toggle("right", railSide !== "left");
    rail.style[railSide] = "0";
    if (save) {
      saveRailPos({ top: railTop, side: railSide });
    }
  }

  function moveRail(x, y) {
    if (!rail) {
      return;
    }
    const width = rail.offsetWidth || 42;
    const left = Math.min(Math.max(x, 0), Math.max(0, root.innerWidth - width));
    railTop = clampRailTop(y);
    rail.style.left = `${left}px`;
    rail.style.right = "auto";
    rail.style.top = `${railTop}px`;
  }

  function snapRail(x, y, save) {
    if (!rail) {
      return;
    }
    const width = rail.offsetWidth || 42;
    const side = x + width / 2 < root.innerWidth / 2 ? "left" : "right";
    applyRailPos(y, side, save);
  }

  function fixedScrollTargets() {
    return [
      document.scrollingElement,
      document.documentElement,
      document.body,
      document.querySelector("#responsive_page_template_content"),
      document.querySelector(".responsive_page_frame"),
      document.querySelector(".DialogContent"),
      document.querySelector(".ModalPosition_Content"),
      document.querySelector("[class*='scroll'][class*='Scroll']"),
    ].filter(Boolean);
  }

  function scrollTargets() {
    const fixed = fixedScrollTargets();
    const active = Array.from(document.querySelectorAll("*")).filter((el) => el.scrollTop > 0);
    return Array.from(new Set([...fixed, ...active]));
  }

  function scrollY() {
    const top = root.scrollY || document.documentElement.scrollTop || document.body?.scrollTop || 0;
    if (top > 0) {
      return top;
    }
    for (const el of fixedScrollTargets()) {
      if (el.scrollTop > 0) {
        return el.scrollTop;
      }
    }
    return 0;
  }

  function toTop() {
    const targets = scrollTargets();
    try {
      root.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      root.scrollTo(0, 0);
    }

    for (const el of targets) {
      if (!el.scrollTop) {
        continue;
      }
      try {
        el.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        el.scrollTop = 0;
      }
    }
    log?.info?.("floating-rail-top-action", "轻量悬浮栏触发回到顶部", {
      targetCount: targets.length,
      railSide,
    });
  }

  function updateTopButton() {
    if (!topBtn) {
      return;
    }
    const hide = scrollY() < TOP_SHOW_Y;
    if (topBtn.hidden !== hide) {
      topBtn.hidden = hide;
      root.requestAnimationFrame?.(() => applyRailPos(railTop, railSide, false));
    }
  }

  function scheduleTopButton() {
    if (topFrameRaf) {
      return;
    }
    topFrameRaf = root.requestAnimationFrame?.(() => {
      topFrameRaf = 0;
      updateTopButton();
    }) || 0;
  }

  function reviewCountBadge(count) {
    const num = Math.max(0, Math.floor(Number(count) || 0));
    return num > 99 ? "99+" : String(num);
  }

  function updateReviewButton(detail = latestReview) {
    const count = Math.max(0, Number(detail?.count ?? detail?.items?.length) || 0);
    latestReview = {
      count,
      items: Array.isArray(detail?.items) ? detail.items : [],
    };
    if (!reviewBtn) {
      return;
    }
    const title = count ? `查看已过滤评论（${count}）` : tr("settings.shell.filteredReviewsButton", "查看已过滤评论");
    reviewBtn.hidden = count === 0;
    reviewBtn.title = title;
    reviewBtn.setAttribute("aria-label", title);
    if (reviewCount) {
      reviewCount.textContent = reviewCountBadge(count);
      reviewCount.hidden = count === 0;
    }
  }

  function syncReviewFilterState() {
    const items = root.STStore?.features?.reviewFilter?.hidden?.();
    if (!Array.isArray(items)) {
      return;
    }
    updateReviewButton({
      count: items.length,
      items,
    });
  }

  function requestOpen(options = {}) {
    const el = document.documentElement;
    if (options.category) {
      el.dataset.steamBuffOpenCat = String(options.category);
    }
    log?.info?.(options.filteredReviews === true ? "floating-rail-filtered-reviews-open" : "floating-rail-open-request", "轻量悬浮栏请求打开设置中心", {
      category: String(options.category || ""),
      filteredReviews: options.filteredReviews === true,
      panelMounted: document.documentElement?.dataset?.[PANEL_MARK] === "1",
    });
    el.dispatchEvent(new CustomEvent(OPEN_REQUEST_EVT, {
      bubbles: true,
      detail: {
        category: options.category || "",
        filteredReviews: options.filteredReviews === true,
      },
    }));
  }

  async function loadRailPos() {
    try {
      const rt = await root.STSettingsBus?.rawGet?.([RAIL_TOP_KEY, RAIL_SIDE_KEY], {
        owner: OWNER,
        reason: "floating-rail-position-read",
      });
      const top = Number(rt?.[RAIL_TOP_KEY]);
      railTop = Number.isFinite(top) ? top : null;
      railSide = rt?.[RAIL_SIDE_KEY] === "left" ? "left" : "right";
    } catch (error) {
      log?.warn?.("floating-rail-position-read-failed", "轻量悬浮栏位置读取失败", {
        error: error?.message || String(error),
      });
      railTop = null;
      railSide = "right";
    }
  }

  function saveRailPos(pos) {
    const top = Number(pos?.top);
    if (!Number.isFinite(top)) {
      return;
    }
    root.STSettingsBus?.rawSet?.({
      [RAIL_TOP_KEY]: top,
      [RAIL_SIDE_KEY]: pos?.side === "left" ? "left" : "right",
    }, {
      owner: OWNER,
      reason: "floating-rail-position-write",
    })?.catch?.((error) => {
      log?.warn?.("floating-rail-position-write-failed", "轻量悬浮栏位置保存失败", {
        error: error?.message || String(error),
      });
    });
  }

  function button(className, title, src) {
    const node = document.createElement("button");
    node.className = className;
    node.type = "button";
    node.title = title;
    node.setAttribute("aria-label", title);
    const content = document.createElement("span");
    content.className = "content";
    const img = document.createElement("img");
    img.alt = "";
    img.src = src;
    content.appendChild(img);
    node.appendChild(content);
    return node;
  }

  function render() {
    host = document.getElementById(ROOT_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = ROOT_ID;
    }
    shadow = host.shadowRoot || host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = root.STSettingsStyles?.css?.() || "";

    rail = document.createElement("div");
    rail.className = "rail";

    settingsBtn = button("round", tr("settings.shell.settingsButton", "设置"), iconUrl());
    settingsBtn.setAttribute("aria-expanded", "false");
    const reviewTitle = tr("settings.shell.filteredReviewsButton", "查看已过滤评论");
    reviewBtn = button("comment-filter", reviewTitle, commentFilterUrl());
    reviewBtn.hidden = true;
    reviewCount = document.createElement("span");
    reviewCount.className = "comment-filter-count";
    reviewCount.hidden = true;
    reviewCount.textContent = "0";
    reviewBtn.appendChild(reviewCount);
    topBtn = button("top", tr("settings.shell.topButton", "回到顶部"), topUrl());
    topBtn.hidden = true;

    for (const node of [settingsBtn, reviewBtn, topBtn]) {
      const item = document.createElement("div");
      item.className = "item";
      item.appendChild(node);
      rail.appendChild(item);
    }

    shadow.replaceChildren(style, rail);
    if (!host.isConnected) {
      document.body.appendChild(host);
    }
    host.dataset[RAIL_MARK] = "1";
  }

  function bindDrag() {
    const drag = {
      active: false,
      moved: false,
      startY: 0,
      startX: 0,
      startTop: 0,
      startLeft: 0,
      pointerId: 0,
      target: "",
      handledClick: false,
    };

    const endDrag = (event, save) => {
      if (!rail || !drag.active || event.pointerId !== drag.pointerId) {
        return;
      }
      drag.active = false;
      try {
        rail.releasePointerCapture(event.pointerId);
      } catch {
      }
      rail.classList.remove("dragging");
      if (save && drag.moved) {
        snapRail(rail.offsetLeft, railTop, true);
        root.setTimeout(() => {
          drag.moved = false;
        }, 80);
      } else if (save && drag.target) {
        drag.handledClick = true;
        if (drag.target === "settings") {
          requestOpen();
        } else if (drag.target === "review-filter") {
          requestOpen({ category: "review-filter", filteredReviews: true });
        } else if (drag.target === "top") {
          toTop();
        }
        root.setTimeout(() => {
          drag.handledClick = false;
        }, 80);
      }
      drag.target = "";
    };

    listen(rail, "pointerdown", (event) => {
      if (event.button !== 0 && event.pointerType === "mouse") {
        return;
      }
      drag.active = true;
      drag.moved = false;
      drag.startX = event.clientX;
      drag.startY = event.clientY;
      drag.startTop = railTop ?? rail.offsetTop;
      drag.startLeft = rail.getBoundingClientRect().left;
      drag.pointerId = event.pointerId;
      drag.target = event.target.closest(".round")
        ? "settings"
        : event.target.closest(".comment-filter")
          ? "review-filter"
          : event.target.closest(".top") ? "top" : "";
      rail.setPointerCapture(event.pointerId);
    });

    listen(rail, "pointermove", (event) => {
      if (!drag.active || event.pointerId !== drag.pointerId) {
        return;
      }
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.max(Math.abs(dx), Math.abs(dy)) >= DRAG_THRESHOLD && !drag.moved) {
        drag.moved = true;
        rail.style.left = `${drag.startLeft}px`;
        rail.style.right = "auto";
        rail.classList.add("dragging");
      }
      if (drag.moved) {
        event.preventDefault();
        moveRail(drag.startLeft + dx, drag.startTop + dy);
      }
    });

    listen(rail, "pointerup", (event) => endDrag(event, true));
    listen(rail, "pointercancel", (event) => endDrag(event, false));

    listen(settingsBtn, "click", (event) => {
      if (drag.moved || drag.handledClick) {
        event.preventDefault();
        event.stopPropagation();
        drag.moved = false;
        return;
      }
      requestOpen();
    });
    listen(topBtn, "click", (event) => {
      if (drag.moved || drag.handledClick) {
        event.preventDefault();
        event.stopPropagation();
        drag.moved = false;
        return;
      }
      toTop();
    });
    listen(reviewBtn, "click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (drag.moved || drag.handledClick) {
        drag.moved = false;
        return;
      }
      requestOpen({ category: "review-filter", filteredReviews: true });
    });
  }

  function bind() {
    bindDrag();
    // 注: 窗口/Steam UI 尺寸变化只重排，不写入存储，避免覆盖用户手动拖动的位置。
    listen(root, "resize", () => applyRailPos(railTop, railSide, false));
    listen(root, "scroll", scheduleTopButton, { passive: true });
    listen(document, "scroll", scheduleTopButton, { passive: true, capture: true });
    listen(root, REVIEW_UPDATE_EVT, (event) => updateReviewButton(event.detail || {}));
  }

  function dispose(options = {}) {
    const hadHost = !!host;
    const keepForPanel = document.documentElement?.dataset?.[PANEL_MARK] === "1";
    for (const disposeOne of disposers.splice(0)) {
      try {
        disposeOne();
      } catch {
      }
    }
    if (topFrameRaf) {
      root.cancelAnimationFrame?.(topFrameRaf);
      topFrameRaf = 0;
    }
    mounted = false;
    if (host) {
      delete host.dataset[RAIL_MARK];
      if (options.keepHost === true) {
        shadow?.replaceChildren();
      } else if (keepForPanel) {
        // 完整设置面板已接管同一个 host 时，只释放轻量栏监听器，不移除面板容器。
      } else {
        host.remove();
      }
    }
    rail = null;
    settingsBtn = null;
    topBtn = null;
    reviewBtn = null;
    reviewCount = null;
    log?.info?.("floating-rail-dispose", "轻量悬浮栏已释放", {
      keepHost: options.keepHost === true,
      keepForPanel,
      hadHost,
    });
  }

  async function mount() {
    if (!topFrame() || !targetPage() || !document.body || document.documentElement.dataset[PANEL_MARK] === "1") {
      log?.info?.("floating-rail-mount-skipped", "轻量悬浮栏挂载跳过", {
        path: location.pathname,
        topFrame: topFrame(),
        targetPage: targetPage(),
        hasBody: !!document.body,
        panelMounted: document.documentElement?.dataset?.[PANEL_MARK] === "1",
      });
      return false;
    }
    if (mounted) {
      log?.info?.("floating-rail-mount-skipped", "轻量悬浮栏挂载跳过", {
        path: location.pathname,
        reason: "already-mounted",
      });
      return true;
    }
    log?.info?.("floating-rail-mount-start", "开始挂载轻量悬浮栏", {
      path: location.pathname,
    });
    await root.STI18n?.ready?.();
    await loadRailPos();
    render();
    bind();
    applyRailPos(railTop, railSide, false);
    updateTopButton();
    updateReviewButton(latestReview);
    syncReviewFilterState();
    mounted = true;
    runtime?.registerResource?.({
      owner: OWNER,
      key: "shadow-root",
      type: "feature-lifecycle",
      dispose,
    });
    log?.info?.("floating-rail-mount-success", "轻量悬浮栏挂载成功", {
      path: location.pathname,
      railSide,
      hiddenReviewCount: latestReview.count,
    });
    return true;
  }

  function mountSoon() {
    ready(() => {
      mount().catch((error) => {
        log?.error?.("floating-rail-mount-failed", "设置中心轻量悬浮入口挂载失败", {
          path: location.pathname,
          error: error?.message || String(error),
        });
      });
    });
  }

  root.STSettingsFloatingRail = Object.freeze({
    version: VERSION,
    dispose,
    latestReviewDetail: () => ({
      count: latestReview.count,
      items: latestReview.items.slice(),
    }),
    mount,
  });

  if (typeof module === "object" && module.exports) {
    module.exports = root.STSettingsFloatingRail;
  }

  if (typeof document !== "undefined") {
    mountSoon();
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
