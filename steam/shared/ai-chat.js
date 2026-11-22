/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 主窗口和好友入口共用的 AI 对话窗口
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";
  const api = window.SteamBuff;
  const entryPath = "steam/shared/ai-chat.js";
  function register() {
    for (const variant of ["main", "friends"]) api.reg.addEntry("ai-chat-" + variant, entryPath, async () => {
      await api.reg.loadScript("ai/chat-launcher.js");
      if (api.ctx.settingValue("ai-chat-" + variant, false) !== true) return { started: false, reason: "settings-disabled" };
      return api.aiChat.start(variant);
    });
  }
  if (api.aiChat) { register(); return; }
  const log = window.STLoggerFactory.createLogger("steam", "ai-chat");
  const name = window.STConfig.aiChatName;
  const layout = window.STConfig.aiChatWindowLayout;
  const users = new Set();
  const MIN_WIDTH = 400;
  const MIN_HEIGHT = 400;
  let popup = null;

  function geometry() {
    const width = Math.max(MIN_WIDTH, Math.min(740, innerWidth - 36));
    const height = Math.max(MIN_HEIGHT, Math.min(650, innerHeight - 48));
    return { x: Math.round((innerWidth - width) / 2), y: Math.round((innerHeight - height) / 2), width, height };
  }

  function titleBar(doc, close) {
    const bar = doc.createElement("header");
    bar.className = "st-ai-chat-titlebar";
    const brand = doc.createElement("div");
    brand.className = "st-ai-chat-window-brand";
    const avatar = doc.createElement("img");
    avatar.alt = "";
    avatar.draggable = false;
    avatar.src = api.path.url("images/ai/avatar.png");
    const heading = doc.createElement("h1");
    heading.textContent = name;
    brand.append(avatar, heading);
    const drag = doc.createElement("div");
    drag.className = "st-ai-chat-window-drag";
    const controls = doc.createElement("div");
    controls.className = "st-ai-chat-window-controls";
    const native = () => bar.ownerDocument.defaultView.SteamClient.Window;
    const actions = [
      ["square-minus", "ai_chat_window_minimize", "最小化", () => native().Minimize()],
      ["arrows-diagonal", "ai_chat_window_maximize_restore", "最大化或还原", () => native().ToggleMaximize()],
      ["x", "common_close", "关闭", close],
    ];
    for (const [icon, key, fallback, action] of actions) {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "st-ai-chat-window-" + icon;
      button.title = window.STI18n.text(key, fallback);
      button.setAttribute("aria-label", button.title);
      button.addEventListener("click", action);
      controls.append(button);
    }
    bar.append(brand, drag, controls);
    return bar;
  }

  function windowCss() {
    const icon = file => `url("${api.path.url("images/tabler/" + file + ".svg")}")`;
    const { titleHeight, brandWidth, controlsWidth, minDragWidth, sessionWidth } = layout;
    return `
      html, body, #popup_target, .st-ai-chat-native { height: 100%; margin: 0; overflow: hidden; }
      .st-ai-chat-native { position: relative; display: flex; flex-direction: column; color: var(--st-dialog-text-color);
        background: var(--st-dialog-surface); font: 14px/1.4 system-ui, sans-serif; }
      .st-ai-chat-titlebar { position: absolute; inset: 0 0 auto; height: ${titleHeight}px; z-index: 1;
        display: grid; align-items: center; user-select: none; pointer-events: none; -webkit-app-region: no-drag;
        grid-template-columns: ${brandWidth}px min(${sessionWidth}px, calc(100% - ${brandWidth + minDragWidth + controlsWidth}px)) 1fr ${controlsWidth}px; }
      .st-ai-chat-window-brand, .st-ai-chat-window-drag {
        align-self: stretch; pointer-events: auto; -webkit-app-region: drag; }
      .st-ai-chat-window-brand { display: flex; align-items: center; gap: 7px; padding-inline: 12px 6px; }
      .st-ai-chat-window-brand img { width: 20px; height: 20px; border-radius: 4px; }
      .st-ai-chat-window-brand h1 { margin: 0; color: var(--st-dialog-title-color); font-size: 14px; font-weight: 650; white-space: nowrap; }
      .st-ai-chat-window-drag { grid-column: 3; }
      .st-ai-chat-window-controls { grid-column: 4; display: flex; pointer-events: auto; -webkit-app-region: no-drag; }
      .st-ai-chat-window-controls button { display: grid; place-items: center; width: 36px; height: 32px;
        background: transparent; color: var(--st-dialog-muted-color); border: 0;
        border-radius: var(--st-control-radius); cursor: pointer; }
      .st-ai-chat-window-controls button:hover { background: var(--st-dialog-secondary-bg-hover); color: var(--st-dialog-title-color); }
      .st-ai-chat-window-controls button:focus-visible { outline: 2px solid var(--st-color-primary); outline-offset: -2px; }
      .st-ai-chat-window-controls button::before { content: ""; width: 16px; height: 16px;
        background: currentColor; mask: var(--st-ai-window-icon) center / contain no-repeat; }
      .st-ai-chat-window-square-minus { --st-ai-window-icon: ${icon("square-minus")}; }
      .st-ai-chat-window-arrows-diagonal { --st-ai-window-icon: ${icon("arrows-diagonal")}; }
      .st-ai-chat-window-x { --st-ai-window-icon: ${icon("x")}; }
      .st-ai-chat-native iframe { display: block; flex: 1; width: 100%; min-height: 0; border: 0; }
    `;
  }

  function show(trigger) {
    if (popup?.kind()) {
      return popup.open("chat");
    }
    popup?.stop();
    const target = document.createElement("div");
    target.className = "st-ai-chat-native";
    target.tabIndex = -1;
    const appId = Number(/^\/library\/app\/(\d+)$/.exec(api.ctx.route())?.[1]);
    const url = new URL(api.path.url("ai/chat.html"));
    url.searchParams.set("layout", "desktop");
    url.searchParams.set("titlebar", "hosted");
    const view = window.STAIChatLauncher.frame(document, url, appId);
    const close = () => popup.close("close", true);
    target.append(titleBar(document, close), view);
    let unbind, unbindAvatar;
    popup = api.nativeWindow.create({
      id: "SteamBuffAIChat", trigger, log, follow: false, standalone: true,
      onClosed() {
        unbind?.();
        unbindAvatar?.();
        if (trigger.isConnected) trigger.focus({ preventScroll: true });
      },
      reportFailure(error) {
        log.error("chat-window-failed", "Steam AI 对话窗口操作失败", { error });
      },
      onEscape: () => false,
      css: windowCss,
      geometry,
      params() {
        const { x, y, width, height } = geometry();
        return { title: name, modal: false, minWidth: MIN_WIDTH, minHeight: MIN_HEIGHT,
          dimensions: { width, height, left: screenX + x, top: screenY + y } };
      },
    });
    return popup.open("chat", target, () => {
      unbind = window.STAIChatLauncher.bindClose(view, close);
      unbindAvatar = window.STAIChatLauncher.bindAvatar(view,
        () => window.opener?.g_FriendsUIApp?.FriendStore?.self?.persona?.avatar_url_medium);
    });
  }

  function failOpen(error, trigger) {
    if (error.name === "AbortError") return;
    log.error("chat-open-failed", "Steam AI 对话打开失败", { error });
    if (!trigger.isConnected) return;
    return window.STFeedback.show(trigger.getRootNode(), {
      message: window.STI18n.text("ai_chat_open_failed", "无法打开 Steam AI 对话窗口，请重试。"),
      focus: trigger,
    });
  }

  function launch(doc, parent, variant, before) {
    const avatar = variant === "main" ? mainAvatar(doc) : {};
    const entry = window.STAIChatLauncher.mount({
      doc, parent, before, variant,
      avatarSrc: api.path.url("images/ai/avatar.png"),
      ...avatar,
      open: button => {
        void Promise.resolve().then(() => show(button)).catch(error => failOpen(error, button)).catch(error => {
          log.error("chat-feedback-failed", "Steam AI 对话提示失败", { error });
        });
      },
    });
    window.STTheme.applyCssVariables(entry.host);
    return entry;
  }

  function mainAvatar(doc) {
    const key = "st.ai.chat.main-top";
    const storage = doc.defaultView.localStorage;
    const value = storage.getItem(key);
    return {
      initialTop: value === null ? null : Number(value),
      saveTop(top) { storage.setItem(key, String(top)); },
    };
  }

  function mountFriends() {
    const manager = window.opener?.g_PopupManager;
    if (typeof manager?.GetPopups !== "function" || typeof manager.AddPopupCreatedCallback !== "function")
      throw new Error("Steam 好友窗口管理器不可用");
    const windows = new Map();
    function inspect(item) {
      if (!/^friendslist_uid\d+$/.test(item.GetName()) || windows.has(item.window)) return;
      const win = item.window;
      if (!win || win.closed || win.opener !== window.opener || win.location.origin !== window.location.origin) return;
      const doc = win.document;
      let entry = null, observer = null, timer = null;
      const stopWaiting = () => {
        observer?.disconnect();
        if (timer !== null) clearTimeout(timer);
        observer = timer = null;
      };
      const detach = () => {
        stopWaiting();
        entry?.dispose();
        win.removeEventListener("DOMContentLoaded", ready);
        win.removeEventListener("pagehide", detach);
        windows.delete(win);
      };
      function failed(error) {
        detach();
        log.error("chat-friends-mount-failed", "好友列表 AI 入口挂载失败", { error });
      }
      function mount(root) {
        if (!root.classList.contains("popup_chat_frame")) return false;
        const title = root.querySelector(".friendListHeaderContainer.titleBarContainer");
        const wrapper = title?.nextElementSibling;
        if (!wrapper?.matches(".FriendsListContent")) return false;
        const list = wrapper.querySelector(":scope > .friendlistListContainer");
        if (!list) return false;
        const backdrop = win.getComputedStyle(list).background;
        // 原生列表顶部的渐隐层也在滚动容器之前，助手行应位于渐隐层上方。
        entry = launch(doc, wrapper, "friends", wrapper.firstChild);
        entry.host.style.background = backdrop;
        entry.host.style.backgroundAttachment = "fixed";
        const style = doc.createElement("style");
        style.textContent = ".FriendsListContent > .st-ai-chat-friends ~ .friendlistListContainer{background-attachment:fixed}";
        // 两块背景按同一视口坐标绘制。卸载助手行时，该样式随宿主一同移除。
        entry.host.append(style);
        stopWaiting();
        return true;
      }
      function begin() {
        const root = doc.getElementById("popup_target");
        if (!root) return;
        if (mount(root)) return;
        observer = new win.MutationObserver(() => {
          try { mount(root); }
          catch (error) { failed(error); }
        });
        // PopupManager 先登记窗口，Steam 随后才给根节点补 class 并挂载 React 内容
        observer.observe(root, { attributes: true, attributeFilter: ["class"], childList: true });
        timer = setTimeout(() => {
          stopWaiting();
          log.warn("chat-friends-position-unavailable", "好友列表 AI 入口挂载位置不可用", { phase: "friends-root" });
        }, 3000);
      }
      function ready() {
        try { begin(); }
        catch (error) { failed(error); }
      }
      windows.set(win, detach);
      win.addEventListener("pagehide", detach, { once: true });
      if (doc.getElementById("popup_target")) ready();
      else win.addEventListener("DOMContentLoaded", ready, { once: true });
    }
    const subscription = manager.AddPopupCreatedCallback(item => {
      try { inspect(item); }
      catch (error) { log.error("chat-friends-window-failed", "无法识别 Steam 好友窗口", { error }); }
    });
    try {
      for (const item of manager.GetPopups()) inspect(item);
    } catch (error) {
      subscription.Unregister();
      for (const dispose of windows.values()) dispose();
      throw error;
    }
    return () => {
      subscription.Unregister();
      for (const dispose of windows.values()) dispose();
    };
  }

  /** 由 Steam registry 按开关启动，最后一个入口关闭时释放共享窗口 */
  function start(variant) {
    if (variant === "main" && !document.getElementById("popup_target")) throw new Error("Steam 主窗口挂载点不可用");
    const dispose = variant === "friends" ? mountFriends() : launch(document, document.body, "main").dispose;
    users.add(variant);
    return { started: true, stop() {
      dispose();
      users.delete(variant);
      if (!users.size) {
        popup?.stop();
        popup = null;
      }
    } };
  }

  api.aiChat = Object.freeze({ start });
  register();
})();
