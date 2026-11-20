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
  const name = "Steam Buff AI";
  const users = new Set();
  let popup = null;

  function geometry() {
    const width = Math.max(320, Math.min(700, innerWidth - 36));
    const height = Math.max(340, Math.min(670, innerHeight - 48));
    return { x: Math.round((innerWidth - width) / 2), y: Math.round((innerHeight - height) / 2), width, height };
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
    const view = window.STAIChatLauncher.frame(document, api.path.url("ai/chat.html"), appId);
    const exit = document.createElement("button");
    exit.type = "button";
    exit.setAttribute("aria-label", window.STI18n.text("common_close", "关闭"));
    exit.textContent = "×";
    const close = () => popup.close("close", true);
    exit.addEventListener("click", close);
    target.append(exit, view);
    let unbind;
    popup = api.nativeWindow.create({
      id: "SteamBuffAIChat", trigger, log, follow: false,
      onClosed() {
        unbind?.();
        if (trigger.isConnected) trigger.focus({ preventScroll: true });
      },
      reportFailure(error) {
        log.error("chat-window-failed", "Steam AI 对话窗口操作失败", { error });
      },
      onEscape: () => false,
      css: () => "html,body,#popup_target,.st-ai-chat-native{height:100%;margin:0;overflow:hidden;background:var(--st-dialog-surface)}.st-ai-chat-native{display:flex;flex-direction:column}.st-ai-chat-native>button{align-self:flex-end;border:0;background:none;padding:4px 12px;font:18px/1.3 system-ui;color:var(--st-color-text-primary);cursor:pointer}.st-ai-chat-native iframe{width:100%;min-height:0;flex:1;border:0}",
      geometry,
      params() {
        const { x, y, width, height } = geometry();
        return { title: name, modal: false, dimensions: { width, height, left: screenX + x, top: screenY + y } };
      },
    });
    return popup.open("chat", target, () => { unbind = window.STAIChatLauncher.bindClose(view, close); });
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
    const entry = window.STAIChatLauncher.mount({
      doc, parent, variant,
      open: button => {
        void Promise.resolve().then(() => show(button)).catch(error => failOpen(error, button)).catch(error => {
          log.error("chat-feedback-failed", "Steam AI 对话提示失败", { error });
        });
      },
    });
    window.STTheme.applyCssVariables(entry.host);
    if (before) before.before(entry.host);
    return entry;
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
        entry = launch(doc, wrapper, "friends", list);
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
