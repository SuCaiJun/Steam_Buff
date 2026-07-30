/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 升级完成与使用反馈提示
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  if (root.STLifecyclePrompts) {
    return;
  }

  const contract = root.STLifecyclePromptContract;
  if (!contract) {
    throw new Error("[Steam Buff] 生命周期提示状态契约未加载");
  }
  const STARTED_AT_KEY = contract.startedAtKey;
  const SUPPORT_DECISION_KEY = contract.supportDecisionKey;
  const PENDING_UPDATE_KEY = contract.pendingUpdateKey;
  const AUTH_KEY = "steam_buff_auth";
  const MEMBERSHIP_KEY = root.STSettingsMembership?.KEY || "steam_buff_membership";
  const DAY_MS = contract.dayMs;
  const ROOT_ID = "__SteamBuffLifecyclePrompt";
  const DONATE_URL = root.STConfig.urls.donate;
  const BRAND_ICON_URL = root.chrome.runtime.getURL("images/icon.png");
  const updateLogUrl = new URL(root.STConfig.urls.updatePage);
  updateLogUrl.hash = "update-log";
  const UPDATE_LOG_URL = updateLogUrl.href;
  const checker = root.STUpdateChecker;
  const membershipApi = root.STSettingsMembership;
  const dom = root.STDomUtils;
  const components = root.STComponents?.css;
  const log = root.STLoggerFactory?.createLogger?.("settings", "lifecycle-prompts") || {
    info() {},
    warn() {},
  };
  let blocking = false;
  let activeHost = null;

  if (!checker || !membershipApi?.normalize || !dom?.setTrustedHTML || !components?.dialog || !components?.button) {
    throw new Error("[Steam Buff] 生命周期提示依赖未加载");
  }

  const SHARED_STYLE = components.compose(
    components.dialog({
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
    components.button(".action", {
      variant: "secondary",
      minWidth: "108px",
    }),
    components.button(".action.primary", {
      variant: "primary",
      minWidth: "108px",
    })
  );
  const STYLE = `
    ${SHARED_STYLE}
    :host {
      all: initial;
      color-scheme: dark;
      font-family: var(--st-font-family-base, "Motiva Sans", "Microsoft YaHei", Arial, sans-serif);
    }
    .layer {
      align-items: center;
      padding: 24px;
    }
    .content {
      display: grid;
      gap: var(--st-dialog-gap);
    }
    .meta {
      color: var(--st-dialog-muted-color);
      font-size: 12px;
      line-height: 1.5;
    }
    .label {
      color: var(--st-color-text-secondary);
      font-size: 14px;
      font-weight: 700;
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
    }
    .body > :last-child {
      margin-bottom: 0;
    }
    .body strong,
    .body b {
      color: var(--st-color-white);
      font-weight: 700;
    }
    .body code {
      border-radius: 4px;
      padding: 1px 4px;
      color: var(--st-color-text-bright);
      background: var(--st-color-white-alpha-06);
      font-family: "SF Mono", Consolas, monospace;
      font-size: 13px;
    }
    .support-copy {
      margin: 0;
      color: var(--st-color-text-secondary);
      font-size: 14px;
      line-height: 1.65;
    }
    .support-note {
      border-left: 3px solid var(--st-color-accent-gold, #d6a84b);
      padding-left: 12px;
    }
    .actions {
      margin-top: 4px;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    :host([data-prompt-type="update"]) .dialog,
    :host([data-prompt-type="support"]) .dialog {
      position: relative;
      max-height: calc(100vh - 48px);
      border-radius: 4px;
      border-left: 2px solid var(--st-color-primary-accent);
      background: var(--st-dialog-surface);
      box-shadow: var(--st-dialog-panel-shadow);
    }
    :host([data-prompt-type="update"]) .dialog {
      width: min(800px, calc(100vw - 48px));
    }
    :host([data-prompt-type="support"]) .dialog {
      width: min(720px, calc(100vw - 48px));
    }
    :host([data-prompt-type="update"]) .head,
    :host([data-prompt-type="support"]) .head {
      min-height: 0;
      border-bottom: 0;
      padding: 28px 28px 0;
      background: transparent;
    }
    :host([data-prompt-type="update"]) .title,
    :host([data-prompt-type="support"]) .title {
      color: var(--st-color-white);
      font-size: 22px;
      font-weight: 700;
      line-height: 1.25;
    }
    :host([data-prompt-type="update"]) .close,
    :host([data-prompt-type="support"]) .close {
      position: absolute;
      top: 12px;
      right: 12px;
    }
    .update-content {
      grid-template-areas:
        "main mark"
        "actions actions";
      grid-template-columns: minmax(0, 1fr) 144px;
      column-gap: 32px;
      row-gap: 22px;
      max-height: calc(100vh - 112px);
      padding: 24px 28px 24px;
      overflow: auto;
    }
    .update-main {
      grid-area: main;
      min-width: 0;
    }
    .update-version {
      margin-bottom: 12px;
      color: var(--st-color-white);
      font-size: 24px;
      font-weight: 700;
      line-height: 1.2;
    }
    .update-content .body {
      max-height: calc(1.6em * 8);
      border: 0;
      border-radius: 0;
      padding: 0;
      background: transparent;
      overflow: hidden;
    }
    .full-log-link {
      width: fit-content;
      margin-top: 10px;
      display: inline-flex;
      align-items: center;
      color: var(--st-color-steam-blue, #66c0f4);
      font-size: 14px;
      font-weight: 700;
      line-height: 1.5;
      text-decoration: none;
    }
    .full-log-link:hover,
    .full-log-link:focus-visible {
      color: var(--st-color-white);
      text-decoration: underline;
      outline: none;
    }
    .full-log-link[hidden] {
      display: none;
    }
    .update-content .support-note {
      margin-top: 18px;
    }
    .update-mark,
    .support-mark {
      grid-area: mark;
      display: flex;
      align-items: center;
      justify-content: center;
      align-self: center;
      min-height: 144px;
    }
    .update-mark img,
    .support-mark img {
      display: block;
      width: 112px;
      height: 112px;
      object-fit: contain;
    }
    .update-actions {
      grid-area: actions;
      margin-top: 0;
    }
    .support-content {
      grid-template-areas:
        "main mark"
        "actions actions";
      grid-template-columns: minmax(0, 1fr) 128px;
      column-gap: 32px;
      row-gap: 22px;
      padding: 24px 28px 24px;
    }
    .support-main {
      grid-area: main;
      align-self: center;
      min-width: 0;
      display: grid;
      gap: 10px;
    }
    .support-main .support-copy {
      font-size: 15px;
      line-height: 1.65;
    }
    .support-actions {
      grid-area: actions;
      margin-top: 0;
    }
    @media (max-width: 680px) {
      :host([data-prompt-type="update"]) .dialog,
      :host([data-prompt-type="support"]) .dialog {
        width: min(100%, 520px);
      }
      :host([data-prompt-type="update"]) .head,
      :host([data-prompt-type="support"]) .head {
        padding: 24px 20px 0;
      }
      :host([data-prompt-type="update"]) .title,
      :host([data-prompt-type="support"]) .title {
        padding-right: 28px;
        font-size: 20px;
      }
      .update-content,
      .support-content {
        grid-template-areas:
          "main"
          "actions";
        grid-template-columns: minmax(0, 1fr);
        padding: 20px;
      }
      .update-mark,
      .support-mark {
        display: none;
      }
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

  function text(key, fallback) {
    return root.STI18n?.text?.(key, fallback) || fallback;
  }

  function supportCopyHtml() {
    const copy = text(
      "lifecycle_support_copy",
      "你已经用 Steam Buff 一段时间了,还顺手吗?\n它的大部分功能都能在本地免费运行,而且会一直免费。不过云端服务(CDN、服务器、短信、防护等)会产生持续的运营成本。\n如果它帮到了你,不妨考虑赞助一下——每一份支持都会直接用来分担这些成本,也让我能更专注地维护和更新它。赞助用户还会获赠专属功能,感谢你对开发者的支持。"
    );
    return copy
      .split("\n")
      .map((paragraph) => `<p class="support-copy">${checker.esc(paragraph)}</p>`)
      .join("");
  }

  function topTargetPage() {
    try {
      if (root.top !== root.self) {
        return false;
      }
    } catch {
      return false;
    }
    const domain = root.STPageContext?.snapshot?.().domain || "";
    return domain === "store" || domain === "community";
  }

  function pageDomain() {
    return root.STPageContext?.snapshot?.().domain || "";
  }

  function storageGet(keys) {
    return new Promise((resolve, reject) => {
      root.chrome.storage.local.get(keys, (data) => {
        const error = root.chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message || "读取提示状态失败"));
          return;
        }
        resolve(data || {});
      });
    });
  }

  function storageSet(data) {
    return new Promise((resolve, reject) => {
      root.chrome.storage.local.set(data, () => {
        const error = root.chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message || "保存提示状态失败"));
          return;
        }
        resolve();
      });
    });
  }

  function storageRemove(key) {
    return new Promise((resolve, reject) => {
      root.chrome.storage.local.remove(key, () => {
        const error = root.chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message || "清理升级提示状态失败"));
          return;
        }
        resolve();
      });
    });
  }

  function ready() {
    if (document.body) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", resolve, { once: true });
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

  function release() {
    blocking = false;
    activeHost = null;
  }

  function close(host) {
    const layer = host?.shadowRoot?.querySelector(".layer");
    if (!layer) {
      host?.remove?.();
      restoreFocus(host);
      release();
      return;
    }
    layer.classList.remove("show");
    window.setTimeout(() => {
      host.remove();
      restoreFocus(host);
      release();
    }, 160);
  }

  function trapTab(shadow, event) {
    if (event.key !== "Tab") {
      return;
    }
    const controls = Array.from(shadow.querySelectorAll("button:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])"))
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

  function openDonate() {
    root.STConfig.externalNavigation.open(DONATE_URL);
  }

  async function saveDecision(action) {
    const value = action === "donate" ? "donate" : "declined";
    await storageSet({
      [SUPPORT_DECISION_KEY]: {
        action: value,
        decidedAt: Date.now(),
      },
    });
    log.info("support-prompt-decision", "用户已处理使用反馈与赞助提示", { action: value });
  }

  async function consumeUpdatePrompt() {
    try {
      await storageRemove(PENDING_UPDATE_KEY);
    } catch (error) {
      log.warn("post-update-prompt-consume-failed", "扩展升级完成提示状态清理失败", { error });
    }
  }

  function showLayer(host) {
    activeHost = host;
    document.body.appendChild(host);
    const layer = host.shadowRoot.querySelector(".layer");
    window.requestAnimationFrame(() => {
      layer.classList.add("show");
      host.shadowRoot.querySelector(".close")?.focus();
    });
  }

  function dialogHost(type, template, onAction) {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    host.id = ROOT_ID;
    host.dataset.promptType = type;
    host.__stRestoreFocus = document.activeElement;
    dom.setTrustedHTML(shadow, dom.trustedHTML(`<style>${STYLE}</style>${template}`, `lifecycle-${type}-template`));
    shadow.addEventListener("click", (event) => {
      const action = event.target?.closest?.("[data-action]")?.dataset?.action || "";
      if (action) {
        event.preventDefault();
        onAction(action, host);
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

  function syncUpdateLogPreview(host) {
    const body = host?.shadowRoot?.querySelector(".update-main .body");
    const link = host?.shadowRoot?.querySelector(".full-log-link");
    if (!body || !link) {
      return;
    }
    const truncated = body.scrollHeight > body.clientHeight + 1;
    body.dataset.truncated = truncated ? "true" : "false";
    link.hidden = !truncated;
  }

  async function showUpdatePrompt(pending) {
    const currentVersion = checker.verText(checker.version());
    const item = await checker.detail(currentVersion);
    const logHtml = checker.latestHtml(item || {
      desc: text("lifecycle_update_log_unavailable", "更新日志暂时无法加载，请稍后在关于页查看。"),
    });
    await ready();
    if (document.getElementById(ROOT_ID)) {
      return false;
    }
    const template = `
      <div class="layer" role="presentation">
        <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="st-lifecycle-update-title">
          <header class="head">
            <div class="title" id="st-lifecycle-update-title">${checker.esc(text("lifecycle_update_title", "Steam Buff 已更新"))}</div>
            <button class="close" type="button" data-action="close" aria-label="${checker.esc(text("common_close", "关闭"))}" title="${checker.esc(text("common_close", "关闭"))}">×</button>
          </header>
          <div class="content update-content">
            <div class="update-main">
              <div class="update-version">${checker.esc(checker.verLabel(currentVersion))}</div>
              <div class="body"></div>
              <a class="full-log-link" href="${checker.esc(UPDATE_LOG_URL)}" data-action="full-log" rel="noopener noreferrer" hidden>${checker.esc(text("lifecycle_view_full_log", "查看完整日志"))}</a>
              <p class="support-copy support-note">${checker.esc(text("lifecycle_update_support_copy", "感谢你使用 Steam Buff。如需赞助开发者请点击【我要赞助】，你的赞助会直接用于后续功能开发与持续维护。"))}</p>
            </div>
            <div class="update-mark" aria-hidden="true">
              <img src="${checker.esc(BRAND_ICON_URL)}" alt="">
            </div>
            <div class="actions update-actions">
              <button class="action" type="button" data-action="confirm">${checker.esc(text("common_confirm", "确定"))}</button>
              <button class="action primary" type="button" data-action="donate">${checker.esc(text("lifecycle_update_donate_action", "我要赞助"))}</button>
            </div>
          </div>
        </section>
      </div>
    `;
    const host = dialogHost("update", template, (action, currentHost) => {
      if (action === "full-log") {
        root.STConfig.externalNavigation.open(UPDATE_LOG_URL);
        return;
      }
      if (action === "donate") {
        Promise.all([
          saveDecision("donate")
            .catch((error) => log.warn("support-prompt-decision-save-failed", "赞助提示决定保存失败", { error })),
          consumeUpdatePrompt(),
        ])
          .finally(() => {
            openDonate();
            close(currentHost);
          });
        return;
      }
      if (action === "confirm") {
        consumeUpdatePrompt().finally(() => close(currentHost));
        return;
      }
      close(currentHost);
    });
    dom.setTrustedHTML(host.shadowRoot.querySelector(".body"), dom.trustedHTML(logHtml, "lifecycle-update-log-sanitized-renderer"));
    showLayer(host);
    window.requestAnimationFrame(() => syncUpdateLogPreview(host));
    log.info("post-update-prompt-shown", "扩展升级完成提示已展示", {
      version: currentVersion,
      previousVersion: String(pending?.previousVersion || ""),
    });
    return true;
  }

  async function showSupportPrompt() {
    await ready();
    if (document.getElementById(ROOT_ID)) {
      return false;
    }
    const template = `
      <div class="layer" role="presentation">
        <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="st-lifecycle-support-title">
          <header class="head">
            <div class="title" id="st-lifecycle-support-title">${checker.esc(text("lifecycle_support_title", "Steam Buff 使用体验"))}</div>
            <button class="close" type="button" data-action="close" aria-label="${checker.esc(text("common_close", "关闭"))}" title="${checker.esc(text("common_close", "关闭"))}">×</button>
          </header>
          <div class="content support-content">
            <div class="support-main">
              ${supportCopyHtml()}
            </div>
            <div class="support-mark" aria-hidden="true">
              <img src="${checker.esc(BRAND_ICON_URL)}" alt="">
            </div>
            <div class="actions support-actions">
              <button class="action" type="button" data-action="decline">${checker.esc(text("lifecycle_decline_action", "我不想赞助"))}</button>
              <button class="action primary" type="button" data-action="donate">${checker.esc(text("lifecycle_support_donate_action", "我要赞助"))}</button>
            </div>
          </div>
        </section>
      </div>
    `;
    const host = dialogHost("support", template, (action, currentHost) => {
      if (action === "decline") {
        saveDecision("declined")
          .catch((error) => log.warn("support-prompt-decision-save-failed", "赞助提示决定保存失败", { error }))
          .finally(() => close(currentHost));
        return;
      }
      if (action === "donate") {
        saveDecision("donate")
          .catch((error) => log.warn("support-prompt-decision-save-failed", "赞助提示决定保存失败", { error }))
          .finally(openDonate);
        return;
      }
      close(currentHost);
    });
    showLayer(host);
    log.info("support-prompt-shown", "使用反馈与赞助提示已展示", { domain: pageDomain() });
    return true;
  }

  async function start(now = Date.now()) {
    if (!topTargetPage()) {
      release();
      return false;
    }
    blocking = true;
    const data = await storageGet([
      STARTED_AT_KEY,
      SUPPORT_DECISION_KEY,
      PENDING_UPDATE_KEY,
      AUTH_KEY,
      MEMBERSHIP_KEY,
    ]);
    const pending = data[PENDING_UPDATE_KEY];
    const currentVersion = checker.verText(checker.version());
    const pendingVersion = checker.verText(pending?.version);
    if (pageDomain() === "store" && pendingVersion && pendingVersion === currentVersion) {
      return showUpdatePrompt(pending);
    }
    if (pendingVersion && pendingVersion !== currentVersion) {
      await storageRemove(PENDING_UPDATE_KEY);
    }
    if (contract.isDecision(data[SUPPORT_DECISION_KEY])) {
      release();
      return false;
    }
    const startedAt = Number(data[STARTED_AT_KEY]);
    if (!contract.isDayElapsed(startedAt, now)) {
      release();
      return false;
    }
    const membership = membershipApi.normalize(data[MEMBERSHIP_KEY], data[AUTH_KEY]);
    if (membership.active === true) {
      release();
      return false;
    }
    return showSupportPrompt();
  }

  const api = Object.freeze({
    STARTED_AT_KEY,
    SUPPORT_DECISION_KEY,
    PENDING_UPDATE_KEY,
    DAY_MS,
    isBlocking: () => blocking || !!activeHost?.isConnected,
    start,
  });
  root.STLifecyclePrompts = api;

  start().catch((error) => {
    release();
    log.warn("lifecycle-prompt-start-failed", "升级完成或赞助提示启动失败", { error });
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
