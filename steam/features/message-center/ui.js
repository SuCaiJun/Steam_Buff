/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 顶栏消息入口、下拉列表与消息详情
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";
  const api = window.SteamBuff, model = window.STMessageCenter;
  const ROOT = "__RickyMessageCenter", PANEL = "__RickyMessageCenterPopover", DIALOG = "__RickyMessageCenterDialog", DETAIL = "__RickyMessageCenterDetail";
  const CONTROLS = "._3cykd-VfN_xBxf3Qxriccm";
  const NAVIGATION = "._3Z3ohQ8-1NKnCZkbS6fvy > ._2D64jIEK7wpUR_NlObDW76";
  const MODE_SETTING = "message-center-navigation", SETTINGS_ATTR = "data-steam-buff-settings";
  const MOUNT_TASK = "steam-message-center-controls";
  const ROW_HEIGHT = 96, OVERSCAN = 3;
  const MENU_VISIBLE_ROWS = 5;
  const READ_EXIT_MS = 160;
  const text = model.text;
  const { bindLabel, refreshLabels } = window.STComponents;
  const HELP = "该消息中心由 Steam Buff 创建，非 Steam 客户端自带的功能！\n消息中心内的消息均为 Steam Buff 发送，该消息中心内的消息与提醒与 Steam 、Valve、Steam客户端等均无任何关联性，这里也不会出现 Steam 或 Valve 官方的任何消息。";
  const log = window.STLoggerFactory.createLogger("steam", model.FEATURE);

  /**
   * 用 Steam 现有 Popup 构造器承载自有 DOM；只使用已验证的通知菜单参数与窗口接口。
   * open 返回原生内容挂载完成的 Promise。关闭前收回 DOM，避免关闭文档销毁消息界面。
   */
  function nativeHost(trigger, css, onClosed, reportFailure, onEscape, operationOpen) {
    return api.nativeWindow.create({
      id: "SteamBuffMessageCenter", trigger, onClosed, reportFailure, onEscape, log, follow: true,
      closeOnBlur: kind => kind === "menu" && !operationOpen(),
      prepareDocument(state) {
        state.doc.documentElement.dataset.messageCenterWindow = state.kind;
        state.doc.documentElement.style.setProperty("--st-mc-menu-list-height", `${Math.max(80, Math.min(480, innerHeight - 176))}px`);
        state.doc.documentElement.style.setProperty("--st-mc-detail-max-width", `${Math.min(560, innerWidth - 48)}px`);
        state.doc.documentElement.style.setProperty("--st-mc-detail-max-height", `${Math.min(520, innerHeight - 64)}px`);
      },
      css: () => css.textContent + "\nhtml,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:var(--st-color-steam-message-surface)}#popup_target{width:100%}html[data-message-center-window=full] #popup_target{height:100%}",
      geometry(state) {
        const doc = state.win.document, rect = trigger.getBoundingClientRect();
        if (state.kind === "detail") {
          doc.documentElement.style.setProperty("--st-mc-detail-max-width", `${Math.min(560, innerWidth - 48)}px`);
          doc.documentElement.style.setProperty("--st-mc-detail-max-height", `${Math.min(520, innerHeight - 64)}px`);
        }
        let listHeight = Math.max(80, Math.min(480, innerHeight - 176));
        if (state.kind === "menu") {
          const list = state.content.querySelector(".st-mc-list");
          if (list.children.length > MENU_VISIBLE_ROWS) {
            // 用布局位置计算五条真实行高；offsetTop 不受已读过渡的 transform 影响。
            const rowLimit = list.children[MENU_VISIBLE_ROWS].offsetTop - list.firstElementChild.offsetTop;
            if (rowLimit <= 0) throw new Error("消息列表行高无效");
            listHeight = Math.min(listHeight, rowLimit);
          }
        }
        doc.documentElement.style.setProperty("--st-mc-menu-list-height", `${listHeight}px`);
        const bounds = state.content.getBoundingClientRect();
        const width = state.kind === "menu" ? Math.min(360, innerWidth - 16) : state.kind === "detail" ? Math.min(560, innerWidth - 48) : Math.min(760, innerWidth - 48);
        const height = state.kind === "full" ? Math.min(640, innerHeight - 64) : state.kind === "detail" ? Math.min(420, innerHeight - 64) : Math.min(Math.max(Math.ceil(bounds.height), state.content.querySelector(".st-mc-operation[open]") ? 268 : 0), innerHeight - 16);
        const x = state.kind === "menu" ? Math.max(8, Math.min(innerWidth - width - 8, rect.right - width)) : Math.round((innerWidth - width) / 2);
        const y = state.kind === "menu" ? Math.max(0, Math.min(rect.bottom + 2, innerHeight - height - 8)) : Math.round((innerHeight - height) / 2);
        return { x, y, width, height };
      },
      params(kind) {
        const rect = trigger.getBoundingClientRect();
        const width = kind === "menu" ? Math.min(360, innerWidth - 16) : Math.min(kind === "detail" ? 560 : 760, innerWidth - 48);
        const height = kind === "menu" ? 260 : Math.min(kind === "detail" ? 420 : 640, innerHeight - 64);
        return { title: kind === "menu" ? text("messageCenter.steamMessages", "Steam Buff 消息") : kind === "detail" ? text("messageCenter.steamDetails", "Steam Buff 消息详情") : text("messageCenter.steamCenter", "Steam Buff 消息中心"), modal: kind !== "menu", dimensions: { width, height, left: screenX + (kind === "menu" ? rect.right - width : (innerWidth - width) / 2), top: screenY + (kind === "menu" ? rect.bottom + 2 : (innerHeight - height) / 2) } };
      },
    });
  }

  function create() {
    if (api.messageCenter) return { started: true, stop: api.messageCenter.stop };
    let navigation = api.ctx.settingValue(MODE_SETTING, false);
    let controls = null;

    const pending = new Map(), popCards = new Map(), fullCards = new Map();
    const actionBusy = new Map(), actionVersions = new Map();
    let operationView = null, operationEpoch = 0;
    const pendingReads = new Set(), exits = new Map(), motions = new Map();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let unreadSnapshot = null, pendingReadAll = false, previewGeneration = 0;
    let stopped = false, current = null, generation = 0, detailRequest = 0, selection = null, busy = false;
    let detailRefresh = null, detailDirty = false;
    let popLoading = false, popDirty = false, fullLoading = false, fullDirty = false;
    let filter = "all", next = null, fullOpen = false, fullInitialized = false, fullFailed = false;
    let kindFilter = "", deleteSelection = null, deleteAnchor = null;
    let levelFilter = "", originFilter = "", searchQuery = "", searchTimer = 0, searchOpen = false, searchIndex = -1;
    let searchedLocale;
    let fullRows = [], fullRevision = null, fullFrame = 0, fullFrameWindow = null, fullWindow = "", listRequest = 0;
    const fullIds = new Map(), errorStates = new WeakMap();
    let restorePoint = null, detailAnchor = null, detailMode = null, helpActive = null, helpTimer = 0;
    const helpControls = [], detailParking = document.createDocumentFragment();
    let observedControls = null, observedParent = null, observedHeader = null, observingSettings = false;
    let mountWaiting = false, mountWaitAt = 0;

    function element(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (typeof text === "function") bindLabel(node, "textContent", text);
      else if (text !== undefined) node.textContent = text;
      return node;
    }
    function button(label, action, className = "st-mc-button") {
      const node = element("button", className, label);
      node.type = "button"; node.dataset.action = action;
      return node;
    }
    function icon() { const node = element("span", "st-mc-icon"); node.setAttribute("aria-hidden", "true"); return node; }
    function sourceIcon(path, brand = false) {
      const node = element(brand ? "img" : "span", brand ? "st-mc-source-image" : "st-mc-source-icon");
      node.setAttribute("aria-hidden", "true");
      if (brand) { node.src = api.path.url(path); node.alt = ""; }
      else node.style.setProperty("--st-mc-source-image", `url("${api.path.url(path)}")`);
      return node;
    }
    function helpButton() {
      const node = element("button", "st-mc-icon-button st-mc-help"); node.type = "button";
      const tip = element("span", "st-mc-help-tip"), copy = element("span", "st-mc-help-copy"), count = element("span", "st-mc-help-storage");
      tip.id = DIALOG + "Help" + helpControls.length; tip.setAttribute("popover", "manual"); tip.setAttribute("role", "tooltip");
      const paragraphs = () => text("messageCenter.help", HELP).split("\n");
      paragraphs().forEach((_, index) => copy.appendChild(element("span", "st-mc-help-paragraph", () => paragraphs()[index])));
      tip.append(copy, element("span", "st-mc-help-note", () => text("messageCenter.unreadQuota", "未读消息不占用已读条数额度。")), count);
      bindLabel(node, "aria-label", () => text("messageCenter.about", "关于消息中心")); node.setAttribute("aria-describedby", tip.id);
      const entry = { node, tip, count };
      entry.show = () => showHelp(entry); entry.leave = event => { if (!node.contains(event.relatedTarget)) scheduleHelpClose(); };
      node.addEventListener("pointerenter", entry.show); node.addEventListener("focus", entry.show);
      node.addEventListener("pointerleave", entry.leave); node.addEventListener("focusout", entry.leave);
      node.append(sourceIcon("images/ui/message-help.svg"), tip); helpControls.push(entry);
      return node;
    }
    function helpCount(entry) { entry.count.textContent = text("messageCenter.retention", "已读消息最多保留 $value$ 条，消息内容保留30天。等待交互的消息保留至任务结束。", model.READ_LIMIT); }
    function closeHelp() {
      if (helpTimer) window.clearTimeout(helpTimer); helpTimer = 0;
      const entry = helpActive; helpActive = null;
      entry?.view?.removeEventListener("resize", closeHelp);
      if (entry?.tip.matches(":popover-open")) entry.tip.hidePopover();
    }
    function scheduleHelpClose() {
      if (helpTimer) window.clearTimeout(helpTimer);
      helpTimer = window.setTimeout(() => { helpTimer = 0; if (helpActive && !helpActive.node.matches(":hover,:focus-within")) closeHelp(); }, 120);
    }
    function showHelp(entry) {
      if (stopped) return;
      if (helpTimer) window.clearTimeout(helpTimer); helpTimer = 0;
      if (helpActive === entry) return;
      closeHelp(); helpCount(entry); helpActive = entry;
      const view = entry.node.ownerDocument.defaultView, anchor = entry.node.getBoundingClientRect();
      entry.view = view; view.addEventListener("resize", closeHelp);
      const belowRoom = view.innerHeight - anchor.bottom - 16, aboveRoom = anchor.top - 16, placeBelow = belowRoom >= aboveRoom;
      entry.tip.style.maxHeight = `${Math.max(64, placeBelow ? belowRoom : aboveRoom)}px`; entry.tip.showPopover();
      const box = entry.tip.getBoundingClientRect();
      entry.tip.style.left = `${Math.max(8, Math.min(anchor.left, view.innerWidth - box.width - 8))}px`;
      entry.tip.style.top = `${placeBelow ? anchor.bottom + 8 : Math.max(8, anchor.top - box.height - 8)}px`;
    }
    function updateActionButton(node) {
      const running = actionBusy.get(node.dataset.messageId);
      node.disabled = node.dataset.available === "false" || running !== undefined || pendingReadAll || pendingReads.has(node.dataset.messageId) || exits.has(node.dataset.messageId);
      const retrying = node.dataset.icon === "retry" && running?.actionId === node.dataset.actionId;
      node.classList.toggle("st-mc-is-retrying", retrying);
      node.setAttribute("aria-busy", String(retrying));
      updateActionLabel(node);
    }
    function updateActionLabel(node) {
      const description = node.getAttribute("aria-busy") === "true" ? text("messageCenter.retrying", "重试中") : node.dataset.label;
      node.setAttribute("aria-label", description);
      node.title = node.dataset.available === "false" ? text("messageCenter.unavailable", "此操作已结束或暂不可用") : description;
      const label = node.querySelector(".st-mc-retry-label");
      if (label) label.textContent = description;
    }
    function actionButton(action, messageId, compact = false) {
      const retry = action.icon === "retry", iconOnly = compact && action.icon;
      const node = button(iconOnly || retry ? "" : action.label, "message-action", iconOnly ? "st-mc-icon-button" : "st-mc-button");
      node.dataset.messageId = messageId; node.dataset.actionId = action.id;
      if (typeof action.label === "function") bindLabel(node, "data-label", action.label);
      else node.dataset.label = action.label;
      node.dataset.available = String(action.available !== false);
      node.dataset.icon = action.icon || ""; node.dataset.kind = action.kind || "";
      if (retry && !iconOnly) node.appendChild(element("span", "st-mc-retry-label", action.label));
      if (action.icon) {
        const image = element("span", "st-mc-action-icon"); image.setAttribute("aria-hidden", "true");
        image.style.setProperty("--st-mc-action-image", `url("${api.path.url(model.ICONS[action.icon])}")`);
        node.prepend(image);
      }
      updateActionButton(node);
      return node;
    }
    function iconButton(label, action, iconName) {
      const node = actionButton({ id: action, label, icon: iconName }, "");
      node.dataset.action = action;
      return node;
    }
    function clearUnreadButton() {
      const node = actionButton({ id: "clear-unread", label: () => text("messageCenter.clearUnread", "清除未读"), icon: "clear" }, "", true);
      node.dataset.action = "read-all"; node.disabled = true;
      return node;
    }
    function deleteAllButton() {
      const node = actionButton({ id: "delete-all", label: () => text("messageCenter.deleteAll", "删除全部消息"), icon: "delete" }, "", true);
      node.dataset.action = "delete-all"; node.disabled = true;
      return node;
    }
    function actionsFor(message, compact) {
      const group = element("div", compact ? "st-mc-inline-actions" : "st-mc-actions");
      for (const raw of message.actions || []) {
        let action = raw;
        if (message.moduleId === "update") {
          if (raw.id === "go-update") action = { ...raw, label: () => text("messageCenter.goUpdate", "去更新") };
          if (raw.id === "ignore-version") action = { ...raw, label: () => text("messageCenter.ignoreVersion", "不再提醒") };
          if (raw.id === "view-changelog") action = { ...raw, label: () => text("messageCenter.view", "查看") };
        }
        const control = actionButton({ ...action, available: raw.available }, message.id, compact);
        group.appendChild(control);
      }
      return group;
    }
    let dateFormatter, dateLocale;
    function date(time) {
      const locale = window.STI18n?.intlLocale?.() || "zh-CN";
      if (locale !== dateLocale) {
        dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "medium" });
        dateLocale = locale;
      }
      return dateFormatter.format(time);
    }

    // 已存消息共用卡片结构；业务结果与已读状态独立展示。
    function cardView(message) {
      return { ...model.presentation(message), preview: model.displayContent(message, true), createdAt: message.createdAt, level: message.level };
    }
    function updateCardLabel(card, message, view) {
      card.open.setAttribute("aria-label", (message.readAt === null ? text("messageCenter.unreadPrefix", "未读：") : "") + view.title + text("messageCenter.detailLabel", "$value$：", "") + view.preview);
    }
    function makeCard(view, action) {
      const node = element("article", "st-mc-card"), open = button("", action, "st-mc-open");
      const thumb = element("span", "st-mc-thumb"); thumb.appendChild(sourceIcon(view.icon, view.brand));
      const copy = element("span", "st-mc-copy"), line = element("span", "st-mc-line"), title = element("span", "st-mc-title"), meta = element("time", "st-mc-meta"), summary = element("span", "st-mc-summary");
      line.append(title, meta); copy.append(line, summary); open.append(thumb, copy);
      const dot = element("span", "st-mc-dot"); dot.hidden = true; dot.setAttribute("aria-hidden", "true"); node.append(open, dot);
      const card = { node, open, title, meta, summary, dot, actions: null, actionSignature: null };
      updateCard(card, view); return card;
    }
    function updateCard(card, view) {
      card.title.textContent = view.title; card.summary.textContent = view.preview;
      card.node.dataset.level = view.level;
      card.meta.hidden = view.createdAt === undefined;
      if (view.createdAt !== undefined) { card.meta.textContent = date(view.createdAt); card.meta.dateTime = new Date(view.createdAt).toISOString(); }
    }

    const style = api.styles.ensureStyle("__RickyMessageCenterStyle", window.STComponents.css.compose(
      window.STComponents.css.variables(".st-mc-operation, .st-mc-delete-confirm", window.STTheme.flatDialogVariables),
      window.STComponents.css.button(".st-mc-button", { variant: "secondary", minHeight: "28px", padding: "4px 8px", fontSize: "12px" }),
      window.STComponents.css.button(".st-mc-operation-primary", { variant: "primary", minHeight: "32px" }),
      window.STComponents.css.dialog({ surfaceSelectors: ".st-mc-operation", openSurfaceSelectors: ".st-mc-operation[open]", headerSelectors: ".st-mc-operation-head", titleSelectors: ".st-mc-operation-title", closeSelectors: ".st-mc-operation-close", bodySelectors: ".st-mc-operation-body", footerSelectors: ".st-mc-operation-foot" }),
      `
      #${ROOT}, #${PANEL}, #${PANEL} *, #${DIALOG}, #${DIALOG} *, #${DETAIL}, #${DETAIL} * { box-sizing: border-box; font-family: var(--st-font-family-base); }
      #${ROOT} { flex: 0 0 48px; width: 48px; height: 24px; margin-right: 8px; -webkit-app-region: no-drag; }
      #${ROOT} .st-mc-trigger { position: relative; display: flex; align-items: center; justify-content: center; width: 48px; height: 24px; padding: 0; border: 0; border-radius: 2px; color: var(--st-color-steam-message-icon); background: var(--st-color-steam-property-button); cursor: pointer; }
      #${ROOT} .st-mc-trigger:hover, #${ROOT} .st-mc-trigger[aria-expanded="true"] { color: var(--st-color-white); background: var(--st-color-steam-toolbar-button-bg); }
      #${ROOT} .st-mc-trigger[data-unread="true"] { color: var(--st-color-white); background: var(--st-color-success-steam); }
      #${ROOT} .st-mc-trigger[data-error="true"] { color: var(--st-color-white); background: var(--st-color-danger); }
      .st-mc-icon { display: inline-block; flex: 0 0 auto; width: 16px; height: 16px; background: currentColor; mask: url("${api.path.url("images/ui/message-center.svg")}") center / contain no-repeat; }
      #${ROOT} .st-mc-badge { position: absolute; right: 2px; top: -4px; min-width: 13px; padding: 0 2px; border-radius: 2px; color: var(--st-color-white); background: var(--st-color-success); font-size: 10px; line-height: 14px; }
      #${ROOT} .st-mc-badge[hidden] { display: none; }
      #${ROOT} [hidden] { display: none; }
      #${ROOT}[data-mode="navigation"] { flex: 0 0 auto; align-self: center; width: auto; height: 28px; margin: 0 0 0 8px; font: inherit; }
      #${ROOT}[data-mode="navigation"] .st-mc-trigger { gap: 4px; width: auto; height: 100%; padding: 0 4px; color: var(--st-color-text-secondary); background: none; font: inherit; white-space: nowrap; }
      #${ROOT}[data-mode="navigation"] .st-mc-trigger:hover, #${ROOT}[data-mode="navigation"] .st-mc-trigger[aria-expanded="true"] { color: var(--st-color-steam-blue); }
      #${ROOT}[data-mode="navigation"] .st-mc-trigger[data-error="true"] { color: var(--st-color-danger-text); }
      #${ROOT}[data-mode="navigation"] .st-mc-badge { position: static; display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 9px; font-size: 11px; line-height: 18px; }
      #${ROOT}[data-mode="navigation"] .st-mc-badge[hidden] { display: none; }
      #${PANEL}, #${DIALOG}, #${DETAIL} { padding: 0; border: 1px solid var(--st-color-black); border-radius: 2px; color: var(--st-color-white); background: var(--st-color-steam-message-surface); box-shadow: var(--st-shadow-panel-menu); font-size: 12px; text-align: left; overflow: hidden; }
      #${PANEL} { position: relative; margin: 0; width: 100%; padding-bottom: 8px; }
      #${DIALOG} { width: 100%; height: 100%; margin: 0; display: flex; flex-direction: column; }
      #${PANEL}:focus, #${DIALOG}:focus, #${DETAIL}:focus { outline: none; }
      .st-mc-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 56px; padding: 0 16px; }
      .st-mc-head h2 { margin: 0; font-size: 16px; font-weight: 600; }
      .st-mc-heading { display: flex; align-items: center; gap: 0; min-width: 0; }
      .st-mc-heading h2 { margin-right: 4px; }
      .st-mc-heading > .st-mc-icon-button { flex-basis: 24px; width: 24px; height: 24px; padding: 4px; }
      .st-mc-icon-button { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 28px; width: 28px; height: 28px; padding: 4px; border: 0; border-radius: 2px; color: var(--st-color-text-muted); background: none; cursor: pointer; }
      .st-mc-icon-button:hover { color: var(--st-color-white); background: var(--st-color-surface-subtle-hover); }
      .st-mc-icon-button:disabled { opacity: .45; cursor: default; }
      .st-mc-action-icon { display: inline-block; flex: 0 0 16px; width: 16px; height: 16px; background: currentColor; mask: var(--st-mc-action-image) center / contain no-repeat; }
      .st-mc-source-icon { display: inline-block; flex: 0 0 auto; width: 24px; height: 24px; background: currentColor; mask: var(--st-mc-source-image) center / contain no-repeat; }
      .st-mc-source-image { display: block; width: 32px; height: 32px; object-fit: contain; }
      .st-mc-icon-button .st-mc-source-icon { width: 16px; height: 16px; }
      .st-mc-is-retrying .st-mc-action-icon { animation: st-mc-retry-spin .8s linear infinite; }
      /* 进行中的家庭库按钮可重开提示，其他忙碌按钮仍由公共样式阻断点击 */
      .st-mc-button.st-mc-is-retrying:not(:disabled) { pointer-events: auto; cursor: pointer; }
      @keyframes st-mc-retry-spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { .st-mc-is-retrying .st-mc-action-icon { animation: none; } }
      .st-mc-error .st-mc-button { margin-left: 8px; }
      .st-mc-inline-actions { display: flex; flex: 0 0 auto; gap: 0; align-items: center; padding-right: 8px; }
      .st-mc-inline-actions:empty { display: none; }
      .st-mc-business { display: block; color: var(--st-color-steam-blue); font-size: 11px; }
      .st-mc-list { min-height: 0; max-height: var(--st-mc-menu-list-height); overflow-y: auto; overscroll-behavior: contain; padding: 0 8px 8px; }
      .st-mc-list, .st-mc-detail { --st-mc-scrollbar-thumb: var(--st-color-text-disabled-alt); --st-mc-scrollbar-track: var(--st-color-surface-subtle); scrollbar-color: var(--st-mc-scrollbar-thumb) var(--st-mc-scrollbar-track); scrollbar-width: thin; }
      .st-mc-list:hover, .st-mc-detail:hover { --st-mc-scrollbar-thumb: var(--st-color-text-disabled-strong); }
      @supports not (scrollbar-color: auto) {
        .st-mc-list::-webkit-scrollbar, .st-mc-detail::-webkit-scrollbar { width: 8px; }
        .st-mc-list::-webkit-scrollbar-thumb, .st-mc-detail::-webkit-scrollbar-thumb { background: var(--st-mc-scrollbar-thumb); border-radius: 8px; }
        .st-mc-list::-webkit-scrollbar-track, .st-mc-detail::-webkit-scrollbar-track { background: var(--st-mc-scrollbar-track); }
      }
      #${PANEL} .st-mc-list { padding-bottom: 0; }
      #${DIALOG} .st-mc-list { flex: 1; min-height: 0; max-height: none; }
      .st-mc-virtual-rows .st-mc-card { height: ${ROW_HEIGHT - 8}px; margin: 0 0 8px; }
      .st-mc-virtual-rows .st-mc-open { height: 100%; min-height: 0; }
      .st-mc-load-state { display: flex; justify-content: center; align-items: center; min-height: 32px; color: var(--st-color-text-muted); }
      .st-mc-card { --st-mc-card-bg: color-mix(in srgb, var(--st-color-white) 5%, var(--st-color-steam-message-surface)); position: relative; isolation: isolate; display: flex; align-items: stretch; height: 88px; min-width: 0; margin: 0 0 8px; border: 1px solid var(--st-color-border-normal); border-radius: 8px; background: var(--st-mc-card-bg); overflow: hidden; }
      .st-mc-card[data-level="error"] { border-color: color-mix(in srgb, var(--st-color-danger-soft) 38%, var(--st-mc-card-bg)); }
      .st-mc-card[data-level="warning"] { border-color: color-mix(in srgb, var(--st-color-steam-blue) 32%, var(--st-mc-card-bg)); }
      .st-mc-card[data-level="success"] { border-color: color-mix(in srgb, var(--st-color-success-text) 32%, var(--st-mc-card-bg)); }
      #${PANEL} .st-mc-card { translate: 0px; transform: translateY(0); }
      .st-mc-card:hover, .st-mc-card:focus-within { --st-mc-card-bg: color-mix(in srgb, var(--st-color-white) 10%, var(--st-color-steam-message-surface)); }
      .st-mc-open { display: grid; grid-template-columns: 40px minmax(0, 1fr); align-items: center; gap: 8px; flex: 1; width: 100%; min-width: 0; min-height: 80px; padding: 8px; border: 0; color: inherit; background: none; text-align: left; cursor: pointer; font: inherit; }
      .st-mc-thumb { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 8px; color: var(--st-color-steam-blue); background: var(--st-color-surface-inset); }
      .st-mc-copy { display: block; min-width: 0; padding-right: 0; }
      .st-mc-line { position: relative; z-index: 2; display: flex; align-items: baseline; gap: 8px; min-width: 0; pointer-events: none; }
      .st-mc-meta { flex: 0 0 auto; color: var(--st-color-text-muted); font-size: 10px; white-space: nowrap; }
      .st-mc-title { display: block; min-width: 0; flex: 0 1 auto; color: var(--st-color-text-primary); font-size: 13px; font-weight: 600; line-height: 18px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      .st-mc-summary { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; margin-top: 8px; color: var(--st-color-text-secondary); font-size: 12px; line-height: 16px; overflow: hidden; white-space: normal; overflow-wrap: anywhere; }
      #${PANEL} .st-mc-inline-actions { position: absolute; z-index: 1; right: 4px; top: 4px; bottom: 4px; gap: 4px; padding: 0 4px; opacity: 0; visibility: hidden; pointer-events: none; transform: translateX(4px); transition: opacity 160ms ease-out, transform 160ms ease-out, visibility 160ms; }
      #${PANEL} .st-mc-inline-actions::before { content: ""; position: absolute; z-index: -1; inset: 0 0 0 -32px; border-radius: 0 6px 6px 0; background: linear-gradient(to right, transparent, var(--st-mc-card-bg) 32px); pointer-events: none; }
      #${PANEL} .st-mc-inline-actions .st-mc-icon-button { color: var(--st-color-text-primary); }
      #${PANEL} .st-mc-card:hover .st-mc-inline-actions, #${PANEL} .st-mc-card:focus-within .st-mc-inline-actions { opacity: 1; visibility: visible; pointer-events: auto; transform: translateX(0); }
      @media (prefers-reduced-motion: reduce) { #${PANEL} .st-mc-inline-actions { transition: none; } }
      .st-mc-dot { position: absolute; z-index: 3; right: 8px; top: 12px; width: 6px; height: 6px; border-radius: 50%; background: var(--st-color-success); pointer-events: none; }
      .st-mc-dot[hidden] { display: none; }
      .st-mc-tools { position: relative; z-index: 2; display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, 300px); align-items: center; gap: 8px 16px; padding: 8px 16px 16px; border-bottom: 1px solid var(--st-color-border-normal); }
      .st-mc-filter-row { display: flex; align-items: center; gap: 4px; min-height: 32px; }
      .st-mc-filter-label { margin-right: 4px; color: var(--st-color-text-muted); font-size: 11px; }
      .st-mc-filter-row .st-mc-button { border-radius: 8px; }
      .st-mc-search { position: relative; grid-column: 2; grid-row: 1 / 3; min-width: 0; }
      .st-mc-search-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; color: var(--st-color-text-muted); font-size: 11px; }
      .st-mc-search-box { display: flex; align-items: center; gap: 4px; min-height: 36px; padding: 0 8px; border: 1px solid var(--st-color-border-normal); border-radius: 8px; background: var(--st-color-surface-inset); }
      .st-mc-search-box:focus-within { border-color: var(--st-color-steam-blue); }
      .st-mc-search-input { flex: 1; min-width: 0; width: 100%; height: 34px; padding: 0; border: 0; outline: none; color: var(--st-color-text-primary); background: transparent; font: inherit; }
      .st-mc-source-chip { display: inline-flex; align-items: center; gap: 4px; max-width: 128px; padding: 2px 4px; border: 0; border-radius: 4px; background: var(--st-color-surface-subtle-hover); color: var(--st-color-steam-blue); font: inherit; font-size: 11px; cursor: pointer; }
      .st-mc-source-chip span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      .st-mc-source-menu { position: absolute; top: calc(100% + 4px); left: 0; right: 0; padding: 4px; border: 1px solid var(--st-color-border-hover); border-radius: 8px; box-shadow: var(--st-shadow-panel-menu); background: var(--st-color-steam-message-surface); }
      .st-mc-source-option { display: block; width: 100%; padding: 8px; border: 0; border-radius: 4px; background: none; color: var(--st-color-text-primary); font: inherit; text-align: left; cursor: pointer; }
      .st-mc-source-option:hover, .st-mc-source-option[aria-selected="true"] { background: var(--st-color-surface-subtle-hover); color: var(--st-color-steam-blue); }
      .st-mc-source-empty { display: block; padding: 8px; color: var(--st-color-text-muted); font-size: 11px; }
      @media (max-width: 620px) { .st-mc-tools { grid-template-columns: minmax(0,1fr); } .st-mc-search { grid-column: 1; grid-row: 3; } }
      .st-mc-tools [aria-pressed="true"] { color: var(--st-color-white); background: var(--st-color-steam-toolbar-button-bg); }
      .st-mc-count { color: var(--st-color-text-muted); font-size: 11px; }
      .st-mc-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 152px; padding: 24px; text-align: center; color: var(--st-color-text-muted); }
      .st-mc-empty .st-mc-icon { width: 32px; height: 32px; margin-bottom: 8px; }
      .st-mc-empty strong { color: var(--st-color-text-primary); font-size: 14px; font-weight: 400; }
      #${DETAIL} { display: flex; flex-direction: column; width: min(560px, var(--st-mc-detail-max-width)); height: min(420px, var(--st-mc-detail-max-height)); max-width: var(--st-mc-detail-max-width); max-height: var(--st-mc-detail-max-height); }
      .st-mc-detail-modal { box-sizing: border-box; width: min(560px, calc(100% - 32px)); height: min(420px, calc(100% - 32px)); max-width: none; max-height: none; padding: 0; border: 1px solid var(--st-color-black); border-radius: 8px; background: var(--st-color-steam-message-surface); box-shadow: var(--st-shadow-panel-menu); overflow: hidden; overscroll-behavior: contain; }
      .st-mc-detail-modal::backdrop { background: var(--st-color-overlay); overflow: hidden; overscroll-behavior: contain; }
      .st-mc-detail-modal #${DETAIL} { width: 100%; height: 100%; min-width: 0; max-width: none; max-height: none; border: 0; border-radius: 0; box-shadow: none; }
      .st-mc-help-tip { box-sizing: border-box; width: min(320px, calc(100vw - 16px)); max-height: calc(100vh - 16px); inset: auto; margin: 0; padding: 12px; border: 1px solid var(--st-color-border-hover); border-radius: 8px; color: var(--st-color-text-secondary); background: var(--st-color-steam-message-surface); box-shadow: var(--st-shadow-panel-menu); overflow: hidden; text-align: left; white-space: normal; font: 12px/18px var(--st-font-family-base); }
      .st-mc-help-tip:popover-open { display: flex; flex-direction: column; }
      .st-mc-help-copy { display: block; min-height: 0; overflow: auto; }
      .st-mc-help-paragraph { display: block; margin-bottom: 8px; }
      .st-mc-help-note { display: block; flex: 0 0 auto; padding-top: 8px; border-top: 1px solid var(--st-color-border-normal); color: var(--st-color-text-muted); }
      .st-mc-help-storage { display: block; flex: 0 0 auto; }
      .st-mc-delete-confirm { color: var(--st-dialog-text-color); background: var(--st-dialog-surface-raised); border: 1px solid var(--st-dialog-border); border-radius: var(--st-dialog-radius); box-shadow: var(--st-dialog-shadow); overscroll-behavior: contain; }
      .st-mc-delete-confirm::backdrop { background: var(--st-color-overlay); overflow: hidden; overscroll-behavior: contain; }
      .st-mc-detail-head { display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between; gap: 16px; min-height: 48px; padding: 0 16px; border-bottom: 1px solid var(--st-color-surface-subtle); }
      .st-mc-detail-head h2 { margin: 0; font-size: 16px; }
      .st-mc-detail { flex: 1 1 auto; min-height: 0; padding: 12px 16px; overflow: auto; overflow-wrap: anywhere; overscroll-behavior: contain; }
      .st-mc-detail h3 { font-size: 18px; line-height: 26px; margin: 8px 0; overflow-wrap: anywhere; }
      .st-mc-detail p { color: var(--st-color-text-secondary); line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
      .st-mc-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 24px; }
      .st-mc-detail-footer { flex: 0 0 auto; padding: 12px 16px 16px; border-top: 1px solid var(--st-color-surface-subtle); }
      .st-mc-detail-footer .st-mc-actions { margin: 0; }
      .st-mc-delete-confirm { box-sizing: border-box; width: min(420px, calc(100% - 32px)); max-height: calc(100% - 32px); padding: 20px; }
      .st-mc-delete-confirm h2 { margin: 0 0 12px; font-size: 16px; }
      .st-mc-delete-confirm p { margin: 0 0 20px; line-height: 1.6; color: var(--st-color-text-secondary); }
      .st-mc-confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
      [data-action="delete-all"], [data-action="delete"], [data-action="confirm-delete-all"] { color: var(--st-color-danger-text); }
      .st-mc-error { flex: 0 0 auto; min-width: 0; margin: 8px; padding: 0; }
      .st-mc-error:empty { display: none; }
      .st-mc-error strong { display: block; color: var(--st-color-danger-text); margin-bottom: 4px; }
      .st-mc-error span { display: block; color: var(--st-color-text-secondary); white-space: pre-wrap; overflow-wrap: anywhere; }
      .st-mc-delete-confirm .st-mc-error { margin: 0 0 16px; }
      .st-mc-close { padding: 4px 8px; border: 0; color: var(--st-color-text-muted); background: none; font: inherit; font-size: 20px; cursor: pointer; }
      .st-mc-operation[open] { display: flex; flex-direction: column; width: min(400px, calc(100% - 24px)); max-height: calc(100% - 16px); margin: auto; padding: 0; overscroll-behavior: contain; }
      .st-mc-operation::backdrop { background: var(--st-color-overlay); }
      .st-mc-operation-head { flex: 0 0 auto; }
      .st-mc-operation-body { display: flex; gap: 12px; align-items: flex-start; min-height: 0; overflow-y: auto; overflow-wrap: anywhere; }
      .st-mc-operation-copy { min-width: 0; white-space: pre-wrap; line-height: 1.5; }
      .st-mc-operation-mark { flex: 0 0 22px; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; font-size: 16px; font-weight: 700; }
      .st-mc-operation[data-state="error"] .st-mc-operation-mark, .st-mc-operation[data-state="timeout"] .st-mc-operation-mark { color: var(--st-color-danger-text); }
      .st-mc-operation-foot { flex: 0 0 auto; border-top: 1px solid var(--st-dialog-divider); }
      #${ROOT} button:focus-visible, #${PANEL} button:focus-visible, #${DIALOG} button:focus-visible { outline: 2px solid var(--st-color-steam-blue); outline-offset: -2px; }
      #${PANEL} .st-mc-open:focus-visible, #${DIALOG} .st-mc-open:focus-visible { outline: 1px dashed var(--st-color-text-muted); outline-offset: -4px; }
      #${PANEL} [hidden], #${DIALOG} [hidden] { display: none; }
      `,
    ));

    const root = element("div"); root.id = ROOT; root.dataset.mode = navigation ? "navigation" : "toolbar";
    const trigger = button("", "toggle", "st-mc-trigger");
    bindLabel(trigger, "title", () => text("messageCenter.steamMessages", "Steam Buff 消息")); bindLabel(trigger, "aria-label", () => text("messageCenter.steamMessages", "Steam Buff 消息"));
    trigger.setAttribute("aria-expanded", "false"); trigger.setAttribute("aria-haspopup", "dialog");
    const triggerIcon = icon(), triggerLabel = element("span", "st-mc-trigger-title", () => text("messageCenter.navigationLabel", "消息中心"));
    triggerIcon.hidden = navigation; triggerLabel.hidden = !navigation; trigger.append(triggerIcon, triggerLabel);
    const badge = element("span", "st-mc-badge"); badge.hidden = true; badge.setAttribute("aria-hidden", "true");
    trigger.appendChild(badge); root.appendChild(trigger);

    const panel = element("section"); panel.id = PANEL; panel.tabIndex = -1; panel.setAttribute("role", "dialog"); bindLabel(panel, "aria-label", () => text("messageCenter.steamCenter", "Steam Buff 消息中心"));
    const popHead = element("header", "st-mc-head"), heading = element("div", "st-mc-heading");
    const clearUnread = clearUnreadButton();
    heading.append(element("h2", "", () => text("messageCenter.navigationLabel", "消息中心")), helpButton(), clearUnread); popHead.append(heading, button(() => text("messageCenter.viewAll", "查看全部"), "all"));
    const popList = element("div", "st-mc-list");
    const popError = element("div", "st-mc-error"); popError.setAttribute("role", "status");
    panel.append(popHead, popList, popError);

    const dialog = element("section"); dialog.id = DIALOG; dialog.tabIndex = -1; dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); dialog.setAttribute("aria-labelledby", `${DIALOG}Title`);
    const fullHead = element("header", "st-mc-head"), fullHeading = element("div", "st-mc-heading"), fullTitle = element("h2", "", () => text("messageCenter.fullTitle", "Steam Buff · 消息中心")), fullRead = clearUnreadButton(), fullDeleteAll = deleteAllButton(); fullTitle.id = `${DIALOG}Title`;
    fullHeading.append(fullTitle, helpButton(), fullRead, fullDeleteAll);
    const close = button("×", "close", "st-mc-close"); bindLabel(close, "aria-label", () => text("messageCenter.closeCenter", "关闭消息中心")); fullHead.append(fullHeading, close);
    const tools = element("div", "st-mc-tools"), all = button(() => text("messageCenter.all", "全部"), "filter-all"), unread = button(() => text("messageCenter.unread", "未读"), "filter-unread"), read = button(() => text("messageCenter.read", "已读"), "filter-read");
    const readFilters = element("div", "st-mc-filter-row"), levelFilters = element("div", "st-mc-filter-row");
    readFilters.append(element("span", "st-mc-filter-label", () => text("messageCenter.messages", "消息")), all, unread, read);
    levelFilters.appendChild(element("span", "st-mc-filter-label", () => text("messageCenter.levels", "级别")));
    const levelButtons = new Map();
    for (const [value, label] of Object.entries(model.LEVELS)) {
      const node = button(() => text(`messageCenter.level.${value}`, label), "level-" + value); node.setAttribute("aria-pressed", "false"); bindLabel(node, "title", () => text("messageCenter.clearLevel", "再次点击取消此级别筛选")); levelButtons.set(value, node); levelFilters.appendChild(node);
    }
    const kindFilters = element("div", "st-mc-filter-row"), kindButtons = new Map();
    kindFilters.appendChild(element("span", "st-mc-filter-label", () => text("messageCenter.types", "类型")));
    for (const [value, label] of Object.entries(model.TYPES)) {
      const node = button(() => text(`messageCenter.type.${value}`, label), "kind-" + value); node.setAttribute("aria-pressed", "false"); kindButtons.set(value, node); kindFilters.appendChild(node);
    }
    const fullCount = element("span", "st-mc-count");
    const searchField = element("div", "st-mc-search"), searchHead = element("div", "st-mc-search-head"), searchBox = element("div", "st-mc-search-box");
    const searchInput = element("input", "st-mc-search-input"); searchInput.type = "search"; searchInput.maxLength = 200; bindLabel(searchInput, "placeholder", () => text("messageCenter.search", "搜索来源或消息内容"));
    bindLabel(searchInput, "aria-label", () => text("messageCenter.search", "搜索来源或消息内容")); searchInput.setAttribute("role", "combobox"); searchInput.setAttribute("aria-autocomplete", "list"); searchInput.setAttribute("aria-expanded", "false");
    const sourceMenu = element("div", "st-mc-source-menu"); sourceMenu.id = DIALOG + "Sources"; sourceMenu.hidden = true; sourceMenu.setAttribute("role", "listbox"); bindLabel(sourceMenu, "aria-label", () => text("messageCenter.source", "消息来源"));
    searchInput.setAttribute("aria-controls", sourceMenu.id);
    const sourceChip = button("", "clear-origin", "st-mc-source-chip"); sourceChip.hidden = true; sourceChip.append(element("span"), element("span", "", "×")); bindLabel(sourceChip, "title", () => text("messageCenter.clearSource", "取消来源筛选"));
    const searchClear = button("×", "search-clear", "st-mc-icon-button"); bindLabel(searchClear, "aria-label", () => text("messageCenter.clearSearch", "清空搜索")); bindLabel(searchClear, "title", () => text("messageCenter.clearSearch", "清空搜索"));
    searchHead.append(element("span", "", () => text("messageCenter.sourceText", "来源与正文")), fullCount); searchBox.append(sourceChip, searchInput, searchClear); searchField.append(searchHead, searchBox, sourceMenu);
    tools.append(readFilters, kindFilters, levelFilters, searchField);
    function closeSources() {
      searchOpen = false; sourceMenu.hidden = true; searchIndex = -1;
      searchInput.setAttribute("aria-expanded", "false"); searchInput.removeAttribute("aria-activedescendant");
    }
    function showSources() {
      const query = model.searchText(searchInput.value);
      sourceMenu.replaceChildren();
      const options = [{ id: "", title: text("messageCenter.allSources", "全部来源") }, ...model.origins(current?.modules || []).filter(item => !query || model.searchText(item.title).includes(query))];
      for (const [index, item] of options.entries()) {
        const node = button(item.title, "origin", "st-mc-source-option"); node.dataset.origin = item.id; node.id = sourceMenu.id + index;
        node.setAttribute("role", "option"); node.setAttribute("aria-selected", String(item.id === originFilter)); node.tabIndex = -1; sourceMenu.appendChild(node);
      }
      if (query) sourceMenu.appendChild(element("span", "st-mc-source-empty", () => text("messageCenter.searchHint", "也可直接输入关键词搜索完整正文")));
      searchOpen = true; searchIndex = -1; sourceMenu.hidden = false; searchInput.setAttribute("aria-expanded", "true"); searchInput.removeAttribute("aria-activedescendant");
    }
    function syncFilters() {
      for (const [value, node] of [["all", all], ["unread", unread], ["read", read]]) node.setAttribute("aria-pressed", String(filter === value));
      for (const [value, node] of levelButtons) node.setAttribute("aria-pressed", String(levelFilter === value));
      for (const [value, node] of kindButtons) node.setAttribute("aria-pressed", String(kindFilter === value));
      sourceChip.hidden = !originFilter;
      if (originFilter) sourceChip.firstElementChild.textContent = model.origins(current?.modules || []).find(item => item.id === originFilter)?.title || originFilter;
    }
    function clearSearchTimer() { if (searchTimer) window.clearTimeout(searchTimer); searchTimer = 0; }
    function filterChanged(delay = false) {
      clearSearchTimer(); generation++; listRequest++; fullLoading = false; cancelFullFrame(); restorePoint = null; fullRows = []; fullIds.clear(); fullCards.clear(); fullInitialized = false; fullDirty = false; next = null;
      syncFilters(); updateCount();
      status(fullList, () => searchQuery ? text("messageCenter.searching", "正在搜索") : text("messageCenter.loading", "正在加载"), () => text("messageCenter.readingMatches", "正在读取符合条件的消息…"));
      if (delay) searchTimer = window.setTimeout(() => { searchTimer = 0; if (!stopped && fullOpen) showList(); }, 300);
      else if (fullOpen) showList();
    }
    function onSearchInput(event) {
      clearSearchTimer();
      if (event.isComposing) return;
      showSources();
      const query = model.searchText(searchInput.value);
      if (query === searchQuery) return;
      searchQuery = query; filterChanged(true);
    }
    function onSearchKey(event) {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault(); if (!searchOpen) showSources();
        const options = [...sourceMenu.querySelectorAll(".st-mc-source-option")];
        searchIndex = Math.max(0, Math.min(options.length - 1, searchIndex + (event.key === "ArrowDown" ? 1 : -1)));
        options.forEach((node, index) => node.setAttribute("aria-selected", String(index === searchIndex)));
        searchInput.setAttribute("aria-activedescendant", options[searchIndex].id);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const option = searchIndex < 0 ? null : sourceMenu.querySelectorAll(".st-mc-source-option")[searchIndex];
        if (searchOpen && option) option.click(); else { closeSources(); searchQuery = model.searchText(searchInput.value); filterChanged(); }
      }
    }
    function onSearchBlur(event) { if (!searchField.contains(event.relatedTarget)) closeSources(); }
    function onSourcePointer(event) { event.preventDefault(); }
    const fullList = element("div", "st-mc-list"), detailWindow = element("section"), detail = element("article", "st-mc-detail");
    detailWindow.id = DETAIL; detailWindow.tabIndex = -1; detailWindow.setAttribute("role", "dialog"); detailWindow.setAttribute("aria-modal", "true");
    detailWindow.setAttribute("aria-labelledby", DIALOG + "DetailTitle");
    const detailHead = element("header", "st-mc-detail-head"), detailGroup = element("div", "st-mc-heading"), detailHeading = element("h2", "", () => text("messageCenter.details", "消息详情")), detailClose = button("×", "detail-close", "st-mc-close");
    detailHeading.id = DIALOG + "DetailTitle";
    bindLabel(detailClose, "aria-label", () => text("messageCenter.closeDetail", "关闭消息详情"));
    detailGroup.append(detailHeading); detailHead.append(detailGroup, detailClose);
    const detailError = element("div", "st-mc-error"); detailError.setAttribute("role", "status");
    const detailFooter = element("footer", "st-mc-detail-footer"); detailWindow.append(detailHead, detail, detailError, detailFooter);
    const detailModal = element("dialog", "st-mc-detail-modal"); detailModal.setAttribute("aria-labelledby", detailHeading.id);
    const deleteConfirm = element("dialog", "st-mc-delete-confirm");
    const confirmHeading = element("h2", "", () => text("messageCenter.confirmDeleteAll", "删除全部消息？")), confirmDescription = element("p", "", () => text("messageCenter.deleteAllWarning", "将删除当前消息中心可见范围内的全部消息，此操作无法撤销。"));
    confirmHeading.id = DIALOG + "DeleteTitle"; deleteConfirm.setAttribute("aria-labelledby", confirmHeading.id);
    const confirmActions = element("div", "st-mc-confirm-actions");
    confirmActions.append(button(() => text("messageCenter.cancel", "取消"), "cancel-delete-all"), button(() => text("messageCenter.confirmDelete", "确认删除"), "confirm-delete-all"));
    const confirmError = element("div", "st-mc-error"); confirmError.setAttribute("role", "status");
    deleteConfirm.append(confirmHeading, confirmDescription, confirmError, confirmActions);
    fullList.tabIndex = 0; bindLabel(fullList, "aria-label", () => text("messageCenter.list", "消息列表"));
    const fullTop = element("div"), fullBottom = element("div"), fullRowsHost = element("div", "st-mc-virtual-rows"), fullHint = element("div", "st-mc-load-state");
    fullTop.setAttribute("aria-hidden", "true"); fullBottom.setAttribute("aria-hidden", "true"); fullRowsHost.setAttribute("role", "list"); fullHint.setAttribute("role", "status");
    const fullError = element("div", "st-mc-error"); fullError.setAttribute("role", "status");
    dialog.append(fullHead, tools, fullList, detailModal, deleteConfirm, fullError);
    const operationParking = document.createDocumentFragment();
    const operationModal = element("dialog", "st-mc-operation");
    operationModal.setAttribute("role", "dialog"); operationModal.setAttribute("aria-modal", "true");
    const operationHead = element("header", "st-mc-operation-head"), operationTitle = element("h2", "st-mc-operation-title"), operationClose = element("button", "st-mc-operation-close");
    operationTitle.id = DIALOG + "OperationTitle"; operationClose.type = "button"; bindLabel(operationClose, "aria-label", () => text("messageCenter.closePrompt", "关闭提示"));
    operationModal.setAttribute("aria-labelledby", operationTitle.id);
    operationHead.append(operationTitle, operationClose);
    const operationBody = element("div", "st-mc-operation-body"), operationMark = element("span", "st-mc-operation-mark"), operationCopy = element("div", "st-mc-operation-copy");
    const operationDescription = element("div", "st-mc-operation-description");
    operationMark.setAttribute("aria-hidden", "true"); operationDescription.id = DIALOG + "OperationDescription";
    operationModal.setAttribute("aria-describedby", operationDescription.id);
    operationCopy.append(operationDescription); operationBody.append(operationMark, operationCopy);
    const operationFoot = element("footer", "st-mc-operation-foot"), operationPrimary = element("button", "st-mc-operation-primary");
    operationPrimary.type = "button"; operationFoot.appendChild(operationPrimary);
    operationModal.append(operationHead, operationBody, operationFoot); operationParking.appendChild(operationModal);
    // 点击入口会让原生菜单失焦；保留悬停时的打开状态，让同次点击维持关闭语义。
    let pointerHadMenu = false, windowRequest = 0;
    const host = nativeHost(trigger, style, (kind, reason) => {
      dismissOperation(false);
      closeHelp();
      trigger.setAttribute("aria-expanded", "false");
      if (reason !== "blur") pointerHadMenu = false;
      if (kind === "menu") cancelMotions();
      if (kind === "full") onClose();
      if (kind === "detail") {
        detailRequest++; selection = null; detailMode = null; detailAnchor = null;
      }
    }, (error, phase) => {
      reportFailure(error, phase, isDetailOpen() ? detailError : fullOpen ? fullError : popError);
      trigger.dataset.error = "true"; trigger.title = text("messageCenter.openWindowFailed", "消息窗口打开失败，请重试");
    }, () => {
      if (operationModal.open) { dismissOperation(); return true; }
      if (helpActive) { closeHelp(); return true; }
      if (detailMode === "embedded" && detailModal.open) { if (!busy) closeDetail(); return true; }
      if (searchOpen) { closeSources(); searchInput.focus({ preventScroll: true }); return true; }
      if (busy && (deleteConfirm.open || isDetailOpen())) return true;
      if (deleteConfirm.open) { deleteConfirm.close(); fullDeleteAll.focus({ preventScroll: true }); return true; }
      return false;
    }, () => operationModal.open);
    function isPopOpen() { return host.kind() === "menu"; }
    function isDetailOpen() { return detailMode === "embedded" ? detailModal.open : host.kind() === "detail"; }
    function layout() { host.layout(); }
    function renderOperation() {
      if (!operationView) return;
      const { status, description } = operationView;
      operationModal.dataset.state = status;
      operationTitle.textContent = status === "timeout" ? text("messageCenter.timeout", "等待结果超时") : text("messageCenter.failed", "操作失败");
      operationDescription.textContent = status === "timeout" ? text("messageCenter.timeoutHint", "等待操作结果超时，请稍后检查任务状态。") : description;
      operationMark.textContent = "!";
      operationPrimary.textContent = text("messageCenter.okay", "确定");
      bindLabel(operationClose, "aria-label", () => text("messageCenter.closePrompt", "关闭提示"));
    }
    function dismissOperation(restoreFocus = true) {
      const view = operationView;
      operationView = null;
      if (operationModal.open) operationModal.close();
      operationParking.appendChild(operationModal);
      if (restoreFocus && view?.owner.isConnected) {
        const anchor = view.anchor.isConnected ? view.anchor : [...view.owner.querySelectorAll("button[data-message-id][data-action-id]")].find(node => node.dataset.messageId === view.anchor.dataset.messageId && node.dataset.actionId === view.anchor.dataset.actionId);
        (anchor && !anchor.disabled ? anchor : view.owner).focus({ preventScroll: true });
      }
      layout();
    }
    function showOperation(target, view) {
      if (stopped || !view.owner.isConnected) return;
      if (operationModal.open) dismissOperation(false);
      closeHelp(); closeSources();
      operationView = { ...view, anchor: target };
      renderOperation();
      view.owner.appendChild(operationModal);
      operationModal.showModal();
      operationPrimary.focus({ preventScroll: true });
      layout();
    }
    function onOperationClosed() { if (!operationModal.open && operationView) dismissOperation(false); }
    function onOperationDismiss(event) { event.stopPropagation(); dismissOperation(); }
    // 连接或当前操作失败只作重试提示；业务异常统一进入持久消息列表。
    function setError(target, message = "", title = text("messageCenter.actionFailed", "消息操作失败")) {
      const previous = errorStates.get(target);
      if ((!message && !previous) || (previous?.message === message && previous.title === title)) return;
      target.replaceChildren(); errorStates.delete(target);
      if (!message) return;
      errorStates.set(target, { message, title });
      target.append(element("strong", "", title), element("span", "", message));
    }
    function status(container, title, description, retry = false) {
      const empty = element("div", "st-mc-empty");
      empty.append(icon(), element("strong", "", title), element("span", "", description));
      if (retry) empty.appendChild(button(() => text("messageCenter.retry", "重试"), "retry"));
      container.replaceChildren(empty);
      layout();
    }
    status(popList, () => text("messageCenter.loading", "正在加载"), () => text("messageCenter.reading", "正在读取消息…"));

    function displayCounts(value) {
      const matching = unreadSnapshot && unreadSnapshot.state.revision === value.revision && unreadSnapshot.state.steamAccountId === value.steamAccountId;
      const waiting = matching ? unreadSnapshot.rows.filter(row => pendingReads.has(row.id)).length : 0;
      const unreadCount = pendingReadAll ? 0 : value.unread - waiting;
      badge.textContent = String(unreadCount); badge.hidden = unreadCount === 0;
      trigger.dataset.unread = String(unreadCount > 0);
      trigger.setAttribute("aria-label", unreadCount ? text("messageCenter.unreadCount", "Steam Buff 消息，$value$ 条未读", unreadCount) : text("messageCenter.noUnreadAria", "Steam Buff 消息，无未读消息"));
      fullRead.disabled = busy || unreadCount === 0; clearUnread.disabled = busy || unreadCount === 0;
      fullDeleteAll.disabled = busy || value.total === 0;
      all.disabled = busy; unread.disabled = busy; read.disabled = busy;
      for (const entry of helpControls) helpCount(entry);
      updateCount();
    }
    function updateCount() {
      if (!current) return;
      if (kindFilter || levelFilter || originFilter || searchQuery) fullCount.textContent = next || fullLoading ? text("messageCenter.found", "已找到 $value$ 条", fullRows.length) : text("messageCenter.total", "共 $value$ 条", fullRows.length);
      else fullCount.textContent = text("messageCenter.total", "共 $value$ 条", filter === "unread" ? current.unread : filter === "read" ? current.total - current.unread : current.total);
    }
    function applyState(value, rows) {
      if (!value || !Number.isSafeInteger(value.revision) || !Number.isSafeInteger(value.total) || !Number.isSafeInteger(value.unread)) throw new TypeError("消息状态格式无效");
      if (value.revision < 0 || value.unread < 0 || value.total < value.unread) throw new TypeError("消息数量无效");
      if (current && current.revision > value.revision) return false;
      const changedAccount = current && current.steamAccountId !== value.steamAccountId;
      const closeAccountDetail = changedAccount && isDetailOpen();
      if (changedAccount) {
        operationEpoch++;  actionBusy.clear(); actionVersions.clear(); dismissOperation(false);
        if (closeAccountDetail) { if (detailMode === "embedded") closeDetail(false); else host.close("identity-change"); }
        if (deleteConfirm.open) deleteConfirm.close();
        generation++; listRequest++; fullLoading = false; detailRequest++; selection = null; fullRows = []; fullIds.clear(); fullRevision = null; detailAnchor = null; restorePoint = null;
        previewGeneration++; cancelMotions(); pendingReads.clear(); pendingReadAll = false; unreadSnapshot = null;
        popCards.clear(); fullCards.clear();
        popList.replaceChildren(); fullRowsHost.replaceChildren();
        status(popList, () => text("messageCenter.loading", "正在加载"), () => text("messageCenter.reading", "正在读取消息…"));
        popDirty = true; fullDirty = true;
      }
      current = value;
      if (rows !== undefined) { unreadSnapshot = { rows, state: value }; popDirty = false; }
      if (fullRevision !== value.revision) fullDirty = true;
      displayCounts(value);
      layout();
      if (closeAccountDetail && !fullOpen) void openAll();
      return true;
    }

    function finish(rid, data, timedOut = false) {
      const task = pending.get(rid); if (!task) return;
      pending.delete(rid); window.clearTimeout(task.timer);
      if (data.success === true) task.resolve(data.value);
      else { const error = new Error(data.error || text("messageCenter.operationRetry", "消息操作失败，请重试")); error.reported = data.reported === true; if (timedOut) error.name = "TimeoutError"; task.reject(error); }
    }
    function request(action, payload = {}) {
      if (stopped) return Promise.reject(new DOMException(text("messageCenter.closed", "消息中心已关闭"), "AbortError"));
      return new Promise((resolve, reject) => {
        const rid = crypto.randomUUID();
        const timer = window.setTimeout(() => finish(rid, { success: false, error: text("messageCenter.readTimeout", "读取消息超时，请重试") }, true), action === "act" ? 120000 : 12000);
        pending.set(rid, { resolve, reject, timer });
        const expected = current && Object.hasOwn(current, "steamAccountId") && ["read", "read-all", "delete", "delete-all", "act"].includes(action) ? { expectedSteamAccountId: current.steamAccountId } : {};
        window.postMessage({ source: model.BRIDGE, side: "page", protocol: model.PROTOCOL, action, rid, ...payload, ...expected }, window.location.origin);
      });
    }
    function reportFailure(error, phase, target, manual = true) {
      if (stopped || error.name === "AbortError") return;
      if (!error.reported) log.error("message-operation-failed", "消息中心操作失败", { error, phase });
      const title = phase === "list" || phase === "get" ? text("messageCenter.loadFailed", "消息加载失败") : text("messageCenter.actionFailed", "消息操作失败");
      setError(target);
      if (!manual || phase === "state") setError(target, error.message, title);
      else void window.STFeedback.show(target.ownerDocument.body, { title, message: error.message });
      layout();
    }
    async function openWindow(kind, content) {
      const token = ++windowRequest;
      trigger.dataset.error = "false"; trigger.title = text("messageCenter.steamMessages", "Steam Buff 消息");
      try {
        const opened = host.open(kind, content, () => {
          if (kind !== "menu") return;
          if (unreadSnapshot) renderPreview();
          else status(popList, () => text("messageCenter.loading", "正在加载"), () => text("messageCenter.reading", "正在读取消息…"));
        });
        trigger.setAttribute("aria-busy", "true"); trigger.title = text("messageCenter.preparingWindow", "消息窗口正在准备…");
        await opened;
        if (stopped || token !== windowRequest || host.kind() !== kind) return false;
        trigger.setAttribute("aria-expanded", String(kind === "menu"));
        if (current) displayCounts(current);
        return true;
      } catch (error) {
        reportFailure(error, "window-open", kind === "menu" ? popError : kind === "detail" ? detailError : fullError);
        if (kind === "full" && host.kind() !== "full") onClose();
        if (token === windowRequest && !stopped && error.name !== "AbortError") { trigger.dataset.error = "true"; trigger.title = text("messageCenter.openWindowFailed", "消息窗口打开失败，请重试"); }
        return false;
      } finally { if (token === windowRequest) { trigger.removeAttribute("aria-busy"); if (trigger.dataset.error !== "true") trigger.title = text("messageCenter.steamMessages", "Steam Buff 消息"); } }
    }
    async function toggleMenu(event) {
      if (isPopOpen() || (event.detail > 0 && pointerHadMenu)) {
        pointerHadMenu = false; host.close("button"); trigger.focus({ preventScroll: true }); return;
      }
      pointerHadMenu = trigger.matches(":hover");
      if (await openWindow("menu", panel)) { renderPreview(); void loadPopover(false, true); }
    }

    function renderRows(container, cache, rows, emptyText, relayout = true) {
      const ids = new Set(rows.map(message => message.id));
      for (const [id, card] of cache) if (!ids.has(id)) { if (cache === popCards) exits.delete(id); stopMotion(card.node); card.node.remove(); cache.delete(id); }
      if (!rows.length) { cache.clear(); status(container, emptyText, () => text("messageCenter.noNew", "没有来自 Steam Buff 的新消息")); return; }
      if (!cache.size) container.replaceChildren();
      let previousNode = null;
      for (const message of rows) {
        let card = cache.get(message.id);
        const view = cardView(message);
        if (!card) {
          card = makeCard(view, "detail"); card.open.dataset.id = message.id; cache.set(message.id, card);
        }
        card.row = message;
        updateCard(card, view);
        const signature = JSON.stringify(message.actions || []);
        if (signature !== card.actionSignature) {
          card.actions?.remove(); card.actions = actionsFor(message, true); card.node.appendChild(card.actions); card.actionSignature = signature;
        }
        card.dot.hidden = message.readAt !== null;
        updateCardLabel(card, message, view);
        const expected = previousNode ? previousNode.nextSibling : container.firstChild;
        if (expected !== card.node) container.insertBefore(card.node, expected);
        previousNode = card.node;
      }
      if (relayout) layout();
    }

    function stopMotion(node, channel) {
      const active = motions.get(node);
      if (!active) return;
      if (channel) { const motion = active.get(channel); active.delete(channel); motion?.cancel(); }
      else { for (const motion of active.values()) motion.cancel(); active.clear(); }
      if (!active.size) motions.delete(node);
    }
    function animate(node, frames, duration = READ_EXIT_MS, channel = "move") {
      if (reducedMotion.matches) return null;
      stopMotion(node, channel);
      const motion = node.animate(frames, { duration, easing: "ease-out", fill: "both" });
      if (!motions.has(node)) motions.set(node, new Map());
      motions.get(node).set(channel, motion);
      const release = () => {
        const active = motions.get(node);
        if (active?.get(channel) !== motion) return;
        active.delete(channel); if (!active.size) motions.delete(node);
      };
      motion.finished.then(() => { release(); motion.cancel(); }, error => {
        release();
        if (error.name !== "AbortError" && !stopped) log.error("message-animation-failed", "消息过渡动画失败", { error });
      });
      return motion;
    }
    function cancelMotions() {
      exits.clear();
      for (const node of motions.keys()) stopMotion(node);
    }
    /** 只投影当前已授权快照的临时已读意图；失败恢复原记录，账号变化后丢弃旧投影。 */
    function beginReadFeedback(id, all = false) {
      const token = { generation: previewGeneration, id, all };
      if (all) pendingReadAll = true; else pendingReads.add(id);
      for (const [key, card] of popCards) {
        if (!all && key !== id || exits.has(key) || !isPopOpen()) continue;
        const opacity = card.node.ownerDocument.defaultView.getComputedStyle(card.node).opacity;
        const motion = animate(card.node, [{ opacity, translate: "0px 0px" }, { opacity: 0, translate: "8px 0px" }], READ_EXIT_MS, "visibility");
        if (!motion) continue;
        const entry = { motion, row: card.row };
        exits.set(key, entry);
        motion.finished.then(() => {
          if (exits.get(key) !== entry) return;
          exits.delete(key); renderPreview();
        }, () => {
          if (exits.get(key) !== entry) return;
          exits.delete(key);
          // 动画异常由 animate 统一记录，此处只结束本条消息的视觉等待。
          if (!stopped) renderPreview();
        });
      }
      if (current) displayCounts(current);
      renderPreview();
      return token;
    }
    function endReadFeedback(token, failed = false) {
      if (stopped || !token || token.generation !== previewGeneration) return;
      if (token.all) pendingReadAll = false; else pendingReads.delete(token.id);
      if (failed) for (const [id, entry] of exits) {
        if (!token.all && id !== token.id) continue;
        exits.delete(id); stopMotion(popCards.get(id).node, "visibility");
      }
      if (current) displayCounts(current);
      for (const container of [panel, dialog, detailWindow]) {
        for (const control of container.querySelectorAll("button[data-message-id]")) {
          if (token.all || control.dataset.messageId === token.id) updateActionButton(control);
        }
      }
    }
    function acceptPreview(value) {
      if (!Array.isArray(value.unreadRows) || value.unreadRows.length > model.PAGE_SIZE || value.unreadRows.some(row => row.readAt !== null || typeof row.id !== "string") || value.unreadRows.length > value.state?.unread) throw new TypeError("未读消息快照格式无效");
      if (!applyState(value.state, value.unreadRows)) return false;
      renderPreview();
      return true;
    }
    function renderPreview() {
      if (stopped || !isPopOpen() || !unreadSnapshot) return;
      const before = host.ready() ? new Map([...popCards].map(([id, card]) => [id, card.node.getBoundingClientRect().top])) : null;
      // 先记住屏幕上的当前位置，再释放旧位移；退场的透明度与横移继续独立完成。
      for (const card of popCards.values()) stopMotion(card.node, "move");
      const visible = new Map(unreadSnapshot.rows.filter(row => !pendingReadAll && !pendingReads.has(row.id)).map(row => [row.id, row]));
      for (const [id, entry] of exits) if (!visible.has(id)) visible.set(id, entry.row);
      const rows = [...visible.values()].sort(model.compare);
      renderRows(popList, popCards, rows, () => text("messageCenter.noUnread", "暂无未读消息"));
      if (!before) return;
      const changes = [...popCards].map(([id, card]) => ({ node: card.node, delta: before.has(id) ? before.get(id) - card.node.getBoundingClientRect().top : null }));
      for (const { node, delta } of changes) {
        if (delta === null) animate(node, [{ opacity: 0 }, { opacity: 1 }], 120, "visibility");
        else if (delta) animate(node, [{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }]);
      }
    }
    async function loadPopover(prefetch = false, manual = false) {
      if (stopped || (!prefetch && !isPopOpen()) || popLoading) return;
      popLoading = true; popDirty = false; setError(popError);
      const token = previewGeneration;
      const ownerWindow = windowRequest;
      try {
        const page = await request("summary", { withUnread: true });
        if (stopped) return;
        if (token !== previewGeneration && page.state.steamAccountId !== current.steamAccountId) return;
        if (!acceptPreview(page)) popDirty = !unreadSnapshot || unreadSnapshot.state.revision !== current.revision;
      } catch (error) {
        if (token !== previewGeneration) return;
        // 关闭或重开后的结果仍可保留为状态，不能迁到其他窗口弹出
        reportFailure(error, "list", popError, manual && ownerWindow === windowRequest && isPopOpen());
        if (!stopped && !popCards.size) status(popList, () => text("messageCenter.loadFailed", "消息加载失败"), () => text("messageCenter.pleaseRetry", "请重试"), true);
        else if (!stopped) popError.appendChild(button(() => text("messageCenter.retry", "重试"), "retry"));
      } finally {
        popLoading = false;
        if (popDirty && !stopped && isPopOpen()) void loadPopover();
      }
    }

    function updateFullHint() {
      if (fullFailed) fullHint.replaceChildren(button(() => text("messageCenter.clickRetry", "加载失败，点击重试"), "more"));
      else fullHint.textContent = fullLoading ? text("messageCenter.loadingMore", "正在加载…") : (next ? text("messageCenter.scrollMore", "向下滚动加载更多") : text("messageCenter.allShown", "已显示全部消息"));
      fullList.setAttribute("aria-busy", String(fullLoading));
      updateCount();
    }

    function nearFullEnd() {
      return fullList.scrollTop + fullList.clientHeight >= fullRows.length * ROW_HEIGHT - (OVERSCAN + 1) * ROW_HEIGHT;
    }

    // 数据分批读取，DOM 只保留视口和两侧缓冲；滚动不调用原生窗口定位或完整运行时
    function renderVirtualRows() {
      if (stopped || !fullOpen || !fullRows.length) return;
      if (fullRowsHost.parentNode !== fullList) fullList.replaceChildren(fullTop, fullRowsHost, fullBottom, fullHint);
      const start = Math.max(0, Math.min(fullRows.length - 1, Math.floor(fullList.scrollTop / ROW_HEIGHT) - OVERSCAN));
      const end = Math.min(fullRows.length, Math.ceil((fullList.scrollTop + fullList.clientHeight) / ROW_HEIGHT) + OVERSCAN);
      const range = `${generation}:${start}:${end}:${fullRows.length}:${fullRevision}`;
      if (range === fullWindow) return;
      fullWindow = range;
      const visible = fullRows.slice(start, end), active = fullList.ownerDocument.activeElement;
      const focused = active?.closest(".st-mc-open");
      if (focused && fullRowsHost.contains(focused) && !visible.some(row => row.id === focused.dataset.id)) fullList.focus({ preventScroll: true });
      fullTop.style.height = `${start * ROW_HEIGHT}px`; fullBottom.style.height = `${(fullRows.length - end) * ROW_HEIGHT}px`;
      renderRows(fullRowsHost, fullCards, visible, "", false);
      for (let index = start; index < end; index++) {
        const card = fullCards.get(fullRows[index].id);
        card.open.dataset.index = String(index);
        card.node.setAttribute("role", "listitem"); card.node.setAttribute("aria-posinset", String(index + 1));
        card.node.setAttribute("aria-setsize", String(filter === "unread" ? current.unread : current.total));
      }
    }

    function cancelFullFrame() {
      if (fullFrame && !fullFrameWindow.closed) fullFrameWindow.cancelAnimationFrame(fullFrame);
      fullFrame = 0; fullFrameWindow = null;
    }

    function queueFullRender() {
      if (stopped || !fullOpen || fullFrame || !fullList.isConnected) return;
      fullFrameWindow = fullList.ownerDocument.defaultView;
      fullFrame = fullFrameWindow.requestAnimationFrame(() => {
        fullFrame = 0; fullFrameWindow = null;
        renderVirtualRows();
      });
    }

    function loadMore() {
      if (fullInitialized && next && !fullLoading && !fullFailed && nearFullEnd()) void loadFull(true);
    }

    function focusFullRow(index) {
      if (stopped || !fullOpen || selection || index < 0 || index >= fullRows.length) return;
      const top = index * ROW_HEIGHT;
      if (top < fullList.scrollTop) fullList.scrollTop = top;
      else if (top + ROW_HEIGHT > fullList.scrollTop + fullList.clientHeight) fullList.scrollTop = top + ROW_HEIGHT - fullList.clientHeight;
      renderVirtualRows(); fullCards.get(fullRows[index].id).open.focus({ preventScroll: true });
    }

    // Tab 与方向键按数据索引跨越虚拟窗口；到达缓存末尾时仅补下一批，保留自然的首尾焦点出口
    async function onFullKey(event) {
      const row = event.target.closest(".st-mc-card"), target = row?.querySelector(".st-mc-open");
      if (!target || !fullRowsHost.contains(target) || !["Tab", "ArrowDown", "ArrowUp", "Home"].includes(event.key)) return;
      const buttons = Array.from(row.querySelectorAll("button:not(:disabled)"));
      if (event.key === "Tab" && (event.shiftKey ? event.target !== buttons[0] : event.target !== buttons[buttons.length - 1])) return;
      if (event.key !== "Tab" && event.target !== target) return;
      const index = Number(target.dataset.index), backwards = event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey);
      const destination = event.key === "Home" ? 0 : index + (backwards ? -1 : 1);
      if (destination < 0 || (destination >= fullRows.length && !next)) return;
      event.preventDefault();
      if (destination >= fullRows.length) {
        const token = generation;
        await loadFull(true);
        if (token !== generation) return;
      }
      focusFullRow(destination);
      if (event.key === "Tab" && backwards) {
        const card = fullCards.get(fullRows[destination].id);
        const controls = card?.node.querySelectorAll("button:not(:disabled)");
        controls?.[controls.length - 1]?.focus({ preventScroll: true });
      }
    }

    async function loadFull(append = false, manual = false) {
      if (stopped || !fullOpen || isDetailOpen()) return;
      if (fullLoading) { if (!append) fullDirty = true; return; }
      if (append && (!fullInitialized || !next)) return;
      const token = generation;
      const ticket = ++listRequest;
      const cursor = append ? next : null;
      fullLoading = true; fullDirty = false; fullFailed = false; setError(fullError); updateFullHint();
      syncFilters();
      try {
        searchedLocale = searchQuery ? window.STI18n?.locale?.() : undefined;
        const page = await request("list", { filter, before: cursor, level: levelFilter, kind: kindFilter, origin: originFilter, query: searchQuery,
          ...(searchedLocale ? { displayLocale: searchedLocale } : {}) });
        if (stopped || !fullOpen || token !== generation) return;
        if (!applyState(page.state)) { fullDirty = true; return; }
        if (append && fullRevision !== page.state.revision) { refreshFull(); return; }
        if (!append) { fullRows = []; fullIds.clear(); fullList.scrollTop = 0; }
        for (const row of page.rows) if (!fullIds.has(row.id)) { fullIds.set(row.id, fullRows.length); fullRows.push(row); }
        next = page.next; fullRevision = page.state.revision; fullInitialized = true; fullDirty = false;
        if (fullRows.length) renderVirtualRows();
        else {
          fullCards.clear();
          status(fullList, () => next ? text("messageCenter.searching", "正在搜索") : (kindFilter || levelFilter || originFilter || searchQuery) ? text("messageCenter.noneMatch", "没有匹配的消息") : filter === "unread" ? text("messageCenter.noUnread", "暂无未读消息") : filter === "read" ? text("messageCenter.noRead", "暂无已读消息") : text("messageCenter.none", "暂无消息"), () => next ? text("messageCenter.moreCandidates", "正在读取更多候选消息…") : text("messageCenter.adjustFilters", "可调整筛选条件或稍后再来查看"));
        }
        completeRestore();
      } catch (error) {
        if (stopped || token !== generation || !fullOpen) return;
        fullFailed = true;
        reportFailure(error, "list", fullError, manual);
        if (!fullRows.length) status(fullList, () => text("messageCenter.loadFailed", "消息加载失败"), () => text("messageCenter.pleaseRetry", "请重试"), true);
      } finally {
        if (ticket !== listRequest) return;
        fullLoading = false; updateFullHint();
        if (fullDirty && !stopped && fullOpen) void loadFull();
        else if (token === generation && !fullFailed && fullOpen) {
          if (next && (restorePoint || !fullRows.length)) void loadFull(true, manual);
          else loadMore();
        }
      }
    }

    // 列表代次与详情请求分开，底层摘要更新不能丢弃正在打开的详情。
    function refreshFull(reset = false, manual = false) {
      if (isDetailOpen()) { fullDirty = true; return; }
      if (!reset && !restorePoint && fullRows.length) {
        const index = Math.min(fullRows.length - 1, Math.floor(fullList.scrollTop / ROW_HEIGHT));
        const row = fullRows[index];
        restorePoint = { id: row.id, createdAt: row.createdAt, offset: index * ROW_HEIGHT - fullList.scrollTop, focus: false };
      }
      generation++; cancelFullFrame();
      if (reset) { filter = "all"; kindFilter = ""; levelFilter = ""; originFilter = ""; searchQuery = ""; searchInput.value = ""; clearSearchTimer(); closeSources(); syncFilters(); fullRows = []; fullIds.clear(); fullCards.clear(); restorePoint = null; }
      fullInitialized = false;
      if (!fullRows.length) status(fullList, () => text("messageCenter.loading", "正在加载"), () => text("messageCenter.reading", "正在读取消息…"));
      fullResize.observe(fullList);
      void loadFull(false, manual);
    }
    function showList(reset = false) {
      if (deleteConfirm.open) deleteConfirm.close();
      detailRequest++; selection = null;  setError(detailError);
      refreshFull(reset, true);
    }
    // 返回锚点来自当前消息或已加载行；只沿现有游标分批读到锚点，关闭/切号即取消
    function completeRestore() {
      if (!restorePoint) return;
      if (!fullRows.length) { if (!next) { restorePoint = null; fullList.focus({ preventScroll: true }); } return; }
      const point = restorePoint;
      let index = fullIds.get(point.id);
      if (index === undefined) {
        if (next && model.compare(fullRows[fullRows.length - 1], point) <= 0) return;
        index = fullRows.length - 1;
        for (let i = Math.max(0, fullRows.length - model.PAGE_SIZE); i < fullRows.length; i++) {
          if (model.compare(fullRows[i], point) >= 0) { index = i; break; }
        }
      }
      renderVirtualRows();
      fullList.scrollTop = Math.max(0, index * ROW_HEIGHT - point.offset);
      restorePoint = null; fullWindow = ""; renderVirtualRows();
      if (point.focus) fullCards.get(fullRows[index].id).open.focus({ preventScroll: true });
    }
    function closeDetail(restore = true) {
      const mode = detailMode, anchor = detailAnchor;
      detailMode = null; detailAnchor = null; detailRequest++; selection = null;
      if (mode === "embedded") {
        if (detailModal.open) detailModal.close();
        detailParking.appendChild(detailWindow);
        detailWindow.setAttribute("role", "dialog"); detailWindow.setAttribute("aria-modal", "true");
        if (restore && fullOpen && !stopped) {
          restorePoint = anchor ? { ...anchor, focus: true } : null;
          fullResize.observe(fullList);
          if (fullDirty || fullRevision !== current?.revision) refreshFull();
          else { fullWindow = ""; renderVirtualRows(); completeRestore(); }
        }
      } else if (mode === "standalone") host.close("detail-close", true);
    }
    function onDetailClosed() { if (detailMode === "embedded" && !detailModal.open) closeDetail(); }
    function acceptDetailRead(id, value) {
      const index = fullIds.get(id), patchable = fullOpen && !fullLoading && index !== undefined && current && value.state.total === current.total && value.state.revision === fullRevision + (value.changed ? 1 : 0);
      if (value.readAt !== null && !Number.isSafeInteger(value.readAt)) throw new TypeError("消息已读结果格式无效");
      applyState(value.state);
      if (!patchable || value.readAt === null) return;
      if (filter === "unread") {
        fullRows.splice(index, 1); fullIds.clear(); fullRows.forEach((row, i) => fullIds.set(row.id, i));
      } else fullRows[index] = { ...fullRows[index], readAt: value.readAt };
      fullRevision = value.state.revision; fullDirty = false; fullWindow = "";
    }
    async function openAll() {
      closeHelp(); if (isDetailOpen()) closeDetail(false);
      if (await openWindow("full", dialog)) { fullOpen = true; showList(true); }
    }
    function renderDetail(message) {

      detail.replaceChildren();
      detail.append(element("h3", "", () => model.presentation(message).title), element("span", "st-mc-count", () => date(message.createdAt)));
      detail.appendChild(element("p", "", () => model.displayContent(message)));
      if (message.details?.length) {
        const source = element("details", "st-mc-workflow-source");
        source.appendChild(element("summary", "", () => text("messageCenter.details", "消息详情")));
        source.appendChild(element("p", "", () => message.details.map(item => {
          const label = message.moduleId === "automation" && item.labelId ? text(`messageCenter.detail.${item.labelId}`, item.label) : item.label;
          return text("messageCenter.detailLabel", "$value$：", label) + item.value;
        }).join("\n")));
        detail.appendChild(source);
      }
      if (message.interaction) detail.appendChild(element("p", "st-mc-business", () => text(`messageCenter.state.${message.interaction.state}`, model.STATES[message.interaction.state])));
      const actions = actionsFor(message, false);
      const remove = iconButton(() => text("messageCenter.delete", "删除"), "delete", "delete"); remove.dataset.id = message.id; remove.dataset.waiting = String(message.interaction?.waiting === true); actions.appendChild(remove);
      detailFooter.replaceChildren(actions);
      detail.scrollTop = 0;
      layout();
    }
    async function openDetail(id) {
      closeHelp(); closeSources();
      const row = (fullOpen ? fullCards : popCards).get(id)?.row;
      if (!isDetailOpen()) {
        detailMode = fullOpen ? "embedded" : "standalone";
        const index = row && fullOpen ? fullIds.get(id) : undefined;
        detailAnchor = index === undefined ? null : { id, createdAt: row.createdAt, offset: index * ROW_HEIGHT - fullList.scrollTop };
      }
      const token = ++detailRequest; selection = id;
      setError(detailError); detailFooter.replaceChildren();
      status(detail, () => text("messageCenter.loading", "正在加载"), () => text("messageCenter.reading", "正在读取消息…"));
      const feedback = row?.readAt === null ? beginReadFeedback(id) : null;
      let loaded = false, phase = "get", committed = false;
      try {
        if (detailMode === "embedded") {
          generation++; listRequest++; fullLoading = false; cancelFullFrame(); fullResize.disconnect();
          detailWindow.removeAttribute("role"); detailWindow.removeAttribute("aria-modal");
          if (!detailModal.open) { detailModal.appendChild(detailWindow); detailModal.showModal(); detailHeading.focus({ preventScroll: true }); }
        } else if (!await openWindow("detail", detailWindow) || token !== detailRequest) return;
        const value = await request("get", { id });
        if (stopped || token !== detailRequest || !isDetailOpen()) return;
        if (!value.message) { status(detail, () => text("messageCenter.deleted", "消息已删除"), () => text("messageCenter.gone", "这条消息已经不存在")); return; }
        renderDetail(value.message);
        loaded = true;
        if (value.message.readAt === null) {
          phase = "read";
          const changed = await request("read", { id });
          if (!stopped && token === detailRequest) acceptDetailRead(id, changed);
        }
        committed = true;
      } catch (error) {
        if (token !== detailRequest) return;
        if (!loaded) { status(detail, () => text("messageCenter.loadFailed", "消息加载失败"), () => text("messageCenter.pleaseRetry", "请重试")); detailFooter.replaceChildren(button(() => text("messageCenter.retry", "重试"), "detail-retry")); }
        reportFailure(error, phase, detailError);
      } finally { endReadFeedback(feedback, !committed); if (!committed) renderPreview(); }
      return loaded && token === detailRequest && isDetailOpen();
    }

    // 只刷新正在查看的一条消息；合并同轮投影变化，不重开窗口或重复标已读。
    function refreshDetail() {
      detailDirty = true;
      if (detailRefresh) return;
      let refreshId, refreshToken;
      detailRefresh = (async () => {
        while (detailDirty && selection && isDetailOpen() && !stopped) {
          detailDirty = false;
          const id = refreshId = selection, token = refreshToken = detailRequest, value = await request("get", { id });
          if (stopped || token !== detailRequest || selection !== id || !isDetailOpen()) continue;
          if (!value.message) { closeDetail(); return; }
          const scroll = detail.scrollTop, active = detailWindow.ownerDocument.activeElement;
          const actionId = active?.dataset.actionId;
          renderDetail(value.message); detail.scrollTop = scroll;
          if (actionId) {
            const target = [...detailFooter.querySelectorAll("button[data-action-id]")].find(node => node.dataset.actionId === actionId && !node.disabled);
            (target || detailHeading).focus({ preventScroll: true });
          }
        }
      })().catch(error => {
        if (!stopped && refreshToken === detailRequest && refreshId === selection && isDetailOpen()) reportFailure(error, "get", detailError);
      }).finally(() => {
        detailRefresh = null;
        if (detailDirty && !stopped && selection && isDetailOpen()) refreshDetail();
      });
    }

    function onMessage(event) {
      const data = event.data;
      if (data === "window_moved" || data === "window_resized") { layout(); return; }
      if (stopped || event.source !== window || event.origin !== window.location.origin || data?.source !== model.BRIDGE || data.side !== "content") return;
      if (data.action === "identity-error") { setError(popError, data.error, text("messageCenter.loadFailed", "消息加载失败")); setError(fullError, data.error, text("messageCenter.loadFailed", "消息加载失败")); return; }
      if (data.action !== "changed") { finish(data.rid, data); return; }
      const changed = !current || data.state?.revision > current.revision || data.state?.steamAccountId !== current.steamAccountId;
      if (!changed && !Object.hasOwn(data, "unreadRows")) return;
      try {
        if (!acceptPreview({ state: data.state, unreadRows: data.unreadRows })) return;
        if (changed) {
          if (isDetailOpen() && selection && (data.state.change?.action === "delete-all" || (data.state.change?.action === "delete" && data.state.change.id === selection))) closeDetail();
          else if (isDetailOpen() && selection) refreshDetail();
          else if (fullOpen && !isDetailOpen()) refreshFull();
          else fullDirty = true;
        }
      } catch (error) { reportFailure(error, "state", isDetailOpen() ? detailError : fullOpen ? fullError : popError); }
    }

    async function onClick(event) {
      const target = event.target.closest("button[data-action]");
      if (!target || target.disabled) return;
      event.stopPropagation();
      const action = target.dataset.action;
      if (action === "message-action") { await performAction(target); return; }
      if (busy) return;
      if (action === "origin") { originFilter = target.dataset.origin; searchQuery = ""; searchInput.value = ""; closeSources(); filterChanged(); searchInput.focus({ preventScroll: true }); return; }
      if (action === "clear-origin") { originFilter = ""; closeSources(); filterChanged(); searchInput.focus({ preventScroll: true }); return; }
      if (action === "search-clear") { originFilter = ""; searchQuery = ""; searchInput.value = ""; closeSources(); filterChanged(); searchInput.focus({ preventScroll: true }); return; }
      if (action.startsWith("kind-")) { const value = action.slice(5); kindFilter = kindFilter === value ? "" : value; closeSources(); filterChanged(); return; }
      if (action.startsWith("level-")) { const value = action.slice(6); levelFilter = levelFilter === value ? "" : value; closeSources(); filterChanged(); return; }
      if (action === "all") { await openAll(); return; }
      if (action === "close") { host.close("button", true); return; }
      if (action === "detail-close") { closeDetail(); return; }
      if (action === "detail") { await openDetail(target.dataset.id); return; }
      if (action === "detail-retry" && selection) { await openDetail(selection); return; }
      if (action === "delete-all" || action === "delete") {
        deleteSelection = action === "delete" ? target.dataset.id : null;
        deleteAnchor = target;
        bindLabel(confirmHeading, "textContent", () => deleteSelection ? text("messageCenter.confirmDeleteOne", "删除这条消息？") : text("messageCenter.confirmDeleteAll", "删除全部消息？"));
        const waiting = !deleteSelection || target.dataset.waiting === "true";
        bindLabel(confirmDescription, "textContent", () => (deleteSelection ? text("messageCenter.deleteOneWarning", "将删除此消息。") : text("messageCenter.deleteAccountWarning", "将删除当前账号及本机可见的全部消息。")) +
          (waiting ? text("messageCenter.endWaitingWarning", "等待交互的任务将一起结束，按钮、超时及后续分支均不再执行。") : "") + text("messageCenter.irreversible", "此操作无法撤销。"));
        bindLabel(confirmActions.lastElementChild, "textContent", () => waiting ? text("messageCenter.deleteEnd", "删除并结束本次任务") : text("messageCenter.confirmDelete", "确认删除"));
        (isDetailOpen() ? detailWindow : dialog).appendChild(deleteConfirm);
        setError(confirmError); deleteConfirm.showModal();
        confirmActions.firstElementChild.focus({ preventScroll: true });
        return;
      }
      if (action === "cancel-delete-all") { deleteConfirm.close(); deleteAnchor?.focus({ preventScroll: true }); return; }
      if (action === "confirm-delete-all" && !deleteConfirm.open) return;
      if (action === "retry") { if (fullOpen) showList(); else void loadPopover(false, true); return; }
      if (action === "more") { await loadFull(true, true); return; }
      if (action.startsWith("filter-")) { filter = action.slice(7); closeSources(); filterChanged(); return; }
      busy = true; target.disabled = true;
      if (current) displayCounts(current);
      const errorTarget = deleteConfirm.open ? confirmError : isDetailOpen() ? detailError : fullOpen ? fullError : popError; setError(errorTarget);
      const viewAtStart = previewGeneration;
      const feedback = action === "read-all" ? beginReadFeedback(null, true) : null;
      try {
        if (action === "read-all" || action === "confirm-delete-all") {
          const operation = action === "confirm-delete-all" ? (deleteSelection ? "delete" : "delete-all") : action;
          const changed = await request(operation, { id: deleteSelection, withUnread: true });
          if (stopped) return;
          if (viewAtStart !== previewGeneration && changed.state.steamAccountId !== current.steamAccountId) return;
          endReadFeedback(feedback);
          acceptPreview(changed);
          if (changed.failed?.length) {
            setError(confirmError, changed.failed.map(item => item.reason).join("\n"), text("messageCenter.partiallyDeleted", "部分消息未删除"));
            if (fullOpen) refreshFull(); return;
          }
          if (action === "confirm-delete-all" && deleteConfirm.open) deleteConfirm.close();
          if (isDetailOpen()) closeDetail();
          else if (fullOpen) showList();
          if (action === "confirm-delete-all" && !deleteSelection) void window.STFeedback.show(dialog.ownerDocument.body, { message: text("messageCenter.allDeleted", "消息已全部删除。") });

        }
      } catch (error) { endReadFeedback(feedback, true); renderPreview(); reportFailure(error, action, errorTarget); }
      finally { busy = false; if (!stopped) { target.disabled = false; if (current) applyState(current); } }
    }

    // 图标动作与正文按钮是同级元素；点击动作不触发详情/自动已读。业务执行只传存储 ID，导航由后台核验后交回主窗口。
    async function performAction(target) {
      const id = target.dataset.messageId, actionId = target.dataset.actionId;
      const owner = target.closest(".st-mc-detail-modal") ? detailWindow : target.closest("#" + PANEL) || target.closest("#" + DIALOG) || target.closest("#" + DETAIL);
      if (actionBusy.has(id)) return;
      if (pendingReadAll || exits.has(id)) return;
      const epoch = operationEpoch, running = { actionId, epoch };
      actionBusy.set(id, running); actionVersions.set(id, running);

      const viewAtStart = previewGeneration;
      const controls = () => [...panel.querySelectorAll("button[data-message-id]"), ...dialog.querySelectorAll("button[data-message-id]"), ...detailWindow.querySelectorAll("button[data-message-id]")].filter(node => node.dataset.messageId === id);
      const finishBusy = () => {
        if (actionBusy.get(id) !== running) return;
        actionBusy.delete(id);
        if (!stopped) controls().forEach(updateActionButton);
      };
      controls().forEach(updateActionButton);
      const errorTarget = isDetailOpen() ? detailError : fullOpen ? fullError : popError; setError(errorTarget);
      try {
        const value = await request("act", { id, actionId });
        if (stopped || epoch !== operationEpoch) return;
        if (viewAtStart !== previewGeneration && value.state.steamAccountId !== current.steamAccountId) return;
        if (value.navigation && !window.STConfig.externalNavigation.open(model.link(value.navigation.url))) throw new Error(text("messageCenter.openFailed", "未能打开外部浏览器，请重试。"));
        applyState(value.state); if (isPopOpen()) void loadPopover();
        finishBusy();
        if (fullOpen && !selection) showList();
        else if (isDetailOpen() && selection === id) {
          try {
            const latest = await request("get", { id });
            if (!stopped && epoch === operationEpoch && actionVersions.get(id) === running && selection === id && latest.message) renderDetail(latest.message);
          } catch (error) { if (!stopped && epoch === operationEpoch && actionVersions.get(id) === running && selection === id) reportFailure(error, "get", detailError); }
        }
      } catch (error) {
        if (stopped || epoch !== operationEpoch) return;
        renderPreview();
        if (error.name === "AbortError") return;
        if (!error.reported) log.error("message-operation-failed", "消息中心操作失败", { error, phase: "act" });
        const timedOut = error.name === "TimeoutError";
        showOperation(target, { owner, status: timedOut ? "timeout" : "error", description: error.message });
      }
      finally {
        finishBusy();
        if (actionVersions.get(id) === running) actionVersions.delete(id);
      }
    }

    function onClose() { fullOpen = false; if (detailMode === "embedded") closeDetail(false); generation++; listRequest++; fullLoading = false; clearSearchTimer(); closeSources(); cancelFullFrame(); fullResize.disconnect(); }
    // 首次挂载不依赖整轮 runtime 重试；等待任务只核对所选入口容器，成功后立即注销
    function waitForMount() {
      if (mountWaiting) return;
      mountWaiting = true; mountWaitAt = performance.now();
      log.debug("message-entry-waiting", "消息入口等待挂载容器就绪", { mode: root.dataset.mode });
      window.STScheduler.register(MOUNT_TASK, reattach,
        () => !stopped && !document.hidden && mountWaiting && api.ctx.isMainUi() === true,
        { intervalMs: 1000 });
    }
    function stopMountWait() {
      if (!mountWaiting) return;
      mountWaiting = false; window.STScheduler.unregister(MOUNT_TASK);
    }
    // 两种模式只移动同一入口；设置快照只比较当前模式，不重启消息列表或其他功能
    function reattach() {
      if (stopped || document.hidden || api.ctx.isMainUi() !== true) return;
      const nextNavigation = api.ctx.settingValue(MODE_SETTING, false);
      if (typeof nextNavigation !== "boolean") throw new TypeError("消息中心显示模式无效");
      if (nextNavigation !== navigation) {
        navigation = nextNavigation; controls = null; root.remove();
        root.dataset.mode = navigation ? "navigation" : "toolbar";
        triggerIcon.hidden = navigation; triggerLabel.hidden = !navigation;
        if (isPopOpen()) host.close("display-mode");
        log.info("message-entry-mode-changed", "消息中心显示模式已切换", { mode: root.dataset.mode });
        observeEntry();
      }
      if (!root.isConnected) {
        const nextControls = document.querySelector(navigation ? NAVIGATION : CONTROLS);
        // 保留已经确认的局部父边界，同一容器带着入口恢复时仍需结束等待
        if (!nextControls) { if (!observingSettings) observeEntry(); waitForMount(); return; }
        controls = nextControls;
        if (navigation) controls.appendChild(root);
        else controls.insertBefore(root, controls.firstChild);
      }
      if (mountWaiting) {
        log.debug("message-entry-ready", "消息入口已挂载", { mode: root.dataset.mode, durationMs: Math.round(performance.now() - mountWaitAt) });
        stopMountWait();
      }
      observeEntry(); layout();
    }
    // 只观察入口容器的直接子节点；导航栏多保留一层头部边界，以处理整条导航栏重建
    function observeEntry() {
      const parent = controls?.parentElement || null, header = navigation ? parent?.parentElement || null : null;
      if (observingSettings && observedControls === controls && observedParent === parent && observedHeader === header) return;
      observer.disconnect();
      observer.observe(document.documentElement, { attributes: true, attributeFilter: [SETTINGS_ATTR] });
      if (controls) observer.observe(controls, { childList: true });
      if (parent) observer.observe(parent, { childList: true });
      if (header) observer.observe(header, { childList: true });
      observedControls = controls; observedParent = parent; observedHeader = header; observingSettings = true;
    }
    const observer = new MutationObserver(records => {
      if (records.some(record => record.type === "attributes")) {
        try { if (api.ctx.settingValue(MODE_SETTING, false) !== navigation) reattach(); }
        catch (error) { reportFailure(error, "display-mode", popError); }
      }
      if (!records.some(record =>
        [...record.removedNodes].some(node => node === root || node === controls || node === observedParent) ||
        [...record.addedNodes].some(node => node === controls || node === observedParent ||
          (record.target === observedParent && node.nodeType === 1 && node.matches(navigation ? NAVIGATION : CONTROLS)))
      )) return;
      reattach();
    });
    function onVisibility() {
      if (document.hidden) { observer.disconnect(); observedControls = null; observedParent = null; observedHeader = null; observingSettings = false; }
      else reattach();
    }
    function onLocaleChange() {
      // 消息节点可以在 Steam 窗口间移动，只原地刷新本模块的控件和已挂载行。
      for (const surface of [root, panel, dialog, detailWindow, operationModal]) {
        refreshLabels(surface);
        surface.querySelectorAll("button[data-action-id]").forEach(updateActionLabel);
      }
      for (const cache of [popCards, fullCards]) {
        for (const card of cache.values()) {
          const view = cardView(card.row);
          updateCard(card, view);
          updateCardLabel(card, card.row, view);
        }
      }
      if (trigger.getAttribute("aria-busy") === "true") trigger.title = text("messageCenter.preparingWindow", "消息窗口正在准备…");
      else if (trigger.dataset.error === "true") trigger.title = text("messageCenter.openWindowFailed", "消息窗口打开失败，请重试");
      if (current) displayCounts(current);
      syncFilters();
      if (searchOpen) showSources();
      if (fullOpen) updateFullHint();
      if (fullOpen && searchQuery && !searchTimer && (!originFilter || originFilter === "update")
        && window.STI18n?.locale?.() !== searchedLocale) refreshFull();
      if (operationView) renderOperation();
      layout();
    }
    function onResize() { layout(); }
    function onTriggerEnter() { pointerHadMenu = isPopOpen(); }
    function onTriggerLeave() { pointerHadMenu = false; }

    const fullResize = new ResizeObserver(queueFullRender);
    fullList.addEventListener("scroll", queueFullRender, { passive: true });
    fullList.addEventListener("scrollend", loadMore); fullList.addEventListener("keydown", onFullKey);
    const messageWindows=new BroadcastChannel(model.OPEN_CHANNEL);
    messageWindows.addEventListener("message",async event=>{
      if(event.data?.type!=="open"||typeof event.data.id!=="string")return;
      const opened = await openDetail(event.data.id);
      if (!stopped) messageWindows.postMessage({ type: "opened", id: event.data.id, success: opened === true });
    });
    window.addEventListener("message", onMessage);
    if (window.STI18n?.CHANGE_EVENT) window.addEventListener(window.STI18n.CHANGE_EVENT, onLocaleChange);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", stop);
    trigger.addEventListener("click", toggleMenu); trigger.addEventListener("pointerenter", onTriggerEnter); trigger.addEventListener("pointerleave", onTriggerLeave);
    panel.addEventListener("click", onClick); dialog.addEventListener("click", onClick); detailWindow.addEventListener("click", onClick);
    operationPrimary.addEventListener("click", onOperationDismiss); operationClose.addEventListener("click", onOperationDismiss);
    operationModal.addEventListener("close", onOperationClosed);
    detailModal.addEventListener("close", onDetailClosed); detailHeading.tabIndex = -1;
    searchInput.addEventListener("focus", showSources); searchInput.addEventListener("input", onSearchInput); searchInput.addEventListener("compositionend", onSearchInput); searchInput.addEventListener("keydown", onSearchKey);
    searchField.addEventListener("focusout", onSearchBlur); sourceMenu.addEventListener("pointerdown", onSourcePointer);
    reattach();
    const route = api.contextRouter.subscribe(reattach);
    void loadPopover(true);

    function stop() {
      if (stopped) return;
      stopped = true; generation++; previewGeneration++; operationEpoch++;  actionBusy.clear(); actionVersions.clear(); dismissOperation(false); observer.disconnect(); route.dispose();
      messageWindows.close();
      cancelMotions(); pendingReads.clear(); pendingReadAll = false; unreadSnapshot = null;
      cancelFullFrame(); fullResize.disconnect();
      clearSearchTimer(); closeSources();
      closeHelp(); if (detailMode === "embedded") closeDetail(false);
      fullList.removeEventListener("scroll", queueFullRender); fullList.removeEventListener("scrollend", loadMore); fullList.removeEventListener("keydown", onFullKey);
      stopMountWait();
      host.stop();
      window.removeEventListener("message", onMessage); window.removeEventListener("resize", onResize);
      if (window.STI18n?.CHANGE_EVENT) window.removeEventListener(window.STI18n.CHANGE_EVENT, onLocaleChange);
      window.removeEventListener("pagehide", stop);
      document.removeEventListener("visibilitychange", onVisibility);
      trigger.removeEventListener("click", toggleMenu); trigger.removeEventListener("pointerenter", onTriggerEnter); trigger.removeEventListener("pointerleave", onTriggerLeave);
      panel.removeEventListener("click", onClick); dialog.removeEventListener("click", onClick); detailWindow.removeEventListener("click", onClick);
      operationPrimary.removeEventListener("click", onOperationDismiss); operationClose.removeEventListener("click", onOperationDismiss);
      operationModal.removeEventListener("close", onOperationClosed);
      detailModal.removeEventListener("close", onDetailClosed);
      for (const entry of helpControls) {
        entry.node.removeEventListener("pointerenter", entry.show); entry.node.removeEventListener("focus", entry.show);
        entry.node.removeEventListener("pointerleave", entry.leave); entry.node.removeEventListener("focusout", entry.leave);
      }
      searchInput.removeEventListener("focus", showSources); searchInput.removeEventListener("input", onSearchInput); searchInput.removeEventListener("compositionend", onSearchInput); searchInput.removeEventListener("keydown", onSearchKey);
      searchField.removeEventListener("focusout", onSearchBlur); sourceMenu.removeEventListener("pointerdown", onSourcePointer);
      for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new DOMException(text("messageCenter.closed", "消息中心已关闭"), "AbortError")); }
      pending.clear();   root.remove(); panel.remove(); dialog.remove(); detailWindow.remove(); style.remove();
      if (api.messageCenter?.stop === stop) delete api.messageCenter;
    }
    // open() 打开完整列表；stop() 幂等释放当前 UI、订阅和请求，不删除已存储消息。
    api.messageCenter = Object.freeze({ open: openAll, stop });
    return { started: true, stop };
  }

  api.reg.addEntry(model.FEATURE, "ui.js", create);
})();
