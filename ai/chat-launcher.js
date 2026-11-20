/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : AI 对话入口和隔离聊天框
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const title = "Steam Buff AI";

  /** 创建独立扩展页面，Steam 文档只持有 AppID 和 iframe 元素 */
  function frame(doc, url, appId) {
    const view = doc.createElement("iframe");
    const target = new URL(url);
    if (target.protocol !== "chrome-extension:") throw new TypeError("AI 对话页面地址无效");
    if (Number.isSafeInteger(appId) && appId > 0) target.searchParams.set("appId", String(appId));
    view.title = title;
    view.referrerPolicy = "no-referrer";
    view.src = target.href;
    return view;
  }

  /** 仅接受当前隔离对话框发出的关闭信号 */
  function bindClose(view, close) {
    const owner = view.ownerDocument.defaultView;
    const origin = "chrome-extension://" + new URL(view.src).host;
    const onMessage = event => {
      if (event.source === view.contentWindow && event.origin === origin && event.data?.type === "st-ai-chat-close") close();
    };
    owner.addEventListener("message", onMessage);
    return () => owner.removeEventListener("message", onMessage);
  }

  /** 挂载一个入口。提供 open 时由调用方拥有窗口，否则入口拥有网页面板 */
  function mount(options) {
    const { doc, parent, variant, url, appId, open } = options;
    const host = doc.createElement("div");
    host.className = "st-ai-chat-" + variant;
    const shadow = host.attachShadow({ mode: "open" });
    const css = doc.createElement("style");
    css.textContent = `
      :host{font:14px/1.4 system-ui,sans-serif;display:block}
      :host(.st-ai-chat-web),:host(.st-ai-chat-main){position:fixed;right:16px;bottom:16px;z-index:var(--st-z-index-sticky)}
      :host(.st-ai-chat-main){bottom:64px}
      :host(.st-ai-chat-friends){padding:4px 8px;flex:none}
      button{pointer-events:auto;cursor:pointer;font:inherit;color:var(--st-color-text-primary);background:var(--st-dialog-surface-raised);border:1px solid var(--st-dialog-border);border-radius:var(--st-control-radius);padding:7px 12px;}
      button:hover{background:var(--st-color-primary-surface-hover);border-color:var(--st-color-primary)}
      button:focus-visible{outline:2px solid var(--st-color-primary);outline-offset:2px}
      :host(.st-ai-chat-friends) button{width:100%;text-align:start}
      section{pointer-events:auto;position:absolute;inset-inline-end:0;bottom:calc(100% + 8px);display:flex;flex-direction:column;width:min(460px,calc(100vw - 32px));height:min(630px,calc(100dvh - 86px));border:1px solid var(--st-dialog-border);border-radius:var(--st-dialog-radius);background:var(--st-dialog-surface);box-shadow:var(--st-dialog-shadow);overflow:hidden}
      section[hidden]{display:none}
      .close{align-self:flex-end;background:none;border:0;padding:4px 12px}
      iframe{width:100%;min-height:0;flex:1;border:0}
    `;
    const button = doc.createElement("button");
    button.type = "button";
    button.textContent = title;
    button.setAttribute("aria-haspopup", "dialog");
    const closeLabel = root.STI18n.text("common_close", "关闭");
    let panel, unbind;
    function close() {
      if (!panel) return;
      unbind?.();
      panel.remove();
      panel = unbind = null;
      button.setAttribute("aria-expanded", "false");
      button.focus({ preventScroll: true });
    }
    shadow.append(css, button);
    if (!open) button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", event => {
      if (!event.isTrusted) return;
      if (open) { open(button); return; }
      if (panel) { close(); return; }
      panel = doc.createElement("section");
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", title);
      const exit = doc.createElement("button");
      exit.className = "close";
      exit.type = "button";
      exit.setAttribute("aria-label", closeLabel);
      exit.textContent = "×";
      exit.addEventListener("click", close);
      panel.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
      const view = frame(doc, url(), appId());
      panel.append(exit, view);
      shadow.append(panel);
      unbind = bindClose(view, close);
      button.setAttribute("aria-expanded", "true");
      exit.focus();
    });
    parent.append(host);
    return Object.freeze({ host, button, dispose() { unbind?.(); host.remove(); } });
  }

  let webActive = false;
  /** 网页入口拥有独立生命周期，设置面板接管悬浮栏时仍保留该开关 */
  function watchWeb(runtime) {
    if (webActive || root.STClientEnvironment.isSteamClientRuntime() ||
        !["https://store.steampowered.com", "https://steamcommunity.com"].includes(location.origin)) return;
    webActive = true;
    const key = "st.settings.ai-chat-web.enabled";
    const owner = "settings:ai-chat-web";
    const log = root.STLoggerFactory.createLogger("settings", "ai-chat-web");
    let entry, generation = 0;
    runtime.registerFeature({ domain: "settings", id: "ai-chat-web", settingsKey: "ai-chat-web",
      loadStrategy: "user-action", modes: ["web"], pageScope: ["steam-store", "steam-community"],
      dependencies: ["shared/settings-bus.js"], cost: "event-driven", dispose: true });
    async function update() {
      const request = ++generation;
      try {
        const values = await root.STSettingsBus.rawGet([key], { strict: true, owner, reason: "ai-chat-entry" });
        if (request !== generation) return;
        if (values[key] === true) {
          if (entry) return;
          entry = mount({
            doc: document, parent: document.body, variant: "web",
            url: () => chrome.runtime.getURL("ai/chat.html"),
            appId: () => Number(/^\/app\/(\d+)(\/|$)/.exec(location.pathname)?.[1]),
          });
          root.STTheme.applyCssVariables(entry.host);
          runtime.markFeature({ domain: "settings", id: "ai-chat-web", status: "started" });
        } else {
          entry?.dispose();
          entry = null;
          runtime.markFeature({ domain: "settings", id: "ai-chat-web", status: "skipped", reason: "settings-disabled" });
        }
      } catch (error) {
        if (request !== generation) return;
        entry?.dispose();
        entry = null;
        runtime.markFeature({ domain: "settings", id: "ai-chat-web", status: "failed", reason: "mount-failed" });
        log.error("chat-entry-failed", "网页 AI 对话入口更新失败", { error });
      }
    }
    const subscription = root.STSettingsBus.subscribe(update, { owner, key: "setting", keys: [key] });
    runtime.registerResource({ owner, key: "entry", type: "feature-lifecycle", dispose() {
      webActive = false;
      ++generation;
      subscription.dispose();
      entry?.dispose();
    } });
    if (document.body) void update();
    else runtime.listener(owner, "ready", document, "DOMContentLoaded", update, { once: true });
  }

  root.STAIChatLauncher = Object.freeze({ frame, bindClose, mount, watchWeb });
})(globalThis);
