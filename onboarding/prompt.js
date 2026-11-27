/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 安装引导提示与确认弹窗
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

(() => {
  "use strict";

  const root = globalThis;
  const text = (key, fallback) => root.STI18n?.text(key, fallback) ?? fallback;
  let nextId = 0;

  /** 关闭或取消时返回 cancel，只有点击操作按钮才返回对应的操作 ID */
  function choose(options) {
    const { actions, signal, focus, requireAcknowledgement } = options;
    const host = document.body;
    if (signal?.aborted || !host.getClientRects().length) return Promise.resolve("cancel");
    const opener = focus ?? document.activeElement;
    const dialog = document.createElement("dialog");
    dialog.className = "onboarding-prompt";
    dialog.setAttribute("aria-modal", "true");

    const header = document.createElement("header");
    header.className = "onboarding-prompt-head";
    const title = document.createElement("h2");
    title.id = "onboarding-prompt-title-" + ++nextId;
    title.textContent = options.title || text("common.notice", "提示");
    header.append(title);
    const message = document.createElement("p");
    message.className = "onboarding-prompt-message";
    message.id = title.id + "-message";
    message.textContent = options.message;
    dialog.setAttribute("aria-labelledby", title.id);
    dialog.setAttribute("aria-describedby", message.id);

    const actionsBar = document.createElement("footer");
    actionsBar.className = "onboarding-prompt-actions";
    for (const action of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "onboarding-prompt-button";
      button.classList.toggle("is-primary", action.primary === true);
      button.classList.toggle("is-danger", action.danger === true);
      button.textContent = action.label;
      button.autofocus = !actionsBar.firstElementChild;
      button.addEventListener("click", () => dialog.close(action.id));
      actionsBar.append(button);
    }

    if (requireAcknowledgement) {
      dialog.addEventListener("cancel", event => event.preventDefault());
    } else {
      const close = document.createElement("button");
      close.type = "button";
      close.className = "onboarding-prompt-close";
      close.title = options.closeLabel || text("common.close", "关闭");
      close.setAttribute("aria-label", close.title);
      close.addEventListener("click", () => dialog.close("cancel"));
      header.append(close);
    }
    dialog.addEventListener("keydown", event => event.stopPropagation());
    dialog.append(header, message, actionsBar);
    host.append(dialog);

    return new Promise((resolve, reject) => {
      const abort = () => dialog.close("cancel");
      dialog.addEventListener("close", () => {
        signal?.removeEventListener("abort", abort);
        dialog.remove();
        if (signal?.aborted) {
          resolve("cancel");
          return;
        }
        try {
          const trigger = typeof opener === "function" ? opener() : opener;
          if (trigger?.isConnected && !trigger.disabled && trigger.getClientRects().length)
            trigger.focus({ preventScroll: true });
          resolve(dialog.returnValue || "cancel");
        } catch (error) {
          reject(error);
        }
      }, { once: true });
      try {
        dialog.showModal();
        // showModal 会触发焦点事件，流程可能已在该事件中取消
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
      } catch (error) {
        dialog.remove();
        reject(error);
      }
    });
  }

  /** 显示单按钮提示，关闭代表用户已看完提示 */
  async function show(options) {
    await choose({ ...options, actions: [
      { id: "close", label: options.confirmLabel || text("common.confirm", "确定"), primary: true },
    ] });
  }

  /** 仅主按钮确认返回 true，普通确认可取消，必须确认的提示仍支持流程中止 */
  async function confirm(options) {
    const actions = options.requireAcknowledgement ? [] : [
      { id: "cancel", label: options.cancelLabel || text("common.cancel", "取消") },
    ];
    actions.push({ id: "confirm", label: options.confirmLabel || text("common.confirm", "确定"), primary: true });
    return await choose({ ...options, actions }) === "confirm";
  }

  root.STOnboardingPrompt = Object.freeze({ show, confirm, choose });
})();
