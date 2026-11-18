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
    regexQueue = Promise.resolve(),
    regexSession = null;
  const requests = new Map(),
    regexFailures = new Map();
  const log = root.STLoggerFactory.createLogger("extension", "automation");
  function post(value) {
    root.postMessage({ source: SOURCE, side: "content", ...value }, root.location.origin);
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
      requests.delete(data.rid);
      root.clearTimeout(pending.timer);
      if (data.success) pending.respond({ success: true, value: data.value });
      else pending.respond({ success: false, error: data.error || "Steam 原生操作失败", ...(data.code ? { code: data.code } : {}) });
      return;
    }
    if (!["native-ready", "events"].includes(data.action)) return;
    try {
      const response = await root.STMessageBus.request(
        {
          type: "AUTOMATION",
          action: data.action,
          events: data.events,
          revision: data.revision,
          checkedAt: data.checkedAt,
        },
        { timeoutMs: 120000, logFailures: false },
      );
      if (active) post({ kind: "response", rid: data.rid, ...response });
    } catch (error) {
      log.error("automation-bridge-failed", "自动化后台通信失败", { error, requestId: data.rid });
      if (active) post({ kind: "response", rid: data.rid, success: false, error: "自动化后台通信失败" });
    }
  }
  function nativeMessage(message, sender, respond) {
    if (!active || sender.id !== root.chrome.runtime.id || message?.type !== NATIVE) return false;
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
      requests.delete(message.rid);
      respond({ success: false, error: "Steam 原生操作超时，结果未确认" });
    }, 90000);
    requests.set(message.rid, { respond, timer });
    post({ kind: "native-command", rid: message.rid, action: message.action, value: message.value });
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
    for (const pending of requests.values()) {
      root.clearTimeout(pending.timer);
      pending.respond({ success: false, error: "Steam 自动化入口已停止" });
    }
    requests.clear();
  }
  root.STAutomationBridge = Object.freeze({ start, stop });
})(globalThis);
