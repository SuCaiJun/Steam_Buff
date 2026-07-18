/*
 * @Author        : 顾青离
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

  function focusElement(element) {
    if (!element?.isConnected || typeof element.focus !== "function") {
      return false;
    }
    try {
      element.focus({ preventScroll: true });
    } catch {
      element.focus();
    }
    return true;
  }

  function trapTab(layer, event) {
    if (event.key !== "Tab") {
      return;
    }
    const controls = Array.from(layer.querySelectorAll("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])"))
      .filter((element) => element.getClientRects().length > 0);
    if (!controls.length) {
      event.preventDefault();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && event.target === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && event.target === last) {
      event.preventDefault();
      first.focus();
    }
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
    const optionActions = options.actions || [{ id: "ok", label: "确定", primary: true }];
    layer.className = "settings-dialog-layer";
    layer.tabIndex = -1;
    box.className = "settings-dialog";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "st-settings-dialog-title");
    title.className = "settings-dialog-title";
    title.id = "st-settings-dialog-title";
    title.textContent = String(options.title || "提示");
    message.className = "settings-dialog-message";
    message.textContent = String(options.message || "");
    actions.className = "settings-dialog-actions";

    for (const action of optionActions) {
      const btn = document.createElement("button");
      btn.className = `dialog-btn${action.primary ? " primary" : ""}`;
      btn.type = "button";
      btn.dataset.dialogAction = String(action.id || "");
      btn.textContent = String(action.label || "");
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
      const close = (value) => {
        if (done) {
          return;
        }
        done = true;
        layer.classList.remove("show");
        window.setTimeout(() => {
          layer.remove();
          if (!focusElement(restoreTarget)) {
            focusElement(shadow.querySelector(".close"));
          }
        }, 120);
        log.info("settings-dialog-close", "设置弹窗关闭", {
          selectedAction: String(value || ""),
          durationMs: Date.now() - startedAt,
        });
        resolve(value);
      };

      layer.addEventListener("click", (event) => {
        const action = event.target.closest("[data-dialog-action]");
        if (action) {
          close(action.dataset.dialogAction || "");
        }
      });
      layer.addEventListener("keydown", (event) => {
        trapTab(layer, event);
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close("cancel");
        }
      });

      window.requestAnimationFrame(() => {
        layer.classList.add("show");
        layer.querySelector(".dialog-btn.primary, .dialog-btn")?.focus();
      });
    });
  }

  const api = Object.freeze({ dialog });
  globalThis.STSettingsDialogs = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
