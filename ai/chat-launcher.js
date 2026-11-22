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
  const title = root.STConfig.aiChatName;

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

  /** 仅接受当前隔离对话框发出的窗口信号 */
  function bindClose(view, close, ready) {
    const owner = view.ownerDocument.defaultView;
    const origin = "chrome-extension://" + new URL(view.src).host;
    const onMessage = event => {
      if (event.source !== view.contentWindow || event.origin !== origin) return;
      if (event.data?.type === "st-ai-chat-close") close();
      if (event.data?.type === "st-ai-chat-ready") ready?.();
    };
    owner.addEventListener("message", onMessage);
    return () => owner.removeEventListener("message", onMessage);
  }

  /** 通过当前聊天 iframe 交出的专用端口传递头像地址。 */
  function bindAvatar(view, readAvatar) {
    const owner = view.ownerDocument.defaultView;
    const origin = new URL(view.src).origin;
    let port, last;
    const update = () => {
      if (!port) return;
      const avatar = readAvatar();
      const url = typeof avatar === "string" ? avatar : null;
      if (last === url) return;
      last = url;
      port.postMessage(url);
    };
    const connect = event => {
      if (event.source !== view.contentWindow || event.origin !== origin ||
          event.data?.type !== "st-ai-chat-avatar-request" || event.ports.length !== 1) return;
      port?.close();
      [port] = event.ports;
      last = undefined;
      update();
    };
    owner.addEventListener("message", connect);
    owner.addEventListener("focus", update);
    return () => {
      owner.removeEventListener("message", connect);
      owner.removeEventListener("focus", update);
      port?.close();
    };
  }

  function bindPosition(host, button, initialTop, saveTop, bottomInset) {
    const owner = host.ownerDocument.defaultView;
    const property = "--st-ai-chat-top";
    let savedTop = Number.isFinite(initialTop) && initialTop >= 0 ? initialTop : null;
    let drag = null, paint = 0, skipClick = false;
    const isOpen = () => button.getAttribute("aria-expanded") === "true";
    const clampTop = (top, height) => Math.round(Math.max(0, Math.min(top, owner.innerHeight - height - bottomInset)));
    function place(top) {
      if (top === null) host.style.removeProperty(property);
      else host.style.setProperty(property, top + "px");
    }
    function commit(top) {
      place(top);
      if (top === savedTop) return;
      savedTop = top;
      saveTop(top);
    }
    function cancelPaint() {
      if (!paint) return;
      owner.cancelAnimationFrame(paint);
      paint = 0;
    }

    place(savedTop);
    button.setAttribute("aria-keyshortcuts", "ArrowUp ArrowDown");
    button.addEventListener("pointerdown", event => {
      if (!event.isTrusted || !event.isPrimary || event.button !== 0 || drag) return;
      skipClick = false;
      if (isOpen()) return;
      const { top, height } = button.getBoundingClientRect();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, start: top, top, height, moved: false };
      button.setPointerCapture(event.pointerId);
    });
    button.addEventListener("pointermove", event => {
      if (!event.isTrusted || drag?.id !== event.pointerId) return;
      const dy = event.clientY - drag.y;
      if (!drag.moved) {
        if (Math.max(Math.abs(dy), Math.abs(event.clientX - drag.x)) < 6) return;
        drag.moved = true;
        host.setAttribute("data-dragging", "");
      }
      drag.top = clampTop(drag.start + dy, drag.height);
      if (!paint) paint = owner.requestAnimationFrame(() => {
        paint = 0;
        place(drag.top);
      });
    });
    const finish = (event, save) => {
      if (!event.isTrusted || drag?.id !== event.pointerId) return;
      const movement = drag;
      drag = null;
      cancelPaint();
      if (!movement.moved) return;
      host.removeAttribute("data-dragging");
      skipClick = true;
      const top = save ? clampTop(movement.start + event.clientY - movement.y, movement.height) : savedTop;
      if (save && top !== Math.round(movement.start)) commit(top);
      else place(savedTop);
    };
    button.addEventListener("pointerup", event => finish(event, true));
    button.addEventListener("pointercancel", event => finish(event, false));
    button.addEventListener("lostpointercapture", event => finish(event, false));
    button.addEventListener("keydown", event => {
      if (!event.isTrusted || drag || isOpen() || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      if (event.repeat) return;
      const { top, height } = button.getBoundingClientRect();
      const next = clampTop(top + (event.key === "ArrowUp" ? -24 : 24), height);
      if (next !== Math.round(top)) commit(next);
    });
    return {
      ignoreClick(event) {
        if (!event.detail || !skipClick) return false;
        skipClick = false;
        return true;
      },
      dispose: cancelPaint,
    };
  }

  /** 挂载一个入口。提供 open 时由调用方拥有窗口，否则入口拥有网页面板 */
  function mount(options) {
    const { doc, parent, variant, url, appId, open, avatarSrc, initialTop, saveTop } = options;
    const bottomInset = variant === "main" ? 64 : 0;
    const defaultBottom = variant === "main" ? bottomInset : 16;
    const host = doc.createElement("div");
    host.className = "st-ai-chat-" + variant;
    const shadow = host.attachShadow({ mode: "open" });
    const css = doc.createElement("style");
    css.textContent = `
      :host{--chat-avatar-size:52px;font:14px/1.4 system-ui,sans-serif;display:block}
      :host(.st-ai-chat-web),:host(.st-ai-chat-main){
        position:fixed;
        right:0;
        z-index:var(--st-z-index-sticky);
        top:clamp(0px,var(--st-ai-chat-top,calc(100dvh - var(--chat-avatar-size) - ${defaultBottom}px)),max(0px,calc(100dvh - var(--chat-avatar-size) - ${bottomInset}px)));
      }
      :host(.st-ai-chat-web[data-open]),:host([data-dragging]){z-index:var(--st-z-index-max)}
      :host(.st-ai-chat-friends){padding:2px 6px;flex:none}
      button{pointer-events:auto;cursor:pointer;font:inherit;color:var(--st-color-text-primary);background:var(--st-dialog-surface-raised);border:1px solid var(--st-dialog-border);border-radius:var(--st-control-radius);padding:7px 12px;}
      button:hover{background:var(--st-color-primary-surface-hover);border-color:var(--st-color-primary)}
      button:focus-visible{outline:2px solid var(--st-color-primary);outline-offset:2px}
      button.friend-entry{width:100%;display:flex;align-items:center;gap:9px;text-align:start;padding:4px 6px;
        background:transparent;border:0;color:var(--st-color-primary-soft-text)}
      button.friend-entry:hover{background:var(--st-color-steam-blue-alpha-10)}
      button.friend-entry:focus-visible{outline-offset:-2px}
      .friend-entry img{flex:none;object-fit:cover;border-radius:4px}
      .friend-caption{display:grid;line-height:1.2}
      .friend-caption small{color:var(--st-dialog-muted-color);font-size:11px}
      button.avatar{position:relative;z-index:1;display:grid;place-items:center;width:var(--chat-avatar-size);height:var(--chat-avatar-size);padding:3px;border-radius:50%;box-shadow:var(--st-dialog-panel-shadow)}
      button.avatar img{display:block;width:100%;height:100%;min-width:0;min-height:0;object-fit:cover;border-radius:50%}
      button.avatar{touch-action:none;user-select:none}
      button.avatar:not([aria-expanded="true"]){cursor:grab}
      :host([data-dragging]) button.avatar{cursor:grabbing}
      button.avatar:focus-visible{outline-offset:-2px}
      :host([data-ready]) button.avatar{visibility:hidden}
      section{pointer-events:auto;position:fixed;inset:0 0 0 auto;width:min(480px,100vw);box-sizing:border-box;display:flex;border-inline-start:1px solid var(--st-dialog-border);background:var(--st-dialog-surface);box-shadow:var(--st-dialog-shadow);overflow:hidden}
      iframe{width:100%;min-width:0;border:0}
      @media (prefers-reduced-motion:no-preference){
        section{animation:st-ai-panel-enter 180ms ease-out}
        @keyframes st-ai-panel-enter{from{transform:translateX(100%)}}
      }
    `;
    const button = doc.createElement("button");
    button.type = "button";
    button.setAttribute("aria-haspopup", "dialog");
    if (avatarSrc) {
      const friend = variant === "friends";
      button.className = friend ? "friend-entry" : "avatar";
      const image = doc.createElement("img");
      image.alt = "";
      image.width = image.height = friend ? 32 : 44;
      image.draggable = false;
      image.src = avatarSrc;
      button.append(image);
      if (friend) {
        const caption = doc.createElement("span");
        caption.className = "friend-caption";
        const nickname = doc.createElement("span");
        nickname.textContent = title;
        const description = doc.createElement("small");
        description.textContent = root.STI18n.text("ai_chat_assistant", "AI 助手");
        caption.append(nickname, description);
        button.append(caption);
      } else {
        button.setAttribute("aria-label", title);
        button.title = title;
      }
    } else button.textContent = title;
    let panel, unbind;
    function close() {
      if (!panel) return;
      unbind?.();
      panel.remove();
      panel = unbind = null;
      host.removeAttribute("data-open");
      host.removeAttribute("data-ready");
      button.setAttribute("aria-expanded", "false");
      button.focus({ preventScroll: true });
    }
    shadow.append(css, button);
    if (!open) button.setAttribute("aria-expanded", "false");
    const position = saveTop ? bindPosition(host, button, initialTop, saveTop, bottomInset) : null;
    button.addEventListener("click", event => {
      if (!event.isTrusted || position?.ignoreClick(event)) return;
      if (open) { open(button); return; }
      if (panel) { close(); return; }
      panel = doc.createElement("section");
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", title);
      panel.addEventListener("keydown", event => { if (event.key === "Escape") close(); });
      const view = frame(doc, url(), appId());
      const unbindClose = bindClose(view, close, () => host.setAttribute("data-ready", ""));
      const unbindAvatar = bindAvatar(view, () => {
        const avatar = doc.querySelector("#global_actions > a.user_avatar img:not(.profile_avatar_frame img)");
        return avatar?.currentSrc || avatar?.src;
      });
      unbind = () => { unbindClose(); unbindAvatar(); };
      panel.append(view);
      shadow.append(panel);
      host.setAttribute("data-open", "");
      button.setAttribute("aria-expanded", "true");
      view.focus();
    });
    parent.append(host);
    return Object.freeze({ host, button, dispose() { position?.dispose(); unbind?.(); host.remove(); } });
  }

  let webActive = false;
  /** 网页入口拥有独立生命周期，设置面板接管悬浮栏时仍保留该开关 */
  function watchWeb(runtime) {
    if (webActive ||
        !["https://store.steampowered.com", "https://steamcommunity.com"].includes(location.origin)) return;
    webActive = true;
    const key = "st.settings.ai-chat-web.enabled";
    const positionKey = "st.ai.chat.web-top";
    const owner = "settings:ai-chat-web";
    const log = root.STLoggerFactory.createLogger("settings", "ai-chat-web");
    let entry, generation = 0;
    runtime.registerFeature({ domain: "settings", id: "ai-chat-web", settingsKey: "ai-chat-web",
      loadStrategy: "user-action", modes: ["web"], pageScope: ["steam-store", "steam-community"],
      dependencies: ["shared/settings-bus.js"], cost: "event-driven", dispose: true });
    async function update() {
      const request = ++generation;
      try {
        const values = await root.STSettingsBus.rawGet([key, positionKey], { strict: true, owner, reason: "ai-chat-entry" });
        if (request !== generation) return;
        if (values[key] === true) {
          if (entry) return;
          entry = mount({
            doc: document, parent: document.body, variant: "web",
            avatarSrc: chrome.runtime.getURL("images/ai/avatar.png"),
            initialTop: values[positionKey],
            saveTop(top) {
              void root.STSettingsBus.rawSet({ [positionKey]: top }, { owner, reason: "ai-chat-entry-position" });
            },
            url: () => {
              const target = new URL(chrome.runtime.getURL("ai/chat.html?layout=web"));
              target.searchParams.set("parentOrigin", location.origin);
              return target.href;
            },
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

  root.STAIChatLauncher = Object.freeze({ frame, bindClose, bindAvatar, mount, watchWeb });
})(globalThis);
