/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : SharedJSContext自动化隔离世界桥
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  root.STAutomationBridge?.stop();
  const SOURCE = "steam-buff-automation-v1",
    NATIVE = "STEAM_AUTOMATION_NATIVE";
  let active = false,
    nativeConnection = null,
    regexQueue = Promise.resolve(),
    regexSession = null;
  const requests = new Map(),
    regexFailures = new Map();
  const log = root.STLoggerFactory.createLogger("extension", "automation");
  function post(value) {
    root.postMessage({ source: SOURCE, side: "content", ...value }, root.location.origin);
  }
  const unavailable = () => ({ success: false, code: "STEAM_NATIVE_DISCONNECTED", error: "Steam 数据连接已断开" });
  function finish(rid, pending, result) {
    requests.delete(rid);
    root.clearTimeout(pending.timer);
    pending.respond(result);
  }
  function closeConnection(connectionId) {
    if (nativeConnection !== connectionId) return;
    nativeConnection = null;
    for (const [rid, pending] of requests) finish(rid, pending, unavailable());
  }
  async function pageMessage(event) {
    const data = event.data;
    if (
      !active ||
      event.source !== root ||
      event.origin !== root.location.origin ||
      data?.source !== SOURCE ||
      data.side !== "page" ||
      typeof data.rid !== "string" ||
      data.rid.length > 100
    )
      return;
    if (data.kind === "native-result") {
      const pending = requests.get(data.rid);
      if (!pending) return;
      if (data.success) finish(data.rid, pending, { success: true, value: data.value });
      else finish(data.rid, pending, { success: false, error: data.error || "Steam 原生操作失败", ...(data.code ? { code: data.code } : {}),
        ...(Number.isSafeInteger(data.savedCount) && data.savedCount > 0 ? { savedCount: data.savedCount } : {}) });
      return;
    }
    if (!["native-ready", "native-connected", "native-disconnected", "events", "account-write-check"].includes(data.action)) return;
    if (["native-connected", "native-disconnected"].includes(data.action) &&
        (typeof data.connectionId !== "string" || !/^[a-f0-9-]{36}$/.test(data.connectionId))) return;
    if (data.action === "native-connected") nativeConnection = data.connectionId;
    if (data.action === "native-disconnected") closeConnection(data.connectionId);
    try {
      const response = await root.STMessageBus.request(
        {
          type: "AUTOMATION",
          action: data.action,
          events: data.events,
          revision: data.revision,
          checkedAt: data.checkedAt,
          ...(data.action === "native-connected" && { epoch: data.epoch, connectionId: data.connectionId }),
          ...(data.action === "native-disconnected" && { connectionId: data.connectionId }),
          ...(data.action === "account-write-check" && { ticket: data.ticket, command: data.command, steamId: data.steamId,
            appid: data.appid, expected: data.expected, part: data.part }),
        },
        { timeoutMs: 120000, logFailures: false },
      );
      if (data.action === "native-connected" && !response.value?.connected) closeConnection(data.connectionId);
      if (active) post({ kind: "response", rid: data.rid, ...response });
    } catch (error) {
      if (data.action === "native-connected") closeConnection(data.connectionId);
      log.error("automation-bridge-failed", "自动化后台通信失败", { error, requestId: data.rid });
      if (active) post({ kind: "response", rid: data.rid, success: false, error: "自动化后台通信失败" });
    }
  }
  function nativeMessage(message, sender, respond) {
    if (!active || sender.id !== root.chrome.runtime.id || message?.type !== NATIVE) return false;
    if (message.connectionId && message.connectionId !== nativeConnection) {
      respond(unavailable());
      return false;
    }
    if (message.action === "cancel") {
      const pending = requests.get(message.rid);
      if (pending) {
        finish(message.rid, pending, { success: false, code: "STEAM_NATIVE_CANCELLED", error: "Steam 操作已停止" });
        post({ kind: "native-cancel", rid: message.rid });
      }
      respond({ success: true });
      return false;
    }
    if (message.action === "regex") {
      const previous = regexQueue;
      regexQueue = previous
        .then(async () => {
          if (!active) throw new Error("自动化入口已停止");
          const pattern = message.value.pattern;
          if (regexFailures.has(pattern)) throw regexFailures.get(pattern);
          const session = (regexSession ||= root.STReviewRegex.createSession({
            urlFor: (path) => chrome.runtime.getURL(path),
            onIssue: (issue) =>
              log.warn("automation-regex-isolation", "自动化正则已暂停", { reason: issue.reason }),
          }));
          session.configure([{ id: "automation", value: pattern }]);
          let matched = false;
          for (let start = 0; start < message.value.texts.length; start += 20) {
            const result = await session.match(message.value.texts.slice(start, start + 20));
            if (result.cancelled || result.unavailable) throw new Error("正则隔离会话已停止或不可用");
            if (result.issues?.length || result.errors?.length || session.issues().length) {
              const error = new Error("正则无效或执行超时，修改配置后可再次使用");
              regexFailures.set(pattern, error);
              throw error;
            }
            matched = matched || result.matches.some(Boolean);
          }
          respond({ success: true, value: matched });
        })
        .catch((error) => {
          log.error("automation-regex-failed", "自动化正则执行失败", { error });
          respond({ success: false, error: String(error.message) });
        });
      return true;
    }
    if (
      typeof message.rid !== "string" ||
      ![
        "context",
        "game-field",
        "achievements",
        "collections",
        "save-sort",
        "add-collections",
        "account-query",
        "account-save-sort",
        "account-add-collections",
        "configuration",
        "show-notification",
      ].includes(message.action)
    )
      return false;
    if (message.action === "configuration" && message.value.resetRegex) {
      regexSession?.cancel();
      regexSession = null;
      regexFailures.clear();
    }
    if (requests.has(message.rid)) {
      respond({ success: false, error: "原生请求标识重复" });
      return false;
    }
    const timer = root.setTimeout(() => {
      const pending = requests.get(message.rid);
      if (!pending) return;
      finish(message.rid, pending, { success: false, code: "STEAM_NATIVE_TIMEOUT", error: "Steam 原生操作超时，结果未确认" });
      if (message.cancellable) post({ kind: "native-cancel", rid: message.rid });
    }, 90000);
    requests.set(message.rid, { respond, timer });
    post({ kind: "native-command", rid: message.rid, action: message.action, value: message.value, cancellable: message.cancellable === true });
    return true;
  }
  function start() {
    if (active || root.document.title !== "SharedJSContext") return;
    active = true;
    root.addEventListener("message", pageMessage);
    root.chrome.runtime.onMessage.addListener(nativeMessage);
    root.addEventListener("pagehide", stop, { once: true });
  }
  function stop() {
    if (!active) return;
    active = false;
    root.removeEventListener("message", pageMessage);
    root.chrome.runtime.onMessage.removeListener(nativeMessage);
    root.removeEventListener("pagehide", stop);
    regexSession?.cancel();
    regexSession = null;
    regexFailures.clear();
    const connectionId = nativeConnection;
    nativeConnection = null;
    for (const [rid, pending] of requests) finish(rid, pending, unavailable());
    if (connectionId) {
      void root.STMessageBus.request({ type: "AUTOMATION", action: "native-disconnected", connectionId }, { logFailures: false })
        .then(response => {
          if (!response?.success) throw new Error(response?.error || "Steam 数据连接释放失败");
        }).catch(error => log.warn("automation-native-disconnect-failed", "Steam 数据连接释放失败", { error }));
    }
  }
  root.STAutomationBridge = Object.freeze({ start, stop });
})(globalThis);
