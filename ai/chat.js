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
  const text = (key, fallback) => STI18n.text(key, fallback);
  const history = byId("history"), service = byId("service"), input = byId("message");
  const transcript = byId("transcript"), status = byId("status"), stop = byId("stop");
  const checks = byId("tool-options");
  const send = byId("send"), settings = byId("settings"), create = byId("new");
  const toolOptions = new Map();
  const log = STLoggerFactory.createLogger("settings", "ai-chat");
  const rawApp = Number(new URL(location.href).searchParams.get("appId"));
  const appId = Number.isSafeInteger(rawApp) && rawApp > 0 && rawApp <= 0xffffffff ? rawApp : undefined;
  let port, pending, thread, paint = 0, sequence = 0;
  let needsSettings = false;
  let records = [], services = [];

  function option(id, label) {
    return new Option(label, id);
  }

  function connect() {
    if (port) return port;
    const opened = chrome.runtime.connect({ name: "st-ai-chat-v1" });
    port = opened;
    opened.onMessage.addListener(message => {
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

  function addMessage(message) {
    const row = document.createElement("article");
    row.className = "message message-" + message.role;
    const who = document.createElement("strong");
    who.textContent = message.role === "assistant" ? "Steam Buff AI" : text("ai_chat_you", "你");
    const content = document.createElement("p");
    content.textContent = message.content;
    row.append(who, content);
    if (message.sources?.length) {
      const sources = document.createElement("div");
      sources.className = "sources";
      for (const source of message.sources) {
        const link = document.createElement("a");
        const url = new URL(source.url);
        if (url.protocol !== "https:" || !["store.steampowered.com", "isthereanydeal.com"].includes(url.hostname)) continue;
        link.href = url.href;
        link.textContent = source.name + " · " + new Date(source.checkedAt).toLocaleString(STI18n.intlLocale());
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        sources.append(link);
      }
      row.append(sources);
    }
    transcript.append(row);
    return content;
  }

  function render() {
    history.replaceChildren(option("", text("ai_chat_current", "当前对话")), ...records.map(item => option(item.id, item.title)));
    history.value = records.some(item => item.id === thread.id) ? thread.id : "";
    service.replaceChildren(...services.map(item => option(item.id, item.name + " · " + item.model)));
    if (services.some(item => item.id === thread.serviceId)) service.value = thread.serviceId;
    else if (thread.serviceId) {
      service.prepend(option("", text("ai_chat_select_service", "选择 AI 服务")));
      service.value = "";
    }
    for (const [id, check] of toolOptions) check.checked = thread.toolIds.includes(id);
    transcript.replaceChildren();
    for (const message of thread.messages) addMessage(message);
    transcript.scrollTop = transcript.scrollHeight;
    settings.hidden = services.length > 0 && !needsSettings;
    busy(false);
  }

  function busy(value, generating = false) {
    create.disabled = history.disabled = service.disabled = value;
    input.disabled = value;
    for (const check of toolOptions.values()) check.disabled = value;
    send.disabled = value || !service.value;
    stop.hidden = !generating;
    stop.disabled = !generating;
  }

  function newThread() {
    return { id: crypto.randomUUID(), revision: 0, serviceId: services[0]?.id, toolIds: [], messages: [] };
  }

  function failed(error) {
    const caption = {
      CHAT_STOPPED: ["ai_chat_stopped", "已停止生成"],
      CHAT_TIMEOUT: ["ai_chat_timeout", "请求超时。可以重新发送。"],
      CHAT_CONNECTION_LOST: ["ai_chat_disconnected", "对话连接已断开。可以重新发送。"],
      CHAT_CONTEXT_LIMIT: ["ai_chat_context_limit", "对话上下文过长，请新建对话。"],
      CHAT_BUSY: ["ai_chat_busy", "此对话正在另一个窗口生成。"],
      CHAT_CHANGED: ["ai_chat_changed", "此对话已更新，请查看最新记录后重新发送。"],
      AI_HOST_PERMISSION_REQUIRED: ["ai_chat_permission", "请在自动化的域名授权中授权当前 AI 网关。"],
      AI_CONFIG_UNAVAILABLE: ["ai_chat_config", "当前 AI 服务不可用，请检查设置。"],
      PROVIDER_CONFIG_MISSING: ["ai_chat_itad_key", "请先在第三方服务中配置 ITAD API Key。"],
      PROVIDER_DISABLED: ["ai_chat_itad_key", "请先在第三方服务中配置 ITAD API Key。"],
      CHAT_HISTORY_WRITE_FAILED: ["ai_chat_save_failed", "保存对话失败，请检查扩展存储空间。"],
    }[error.code] || ["ai_chat_failed", "请求失败。可以再次发送或检查 AI 服务设置。"];
    status.textContent = text(...caption);
    if (["AI_HOST_PERMISSION_REQUIRED", "AI_CONFIG_UNAVAILABLE", "PROVIDER_CONFIG_MISSING", "PROVIDER_DISABLED"].includes(error.code))
      needsSettings = true;
    if (!error.code) log.error("chat-ui-failed", "AI 对话界面操作失败", { error });
    if (error.code !== "CHAT_STOPPED") {
      void STFeedback.show(document.body, { message: status.textContent, focus: input }).catch(failure => {
        log.error("chat-feedback-failed", "AI 对话提示失败", { error: failure });
      });
    }
  }

  async function submit(event) {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || !service.value || pending) return;
    const toolIds = [...toolOptions].filter(([, check]) => check.checked).map(([id]) => id);
    thread.serviceId = service.value;
    thread.toolIds = toolIds;
    busy(true, true);
    byId("tools").open = false;
    status.textContent = text("ai_chat_waiting", "正在生成…");
    addMessage({ role: "user", content: message });
    const response = addMessage({ role: "assistant", content: "" });
    input.value = "";
    transcript.scrollTop = transcript.scrollHeight;
    let buffer = "";
    let failure;
    const request = { id: thread.id, revision: thread.revision, serviceId: thread.serviceId, text: message, toolIds, appId };
    try {
      thread = await call("send", request, update => {
        if (update.type === "tools") {
          buffer = "";
          status.textContent = text("ai_chat_querying", "正在查询资料…");
        } else buffer += update.text;
        if (!paint) paint = requestAnimationFrame(() => {
          paint = 0;
          const follow = transcript.scrollHeight - transcript.clientHeight - transcript.scrollTop < 40;
          response.textContent = buffer;
          if (follow) transcript.scrollTop = transcript.scrollHeight;
        });
      });
      records = [thread, ...records.filter(item => item.id !== thread.id)];
      needsSettings = false;
      status.textContent = "";
    } catch (error) {
      input.value = message;
      failure = error;
      if (error.code === "CHAT_CHANGED") {
        try { thread = await call("read", { id: thread.id }); }
        catch (readError) { failure = readError; }
      }
    } finally {
      if (paint) { cancelAnimationFrame(paint); paint = 0; }
      render();
      input.focus();
      if (failure) { failed(failure); settings.hidden = services.length > 0 && !needsSettings; }
    }
  }

  async function init() {
    await STI18n.ready();
    document.documentElement.lang = STI18n.intlLocale();
    for (const node of document.querySelectorAll("[data-text]")) node.textContent = text(node.dataset.text, node.textContent);
    for (const tool of STAI.CHAT_TOOLS) {
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      label.append(box, document.createTextNode(text(tool.label, tool.name)));
      checks.append(label);
      toolOptions.set(tool.id, box);
    }
    ({ threads: records, services } = await call("state"));
    thread = records.length ? await call("read", { id: records[0].id }) : newThread();
    render();
  }

  create.addEventListener("click", () => {
    thread = newThread();
    input.value = status.textContent = "";
    render();
    input.focus();
  });
  history.addEventListener("change", async () => {
    const id = history.value;
    busy(true);
    try {
      thread = id ? await call("read", { id }) : newThread();
      input.value = status.textContent = "";
    } catch (error) { failed(error); }
    finally { render(); }
  });
  service.addEventListener("change", () => { send.disabled = !service.value; });
  byId("composer").addEventListener("submit", submit);
  stop.addEventListener("click", () => { stop.disabled = true; port?.postMessage({ action: "cancel" }); });
  window.addEventListener("keydown", event => {
    if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || window.parent === window) return;
    const tools = byId("tools");
    if (tools.open) {
      tools.open = false;
      tools.querySelector("summary").focus();
    } else window.parent.postMessage({ type: "st-ai-chat-close" }, "*");
  });
  window.addEventListener("pagehide", () => port?.disconnect(), { once: true });
  busy(true);
  void init().catch(error => { failed(error); settings.hidden = false; });
})();
