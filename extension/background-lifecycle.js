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

  async function initialize(details = {}, now = Date.now()) {
    const reason = String(details?.reason || "");
    if (reason !== "install" && reason !== "update") {
      return null;
    }

    const currentVersion = String(root.chrome.runtime.getManifest().version || "").trim();
    if (!currentVersion) {
      throw new Error("扩展安装或升级事件缺少当前版本号");
    }

    const installedAt = timestamp(now);
    const stored = await storageGet([STARTED_AT_KEY, INSTALLED_VERSION_KEY]);
    const storedStartedAt = Number(stored[STARTED_AT_KEY]);
    const storedVersion = String(stored[INSTALLED_VERSION_KEY] || "").trim();
    const startedAt = storedStartedAt > 0 ? storedStartedAt : installedAt;
    const initializeVersion = reason === "install" || !storedVersion;
    const versionChanged = reason === "update" && !!storedVersion && storedVersion !== currentVersion;
    const patch = {};
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
      versionChanged,
      updatePromptPending: versionChanged,
    });
    return {
      reason,
      startedAt,
      pendingUpdate: patch[PENDING_UPDATE_KEY] || null,
    };
  }

  const api = Object.freeze({
    STARTED_AT_KEY,
    INSTALLED_VERSION_KEY,
    SUPPORT_DECISION_KEY,
    PENDING_UPDATE_KEY,
    initialize,
  });

  root.STBackgroundLifecycle = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
