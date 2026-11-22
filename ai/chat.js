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
  const history = byId("history"), service = byId("service"), input = byId("message");
  const transcript = byId("transcript"), status = byId("status"), stop = byId("stop");
  const checks = byId("tool-options");
  const send = byId("send"), settings = byId("settings"), create = byId("new");
  const name = STConfig.aiChatName;
  const toolPreferenceKey = STConfig.aiChatToolPreferenceKey;
  const toolPreferenceStorage = { owner: "settings:ai-chat", reason: "chat-tool-preference" };
  const STREAM_PREVIEW_MS = 100;
  const toolOptions = new Map();
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
  let toolSave = 0;
  const pendingToolSaves = new Map();
  let toolPreferenceVersion = 0, syncedTools;
  let needsSettings = false;
  let records = [], services = [];
  let failedTurn;

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

  function connect() {
    if (port) return port;
    const opened = chrome.runtime.connect({ name: "st-ai-chat-v1" });
    port = opened;
    opened.onMessage.addListener(message => {
      if (message.type === "tool-preference") { finishToolSave(message.sequence, message.saved); return; }
      if (message.sequence !== pending?.sequence) return;
      const { progress, resolve, reject } = pending;
      if (message.type === "delta" || message.type === "tools") return progress?.(message);
      pending = null;
      if (message.type === "done") resolve(message.result);
      else reject(Object.assign(new Error("AI chat operation failed"), { code: message.code }));
    });
    opened.onDisconnect.addListener(() => {
      const reason = chrome.runtime.lastError;
      if (port !== opened) return;
      port = null;
      pending?.reject(Object.assign(new Error("AI chat connection ended", { cause: reason }), { code: "CHAT_CONNECTION_LOST" }));
      pending = null;
      for (const request of pendingToolSaves.keys()) finishToolSave(request, false);
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
    if (url.protocol !== "https:" || !["store.steampowered.com", "isthereanydeal.com"].includes(url.hostname)) return null;
    const link = document.createElement("a");
    STConfig.externalNavigation.applyToLink(link, href);
    link.textContent = label;
    return link;
  }

  function appendSources(reply, sources = [], legacy = false) {
    const footer = document.createElement("div");
    footer.className = "sources";
    const label = document.createElement("span");
    label.textContent = text("ai_chat_references", "参考资料");
    footer.append(label);
    for (const [index, source] of sources.entries()) {
      const link = sourceLink(source, "[" + (index + 1) + "] " + source.name + " ↗");
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
    if (step.state !== "done") {
      if (step.errorCode) field(text("ai_chat_tool_result", "结果"), failureText(step.errorCode));
      return facts;
    }
    const { source, facts: data } = step;
    if (step.id === "steam_game") field(text("ai_chat_tool_result", "结果"), data.found ? data.name : text("common_none", "暂无"));
    if (step.id === "steam_players")
      field(text("ai_chat_tool_players", "Steam 在线人数"), data.players.toLocaleString(STI18n.intlLocale()));
    if (step.id === "itad_prices") {
      field(text("ai_chat_tool_region", "地区"), data.country);
      field(text("ai_chat_tool_current_price", "当前价格"), formatPrice(data.current));
      field(text("ai_chat_tool_low", "历史最低价"), formatPrice(data.low));
      if (data.low) field(text("ai_chat_tool_low_at", "史低记录时间"), localeTime(data.lowAt));
    }
    field(text("ai_chat_tool_data_at", "数据时间"), localeTime(source.checkedAt));
    const index = sources.findIndex(item => item.url === source.url);
    if (index >= 0) field(text("ai_chat_references", "参考资料"), sourceLink(source, "[" + (index + 1) + "] " + source.name + " ↗"));
    return facts;
  }

  const toolStates = {
    running: ["ai_chat_tool_running", "查询中"],
    done: ["ai_chat_tool_done", "已完成"],
    blocked: ["ai_chat_tool_blocked", "未执行"],
    failed: ["common_failed", "失败"],
    stopped: ["ai_chat_tool_stopped", "已停止"],
  };

  function replyTool(step, sources, tool = document.createElement("details")) {
    if (!tool.firstChild) {
      tool.className = "reply-tool";
      const summary = document.createElement("summary");
      const name = document.createElement("span");
      const state = document.createElement("span");
      const definition = STAI.CHAT_TOOLS.find(item => item.id === step.id);
      name.textContent = definition ? text(definition.label, definition.name) : text("ai_chat_tool_call", "工具调用");
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

    summary.addEventListener("click", event => {
      event.preventDefault();
      const nextOpen = closing || !details.open;
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
    });
    details.append(summary, body);
    content.insertBefore(details, before);
    return { details, summary, body, close: () => settle(false) };
  }

  function labelProcess(process, calls) {
    const title = text("ai_chat_view_process", "查看过程");
    process.summary.textContent = calls
      ? title + " · " + text("ai_chat_tool_call_count", "$count$ 次工具调用", { count: calls })
      : title;
  }

  function addMessage(message) {
    const { row, content } = messageFrame(message.role);
    if (message.role === "user") content.textContent = message.content;
    else {
      if (message.steps?.length) {
        const process = replyProcess(content);
        let calls = 0;
        for (const step of message.steps) {
          if (step.type === "text") replyText(process.body, step.content);
          else {
            process.body.append(replyTool(step, message.sources ?? []));
            if (step.state !== "blocked") calls += 1;
          }
        }
        labelProcess(process, calls);
      }
      replyText(content, message.content);
      appendSources(content, message.sources, !message.steps);
    }
    return row;
  }

  function renderHistory() {
    const titles = new Map(records.map(record => [record.id, record.title]));
    const options = [];
    if (desktop) {
      const untitled = text("ai_chat_untitled", "新会话");
      for (const [id, draft] of drafts) {
        if (!titles.has(id) && draft.unsaved)
          titles.set(id, draft.text.trim().split("\n", 1)[0].slice(0, 80) || untitled);
      }
      if (!titles.has(thread.id)) titles.set(thread.id, thread.title || untitled);
    } else {
      const current = option("", text("ai_chat_current", "当前会话"));
      if (web) current.disabled = current.hidden = true;
      options.push(current);
    }
    history.replaceChildren(...options, ...Array.from(titles, ([id, title]) => option(id, title)));
    history.value = titles.has(thread.id) ? thread.id : "";
  }

  function renderControls() {
    const draft = desktop ? drafts.get(thread.id) : undefined;
    const selectedService = draft?.serviceId ?? thread.serviceId;
    renderHistory();
    service.replaceChildren(...services.map(item => option(item.id, item.name + " · " + item.model)));
    if (services.some(item => item.id === selectedService)) service.value = selectedService;
    else if (selectedService) {
      service.prepend(option("", text("ai_chat_select_service", "选择 AI 服务")));
      service.value = "";
    }
    updateSettingsLink();
    if (desktop && !services.length && !status.textContent)
      status.textContent = text("ai_chat_setup_service", "请前往「扩展设置 → AI 服务」配置可用的服务。");
    busy(false);
  }

  function render() {
    failedTurn = null;
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
    create.disabled = history.disabled = service.disabled = value;
    input.disabled = value;
    for (const check of toolOptions.values()) check.disabled = value;
    send.disabled = value || !service.value;
    if (pane) send.hidden = generating;
    stop.hidden = !generating;
    stop.disabled = !generating;
    if (web) for (const button of byId("suggestions").children) button.disabled = value;
  }

  function newThread() {
    return { id: crypto.randomUUID(), revision: 0, serviceId: services[0]?.id, messages: [] };
  }

  function stashDraft() {
    if (!desktop) return;
    const serviceId = service.value && service.value !== thread.serviceId ? service.value : undefined;
    if (!input.value && !serviceId && thread.revision !== 0) {
      drafts.delete(thread.id);
      return;
    }
    drafts.set(thread.id, {
      text: input.value,
      serviceId,
      unsaved: thread.revision === 0 ? thread : null,
    });
  }

  function selectedToolIds() {
    return [...toolOptions].filter(([, check]) => check.checked).map(([id]) => id);
  }

  function toolIdsFromStorage(value) {
    return value === undefined ? [...toolOptions.keys()] : STAI.validateChatToolIds(value);
  }

  function applyToolPreference(ids) {
    for (const [id, check] of toolOptions) check.checked = ids.includes(id);
  }

  function onToolPreferenceChanged(changes, area) {
    if (area !== "local" || !Object.hasOwn(changes, toolPreferenceKey)) return;
    try {
      syncedTools = toolIdsFromStorage(changes[toolPreferenceKey].newValue);
    } catch (error) {
      log.error("chat-tool-preference-invalid", "同步的聊天工具偏好无效", { error });
      return;
    }
    toolPreferenceVersion += 1;
    if (!pendingToolSaves.size) applyToolPreference(syncedTools);
  }

  function rememberTools(event) {
    const box = event.target;
    const request = ++toolSave;
    pendingToolSaves.set(request, toolPreferenceVersion);
    try {
      connect().postMessage({ action: "set-tool-preference", sequence: request, id: box.value, enabled: box.checked });
    } catch (error) {
      log.error("chat-tool-preference-send-failed", "发送聊天工具偏好失败", { error });
      finishToolSave(request, false);
    }
  }

  function finishToolSave(request, saved) {
    const version = pendingToolSaves.get(request);
    if (!pendingToolSaves.delete(request)) return;
    if (!pendingToolSaves.size && version !== toolPreferenceVersion) applyToolPreference(syncedTools);
    if (request !== toolSave) return;
    const notice = byId("tool-preference-status");
    notice.textContent = saved ? "" : text("common_saveFailed", "保存失败");
    notice.hidden = saved;
  }

  async function switchSession(id) {
    if (pending || !thread || id === thread.id || (desktop && !id)) {
      if (desktop && thread) history.value = thread.id;
      return;
    }
    stashDraft();
    busy(true);
    try {
      const draft = drafts.get(id);
      const next = draft?.unsaved || (id ? await call("read", { id }) : newThread());
      if (!next) throw new Error("AI chat history record unavailable");
      thread = next;
      input.value = draft?.text || "";
      status.textContent = "";
    } catch (error) {
      history.value = desktop || records.some(record => record.id === thread.id) ? thread.id : "";
      busy(false);
      failed(error);
      return;
    }
    render();
  }

  function iconControl(control, label) {
    control.setAttribute("aria-label", label);
    control.title = label;
    control.textContent = "";
  }

  function mountPane() {
    const header = document.querySelector("main > header");
    const historyLabel = history.closest("label");
    const serviceLabel = service.closest("label");
    header.querySelector("h1").hidden = true;
    historyLabel.classList.add("chat-history");
    historyLabel.querySelector("span").textContent = text("ai_chat_switch_session", "切换会话");
    const session = document.createElement("div");
    session.className = "chat-session";
    session.append(historyLabel, create);
    header.prepend(session);
    iconControl(create, text("ai_chat_new_session", "新建会话"));
    document.querySelector("#composer footer").prepend(serviceLabel);
    document.querySelector(".selectors").hidden = true;
    serviceLabel.classList.add("chat-service");
    input.placeholder = text("ai_chat_message", "消息");
    if (desktop) {
      transcript.tabIndex = 0;
      const { titleHeight, brandWidth, controlsWidth, minDragWidth, sessionWidth } = STConfig.aiChatWindowLayout;
      header.style.setProperty("--chat-title-height", titleHeight + "px");
      session.style.setProperty("--chat-session-width", sessionWidth + "px");
      if (params.get("titlebar") === "hosted" && window.parent !== window) {
        header.style.setProperty("--chat-title-start", brandWidth + "px");
        header.style.setProperty("--chat-title-end", controlsWidth + minDragWidth + "px");
      }
    }
  }

  function mountWeb() {
    const actions = byId("web-actions");
    const close = byId("web-close");
    history.add(option("", text("ai_chat_current", "当前会话")));
    actions.prepend(settings);
    actions.hidden = settings.hidden = false;
    welcome.querySelector("h2").textContent = name;
    for (const control of [settings, close]) iconControl(control, control.textContent);
    close.addEventListener("click", requestClose);
    byId("suggestions").addEventListener("click", event => {
      if (event.target.tagName !== "BUTTON") return;
      input.value = event.target.textContent;
      input.focus();
    });
    if (window.parent !== window) window.parent.postMessage({ type: "st-ai-chat-ready" }, "*");
  }

  function failureText(code) {
    const caption = {
      CHAT_STOPPED: ["ai_chat_stopped", "已停止生成"],
      CHAT_TIMEOUT: ["ai_chat_timeout", "请求超时。可以重新发送。"],
      CHAT_CONNECTION_LOST: ["ai_chat_disconnected", "对话连接已断开。可以重新发送。"],
      CHAT_CONTEXT_LIMIT: ["ai_chat_context_limit", "对话上下文过长，请新建对话。"],
      CHAT_BUSY: ["ai_chat_busy", "此对话正在另一个窗口生成。"],
      CHAT_CHANGED: ["ai_chat_changed", "此对话已更新，请查看最新记录后重新发送。"],
      AI_HOST_PERMISSION_REQUIRED: ["ai_chat_permission", "请在「AI 服务」中编辑并保存当前服务，以授权 AI 网关。"],
      AI_CONFIG_UNAVAILABLE: desktop ? ["ai_chat_setup_service", "请前往「扩展设置 → AI 服务」配置可用的服务。"] :
        ["ai_chat_config", "当前 AI 服务不可用，请检查设置。"],
      PROVIDER_CONFIG_MISSING: ["ai_chat_itad_key", "请先在第三方服务中配置 ITAD API Key。"],
      PROVIDER_DISABLED: ["ai_chat_itad_key", "请先在第三方服务中配置 ITAD API Key。"],
      CHAT_TOOL_NOT_ALLOWED: ["ai_chat_tool_not_allowed", "蒸汽机请求了未启用的工具。"],
      CHAT_TOOL_INVALID: ["ai_chat_tool_invalid", "工具请求参数无效。"],
      CHAT_HISTORY_WRITE_FAILED: ["ai_chat_save_failed", "保存对话失败，请检查扩展存储空间。"],
    }[code] || ["ai_chat_failed", "请求失败。可以再次发送或检查 AI 服务设置。"];
    return text(...caption);
  }

  function failed(error, notice = status) {
    notice.textContent = failureText(error.code);
    if (["AI_HOST_PERMISSION_REQUIRED", "AI_CONFIG_UNAVAILABLE", "PROVIDER_CONFIG_MISSING", "PROVIDER_DISABLED"].includes(error.code))
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
      const follow = transcript.scrollHeight - transcript.clientHeight - transcript.scrollTop < 40;
      for (const update of updates) {
        if (update.type === "delta") {
          liveSource += update.text;
          if (notice.textContent) notice.textContent = "";
          continue;
        }
        const { index, step } = update;
        const previous = step && tools.get(index);
        if (!previous) {
          if (step || liveSource.trim()) {
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
        if (step.source && !sources.some(source => source.url === step.source.url)) sources.push(step.source);
        const tool = replyTool(step, sources, previous?.tool);
        if (!previous) process.body.append(tool);
        tools.set(index, { step, tool });
        notice.dataset.phase = step.state === "running" ? "tool" : "active";
        notice.textContent = step.state === "running"
          ? tool.firstChild.firstChild.textContent + " · " + text(...toolStates.running)
          : step.state === "done" ? waiting : "";
      }
      updates.length = 0;
      if (preview) renderText();
      if (follow) transcript.scrollTop = transcript.scrollHeight;
    }

    return {
      row,
      progress(update) {
        updates.push(update);
        if (!previewTimer) previewTimer = setTimeout(flush, STREAM_PREVIEW_MS);
      },
      finish(answer, error) {
        const follow = transcript.scrollHeight - transcript.clientHeight - transcript.scrollTop < 40;
        if (previewTimer) clearTimeout(previewTimer);
        flush(false);
        notice.removeAttribute("data-phase");
        finishText(answer?.content);
        if (error) {
          for (const { step, tool } of tools.values()) {
            if (step.state === "running")
              replyTool({
                ...step, state: error.code === "CHAT_STOPPED" ? "stopped" : "failed", errorCode: error.code,
              }, sources, tool);
          }
          failed(error, notice);
        } else {
          notice.remove();
          if (process && !process.details.contains(document.activeElement)) process.close();
        }
        appendSources(content, answer?.sources ?? sources);
        if (follow) transcript.scrollTop = transcript.scrollHeight;
      },
    };
  }

  async function submit(event) {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || !service.value || pending) return;
    const toolIds = selectedToolIds();
    const serviceId = service.value;
    if (desktop) stashDraft();
    else thread.serviceId = serviceId;
    busy(true, true);
    failedTurn?.forEach(row => row.remove());
    failedTurn = null;
    if (web) welcome.hidden = true;
    byId("tools").open = false;
    status.textContent = "";
    const question = addMessage({ role: "user", content: message });
    const reply = startReply();
    input.value = "";
    transcript.scrollTop = transcript.scrollHeight;
    let failure;
    const request = { id: thread.id, revision: thread.revision, serviceId, text: message, toolIds, appId };
    try {
      thread = await call("send", request, reply.progress);
      records = [thread, ...records.filter(item => item.id !== thread.id)];
      if (desktop) drafts.delete(thread.id);
      needsSettings = false;
    } catch (error) {
      input.value = message;
      failure = error;
      if (error.code === "CHAT_CHANGED") {
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
    if (pane) mountPane();
    if (web) mountWeb();
    for (const tool of STAI.CHAT_TOOLS) {
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.value = tool.id;
      box.disabled = true;
      label.append(box, document.createTextNode(text(tool.label, tool.name)));
      checks.append(label);
      toolOptions.set(tool.id, box);
    }
    chrome.storage.onChanged.addListener(onToolPreferenceChanged);
    const version = toolPreferenceVersion;
    const prefs = await STSettingsBus.rawGet([toolPreferenceKey], { ...toolPreferenceStorage, strict: true });
    if (version === toolPreferenceVersion) applyToolPreference(toolIdsFromStorage(prefs[toolPreferenceKey]));
    ({ threads: records, services } = await call("state"));
    thread = records.length ? await call("read", { id: records[0].id }) : newThread();
    render();
    if (web && document.hasFocus() && document.activeElement === document.body) history.focus();
  }

  function requestClose() {
    if (window.parent !== window) window.parent.postMessage({ type: "st-ai-chat-close" }, "*");
  }

  create.addEventListener("click", () => {
    if (pending || !thread) return;
    stashDraft();
    thread = newThread();
    input.value = status.textContent = "";
    render();
    input.focus();
  });
  history.addEventListener("change", () => { void switchSession(history.value); });
  checks.addEventListener("change", rememberTools);
  service.addEventListener("change", () => { send.disabled = !service.value; });
  byId("composer").addEventListener("submit", submit);
  stop.addEventListener("click", () => { stop.disabled = true; port?.postMessage({ action: "cancel" }); });
  window.addEventListener("keydown", event => {
    if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || window.parent === window) return;
    const tools = byId("tools");
    if (tools.open) {
      tools.open = false;
      tools.querySelector("summary").focus();
    } else requestClose();
  });
  window.addEventListener("pagehide", () => {
    chrome.storage.onChanged.removeListener(onToolPreferenceChanged);
    avatarPort?.close();
    port?.disconnect();
  }, { once: true });
  if (pane) connectAvatar();
  busy(true);
  void init().catch(error => { failed(error); settings.hidden = desktop; });
})();
