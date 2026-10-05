/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @File          : DeBug 会话状态的唯一维护入口
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const KEY = "steam_buff_debug_session";
  const factory = root.STLoggerFactory;
  let state = Object.freeze({ enabled: false, sessionId: "", revision: 0 });
  let ready = null;
  let tail = Promise.resolve();

  function storage(method, value) {
    return new Promise((resolve, reject) => {
      try {
        root.chrome.storage.session[method](value, (result) => {
          const error = root.chrome.runtime.lastError;
          if (error) reject(new Error(error.message));
          else resolve(result);
        });
      } catch (error) { reject(error); }
    });
  }

  function accept(value) {
    if (!value || typeof value.enabled !== "boolean" || !Number.isInteger(value.revision)
      || value.revision < 0 || (value.enabled && !value.sessionId)) throw new TypeError("DeBug 会话状态格式错误");
    state = Object.freeze({ enabled: value.enabled, sessionId: String(value.sessionId || ""), revision: value.revision });
    factory.applyDebugState(state);
    return state;
  }

  function broadcast() {
    root.chrome.tabs.query({}, tabs => {
      if (root.chrome.runtime.lastError) return;
      for (const tab of tabs) {
        if (!Number.isInteger(tab.id)) continue;
        root.chrome.tabs.sendMessage(tab.id, { type: "STEAM_BUFF_DEBUG_STATE", state }, () => {
          // 未加载扩展入口的 tab 没有接收者，消息仅用于已加载页面的状态同步。
          void root.chrome.runtime.lastError;
        });
      }
    });
  }

  function initialize() {
    if (!ready) {
      ready = (async () => {
        const value = await storage("get", [KEY]);
        return value[KEY] === undefined ? state : accept(value[KEY]);
      })();
      // 初始化失败仍交给原调用方；后续用户操作允许重新读取。
      ready.catch(() => { ready = null; });
    }
    return ready.then(() => state);
  }

  /** 串行保存后才发布；失败不改变已确认状态。 */
  function setEnabled(enabled, operationId) {
    const task = tail.then(async () => {
      await initialize();
      if (typeof enabled !== "boolean") throw new TypeError("DeBug enabled 必须是布尔值");
      if (state.enabled === enabled) return state;
      const next = { enabled, sessionId: enabled ? factory.createOperationId() : "", revision: state.revision + 1 };
      await storage("set", { [KEY]: next });
      accept(next);
      broadcast();
      factory.createLogger("extension", "debug-mode").info("debug-mode-changed", enabled ? "DeBug 诊断模式已开启" : "DeBug 诊断模式已关闭", { operationId, enabled, revision: state.revision });
      return state;
    });
    // 原任务向调用方拒绝，队列尾恢复供后续明确操作使用。
    tail = task.catch(() => null);
    return task;
  }

  root.STBackgroundDebug = Object.freeze({
    KEY, initialize, setEnabled, snapshot: () => state,
    allows: entry => state.enabled && entry?.debugData?.sessionId === state.sessionId,
  });
  // Worker 唤醒时恢复已确认会话，不依赖设置页重新打开。
  initialize().catch(error => factory.reportError(error, {
    domain: "extension", feature: "debug-mode", event: "debug-session-restore-failed", message: "恢复 DeBug 会话状态失败", level: "warn",
  }));
})(globalThis);
