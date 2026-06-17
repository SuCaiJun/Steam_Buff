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
  if (!api || globalThis.__SteamBuffUpdateReminderStarted) {
    return;
  }
  globalThis.__SteamBuffUpdateReminderStarted = true;

  const ROOT = "__SteamBuffUpdateReminder";
  const STYLE = `
    :host {
      all: initial;
      color-scheme: dark;
      font-family: var(--st-font-family-base, "Motiva Sans", "Microsoft YaHei", Arial, sans-serif);
    }
    .layer {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      box-sizing: border-box;
      padding: max(56px, 8vh) 20px 20px;
      background: var(--st-color-overlay-soft);
      opacity: 0;
      pointer-events: none;
      transition: opacity .16s ease;
    }
    .layer.show {
      opacity: 1;
      pointer-events: auto;
    }
    .dialog {
      width: min(520px, calc(100vw - 32px));
      border: 1px solid var(--st-color-white-alpha-08);
      border-radius: 8px;
      color: var(--st-color-text-primary);
      background: var(--st-color-bg-card);
      box-shadow: 0 16px 42px var(--st-color-black-alpha-48);
      transform: translateY(-8px);
      transition: transform .16s ease;
      overflow: hidden;
    }
    .layer.show .dialog {
      transform: translateY(0);
    }
    .head {
      min-height: 44px;
      border-bottom: 1px solid var(--st-color-white-alpha-05);
      padding: 0 12px 0 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .title {
      color: var(--st-color-white);
      font-size: 16px;
      font-weight: 650;
      line-height: 1.35;
    }
    .close {
      width: 28px;
      height: 28px;
      border: 0;
      border-radius: 4px;
      color: var(--st-color-text-muted);
      background: transparent;
      cursor: pointer;
      font-size: 20px;
      line-height: 24px;
    }
    .close:hover,
    .close:focus-visible {
      color: var(--st-color-text-primary);
      background: var(--st-color-white-alpha-06);
      outline: none;
    }
    .content {
      padding: 16px 18px 18px;
      display: grid;
      gap: 10px;
    }
    .meta {
      color: var(--st-color-text-muted);
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
      border: 1px solid var(--st-color-white-alpha-06);
      border-radius: 6px;
      padding: 10px 12px;
      color: var(--st-color-text-secondary);
      background: var(--st-color-bg-input);
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
    .action {
      min-width: 96px;
      height: 32px;
      border: 1px solid var(--st-color-white-alpha-08);
      border-radius: 5px;
      padding: 0 16px;
      color: var(--st-color-text-primary);
      background: var(--st-color-white-alpha-05);
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      white-space: nowrap;
    }
    .action:hover,
    .action:focus-visible {
      border-color: var(--st-color-white-alpha-16);
      background: var(--st-color-white-alpha-10);
      outline: none;
    }
    .action.primary {
      border-color: transparent;
      color: var(--st-color-white);
      background: linear-gradient(180deg, var(--st-color-primary) 0%, var(--st-color-primary-dark) 100%);
      box-shadow: 0 2px 6px var(--st-color-primary-alpha-25);
    }
    .action.primary:hover,
    .action.primary:focus-visible {
      filter: brightness(1.1);
      background: linear-gradient(180deg, var(--st-color-primary) 0%, var(--st-color-primary-dark) 100%);
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

  function close(host) {
    const layer = host?.shadowRoot?.querySelector(".layer");
    if (!layer) {
      host?.remove?.();
      return;
    }
    layer.classList.remove("show");
    window.setTimeout(() => host.remove(), 160);
  }

  function build(info) {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const latest = info.latest || {};
    const remote = api.verLabel(latest.version || info.remote);
    const current = api.verLabel(info.current);

    host.id = ROOT;
    const logHtml = api.latestHtml(latest);
    const template = `
      <style>${STYLE}</style>
      <div class="layer" role="presentation">
        <section class="dialog" role="dialog" aria-modal="true" aria-label="Steam Buff 发现新版本">
          <header class="head">
            <div class="title">Steam Buff 发现新版本</div>
            <button class="close" type="button" data-action="close" aria-label="关闭">×</button>
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
    const dom = root.STDomUtils;
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
    start().catch(() => {});
  }, 900);
})();
