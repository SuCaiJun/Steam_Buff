/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 扩展隔离页的 AI 对话界面
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";
  const byId = id => document.getElementById(id);
  const text = (key, fallback, params) => STI18n.text(key, fallback, params);
  const service = byId("service"), input = byId("message"), composer = byId("composer");
  let history = byId("history"), historySlot;
  const transcript = byId("transcript"), status = byId("status"), stop = byId("stop");
  const checks = byId("tool-options"), toolsMenu = byId("tools");
  const toolsTrigger = toolsMenu.querySelector("summary"), toolNotice = byId("tool-save-status");
  const send = byId("send"), settings = byId("settings"), create = byId("new");
  const name = STConfig.aiChatName;
  const sendShortcutKey = STConfig.aiChatSendShortcutKey;
  const STREAM_PREVIEW_MS = 100;
  const markdown = window.markdownit({ html: false, linkify: false });
  const markdownTags = new Set([
    "p", "a", "strong", "em", "s", "hr", "h1", "h2", "h3", "h4", "h5", "h6",
    "blockquote", "ol", "ul", "li", "table", "thead", "tbody", "tr", "th", "td",
  ]);
  const log = STLoggerFactory.createLogger("settings", "ai-chat");
  const params = new URL(location.href).searchParams;
  const desktop = params.get("layout") === "desktop";
  const web = params.get("layout") === "web";
  const pane = desktop || web;
  const welcome = byId("welcome");
  const drafts = new Map();
  let userAvatar, avatarPort;
  document.documentElement.classList.toggle("desktop-chat", desktop);
  document.documentElement.classList.toggle("web-chat", web);
  const rawApp = Number(params.get("appId"));
  const appId = Number.isSafeInteger(rawApp) && rawApp > 0 && rawApp <= 0xffffffff ? rawApp : undefined;
  let port, pending, thread, sequence = 0;
  let toolSyncVersion = 0, savingTool = false;
  let toolOptions = [];
  let sendShortcutChanged = false, sendWithCtrl = true;
  let needsSettings = false;
  let records = [], services = [];
  let servicesChanged = false;
  let searchSettings = { provider: "", invalid: false }, searchSettingsChanged = false;
  let failedTurn;
  let composerView, composerBusy = true;
  const preferenceSaves = new Map();
  let liveUsage, compressing = false;

  function option(id, label) {
    return new Option(label, id);
  }

  function setUserAvatar(img) {
    img.hidden = !userAvatar;
    if (userAvatar) img.src = userAvatar;
    else img.removeAttribute("src");
  }

  function receiveAvatar(event) {
    const prefix = STConfig.origin(web ? STConfig.hosts.steamWebAvatarCdn : STConfig.hosts.steamAvatarCdn);
    const path = web ? /^\/[0-9a-f]{40}\.jpg$/i : /^\/[0-9a-f]{40}_medium\.jpg$/i;
    const value = event.data;
    const valid = typeof value === "string" && value.startsWith(prefix) &&
      path.test(value.slice(prefix.length));
    const avatar = valid ? value : undefined;
    if (avatar === userAvatar) return;
    userAvatar = avatar;
    transcript.querySelectorAll(".message-user .message-avatar img").forEach(setUserAvatar);
  }

  function connectAvatar() {
    if (window.parent === window) return;
    const hosts = STConfig.hosts;
    const origin = desktop ? STConfig.origin(hosts.steamLoopback) : params.get("parentOrigin");
    if (web && origin !== STConfig.origin(hosts.steamStore) && origin !== STConfig.origin(hosts.steamCommunity)) return;
    const channel = new MessageChannel();
    avatarPort = channel.port1;
    avatarPort.onmessage = receiveAvatar;
    window.parent.postMessage({ type: "st-ai-chat-avatar-request" }, origin, [channel.port2]);
  }

  function avatar(assistant) {
    const badge = document.createElement("span");
    badge.className = "message-avatar";
    badge.setAttribute("aria-hidden", "true");
    const img = document.createElement("img");
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    if (assistant) img.src = "../images/ai/avatar.png";
    else {
      badge.textContent = text("ai_chat_you", "你");
      img.addEventListener("error", () => { img.hidden = true; });
      setUserAvatar(img);
    }
    badge.append(img);
    return badge;
  }

  let toolApproval;
  const approvalLabels = {
    "steam-read": ["ai_chat_approval_steam_read", "读取 Steam 数据"],
    write: ["ai_chat_approval_steam_write", "Steam 修改"],
    network: ["workflow_ui_network", "网络"],
    script: ["workflow_ui_run_javascript", "运行 JavaScript"],
  };
  const atTranscriptEnd = () => transcript.scrollHeight - transcript.clientHeight - transcript.scrollTop < 40;

  function clearApproval() {
    if (!toolApproval) return;
    const follow = atTranscriptEnd();
    send.before(stop);
    toolApproval.card.remove();
    toolApproval = null;
    composer.hidden = false;
    composerView?.syncSize();
    if (follow) transcript.scrollTop = transcript.scrollHeight;
  }
  function approvalRows(message, category) {
    if (message.kind === "write") return message.items.map(item => {
      let detail = item.sortName ?? item.collections?.map(group => group.name).join("、");
      if (item.previousName !== undefined) {
        const values = { before: item.previousName || text("ai_chat_tool_approval_name_unset", "未设置"), after: item.customName ?? item.sortName };
        detail = item.customName !== undefined
          ? text("ai_chat_tool_approval_custom_change", "自定义名称  $before$ → $after$", values)
          : text("ai_chat_tool_approval_sort_change", "排序名称  $before$ → $after$", values);
      }
      if (item.added !== undefined)
        detail = text("ai_chat_tool_approval_translation_changes", "新增 $added$ 条，更新 $updated$ 条成就译文", item);
      return [`${item.name || "Steam"} · AppID ${item.appId}`, detail ??
        text("ai_chat_tool_approval_achievements", "保存 $count$ 条成就译文", { count: item.count })];
    });
    const rows = [], operations = new Map();
    const { appIds, term, searchProvider } = message.parameters;
    if (searchProvider) rows.push([text("settings.ai.provider", "供应商"), searchProviderName(searchProvider)]);
    if (appIds?.length) rows.push([text("ai_chat_approval_app_id", "当前查询 AppID"), appIds.join(", ")]);
    if (term) rows.push([text("ai_chat_approval_keyword", "搜索词"), term]);
    for (const operation of message.operations) {
      const title = operation.kind === category ? "" : text(...approvalLabels[operation.kind]);
      const detail = operation.kind === "network" ? operation.method + " " + operation.origin
        : operation.kind === "script" ? operation.owner
          : operation.account ? text("ai_chat_approval_account", "本次调用可读取当前 Steam 账号的数据")
            : text("ai_chat_approval_public", "本次调用可读取 Steam 相关公开数据");
      const key = JSON.stringify([title, detail, operation.code]);
      if (!operations.has(key)) operations.set(key, [title, detail, operation.code]);
    }
    rows.push(...operations.values());
    return rows;
  }
  function showApproval(notice, message, sendDecision) {
    clearApproval();
    const card = document.createElement("article"), title = document.createElement("h2");
    const name = message.toolName ?? toolName(message.toolId);
    const kinds = new Set(message.kind === "write" ? ["write"] : message.operations.map(operation => operation.kind));
    const kind = kinds.size === 1 ? kinds.values().next().value : "mixed";
    const header = document.createElement("header"), category = document.createElement("span");
    const list = document.createElement("ul"), actions = document.createElement("footer");
    card.className = "chat-tool-approval";
    card.dataset.kind = kind;
    card.tabIndex = -1;
    category.className = "chat-approval-category";
    category.textContent = kind === "mixed" ? text("ai_chat_approval_title", "工具授权") : text(...approvalLabels[kind]);
    title.id = "chat-tool-approval-title";
    title.textContent = text("ai_chat_approval_question", "允许「$tool$」执行以下操作？", { tool: name });
    card.setAttribute("aria-labelledby", title.id);
    list.tabIndex = 0;
    list.setAttribute("aria-labelledby", title.id);
    for (const [label, detail, code] of approvalRows(message, kind)) {
      const row = document.createElement("li");
      if (label) {
        const caption = document.createElement("strong");
        caption.textContent = label;
        row.append(caption);
      }
      if (detail) {
        const value = document.createElement("span");
        value.textContent = detail;
        row.append(value);
      }
      if (code) {
        const value = document.createElement("code");
        value.textContent = code;
        row.append(value);
      }
      list.append(row);
    }
    function decide(approved) {
      if (toolApproval?.card !== card) return;
      clearApproval();
      notice.dataset.phase = "active";
      notice.textContent = approved ? text("ai_chat_approval_executing", "正在执行…") : text("ai_chat_approval_declined", "已拒绝本次操作");
      stop.focus({ preventScroll: true });
      sendDecision(approved);
    }
    for (const [approved, label, shortcut] of [
      [false, text("ai_chat_approval_reject", "拒绝"), "Esc"],
      [true, text("ai_chat_approval_once", "允许一次"), "↵"],
    ]) {
      const button = document.createElement("button"), key = document.createElement("kbd");
      button.type = "button";
      button.className = approved ? "chat-approval-allow" : "";
      if (!approved) button.setAttribute("aria-keyshortcuts", "Escape");
      key.textContent = shortcut;
      key.setAttribute("aria-hidden", "true");
      button.append(label, key);
      button.addEventListener("click", () => decide(approved));
      actions.append(button);
    }
    const follow = atTranscriptEnd();
    header.append(category, stop);
    card.append(header, title, list, actions);
    toolApproval = { card, decide };
    notice.dataset.phase = "tool";
    notice.textContent = text("ai_chat_approval_waiting", "等待授权");
    composer.hidden = true;
    composer.after(card);
    if (list.scrollHeight <= list.clientHeight) list.removeAttribute("tabindex");
    card.focus({ preventScroll: true });
    if (follow) transcript.scrollTop = transcript.scrollHeight;
  }

  function connect() {
    if (port) return port;
    const opened = chrome.runtime.connect({ name: "st-ai-chat-v1" });
    port = opened;
    opened.onMessage.addListener(message => {
      if (message.type === "thread-title") { updateThreadTitle(message.id, message.title); return; }
      if (message.type === "composer-saved") {
        const saved = preferenceSaves.get(message.sequence);
        if (saved && !message.ok && thread?.id === saved.id) showComposerSaveFailure(saved.search);
        preferenceSaves.delete(message.sequence);
        return;
      }
      if (message.sequence !== pending?.sequence) return;
      const { progress, resolve, reject } = pending;
      if (message.type === "tool-approval") return progress?.(message, approved => {
        if (port === opened && pending?.sequence === message.sequence) opened.postMessage({
          action: "decide-tool", sequence: message.sequence, id: message.id, approved,
        });
      });
      if (["delta", "tools", "thinking", "reasoning", "usage", "compaction"].includes(message.type)) return progress?.(message);
      clearApproval();
      pending = null;
      if (message.type === "done") resolve(message.result);
      else reject(Object.assign(new Error("AI chat operation failed"), { code: message.code, parameter: message.parameter }));
    });
    opened.onDisconnect.addListener(() => {
      const reason = chrome.runtime.lastError;
      if (port !== opened) return;
      clearApproval();
      port = null;
      for (const saved of preferenceSaves.values())
        if (saved.id === thread?.id) showComposerSaveFailure(saved.search);
      preferenceSaves.clear();
      pending?.reject(Object.assign(new Error("AI chat connection ended", { cause: reason }), { code: "CHAT_CONNECTION_LOST" }));
      pending = null;
    });
    return opened;
  }

  function call(action, payload = {}, progress) {
    if (pending) return Promise.reject(new Error("AI chat operation already in progress"));
    const channel = connect();
    return new Promise((resolve, reject) => {
      pending = { sequence: ++sequence, resolve, reject, progress };
      try { channel.postMessage({ action, sequence, ...payload }); }
      catch (error) { pending = null; reject(error); }
    });
  }

  function showComposerSaveFailure(search) {
    status.textContent = search ? text("ai_chat_search_preference_failed", "未能保存本会话的联网搜索设置")
      : text("ai_chat_model_preference_failed", "未能保存本会话的模型和思考档位");
  }

  function saveConversationPreference(patch) {
    if (!thread.revision) return;
    const channel = connect();
    const data = { id: thread.id, sequence: ++sequence };
    const search = Object.hasOwn(patch, "searchEnabled");
    preferenceSaves.set(data.sequence, { id: data.id, search });
    try {
      channel.postMessage({ action: "set-composer", ...data, ...patch });
    } catch (error) {
      preferenceSaves.delete(data.sequence);
      log.error("chat-composer-save-request-failed", "提交会话偏好失败", { error });
      showComposerSaveFailure(search);
    }
  }

  function saveModelPreference(composer, changedLevels = {}) {
    thread.composer = composer;
    saveConversationPreference({ composer: { ...composer, lastEnabled: changedLevels } });
  }

  function saveSearchPreference(enabled) {
    thread.searchEnabled = enabled;
    saveConversationPreference({ searchEnabled: enabled });
    syncSearch();
  }

  function markdownLink(value) {
    let url;
    try { url = new URL(value); }
    catch (error) {
      if (!(error instanceof TypeError)) throw error;
      return null;
    }
    return (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username && !url.password ? url.href : null;
  }

  /** 根据解析 token 更新允许的节点，保留仍匹配的文本、链接和滚动容器。 */
  function renderMarkdown(root, tokens) {
    let parent = root;
    let next = parent.firstChild;

    function place(tag) {
      const current = next;
      next = current?.nextSibling ?? null;
      if (current && (tag ? current.localName === tag : current.nodeType === Node.TEXT_NODE)) return current;
      const node = tag ? document.createElement(tag) : document.createTextNode("");
      if (current) current.replaceWith(node);
      else parent.append(node);
      return node;
    }

    function trimChildren() {
      while (next) {
        const child = next;
        next = child.nextSibling;
        child.remove();
      }
    }

    function render(list) {
      for (const token of list) {
        if (token.hidden) continue;
        if (token.type === "inline") {
          render(token.children);
        } else if (["text", "text_special", "image"].includes(token.type)) {
          const node = place();
          if (node.data !== token.content) node.data = token.content;
        } else if (token.type === "softbreak" || token.type === "hardbreak") {
          place("br");
        } else if (token.type === "code_inline") {
          const code = place("code");
          if (code.textContent !== token.content) code.textContent = token.content;
        } else if (token.type === "fence" || token.type === "code_block") {
          const pre = place("pre");
          const code = pre.firstElementChild ?? pre.appendChild(document.createElement("code"));
          if (code.textContent !== token.content) code.textContent = token.content;
        } else if (markdownTags.has(token.tag)) {
          if (token.nesting === -1) {
            trimChildren();
            next = parent.nextSibling;
            parent = parent.parentNode;
            continue;
          }
          const href = token.tag === "a" ? markdownLink(token.attrGet("href")) : null;
          const node = place(token.tag === "a" && !href ? "span" : token.tag);
          if (href && node.getAttribute("href") !== STConfig.externalNavigation.resolve(href).href)
            STConfig.externalNavigation.applyToLink(node, href);
          if (token.tag === "ol") {
            const start = token.attrGet("start");
            if (start === null) node.removeAttribute("start");
            else if (node.start !== Number(start)) node.start = Number(start);
          }
          if (token.nesting === 1) {
            parent = node;
            next = node.firstChild;
          }
        }
      }
    }
    render(tokens);
    trimChildren();
  }

  function messageFrame(role) {
    const row = document.createElement("article");
    row.className = "message message-" + role;
    const assistant = role === "assistant";
    const body = pane ? document.createElement("div") : row;
    if (pane) {
      body.className = "message-body";
      row.append(avatar(assistant), body);
    }
    const who = document.createElement("strong");
    who.className = "message-author";
    who.textContent = assistant ? name : text("ai_chat_you", "你");
    const content = document.createElement(assistant ? "div" : "p");
    content.className = assistant ? "message-text reply-card" : "message-text";
    body.append(who, content);
    transcript.append(row);
    return { row, content };
  }

  const localeTime = value => {
    const date = new Date(value);
    return value != null && Number.isFinite(date.getTime()) ? date.toLocaleString(STI18n.intlLocale()) : "";
  };

  function replyText(parent, value, before = null) {
    const prose = document.createElement("div");
    prose.className = "message-markdown";
    renderMarkdown(prose, markdown.parse(value, {}));
    parent.insertBefore(prose, before);
  }

  function previewTokens(source) {
    const env = {};
    const tokens = markdown.parse(source, env);
    const index = tokens.findLastIndex(token => token.type === "inline");
    if (index < 0 || tokens.slice(index + 1).some(token => token.nesting >= 0) || /\n[ \t]*\n[ \t]*$/.test(source))
      return tokens;

    const tail = tokens[index];
    if (tokens[index - 1]?.type === "paragraph_open") {
      const lines = tail.content.split("\n");
      const last = lines.at(-1).trim();
      const hasPendingDivider = lines.at(-2)?.includes("|") && /^[|:\s-]+$/.test(last);
      // 表头在分隔线到达前会被解析为普通段落。只暂缓还可能属于表格的末尾行。
      if (hasPendingDivider || last.startsWith("|") || (last.indexOf("|") > 0 && last.endsWith("|"))) {
        const ready = lines.slice(0, hasPendingDivider ? -2 : -1).join("\n");
        if (!ready) {
          tokens.splice(index - 1, 3);
          return tokens;
        }
        tail.content = ready;
        tail.children = markdown.parseInline(ready, env)[0].children;
        return tokens;
      }
    }

    const last = tail.children.at(-1);
    if (last?.type === "text" || last?.type === "em_close") {
      const emphasis = /(?<![\\`*])(\*{1,3})(?=\S|$)([^*\n]*?)(\*{0,2})$/.exec(tail.content);
      if (emphasis && emphasis[3].length < emphasis[1].length && (last.type === "text" || emphasis[3])) {
        const prefix = tail.content.slice(0, emphasis.index);
        const atBoundary = !/[\p{L}\p{N}\p{M}]$/u.test(prefix);
        const boldAfterHan = emphasis[1].length > 1 && /\p{Script=Han}$/u.test(prefix);
        if (atBoundary || boldAfterHan) {
          tail.children = markdown.parseInline(prefix + emphasis[2], env)[0].children;
          return tokens;
        }
      }
    }
    const link = last?.type === "text" && /(?<!\\)\[([^\[\]\n]*)\]\([^\n)]*$/.exec(tail.content);
    if (link) {
      const ready = tail.content.slice(0, link.index) + link[1];
      tail.children = markdown.parseInline(ready, env)[0].children;
    }
    return tokens;
  }

  function sourceLink(source, label) {
    const href = markdownLink(source.url);
    if (!href) return null;
    const url = new URL(href);
    if (source.kind !== "web-search" && (url.protocol !== "https:" || !["store.steampowered.com", "isthereanydeal.com"].includes(url.hostname)))
      return null;
    const link = document.createElement("a");
    STConfig.externalNavigation.applyToLink(link, href);
    link.textContent = label;
    return link;
  }

  function referenceLink(source, index) {
    return sourceLink(source, "[" + (source.reference ?? index + 1) + "] " + source.name + " ↗");
  }

  function appendSources(reply, sources = [], legacy = false) {
    const footer = document.createElement("div");
    footer.className = "sources";
    const label = document.createElement("span");
    label.textContent = text("ai_chat_references", "参考资料");
    footer.append(label);
    for (const [index, source] of sources.entries()) {
      const link = referenceLink(source, index);
      if (link) {
        if (legacy) {
          const timestamp = localeTime(source.checkedAt);
          if (timestamp) link.append(" · ", timestamp);
        }
        footer.append(link);
      }
    }
    if (footer.childElementCount > 1) reply.append(footer);
  }

  function formatPrice(price) {
    return price ? new Intl.NumberFormat(STI18n.intlLocale(), { style: "currency", currency: price.currency }).format(price.amount) :
      text("common_none", "暂无");
  }

  function searchProviderName(id) {
    return id === "bocha" ? text("settings_ai_search_bocha", "博查 Web Search") : STAI.searchProvider(id)?.name;
  }

  function toolFacts(step, sources) {
    const facts = document.createElement("dl");
    const field = (label, value) => {
      if (value == null || value === "") return;
      const name = document.createElement("dt");
      const detail = document.createElement("dd");
      name.textContent = label;
      detail.append(value instanceof Node ? value : String(value));
      facts.append(name, detail);
    };
    field("AppID", step.appId);
    field(text("ai_chat_tool_started", "开始时间"), localeTime(step.startedAt));
    if (step.search) {
      field(text("settings.ai.provider", "供应商"), searchProviderName(step.search.provider));
      field(text("ai_chat_approval_keyword", "搜索词"), step.search.query);
    }
    if (step.state !== "done") {
      if (step.errorCode) field(text("ai_chat_tool_result", "结果"), failureText(step.errorCode));
      return facts;
    }
    const { source, facts: data } = step;
    if (step.search) {
      const { count, references } = step.search;
      if (count === 0) field(text("ai_chat_tool_result", "结果"), text("ai_chat_search_no_results", "没有找到相关网页"));
      else if (Number.isInteger(count)) field(text("ai_chat_search_result_count", "结果数"), count.toLocaleString(STI18n.intlLocale()));
      const links = document.createDocumentFragment();
      for (const item of sources) {
        if (item.kind !== "web-search" || !references?.includes(item.reference)) continue;
        const link = referenceLink(item);
        if (link) links.append(link, document.createElement("br"));
      }
      if (links.childNodes.length) field(text("ai_chat_references", "参考资料"), links);
      else if (count > 0 && STAI.searchProvider(step.search.provider)?.transientSources)
        field(text("ai_chat_references", "参考资料"), text("ai_chat_search_transient_sources", "Brave 来源仅在本次回复中展示。"));
    }
    if (step.id === STAI.PROVIDER_TOOL_IDS.game) field(text("ai_chat_tool_result", "结果"), data.found ? data.name : text("common_none", "暂无"));
    if (step.id === STAI.PROVIDER_TOOL_IDS.players)
      field(text("ai_chat_tool_players", "Steam 在线人数"), data.players.toLocaleString(STI18n.intlLocale()));
    if (step.id === STAI.STORE_SEARCH_TOOL_ID) {
      field(text("ai_chat_tool_result", "结果"),
        text("ai_chat_tool_search_result", "本页 $matched$ 项，Steam 候选共 $total$ 项", {
          matched: data.matched.toLocaleString(STI18n.intlLocale()),
          total: data.candidateTotal.toLocaleString(STI18n.intlLocale()),
        }));
    }
    if (step.id === STAI.PROVIDER_TOOL_IDS.prices) {
      field(text("ai_chat_tool_region", "地区"), data.country);
      field(text("ai_chat_tool_current_price", "当前价格"), formatPrice(data.current));
      field(text("ai_chat_tool_low", "历史最低价"), formatPrice(data.low));
      if (data.low) field(text("ai_chat_tool_low_at", "史低记录时间"), localeTime(data.lowAt));
    }
    if (Object.values(STAI.ACCOUNT_TOOLS).some(tool => tool.id === step.id)) {
      field(text("ai_chat_tool_result", "结果"), data.count);
      field(text("ai_chat_tool_changed", "已修改"), data.changed);
      field(text("common_failed", "失败"), data.failed);
    }
    if (source) {
      field(text("ai_chat_tool_data_at", "数据时间"), localeTime(source.checkedAt));
      const index = sources.findIndex(item => !item.kind && item.url === source.url);
      if (index >= 0) field(text("ai_chat_references", "参考资料"), referenceLink(sources[index], index));
    }
    return facts;
  }

  const toolStates = {
    running: ["ai_chat_tool_running", "查询中"],
    waiting: ["ai_chat_approval_waiting", "等待授权"],
    done: ["ai_chat_tool_done", "已完成"],
    blocked: ["ai_chat_tool_blocked", "未执行"],
    failed: ["common_failed", "失败"],
    stopped: ["ai_chat_tool_stopped", "已停止"],
  };

  function toolName(id) {
    if (id === STAI.WEB_SEARCH_TOOL_ID) return text("ai_chat_web_search", "联网搜索");
    const definition = STAI.CHAT_TOOLS.find(item => item.id === id);
    return definition ? text(definition.label, definition.name) : text("ai_chat_tool_call", "工具调用");
  }

  function replyTool(step, sources, tool = document.createElement("details")) {
    if (!tool.firstChild) {
      tool.className = "reply-tool";
      const summary = document.createElement("summary");
      const name = document.createElement("span");
      const state = document.createElement("span");
      name.textContent = toolName(step.id);
      state.className = "reply-tool-state";
      summary.append(name, state);
      tool.append(summary);
    }
    tool.dataset.state = step.state;
    tool.firstChild.lastChild.textContent = text(...toolStates[step.state]);
    if (tool.childElementCount > 1) tool.lastElementChild.remove();
    tool.append(toolFacts(step, sources));
    return tool;
  }

  function replyProcess(content, before = null, open = false) {
    const details = document.createElement("details");
    details.className = "reply-process";
    details.open = open;
    const summary = document.createElement("summary");
    const body = document.createElement("div");
    body.className = "reply-process-body";
    let animation;
    let closing = false;

    function settle(nextOpen) {
      details.open = nextOpen;
      animation?.cancel();
      animation = null;
      closing = false;
      body.inert = false;
    }

    function setOpen(nextOpen) {
      if (!animation && nextOpen === details.open) return;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        settle(nextOpen);
        return;
      }
      const start = details.getBoundingClientRect();
      settle(nextOpen);
      const end = details.getBoundingClientRect();
      // 保留详情到收起结束，让内容随边框逐步裁切。
      details.open = true;
      closing = !nextOpen;
      body.inert = closing;
      const box = ({ width, height }) => ({ width: `${width}px`, height: `${height}px`, overflow: "clip" });
      const transition = details.animate([box(start), box(end)], {
        id: "reply-process-resize", duration: 200, easing: "ease-out", fill: "both",
      });
      animation = transition;
      transition.onfinish = () => {
        if (animation === transition) settle(nextOpen);
      };
    }
    summary.addEventListener("click", event => {
      event.preventDefault();
      setOpen(closing || !details.open);
    });
    details.append(summary, body);
    content.insertBefore(details, before);
    return { details, summary, body, close: () => settle(false) };
  }

  function replyReasoning(parent, content = "") {
    const section = document.createElement("div");
    section.className = "reply-reasoning";
    const title = document.createElement("div");
    title.className = "reply-reasoning-title";
    title.textContent = text("ai_chat_thinking_label", "深度思考");
    const copy = document.createElement("div");
    copy.className = "reply-reasoning-text";
    const value = copy.appendChild(document.createTextNode(content));
    section.append(title, copy);
    parent.append(section);
    return value;
  }

  function labelProcess(process, calls, onlyReasoning = false) {
    process.details.toggleAttribute("data-reasoning-only", onlyReasoning);
    const title = onlyReasoning ? text("ai_chat_thinking_label", "深度思考") : text("ai_chat_view_process", "查看过程");
    process.summary.textContent = calls
      ? title + " · " + text("ai_chat_tool_call_count", "$count$ 次工具调用", { count: calls })
      : title;
  }

  function addMessage(message) {
    const { row, content } = messageFrame(message.role);
    if (message.role === "user") {
      const attachments = message.imageCount && text("ai_chat_sent_images", "$count$ 张图片", { count: message.imageCount });
      content.textContent = [message.content, attachments].filter(Boolean).join("\n");
    }
    else {
      const steps = message.steps ?? [];
      const reasoningSteps = message.reasoningSteps ?? [];
      const hasProcess = steps.length || reasoningSteps.length;
      if (hasProcess) {
        const process = replyProcess(content);
        let calls = 0, reasoningIndex = 0;
        for (const [index, step] of steps.entries()) {
          while (reasoningSteps[reasoningIndex]?.beforeStep === index)
            replyReasoning(process.body, reasoningSteps[reasoningIndex++].content);
          if (step.type === "text") replyText(process.body, step.content);
          else {
            process.body.append(replyTool(step, message.sources ?? []));
            if (step.state !== "blocked") calls += 1;
          }
        }
        for (; reasoningIndex < reasoningSteps.length; reasoningIndex++)
          replyReasoning(process.body, reasoningSteps[reasoningIndex].content);
        labelProcess(process, calls, !steps.length);
      }
      replyText(content, message.content);
      appendSources(content, message.sources, !hasProcess);
    }
    return row;
  }

  function renderHistory() {
    const titles = new Map(records.map(record => [record.id, record.title]));
    if (desktop) {
      const untitled = text("ai_chat_untitled", "新会话");
      for (const [id, draft] of drafts) {
        if (!titles.has(id) && draft.unsaved)
          titles.set(id, draft.text.trim().split("\n", 1)[0].slice(0, 80) || untitled);
      }
      if (!titles.has(thread.id)) titles.set(thread.id, thread.title || untitled);
    }
    const current = text("ai_chat_current", "当前会话");
    const id = titles.has(thread.id) ? thread.id : "";
    if (!historySlot) {
      history.replaceChildren(option("", current), ...Array.from(titles, ([id, title]) => option(id, title)));
      history.value = id;
      return;
    }
    const focused = document.activeElement === history;
    const label = text("ai_chat_switch_session", "切换会话");
    const html = STSearchCombo.searchComboHtml(Array.from(titles, ([value, label]) => ({ value, label, search: label })), {
      id: "history", label, value: id, text: titles.get(id) ?? current, expandLabel: label,
      placeholder: text("ai_chat_search_history", "搜索会话标题"),
      emptyLabel: text("ai_chat_history_no_matches", "没有匹配的会话"), modal: true, restoreOnClose: true,
    });
    STSearchCombo.closeSearchCombo(historySlot);
    STDomUtils.setTrustedHTML(historySlot, STDomUtils.trustedHTML(html, "ai-chat-search-combo"));
    history = historySlot.querySelector("#history");
    if (focused) history.focus({ preventScroll: true });
  }

  function updateThreadTitle(id, title) {
    const record = records.find(item => item.id === id);
    if (!record) return;
    record.title = title;
    if (thread?.id === id) thread.title = title;
    if (historySlot) STSearchCombo.updateSearchComboLabel(history, id, title);
    else renderHistory();
  }

  function renderServices(selectedService) {
    service.replaceChildren(...services.map(item => option(item.id, item.name + " · " + (item.modelName || item.model))));
    if (selectedService === STAI.DEFAULT_SERVICE_ID && !services.some(item => item.id === selectedService))
      selectedService = services.find(item => item.isDefault)?.id ?? selectedService;
    if (services.some(item => item.id === selectedService)) service.value = selectedService;
    else if (!selectedService && services.length) service.value = services.find(item => item.isDefault)?.id ?? services[0].id;
    else if (selectedService) {
      service.prepend(option("", text("ai_chat_select_service", "选择 AI 服务")));
      service.value = "";
    }
    composerView?.setServices(services, thread.composer);
    syncSearch();
    syncUsage();
    updateSettingsLink();
    if (desktop) {
      const setup = text("ai_chat_setup_service", "请前往「扩展设置 → AI 服务」配置可用的服务。");
      if (!services.length && !status.textContent) status.textContent = setup;
      else if (services.length && status.textContent === setup) status.textContent = "";
    }
  }

  function renderControls() {
    const draft = desktop ? drafts.get(thread.id) : undefined;
    renderHistory();
    renderServices(thread.composer?.serviceId ?? thread.serviceId);
    composerView?.setDraft(thread.id, draft?.files);
    busy(false);
    syncUsage();
  }

  function render() {
    failedTurn = null;
    liveUsage = undefined;
    if (web) {
      welcome.hidden = thread.messages.length > 0;
      transcript.replaceChildren(welcome);
    } else transcript.replaceChildren();
    for (const message of thread.messages) addMessage(message);
    transcript.scrollTop = transcript.scrollHeight;
    renderControls();
  }

  function updateSettingsLink() {
    settings.hidden = desktop || (!web && services.length > 0 && !needsSettings);
  }

  function busy(value, generating = false) {
    composerBusy = value;
    create.disabled = history.disabled = service.disabled = value;
    if (historySlot) {
      const toggle = historySlot.querySelector("[data-st-combo-toggle]");
      if (toggle) toggle.disabled = value;
      if (value) STSearchCombo.closeSearchCombo(historySlot);
    }
    input.disabled = value;
    syncToolControls();
    composerView?.setBusy(value);
    syncComposer();
    if (pane) send.hidden = generating;
    stop.hidden = !generating;
    stop.disabled = !generating;
    stop.removeAttribute("aria-busy");
    if (web) for (const button of byId("suggestions").children) button.disabled = value;
    if (!value) void refreshServices();
  }

  function syncComposer() {
    send.disabled = !canSend();
    composerView?.syncSize();
  }

  const selectedService = () => services.find(item => item.id === service.value);

  function enabledSearchProvider() {
    const selected = selectedService();
    return pane && thread?.searchEnabled === true && selected && selected.supportsTools !== false ? searchSettings.provider : "";
  }

  function syncSearch() {
    composerView?.setSearchPreference(searchSettings, thread?.searchEnabled === true);
    composerView?.setToolsEnabled(Boolean(enabledSearchProvider()) || toolOptions.some(tool => tool.enabled));
  }

  function canSend() {
    const selected = selectedService(), typed = Boolean(input.value.trim()), images = composerView?.imageCount() ?? 0;
    return !composerBusy && !pending && !savingTool && Boolean(selected) && Boolean(typed || images) &&
      (!typed || selected.inputs?.text !== false) && (composerView?.imagesSendable() ?? true);
  }

  function syncUsage() {
    if (!thread || !composerView) return;
    const selected = selectedService();
    const matches = record => selected && record?.serviceId === selected.id && record.serviceRevision === selected.revision;
    const actual = liveUsage ?? thread.usage;
    const report = matches(actual) ? actual : undefined;
    const compression = matches(thread.compaction) ? thread.compaction : undefined;
    const awaiting = !liveUsage?.completed && thread.awaitingUsage;
    const last = liveUsage && !liveUsage.completed && matches(thread.usage) ? thread.usage.last : report?.last;
    const waitingForSelected = matches(awaiting);
    const phase = compressing ? "running" : !liveUsage && compression?.atRevision === thread.revision ? compression.status
      : waitingForSelected ? "done" : undefined;
    composerView.setUsage({
      used: awaiting ? undefined : last?.total,
      total: selected?.contextWindow,
      awaiting: Boolean(awaiting && (waitingForSelected || report)),
      usage: report,
      status: phase,
      compression: compression?.usage,
      available: Boolean(selected?.inputs?.text !== false && selected && thread.canCompact),
    });
  }

  function compactionText(phase) {
    const message = {
      running: ["ai_chat_compaction_running", "正在压缩上下文…"],
      done: ["ai_chat_compaction_done", "已压缩，等待新用量"],
      failed: ["ai_chat_compaction_failed", "压缩未完成，已保留原上下文。"],
      incomplete: ["ai_chat_compaction_failed", "压缩未完成，已保留原上下文。"],
      stopped: ["ai_chat_compaction_stopped", "已停止压缩，已保留原上下文。"],
    }[phase];
    return message ? text(...message) : "";
  }

  function beginCompaction() {
    compressing = true;
    status.textContent = compactionText("running");
    syncUsage();
  }

  function finishCompaction() {
    if (!compressing) return;
    compressing = false;
    const record = thread.compaction;
    status.textContent = compactionText(record?.atRevision === thread.revision ? record.status : "failed");
    syncUsage();
  }

  async function compactContext() {
    const selected = selectedService();
    if (composerBusy || pending || !thread?.canCompact || !selected || selected.inputs?.text === false) return;
    busy(true, true);
    beginCompaction();
    const { composer, searchEnabled } = thread;
    try {
      thread = await call("compact", { id: thread.id, revision: thread.revision, serviceId: selected.id, serviceRevision: selected.revision });
      thread.composer = composer;
      thread.searchEnabled = searchEnabled;
      finishCompaction();
    } catch (error) {
      compressing = false;
      if (error.code !== "CHAT_STOPPED") log.error("chat-compaction-request-failed", "压缩操作未完成", { error });
      failed(error);
    } finally {
      busy(false);
      syncUsage();
      input.focus();
    }
  }

  function newThread() {
    return { id: crypto.randomUUID(), revision: 0, serviceId: services.find(item => item.isDefault)?.id ?? services[0]?.id, messages: [] };
  }

  function stashDraft() {
    if (!desktop) return;
    const files = composerView?.draftFiles() ?? [];
    if (!input.value && !files.length && thread.revision !== 0) {
      drafts.delete(thread.id);
      return;
    }
    drafts.set(thread.id, {
      text: input.value,
      files,
      unsaved: thread.revision === 0 ? thread : null,
    });
  }

  function syncToolControls() {
    for (const box of checks.querySelectorAll("input")) box.disabled = composerBusy || savingTool;
  }

  function renderTools(items) {
    const sameRows = items.length === toolOptions.length && items.every((tool, index) =>
      tool.id === toolOptions[index].id && tool.name === toolOptions[index].name);
    toolOptions = items;
    syncSearch();
    if (!sameRows) {
      const focused = checks.contains(document.activeElement) ? document.activeElement.value : null;
      checks.replaceChildren(...items.map(tool => {
        const label = document.createElement("label");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.value = tool.id;
        label.append(box, document.createTextNode(tool.name));
        return label;
      }));
      if (focused) ([...checks.querySelectorAll("input")].find(box => box.value === focused) || toolsTrigger).focus();
    }
    for (const [index, box] of [...checks.querySelectorAll("input")].entries()) box.checked = items[index].enabled;
    byId("tool-empty").hidden = items.length > 0;
    syncToolControls();
  }

  function applySendShortcut(value) {
    sendWithCtrl = value !== "enter";
    send.setAttribute("aria-keyshortcuts", sendWithCtrl ? "Control+Enter" : "Enter");
  }

  async function refreshServices() {
    if (!servicesChanged || !thread || composerBusy || pending || savingTool) return;
    servicesChanged = false;
    try {
      const results = call("services");
      syncComposer();
      const updated = await results;
      if (servicesChanged) return;
      services = updated;
      renderServices(thread.composer?.serviceId ?? (service.value || thread.serviceId));
    } catch (error) {
      log.error("chat-services-refresh-failed", "刷新聊天服务信息失败", { error });
      failed(error);
    } finally {
      syncComposer();
      if (servicesChanged) void refreshServices();
    }
  }

  function onPreferenceChanged(changes, area) {
    if (area !== "local") return;
    if (Object.hasOwn(changes, sendShortcutKey)) {
      sendShortcutChanged = true;
      applySendShortcut(changes[sendShortcutKey].newValue);
    }
    if (Object.hasOwn(changes, STConfig.aiSearchKey)) {
      searchSettingsChanged = true;
      searchSettings = STAI.searchSettingsState(changes[STConfig.aiSearchKey].newValue);
      syncSearch();
    }
    const change = changes[STConfig.automationConfigKey];
    if (change) {
      toolSyncVersion += 1;
      renderTools(STAI.chatToolsFromWorkflow(change.newValue));
    }
    if (Object.hasOwn(changes, STAI.SERVICES_KEY) || Object.hasOwn(changes, STAI.storageKey("enabled"))) {
      servicesChanged = true;
      void refreshServices();
    }
  }

  async function setToolEnabled(event) {
    const box = event.target;
    const current = toolOptions.find(tool => tool.id === box.value);
    if (!current) return;
    const enabled = box.checked;
    if (pending || savingTool || enabled === current.enabled) {
      box.checked = current.enabled;
      return;
    }
    const version = toolSyncVersion;
    savingTool = true;
    toolNotice.hidden = true;
    checks.setAttribute("aria-busy", "true");
    syncToolControls();
    syncComposer();
    try {
      const items = await call("set-tool-enabled", { id: current.id, enabled });
      if (version === toolSyncVersion) renderTools(items);
    } catch (error) {
      log.error("chat-tool-toggle-failed", "保存 AI 工具启用状态失败", { error });
      renderTools(toolOptions);
      toolNotice.textContent = text("common_saveFailed", "保存失败");
      toolNotice.hidden = false;
    } finally {
      savingTool = false;
      checks.removeAttribute("aria-busy");
      syncToolControls();
      syncComposer();
      if (toolsMenu.open && document.activeElement === document.body)
        (box.isConnected && !box.disabled ? box : toolsTrigger).focus({ preventScroll: true });
      void refreshServices();
    }
  }

  async function switchSession(id) {
    if (pending || !thread || id === thread.id || (desktop && !id)) {
      return;
    }
    const focused = document.activeElement === history;
    stashDraft();
    busy(true);
    try {
      const draft = drafts.get(id);
      const next = draft?.unsaved || (id ? await call("read", { id }) : newThread());
      if (!next) throw new Error("AI chat history record unavailable");
      thread = next;
      const record = records.find(item => item.id === id);
      if (record && next.title) record.title = next.title;
      input.value = draft?.text || "";
      status.textContent = "";
    } catch (error) {
      renderHistory();
      busy(false);
      failed(error);
      return;
    }
    render();
    if (focused) history.focus({ preventScroll: true });
  }

  function iconControl(control, label) {
    control.setAttribute("aria-label", label);
    control.title = label;
    control.textContent = "";
  }

  function mountPane() {
    const header = document.querySelector("main > header");
    const historyLabel = history.closest("label");
    header.querySelector("h1").hidden = true;
    historyLabel.classList.add("chat-history");
    historyLabel.querySelector("span").textContent = text("ai_chat_switch_session", "切换会话");
    historySlot = document.createElement("div");
    history.replaceWith(historySlot);
    STComponents.ensureStyle("st-ai-chat-search-combo", STComponents.searchComboCss);
    const scope = header.closest("main");
    STSearchCombo.bindSearchCombos(scope, undefined, (control, id) => {
      if (control === history) void switchSession(id);
      else if (control.id === "composer-model-search") composerView.selectModel(id);
    }, scope, {
      onDismiss: control => { if (control.id === "composer-model-search") composerView.closeModelPicker(); },
    });
    const session = document.createElement("div");
    session.className = "chat-session";
    session.append(historyLabel, create);
    header.prepend(session);
    iconControl(create, text("ai_chat_new_session", "新建会话"));
    document.querySelector(".selectors").hidden = true;
    input.placeholder = text("ai_chat_composer_placeholder", "尽管问…");
    composerView = STChatComposer.mount(composer, {
      service, text, locale: STI18n.intlLocale(), appId, onDraftChange: syncComposer, onModelPreference: saveModelPreference,
      onSearchPreference: saveSearchPreference,
    });
    composerView.setBusy(composerBusy);
    syncComposer();
    if (desktop) {
      transcript.tabIndex = 0;
      const { titleHeight, brandWidth, controlsWidth, toolSlotWidth, minDragWidth, sessionWidth } = STConfig.aiChatWindowLayout;
      header.style.setProperty("--chat-title-height", titleHeight + "px");
      session.style.setProperty("--chat-session-width", sessionWidth + "px");
      if (params.get("titlebar") === "hosted" && window.parent !== window) {
        header.style.setProperty("--chat-title-start", brandWidth + "px");
        header.style.setProperty("--chat-title-end", `calc(${controlsWidth + toolSlotWidth / 2}px - var(--chat-control-size) / 2)`);
        session.style.setProperty("--chat-session-width", `min(${sessionWidth}px, calc(100dvw - ${brandWidth + minDragWidth + toolSlotWidth + controlsWidth}px))`);
      }
    }
  }

  function mountWeb() {
    const actions = byId("web-actions");
    const close = byId("web-close");
    actions.prepend(toolsMenu, settings);
    actions.hidden = settings.hidden = false;
    welcome.querySelector("h2").textContent = name;
    for (const control of [settings, close]) iconControl(control, control.textContent);
    close.addEventListener("click", requestClose);
    byId("suggestions").addEventListener("click", event => {
      if (event.target.tagName !== "BUTTON") return;
      input.value = event.target.textContent;
      syncComposer();
      input.focus();
    });
    if (window.parent !== window) window.parent.postMessage({ type: "st-ai-chat-ready" }, "*");
  }

  function failureText(code, parameter) {
    const caption = {
      CHAT_STOPPED: ["ai_chat_stopped", "已停止生成"],
      CHAT_TIMEOUT: ["ai_chat_timeout", "请求超时。可以重新发送。"],
      CHAT_CONNECTION_LOST: ["ai_chat_disconnected", "对话连接已断开。可以重新发送。"],
      CHAT_CONTEXT_LIMIT: ["ai_chat_context_too_large", "对话请求过长。可压缩上下文或新建对话。"],
      CHAT_PROMPT_UNAVAILABLE: ["ai_chat_prompt_unavailable", "关联提示词不可用，请在「AI 服务 → 对话入口」重新选择。"],
      CHAT_PROMPT_DISABLED: ["ai_chat_prompt_disabled", "关联提示词已停用，请启用或重新选择。"],
      CHAT_PROMPT_MESSAGE_MISSING: ["ai_chat_prompt_message_missing", "所选提示词的用户消息缺少「聊天消息」占位符。请在「自动化 → 提示词」中修改。"],
      PROMPT_HISTORY_INVALID: ["ai_chat_prompt_history_invalid", "请在高级提示词的最后一条用户消息前放置一次「对话历史」占位符。"],
      CHAT_PROMPT_USER_INVALID: ["ai_chat_prompt_user_invalid", "高级提示词的最后一条消息必须是用户消息。请在「自动化 → 提示词」中修改。"],
      PROMPT_VALUE_UNAVAILABLE: ["ai_chat_prompt_value_unavailable", "所选提示词缺少「$parameter$」的数据。请修改提示词或重新选择。"],
      PROMPT_JSON_INVALID: ["ai_chat_prompt_json_invalid", "高级提示词的 JSON 格式无效，请在「自动化 → 提示词」中修改。"],
      PROMPT_INVALID: ["ai_chat_prompt_invalid", "所选提示词的请求格式无效，请在「自动化 → 提示词」中修改。"],
      CHAT_BUSY: ["ai_chat_busy", "此对话正在另一个窗口生成。"],
      CHAT_CHANGED: ["ai_chat_changed", "此对话已更新，请查看最新记录后重新发送。"],
      CHAT_SERVICE_CHANGED: ["ai_chat_service_changed", "AI 模型设置已更新，请重新选择后再试。"],
      CHAT_COMPACTION_UNAVAILABLE: ["ai_chat_compaction_unavailable", "当前没有可压缩的完整旧对话。"],
      CHAT_COMPACTION_TOO_LARGE: ["ai_chat_compaction_too_large", "旧对话超出单次摘要请求的长度限制。原记录已保留。"],
      CHAT_IMAGE_INVALID: ["ai_chat_image_invalid", "无法发送图片，请检查文件类型和大小。"],
      CHAT_INPUT_TYPE_UNAVAILABLE: ["ai_chat_inputs_unavailable", "当前模型不支持此输入类型。"],
      CHAT_REASONING_INVALID: ["ai_chat_effort_invalid", "推理设置已失效，请检查 AI 服务和当前模型的推理档位。"],
      CHAT_REASONING_RESPONSE_INVALID: ["ai_chat_effort_response_invalid", "模型返回的推理续答数据无效。"],
      CHAT_SEARCH_CONFIG: ["ai_chat_search_config", "请在「AI 服务 → 搜索服务」设置提供商和 API 密钥。"],
      CHAT_SEARCH_MODEL: ["ai_chat_search_model", "当前模型不支持工具调用"],
      CHAT_SEARCH_CHANGED: ["ai_chat_search_changed", "搜索服务配置已更改，请重新发送。"],
      CHAT_SEARCH_PREFERENCE_CHANGED: ["ai_chat_search_preference_changed", "此会话的联网搜索已关闭，请确认开关后重新发送。"],
      CHAT_SEARCH_PERMISSION: ["ai_chat_search_permission", "请在「AI 服务 → 搜索服务」重新保存设置以授权此域名。"],
      CHAT_SEARCH_ACCESS: ["ai_chat_search_access", "搜索服务拒绝访问，请检查 API 密钥、权限或余额。"],
      CHAT_SEARCH_QUOTA: ["ai_chat_search_quota", "搜索服务余额或配额不足。"],
      CHAT_SEARCH_RATE: ["ai_chat_search_rate", "搜索服务达到请求频率或配额限制。"],
      CHAT_SEARCH_TIMEOUT: ["ai_chat_search_timeout", "搜索服务响应超时，请稍后重试。"],
      CHAT_SEARCH_NETWORK: ["ai_chat_search_network", "无法连接搜索服务，请检查网络。"],
      CHAT_SEARCH_HTTP: ["ai_chat_search_http", "搜索服务请求失败，请稍后重试。"],
      CHAT_SEARCH_RESPONSE: ["ai_chat_search_response", "搜索服务返回了无效或过大的响应。"],
      AI_HOST_PERMISSION_REQUIRED: ["ai_chat_permission", "请在「AI 服务」中编辑并保存当前服务，以授权 AI 网关。"],
      AI_CONFIG_UNAVAILABLE: desktop ? ["ai_chat_setup_service", "请前往「扩展设置 → AI 服务」配置可用的服务。"] :
        ["ai_chat_config", "当前 AI 服务不可用，请检查设置。"],
      PROVIDER_CONFIG_MISSING: ["ai_chat_itad_key", "请先在第三方服务中配置 ITAD API Key。"],
      PROVIDER_DISABLED: ["ai_chat_itad_key", "请先在第三方服务中配置 ITAD API Key。"],
      CHAT_TOOL_NOT_ALLOWED: ["ai_chat_tool_not_allowed", "蒸汽机请求了未启用的工具。"],
      CHAT_TOOL_INVALID: ["ai_chat_tool_invalid", "工具请求参数无效。"],
      CHAT_TOOL_DECLINED: ["ai_chat_approval_declined", "已拒绝本次操作"],
      CHAT_APPROVAL_STALE: ["ai_chat_approval_stale", "操作范围已变化，本次授权已失效。请重新发送。"],
      CHAT_APPROVAL_TIMEOUT: ["ai_chat_approval_timeout", "等待授权超时。请重新发送。"],
      CHAT_APPROVAL_REOPEN: ["ai_chat_approval_reopen", "请重新打开聊天，以处理工具审批。"],
      AUTOMATION_RESET: ["ai_chat_automation_reset", "自动化正在恢复出厂设置，请稍后重试。"],
      STEAM_CLIENT_REQUIRED: ["ai_chat_steam_connection_unavailable", "Steam 数据入口未就绪。请打开 Steam 游戏库后重试。"],
      STEAM_NATIVE_DISCONNECTED: ["ai_chat_steam_connection_unavailable", "Steam 数据入口未就绪。请打开 Steam 游戏库后重试。"],
      STEAM_NATIVE_TIMEOUT: ["ai_chat_steam_connection_timeout", "Steam 数据入口响应超时，请重试。"],
      WORKFLOW_TOOL_UNAVAILABLE: ["ai_chat_approval_stale", "操作范围已变化，本次授权已失效。请重新发送。"],
      WORKFLOW_LIBRARY_UNAVAILABLE: ["ai_chat_approval_stale", "操作范围已变化，本次授权已失效。请重新发送。"],
      CHAT_HISTORY_WRITE_FAILED: ["ai_chat_save_failed", "保存对话失败，请检查扩展存储空间。"],
    }[code] || ["ai_chat_failed", "请求失败。可以再次发送或检查 AI 服务设置。"];
    return text(...caption, { parameter });
  }

  function failed(error, notice = status) {
    notice.textContent = failureText(error.code, error.parameter);
    if (["AI_HOST_PERMISSION_REQUIRED", "AI_CONFIG_UNAVAILABLE", "PROVIDER_CONFIG_MISSING", "PROVIDER_DISABLED", "CHAT_REASONING_INVALID",
      "CHAT_SEARCH_CONFIG", "CHAT_SEARCH_ACCESS", "CHAT_SEARCH_PERMISSION"].includes(error.code))
      needsSettings = true;
    if (!error.code) log.error("chat-ui-failed", "AI 对话界面操作失败", { error });
    if (notice === status && error.code !== "CHAT_STOPPED") {
      void STFeedback.show(document.body, { message: status.textContent, focus: input }).catch(failure => {
        log.error("chat-feedback-failed", "AI 对话提示失败", { error: failure });
      });
    }
  }

  function startReply() {
    const { row, content } = messageFrame("assistant");
    const notice = document.createElement("p");
    notice.className = "reply-status";
    notice.setAttribute("role", "status");
    content.append(notice);
    const waiting = text("ai_chat_waiting", "正在生成…");
    notice.textContent = waiting;
    notice.dataset.phase = "active";
    const updates = [];
    const tools = new Map();
    const sources = [];
    let process;
    let reasoning, hasToolSteps = false;
    let calls = 0;
    let previewTimer = 0;
    let liveText;
    let liveSource = "";
    let previewSource = "";

    function renderText() {
      if (liveSource === previewSource) return;
      if (!liveText) {
        liveText = document.createElement("div");
        liveText.className = "message-markdown reply-stream";
        notice.before(liveText);
      }
      renderMarkdown(liveText, previewTokens(liveSource));
      previewSource = liveSource;
    }

    function finishText(value = liveSource, parent = content) {
      const prose = liveText;
      liveText = null;
      liveSource = previewSource = "";
      if (!value?.trim()) {
        prose?.remove();
      } else if (prose) {
        renderMarkdown(prose, markdown.parse(value, {}));
        prose.classList.remove("reply-stream");
        if (parent !== content) parent.append(prose);
      } else {
        replyText(parent, value, parent === content ? notice : null);
      }
    }

    function flush(preview = true) {
      previewTimer = 0;
      const follow = atTranscriptEnd();
      const additions = new Map();
      for (const update of updates) {
        if (update.type === "thinking") {
          notice.dataset.phase = "active";
          notice.textContent = text("ai_chat_thinking", "正在思考…");
          continue;
        }
        if (update.type === "reasoning") {
          if (reasoning?.round !== update.round) {
            process ??= replyProcess(content, liveText ?? notice, true);
            reasoning = { round: update.round, node: replyReasoning(process.body) };
            labelProcess(process, calls, !hasToolSteps);
          }
          additions.set(reasoning.node, (additions.get(reasoning.node) ?? "") + update.text);
          continue;
        }
        if (update.type === "delta") {
          liveSource += update.text;
          if (notice.textContent) notice.textContent = "";
          continue;
        }
        const { index, step } = update;
        const previous = step && tools.get(index);
        if (!previous) {
          if (step || liveSource.trim()) {
            hasToolSteps = true;
            process ??= replyProcess(content, liveText ?? notice, true);
            finishText(undefined, process.body);
            if (step && step.state !== "blocked") calls += 1;
            labelProcess(process, calls);
          }
        }
        if (!step) {
          notice.dataset.phase = "active";
          notice.textContent = text(...toolStates.running);
          continue;
        }
        if (step.source?.url && !sources.some(source => !source.kind && source.url === step.source.url)) sources.push(step.source);
        for (const source of update.webSources ?? [])
          if (!sources.some(item => item.kind === "web-search" && item.reference === source.reference)) sources.push(source);
        const tool = replyTool(step, sources, previous?.tool);
        if (!previous) process.body.append(tool);
        tools.set(index, { step, tool });
        notice.dataset.phase = step.state === "running" ? "tool" : "active";
        notice.textContent = step.state === "running"
          ? tool.firstChild.firstChild.textContent + " · " + text(...toolStates.running)
          : step.state === "done" ? waiting : "";
      }
      for (const [node, value] of additions) node.appendData(value);
      updates.length = 0;
      if (preview) renderText();
      if (follow) transcript.scrollTop = transcript.scrollHeight;
    }

    return {
      row,
      progress(update, decide) {
        if (update.type === "tool-approval") {
          if (stop.hasAttribute("aria-busy")) return;
          if (previewTimer) { clearTimeout(previewTimer); flush(); }
          showApproval(notice, update, decide);
          return;
        }
        updates.push(update);
        if (!previewTimer) previewTimer = setTimeout(flush, STREAM_PREVIEW_MS);
      },
      finish(answer, error) {
        const follow = atTranscriptEnd();
        if (previewTimer) clearTimeout(previewTimer);
        flush(false);
        notice.removeAttribute("data-phase");
        if (answer?.interrupted) {
          finishText();
          replyText(content, answer.content, notice);
        } else finishText(answer?.content);
        if (error || answer?.interrupted) {
          const code = error?.code ?? answer?.interrupted;
          for (const { step, tool } of tools.values()) {
            if (step.state === "running" || step.state === "waiting")
              replyTool({
                ...step, state: code === "CHAT_STOPPED" ? "stopped" : "failed", errorCode: code,
              }, sources, tool);
          }
        }
        if (error) failed(error, notice);
        else {
          notice.remove();
          if (process && answer?.content?.trim() && !answer.interrupted && !process.details.contains(document.activeElement))
            process.close();
        }
        const references = answer ? [...(answer.sources ?? []), ...sources.filter(source => source.transient)]
          : sources;
        if (references.some(source => source.transient)) references.sort((a, b) => a.reference - b.reference);
        appendSources(content, references);
        if (follow) transcript.scrollTop = transcript.scrollHeight;
      },
    };
  }

  async function submit(event) {
    event.preventDefault();
    if (!canSend()) return;
    const draft = input.value;
    const message = draft.trim();
    const serviceId = service.value;
    const approvalMode = composerView?.getApprovalMode() ?? "ask";
    const reasoning = composerView?.getReasoning();
    const preference = thread.composer && { ...thread.composer, serviceId, reasoning };
    const searchEnabled = thread.searchEnabled === true;
    const provider = enabledSearchProvider();
    const serviceRevision = services.find(item => item.id === serviceId)?.revision;
    if (desktop) stashDraft();
    else thread.serviceId = serviceId;
    let images = [];
    if (composerView?.imageCount()) {
      busy(true);
      try { images = await composerView.readImages(); }
      catch (error) {
        log.error("chat-attachment-read-failed", "读取对话附件失败", { error });
        busy(false);
        failed(error);
        return;
      }
    }
    busy(true, true);
    failedTurn?.forEach(row => row.remove());
    failedTurn = null;
    if (web) welcome.hidden = true;
    toolsMenu.open = false;
    status.textContent = "";
    const question = addMessage({ role: "user", content: message, imageCount: images.length });
    const reply = startReply();
    input.value = "";
    syncComposer();
    transcript.scrollTop = transcript.scrollHeight;
    let failure;
    liveUsage = undefined;
    const request = { id: thread.id, revision: thread.revision, serviceId, serviceRevision, text: message, appId, approvalMode,
      reasoningProgress: true, searchEnabled, ...(provider && { searchProvider: provider }),
      ...(reasoning !== undefined && { reasoning }), ...(!thread.revision && preference && { composer: preference }),
      ...(images.length && { images }) };
    try {
      thread = await call("send", request, (update, decide) => {
        if (update.type === "usage") { liveUsage = update.usage; syncUsage(); }
        else if (update.type === "compaction") beginCompaction();
        else reply.progress(update, decide);
      });
      thread.composer = preference;
      thread.searchEnabled = searchEnabled;
      liveUsage = undefined;
      composerView?.clearImages();
      finishCompaction();
      records = [thread, ...records.filter(item => item.id !== thread.id)];
      if (desktop) drafts.delete(thread.id);
      needsSettings = false;
    } catch (error) {
      if (compressing) finishCompaction();
      input.value = draft;
      failure = error;
      if (error.code === "CHAT_CHANGED" || error.code === "CHAT_SEARCH_PREFERENCE_CHANGED") {
        try {
          const latest = await call("read", { id: thread.id });
          if (!latest) throw new Error("AI chat history record unavailable");
          thread = latest;
          render();
          transcript.append(question, reply.row);
        }
        catch (readError) { failure = readError; }
      }
    } finally {
      if (failure) failedTurn = [question, reply.row];
      reply.finish(failure ? null : thread.messages.at(-1), failure);
      renderControls();
      if (!document.activeElement?.closest(".reply-card")) input.focus();
    }
  }

  async function init() {
    await STI18n.ready();
    document.documentElement.lang = STI18n.intlLocale();
    document.title = name;
    document.querySelector("h1").textContent = name;
    for (const node of document.querySelectorAll("[data-text]")) node.textContent = text(node.dataset.text, node.textContent);
    iconControl(toolsTrigger, toolsTrigger.textContent);
    if (pane) mountPane();
    else stop.title = stop.textContent;
    if (web) mountWeb();
    chrome.storage.onChanged.addListener(onPreferenceChanged);
    const version = toolSyncVersion;
    const [prefs, state] = await Promise.all([
      STSettingsBus.rawGet([sendShortcutKey], { owner: "settings:ai-chat", reason: "chat-send-shortcut", strict: true }),
      call("state"),
    ]);
    if (version === toolSyncVersion) renderTools(state.tools);
    if (!sendShortcutChanged) applySendShortcut(prefs[sendShortcutKey]);
    if (!searchSettingsChanged && state.search) searchSettings = state.search;
    ({ threads: records, services } = state);
    thread = records.length ? await call("read", { id: records[0].id }) : newThread();
    render();
    if (web && document.hasFocus() && document.activeElement === document.body) history.focus();
  }

  function requestClose(event) {
    window.parent.postMessage({ type: "st-ai-chat-close", escapeAt: performance.timeOrigin + event.timeStamp }, "*");
  }

  create.addEventListener("click", () => {
    if (pending || !thread) return;
    stashDraft();
    thread = newThread();
    input.value = status.textContent = "";
    render();
    input.focus();
  });
  if (!pane) history.addEventListener("change", () => { void switchSession(history.value); });
  checks.addEventListener("change", event => { void setToolEnabled(event); });
  service.addEventListener("change", () => {
    if (!composerView && thread && service.value) saveModelPreference({ serviceId: service.value, lastEnabled: {} });
    if (thread?.compaction && status.textContent === compactionText(thread.compaction.status)) status.textContent = "";
    syncSearch();
    syncComposer();
    syncUsage();
  });
  byId("composer-usage-compact").addEventListener("click", () => { void compactContext(); });
  input.addEventListener("input", syncComposer);
  composer.addEventListener("submit", submit);
  input.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
        event.shiftKey || event.altKey || event.metaKey || event.ctrlKey !== sendWithCtrl) return;
    event.preventDefault();
    if (!event.repeat && !send.disabled) composer.requestSubmit(send);
  });
  stop.addEventListener("click", () => {
    stop.disabled = true;
    stop.setAttribute("aria-busy", "true");
    clearApproval();
    port?.postMessage({ action: "cancel" });
  });
  window.addEventListener("keydown", event => {
    if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
    if (toolApproval) {
      event.preventDefault();
      event.stopPropagation();
      toolApproval.decide(false);
      return;
    }
    if (composerView?.dismiss()) {
      event.preventDefault();
      return;
    }
    if (toolsMenu.open) {
      toolsMenu.open = false;
      toolsTrigger.focus();
    } else if (window.parent !== window) requestClose(event);
  });
  window.addEventListener("pagehide", () => {
    clearApproval();
    composerView?.dispose();
    chrome.storage.onChanged.removeListener(onPreferenceChanged);
    avatarPort?.close();
    port?.disconnect();
  }, { once: true });
  if (pane) connectAvatar();
  busy(true);
  void init().catch(error => { failed(error); settings.hidden = desktop; });
})();
