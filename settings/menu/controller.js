/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置面板|悬浮入口控制器
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const log = globalThis.STLoggerFactory?.createLogger?.("settings", "menu-controller") || {
    info() {},
    warn() {},
  };

  const DEFAULTS = Object.freeze({
    dragThreshold: 10,
    minTop: 24,
    margin: 24,
    topShowY: 1500,
    openEvent: "STSettingsOpen",
    openCatDataset: "steamBuffOpenCat",
    openAckDataset: "steamBuffOpenAck",
  });

  function noop() {}

  function fallbackScrollTargets() {
    function targets(extraTargets = []) {
      return Array.from(new Set([
        document.scrollingElement,
        document.documentElement,
        document.body,
        ...(Array.isArray(extraTargets) ? extraTargets : [extraTargets]),
      ].filter(target => target && typeof target.scrollTop === "number")));
    }
    return {
      fixedScrollTargets: targets,
      scrollTargets: targets,
      scrollY(extraTargets = []) {
        const top = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
        if (top > 0) {
          return top;
        }
        for (const el of targets(extraTargets)) {
          if (el.scrollTop > 0) {
            return el.scrollTop;
          }
        }
        return 0;
      },
      rememberScrollTarget() {},
      clear() {},
    };
  }

  function createScrollTargets() {
    return globalThis.STSettingsScrollTargets?.create?.() || fallbackScrollTargets();
  }

  const sharedScrollTargets = createScrollTargets();

  function clampRailTop(value, rail, cfg = DEFAULTS) {
    const height = rail?.offsetHeight || 54;
    const max = Math.max(cfg.minTop, window.innerHeight - height - cfg.margin);
    const top = Number(value);
    if (!Number.isFinite(top)) {
      return Math.round((window.innerHeight - height) / 2);
    }
    return Math.min(Math.max(top, cfg.minTop), max);
  }

  function fixedScrollTargets() {
    return sharedScrollTargets.fixedScrollTargets();
  }

  function scrollTargets() {
    return sharedScrollTargets.scrollTargets();
  }

  function scrollY() {
    return sharedScrollTargets.scrollY();
  }

  function create(options = {}) {
    const cfg = { ...DEFAULTS, ...(options.config || {}) };
    const shadow = options.shadow;
    const btn = options.btn;
    const panel = options.panel;
    const rail = options.rail || shadow?.querySelector(".rail");
    const topBtn = options.topBtn || shadow?.querySelector(".top");
    const reviewBtn = options.reviewBtn || shadow?.querySelector(".comment-filter");
    const closeBtn = options.closeBtn || shadow?.querySelector(".close");
    const storage = options.storage || {};
    const allCategories = typeof options.allCategories === "function" ? options.allCategories : () => [];
    const getActiveCat = typeof options.getActiveCat === "function" ? options.getActiveCat : () => "";
    const setActiveCat = typeof options.setActiveCat === "function" ? options.setActiveCat : noop;
    const render = typeof options.render === "function" ? options.render : noop;
    const callPanelOpen = typeof options.callPanelOpen === "function" ? options.callPanelOpen : noop;
    const callPageOpen = typeof options.callPageOpen === "function" ? options.callPageOpen : noop;
    const playStartupAnimation = typeof options.playStartupAnimation === "function" ? options.playStartupAnimation : noop;
    const openFilteredReviews = typeof options.openFilteredReviews === "function" ? options.openFilteredReviews : noop;
    let railTop = options.initialTop ?? null;
    let railSide = options.initialSide === "left" ? "left" : "right";
    let bound = false;
    let topButtonRaf = 0;
    let disposers = [];
    const scroll = createScrollTargets();

    function panelOpen() {
      return !!(panel?.classList?.contains("open") && !panel.hidden);
    }

    function actionMeta(extra = {}) {
      return {
        activeCat: getActiveCat(),
        panelOpen: panelOpen(),
        hasPanel: !!panel,
        hasRail: !!rail,
        railSide,
        ...extra,
      };
    }

    function applyRailPos(value, side, save) {
      if (!rail) {
        return;
      }
      railTop = clampRailTop(value, rail, cfg);
      railSide = side === "left" ? "left" : "right";
      rail.style.top = `${railTop}px`;
      rail.style.left = "auto";
      rail.style.right = "auto";
      rail.classList.toggle("left", railSide === "left");
      rail.classList.toggle("right", railSide !== "left");
      rail.style[railSide] = "0";
      if (save) {
        storage.setRailPos?.({ top: railTop, side: railSide });
      }
    }

    function applyRailTop(value, save) {
      applyRailPos(value, railSide, save);
    }

    function moveRail(x, y) {
      if (!rail) {
        return;
      }
      const width = rail.offsetWidth || 42;
      const left = Math.min(Math.max(x, 0), Math.max(0, window.innerWidth - width));
      railTop = clampRailTop(y, rail, cfg);
      rail.style.left = `${left}px`;
      rail.style.right = "auto";
      rail.style.top = `${railTop}px`;
    }

    function snapRail(x, y, save) {
      if (!rail) {
        return;
      }
      const width = rail.offsetWidth || 42;
      const side = x + width / 2 < window.innerWidth / 2 ? "left" : "right";
      applyRailPos(y, side, save);
    }

    function toTop() {
      const targets = scroll.scrollTargets([
        shadow?.querySelector(".body"),
        panel,
      ]);
      try {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        window.scrollTo(0, 0);
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
      log.info("settings-panel-top-action", "用户触发回到顶部", actionMeta({
        targetCount: targets.length,
      }));
    }

    function updateTopButton() {
      if (!topBtn) {
        return;
      }
      const hide = scroll.scrollY() < cfg.topShowY;
      if (topBtn.hidden === hide) {
        return;
      }
      topBtn.hidden = hide;
      if (rail) {
        window.requestAnimationFrame(() => {
          applyRailTop(railTop, false);
        });
      }
    }

    function cancelTopButtonUpdate() {
      if (!topButtonRaf) {
        return;
      }
      const cancel = window.cancelAnimationFrame || window.clearTimeout;
      cancel.call(window, topButtonRaf);
      topButtonRaf = 0;
    }

    function scheduleTopButton(event) {
      scroll.rememberScrollTarget(event?.target);
      if (topButtonRaf) {
        return;
      }
      const raf = window.requestAnimationFrame || ((fn) => window.setTimeout(fn, 16));
      topButtonRaf = raf.call(window, () => {
        topButtonRaf = 0;
        updateTopButton();
      });
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

    function dispose() {
      if (!bound) {
        return false;
      }
      bound = false;
      cancelTopButtonUpdate();
      for (const disposeOne of disposers.splice(0)) {
        try {
          disposeOne();
        } catch {
        }
      }
      scroll.clear?.();
      log.info("settings-panel-controller-dispose", "设置面板控制器监听已释放", actionMeta());
      return true;
    }

    function setOpen(open) {
      if (!panel || !btn) {
        return;
      }
      panel.hidden = false;
      btn.setAttribute("aria-expanded", open ? "true" : "false");

      if (open) {
        window.requestAnimationFrame(() => {
          panel.classList.add("open");
        });
        return;
      }

      panel.classList.remove("open");
      window.setTimeout(() => {
        if (!panel.classList.contains("open") && !panel.querySelector(".settings-dialog-layer")) {
          panel.classList.remove("dialog-only");
          panel.hidden = true;
        }
      }, 170);
    }

    function open() {
      if (!panel) {
        log.warn("settings-panel-open-failed", "设置面板打开失败", actionMeta({
          reason: "panel-missing",
        }));
        return;
      }
      const wasOpen = panel.classList.contains("open") && !panel.hidden;
      setOpen(true);
      if (!wasOpen) {
        callPanelOpen(shadow);
        playStartupAnimation(shadow);
        log.info("settings-panel-open", "设置面板打开", actionMeta());
      }
    }

    function close() {
      const wasOpen = panelOpen();
      setOpen(false);
      if (wasOpen) {
        log.info("settings-panel-close", "设置面板关闭", actionMeta());
      }
    }

    function openFilteredDialog() {
      setOpen(false);
      openFilteredReviews(shadow);
      log.info("settings-panel-filtered-reviews-open", "打开已过滤评论弹窗", actionMeta());
    }

    function toggle() {
      if (!panel) {
        log.warn("settings-panel-toggle-failed", "设置面板切换失败", actionMeta({
          reason: "panel-missing",
        }));
        return;
      }
      const next = !panel.classList.contains("open");
      setOpen(next);
      if (next) {
        callPanelOpen(shadow);
        playStartupAnimation(shadow);
        log.info("settings-panel-open", "设置面板打开", actionMeta({
          source: "toggle",
        }));
      } else {
        log.info("settings-panel-close", "设置面板关闭", actionMeta({
          source: "toggle",
        }));
      }
    }

    function openCat(id) {
      if (!panel) {
        log.warn("settings-panel-category-open-failed", "设置分类打开失败", actionMeta({
          categoryId: String(id || ""),
          reason: "panel-missing",
        }));
        return;
      }
      const categories = allCategories();
      const wasOpen = panel.classList.contains("open") && !panel.hidden;
      const exists = categories.some((cat) => cat.id === id);
      if (exists) {
        setActiveCat(id);
        render(shadow);
        shadow?.querySelector(".body")?.scrollTo({ top: 0 });
      } else {
        log.warn("settings-panel-category-open-failed", "设置分类不存在", actionMeta({
          categoryId: String(id || ""),
          reason: "category-missing",
        }));
      }
      open();
      if (wasOpen) {
        callPageOpen(shadow);
      }
      log.info("settings-panel-category-open", "设置分类打开", actionMeta({
        categoryId: String(id || ""),
        categoryExists: exists,
        wasOpen,
      }));
    }

    function bind() {
      if (bound || !shadow || !btn || !panel) {
        return dispose;
      }
      bound = true;
      const drag = {
        active: false,
        moved: false,
        startY: 0,
        startX: 0,
        startTop: 0,
        startLeft: 0,
        pointerId: 0,
        target: null,
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
          // 指针捕获可能已被浏览器释放，忽略即可。
        }
        rail.classList.remove("dragging");
        if (save && drag.moved) {
          snapRail(rail.offsetLeft, railTop, true);
          window.setTimeout(() => {
            drag.moved = false;
          }, 80);
        } else if (save && drag.target) {
          drag.handledClick = true;
          if (drag.target === "settings") {
            toggle();
          } else if (drag.target === "review-filter") {
            openFilteredDialog();
          } else if (drag.target === "top") {
            toTop();
          }
          window.setTimeout(() => {
            drag.handledClick = false;
          }, 80);
        }
        drag.target = null;
      };

      window.requestAnimationFrame(() => {
        applyRailTop(railTop, false);
      });

      listen(btn, "click", (event) => {
        if (drag.moved || drag.handledClick) {
          event.preventDefault();
          event.stopPropagation();
          drag.moved = false;
          return;
        }
        toggle();
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
        openFilteredDialog();
      });
      listen(closeBtn, "click", close);
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
            : event.target.closest(".top") ? "top" : null;
        rail.setPointerCapture(event.pointerId);
      });

      listen(rail, "pointermove", (event) => {
        if (!drag.active || event.pointerId !== drag.pointerId) {
          return;
        }
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (Math.max(Math.abs(dx), Math.abs(dy)) >= cfg.dragThreshold) {
          if (!drag.moved) {
            drag.moved = true;
            rail.style.left = `${drag.startLeft}px`;
            rail.style.right = "auto";
            rail.classList.add("dragging");
          }
        }
        if (drag.moved) {
          event.preventDefault();
          moveRail(drag.startLeft + dx, drag.startTop + dy);
        }
      });

      listen(rail, "pointerup", (event) => endDrag(event, true));
      listen(rail, "pointercancel", (event) => endDrag(event, false));

      listen(document.documentElement, cfg.openEvent, (event) => {
        document.documentElement.dataset[cfg.openAckDataset] = String(Date.now());
        const data = document.documentElement.dataset;
        const filteredReviews = event.detail?.filteredReviews === true || data.steamBuffOpenFilteredReviews === "1";
        if (filteredReviews) {
          delete data.steamBuffOpenFilteredReviews;
          delete data[cfg.openCatDataset];
          openFilteredDialog();
          return;
        }
        openCat(document.documentElement.dataset[cfg.openCatDataset] || getActiveCat());
      });

      listen(window, "scroll", scheduleTopButton, { passive: true });
      listen(document, "scroll", scheduleTopButton, { passive: true, capture: true });

      updateTopButton();
      return dispose;
    }

    return Object.freeze({
      bind,
      close,
      dispose,
      open,
      openCat,
      setOpen,
      toTop,
      toggle,
      updateTopButton,
      getRailState: () => ({ top: railTop, side: railSide }),
    });
  }

  const api = Object.freeze({
    clampRailTop,
    create,
    fixedScrollTargets,
    scrollTargets,
    scrollY,
  });
  globalThis.STSettingsMenuController = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
