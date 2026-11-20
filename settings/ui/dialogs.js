/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置面板|通用弹窗
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const log = globalThis.STLoggerFactory?.createLogger?.("settings", "dialog") || {
    info() {},
    warn() {},
  };

  function text(key, fallback, params) {
    return globalThis.STI18n.text(key, fallback, params);
  }

  function fillMessage(node, options = {}) {
    const parts = Array.isArray(options.messageParts) ? options.messageParts : [];
    if (!parts.length) {
      node.textContent = String(options.message || "");
      return;
    }
    node.textContent = "";
    for (const part of parts) {
      const value = String(part?.text || "");
      if (!value) {
        continue;
      }
      if (part.emphasize === true) {
        const em = document.createElement("strong");
        em.className = "settings-dialog-emphasis";
        em.textContent = value;
        node.appendChild(em);
        continue;
      }
      if (part.danger === true) {
        const span = document.createElement("span");
        span.className = "settings-dialog-danger";
        span.textContent = value;
        node.appendChild(span);
        continue;
      }
      node.appendChild(document.createTextNode(value));
    }
  }

  function countdownLabel(base, seconds) {
    const label = String(base || "");
    const left = Number(seconds) || 0;
    if (left <= 0) {
      return label;
    }
    return text("common.continueCountdown", "$label$($seconds$)", {
      label,
      seconds: left,
    });
  }

  function bindCountdown(btn, action) {
    const total = Math.max(0, Math.floor(Number(action?.countdownSeconds) || 0));
    if (!btn || total <= 0) {
      return () => {};
    }
    const base = String(action.label || "");
    let left = total;
    let timer = 0;
    const paint = () => {
      btn.disabled = left > 0;
      btn.textContent = countdownLabel(base, left);
    };
    const tick = () => {
      left -= 1;
      paint();
      if (left > 0) {
        timer = window.setTimeout(tick, 1000);
      }
    };
    paint();
    timer = window.setTimeout(tick, 1000);
    return () => {
      if (timer) {
        window.clearTimeout(timer);
        timer = 0;
      }
    };
  }

  const opened = [];
  let nextId = 0;

  /** form 使用原生模态及表单布局，native 使用原生模态及标准宽度。isDirty 只在请求取消时检查。 */
  function dialog(shadow, options = {}) {
    const startedAt = Date.now();
    const panel = shadow?.querySelector?.(".panel");
    if (!panel) {
      log.warn("settings-dialog-mount-skipped", "设置弹窗挂载跳过", {
        reason: "panel-missing",
        hasShadow: !!shadow,
      });
      return Promise.resolve("");
    }

    const restoreTarget = shadow.activeElement;
    const parent = opened.at(-1);
    const native = options.form === true || options.native === true || parent?.native === true;
    if (parent && !parent.native) {
      parent.cancel();
      parent.layer.remove();
    }
    const layer = document.createElement(native ? "dialog" : "div");
    const box = document.createElement("div");
    const title = document.createElement("div");
    const message = document.createElement("div");
    const actions = document.createElement("div");
    const optionActions = options.actions || [{ id: "ok", label: text("common.confirm", "确定"), primary: true }];
    layer.className = "settings-dialog-layer" + (native ? " settings-native-layer" : "");
    layer.tabIndex = -1;
    box.className = "settings-dialog";
    const identity = native ? `st-settings-dialog-${++nextId}` : "st-settings-dialog";
    const surface = native ? layer : box;
    if (!native) {
      surface.setAttribute("role", "dialog");
      surface.setAttribute("aria-modal", "true");
    }
    surface.setAttribute("aria-labelledby", `${identity}-title`);
    if (!options.form) surface.setAttribute("aria-describedby", `${identity}-message`);
    title.className = "settings-dialog-title";
    title.id = `${identity}-title`;
    title.textContent = String(options.title || text("common.notice", "提示"));
    if (options.titleBadge) title.append(options.titleBadge);
    message.className = "settings-dialog-message";
    message.id = `${identity}-message`;
    fillMessage(message, options);
    if (typeof options.render === "function") options.render(message);
    if (options.className) box.classList.add(options.className);
    if (options.form) box.classList.add("settings-form-dialog");
    actions.className = "settings-dialog-actions";
    const countdownClears = [];

    for (const action of optionActions) {
      const btn = document.createElement("button");
      btn.className = `dialog-btn${action.primary ? " primary" : ""}${action.danger ? " danger" : ""}`;
      btn.type = "button";
      btn.dataset.dialogAction = String(action.id || "");
      btn.textContent = String(action.label || "");
      countdownClears.push(bindCountdown(btn, action));
      actions.appendChild(btn);
    }
    options.renderFooter?.(actions);

    if (native) {
      const header = document.createElement("div");
      const closeButton = document.createElement("button");
      header.className = "settings-dialog-header";
      closeButton.className = "settings-dialog-close";
      closeButton.type = "button";
      closeButton.dataset.dialogAction = "cancel";
      closeButton.title = text("common.close", "关闭");
      closeButton.setAttribute("aria-label", closeButton.title);
      if (options.subtitle) {
        const heading = document.createElement("div"), subtitle = document.createElement("p");
        heading.className = "settings-dialog-heading";
        subtitle.className = "settings-dialog-subtitle";
        subtitle.append(options.subtitle);
        if (options.form && options.titleBadge) {
          subtitle.id = `${identity}-subtitle`;
          surface.setAttribute("aria-describedby", subtitle.id);
        }
        if (options.icon) {
          const icon = document.createElement("span");
          icon.className = "settings-dialog-title-icon";
          if (options.iconClass) icon.classList.add(options.iconClass);
          icon.setAttribute("aria-hidden", "true");
          icon.style.setProperty("--settings-dialog-icon", `url(${JSON.stringify(options.icon)})`);
          header.append(icon);
        }
        heading.append(title, subtitle);
        header.append(heading, closeButton);
      } else header.append(title, closeButton);
      box.append(header, message, actions);
    } else box.append(title, message, actions);
    layer.appendChild(box);
    panel.appendChild(layer);
    log.info("settings-dialog-open", "设置弹窗打开", {
      hasTitle: !!options.title,
      actionCount: optionActions.length,
      hasPanel: true,
    });

    return new Promise((resolve) => {
      let done = false;
      let life = null;
      const entry = { native, layer, cancel: () => close("cancel") };
      const close = (value) => {
        if (done) {
          return;
        }
        done = true;
        opened.splice(opened.indexOf(entry), 1);
        for (const clear of countdownClears) {
          clear();
        }
        layer.classList.remove("show");
        const dispose = () => {
          if (native) layer.close();
          layer.remove();
          life?.close?.();
          if (!native && !globalThis.STDialogLifecycle?.focus?.(options.restore?.() || restoreTarget)) {
            globalThis.STDialogLifecycle?.focus?.(shadow.querySelector(".close"));
          }
        };
        if (native) dispose();
        else window.setTimeout(dispose, 120);
        log.info("settings-dialog-close", "设置弹窗关闭", {
          selectedAction: String(value || ""),
          durationMs: Date.now() - startedAt,
        });
        resolve(value);
      };
      opened.push(entry);

      if (!native) life = globalThis.STDialogLifecycle?.open?.({
        root: layer,
        restore: restoreTarget,
        initial: () => options.initial?.(message) || layer.querySelector(".dialog-btn:not(:disabled)") || layer.querySelector(".dialog-btn"),
        onEscape: () => close("cancel"),
      });

      let actionPending = false;
      async function act(action) {
        if (actionPending) return;
        actionPending = true;
        const controls = Array.from(box.querySelectorAll("input,select,textarea,button"));
        const disabled = controls.map(node => node.disabled);
        try {
          if (action === "cancel" && options.isDirty?.()) {
            const answer = await dialog(shadow, {
              title: text("settings.dialog.discardTitle", "放弃未保存的修改？"),
              message: text("settings.dialog.discardWarning", "本次修改尚未保存，放弃后无法恢复。"),
              actions: [
                { id: "keep", label: text("settings.dialog.keepEditing", "继续编辑"), primary: true },
                { id: "discard", label: text("settings.dialog.discard", "放弃修改"), danger: true },
              ],
            });
            if (done || answer !== "discard") return;
          }
          const result = options.onAction ? options.onAction(action, message) : true;
          if (result === false) return;
          controls.forEach(node => { node.disabled = true; });
          if (await result !== false && !done) close(action);
        } catch (error) {
          globalThis.STLoggerFactory.reportError(error, { domain: "settings", feature: "dialog", event: "dialog-action-failed", message: "设置弹窗操作失败", level: "error" });
          void notice(shadow, { message: error.message });
        } finally {
          actionPending = false;
          controls.forEach((node, index) => { node.disabled = disabled[index]; });
        }
      }
      layer.addEventListener("click", (event) => {
        const action = event.target.closest("[data-dialog-action]");
        if (action && action.disabled !== true) {
          if (native || typeof options.onAction === "function") void act(action.dataset.dialogAction || "");
          else close(action.dataset.dialogAction || "");
        }
      });

      if (native) {
        layer.addEventListener("cancel", (event) => {
          event.preventDefault();
          void act("cancel");
        });
        const initial = options.initial?.(message) || box.querySelector("input,textarea,select") || actions.querySelector("button");
        if (initial) initial.autofocus = true;
        try { layer.showModal(); }
        catch (error) {
          opened.splice(opened.indexOf(entry), 1);
          layer.remove();
          throw error;
        }
      }
      window.requestAnimationFrame(() => {
        layer.classList.add("show");
        life?.focusInitial?.();
      });
    });
  }

  /** 结果提示独立于编辑器栈，关闭提示不会取消或重建底下的表单 */
  function notice(shadow, options) {
    const overlay = shadow.querySelector(".overlay");
    // 请求完成前用户可能已关闭设置；关闭动效期间同样不再接收迟到结果。
    if (!overlay?.isConnected || overlay.hidden ||
        (!overlay.classList.contains("open") && !overlay.querySelector(".settings-dialog-layer.show"))) {
      return Promise.resolve();
    }
    return globalThis.STFeedback.show(overlay, { ...options, inheritTheme: true });
  }
  const api = Object.freeze({ dialog, notice, cancel() { for (const entry of [...opened].reverse()) entry.cancel(); } });
  globalThis.STSettingsDialogs = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
