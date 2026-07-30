/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 网页端更新提醒弹窗
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = globalThis.STUpdateChecker;
  if (!api || api.isGoogleWebStore() || globalThis.__SteamBuffUpdateReminderStarted) {
    return;
  }
  globalThis.__SteamBuffUpdateReminderStarted = true;
  const log = globalThis.STLoggerFactory?.createLogger?.("settings", "update-reminder") || {
    warn() {},
  };

  const ROOT = "__SteamBuffUpdateReminder";
  const sharedCss = globalThis.STComponents?.css;
  if (!sharedCss?.dialog || !sharedCss?.button) {
    throw new Error("[Steam Buff] 更新提醒依赖 STComponents 未加载");
  }

  const SHARED_STYLE = sharedCss.compose(
    sharedCss.dialog({
      variant: "content",
      layerSelectors: ".layer",
      openLayerSelectors: ".layer.show",
      surfaceSelectors: ".dialog",
      openSurfaceSelectors: ".layer.show .dialog",
      headerSelectors: ".head",
      titleSelectors: ".title",
      closeSelectors: ".close",
      bodySelectors: ".content",
    }),
    sharedCss.button(".action", {
      variant: "secondary",
      minWidth: "96px",
    }),
    sharedCss.button(".action.primary", {
      variant: "primary",
      minWidth: "96px",
    })
  );
  const STYLE = `
    ${SHARED_STYLE}
    :host {
      all: initial;
      color-scheme: dark;
      font-family: var(--st-font-family-base, "Motiva Sans", "Microsoft YaHei", Arial, sans-serif);
    }
    .content {
      display: grid;
      gap: var(--st-dialog-gap);
    }
    .meta {
      color: var(--st-dialog-muted-color);
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .label {
      color: var(--st-color-text-secondary);
      font-size: 14px;
      line-height: 1.4;
    }
    .body {
      max-height: min(52vh, calc(1.6em * 15));
      border: 1px solid var(--st-dialog-border);
      border-radius: var(--st-control-radius);
      padding: 10px 12px;
      color: var(--st-color-text-secondary);
      background: var(--st-dialog-surface-inset);
      font-size: 14px;
      line-height: 1.6;
      white-space: pre-wrap;
      overflow: auto;
      overflow-wrap: anywhere;
    }
    .body h1,
    .body h2,
    .body h3,
    .body h4,
    .body h5,
    .body h6 {
      margin: 0 0 8px;
      color: var(--st-color-white);
      font-size: 15px;
      font-weight: 700;
      line-height: 1.45;
    }
    .body p {
      margin: 0 0 6px;
    }
    .body ul,
    .body ol {
      margin: 0 0 8px 20px;
      padding: 0;
    }
    .body li {
      margin: 0 0 4px;
      padding-left: 0;
    }
    .body > :last-child {
      margin-bottom: 0;
    }
    .body strong,
    .body b {
      color: var(--st-color-white);
      font-weight: 700;
    }
    .body em,
    .body i {
      color: var(--st-color-text-primary);
    }
    .body code {
      border-radius: 4px;
      padding: 1px 4px;
      color: var(--st-color-text-bright);
      background: var(--st-color-white-alpha-06);
      font-family: "SF Mono", Consolas, monospace;
      font-size: 13px;
    }
    .actions {
      margin-top: 4px;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    @media (max-width: 480px) {
      .layer {
        align-items: center;
        padding: 16px;
      }
      .actions {
        display: grid;
        grid-template-columns: 1fr;
      }
      .action {
        width: 100%;
      }
    }
  `;

  function topHttpPage() {
    try {
      if (globalThis.top !== globalThis.self) {
        return false;
      }
    } catch {
      return false;
    }
    return location.protocol === "http:" || location.protocol === "https:";
  }

  function ready() {
    if (document.body) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
    });
  }

  function restoreFocus(host) {
    const target = host?.__stRestoreFocus;
    if (!target?.isConnected || typeof target.focus !== "function") {
      return;
    }
    try {
      target.focus({ preventScroll: true });
    } catch {
      target.focus();
    }
  }

  function close(host) {
    const layer = host?.shadowRoot?.querySelector(".layer");
    if (!layer) {
      host?.remove?.();
      restoreFocus(host);
      return;
    }
    layer.classList.remove("show");
    window.setTimeout(() => {
      host.remove();
      restoreFocus(host);
    }, 160);
  }

  function trapTab(shadow, event) {
    if (event.key !== "Tab") {
      return;
    }
    const controls = Array.from(shadow.querySelectorAll("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])"))
      .filter((element) => element.getClientRects().length > 0);
    if (!controls.length) {
      event.preventDefault();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && shadow.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && shadow.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function build(info) {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const latest = info.latest || {};
    const remote = api.verLabel(latest.version || info.remote);
    const current = api.verLabel(info.current);

    host.id = ROOT;
    host.__stRestoreFocus = document.activeElement;
    const logHtml = api.latestHtml(latest);
    const template = `
      <style>${STYLE}</style>
      <div class="layer" role="presentation">
        <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="st-update-reminder-title">
          <header class="head">
            <div class="title" id="st-update-reminder-title">Steam Buff 发现新版本</div>
            <button class="close" type="button" data-action="close" aria-label="关闭" title="关闭">×</button>
          </header>
          <div class="content">
            <div class="meta">当前版本：${api.esc(current)}
最新版本：${api.esc(remote)}</div>
            <div class="label">新版日志</div>
            <div class="body"></div>
            <div class="actions">
              <button class="action" type="button" data-action="mute">今天不再提醒</button>
              <button class="action primary" type="button" data-action="open">打开官网下载</button>
            </div>
          </div>
        </section>
      </div>
    `;
    const dom = globalThis.STDomUtils;
    dom.setTrustedHTML(shadow, dom.trustedHTML(template, "update-reminder-static-template"));
    dom.setTrustedHTML(shadow.querySelector(".body"), dom.trustedHTML(logHtml, "update-reminder-log-sanitized-renderer"));
    shadow.addEventListener("click", (event) => {
      const action = event.target?.closest?.("[data-action]")?.dataset?.action || "";
      if (action === "close") {
        close(host);
        return;
      }
      if (action === "open") {
        api.openDownload(info.link || api.UPDATE_PAGE, { version: api.verText(info.remote || latest.version) });
        close(host);
        return;
      }
      if (action === "mute") {
        api.muteToday(info.remote || latest.version).finally(() => close(host));
      }
    });
    shadow.addEventListener("keydown", (event) => {
      trapTab(shadow, event);
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(host);
      }
    });
    return host;
  }

  async function start() {
    if (!topHttpPage()) {
      return;
    }
    if (globalThis.STLifecyclePrompts?.isBlocking?.()) {
      return;
    }
    let info = null;
    try {
      info = await api.check({ manual: false });
    } catch {
      return;
    }
    if (!info?.hasNew || await api.isMuted(info)) {
      return;
    }
    info = {
      ...info,
      latest: typeof api.withDetail === "function" ? await api.withDetail(info.latest || {}) : (info.latest || {}),
    };
    await ready();
    if (document.getElementById(ROOT)) {
      return;
    }
    const host = build(info);
    document.body.appendChild(host);
    const layer = host.shadowRoot.querySelector(".layer");
    window.requestAnimationFrame(() => {
      layer.classList.add("show");
      host.shadowRoot.querySelector(".close")?.focus();
    });
  }

  window.setTimeout(() => {
    start().catch((error) => {
      log.warn("update-reminder-start-failed", "更新提醒启动失败", {
        error,
      });
    });
  }, 900);
})();
