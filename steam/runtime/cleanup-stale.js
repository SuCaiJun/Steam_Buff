/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam CEF 非目标窗口旧运行时清理
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const EXCLUDED_TITLES = Object.freeze([
    "Profile Supernav",
    "Community Supernav",
    "Library Supernav",
    "Store Supernav",
    "Account Menu",
    "Notifications Menu",
    "Help Root Menu",
    "Games Root Menu",
    "Friends Root Menu",
    "View Root Menu",
    "Steam Root Menu",
    "Menu",
    "好友列表",
  ]);
  const ALLOWED_TITLES = Object.freeze(["Steam", "SharedJSContext"]);
  const log = window.STLoggerFactory?.createLogger?.("steam", "cleanup-stale") || {
    info() {},
    warn() {},
    error() {},
  };

  function windowKind() {
    const title = document.title || "";
    if (EXCLUDED_TITLES.includes(title)) {
      return "excluded-title";
    }
    if (/(?:Root Menu|Supernav)$/u.test(title)) {
      return "steam-menu";
    }
    return location.hostname === "steamloopback.host" ? "steam-loopback" : "unknown";
  }

  function cleanupMeta(extra = {}) {
    return {
      windowKind: windowKind(),
      hasRuntime: !!window.SteamBuff?.runtime,
      hasRuntimeKernel: !!window.STRuntime,
      hasScheduler: !!window.STScheduler,
      ...extra,
    };
  }

  function isExcludedSteamWindow() {
    const title = document.title || "";
    if (ALLOWED_TITLES.includes(title)) {
      return false;
    }
    return location.hostname === "steamloopback.host" ||
      EXCLUDED_TITLES.includes(title) ||
      /(?:Root Menu|Supernav)$/u.test(title);
  }

  function clearTimer(value) {
    if (!value) {
      return;
    }
    try {
      window.clearTimeout(value);
      window.clearInterval(value);
    } catch (error) {
      log.warn("steam-stale-runtime-clear-timer-failed", "Steam 非目标窗口清理旧定时器失败", cleanupMeta({
        error,
      }));
    }
  }

  function cleanupRuntime() {
    const api = window.SteamBuff;
    if (!api?.runtime) {
      return;
    }
    // 历史问题：旧版本曾在菜单/Supernav 启动 runtime 等待循环，排除窗口重命中时必须主动清掉。
    clearTimer(api.runtime.timer);
    api.runtime.timer = 0;
    api.runtime.started = false;
    api.runtime.status = "excluded";
    api.runtime.loop = false;
  }

  function cleanupInfrastructure() {
    try {
      window.STRuntime?.current?.()?.disposeByOwnerPrefix?.("steam:");
      window.STScheduler?.stop?.();
    } catch (error) {
      log.warn("steam-stale-runtime-cleanup-failed", "Steam 非目标窗口清理旧运行时资源失败", cleanupMeta({
        error,
      }));
    }
  }

  if (isExcludedSteamWindow()) {
    log.info("steam-stale-runtime-cleanup-start", "Steam 非目标窗口开始清理旧运行时", cleanupMeta());
    cleanupRuntime();
    cleanupInfrastructure();
    log.info("steam-stale-runtime-cleanup-success", "Steam 非目标窗口旧运行时清理完成", cleanupMeta({
      runtimeStatus: window.SteamBuff?.runtime?.status || "",
    }));
  }
})();
