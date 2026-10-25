/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : 新版成就页的单一入口与手动、AI 翻译管理
 * @File          : 精准挂载、已保存译文展示和可取消的批量操作
 * @Read me       : 感谢使用 Steam Buff，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";
  const api = window.SteamBuff, model = window.STAchievementTranslations;
  const ID = model.FEATURE, PANEL = "div._2FqpD91Xarb7f0uIOuXFOR", LIST = "div._1BnbXfdEvRubouJucJRU7z";
  const HEADER = "div._1-yfCTWkj4tOFfb3EKXx6N div.Rrxq_LH_m0cYEls4MuNtG";
  const ROW = "[data-tableindex]", TITLE = "h1._12ldq1_X5RuLWAAs_ODwt7", DESCRIPTION = "span.f6hU22EA7Z8peFWZVBJU";
  const GROUP = "div._22S4Af9ZUjd6IavgboVcEC", GROUP_TITLE = "span.mGlMCg85s0ULA8kYCZzMB.f6hU22EA7Z8peFWZVBJU";
  const log = window.STLoggerFactory.createLogger("steam", ID);
  function element(tag, className, text) {
    const node = api.styles.createStyledElement(tag, {}, text);
    if (className) node.className = className;
    return node;
  }
  function button(label, action, primary = false) {
    const node = element("button", primary ? "st-ach-button st-ach-primary" : "st-ach-button", label);
    node.type = "button"; node.dataset.action = action; return node;
  }
  function abortError() { return new DOMException("成就翻译操作已停止", "AbortError"); }
  // 两种新版布局共享列表与顶部操作区；AppID 来自页面组件，与封面是否存在无关
  function surface(context) {
    for (const target of context.targets || []) {
      const panel = target.querySelector(PANEL);
      if (!panel) continue;
      const list = panel.querySelector(LIST), header = panel.querySelector(HEADER);
      const actions = header?.querySelector(":scope > div._1SxQuUnaM-MXeF5UfssWve");
      const appId = api.ctx.achievementAppId(panel);
      if (list && actions) return { panel, list, actions, appId };
    }
    return null;
  }
  function prepareStyle() {
    const css = api.styles.css;
    api.styles.ensureStyle("st-achievement-translation-style", css.compose(
      css.dialog({ layerSelectors: ".st-ach-layer", openLayerSelectors: ".st-ach-layer", surfaceSelectors: ".st-ach-dialog", openSurfaceSelectors: ".st-ach-dialog", headerSelectors: ".st-ach-head", titleSelectors: ".st-ach-head h2", width: "min(1120px, 100%)", maxHeight: "calc(100vh - 112px)", surfacePadding: "0", layerPadding: "56px 24px", layerAlign: "center" }),
      css.button(".st-ach-button", { density: "compact" }),
      css.button(".st-ach-primary", { density: "compact", variant: "primary" }),
      css.field([".st-ach-layer input[type='search']", ".st-ach-layer input[type='text']", ".st-ach-layer textarea", ".st-ach-layer select"]),
      `
      .st-ach-entry { display: flex; flex: 0 0 auto; }
      .st-ach-entry .st-ach-button { height: auto; border: 0; padding: 0; border-radius: 0; color: var(--st-color-steam-blue); background: transparent; box-shadow: none; font: inherit; line-height: inherit; }
      .st-ach-entry .st-ach-button:hover:not(:disabled) { color: var(--st-color-text-primary); background: transparent; }
      .st-ach-entry .st-ach-button:focus-visible { outline: 2px solid var(--st-color-primary); outline-offset: 4px; box-shadow: none; }
      .st-ach-layer { font: var(--st-font-size-body-small)/var(--st-line-height-body) var(--st-font-family); -webkit-app-region: no-drag; overscroll-behavior: contain; }
      .st-ach-layer *, .st-ach-entry * { box-sizing: border-box; }
      .st-ach-layer [hidden] { display: none !important; }
      .st-ach-dialog { display: flex; flex-direction: column; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
      .st-ach-head { flex: 0 0 auto; }
      .st-ach-head > div { min-width: 0; }
      .st-ach-head small { display: block; color: var(--st-color-text-muted); overflow-wrap: anywhere; }
      .st-ach-tools, .st-ach-selection, .st-ach-footer { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; padding: 16px 24px; flex: 0 0 auto; }
      .st-ach-tools, .st-ach-footer { border-bottom: 1px solid var(--st-color-border-normal); }
      .st-ach-tools input[type='search'] { flex: 1; min-width: 160px; width: auto; }
      .st-ach-tools select { width: auto; max-width: 100%; }
      .st-ach-layer label { display: flex; align-items: center; gap: 8px; }
      .st-ach-layer input[type='checkbox'] { accent-color: var(--st-color-steam-blue); margin: 0; }
      .st-ach-selection { padding: 12px 24px; border-bottom: 1px solid var(--st-color-border-normal); gap: 12px 24px; }
      .st-ach-selection-tools, .st-ach-selection-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
      .st-ach-count { margin-left: auto; }
      .st-ach-count, .st-ach-meta { color: var(--st-color-text-muted); font-size: var(--st-font-size-caption); }
      .st-ach-workspace { display: flex; flex-direction: column; min-height: 100px; height: min(580px, 60vh); }
      .st-ach-list { overflow-y: auto; overflow-x: hidden; min-height: 0; flex: 1; overscroll-behavior: contain; overflow-anchor: none; padding: 0 24px; scrollbar-gutter: stable; }
      .st-ach-columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; padding: 6px 0 6px 32px; color: var(--st-color-text-muted); font-size: var(--st-font-size-caption); }
      .st-ach-canvas { position: relative; width: 100%; }
      .st-ach-virtual-row { position: absolute; left: 0; right: 0; top: 0; }
      .st-ach-group { background: var(--st-color-primary-surface); border-radius: 4px; }
      .st-ach-group-toggle { display: flex; justify-content: space-between; align-items: center; flex: 1; min-width: 0; text-align: left; padding: 4px 0; border: 0; color: var(--st-color-text-primary); background: transparent; font: inherit; cursor: pointer; overflow-wrap: anywhere; }
      .st-ach-group-toggle::after { content: "▾"; }
      .st-ach-group-toggle[aria-expanded='false']::after { content: "▸"; }
      .st-ach-item { --st-ach-description-height: max(38px, 2lh); --st-ach-fields-height: calc(34px + var(--st-ach-description-height)); display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--st-color-border-normal); }
      .st-ach-check { align-self: start; justify-content: center; height: 30px; }
      .st-ach-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: minmax(30px, auto) minmax(var(--st-ach-description-height), auto); gap: 4px 16px; min-width: 0; min-height: var(--st-ach-fields-height); }
      .st-ach-group-fields { grid-template-rows: minmax(30px, auto); min-height: 30px; }
      .st-ach-original-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .st-ach-original-title > p { flex: 1; min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: var(--st-font-weight-medium); }
      .st-ach-original-title .st-ach-meta { flex: 0 0 auto; }
      .st-ach-source-description { grid-column: 1; margin: 0; align-self: start; max-height: 2lh; overflow: clip; overflow-wrap: anywhere; white-space: pre-wrap; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; }
      .st-ach-fields input[type='text'] { width: 100%; min-height: 0; height: 30px; padding: 4px 8px; }
      .st-ach-fields textarea { width: 100%; min-height: var(--st-ach-description-height); height: var(--st-ach-description-height); max-height: 240px; resize: vertical; padding: 4px 8px; line-height: var(--st-line-height-body); }
      .st-ach-hidden { display: grid; grid-template-columns: 54px minmax(0, 1fr); align-items: center; gap: 12px; width: 100%; min-width: 0; min-height: var(--st-ach-fields-height); padding: 0; text-align: left; border: 0; background: transparent; color: var(--st-color-text-primary); font: inherit; cursor: pointer; }
      .st-ach-hidden-icon { display: grid; place-items: center; width: 54px; height: 54px; background: var(--st-color-primary-surface); font-size: 28px; color: var(--st-color-text-secondary-alt); }
      .st-ach-hidden-copy { position: relative; display: grid; align-content: center; min-width: 0; min-height: 54px; padding: 4px 8px; }
      .st-ach-hidden-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .st-ach-hidden-description { display: block; margin: 4px 0 0; color: var(--st-color-text-muted); }
      .st-ach-hidden-prompt { position: absolute; inset: 0; display: none; align-items: center; padding: 4px 8px; }
      .st-ach-hidden:not(:disabled):is(:hover, :focus-visible) .st-ach-hidden-copy { background: var(--st-color-primary-surface); }
      .st-ach-hidden:not(:disabled):is(:hover, :focus-visible) .st-ach-hidden-default { visibility: hidden; }
      .st-ach-hidden:not(:disabled):is(:hover, :focus-visible) .st-ach-hidden-prompt { display: flex; }
      .st-ach-hidden:disabled { cursor: default; opacity: .6; }
      .st-ach-footer { border-bottom: 0; border-top: 1px solid var(--st-color-border-normal); }
      .st-ach-status { flex: 1; min-width: 180px; color: var(--st-color-text-secondary-alt); margin: 0; white-space: pre-wrap; }
      .st-ach-status[data-error='true'] { color: var(--st-color-danger-soft-text); }
      .st-ach-empty { padding: 24px 16px; color: var(--st-color-text-muted); }
      @media (max-width: 680px) {
        .st-ach-layer { padding: 56px 8px; }
        .st-ach-head, .st-ach-tools, .st-ach-selection, .st-ach-footer { padding-left: 16px; padding-right: 16px; }
        .st-ach-list { padding-left: 16px; padding-right: 16px; }
        .st-ach-selection-actions { flex-basis: 100%; }
        .st-ach-tools input[type='search'] { min-width: 0; width: 100%; flex-basis: 100%; }
        .st-ach-status { min-width: 0; flex-basis: 100%; }
      }
      @media (max-width: 560px) {
        .st-ach-item { --st-ach-fields-height: calc(72px + var(--st-ach-description-height) + var(--st-ach-description-height)); }
        .st-ach-fields { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(30px, auto) minmax(30px, auto) minmax(var(--st-ach-description-height), auto) minmax(var(--st-ach-description-height), auto); }
        .st-ach-group-fields { grid-template-rows: minmax(30px, auto) minmax(30px, auto); min-height: 64px; }
        .st-ach-columns { display: none; }
        .st-ach-hidden-title { flex-wrap: wrap; }
      }
      `
    ));
  }
  function start(api, _feature, _context, scope) {
    if (!api.ctx.isMainUi()) return { started: false, reason: "not-main-ui" };
    prepareStyle();
    const pending = new Map(), channel = new BroadcastChannel(model.CHANNEL);
    let stopped = false, mounted = null, dialog = null, host = null, sequence = 0, frame = 0;
    const dirtyRows = new Set();
    function finish(rid, response) {
      const entry = pending.get(rid); if (!entry) return;
      pending.delete(rid); clearTimeout(entry.timer);
      if (response.success) entry.resolve(response);
      else {
        const error = new Error(response.error || "成就翻译请求失败"); error.reported = response.reported === true;
        if (response.errorName === "AchievementContextError") error.name = response.errorName;
        entry.reject(error);
      }
    }
    function request(action, data = {}, native = false) {
      if (stopped) return Promise.reject(abortError());
      return new Promise((resolve, reject) => {
        const rid = crypto.randomUUID();
        const payload = native ? { type: action, rid, ...data } : { source: model.BRIDGE, side: "page", action, rid, ...data };
        const entry = { resolve, reject, payload, native, timer: setTimeout(() => finish(rid, { success: false, error: "成就翻译请求超时，请重试" }), native ? 20000 : 95000) };
        pending.set(rid, entry);
        if (native) channel.postMessage(payload);
        else window.postMessage(payload, window.location.origin);
      });
    }
    function onMessage(event) {
      const data = event.data;
      if (event.source === window && event.origin === window.location.origin && data?.source === model.BRIDGE && data.side === "content" && pending.get(data.rid)?.native === false) finish(data.rid, data);
    }
    channel.onmessage = event => {
      const data = event.data;
      if (data?.type === "ready") {
        for (const entry of pending.values()) if (entry.native) channel.postMessage(entry.payload);
      } else {
        const entry = pending.get(data?.rid);
        if (entry?.native === true && entry.payload.appId === data.appId &&
          data.type === (entry.payload.type === "check" ? "checked" : "loaded")) finish(data.rid, data);
      }
    };
    window.addEventListener("message", onMessage);
    function reportFailure(error, phase, current = mounted) {
      if (error.name === "AbortError") return;
      if (error.name === "AchievementContextError" && mounted === current && current) {
        current.ready = false; current.error = error;
        if (dialog?.current === current) renderList();
      }
      if (!error.reported) log.error("achievement-operation-failed", "成就翻译操作失败", { error, phase, appid: current?.appId });
      if (dialog?.current === current) status(error.message, true);
    }
    function assertCurrent(current) {
      if (stopped || mounted !== current || !current.panel.isConnected || !current.list.isConnected ||
        !current.appId || api.ctx.achievementAppId(current.panel) !== current.appId) {
        const error = new Error("无法确认当前成就页面的游戏归属，请刷新或重新打开成就页面");
        error.name = "AchievementContextError"; throw error;
      }
    }
    // 跨上下文校验期间页面仍可能切换，回复后再次检查组件身份；不以主库路由代替弹窗归属
    async function ensureContext(current, operationId) {
      try {
        assertCurrent(current);
        await request("check", { appId: current.appId, operationId }, true);
        assertCurrent(current);
      } catch (error) {
        if (error.name === "AchievementContextError" && mounted === current) { current.ready = false; current.error = error; }
        throw error;
      }
    }
    function writeText(node, value) {
      if (node.textContent === value) return;
      if (node.childNodes.length === 1 && node.firstChild.nodeType === 3) node.firstChild.nodeValue = value;
      else node.textContent = value;
    }
    function clearBindingMetadata(binding) {
      if (binding.title.getAttribute("title") === binding.tooltip) {
        if (binding.previousTooltip === null) binding.title.removeAttribute("title");
        else binding.title.setAttribute("title", binding.previousTooltip);
      }
      binding.row.removeAttribute("data-st-achievement-id");
      binding.row.removeAttribute("data-st-achievement-group");
    }
    function restore(binding) {
      if (binding.nameNode) {
        if (binding.nameNode.nodeValue === binding.appliedTitle) binding.nameNode.nodeValue = binding.original;
        clearBindingMetadata(binding); return;
      }
      if (binding.title.textContent === binding.appliedTitle) writeText(binding.title, binding.item.title);
      if (binding.description.textContent === binding.appliedDescription) writeText(binding.description, binding.item.description);
      clearBindingMetadata(binding);
    }
    function applyRow(current, row) {
      if (!row.isConnected || !current.list.contains(row)) return;
      const title = row.querySelector(TITLE), description = row.querySelector(DESCRIPTION);
      if (!title || !description) return;
      let binding = current.bindings.get(row);
      const isOwnText = binding && binding.title === title && binding.description === description && title.textContent === binding.appliedTitle && description.textContent === binding.appliedDescription;
      if (!isOwnText) {
        if (binding) clearBindingMetadata(binding);
        const matches = current.bySource.get(model.sourceKey({ title: title.textContent, description: description.textContent }));
        // 文本仅用来把原生可见行关联到完整列表里的唯一 ID，绝不作为持久化主键。
        // 同名同说明无法唯一关联时保持原文，管理弹窗仍可按真实 ID 编辑。
        if (!matches || matches.length !== 1) { current.bindings.delete(row); return; }
        binding = { row, title, description, item: matches[0], previousTooltip: title.getAttribute("title") };
        current.bindings.set(row, binding);
      }
      const record = current.records.get(binding.item.key);
      const translated = model.current(record, binding.item);
      binding.appliedTitle = translated ? record.translatedTitle : binding.item.title;
      binding.appliedDescription = translated ? record.translatedDescription : binding.item.description;
      binding.tooltip = `${binding.item.title}\n${binding.item.description}`;
      writeText(title, binding.appliedTitle); writeText(description, binding.appliedDescription);
      row.dataset.stAchievementId = binding.item.id;
      if (translated) title.setAttribute("title", binding.tooltip);
      else if (title.getAttribute("title") === binding.tooltip) {
        if (binding.previousTooltip === null) title.removeAttribute("title"); else title.setAttribute("title", binding.previousTooltip);
      }
    }
    function applyGroup(current, row) {
      const group = api.ctx.achievementGroup(row), title = row.querySelector(GROUP_TITLE);
      const item = group && current.entities.get(`g:${group.id}`);
      if (!item || !title) return;
      let binding = current.bindings.get(row);
      if (!binding || binding.title !== title || !title.contains(binding.nameNode) || binding.nameNode.nodeValue !== binding.appliedTitle) {
        if (binding) clearBindingMetadata(binding);
        const matches = [...title.childNodes].filter(node => node.nodeType === 3 && node.nodeValue === group.name);
        if (matches.length !== 1) { current.bindings.delete(row); return; }
        binding = { row, title, nameNode: matches[0], original: group.name, previousTooltip: title.getAttribute("title") };
        current.bindings.set(row, binding);
      }
      const record = current.records.get(item.key), translated = model.current(record, item);
      binding.appliedTitle = translated ? record.translatedTitle : binding.original; binding.tooltip = binding.original;
      if (binding.nameNode.nodeValue !== binding.appliedTitle) binding.nameNode.nodeValue = binding.appliedTitle;
      row.dataset.stAchievementGroup = item.id;
      if (translated) title.setAttribute("title", binding.tooltip);
      else if (title.getAttribute("title") === binding.tooltip) {
        if (binding.previousTooltip === null) title.removeAttribute("title"); else title.setAttribute("title", binding.previousTooltip);
      }
    }
    function applyRows() {
      frame = 0;
      const current = mounted;
      if (!current || !current.ready || document.hidden || api.ctx.achievementAppId(current.panel) !== current.appId) { dirtyRows.clear(); return; }
      for (const row of dirtyRows) if (row.matches(GROUP)) applyGroup(current, row); else applyRow(current, row);
      dirtyRows.clear();
      for (const row of current.bindings.keys()) if (!row.isConnected || !current.list.contains(row)) current.bindings.delete(row);
    }
    function enqueue(row) {
      if (!row) return;
      dirtyRows.add(row);
      if (!frame) frame = requestAnimationFrame(applyRows);
    }
    function applyVisible(current) { for (const row of current.list.querySelectorAll(`${ROW},${GROUP}`)) enqueue(row); }
    function mutations(records) {
      if (!mounted || document.hidden) return;
      for (const record of records) {
        const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        if (!target || !mounted.list.contains(target)) continue;
        enqueue(target.closest(`${ROW},${GROUP}`));
        for (const node of record.addedNodes || []) if (node.nodeType === 1) {
          if (node.matches(`${ROW},${GROUP}`)) enqueue(node);
          else for (const row of node.querySelectorAll(`${ROW},${GROUP}`)) enqueue(row);
        }
      }
    }
    async function load(current, rebaseDrafts = false) {
      if (current.loading) return current.loading;
      current.ready = false; current.error = null;
      if (dialog?.current === current) { updateControls(); status("正在读取完整成就列表…"); }
      current.loading = (async () => {
        assertCurrent(current);
        const [native, response] = await Promise.all([request("load", { appId: current.appId }, true), request("load", { appId: current.appId })]);
        if (mounted !== current || stopped) return;
        await ensureContext(current);
        const grouped = model.grouped(native.items, api.ctx.achievementSchema(current.list, current.appId), current.appId);
        current.items = grouped.items.map(item => ({ ...item, kind: "achievement", key: `a:${item.id}` })); current.groups = grouped.groups; current.gameName = native.gameName;
        current.itemById = new Map(current.items.map(item => [item.id, item]));
        current.language = response.data.language; current.aiReady = response.data.aiReady;
        current.records = new Map(response.data.records.map(record => [`a:${record.id}`, record]));
        for (const record of response.data.groupRecords) current.records.set(`g:${record.id}`, record);
        current.entities = new Map(current.items.map(item => [item.key, item])); current.keysByGroup = new Map();
        const showGroups = current.groups.length > 1 || (current.groups[0]?.id ?? 0) !== 0;
        for (const group of current.groups) {
          const keys = [];
          if (showGroups) {
            const item = { key: `g:${group.id}`, id: String(group.id), title: group.name, description: "", kind: "group", groupId: group.id };
            current.entities.set(item.key, item); keys.push(item.key);
          }
          current.keysByGroup.set(group.id, keys);
        }
        current.bySource.clear(); current.itemsByGroup.clear();
        for (const item of current.items) {
          const key = model.sourceKey(item), rows = current.bySource.get(key) || [];
          rows.push(item); current.bySource.set(key, rows);
          const group = current.itemsByGroup.get(item.groupId) || [];
          group.push(item); current.itemsByGroup.set(item.groupId, group);
          current.keysByGroup.get(item.groupId).push(item.key);
        }
        current.searchIndex = new Map();
        for (const item of current.entities.values()) indexSearch(current, item);
        current.error = null; current.ready = true;
        applyVisible(current);
        if (dialog?.current === current) {
          if (rebaseDrafts) for (const [key, draft] of dialog.drafts) {
            const item = current.entities.get(key), record = current.records.get(key);
            if (!item) continue;
            draft.revision = record?.revision || 0;
            draft.baseTitle = model.current(record, item) ? record.translatedTitle : "";
            draft.baseDescription = model.current(record, item) ? record.translatedDescription : "";
            draft.baseCleared = record?.cleared === true; syncDirty(key);
          }
          rebuildSelectionCounts(); renderManager(true);
        }
      })().catch(error => {
        if (mounted !== current || stopped) return;
        current.error = error;
        if (dialog?.current === current) renderList();
        reportFailure(error, "load", current);
      }).finally(() => { current.loading = null; });
      return current.loading;
    }
    function detach() {
      if (!mounted) return;
      const current = mounted; mounted = null;
      closeManager(true);
      current.observer.disconnect(); current.entry.remove();
      for (const binding of current.bindings.values()) restore(binding);
      current.bindings.clear(); dirtyRows.clear();
      if (frame) cancelAnimationFrame(frame); frame = 0;
    }
    function onSurfaceChange(active, context) {
      if (stopped) return;
      if (document.hidden) {
        if (mounted) { mounted.observer.disconnect(); mounted.paused = true; }
        host?.setTarget(null); return;
      }
      if (!active) { detach(); return; }
      const sameSurface = mounted?.panel.isConnected && mounted.list.isConnected && mounted.actions.isConnected && (context.targets || []).some(target => target.contains(mounted.panel));
      const appId = sameSurface ? api.ctx.achievementAppId(mounted.panel) : 0;
      if (sameSurface && !appId && mounted.appId) {
        // 暂时无法确认身份时保留管理器和草稿，只在首次失效时暂停并恢复属于本模块的文字
        if (!mounted.identityUnavailable) {
          mounted.identityUnavailable = true;
          for (const binding of mounted.bindings.values()) restore(binding);
          mounted.bindings.clear();
          const error = new Error("无法确认当前成就页面的游戏归属，请刷新或重新打开成就页面");
          error.name = "AchievementContextError";
          reportFailure(error, "identity", mounted);
        }
        return;
      }
      if (sameSurface && appId === mounted.appId) {
        if (mounted.entry.parentElement !== mounted.actions) mounted.actions.prepend(mounted.entry);
        if (mounted.identityUnavailable) { mounted.identityUnavailable = false; load(mounted); }
        if (mounted.paused) {
          mounted.paused = false;
          mounted.observer.observe(mounted.list, { characterData: true, subtree: true });
          host?.setTarget(mounted.panel); applyVisible(mounted);
          if (dialog?.current === mounted) scheduleViewport();
        }
        mutations(context.records || []); return;
      }
      detach();
      const found = surface(context);
      if (!found) { host?.setTarget(null); return; }
      const current = { ...found, generation: ++sequence, ready: false, items: [], groups: [], itemsByGroup: new Map(), keysByGroup: new Map(), entities: new Map(), searchIndex: new Map(), itemById: new Map(), records: new Map(), bySource: new Map(), bindings: new Map(), error: null, loading: null };
      const entry = element("div", "st-ach-entry");
      entry.append(button("成就翻译", "open"));
      entry.addEventListener("click", () => openManager(current));
      current.entry = entry; current.actions.prepend(entry);
      current.observer = new MutationObserver(mutations);
      // 原生列表会原地更新文字；childList 生命周期复用 Surface Host，这里只补文字变更。
      current.observer.observe(current.list, { characterData: true, subtree: true });
      mounted = current; host?.setTarget(current.panel);
      load(current);
    }
    function status(message, error = false) {
      if (!dialog) return;
      dialog.status.textContent = message; dialog.status.dataset.error = String(error);
    }
    function indexSearch(current, item) {
      const record = current.records.get(item.key), valid = model.current(record, item);
      current.searchIndex.set(item.key, [item.id, item.title, item.description, valid ? record.translatedTitle : "", valid ? record.translatedDescription : ""].join("\n").toLocaleLowerCase());
    }
    function detailsVisible(item) { return item.kind === "group" || !item.hidden || dialog.revealed.has(item.key); }
    function draftFor(item) {
      const d = dialog;
      if (!d.drafts.has(item.key)) {
        const record = d.current.records.get(item.key), valid = model.current(record, item);
        const title = valid ? record.translatedTitle : "", description = valid ? record.translatedDescription : "";
        d.drafts.set(item.key, { title, description, baseTitle: title, baseDescription: description, baseCleared: record?.cleared === true, clear: false, origin: valid ? record.origin : "manual", revision: record?.revision || 0, pendingAI: false });
      }
      return d.drafts.get(item.key);
    }
    // 编辑和选择只维护增量计数，不随每次按键扫描全部草稿或整个分组。
    function syncDirty(key, d = dialog) {
      const draft = d.drafts.get(key), before = d.dirty.has(key);
      const changed = !!draft && (draft.pendingAI || draft.title !== draft.baseTitle || draft.description !== draft.baseDescription || (draft.clear && !draft.baseCleared && !!draft.revision));
      if (changed) d.dirty.add(key); else d.dirty.delete(key);
      if (d.selected.has(key) && changed !== before) d.selectedDirty += changed ? 1 : -1;
    }
    function setSelected(key, selected, automatic = false) {
      const d = dialog, before = d.selected.has(key);
      // 手动选择拥有优先权，即使全选没有改变勾选值，也不能再被“恢复原值”撤销。
      if (!automatic || !selected) d.autoSelected.delete(key);
      if (before === selected) return;
      if (selected) { d.selected.add(key); if (automatic) d.autoSelected.add(key); } else d.selected.delete(key);
      const item = d.current.entities.get(key), delta = selected ? 1 : -1;
      if (item) d.selectionCounts.set(item.groupId, (d.selectionCounts.get(item.groupId) || 0) + delta);
      if (d.dirty.has(key)) d.selectedDirty += delta;
    }
    function rebuildSelectionCounts() {
      if (!dialog) return;
      const d = dialog; d.selectionCounts.clear(); d.selectedDirty = 0;
      for (const key of d.selected) {
        const item = d.current.entities.get(key);
        if (!item) { d.selected.delete(key); d.autoSelected.delete(key); continue; }
        d.selectionCounts.set(item.groupId, (d.selectionCounts.get(item.groupId) || 0) + 1);
        if (d.dirty.has(key)) d.selectedDirty++;
      }
    }
    function closeManager(force = false) {
      if (!dialog) return;
      if (!force && dialog.dirty.size) {
        dialog.discard.hidden = false; status("有译文修改尚未保存。请先保存，或选择“放弃修改并关闭”。", true); return;
      }
      const d = dialog; dialog = null; d.job?.queue.cancel();
      if (d.scrollFrame) cancelAnimationFrame(d.scrollFrame);
      if (d.filterFrame) cancelAnimationFrame(d.filterFrame);
      d.resize.disconnect(); d.viewportResize.disconnect(); d.lifecycle.close(); d.root.remove();
    }
    function openManager(current) {
      if (stopped || mounted !== current) return;
      if (dialog) { dialog.lifecycle.focusInitial(); return; }
      const root = element("div", "st-ach-layer"), box = element("section", "st-ach-dialog");
      root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-labelledby", "st-ach-title"); root.tabIndex = -1;
      const head = element("header", "st-ach-head"), heading = element("div"), title = element("h2", "", "Steam Buff · 成就翻译"); title.id = "st-ach-title";
      const subtitle = element("small", "st-ach-meta"); heading.append(title, subtitle); head.append(heading, button("关闭", "close"));
      const tools = element("div", "st-ach-tools"), search = element("input"); search.type = "search"; search.placeholder = "搜索原文、译文或成就 ID"; search.setAttribute("aria-label", "搜索成就");
      const groupFilter = element("select"); groupFilter.setAttribute("aria-label", "成就分组");
      const filter = element("select"); filter.setAttribute("aria-label", "翻译状态");
      for (const [value, label] of [["all", "全部成就"], ["missing", "未翻译 / 原文已变"], ["draft", "待保存"], ["manual", "手动译文"], ["ai", "AI 译文"], ["hidden", "隐藏成就"]]) { const option = element("option", "", label); option.value = value; filter.append(option); }
      const refresh = button("刷新", "refresh"); tools.append(search, groupFilter, filter, refresh);
      const selection = element("div", "st-ach-selection"), selectionTools = element("div", "st-ach-selection-tools"), actions = element("div", "st-ach-selection-actions");
      const select = button("全选", "select"), invert = button("反选", "invert"), clearSelection = button("取消勾选", "clear-selection");
      select.title = "勾选全部筛选结果，包含隐藏成就与分组名称";
      const ai = button("翻译选中", "ai", true), save = button("保存选中", "save");
      const stop = button("停止", "stop"); stop.hidden = true;
      const count = element("span", "st-ach-count"); selectionTools.append(select, invert, clearSelection); actions.append(ai, save, stop); selection.append(selectionTools, actions, count);
      const workspace = element("div", "st-ach-workspace"), list = element("div", "st-ach-list"), content = element("div", "st-ach-canvas");
      const columns = element("div", "st-ach-columns"); columns.setAttribute("aria-hidden", "true"); columns.append(element("span", "", "原文"), element("span", "", "译文"));
      list.setAttribute("aria-label", "成就翻译列表"); list.setAttribute("role", "list"); list.append(columns, content); workspace.append(list);
      const footer = element("footer", "st-ach-footer"), message = element("p", "st-ach-status"); message.setAttribute("role", "status"); message.setAttribute("aria-live", "polite");
      const discard = button("放弃修改并关闭", "discard"); discard.hidden = true;
      footer.append(message, discard); box.append(head, tools, selection, workspace, footer); root.append(box); document.body.append(root);
      const d = dialog = { root, current, subtitle, search, groupFilter, filter, refresh, ai, save, select, invert, clearSelection, stop, count, status: message, discard, list, columns, content,
        drafts: new Map(), dirty: new Set(), selected: new Set(), autoSelected: new Set(), selectionCounts: new Map(), selectedDirty: 0, revealed: new Set(), collapsed: new Set(), nodes: new Map(), views: new Map(),
        entries: [], filtered: [], window: window.STVirtualList.createMeasuredWindow(), scrollFrame: 0, filterFrame: 0, focusAfterReveal: null, width: list.clientWidth, job: null, saving: false };
      d.lifecycle = window.STDialogLifecycle.open({ root, trap: box, initial: search, onEscape: () => closeManager(), restore: current.entry.querySelector("button") });
      d.resize = new ResizeObserver(entries => {
        if (dialog !== d || document.hidden) return;
        let changed = false;
        // 先完成测量，再在下一帧统一写位置，不交错读写布局。
        for (const entry of entries) if (d.window.measure(entry.target.dataset.key, entry.target.getBoundingClientRect().height)) changed = true;
        if (changed) scheduleViewport();
      });
      d.viewportResize = new ResizeObserver(() => {
        if (dialog !== d || document.hidden) return;
        const width = list.clientWidth;
        if (Math.abs(width - d.width) > 1) { d.width = width; renderList(true); }
        else scheduleViewport();
      });
      d.viewportResize.observe(list);
      root.addEventListener("click", clickManager);
      list.addEventListener("scroll", scheduleViewport, { passive: true }); root.addEventListener("focusout", scheduleViewport);
      search.addEventListener("input", () => {
        if (d.filterFrame) cancelAnimationFrame(d.filterFrame);
        d.filterFrame = requestAnimationFrame(() => { d.filterFrame = 0; if (dialog === d) { list.scrollTop = 0; renderList(); } });
      });
      for (const input of [filter, groupFilter]) input.addEventListener("change", () => { list.scrollTop = 0; renderList(); });
      root.addEventListener("change", event => {
        const input = event.target;
        if (!input.matches("input[data-check]")) return;
        const item = current.entities.get(input.dataset.check);
        const keys = item?.kind === "group" ? current.keysByGroup.get(item.groupId) : [input.dataset.check];
        for (const key of keys || []) setSelected(key, input.checked);
        updateControls();
      });
      root.addEventListener("input", event => {
        const input = event.target, key = input.closest("[data-key]")?.dataset.key;
        if (!key || !["title", "description"].includes(input.dataset.edit)) return;
        const item = current.entities.get(key); if (!item || !detailsVisible(item)) return;
        const draft = draftFor(item); draft[input.dataset.edit] = input.value; draft.origin = "manual"; draft.pendingAI = false; draft.clear = false;
        syncDirty(key);
        // 只自动选择当前草稿；分组名称不能借此勾选整个分组，输入节点也不重建。
        if (d.dirty.has(key)) setSelected(key, true, true);
        else if (d.autoSelected.has(key)) setSelected(key, false, true);
        updateControls();
      });
      renderManager(true); d.lifecycle.focusInitial();
      if (current.error) { status(current.error.message, true); load(current); }
    }
    function recordStatus(item) {
      const d = dialog, draft = d.drafts.get(item.key), record = d.current.records.get(item.key);
      if (d.dirty.has(item.key)) return draft.clear ? "待清除 · 尚未保存" : `${draft.origin === "ai" ? "AI 草稿" : "手动修改"} · 尚未保存`;
      if (!record || record.cleared) return "未翻译";
      if (!model.current(record, item)) return "原文已变化";
      return record.origin === "ai" ? "AI 译文" : "手动译文";
    }
    function displayGroup(group) {
      const item = dialog.current.entities.get(`g:${group.id}`), record = dialog.current.records.get(item?.key);
      return item && model.current(record, item) ? record.translatedTitle : group.name;
    }
    function matches(item, query, mode) {
      const d = dialog, draft = d.drafts.get(item.key), record = d.current.records.get(item.key), valid = model.current(record, item);
      if (mode === "missing" && valid) return false;
      if (mode === "draft" && !d.dirty.has(item.key)) return false;
      if (mode === "hidden" && !item.hidden) return false;
      if (["manual", "ai"].includes(mode) && (!valid || record.origin !== mode)) return false;
      if (!query) return true;
      if (!detailsVisible(item)) return `${item.id}\n隐藏成就`.toLocaleLowerCase().includes(query);
      return d.current.searchIndex.get(item.key).includes(query) || !!draft && `${draft.title}\n${draft.description}`.toLocaleLowerCase().includes(query);
    }
    function renderList(clearMeasurements = false) {
      if (!dialog) return;
      const d = dialog, query = d.search.value.trim().toLocaleLowerCase(), mode = d.filter.value;
      d.entries = []; d.filtered = [];
      for (const group of d.current.groups) {
        if (d.groupFilter.value !== "all" && String(group.id) !== d.groupFilter.value) continue;
        const groupItem = d.current.entities.get(`g:${group.id}`), rows = [];
        for (const item of d.current.itemsByGroup.get(group.id) || []) if (matches(item, query, mode)) { rows.push(item.key); d.filtered.push(item.key); }
        const groupMatches = !!groupItem && matches(groupItem, query, mode);
        if (!rows.length && !groupMatches) continue;
        if (groupItem) { d.entries.push(groupItem.key); if (groupMatches) d.filtered.push(groupItem.key); }
        if (!d.collapsed.has(group.id)) d.entries.push(...rows);
      }
      const narrow = window.innerWidth <= 560;
      d.window.reset(d.entries, key => d.current.entities.get(key).kind === "group" ? (narrow ? 78 : 44) : (narrow ? 162 : 90), clearMeasurements);
      for (const [key, node] of d.nodes) if (d.window.indexOf(key) === undefined) removeNode(d, key, node);
      renderViewport(); updateControls();
    }
    function removeNode(d, key, node) { d.resize.unobserve(node); node.remove(); d.nodes.delete(key); d.views.delete(key); }
    function scheduleViewport() {
      if (!dialog || dialog.scrollFrame) return;
      const d = dialog; d.scrollFrame = requestAnimationFrame(() => { d.scrollFrame = 0; if (dialog === d) renderViewport(); });
    }
    function renderViewport() {
      if (!dialog || document.hidden) return;
      // 紧凑行缩短像素预留，只挂载视口附近表单；列标题占用的高度不参与行索引。
      const d = dialog, range = d.window.range(Math.max(0, d.list.scrollTop - d.columns.clientHeight), d.list.clientHeight, 400), indices = [];
      for (let i = range.start; i < range.end; i++) indices.push(i);
      const focused = document.activeElement?.closest(".st-ach-virtual-row")?.dataset.key, pinned = focused && d.window.indexOf(focused);
      // 滚走的焦点行仅额外保留一条，不扩成从焦点到视口的整段 DOM。
      if (Number.isInteger(pinned) && !indices.includes(pinned)) indices.push(pinned);
      indices.sort((a, b) => a - b);
      const wanted = new Set(indices.map(i => d.entries[i]));
      for (const [key, node] of d.nodes) if (!wanted.has(key)) removeNode(d, key, node);
      d.content.style.height = `${range.totalHeight}px`;
      for (const i of indices) {
        const key = d.entries[i]; let node = d.nodes.get(key);
        if (!node) {
          node = renderItem(d.current.entities.get(key)); node.classList.add("st-ach-virtual-row"); node.dataset.key = key;
          node.setAttribute("role", "listitem"); node.setAttribute("aria-posinset", String(i + 1)); node.setAttribute("aria-setsize", String(d.entries.length));
          const next = indices.slice(indices.indexOf(i) + 1).map(j => d.nodes.get(d.entries[j])).find(Boolean);
          d.content.insertBefore(node, next || null); d.nodes.set(key, node); d.resize.observe(node);
        }
        node.style.transform = `translateY(${d.window.offset(i)}px)`; updateView(key);
      }
      if (!d.entries.length) {
        d.empty = d.empty || element("div", "st-ach-empty"); d.empty.textContent = d.current.error?.message || (d.current.ready ? "没有符合筛选条件的成就" : "正在读取完整成就列表…");
        if (!d.empty.isConnected) d.content.append(d.empty);
      } else d.empty?.remove();
      if (d.focusAfterReveal) {
        d.views.get(d.focusAfterReveal)?.name?.focus({ preventScroll: true }); d.focusAfterReveal = null;
      }
    }
    function invalidate(keys) {
      const d = dialog; if (!d) return;
      for (const key of keys) { const node = d.nodes.get(key); if (node) removeNode(d, key, node); }
      scheduleViewport();
    }
    function renderItem(item) {
      const d = dialog, row = element("article", item.kind === "group" ? "st-ach-item st-ach-group" : "st-ach-item"); row.dataset.id = item.id; row.setAttribute("aria-label", `${item.kind === "group" ? "分组" : "成就"} ${item.id}`);
      const label = element("label", "st-ach-check"), check = element("input"); check.type = "checkbox"; check.dataset.check = item.key;
      check.setAttribute("aria-label", `勾选${item.kind === "group" ? "分组" : "成就"} ${item.id}`);
      label.append(check); row.append(label);
      const meta = element("small", "st-ach-meta");
      const view = { item, check, meta }; d.views.set(item.key, view);
      if (!detailsVisible(item)) {
        // 遮罩与两列编辑区共用最小高度，不把剧透原文或译文写入隐藏节点。
        const reveal = button("", "reveal"); reveal.className = "st-ach-hidden"; reveal.dataset.key = item.key;
        reveal.setAttribute("aria-label", "点击以显示剧透");
        const icon = element("span", "st-ach-hidden-icon", "?"); icon.setAttribute("aria-hidden", "true");
        const copy = element("span", "st-ach-hidden-copy"), placeholder = element("span", "st-ach-hidden-default"), titleLine = element("span", "st-ach-hidden-title");
        titleLine.append(element("strong", "", "隐藏的成就"), meta); placeholder.append(titleLine, element("span", "st-ach-hidden-description", "此成就的详情将在您将其解锁后显示"));
        copy.append(placeholder, element("span", "st-ach-hidden-prompt", "点击以显示剧透")); reveal.append(icon, copy);
        view.reveal = reveal; row.append(reveal); return row;
      }
      const draft = draftFor(item), fields = element("div", item.kind === "group" ? "st-ach-fields st-ach-group-fields" : "st-ach-fields"), original = element("div", "st-ach-original-title");
      if (item.kind === "group") {
        const toggle = button(`${item.title} · ${d.current.itemsByGroup.get(item.groupId).length} 项`, "group");
        toggle.className = "st-ach-group-toggle"; toggle.dataset.key = item.key; toggle.setAttribute("aria-expanded", String(!d.collapsed.has(item.groupId))); original.append(toggle); view.toggle = toggle;
      } else { const title = element("p", "", item.title); title.title = item.title; original.append(title); }
      original.append(meta);
      const name = element("input"); name.type = "text"; name.dataset.edit = "title"; name.value = draft.title; name.maxLength = 2000;
      name.setAttribute("aria-label", item.kind === "group" ? "翻译分组名称" : "译文名称"); name.placeholder = item.kind === "group" ? "输入分组译文" : "输入译文名称";
      fields.append(original, name); view.name = name;
      if (item.kind !== "group") {
        const description = element("textarea"); description.dataset.edit = "description"; description.value = draft.description; description.maxLength = 24000;
        description.rows = 1; description.setAttribute("aria-label", "译文说明"); description.placeholder = "输入译文说明";
        const source = element("p", "st-ach-source-description", item.description || "（无介绍）"); source.title = item.description;
        fields.append(source, description); view.description = description;
      }
      row.append(fields); return row;
    }
    function updateView(key) {
      const d = dialog, view = d.views.get(key); if (!view) return;
      const { item } = view, busy = !!d.job || d.saving, unavailable = busy || !d.current.ready;
      const total = d.current.keysByGroup.get(item.groupId)?.length || 0, selected = d.selectionCounts.get(item.groupId) || 0;
      view.check.checked = item.kind === "group" ? total > 0 && selected === total : d.selected.has(key);
      view.check.indeterminate = item.kind === "group" && selected > 0 && selected < total; view.check.disabled = unavailable;
      view.meta.textContent = recordStatus(item);
      for (const input of [view.name, view.description, view.reveal]) if (input) input.disabled = unavailable;
    }
    function updateControls() {
      if (!dialog) return;
      const d = dialog, busy = !!d.job || d.saving, unavailable = busy || !d.current.ready;
      d.ai.disabled = unavailable || !d.current.aiReady || !d.selected.size; d.save.disabled = unavailable || !d.selectedDirty;
      for (const node of [d.select, d.invert, d.clearSelection]) node.disabled = unavailable;
      d.refresh.disabled = busy; d.filter.disabled = busy; d.groupFilter.disabled = busy; d.search.disabled = busy;
      d.stop.hidden = !d.job; d.stop.disabled = !!d.job?.queue.snapshot().cancelled;
      d.count.textContent = `已勾选 ${d.selected.size} 项 · 待保存 ${d.dirty.size} 项`;
      for (const key of d.views.keys()) updateView(key);
    }
    function renderManager(reset = false) {
      if (!dialog) return;
      const d = dialog;
      if (reset) {
        const selected = d.groupFilter.value; d.groupFilter.replaceChildren();
        for (const group of [{ id: "all", name: "全部分组" }, ...d.current.groups]) { const option = element("option", "", group.id === "all" ? group.name : displayGroup(group)); option.value = String(group.id); d.groupFilter.append(option); }
        if ([...d.groupFilter.options].some(option => option.value === selected)) d.groupFilter.value = selected;
        d.groupFilter.hidden = ![...d.current.entities.values()].some(item => item.kind === "group");
      }
      d.subtitle.textContent = `${d.current.gameName || `AppID ${d.current.appId}`} · ${d.current.items.length} 项成就 · ${d.current.language === "chinese_simplified" ? "简体中文" : d.current.language || ""}`;
      renderList();
      if (!d.current.ready) status("正在读取完整成就列表…");
      else if (!d.job && !d.saving) status(d.current.aiReady ? "手动编辑后自动勾选，AI翻译只生成草稿；点击保存选中才生效。未解锁的隐藏成就可点击查看。" : "AI 服务尚未配置；手动编辑后自动勾选，点击保存选中才生效。");
    }
    async function saveTranslations(keys) {
      const d = dialog; if (!d || !d.current.ready || d.saving || d.job) return;
      const entries = keys.filter(key => d.dirty.has(key)).map(key => {
        const item = d.current.entities.get(key), draft = d.drafts.get(key);
        if (!item) throw new Error("待保存成就已变化，请刷新核对");
        return { ...item, translatedTitle: draft.title, translatedDescription: draft.description, expectedRevision: draft.revision, origin: draft.origin, clear: draft.clear };
      });
      if (!entries.length) { status("选中项没有待保存修改。"); return; }
      const operationId = crypto.randomUUID(); d.saving = true; updateControls(); let saved = 0, cleared = 0, conflicts = 0;
      try {
        for (const kind of ["achievement", "group"]) for (const batch of model.batches(entries.filter(item => item.kind === kind))) {
          if (dialog !== d || mounted !== d.current) throw abortError();
          model.saveEntries(batch); await ensureContext(d.current, operationId);
          if (dialog !== d || mounted !== d.current) throw abortError();
          const response = await request("save", { kind, appId: d.current.appId, language: d.current.language, entries: batch, operationId });
          for (const record of response.data.saved) {
            const key = `${kind === "group" ? "g" : "a"}:${record.id}`;
            d.current.records.set(key, record); d.drafts.delete(key); syncDirty(key, d); d.autoSelected.delete(key); indexSearch(d.current, d.current.entities.get(key));
            const view = d.views.get(key); if (view?.name) view.name.value = record.cleared ? "" : record.translatedTitle; if (view?.description) view.description.value = record.cleared ? "" : record.translatedDescription;
            if (record.cleared) cleared++; else saved++;
          }
          conflicts += response.data.conflicts.length; if (mounted === d.current) applyVisible(d.current);
        }
        log[conflicts ? "warn" : "info"]("achievement-translations-saved", "用户保存成就与分组译文", { operationId, appid: d.current.appId, savedCount: saved, clearedCount: cleared, conflictCount: conflicts });
        if (dialog === d) { renderManager(true); status(`已保存 ${saved} 项${conflicts ? `；${conflicts} 项有更新冲突，草稿保留，请刷新核对后保存` : ""}`, conflicts > 0); }
      } catch (error) {
        log.warn("achievement-save-partial", "译文保存失败或部分完成", { operationId, appid: d.current.appId, savedCount: saved, clearedCount: cleared, error });
        if (dialog === d) status(`已保存 ${saved} 项；剩余未保存：${error.message}`, true);
      } finally { d.saving = false; if (dialog === d) updateControls(); }
    }
    async function translate(keys) {
      const d = dialog; if (!d || !d.current.ready || d.saving || d.job || !d.current.aiReady) return;
      const items = keys.map(key => d.current.entities.get(key));
      if (!items.length) { status("请先勾选需要翻译的成就或分组。"); return; }
      if (items.some(item => !item)) { status("勾选内容已变化，请刷新后重新勾选。", true); return; }
      const revisions = new Map(items.map(item => [item.key, d.current.records.get(item.key)?.revision || 0]));
      const conceal = [];
      for (const item of items) if (item.hidden && d.revealed.delete(item.key)) conceal.push(item.key);
      const job = { operationId: crypto.randomUUID(), queue: null }; let generated = 0, failed = 0, processed = 0;
      job.queue = window.STBatchQueue.createQueue({ batchSize: 1, worker: async ({ kind, items: batch }) => {
        if (dialog === d) status(`AI翻译中：${processed} / ${items.length}，已生成 ${generated} 项草稿`);
        await ensureContext(d.current, job.operationId);
        if (job.queue.snapshot().cancelled || dialog !== d || mounted !== d.current) return { status: "skipped" };
        const response = await request("translate", { kind, appId: d.current.appId, language: d.current.language, gameName: d.current.gameName, items: batch, operationId: job.operationId });
        if (job.queue.snapshot().cancelled || dialog !== d || mounted !== d.current) return { status: "skipped" };
        await ensureContext(d.current, job.operationId);
        if (job.queue.snapshot().cancelled || dialog !== d || mounted !== d.current) return { status: "skipped" };
        for (const row of response.data.items) {
          const key = `${kind === "group" ? "g" : "a"}:${row.id}`, item = d.current.entities.get(key), draft = draftFor(item);
          Object.assign(draft, { title: row.translatedTitle, description: row.translatedDescription, origin: "ai", revision: revisions.get(key), pendingAI: true, clear: false }); syncDirty(key);
          const view = d.views.get(key); if (view?.name) view.name.value = draft.title; if (view?.description) view.description.value = draft.description;
        }
        generated += batch.length; processed += batch.length; if (dialog === d) updateControls();
      }, onError(error, batch) {
        if (job.queue.snapshot().cancelled || error.name === "AbortError") return;
        failed += batch.items.length; processed += batch.items.length;
        if (error.name === "AchievementContextError") { job.contextError = error; job.queue.cancel(); }
        reportFailure(error, "ai-batch", d.current);
      } });
      for (const kind of ["achievement", "group"]) job.queue.enqueue(model.batches(items.filter(item => item.kind === kind)).map(batch => ({ kind, items: batch })));
      d.job = job; invalidate(conceal); updateControls();
      try {
        await job.queue.run(); const cancelled = job.queue.snapshot().cancelled;
        if (!cancelled) log[failed ? "warn" : "info"]("achievement-drafts-generated", "AI 译文草稿生成完成，等待用户保存", { operationId: job.operationId, appid: d.current.appId, generatedCount: generated, failedCount: failed, selectedCount: keys.length });
        if (dialog === d) status(`${job.contextError ? job.contextError.message : cancelled ? "已停止" : "翻译完成"}：已生成 ${generated} 项草稿，失败 ${failed} 项，未处理 ${items.length - processed} 项；点击保存后才生效。`, failed > 0);
      } finally { d.job = null; if (dialog === d) { renderList(); updateControls(); } }
    }
    function clickManager(event) {
      const target = event.target.closest("button[data-action]"); if (!target || target.disabled || !dialog) return;
      const d = dialog, action = target.dataset.action, item = d.current.entities.get(target.dataset.key);
      if (action === "close") closeManager();
      else if (action === "discard") closeManager(true);
      else if (action === "group") { if (d.collapsed.has(item.groupId)) d.collapsed.delete(item.groupId); else d.collapsed.add(item.groupId); renderList(); const view = d.views.get(item.key); view?.toggle?.setAttribute("aria-expanded", String(!d.collapsed.has(item.groupId))); }
      else if (action === "reveal") {
        d.revealed.add(item.key); d.focusAfterReveal = item.key; invalidate([item.key]);
      } else if (action === "select" || action === "invert") { for (const key of d.filtered) setSelected(key, action === "select" || !d.selected.has(key)); updateControls(); }
      else if (action === "clear-selection") { d.selected.clear(); d.autoSelected.clear(); d.selectionCounts.clear(); d.selectedDirty = 0; updateControls(); }
      else if (action === "save") saveTranslations([...d.selected]).catch(error => reportFailure(error, "save", d.current));
      else if (action === "ai") translate([...d.selected]).catch(error => reportFailure(error, "ai-batch", d.current));
      else if (action === "stop") { d.job.queue.cancel(); status("正在停止；已经生成的草稿保留，不会自动保存。"); updateControls(); }
      else if (action === "refresh") { load(d.current, true); }
    }
    function stop() {
      if (stopped) return;
      stopped = true; detach(); host?.dispose(); window.removeEventListener("message", onMessage);
      channel.onmessage = null; channel.close();
      for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(abortError()); }
      pending.clear(); api.styles.removeStyle("st-achievement-translation-style");
    }
    host = api.surfaces.mainPopup.register({ id: ID, order: 20, onSurfaceChange, onDispose: detach });
    if (mounted) host.setTarget(mounted.panel);
    scope?.resource({ key: "achievement-translations", dispose: stop });
    const state = { started: true, stop }; api.state = api.state || {}; api.state[ID] = state;
    return state;
  }
  api.reg.addEntry(ID, "ui.js", start);
})();
