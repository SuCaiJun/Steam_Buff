/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 扩展安装与升级提示状态
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const contract = root.STLifecyclePromptContract;
  if (!contract) {
    throw new Error("[Steam Buff] 生命周期提示状态契约未加载");
  }
  const STARTED_AT_KEY = contract.startedAtKey;
  const INSTALLED_VERSION_KEY = contract.installedVersionKey;
  const SUPPORT_DECISION_KEY = contract.supportDecisionKey;
  const PENDING_UPDATE_KEY = contract.pendingUpdateKey;
  const MESSAGE_OUTBOX_KEY = contract.messageOutboxKey;
  let deliveryTask = null;
  let reportedTask = null;
  let stateQueue = Promise.resolve();
  const TRANSLATE_ENABLED_KEY = "st.settings.translate.enabled";
  const log = root.STLoggerFactory?.createLogger?.("background", "lifecycle-prompts") || {
    info() {},
  };

  function storageGet(keys) {
    return new Promise((resolve, reject) => {
      root.chrome.storage.local.get(keys, (data) => {
        const error = root.chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message || "读取扩展生命周期状态失败"));
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
          reject(new Error(error.message || "保存扩展生命周期状态失败"));
          return;
        }
        resolve();
      });
    });
  }

  function timestamp(value) {
    const next = Number(value);
    return Number.isFinite(next) && next > 0 ? next : Date.now();
  }

  function outbox(data) {
    const rows = data[MESSAGE_OUTBOX_KEY];
    if (rows === undefined) return [];
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row.version !== "string" || typeof row.previousVersion !== "string" || !Number.isSafeInteger(row.updatedAt) || row.updatedAt <= 0)) throw new TypeError("升级消息待投递状态无效");
    return rows;
  }

  async function serialState(work) {
    const previous = stateQueue; let release;
    stateQueue = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await work(); } finally { release(); }
  }

  // 原弹窗消费自己的 pending 状态；消息投递使用独立 outbox，写库完成后才移除，worker 重启继续恢复。
  function deliver() {
    if (deliveryTask) return deliveryTask;
    deliveryTask = (async () => {
      for (;;) {
        const rows = await serialState(async () => outbox(await storageGet([MESSAGE_OUTBOX_KEY])));
        if (!rows.length) return;
        const event = rows[0];
        await root.STBackgroundUpdate.installed(event);
        await serialState(async () => {
          const current = outbox(await storageGet([MESSAGE_OUTBOX_KEY]));
          if (current[0]?.version !== event.version || current[0]?.updatedAt !== event.updatedAt) throw new Error("升级消息待投递事件发生冲突");
          await storageSet({ [MESSAGE_OUTBOX_KEY]: current.slice(1) });
        });
      }
    })().finally(() => { deliveryTask = null; });
    return deliveryTask;
  }

  function start() {
    const task = deliver();
    if (reportedTask === task) return;
    reportedTask = task;
    void task.catch(error => log.warn("upgrade-message-delivery-failed", "升级完成消息待投递，后续启动将恢复", { error }));
  }

  // 安装时仅初始化缺失的翻译总开关，升级和已有选择保持不变；初始化在首轮内容注入前执行
  async function initializeState(details = {}, now = Date.now()) {
    const reason = String(details?.reason || "");
    if (reason !== "install" && reason !== "update") {
      return null;
    }

    const currentVersion = String(root.chrome.runtime.getManifest().version || "").trim();
    if (!currentVersion) {
      throw new Error("扩展安装或升级事件缺少当前版本号");
    }

    const installedAt = timestamp(now);
    const stored = await storageGet([STARTED_AT_KEY, INSTALLED_VERSION_KEY, TRANSLATE_ENABLED_KEY, MESSAGE_OUTBOX_KEY]);
    const storedStartedAt = Number(stored[STARTED_AT_KEY]);
    const storedVersion = String(stored[INSTALLED_VERSION_KEY] || "").trim();
    const startedAt = storedStartedAt > 0 ? storedStartedAt : installedAt;
    const initializeVersion = reason === "install" || !storedVersion;
    const versionChanged = reason === "update" && !!storedVersion && storedVersion !== currentVersion;
    const initializeTranslate = reason === "install" && !Object.hasOwn(stored, TRANSLATE_ENABLED_KEY);
    const patch = {};
    if (initializeTranslate) {
      patch[TRANSLATE_ENABLED_KEY] = true;
    }
    if (!(Number(stored[STARTED_AT_KEY]) > 0)) {
      patch[STARTED_AT_KEY] = startedAt;
    }
    if (initializeVersion) {
      patch[INSTALLED_VERSION_KEY] = currentVersion;
    } else if (versionChanged) {
      patch[INSTALLED_VERSION_KEY] = currentVersion;
      patch[PENDING_UPDATE_KEY] = {
        version: currentVersion,
        previousVersion: String(details?.previousVersion || "").trim(),
        updatedAt: installedAt,
      };
      patch[MESSAGE_OUTBOX_KEY] = [...outbox(stored), { ...patch[PENDING_UPDATE_KEY] }];
    }

    if (Object.keys(patch).length) {
      await storageSet(patch);
    }
    log.info("extension-lifecycle-state-ready", "扩展安装与升级提示状态已更新", {
      reason,
      version: currentVersion,
      storedVersion,
      previousVersion: String(details?.previousVersion || "").trim(),
      startedAt,
      versionInitialized: initializeVersion,
      translateDefaultInitialized: initializeTranslate,
      versionChanged,
      updatePromptPending: versionChanged,
    });
    return {
      reason,
      startedAt,
      pendingUpdate: patch[PENDING_UPDATE_KEY] || null,
    };
  }

  async function initialize(details = {}, now = Date.now()) {
    const value = await serialState(() => initializeState(details, now));
    // 内容注入只等待原生命周期状态落盘；消息投递独立执行，避免数据库迁移或失败拖住页面启动。
    if (value?.pendingUpdate) start();
    return value;
  }

  const api = Object.freeze({
    STARTED_AT_KEY,
    INSTALLED_VERSION_KEY,
    SUPPORT_DECISION_KEY,
    PENDING_UPDATE_KEY,
    MESSAGE_OUTBOX_KEY,
    initialize, start, deliver,
  });

  root.STBackgroundLifecycle = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
