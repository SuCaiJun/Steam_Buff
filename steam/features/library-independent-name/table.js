/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 名称表格列拖拽、列宽及弹窗宽度交互
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";
  function create(options) {
    const { root, onChange, onSort } = options;
    const model = window.STNameTable;
    let prefs = model.parse(options.prefs), gesture = null, swallow = false, stopped = false;
    const scroll = root.querySelector("[data-lin-scroll]");
    const header = root.querySelector(".st-lin-cols");
    const dialog = root.querySelector(".st-lin-dialog");
    const duration = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 160;
    const cells = id => Array.from(root.querySelectorAll(`th[data-lin-col="${id}"],td[data-lin-col="${id}"]`));

    function apply() {
      const active = document.activeElement;
      root.style.setProperty("--st-lin-dialog-width", prefs.dialogWidth + "px");
      applyWidths();
      for (const row of root.querySelectorAll("[data-lin-colgroup],[data-lin-header],tr[data-appid]")) {
        const nodes = new Map(Array.from(row.children).filter(node => node.dataset.linCol).map(node => [node.dataset.linCol, node]));
        const ordered = prefs.order.map(id => nodes.get(id)).filter(Boolean);
        if (ordered.some((node, index) => node !== Array.from(row.children).filter(child => child.dataset.linCol)[index])) row.append(...ordered);
      }
      header.style.marginInlineEnd = Math.max(0, scroll.offsetWidth - scroll.clientWidth) + "px";
      syncScroll();
      if (active?.isConnected && root.contains(active)) active.focus({ preventScroll: true });
    }

    function changed() { onChange(model.parse(prefs)); }
    function syncScroll() {
      header.firstElementChild.style.transform = `translateX(${-scroll.scrollLeft}px)`;
      if (gesture?.kind === "order" && scroll.scrollTop !== gesture.scrollTop) cancel();
    }
    function headerScroll() {
      if (!header.scrollLeft) return;
      scroll.scrollLeft += header.scrollLeft;
      header.scrollLeft = 0;
      syncScroll();
    }

    function clear(state) {
      window.cancelAnimationFrame(state.frame);
      for (const animation of state.animations || []) animation.cancel();
      for (const item of state.items || []) for (const node of item.nodes) {
        node.style.removeProperty("transform");
        node.classList.remove("st-lin-column-moving", "st-lin-column-placeholder");
      }
      state.preview?.remove();
      root.classList.remove("st-lin-dragging", "st-lin-resizing");
      if (state.target.hasPointerCapture(state.pointerId)) state.target.releasePointerCapture(state.pointerId);
    }

    function cancel() {
      const state = gesture;
      gesture = null;
      if (!state) return;
      if (state.started) swallow = true;
      if (!state.settling) prefs = state.before;
      clear(state);
      apply();
    }

    function begin(state) {
      state.started = true;
      state.scrollTop = scroll.scrollTop;
      state.scrollLeft = scroll.scrollLeft;
      state.viewport = scroll.getBoundingClientRect();
      if (state.kind !== "order") { root.classList.add("st-lin-resizing"); return; }
      state.items = prefs.order.map(id => ({ id, rect: header.querySelector(`th[data-lin-col="${id}"]`).getBoundingClientRect(), nodes: cells(id) }));
      state.from = prefs.order.indexOf(state.id);
      state.to = state.from;
      state.rect = state.items[state.from].rect;
      const preview = document.createElement("div");
      preview.className = "st-lin-column-preview";
      preview.setAttribute("aria-hidden", "true");
      preview.inert = true;
      Object.assign(preview.style, { left: state.rect.left + "px", top: state.rect.top + "px", width: state.rect.width + "px", height: (state.viewport.bottom - state.rect.top) + "px" });
      for (const node of state.items[state.from].nodes) {
        const rect = node.getBoundingClientRect(), copy = document.createElement("div");
        copy.className = "st-lin-column-copy";
        Object.assign(copy.style, { top: (rect.top - state.rect.top) + "px", height: rect.height + "px" });
        if (node.tagName === "TH") copy.textContent = node.querySelector("[data-lin-col-sort]").textContent;
        else copy.append(node.firstElementChild.cloneNode(true));
        preview.append(copy);
      }
      root.append(preview);
      state.preview = preview;
      for (const item of state.items) for (const node of item.nodes) node.classList.add("st-lin-column-moving");
      for (const node of state.items[state.from].nodes) node.classList.add("st-lin-column-placeholder");
      root.classList.add("st-lin-dragging");
    }

    // 与相关链接采用同样的浮层、逐帧位移及松手归位；拖动中只操作七列和已挂载行。
    function paint(time) {
      const state = gesture;
      if (!state?.started || state.settling) return;
      state.frame = 0;
      const delta = state.x - state.startX;
      if (state.kind === "width") {
        const column = model.columns.find(column => column.id === state.id);
        prefs.widths[state.id] = Math.round(Math.max(column.min, Math.min(4096, state.before.widths[state.id] + delta)));
        applyWidths();
        return;
      }
      if (state.kind === "dialog") {
        const max = Math.max(1, window.innerWidth - 48), min = Math.min(640, max);
        prefs.dialogWidth = Math.round(Math.max(min, Math.min(max, state.width + delta * (state.edge === "left" ? -2 : 2))));
        root.style.setProperty("--st-lin-dialog-width", prefs.dialogWidth + "px");
        return;
      }
      const elapsed = Math.min(32, state.time ? time - state.time : 16);
      state.time = time;
      const direction = state.x < state.viewport.left + 32 ? -1 : state.x > state.viewport.right - 32 ? 1 : 0;
      const oldScroll = scroll.scrollLeft;
      if (direction) scroll.scrollLeft += direction * elapsed * .5;
      syncScroll();
      const left = Math.max(0, Math.min(window.innerWidth - state.rect.width, state.rect.left + delta));
      state.preview.style.transform = `translate3d(${left - state.rect.left}px,0,0)`;
      const center = left + state.rect.width / 2 + scroll.scrollLeft - state.scrollLeft;
      let to = 0;
      for (const item of state.items) if (item.id !== state.id && center > item.rect.left + item.rect.width / 2) to++;
      if (to !== state.to) {
        state.to = to;
        const order = state.items.slice();
        order.splice(to, 0, order.splice(state.from, 1)[0]);
        let next = state.items[0].rect.left;
        for (const item of order) {
          const offset = next - item.rect.left;
          for (const node of item.nodes) node.style.transform = offset ? `translateX(${offset}px)` : "";
          next += item.rect.width;
        }
      }
      if (scroll.scrollLeft !== oldScroll) state.frame = window.requestAnimationFrame(paint);
    }

    function applyWidths() {
      root.style.setProperty("--st-lin-total", (40 + prefs.order.reduce((sum, id) => sum + prefs.widths[id], 0)) + "px");
      for (const column of model.columns) {
        root.style.setProperty("--st-lin-col-" + column.id, prefs.widths[column.id] + "px");
        const handle = header.querySelector(`[data-lin-col-resize="${column.id}"]`);
        handle.setAttribute("aria-valuenow", String(prefs.widths[column.id]));
        handle.setAttribute("aria-valuemin", String(column.min));
        handle.setAttribute("aria-valuemax", "4096");
      }
    }

    async function settle(state) {
      state.settling = true;
      const nodes = state.items.flatMap(item => item.nodes);
      const before = nodes.map(node => node.getBoundingClientRect().left);
      const floating = state.preview.style.transform;
      prefs.order.splice(state.to, 0, prefs.order.splice(state.from, 1)[0]);
      for (const node of nodes) { node.classList.remove("st-lin-column-moving"); node.style.removeProperty("transform"); }
      apply();
      const after = nodes.map(node => node.getBoundingClientRect().left), ms = duration();
      state.animations = [];
      if (ms) nodes.forEach((node, index) => {
        if (node.dataset.linCol === state.id) return;
        const offset = before[index] - after[index];
        if (Math.abs(offset) > .5) state.animations.push(node.animate([{ transform: `translateX(${offset}px)` }, { transform: "translateX(0)" }], { duration: ms, easing: "cubic-bezier(.2,.8,.2,1)" }));
      });
      const destination = cells(state.id)[0].getBoundingClientRect().left - state.rect.left;
      state.preview.style.transform = `translate3d(${destination}px,0,0)`;
      if (ms) state.animations.push(state.preview.animate([{ transform: floating }, { transform: state.preview.style.transform }], { duration: ms, easing: "cubic-bezier(.2,.8,.2,1)" }));
      changed();
      await Promise.allSettled(state.animations.map(animation => animation.finished));
      if (gesture === state) { gesture = null; clear(state); }
    }

    function pointer(event) {
      if (event.type === "pointerdown") {
        swallow = false;
        if (gesture || event.button !== 0 || !event.isPrimary || !options.enabled()) return;
        const resize = event.target.closest("[data-lin-col-resize]"), edge = event.target.closest("[data-lin-dialog-resize]"), title = event.target.closest("[data-lin-col-sort]");
        if (!resize && !edge && !title) return;
        const target = resize || edge || title;
        gesture = { target, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, frame: 0, before: model.parse(prefs), width: dialog.getBoundingClientRect().width, kind: resize ? "width" : edge ? "dialog" : "order", id: resize?.dataset.linColResize || title?.dataset.linColSort, edge: edge?.dataset.linDialogResize };
        target.setPointerCapture(event.pointerId);
        if (resize || edge) { event.preventDefault(); begin(gesture); }
        return;
      }
      const state = gesture;
      if (!state || state.pointerId !== event.pointerId || state.settling) return;
      if (event.type === "pointercancel" || event.type === "lostpointercapture") { cancel(); return; }
      state.x = event.clientX;
      if (event.type === "pointermove") {
        if (!state.started && Math.hypot(event.clientX - state.startX, event.clientY - state.startY) >= 4) begin(state);
        if (state.started && !state.frame) state.frame = window.requestAnimationFrame(paint);
      } else if (event.type === "pointerup") {
        if (!state.started) { gesture = null; clear(state); return; }
        window.cancelAnimationFrame(state.frame);
        paint(window.performance.now());
        swallow = true;
        if (state.kind === "order") void settle(state).catch(error => { cancel(); options.reportError(error); });
        else { gesture = null; clear(state); changed(); }
      }
    }

    function click(event) {
      if (swallow && event.detail) { swallow = false; event.preventDefault(); event.stopImmediatePropagation(); return; }
      swallow = false;
      const title = event.target.closest("[data-lin-col-sort]");
      if (title && options.enabled()) onSort(title.dataset.linColSort);
    }
    function key(event) {
      if (gesture && event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); swallow = true; cancel(); return; }
      const resize = event.target.closest("[data-lin-col-resize]");
      if (resize && ["ArrowLeft", "ArrowRight"].includes(event.key) && options.enabled()) {
        event.preventDefault();
        const column = model.columns.find(column => column.id === resize.dataset.linColResize);
        prefs.widths[column.id] = Math.max(column.min, Math.min(4096, prefs.widths[column.id] + (event.key === "ArrowRight" ? 8 : -8)));
        applyWidths(); changed(); return;
      }
      const title = event.target.closest("[data-lin-col-sort]");
      if (!title || !event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key) || !options.enabled()) return;
      event.preventDefault();
      const from = prefs.order.indexOf(title.dataset.linColSort), to = Math.max(0, Math.min(prefs.order.length - 1, from + (event.key === "ArrowLeft" ? -1 : 1)));
      if (from === to) return;
      prefs.order.splice(to, 0, prefs.order.splice(from, 1)[0]); apply(); changed(); title.focus({ preventScroll: true });
    }
    function hidden() { if (document.hidden) cancel(); }
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"]) root.addEventListener(type, pointer);
    root.addEventListener("click", click, true); root.addEventListener("keydown", key, true);
    scroll.addEventListener("scroll", syncScroll, { passive: true });
    header.addEventListener("scroll", headerScroll, { passive: true });
    window.addEventListener("blur", cancel); window.addEventListener("resize", cancel); document.addEventListener("visibilitychange", hidden);
    apply();
    return {
      update(value) { if (stopped) return; cancel(); prefs = model.parse(value); apply(); },
      beforeRender() { if (gesture) cancel(); },
      stop() {
        if (stopped) return; stopped = true; cancel();
        for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"]) root.removeEventListener(type, pointer);
        root.removeEventListener("click", click, true); root.removeEventListener("keydown", key, true);
        scroll.removeEventListener("scroll", syncScroll); header.removeEventListener("scroll", headerScroll); window.removeEventListener("blur", cancel); window.removeEventListener("resize", cancel); document.removeEventListener("visibilitychange", hidden);
      },
    };
  }
  window.SteamBuff.nameTable = Object.freeze({ create });
})();
