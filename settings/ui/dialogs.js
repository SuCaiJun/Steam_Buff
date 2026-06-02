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

  function dialog(shadow, options = {}) {
    const panel = shadow.querySelector(".panel");
    if (!panel) {
      return Promise.resolve("");
    }

    panel.querySelector(".settings-dialog-layer")?.remove();
    const layer = document.createElement("div");
    const box = document.createElement("div");
    const title = document.createElement("div");
    const message = document.createElement("div");
    const actions = document.createElement("div");
    layer.className = "settings-dialog-layer";
    layer.tabIndex = -1;
    box.className = "settings-dialog";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", String(options.title || "提示"));
    title.className = "settings-dialog-title";
    title.textContent = String(options.title || "提示");
    message.className = "settings-dialog-message";
    message.textContent = String(options.message || "");
    actions.className = "settings-dialog-actions";

    for (const action of options.actions || [{ id: "ok", label: "确定", primary: true }]) {
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
        }, 120);
        resolve(value);
      };

      layer.addEventListener("click", (event) => {
        const action = event.target.closest("[data-dialog-action]");
        if (action) {
          close(action.dataset.dialogAction || "");
        }
      });
      layer.addEventListener("keydown", (event) => {
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
