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
      if (event.data?.type === "st-ai-chat-close") close(event.data.escapeAt);
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

  function bindPosition(host, button, initialTop, saveTop, topInset, bottomInset) {
    const owner = host.ownerDocument.defaultView;
    const property = "--st-ai-chat-top";
    let savedTop = Number.isFinite(initialTop) && initialTop >= 0 ? initialTop : null;
    let drag = null, paint = 0, skipClick = false;
    const isOpen = () => button.getAttribute("aria-expanded") === "true";
    const clampTop = (top, height) => {
      const maxTop = Math.max(0, owner.innerHeight - height - bottomInset);
      return Math.round(Math.min(maxTop, Math.max(topInset, top)));
    };
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
    const { doc, parent, before = null, variant, url, appId, open, avatarSrc, initialTop, saveTop,
      initialGroupOpen = true, saveGroupOpen } = options;
    const friend = variant === "friends";
    const topInset = variant === "main" ? 80 : 0;
    const bottomInset = variant === "main" ? 52 : 0;
    const defaultBottom = variant === "main" ? bottomInset : 6;
    const host = doc.createElement("div");
    host.className = "st-ai-chat-" + variant;
    const shadow = host.attachShadow({ mode: "open" });
    const css = doc.createElement("style");
    css.textContent = `
      :host{--chat-avatar-size:52px;font:14px/1.4 system-ui,sans-serif;display:block}
      :host(.st-ai-chat-web),:host(.st-ai-chat-main){
        position:fixed;
        right:12px;
        z-index:var(--st-z-index-sticky);
        --chat-avatar-max-top:max(0px,calc(100dvh - var(--chat-avatar-size) - ${bottomInset}px));
        top:clamp(min(${topInset}px,var(--chat-avatar-max-top)),var(--st-ai-chat-top,calc(100dvh - var(--chat-avatar-size) - ${defaultBottom}px)),var(--chat-avatar-max-top));
      }
      :host(.st-ai-chat-web[data-open]),:host([data-dragging]){z-index:var(--st-z-index-max)}
      :host(.st-ai-chat-friends){font:inherit;flex:none}
      details.friend-group{border-block-end:1px solid var(--st-color-border-normal)}
      .friend-group > summary{display:flex;align-items:center;gap:3px;min-block-size:32px;padding-inline:2px 12px;
        list-style:none;cursor:pointer;font-size:14px;color:var(--st-color-text-secondary-alt)}
      .friend-group > summary::-webkit-details-marker{display:none}
      .friend-group > summary:hover{background:var(--st-color-steam-blue-alpha-05)}
      .friend-group > summary:focus-visible{outline:2px solid var(--st-color-primary);outline-offset:-2px}
      .friend-group-icon{flex:none;inline-size:10px;text-align:center;color:var(--st-color-text-muted)}
      .friend-group-icon::before{content:"+"}
      .friend-group[open] .friend-group-icon{opacity:0}
      .friend-group[open] .friend-group-icon::before{content:"−"}
      .friend-group > summary:hover .friend-group-icon{opacity:1;color:var(--st-color-text-primary)}
      button{pointer-events:auto;cursor:pointer;font:inherit;color:var(--st-color-text-primary);background:var(--st-dialog-surface-raised);border:1px solid var(--st-dialog-border);border-radius:var(--st-control-radius);padding:7px 12px;}
      button:hover{background:var(--st-color-primary-surface-hover);border-color:var(--st-color-primary)}
      button:focus-visible{outline:2px solid var(--st-color-primary);outline-offset:2px}
      button.friend-entry{inline-size:100%;min-block-size:42px;box-sizing:border-box;display:flex;align-items:center;
        gap:6px;text-align:start;padding:2px 0 2px 12px;background:transparent;border:0;border-radius:0;color:#6dcff6}
      button.friend-entry:hover{background:rgba(36,52,64,.3)}
      button.friend-entry:focus-visible{outline-offset:-2px}
      .friend-entry img{flex:none;box-sizing:border-box;object-fit:cover;margin-inline:2px 4px;
        border:1px solid #383c43;box-shadow:2px 2px 8px 1px rgba(0,0,0,.3)}
      .friend-caption{min-inline-size:0;block-size:28px}
      .friend-caption > span,.friend-caption small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .friend-caption > span{font-size:14px;line-height:16px}
      .friend-caption small{color:#4c91ac;font-size:12px;line-height:18px;margin-block-start:-1px}
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
        .friend-group-icon{transition:opacity var(--st-motion-normal)}
        section{animation:st-ai-panel-enter 180ms ease-out}
        @keyframes st-ai-panel-enter{from{transform:translateX(100%)}}
      }
    `;
    const button = doc.createElement("button");
    button.type = "button";
    button.setAttribute("aria-haspopup", "dialog");
    if (avatarSrc) {
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
    shadow.append(css);
    if (friend) {
      const group = doc.createElement("details");
      group.className = "friend-group";
      group.open = initialGroupOpen;
      const summary = doc.createElement("summary");
      const icon = doc.createElement("span");
      icon.className = "friend-group-icon";
      icon.setAttribute("aria-hidden", "true");
      summary.append(icon, "AI");
      // Steam 的好友滚动区会把空格当成搜索输入。
      group.addEventListener("keydown", event => { if (event.key === " ") event.stopPropagation(); });
      summary.addEventListener("click", event => {
        // 在对应的点击中完成保存，关窗无需等待异步 toggle 事件。
        event.preventDefault();
        const nextOpen = !group.open;
        saveGroupOpen?.(nextOpen);
        group.open = nextOpen;
      });
      group.append(summary, button);
      shadow.append(group);
    } else shadow.append(button);
    if (!open) button.setAttribute("aria-expanded", "false");
    const position = saveTop ? bindPosition(host, button, initialTop, saveTop, topInset, bottomInset) : null;
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
    parent.insertBefore(host, before);
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
