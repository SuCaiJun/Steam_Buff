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
    for (const variant of ["main", "friends"]) {
      api.reg.addEntry("ai-chat-" + variant, entryPath, () => api.aiChat.enable(variant));
    }
  }
  if (api.aiChat?.enable) { register(); return; }
  const log = window.STLoggerFactory.createLogger("steam", "ai-chat");
  const name = window.STConfig.aiChatName;
  const layout = window.STConfig.aiChatWindowLayout;
  const users = new Set();
  const MIN_WIDTH = 400;
  const MIN_HEIGHT = 400;
  const SIZE_KEY = "st.ai.chat.window-size";
  let popup = null;

  function geometry() {
    const saved = /^(\d+)x(\d+)$/.exec(window.localStorage.getItem(SIZE_KEY) ?? "");
    const width = Math.min(screen.availWidth, Math.max(MIN_WIDTH, Number(saved?.[1]) || Math.min(740, innerWidth - 36)));
    const height = Math.min(screen.availHeight, Math.max(MIN_HEIGHT, Number(saved?.[2]) || Math.min(650, innerHeight - 48)));
    return { x: Math.round((innerWidth - width) / 2), y: Math.round((innerHeight - height) / 2), width, height };
  }

  function titleBar(doc, close) {
    const bar = doc.createElement("header");
    bar.className = "st-ai-chat-titlebar";
    const brand = doc.createElement("div");
    brand.className = "st-ai-chat-window-brand";
    brand.dataset.stNativeDrag = "";
    const avatar = doc.createElement("img");
    avatar.alt = "";
    avatar.draggable = false;
    avatar.src = api.path.url("images/ai/avatar.png");
    const heading = doc.createElement("h1");
    heading.textContent = name;
    brand.append(avatar, heading);
    const drag = doc.createElement("div");
    drag.className = "st-ai-chat-window-drag";
    drag.dataset.stNativeDrag = "";
    const controls = doc.createElement("div");
    controls.className = "st-ai-chat-window-controls";
    const native = () => bar.ownerDocument.defaultView.SteamClient.Window;
    const actions = [
      ["minimize", "ai_chat_window_minimize", "最小化", () => native().Minimize()],
      ["maximize", "ai_chat_window_maximize_restore", "最大化或还原", () => native().ToggleMaximize()],
      ["close", "common_close", "关闭", close],
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
    const { titleHeight, brandWidth, controlsWidth, toolSlotWidth, minDragWidth, sessionWidth } = layout;
    return `
      html, body, #popup_target, .st-ai-chat-native { height: 100%; margin: 0; overflow: hidden; }
      .st-ai-chat-native { position: relative; display: flex; flex-direction: column; color: var(--st-dialog-text-color);
        background: var(--st-dialog-surface); font: 14px/1.4 system-ui, sans-serif; }
      .st-ai-chat-titlebar { position: absolute; inset: 0 0 auto; height: ${titleHeight}px; z-index: 1;
        display: grid; align-items: center; user-select: none; pointer-events: none; -webkit-app-region: no-drag;
        grid-template-columns: ${brandWidth}px min(${sessionWidth}px, calc(100% - ${brandWidth + minDragWidth + toolSlotWidth + controlsWidth}px)) 1fr ${toolSlotWidth}px ${controlsWidth}px; }
      .st-ai-chat-window-brand, .st-ai-chat-window-drag {
        align-self: stretch; pointer-events: auto; touch-action: none; -webkit-app-region: no-drag; }
      .st-ai-chat-window-brand { display: flex; align-items: center; gap: 7px; padding-inline: 12px 6px; }
      .st-ai-chat-window-brand img { width: 20px; height: 20px; border-radius: 4px; }
      .st-ai-chat-window-brand h1 { margin: 0; color: var(--st-dialog-title-color); font-size: 14px; font-weight: 650; white-space: nowrap; }
      .st-ai-chat-window-drag { grid-column: 3; }
      .st-ai-chat-window-controls { grid-column: 5; display: flex; pointer-events: auto; -webkit-app-region: no-drag; }
      .st-ai-chat-window-controls button { display: grid; place-items: center; width: 36px; height: 32px;
        background: transparent; color: var(--st-dialog-muted-color); border: 0;
        border-radius: var(--st-control-radius); cursor: pointer; }
      .st-ai-chat-window-controls button:hover { background: var(--st-dialog-secondary-bg-hover); color: var(--st-dialog-title-color); }
      .st-ai-chat-window-controls button:focus-visible { outline: 2px solid var(--st-color-primary); outline-offset: -2px; }
      .st-ai-chat-window-controls button::before { content: ""; box-sizing: border-box; }
      .st-ai-chat-window-minimize::before { width: 13px; height: 1px; background: currentColor; }
      .st-ai-chat-window-maximize::before { width: 13px; height: 10px; border: 1px solid currentColor; }
      .st-ai-chat-window-close::before { width: 16px; height: 16px; background: currentColor;
        mask: url("${api.path.url("images/tabler/x.svg")}") center / contain no-repeat; }
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
    const close = () => popup.close();
    target.append(titleBar(document, close), view);
    let unbind, unbindAvatar;
    popup = api.nativeWindow.create({
      id: "SteamBuffAIChat", trigger, log, follow: false, standalone: true,
      resizable: true, draggable: true,
      canResize: () => true,
      canStartGesture: async win => !await win.SteamClient.Window.IsWindowMaximized(),
      onBoundsChanged({ width, height }) { window.localStorage.setItem(SIZE_KEY, `${width}x${height}`); },
      onClosed() {
        unbind?.();
        unbindAvatar?.();
      },
      reportFailure(error) {
        log.error("chat-window-failed", "Steam AI 对话窗口操作失败", { error });
      },
      onEscape() {
        popup.close("escape");
        return true;
      },
      css: windowCss,
      geometry,
      params() {
        const { x, y, width, height } = geometry();
        return { title: name, modal: false, minWidth: MIN_WIDTH, minHeight: MIN_HEIGHT,
          dimensions: { width, height, left: screenX + x, top: screenY + y } };
      },
    });
    return popup.open("chat", target, () => {
      unbind = window.STAIChatLauncher.bindClose(view, escapeAt => { if (!popup.cancelGesture(escapeAt)) close(); });
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
    const preferences = variant === "friends" ? friendsGroupState(doc) : mainAvatar(doc);
    const entry = window.STAIChatLauncher.mount({
      doc, parent, before, variant,
      avatarSrc: api.path.url("images/ai/avatar.png"),
      ...preferences,
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

  function friendsGroupState(doc) {
    const key = "st.ai.chat.friends-group-open";
    const storage = doc.defaultView.localStorage;
    return {
      initialGroupOpen: storage.getItem(key) !== "false",
      saveGroupOpen(open) {
        try { storage.setItem(key, String(open)); }
        catch (error) {
          log.error("chat-friends-group-save-failed", "无法保存 AI 分组展开状态", { error });
          throw error;
        }
      },
    };
  }

  /** 由 Steam registry 按开关启动，最后一个入口关闭时释放共享窗口 */
  function start(variant) {
    if (variant === "main" && !document.getElementById("popup_target")) throw new Error("Steam 主窗口挂载点不可用");
    const dispose = variant === "friends"
      ? api.friendsList.register("ai-chat-friends", ({ doc, list, content }) => ({
        stop: launch(doc, list, "friends", content).dispose,
      }))
      : launch(document, document.body, "main").dispose;
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

  function enable(variant) {
    const id = "ai-chat-" + variant;
    const meta = { domain: "steam", id, entry: entryPath, mode: "ui" };
    let stopped = false, mounted = null;
    function stop() {
      if (stopped) return;
      stopped = true;
      mounted?.stop();
      mounted = null;
    }

    // 注册器同步取得 stop。异步任务只持有自己的入口，旧任务不会释放新一轮资源
    const ready = Promise.resolve().then(async () => {
      if (stopped) return false;
      api.runtimeKernel?.markFeature({ ...meta, status: "waiting", reason: "loading-dependencies" });
      await api.reg.loadScript("ai/chat-launcher.js");
      if (!stopped && variant === "friends") await api.reg.loadScript("steam/features/friends-list/ui.js");
      if (stopped || api.ctx.settingValue(id, false) !== true) return false;
      mounted = start(variant);
      api.runtimeKernel?.markFeature({ ...meta, status: "started" });
      return true;
    }).catch(error => {
      if (!stopped) {
        stop();
        api.runtimeKernel?.markFeature({ ...meta, status: "failed", reason: "entry-start-failed", error });
        log.error("chat-entry-start-failed", "Steam AI 入口启动失败", { featureId: id, error });
      }
      return false;
    });
    return { started: true, stop, ready };
  }

  api.aiChat = Object.freeze({ start, enable });
  register();
})();
