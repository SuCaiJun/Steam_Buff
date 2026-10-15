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

  function storage(area, method, value) {
    return new Promise((resolve, reject) => {
      try {
        root.chrome.storage[area][method](value, (result) => {
          const error = root.chrome.runtime.lastError;
          if (error) reject(new Error(error.message));
          else resolve(result);
        });
      } catch (error) { reject(error); }
    });
  }

  function normalizeState(value) {
    if (!value || typeof value.enabled !== "boolean" || !Number.isInteger(value.revision)
      || value.revision < 0 || (value.enabled && !value.sessionId)) throw new TypeError("日志开关状态格式错误");
    return Object.freeze({ enabled: value.enabled, sessionId: String(value.sessionId || ""), revision: value.revision });
  }

  function accept(value) {
    state = normalizeState(value);
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
        const value = await storage("local", "get", [KEY]);
        if (value[KEY] !== undefined) return accept(value[KEY]);
        // 旧版会话开关只迁移一次；已有持久设置始终优先
        const legacy = await storage("session", "get", [KEY]);
        if (legacy[KEY] === undefined) return state;
        const previous = normalizeState(legacy[KEY]);
        await storage("local", "set", { [KEY]: previous });
        return accept(previous);
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
      if (typeof enabled !== "boolean") throw new TypeError("日志开关 enabled 必须是布尔值");
      if (state.enabled === enabled) return state;
      const next = { enabled, sessionId: enabled ? factory.createOperationId() : "", revision: state.revision + 1 };
      await storage("local", "set", { [KEY]: next });
      accept(next);
      broadcast();
      if (enabled) factory.createLogger("extension", "debug-mode").info("debug-mode-changed", "日志记录已开启", { operationId, enabled, revision: state.revision });
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
    domain: "extension", feature: "debug-mode", event: "debug-session-restore-failed", message: "恢复日志开关状态失败", level: "warn",
  }));
})(globalThis);
