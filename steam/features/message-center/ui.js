/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 顶栏消息入口、下拉列表与消息详情
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";
  const api = window.SteamBuff, model = window.STMessageCenter;
  const ROOT = "__RickyMessageCenter", PANEL = "__RickyMessageCenterPopover", DIALOG = "__RickyMessageCenterDialog";
  const CONTROLS = "._3cykd-VfN_xBxf3Qxriccm";
  const MOUNT_TASK = "steam-message-center-controls";
  const ROW_HEIGHT = 96, OVERSCAN = 3;
  const log = window.STLoggerFactory.createLogger("steam", model.FEATURE);

  /**
   * 用 Steam 现有 Popup 构造器承载自有 DOM；只使用已验证的通知菜单参数与窗口接口。
   * open 返回原生内容挂载完成的 Promise。关闭前收回 DOM，避免关闭文档销毁消息界面。
   */
  function nativeHost(trigger, css, onClosed, reportFailure) {
    const parking = document.createDocumentFragment();
    let template = null, active = null, disposed = false;

    function contract() {
      if (template) return template;
      const manager = window.opener?.g_PopupManager;
      if (typeof manager?.GetPopups !== "function" || typeof manager.GetPopupForWindow !== "function" || typeof manager.RemoveTrackedPopup !== "function") throw new Error("Steam 原生弹窗入口不可用");
      const main = manager.GetPopupForWindow(window);
      const menu = Array.from(manager.GetPopups()).find(item => item.title === "Notifications Menu");
      if (!main || !menu || !Number.isInteger(menu.params.eCreationFlags) || !main.params.target_browser) throw new Error("Steam 原生弹窗契约不可用");
      if (typeof SteamClient.Window.GetWindowRestoreDetails !== "function") throw new Error("Steam 主窗口定位接口不可用");
      template = { manager, main, Popup: menu.constructor, flags: menu.params.eCreationFlags, bodyClass: menu.params.body_class, browser: main.params.target_browser, openerId: SteamClient.Browser.GetBrowserID() };
      return template;
    }

    function finish(state, reason) {
      if (state.closed) return;
      state.closed = true;
      if (active === state) active = null;
      clearTimeout(state.timer);
      if (state.frame && !state.win?.closed) state.win.cancelAnimationFrame(state.frame);
      state.frame = 0;
      state.doc?.removeEventListener("keydown", state.keydown, true);
      state.win?.removeEventListener("resize", state.resize);
      parking.appendChild(state.content);
      if (!state.ready) state.reject(new DOMException("消息窗口已关闭", "AbortError"));
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
        template.main.Focus(); trigger.focus({ preventScroll: true });
      }
    }

    function layout() {
      const state = active;
      if (!state?.ready || state.closed || state.win.closed || state.frame) return;
      if (state.positioning) { state.positionAgain = true; return; }
      state.frame = state.win.requestAnimationFrame(async () => {
        state.frame = 0; state.positioning = true; state.positionAgain = false;
        try {
          const doc = state.win.document, rect = trigger.getBoundingClientRect();
          doc.documentElement.style.setProperty("--st-mc-menu-list-height", `${Math.max(80, Math.min(420, innerHeight - 176))}px`);
          const width = state.kind === "menu" ? Math.min(320, innerWidth - 16) : Math.min(760, innerWidth - 48);
          const height = state.kind === "menu" ? Math.ceil(state.content.getBoundingClientRect().height) : Math.min(640, innerHeight - 64);
          const x = state.kind === "menu" ? Math.max(8, Math.min(innerWidth - width - 8, rect.right - width)) : Math.round((innerWidth - width) / 2);
          const y = state.kind === "menu" ? Math.max(0, Math.min(rect.bottom + 2, innerHeight - height - 8)) : Math.round((innerHeight - height) / 2);
          const restore = await SteamClient.Window.GetWindowRestoreDetails();
          if (typeof restore !== "string") throw new TypeError("Steam 窗口位置格式无效");
          if (state.closed || active !== state || state.win.closed) return;
          const signature = JSON.stringify([restore, x, y, width, height]);
          if (signature !== state.geometry) {
            await state.win.SteamClient.Window.PositionWindowRelative(restore, x, y, width, height);
            state.geometry = signature;
          }
        } catch (error) {
          if (!state.closed && !disposed) { reportFailure(error, "window-position"); close("error"); }
        } finally {
          state.positioning = false;
          if (state.positionAgain && active === state && !state.closed) layout();
        }
      });
    }

    function open(kind, content) {
      if (disposed) return Promise.reject(new DOMException("消息中心已停止", "AbortError"));
      if (active?.kind === kind) { active.item.Focus(); return active.promise; }
      close("replace");
      const config = contract(), rect = trigger.getBoundingClientRect();
      const width = kind === "menu" ? Math.min(320, innerWidth - 16) : Math.min(760, innerWidth - 48);
      const height = kind === "menu" ? 260 : Math.min(640, innerHeight - 64);
      const state = { kind, content, closed: false, ready: false, frame: 0, win: null, item: null };
      state.promise = new Promise((resolve, reject) => { state.resolve = resolve; state.reject = reject; });
      active = state;
      const params = {
        title: kind === "menu" ? "Steam Buff 消息" : "Steam Buff 消息中心",
        // 原生 Show 会设置创建隐藏位；构造时清除此位，挂载完成后由原生流程显示窗口。
        eCreationFlags: config.flags & ~2,
        target_browser: config.browser, window_opener_id: config.openerId,
        body_class: config.bodyClass, bModal: kind === "full",
        dimensions: { width, height, left: screenX + (kind === "menu" ? rect.right - width : (innerWidth - width) / 2), top: screenY + (kind === "menu" ? rect.bottom + 2 : (innerHeight - height) / 2) },
      };
      state.keydown = event => {
        if (event.key !== "Escape") return;
        event.preventDefault(); event.stopPropagation(); close("escape", true);
      };
      state.resize = layout;
      try {
        state.item = new config.Popup(`SteamBuffMessageCenter_${kind}_${config.openerId}`, params, target => {
          if (state.closed || disposed || active !== state) return;
          try {
            const doc = target.ownerDocument;
            state.doc = doc;
            state.win = doc.defaultView;
            if (typeof state.win.SteamClient.Window.PositionWindowRelative !== "function") throw new Error("Steam 消息窗口定位接口不可用");
            window.STTheme.applyCssVariables(doc.documentElement);
            doc.documentElement.dataset.messageCenterWindow = kind;
            doc.documentElement.style.setProperty("--st-mc-menu-list-height", `${Math.max(80, Math.min(420, innerHeight - 176))}px`);
            const sheet = doc.createElement("style");
            sheet.textContent = css.textContent + "\nhtml,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:var(--st-color-steam-message-surface)}#popup_target{width:100%}html[data-message-center-window=full] #popup_target{height:100%}";
            doc.head.appendChild(sheet); target.appendChild(content);
            doc.addEventListener("keydown", state.keydown, true);
            state.win.addEventListener("resize", state.resize);
            state.ready = true; clearTimeout(state.timer); layout();
            // 初始焦点留在消息区域，避免默认选中操作按钮；Tab 再进入按钮。
            content.focus({ preventScroll: true });
            state.resolve();
          } catch (error) {
            state.reject(error); close("error");
          }
        });
        state.item.m_callbacks = {
          onClose() { finish(state, "native-close"); },
          onBlur() { if (active === state && state.kind === "menu") close("blur"); },
        };
        state.timer = window.setTimeout(() => {
          if (state.ready || state.closed) return;
          state.reject(new Error("Steam 消息窗口打开超时，请重试")); close("timeout");
        }, 12000);
        state.item.Show();
        if (!state.item.BIsValid()) throw new Error("Steam 未能创建消息窗口，请重试");
        state.win = state.item.window;
      } catch (error) { state.reject(error); close("error"); }
      return state.promise;
    }

    return Object.freeze({
      open, close, layout,
      kind() { return active?.kind || null; },
      stop() { if (disposed) return; disposed = true; close("stop"); },
    });
  }

  function create() {
    if (api.messageCenter) return { started: true, stop: api.messageCenter.stop };
    let controls = document.querySelector(CONTROLS);

    const pending = new Map(), actionHandlers = new Map(), detailActions = new Map(), popCards = new Map(), fullCards = new Map();
    let stopped = false, current = null, generation = 0, selection = null, busy = false;
    let popLoading = false, popDirty = false, fullLoading = false, fullDirty = false;
    let filter = "all", next = null, fullOpen = false, fullInitialized = false, fullFailed = false;
    let fullRows = [], fullRevision = null, fullFrame = 0, fullFrameWindow = null, fullWindow = "";
    const fullIds = new Set();
    let observedControls = null, observedParent = null;
    let mountWaiting = false, mountWaitAt = 0;

    function element(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }
    function button(label, action, className = "st-mc-button") {
      const node = element("button", className, label);
      node.type = "button"; node.dataset.action = action;
      return node;
    }
    function icon() { const node = element("span", "st-mc-icon"); node.setAttribute("aria-hidden", "true"); return node; }
    function date(time) { return new Date(time).toLocaleString(document.documentElement.lang || "zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }

    const style = api.styles.ensureStyle("__RickyMessageCenterStyle", window.STComponents.css.compose(
      window.STComponents.css.button(".st-mc-button", { variant: "secondary", minHeight: "28px", padding: "4px 8px", fontSize: "12px" }),
      `
      #${ROOT}, #${PANEL}, #${PANEL} *, #${DIALOG}, #${DIALOG} * { box-sizing: border-box; font-family: var(--st-font-family-base); }
      #${ROOT} { flex: 0 0 48px; width: 48px; height: 24px; margin-right: 8px; -webkit-app-region: no-drag; }
      #${ROOT} .st-mc-trigger { position: relative; display: flex; align-items: center; justify-content: center; width: 48px; height: 24px; padding: 0; border: 0; border-radius: 2px; color: var(--st-color-steam-message-icon); background: var(--st-color-steam-property-button); cursor: pointer; }
      #${ROOT} .st-mc-trigger:hover, #${ROOT} .st-mc-trigger[aria-expanded="true"] { color: var(--st-color-white); background: var(--st-color-steam-toolbar-button-bg); }
      #${ROOT} .st-mc-trigger[data-unread="true"] { color: var(--st-color-white); background: var(--st-color-success-steam); }
      #${ROOT} .st-mc-trigger[data-error="true"] { color: var(--st-color-white); background: var(--st-color-danger); }
      .st-mc-icon { display: inline-block; flex: 0 0 auto; width: 16px; height: 16px; background: currentColor; mask: url("${api.path.url("images/ui/message-center.svg")}") center / contain no-repeat; }
      #${ROOT} .st-mc-badge { position: absolute; right: 2px; top: -4px; min-width: 13px; padding: 0 2px; border-radius: 2px; color: var(--st-color-white); background: var(--st-color-success); font-size: 10px; line-height: 14px; }
      #${ROOT} .st-mc-badge[hidden] { display: none; }
      #${PANEL}, #${DIALOG} { padding: 0; border: 1px solid var(--st-color-black); border-radius: 2px; color: var(--st-color-white); background: var(--st-color-steam-message-surface); box-shadow: var(--st-shadow-panel-menu); font-size: 12px; text-align: left; overflow: hidden; }
      #${PANEL} { position: relative; margin: 0; width: 100%; }
      #${DIALOG} { width: 100%; height: 100%; margin: 0; display: flex; flex-direction: column; }
      #${PANEL}:focus, #${DIALOG}:focus { outline: none; }
      .st-mc-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 56px; padding: 0 16px; }
      .st-mc-head h2 { margin: 0; font-size: 16px; font-weight: 600; }
      .st-mc-list { min-height: 0; max-height: var(--st-mc-menu-list-height); overflow-y: auto; overscroll-behavior: contain; padding: 0 8px 8px; scrollbar-width: thin; }
      #${DIALOG} .st-mc-list { flex: 1; min-height: 0; max-height: none; }
      .st-mc-virtual-rows .st-mc-card { height: ${ROW_HEIGHT}px; margin: 0; padding-bottom: 2px; }
      .st-mc-virtual-rows .st-mc-open { height: 100%; min-height: 0; }
      .st-mc-virtual-rows .st-mc-title { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .st-mc-load-state { display: flex; justify-content: center; align-items: center; min-height: 32px; color: var(--st-color-text-muted); }
      .st-mc-card { position: relative; display: flex; align-items: stretch; margin: 0 0 2px; background: var(--st-color-surface-subtle); }
      .st-mc-card:hover, .st-mc-card:focus-within { background: var(--st-color-surface-subtle-hover); }
      .st-mc-open { display: grid; grid-template-columns: 40px minmax(0, 1fr); align-items: center; gap: 8px; width: 100%; min-width: 0; min-height: 72px; padding: 8px; border: 0; color: inherit; background: none; text-align: left; cursor: pointer; font: inherit; }
      .st-mc-thumb { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; color: var(--st-color-steam-blue); background: var(--st-color-surface-inset); }
      .st-mc-thumb .st-mc-icon { width: 24px; height: 24px; }
      .st-mc-copy { display: block; min-width: 0; padding-right: 8px; }
      .st-mc-meta { display: block; margin-bottom: 2px; color: var(--st-color-text-muted); font-size: 10px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      .st-mc-title { display: block; color: var(--st-color-text-primary); font-size: 13px; line-height: 18px; overflow-wrap: anywhere; }
      .st-mc-summary { display: block; margin-top: 2px; color: var(--st-color-text-muted); font-size: 11px; line-height: 16px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      .st-mc-dot { position: absolute; right: 8px; top: 12px; width: 6px; height: 6px; border-radius: 50%; background: var(--st-color-success); pointer-events: none; }
      .st-mc-dot[hidden] { display: none; }
      .st-mc-tools { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px 16px; }
      .st-mc-tools .st-mc-count { margin-left: auto; }
      .st-mc-tools [aria-pressed="true"] { color: var(--st-color-white); background: var(--st-color-steam-toolbar-button-bg); }
      .st-mc-count { color: var(--st-color-text-muted); font-size: 11px; }
      .st-mc-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 152px; padding: 24px; text-align: center; color: var(--st-color-text-muted); }
      .st-mc-empty .st-mc-icon { width: 32px; height: 32px; margin-bottom: 8px; }
      .st-mc-empty strong { color: var(--st-color-text-primary); font-size: 14px; font-weight: 400; }
      .st-mc-detail { flex: 1; min-height: 0; padding: 16px; overflow-y: auto; }
      .st-mc-detail h3 { font-size: 18px; line-height: 26px; margin: 8px 0; overflow-wrap: anywhere; }
      .st-mc-detail p { color: var(--st-color-text-secondary); line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
      .st-mc-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 24px; }
      .st-mc-error { margin: 0; padding: 0 16px; color: var(--st-color-danger-text); white-space: pre-wrap; }
      .st-mc-error:empty { display: none; }
      .st-mc-close { padding: 4px 8px; border: 0; color: var(--st-color-text-muted); background: none; font: inherit; font-size: 20px; cursor: pointer; }
      #${ROOT} button:focus-visible, #${PANEL} button:focus-visible, #${DIALOG} button:focus-visible { outline: 2px solid var(--st-color-steam-blue); outline-offset: -2px; }
      #${PANEL} [hidden], #${DIALOG} [hidden] { display: none; }
      `,
    ));

    const root = element("div"); root.id = ROOT;
    const trigger = button("", "toggle", "st-mc-trigger");
    trigger.title = "Steam Buff 消息"; trigger.setAttribute("aria-label", "Steam Buff 消息");
    trigger.setAttribute("aria-expanded", "false"); trigger.setAttribute("aria-haspopup", "dialog");
    trigger.appendChild(icon());
    const badge = element("span", "st-mc-badge"); badge.hidden = true; badge.setAttribute("aria-hidden", "true");
    trigger.appendChild(badge); root.appendChild(trigger);

    const panel = element("section"); panel.id = PANEL; panel.tabIndex = -1; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Steam Buff 消息中心");
    const popHead = element("header", "st-mc-head"); popHead.append(element("h2", "", "消息中心"), button("查看全部", "all"));
    const popList = element("div", "st-mc-list");
    const popError = element("p", "st-mc-error"); popError.setAttribute("role", "status");
    panel.append(popHead, popList, popError);

    const dialog = element("section"); dialog.id = DIALOG; dialog.tabIndex = -1; dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); dialog.setAttribute("aria-labelledby", `${DIALOG}Title`);
    const fullHead = element("header", "st-mc-head"), fullTitle = element("h2", "", "消息中心"); fullTitle.id = `${DIALOG}Title`;
    const close = button("×", "close", "st-mc-close"); close.setAttribute("aria-label", "关闭消息中心"); fullHead.append(fullTitle, close);
    const tools = element("div", "st-mc-tools"), all = button("全部", "filter-all"), unread = button("未读", "filter-unread"), fullRead = button("全部已读", "read-all");
    const fullCount = element("span", "st-mc-count");
    tools.append(all, unread, fullRead, fullCount);
    const fullList = element("div", "st-mc-list"), detail = element("article", "st-mc-detail"); detail.hidden = true;
    fullList.tabIndex = 0; fullList.setAttribute("aria-label", "消息列表");
    const fullTop = element("div"), fullBottom = element("div"), fullRowsHost = element("div", "st-mc-virtual-rows"), fullHint = element("div", "st-mc-load-state");
    fullTop.setAttribute("aria-hidden", "true"); fullBottom.setAttribute("aria-hidden", "true"); fullRowsHost.setAttribute("role", "list"); fullHint.setAttribute("role", "status");
    const fullError = element("p", "st-mc-error"); fullError.setAttribute("role", "status");
    dialog.append(fullHead, tools, fullList, detail, fullError);
    if (controls) controls.insertBefore(root, controls.firstChild);
    // 点击入口会让原生菜单失焦；保留悬停时的打开状态，让同次点击维持关闭语义。
    let pointerHadMenu = false;
    const host = nativeHost(trigger, style, (kind, reason) => {
      trigger.setAttribute("aria-expanded", "false");
      if (reason !== "blur") pointerHadMenu = false;
      if (kind === "full") onClose();
    }, (error, phase) => {
      reportFailure(error, phase, fullOpen ? fullError : popError);
      trigger.dataset.error = "true"; trigger.title = "消息窗口打开失败，请重试";
    });
    function isPopOpen() { return host.kind() === "menu"; }
    function layout() { host.layout(); }
    function status(container, title, description, retry = false) {
      const empty = element("div", "st-mc-empty");
      empty.append(icon(), element("strong", "", title), element("span", "", description));
      if (retry) empty.appendChild(button("重试", "retry"));
      container.replaceChildren(empty);
      layout();
    }
    status(popList, "正在加载", "正在读取消息…");

    function applyState(value) {
      if (!value || !Number.isSafeInteger(value.revision) || !Number.isSafeInteger(value.total) || !Number.isSafeInteger(value.unread)) throw new TypeError("消息状态格式无效");
      if (value.revision < 0 || value.unread < 0 || value.total < value.unread) throw new TypeError("消息数量无效");
      if (current && current.revision > value.revision) return false;
      current = value;
      badge.textContent = String(value.unread); badge.hidden = value.unread === 0;
      trigger.dataset.unread = String(value.unread > 0);
      trigger.setAttribute("aria-label", value.unread ? `Steam Buff 消息，${value.unread} 条未读` : "Steam Buff 消息，无未读消息");
      fullRead.disabled = busy || value.unread === 0;
      fullCount.textContent = `共 ${filter === "unread" ? value.unread : value.total} 条`;
      layout();
      return true;
    }

    function finish(rid, data) {
      const task = pending.get(rid); if (!task) return;
      pending.delete(rid); window.clearTimeout(task.timer);
      if (data.success === true) task.resolve(data.value);
      else { const error = new Error(data.error || "消息操作失败，请重试"); error.reported = data.reported === true; task.reject(error); }
    }
    function request(action, payload = {}) {
      if (stopped) return Promise.reject(new DOMException("消息中心已关闭", "AbortError"));
      return new Promise((resolve, reject) => {
        const rid = crypto.randomUUID();
        const timer = window.setTimeout(() => finish(rid, { success: false, error: "读取消息超时，请重试" }), 12000);
        pending.set(rid, { resolve, reject, timer });
        window.postMessage({ source: model.BRIDGE, side: "page", action, rid, ...payload }, window.location.origin);
      });
    }
    function reportFailure(error, phase, target) {
      if (stopped || error.name === "AbortError") return;
      if (!error.reported) log.error("message-operation-failed", "消息中心操作失败", { error, phase });
      target.textContent = error.message;
      layout();
    }
    async function openWindow(kind, content) {
      trigger.dataset.error = "false"; trigger.title = "Steam Buff 消息";
      try {
        await host.open(kind, content);
        if (stopped || host.kind() !== kind) return false;
        trigger.setAttribute("aria-expanded", String(kind === "menu"));
        if (current) applyState(current);
        return true;
      } catch (error) {
        reportFailure(error, "window-open", kind === "menu" ? popError : fullError);
        if (kind === "full" && host.kind() !== "full") onClose();
        if (!stopped && error.name !== "AbortError") { trigger.dataset.error = "true"; trigger.title = "消息窗口打开失败，请重试"; }
        return false;
      }
    }
    async function toggleMenu(event) {
      if (isPopOpen() || (event.detail > 0 && pointerHadMenu)) {
        pointerHadMenu = false; host.close("button"); trigger.focus({ preventScroll: true }); return;
      }
      pointerHadMenu = trigger.matches(":hover");
      if (await openWindow("menu", panel)) void loadPopover();
    }

    function renderRows(container, cache, rows, emptyText, relayout = true) {
      const ids = new Set(rows.map(message => message.id));
      for (const [id, card] of cache) if (!ids.has(id)) { card.node.remove(); cache.delete(id); }
      if (!rows.length) { cache.clear(); status(container, emptyText, "后续提醒会显示在这里"); return; }
      if (!cache.size) container.replaceChildren();
      let previousNode = null;
      for (const message of rows) {
        let card = cache.get(message.id);
        if (!card) {
          const node = element("div", "st-mc-card"), open = button("", "detail", "st-mc-open"); open.dataset.id = message.id;
          const thumb = element("span", "st-mc-thumb"); thumb.appendChild(icon());
          const copy = element("span", "st-mc-copy"), meta = element("span", "st-mc-meta", `${message.source} · ${date(message.createdAt)}`);
          copy.append(meta, element("span", "st-mc-title", message.title), element("span", "st-mc-summary", message.summary));
          const dot = element("span", "st-mc-dot"); dot.setAttribute("aria-hidden", "true"); open.append(thumb, copy); node.append(open, dot);
          card = { node, dot, open }; cache.set(message.id, card);
        }
        card.dot.hidden = message.readAt !== null;
        card.open.setAttribute("aria-label", `${message.readAt === null ? "未读：" : ""}${message.title}`);
        const expected = previousNode ? previousNode.nextSibling : container.firstChild;
        if (expected !== card.node) container.insertBefore(card.node, expected);
        previousNode = card.node;
      }
      if (relayout) layout();
    }

    async function loadPopover() {
      if (stopped || !isPopOpen()) return;
      if (popLoading) { popDirty = true; return; }
      popLoading = true; popDirty = false; popError.textContent = "";
      try {
        const page = await request("list", { filter: "all" });
        if (stopped || !isPopOpen()) return;
        if (!applyState(page.state)) { popDirty = true; return; }
        renderRows(popList, popCards, page.rows, "暂无消息");
      } catch (error) {
        reportFailure(error, "list", popError);
        if (!stopped && !popCards.size) status(popList, "消息加载失败", "请重试", true);
      } finally {
        popLoading = false;
        if (popDirty && !stopped && isPopOpen()) void loadPopover();
      }
    }

    function updateFullHint() {
      if (fullFailed) fullHint.replaceChildren(button("加载失败，点击重试", "more"));
      else fullHint.textContent = fullLoading ? "正在加载…" : (next ? "向下滚动加载更多" : "已显示全部消息");
      fullList.setAttribute("aria-busy", String(fullLoading));
    }

    function nearFullEnd() {
      return fullList.scrollTop + fullList.clientHeight >= fullRows.length * ROW_HEIGHT - (OVERSCAN + 1) * ROW_HEIGHT;
    }

    // 数据分批读取，DOM 只保留视口和两侧缓冲；滚动不调用原生窗口定位或完整运行时
    function renderVirtualRows() {
      if (stopped || !fullOpen || selection || !fullRows.length) return;
      if (fullRowsHost.parentNode !== fullList) fullList.replaceChildren(fullTop, fullRowsHost, fullBottom, fullHint);
      const start = Math.max(0, Math.min(fullRows.length - 1, Math.floor(fullList.scrollTop / ROW_HEIGHT) - OVERSCAN));
      const end = Math.min(fullRows.length, Math.ceil((fullList.scrollTop + fullList.clientHeight) / ROW_HEIGHT) + OVERSCAN);
      const range = `${generation}:${start}:${end}:${fullRows.length}:${fullRevision}`;
      if (range === fullWindow) return;
      fullWindow = range;
      const visible = fullRows.slice(start, end), active = fullList.ownerDocument.activeElement;
      const focused = active?.closest(".st-mc-open");
      if (focused && fullRowsHost.contains(focused) && !visible.some(row => row.id === focused.dataset.id)) fullList.focus({ preventScroll: true });
      fullTop.style.height = `${start * ROW_HEIGHT}px`; fullBottom.style.height = `${(fullRows.length - end) * ROW_HEIGHT}px`;
      renderRows(fullRowsHost, fullCards, visible, "", false);
      for (let index = start; index < end; index++) {
        const card = fullCards.get(fullRows[index].id);
        card.open.dataset.index = String(index);
        card.node.setAttribute("role", "listitem"); card.node.setAttribute("aria-posinset", String(index + 1));
        card.node.setAttribute("aria-setsize", String(filter === "unread" ? current.unread : current.total));
      }
    }

    function cancelFullFrame() {
      if (fullFrame && !fullFrameWindow.closed) fullFrameWindow.cancelAnimationFrame(fullFrame);
      fullFrame = 0; fullFrameWindow = null;
    }

    function queueFullRender() {
      if (stopped || !fullOpen || selection || fullFrame || !fullList.isConnected) return;
      fullFrameWindow = fullList.ownerDocument.defaultView;
      fullFrame = fullFrameWindow.requestAnimationFrame(() => {
        fullFrame = 0; fullFrameWindow = null;
        renderVirtualRows();
      });
    }

    function loadMore() {
      if (fullInitialized && next && !fullLoading && !fullFailed && nearFullEnd()) void loadFull(true);
    }

    function focusFullRow(index) {
      if (stopped || !fullOpen || selection || index < 0 || index >= fullRows.length) return;
      const top = index * ROW_HEIGHT;
      if (top < fullList.scrollTop) fullList.scrollTop = top;
      else if (top + ROW_HEIGHT > fullList.scrollTop + fullList.clientHeight) fullList.scrollTop = top + ROW_HEIGHT - fullList.clientHeight;
      renderVirtualRows(); fullCards.get(fullRows[index].id).open.focus({ preventScroll: true });
    }

    // Tab 与方向键按数据索引跨越虚拟窗口；到达缓存末尾时仅补下一批，保留自然的首尾焦点出口
    async function onFullKey(event) {
      const target = event.target.closest(".st-mc-open");
      if (!target || !fullRowsHost.contains(target) || !["Tab", "ArrowDown", "ArrowUp", "Home"].includes(event.key)) return;
      const index = Number(target.dataset.index), backwards = event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey);
      const destination = event.key === "Home" ? 0 : index + (backwards ? -1 : 1);
      if (destination < 0 || (destination >= fullRows.length && !next)) return;
      event.preventDefault();
      if (destination >= fullRows.length) {
        const token = generation;
        await loadFull(true);
        if (token !== generation) return;
      }
      focusFullRow(destination);
    }

    async function loadFull(append = false) {
      if (stopped || !fullOpen || selection) return;
      if (fullLoading) { if (!append) fullDirty = true; return; }
      if (append && (!fullInitialized || !next)) return;
      const token = generation;
      const cursor = append ? next : null;
      fullLoading = true; fullDirty = false; fullFailed = false; fullError.textContent = ""; updateFullHint();
      all.setAttribute("aria-pressed", String(filter === "all")); unread.setAttribute("aria-pressed", String(filter === "unread"));
      try {
        const page = await request("list", { filter, before: cursor });
        if (stopped || !fullOpen || selection || token !== generation) return;
        if (!applyState(page.state)) { fullDirty = true; return; }
        if (append && fullRevision !== page.state.revision) { showList(); return; }
        if (!append) { fullRows = []; fullIds.clear(); fullList.scrollTop = 0; }
        for (const row of page.rows) if (!fullIds.has(row.id)) { fullIds.add(row.id); fullRows.push(row); }
        next = page.next; fullRevision = page.state.revision; fullInitialized = true;
        if (fullRows.length) renderVirtualRows();
        else { fullCards.clear(); status(fullList, filter === "unread" ? "暂无未读消息" : "暂无消息", "后续提醒会显示在这里"); }
      } catch (error) {
        if (stopped || token !== generation || !fullOpen || selection) return;
        fullFailed = true;
        reportFailure(error, "list", fullError);
        if (!fullRows.length) status(fullList, "消息加载失败", "请重试", true);
      } finally {
        fullLoading = false; updateFullHint();
        if (fullDirty && !stopped && fullOpen && !selection) void loadFull();
        else if (token === generation && !fullFailed) loadMore();
      }
    }

    function showList(reset = false) {
      generation++; cancelFullFrame(); selection = null; detail.hidden = true; fullList.hidden = false; tools.hidden = false;
      if (reset) { filter = "all"; fullRows = []; fullIds.clear(); fullCards.clear(); }
      fullInitialized = false;
      fullTitle.textContent = "消息中心";
      if (!fullRows.length) status(fullList, "正在加载", "正在读取消息…");
      fullResize.observe(fullList);
      void loadFull();
    }
    async function openAll() {
      fullOpen = true;
      if (await openWindow("full", dialog)) showList(true);
    }
    function renderDetail(message) {
      detailActions.clear();
      detail.replaceChildren();
      detail.append(button("返回消息列表", "back"), element("h3", "", message.title), element("span", "st-mc-count", `${message.source} · ${date(message.createdAt)}`));
      if (message.summary) detail.appendChild(element("p", "", message.summary));
      if (message.body) detail.appendChild(element("p", "", message.body));
      const actions = element("div", "st-mc-actions");
      for (const action of message.actions) {
        const item = button(action.label, "custom"); item.dataset.id = action.id;
        const key = JSON.stringify([message.source, message.type, action.id]);
        detailActions.set(key, item);
        item.disabled = !actionHandlers.has(key);
        if (item.disabled) item.title = "当前版本未接入此操作";
        actions.appendChild(item);
      }
      const remove = button("删除消息", "delete"); remove.dataset.id = message.id; actions.appendChild(remove);
      detail.appendChild(actions);
      layout();
    }
    async function openDetail(id) {
      fullOpen = true;
      const token = ++generation; selection = id;
      cancelFullFrame(); fullResize.disconnect();
      detail.hidden = false; fullList.hidden = true; tools.hidden = true; fullTitle.textContent = "消息详情";
      fullError.textContent = ""; status(detail, "正在加载", "正在读取消息…");
      try {
        if (!await openWindow("full", dialog) || token !== generation) return;
        const value = await request("get", { id });
        if (stopped || token !== generation || !fullOpen) return;
        if (!value.message) { status(detail, "消息已删除", "这条消息已经不存在"); detail.appendChild(button("返回消息列表", "back")); return; }
        renderDetail(value.message);
        if (value.message.readAt === null) {
          const changed = await request("read", { id });
          if (!stopped) applyState(changed.state);
        }
      } catch (error) { reportFailure(error, "get", fullError); }
    }

    function onMessage(event) {
      const data = event.data;
      if (data === "window_moved" || data === "window_resized") { layout(); return; }
      if (stopped || event.source !== window || event.origin !== window.location.origin || data?.source !== model.BRIDGE || data.side !== "content") return;
      if (data.action !== "changed") { finish(data.rid, data); return; }
      if (current && data.state?.revision <= current.revision) return;
      try {
        if (!applyState(data.state)) return;
        if (isPopOpen()) void loadPopover();
        if (fullOpen && !selection) showList();
        if (selection && data.state.change?.action === "delete" && data.state.change.id === selection) showList();
      } catch (error) { reportFailure(error, "state", fullOpen ? fullError : popError); }
    }

    async function onClick(event) {
      const target = event.target.closest("button[data-action]");
      if (!target || target.disabled || busy) return;
      const action = target.dataset.action;
      if (action === "all") { await openAll(); return; }
      if (action === "close") { host.close("button", true); return; }
      if (action === "detail") { await openDetail(target.dataset.id); return; }
      if (action === "back") { showList(); return; }
      if (action === "retry") { if (fullOpen) showList(); else void loadPopover(); return; }
      if (action === "more") { await loadFull(true); return; }
      if (action.startsWith("filter-")) { filter = action === "filter-unread" ? "unread" : "all"; fullRows = []; fullIds.clear(); fullCards.clear(); showList(); return; }
      busy = true; target.disabled = true;
      const errorTarget = fullOpen ? fullError : popError; errorTarget.textContent = "";
      try {
        if (action === "read-all" || action === "delete") {
          const changed = await request(action, { id: target.dataset.id });
          if (stopped) return;
          applyState(changed.state);
          if (isPopOpen()) void loadPopover();
          if (fullOpen) showList();
        } else if (action === "custom" && selection) {
          const value = await request("get", { id: selection });
          if (stopped) return;
          if (!value.message) throw new Error("这条消息已删除，请返回消息列表");
          const handler = actionHandlers.get(JSON.stringify([value.message.source, value.message.type, target.dataset.id]));
          if (!handler) throw new Error("当前版本尚未接入此消息操作");
          await handler(value.message);
        }
      } catch (error) { reportFailure(error, action, errorTarget); }
      finally { busy = false; if (!stopped) { target.disabled = false; if (current) applyState(current); } }
    }

    function onClose() { fullOpen = false; generation++; selection = null; cancelFullFrame(); fullResize.disconnect(); }
    // 首次挂载不依赖整轮 runtime 重试；等待任务只查顶栏，成功后立即注销。
    function waitForMount() {
      if (mountWaiting) return;
      mountWaiting = true; mountWaitAt = performance.now();
      log.debug("message-entry-waiting", "消息入口等待顶栏就绪");
      window.STScheduler.register(MOUNT_TASK, reattach,
        () => !stopped && !document.hidden && !root.isConnected && api.ctx.isMainUi() === true,
        { intervalMs: 1000 });
    }
    function stopMountWait() {
      if (!mountWaiting) return;
      mountWaiting = false; window.STScheduler.unregister(MOUNT_TASK);
    }
    function reattach() {
      if (stopped || document.hidden || api.ctx.isMainUi() !== true) return;
      if (!root.isConnected) {
        const nextControls = document.querySelector(CONTROLS);
        if (!nextControls) { waitForMount(); return; }
        controls = nextControls;
        controls.insertBefore(root, controls.firstChild);
      }
      if (mountWaiting) {
        log.debug("message-entry-ready", "消息入口已挂载到顶栏", { durationMs: Math.round(performance.now() - mountWaitAt) });
        stopMountWait();
      }
      const parent = controls.parentElement;
      if (observedControls === controls && observedParent === parent) return;
      observer.disconnect();
      observer.observe(controls, { childList: true });
      observer.observe(parent, { childList: true });
      observedControls = controls; observedParent = parent;
    }
    const observer = new MutationObserver(records => {
      if (!records.some(record =>
        [...record.removedNodes].some(node => node === root || node === controls) ||
        (record.target === observedParent && [...record.addedNodes].some(node => node.nodeType === 1 && node.matches(CONTROLS)))
      )) return;
      reattach();
    });
    function onVisibility() {
      if (document.hidden) { observer.disconnect(); observedControls = null; observedParent = null; }
      else reattach();
    }
    function onResize() { layout(); }
    function onTriggerEnter() { pointerHadMenu = isPopOpen(); }
    function onTriggerLeave() { pointerHadMenu = false; }

    const fullResize = new ResizeObserver(queueFullRender);
    fullList.addEventListener("scroll", queueFullRender, { passive: true });
    fullList.addEventListener("scrollend", loadMore); fullList.addEventListener("keydown", onFullKey);
    window.addEventListener("message", onMessage);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", stop);
    trigger.addEventListener("click", toggleMenu); trigger.addEventListener("pointerenter", onTriggerEnter); trigger.addEventListener("pointerleave", onTriggerLeave);
    panel.addEventListener("click", onClick); dialog.addEventListener("click", onClick);
    reattach();
    const route = api.contextRouter.subscribe(reattach);
    void (async () => {
      try { const value = await request("summary"); if (!stopped) applyState(value.state); }
      catch (error) { reportFailure(error, "summary", popError); }
    })();

    /**
     * 注册 source/type/id 精确匹配的消息动作，handler 接收已存储的完整消息。
     * 返回 dispose 句柄；注册和释放同步更新当前详情按钮。重复注册或参数无效时抛错。
     * 消息中只有标识，不能指定任意函数或脚本。
     */
    function registerAction(source, type, id, handler) {
      model.id(source); model.id(type); model.id(id);
      if (typeof handler !== "function") throw new TypeError("消息处理器无效");
      const key = JSON.stringify([source, type, id]);
      if (actionHandlers.has(key)) throw new Error("消息操作已经注册");
      actionHandlers.set(key, handler);
      const activeButton = detailActions.get(key);
      if (activeButton) { activeButton.disabled = false; activeButton.removeAttribute("title"); }
      return Object.freeze({ dispose() {
        if (actionHandlers.get(key) !== handler) return;
        actionHandlers.delete(key);
        const item = detailActions.get(key);
        if (item) { item.disabled = true; item.title = "当前版本未接入此操作"; }
      } });
    }
    function stop() {
      if (stopped) return;
      stopped = true; generation++; observer.disconnect(); route.dispose();
      cancelFullFrame(); fullResize.disconnect();
      fullList.removeEventListener("scroll", queueFullRender); fullList.removeEventListener("scrollend", loadMore); fullList.removeEventListener("keydown", onFullKey);
      stopMountWait();
      host.stop();
      window.removeEventListener("message", onMessage); window.removeEventListener("resize", onResize);
      window.removeEventListener("pagehide", stop);
      document.removeEventListener("visibilitychange", onVisibility);
      trigger.removeEventListener("click", toggleMenu); trigger.removeEventListener("pointerenter", onTriggerEnter); trigger.removeEventListener("pointerleave", onTriggerLeave);
      panel.removeEventListener("click", onClick); dialog.removeEventListener("click", onClick);
      for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new DOMException("消息中心已关闭", "AbortError")); }
      pending.clear(); actionHandlers.clear(); detailActions.clear(); root.remove(); panel.remove(); dialog.remove(); style.remove();
      if (api.messageCenter?.stop === stop) delete api.messageCenter;
    }
    // open() 打开完整列表；stop() 幂等释放当前 UI、订阅和请求，不删除已存储消息。
    api.messageCenter = Object.freeze({ open: openAll, registerAction, stop });
    return { started: true, stop };
  }

  api.reg.addEntry(model.FEATURE, "ui.js", create);
})();
