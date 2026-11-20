/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 手动操作结果的原生确认弹窗
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const text = (key, fallback) => globalThis.STI18n ? globalThis.STI18n.text(key, fallback) : fallback;

  /**
   * 在调用方明确提供的宿主中显示一次操作结果；不持有全局队列或业务状态
   * @param {Element|ShadowRoot} host 弹窗所属页面或编辑器的宿主
   * @param {{title?:string,closeLabel?:string,confirmLabel?:string,message:string,focus?:HTMLElement,inheritTheme?:boolean,signal?:AbortSignal}} options focus 定位校验字段；inheritTheme 保留宿主的局部主题
   * @returns {Promise<void>} 用户关闭结果弹窗后完成，不代表业务操作成功
   */
  function show(host, options) {
    return open(host, options, false);
  }

  /**
   * 只有确认按钮返回 true，取消、关闭或宿主清理均返回 false
   * @param {Element|ShadowRoot} host
   * @param {{title?:string,message:string,confirmLabel?:string,cancelLabel?:string,danger?:boolean,requireAcknowledgement?:boolean,signal?:AbortSignal}} options
   * @returns {Promise<boolean>}
   */
  function confirm(host, options) {
    return open(host, options, true);
  }

  function open(host, options, confirmation) {
    if (!host?.isConnected) throw new Error("操作结果弹窗缺少有效宿主");
    // 所属页面已经隐藏时不再打开原生模态层，否则会留下不可见的焦点锁。
    const surface = host.nodeType === 11 ? host.host : host;
    if (options.signal?.aborted || !surface.getClientRects().length) return Promise.resolve(confirmation ? false : undefined);
    const doc = host.ownerDocument;
    const css = globalThis.STComponents.css;
    const layer = doc.createElement("dialog");
    const style = doc.createElement("style");
    const header = doc.createElement("header");
    const title = doc.createElement("h2");
    const close = doc.createElement("button");
    const body = doc.createElement("div");
    const footer = doc.createElement("footer");
    const ok = doc.createElement("button");
    const required = confirmation && options.requireAcknowledgement === true;
    const cancel = confirmation && !required ? doc.createElement("button") : null;
    layer.className = "st-feedback-dialog";
    if (options.inheritTheme !== true) {
      const theme = globalThis.STTheme;
      theme.applyCssVariables(layer, { ...theme.cssVariables, ...theme.flatDialogVariables });
    }
    title.id = "st-feedback-" + crypto.getRandomValues(new Uint32Array(4)).join("-");
    body.id = title.id + "-message";
    layer.setAttribute("aria-labelledby", title.id);
    layer.setAttribute("aria-describedby", body.id);
    title.textContent = options.title || text("common.notice", "提示");
    body.textContent = String(options.message);
    header.className = "st-feedback-head";
    close.className = "st-feedback-close";
    close.type = ok.type = "button";
    close.title = options.closeLabel || text("common.close", "关闭");
    close.setAttribute("aria-label", close.title);
    body.className = "st-feedback-body";
    footer.className = "st-feedback-actions";
    ok.className = "st-feedback-ok";
    ok.classList.toggle("is-danger", options.danger === true);
    ok.textContent = options.confirmLabel || text("common.confirm", "确定");
    if (cancel) {
      cancel.className = "st-feedback-cancel";
      cancel.type = "button";
      cancel.textContent = options.cancelLabel || text("common.cancel", "取消");
      cancel.autofocus = true;
      footer.append(cancel);
    } else {
      ok.autofocus = true;
    }
    style.textContent = css.compose(
      css.dialog({ variant: "standard", surfaceSelectors: ".st-feedback-dialog",
        headerSelectors: ".st-feedback-head", titleSelectors: ".st-feedback-head h2",
        closeSelectors: ".st-feedback-close", bodySelectors: ".st-feedback-body",
        footerSelectors: ".st-feedback-actions", surfacePadding: "0", surfaceTransform: "none" }),
      css.button(".st-feedback-ok:not(.is-danger)", { variant: "primary", minWidth: "76px" }),
      css.button(".st-feedback-ok.is-danger", { variant: "danger", minWidth: "76px" }),
      cancel && css.button(".st-feedback-cancel", { variant: "secondary", minWidth: "76px" }),
      `.st-feedback-dialog{box-sizing:border-box;max-width:calc(100vw - 32px);max-height:calc(100dvh - 32px);overscroll-behavior:contain;font-family:var(--st-font-family-base);line-height:var(--st-line-height-body)}
      .st-feedback-dialog[open]{display:flex;flex-direction:column}
      .st-feedback-dialog::backdrop{background:var(--st-dialog-overlay-bg);overflow:hidden;overscroll-behavior:contain}
      .st-feedback-head,.st-feedback-actions{flex:none}
      .st-feedback-body{overflow:auto;overscroll-behavior:contain;white-space:pre-wrap;overflow-wrap:anywhere}
      .st-feedback-actions{border-top:1px solid var(--st-dialog-divider)}`,
    );
    header.append(title);
    if (!required) header.append(close);
    else layer.addEventListener("cancel", event => event.preventDefault());
    footer.append(ok);
    layer.append(style, header, body, footer);
    host.append(layer);
    // 防止结果窗口的键盘事件进入底下仍保留的旧式编辑器
    layer.addEventListener("keydown", event => event.stopPropagation());
    return new Promise((resolve, reject) => {
      const dismiss = () => layer.close();
      close.addEventListener("click", dismiss);
      cancel?.addEventListener("click", dismiss);
      ok.addEventListener("click", () => layer.close("confirm"));
      layer.addEventListener("close", () => {
        options.signal?.removeEventListener("abort", dismiss);
        layer.remove();
        if (options.focus?.isConnected && !options.focus.disabled) options.focus.focus({ preventScroll: true });
        resolve(confirmation ? layer.returnValue === "confirm" : undefined);
      }, { once: true });
      try {
        layer.showModal();
        // showModal 会移动焦点，所属页面可能在焦点事件里同步结束操作
        if (options.signal?.aborted) dismiss();
        else options.signal?.addEventListener("abort", dismiss, { once: true });
      }
      catch (error) { layer.remove(); reject(error); }
    });
  }

  /** 只关闭指定宿主拥有的结果弹窗，供各域在原有销毁流程中清理 */
  function dismiss(host) {
    for (const layer of host.querySelectorAll("dialog.st-feedback-dialog")) layer.close();
  }

  globalThis.STFeedback = Object.freeze({ show, confirm, dismiss });
})();
