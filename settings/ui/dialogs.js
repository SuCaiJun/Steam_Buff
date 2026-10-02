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
    panel.querySelector(".settings-dialog-layer")?.remove();
    const layer = document.createElement("div");
    const box = document.createElement("div");
    const title = document.createElement("div");
    const message = document.createElement("div");
    const actions = document.createElement("div");
    const optionActions = options.actions || [{ id: "ok", label: text("common.confirm", "确定"), primary: true }];
    layer.className = "settings-dialog-layer";
    layer.tabIndex = -1;
    box.className = "settings-dialog";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "st-settings-dialog-title");
    box.setAttribute("aria-describedby", "st-settings-dialog-message");
    title.className = "settings-dialog-title";
    title.id = "st-settings-dialog-title";
    title.textContent = String(options.title || text("common.notice", "提示"));
    message.className = "settings-dialog-message";
    message.id = "st-settings-dialog-message";
    fillMessage(message, options);
    actions.className = "settings-dialog-actions";
    const countdownClears = [];

    for (const action of optionActions) {
      const btn = document.createElement("button");
      btn.className = `dialog-btn${action.primary ? " primary" : ""}`;
      btn.type = "button";
      btn.dataset.dialogAction = String(action.id || "");
      btn.textContent = String(action.label || "");
      countdownClears.push(bindCountdown(btn, action));
      actions.appendChild(btn);
    }

    box.append(title, message, actions);
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
      const close = (value) => {
        if (done) {
          return;
        }
        done = true;
        for (const clear of countdownClears) {
          clear();
        }
        layer.classList.remove("show");
        window.setTimeout(() => {
          layer.remove();
          life?.close?.();
          if (!globalThis.STDialogLifecycle?.focus?.(restoreTarget)) {
            globalThis.STDialogLifecycle?.focus?.(shadow.querySelector(".close"));
          }
        }, 120);
        log.info("settings-dialog-close", "设置弹窗关闭", {
          selectedAction: String(value || ""),
          durationMs: Date.now() - startedAt,
        });
        resolve(value);
      };

      life = globalThis.STDialogLifecycle?.open?.({
        root: layer,
        restore: restoreTarget,
        initial: () => layer.querySelector(".dialog-btn:not(:disabled)") || layer.querySelector(".dialog-btn"),
        onEscape: () => close("cancel"),
      });

      layer.addEventListener("click", (event) => {
        const action = event.target.closest("[data-dialog-action]");
        if (action && action.disabled !== true) {
          close(action.dataset.dialogAction || "");
        }
      });

      window.requestAnimationFrame(() => {
        layer.classList.add("show");
        life?.focusInitial?.();
      });
    });
  }

  const api = Object.freeze({ dialog });
  globalThis.STSettingsDialogs = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
