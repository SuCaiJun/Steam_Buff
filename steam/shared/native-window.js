/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 原生窗口创建、挂载及释放
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";
  // 使用已验证的 Notifications Menu Popup 契约；调用者提供内容、尺寸和定位规则。
  /**
   * 每个宿主最多管理一个窗口。params(kind) 提供标题、modal 与 dimensions；geometry(state)
   * 提供相对入口窗口的 x/y/width/height。follow 仅用于需要持续跟随的消息菜单。
   * mainPopup 只在属性入口中选择已注册的 Steam 主 Popup，入口 Popup 仍负责焦点恢复。
   * resizable 配合 canResize 启用八方向手柄，onBoundsChanged 仅在操作完成后回传尺寸。
   * resize(width,height) 为恢复布局调整当前窗口大小，不改变窗口位置或自行保存配置。
   * open 返回挂载、定位完成的 Promise；close/stop 在销毁文档前回收自有 DOM 与订阅。
   */
  function create(options) {
    const { trigger, onClosed, reportFailure, onEscape, log } = options;
    const parking = document.createDocumentFragment();
    let template = null, active = null, disposed = false;

    function contract() {
      if (template) return { value: template };
      const manager = window.opener?.g_PopupManager;
      if (typeof manager?.GetPopups !== "function" || typeof manager.GetPopupForWindow !== "function" || typeof manager.RemoveTrackedPopup !== "function") throw new Error("Steam 原生弹窗入口不可用");
      const owner = manager.GetPopupForWindow(window);
      const main = options.mainPopup ? options.mainPopup(manager) : owner;
      const menu = Array.from(manager.GetPopups()).find(item => item.title === "Notifications Menu");
      const missing = [];
      if (!main) missing.push("Steam 主窗口");
      if (!owner) missing.push("入口所在窗口");
      if (!menu) missing.push("Notifications Menu");
      if (menu && !Number.isInteger(menu.params.eCreationFlags)) missing.push("通知菜单创建参数");
      if (main && !main.params.target_browser) missing.push("Steam 主窗口浏览器");
      if (missing.length) return { manager, missing };
      if (typeof SteamClient.Window.GetWindowRestoreDetails !== "function") throw new Error("Steam 主窗口定位接口不可用");
      template = { manager, main, owner, Popup: menu.constructor, flags: menu.params.eCreationFlags, bodyClass: menu.params.body_class, browser: main.params.target_browser, openerId: SteamClient.Browser.GetBrowserID() };
      return { value: template };
    }

    // 冷启动只等待已有 Popup 注册事件；完成、取消或超时后立即注销，不轮询运行时。
    function waitForContract(state) {
      const initial = contract();
      if (initial.value) return Promise.resolve(initial.value);
      if (typeof initial.manager.AddPopupCreatedCallback !== "function") throw new Error("Steam 弹窗创建通知接口不可用");
      state.waitingFor = initial.missing;
      const startedAt = performance.now();
      log.info("native-window-waiting", "等待 Steam 原生窗口就绪", { kind: state.kind, missing: initial.missing });
      return new Promise((resolve, reject) => {
        let done = false;
        const cleanup = () => { subscription.Unregister(); state.cancelContract = null; };
        const cancel = () => {
          if (done) return;
          done = true; cleanup(); reject(new DOMException("原生窗口已关闭", "AbortError"));
        };
        const check = () => {
          if (done || state.closed || disposed) return;
          try {
            const result = contract();
            state.waitingFor = result.missing;
            if (!result.value) return;
            done = true; cleanup();
            log.info("native-window-ready", "Steam 原生窗口已就绪", { kind: state.kind, durationMs: Math.round(performance.now() - startedAt) });
            resolve(result.value);
          } catch (error) { done = true; cleanup(); reject(error); }
        };
        const subscription = initial.manager.AddPopupCreatedCallback(popup => {
          if (popup.title === "Steam" || popup.title === "Notifications Menu") check();
        });
        state.cancelContract = cancel;
        check();
      });
    }

    function finish(state, reason) {
      if (state.closed) return;
      state.closed = true;
      state.resizer?.stop();
      if (active === state) active = null;
      clearTimeout(state.timer);
      state.cancelContract?.();
      if (state.frame && !state.win?.closed) state.win.cancelAnimationFrame(state.frame);
      state.frame = 0;
      state.doc?.removeEventListener("keydown", state.keydown, true);
      state.win?.removeEventListener("resize", state.resize);
      options.beforeClose?.(state);
      state.content.querySelectorAll("dialog[open]").forEach(item => item.close());
      parking.appendChild(state.content);
      if (!state.ready) state.reject(new DOMException("原生窗口已关闭", "AbortError"));
      onClosed(state.kind, reason);
    }

    function close(reason = "close", restoreFocus = false) {
      const state = active;
      if (!state) return;
      finish(state, reason);
      if (state.item) {
        if (state.item.BIsValid() && !state.item.BIsClosed()) state.item.Close();
        else template.manager.RemoveTrackedPopup(state.item);
      }
      if (restoreFocus && !disposed && !window.closed) {
        template.owner.Focus(); trigger?.focus({ preventScroll: true });
      }
    }

    async function position(state) {
      const restore = await SteamClient.Window.GetWindowRestoreDetails();
      if (state.closed || active !== state || state.win.closed) return;
      if (typeof restore !== "string") throw new TypeError("Steam 窗口位置格式无效");
      const { x, y, width, height } = options.geometry(state);
      const signature = JSON.stringify([restore, x, y, width, height]);
      if (signature !== state.geometry) {
        await state.win.SteamClient.Window.PositionWindowRelative(restore, x, y, width, height);
        state.geometry = signature;
      }
    }

    // 缩放以自有窗口的 restore 字符串为原点；不依赖 CEF 未同步更新的 screenX/screenY。
    // 指针移动只改常数个数值，rAF 合并且最多一个原生调用在途；只在松手后保存最终尺寸。
    function attachResize(state) {
      const win = state.win, content = state.content;
      if (typeof win.SteamClient.Window.GetWindowRestoreDetails !== "function") throw new Error("Steam 原生窗口缩放接口不可用");
      let gesture = null, frame = 0, stopped = false, resetting = false;
      const handles = ["n", "s", "w", "e", "nw", "ne", "sw", "se"].map(edge => {
        const handle = state.doc.createElement("span");
        handle.dataset.stNativeResize = edge; handle.setAttribute("aria-hidden", "true");
        content.appendChild(handle); return handle;
      });
      function release(g) {
        if (g.target?.hasPointerCapture(g.pointerId)) g.target.releasePointerCapture(g.pointerId);
      }
      async function flush(g) {
        if (stopped || state.closed || gesture !== g || g.running) return;
        g.running = true;
        try {
          if (g.restore === null) g.restore = await win.SteamClient.Window.GetWindowRestoreDetails();
          const restore = g.restore;
          if (stopped || state.closed || gesture !== g) return;
          if (typeof restore !== "string") throw new TypeError("Steam 窗口位置格式无效");
          const next = g.next; g.next = null;
          if (next) {
            await win.SteamClient.Window.PositionWindowRelative(restore, next.x, next.y, next.width, next.height);
            g.applied = next;
          }
          if (stopped || state.closed || gesture !== g) return;
          if (!g.next && g.ended) {
            gesture = null;
            if (!g.cancelled) options.onBoundsChanged?.({ width: g.applied.width, height: g.applied.height });
          }
        } finally {
          g.running = false;
          if (gesture === g && g.next) schedule(g);
        }
      }
      function schedule(g) {
        if (frame || g.running || stopped || state.closed) return;
        frame = win.requestAnimationFrame(() => {
          frame = 0;
          void flush(g).catch(error => {
            if (stopped || state.closed) return;
            gesture = null; release(g); reportFailure(error, "window-resize");
          });
        });
      }
      function begin(target, event) {
        if (gesture || resetting || stopped || !state.ready || !options.canResize()) return null;
        const g = { target, pointerId: event?.pointerId, startX: event?.screenX, startY: event?.screenY,
          width: win.innerWidth, height: win.innerHeight, restore: null,
          edge: target?.dataset.stNativeResize, next: null, ended: false };
        gesture = g;
        return g;
      }
      function cancel() {
        const g = gesture;
        if (!g || g.ended) return false;
        g.cancelled = true; g.ended = true;
        g.next = { x: 0, y: 0, width: g.width, height: g.height };
        release(g); schedule(g); return true;
      }
      function pointer(event) {
        if (event.type === "pointerdown") {
          const target = event.target.closest("[data-st-native-resize]");
          if (!target || event.button !== 0 || !event.isPrimary) return;
          event.preventDefault();
          const g = begin(target, event);
          if (g) { target.setPointerCapture(event.pointerId); schedule(g); }
          return;
        }
        const g = gesture;
        if (!g || g.ended || event.pointerId !== g.pointerId) return;
        if (event.type === "pointercancel" || event.type === "lostpointercapture") { cancel(); return; }
        const dx = event.screenX - g.startX, dy = event.screenY - g.startY;
        const west = g.edge.includes("w"), east = g.edge.includes("e"), north = g.edge.includes("n"), south = g.edge.includes("s");
        const width = Math.round(Math.max(Math.min(640, win.screen.availWidth), Math.min(win.screen.availWidth, g.width + (west ? -dx : east ? dx : 0))));
        const height = Math.round(Math.max(Math.min(400, win.screen.availHeight), Math.min(win.screen.availHeight, g.height + (north ? -dy : south ? dy : 0))));
        g.next = { x: west ? g.width - width : 0, y: north ? g.height - height : 0, width, height };
        if (event.type === "pointerup") { g.ended = true; release(g); }
        schedule(g);
      }
      for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"]) content.addEventListener(type, pointer);
      return {
        cancel,
        async resize(width, height) {
          if (gesture || resetting) throw new Error("请先结束当前窗口缩放");
          const nextWidth = Math.min(width, win.screen.availWidth), nextHeight = Math.min(height, win.screen.availHeight);
          if (win.innerWidth === nextWidth && win.innerHeight === nextHeight) return;
          resetting = true;
          try {
            const restore = await win.SteamClient.Window.GetWindowRestoreDetails();
            if (stopped || state.closed) return;
            if (typeof restore !== "string") throw new TypeError("Steam 窗口位置格式无效");
            await win.SteamClient.Window.PositionWindowRelative(restore, 0, 0, nextWidth, nextHeight);
          } finally { resetting = false; }
        },
        stop() {
          stopped = true; win.cancelAnimationFrame(frame); frame = 0;
          const g = gesture; gesture = null; if (g) release(g);
          for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"]) content.removeEventListener(type, pointer);
          handles.forEach(handle => handle.remove());
        },
      };
    }

    function layout() {
      const state = active;
      if (!state?.ready || state.closed || state.win.closed || state.frame) return;
      if (state.positioning) { state.positionAgain = true; return; }
      state.frame = state.win.requestAnimationFrame(async () => {
        state.frame = 0; state.positioning = true; state.positionAgain = false;
        try {
          await position(state);
        } catch (error) {
          if (!state.closed && !disposed) { reportFailure(error, "window-position"); close("error"); }
        } finally {
          state.positioning = false;
          if (state.positionAgain && active === state && !state.closed) layout();
        }
      });
    }

    function open(kind, content, prepareContent) {
      if (disposed) return Promise.reject(new DOMException("原生窗口宿主已停止", "AbortError"));
      if (active?.kind === kind) { if (active.ready) active.item.Focus(); return active.promise; }
      close("replace");
      const state = { kind, content, closed: false, ready: false, frame: 0, win: null, item: null };
      state.promise = new Promise((resolve, reject) => { state.resolve = resolve; state.reject = reject; });
      active = state;
      const fail = error => { if (!state.closed) { state.reject(error); close("error"); } };
      state.timer = window.setTimeout(() => {
        if (state.ready || state.closed) return;
        const missing = state.waitingFor?.length ? `，尚未就绪：${state.waitingFor.join("、")}` : "";
        state.reject(new Error(`Steam 原生窗口打开超时${missing}，请重试`)); close("timeout");
      }, 12000);
      state.keydown = event => {
        if (event.key !== "Escape") return;
        event.preventDefault(); event.stopPropagation();
        if (state.resizer?.cancel()) return;
        if (!onEscape(event)) close("escape", true);
      };
      state.resize = options.follow ? layout : () => options.onResize?.(state);
      async function mount(target) {
        if (state.closed || disposed || active !== state) return;
        const doc = target.ownerDocument;
        state.doc = doc;
        state.win = doc.defaultView;
        if (typeof state.win.SteamClient.Window.PositionWindowRelative !== "function") throw new Error("Steam 原生窗口定位接口不可用");
        window.STTheme.applyCssVariables(doc.documentElement);
        options.prepareDocument?.(state);
        const sheet = doc.createElement("style");
        sheet.textContent = options.css(kind);
        doc.head.appendChild(sheet); target.appendChild(content);
        prepareContent(state);
        doc.addEventListener("keydown", state.keydown, true);
        state.win.addEventListener("resize", state.resize);
        // 隐藏窗口没有稳定的 rAF；直接测量完整内容并完成首次定位，再显示原生窗口。
        await position(state);
        if (state.closed || disposed || active !== state || state.win.closed) return;
        state.ready = true;
        if (options.resizable) state.resizer = attachResize(state);
        clearTimeout(state.timer); state.item.Focus();
        // 初始焦点留在内容区域；Tab 再进入操作按钮。
        content.focus({ preventScroll: true });
        state.resolve();
      }
      async function prepare() {
        const config = await waitForContract(state);
        if (state.closed || disposed || active !== state) return;
        const spec = options.params(kind);
        const params = {
          title: spec.title, eCreationFlags: config.flags | 2,
          target_browser: config.browser, window_opener_id: config.openerId,
          body_class: config.bodyClass, bModal: spec.modal, dimensions: spec.dimensions,
        };
        state.item = new config.Popup(`${options.id}_${kind}_${config.openerId}`, params, target => { void mount(target).catch(fail); });
        state.item.m_callbacks = {
          onClose() { finish(state, "native-close"); },
          onBlur() { if (active === state && state.ready && options.closeOnBlur?.(state.kind)) close("blur"); },
        };
        state.item.Show();
        if (!state.item.BIsValid()) throw new Error("Steam 未能创建原生窗口，请重试");
        state.win = state.item.window;
      }
      void prepare().catch(fail);
      return state.promise;
    }

    return Object.freeze({
      open, close, layout,
      resize(width, height) {
        if (!active?.ready || !active.resizer) return Promise.reject(new Error("原生窗口尚未就绪"));
        return active.resizer.resize(width, height);
      },
      kind() { return active?.kind || null; },
      ready() { return active?.ready === true; },
      stop() { if (disposed) return; disposed = true; close("stop"); },
    });
  }
  window.SteamBuff.nativeWindow = Object.freeze({ create });
})();
