/*
 * @Author        : Ricky
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
  if (!api || !topHttpPage() || globalThis.__SteamBuffUpdateReminderStarted) {
    return;
  }
  globalThis.__SteamBuffUpdateReminderStarted = true;
  const log = globalThis.STLoggerFactory.createLogger("settings", "update-reminder");

  const ROOT = "__SteamBuffUpdateReminder";
  const theme = globalThis.STTheme;
  const sharedCss = globalThis.STComponents?.css;
  if (!theme?.applyCssVariables || !sharedCss?.dialog || !sharedCss?.button) {
    throw new Error("[Steam Buff] 更新提醒依赖 STTheme / STComponents 未加载");
  }

  function text(key, fallback, params) {
    return globalThis.STI18n.text(key, fallback, params);
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
    if (location.protocol === "chrome-extension:") return location.pathname === "/settings/center.html";
    return location.protocol === "https:" && globalThis.STConfig.matchers.isSteamTranslateHost(location.hostname);
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
    if (current?.host === host) {
      const owner = current; current = null;
      owner.port.onDisconnect.removeListener(owner.lost); owner.port.disconnect();
    }
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
    // 独立弹窗不依赖 Steam 页面根节点提供主题变量。
    theme.applyCssVariables(host);
    const shadow = host.attachShadow({ mode: "open" });
    const latest = info.latest || {};
    const remote = api.verLabel(latest.version || info.remote);
    const current = api.verLabel(info.current);

    host.id = ROOT;
    host.__stRestoreFocus = document.activeElement;
    const logHtml = api.latestHtml(latest);
    const action = api.updateAction(info);
    const template = `
      <style>${STYLE}</style>
      <div class="layer" role="presentation">
        <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="st-update-reminder-title">
          <header class="head">
            <div class="title" id="st-update-reminder-title">${api.esc(text("updateReminder.title", "Steam Buff 发现新版本"))}</div>
            <button class="close" type="button" data-action="close" aria-label="${api.esc(text("common.close", "关闭"))}" title="${api.esc(text("common.close", "关闭"))}">×</button>
          </header>
          <div class="content">
            <div class="meta">${api.esc(text("updateReminder.currentVersion", "当前版本：$version$", { version: current }))}
${api.esc(text("updateReminder.latestVersion", "最新版本：$version$", { version: remote }))}</div>
            <div class="label">${api.esc(text("updateReminder.releaseNotes", "新版日志"))}</div>
            <div class="body"></div>
            <div class="update-error" role="status" hidden></div>
            <div class="actions">
              <button class="action" type="button" data-action="mute-version">${api.esc(text("updateReminder.ignoreVersion", "此版本不再提醒"))}</button>
              <button class="action" type="button" data-action="mute-cycle">${api.esc(text("updateReminder.snoozeCycle", "本次不再提醒"))}</button>
              <button class="action primary" type="button" data-action="open">${api.esc(action.label)}</button>
            </div>
          </div>
        </section>
      </div>
    `;
    const dom = globalThis.STDomUtils;
    dom.setTrustedHTML(shadow, dom.trustedHTML(template, "update-reminder-static-template"));
    dom.setTrustedHTML(shadow.querySelector(".body"), dom.trustedHTML(logHtml, "update-reminder-log-sanitized-renderer"));
    shadow.addEventListener("click", async (event) => {
      const action = event.target?.closest?.("[data-action]")?.dataset?.action || "";
      if (action === "close") { close(host); return; }
      if (!["open", "mute-version", "mute-cycle"].includes(action)) return;
      const controls = shadow.querySelectorAll(".action");
      controls.forEach(button => { button.disabled = true; });
      try {
        if (action === "open") api.openUpdate(info);
        else await api.mute(info, action === "mute-version" ? "version" : "cycle");
        close(host);
      } catch (error) {
        log.error("update-reminder-action-failed", "更新提醒操作失败", { error, action });
        const status = shadow.querySelector(".update-error");
        status.hidden = false; status.textContent = text("updateReminder.actionFailed", "操作失败，请重试。");
        controls.forEach(button => { button.disabled = false; });
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

  let current = null;
  let busy = false;
  let rerun = false;

  function release() {
    const owner = current;
    current = null;
    if (!owner) return;
    owner.port.onDisconnect.removeListener(owner.lost);
    owner.port.disconnect();
    owner.host?.remove();
    restoreFocus(owner.host);
  }

  function kick() {
    start().catch(error => log.error("update-reminder-start-failed", "更新提醒展示失败", { error }));
  }

  // 页面只消费后台缓存；展示权通过 Port 仲裁，不因页面加载或恢复可见而联网检查
  async function start() {
    if (globalThis.STClientEnvironment.isSteamClientPage()) return;
    if (busy) { rerun = true; return; }
    if (current || document.hidden || globalThis.STLifecyclePrompts?.isBlocking?.()) return;
    busy = true;
    try {
      const cached = await api.cached();
      if (!cached?.hasNew || document.hidden) return;
      const grant = await api.claim();
      if (!grant) return;
      if (document.hidden || globalThis.STLifecyclePrompts?.isBlocking?.()) { grant.port.disconnect(); return; }
      const owner = { ...grant, host: null, lost: null };
      owner.lost = () => { if (current === owner) { current = null; owner.host?.remove(); restoreFocus(owner.host); } };
      current = owner;
      owner.port.onDisconnect.addListener(owner.lost);
      await ready();
      if (current !== owner || document.hidden) { if (current === owner) release(); return; }
      const host = build(owner.info);
      owner.host = host;
      document.body.appendChild(host);
      window.requestAnimationFrame(() => {
        if (!host.isConnected) return;
        host.shadowRoot.querySelector(".layer").classList.add("show");
        host.shadowRoot.querySelector(".close").focus();
      });
      // 摘要先展示，完整日志只补充当前弹窗，不阻塞界面创建
      const detail = await api.withDetail(owner.info.latest || {});
      if (current === owner && host.isConnected) {
        const dom = globalThis.STDomUtils;
        dom.setTrustedHTML(host.shadowRoot.querySelector(".body"), dom.trustedHTML(api.latestHtml(detail), "update-reminder-log-sanitized-renderer"));
      }
    } finally {
      busy = false;
      if (rerun) { rerun = false; kick(); }
    }
  }

  function changed(changes, area) {
    if (area !== "local" || ![api.CACHE_KEY, api.MUTE_KEY, api.PLAN_KEY, globalThis.STConfig.updates.settingKey].some(key => Object.hasOwn(changes, key))) return;
    release(); kick();
  }
  function visibility() { if (document.hidden) release(); else kick(); }
  function pageshow() { kick(); }
  function pagehide(event) {
    release();
    if (event.persisted) return;
    chrome.storage.onChanged.removeListener(changed);
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("pageshow", pageshow);
    window.removeEventListener("pagehide", pagehide);
  }
  chrome.storage.onChanged.addListener(changed);
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pageshow", pageshow);
  window.addEventListener("pagehide", pagehide);
  window.setTimeout(kick, 900);
})();
