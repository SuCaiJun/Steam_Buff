/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 客户端功能入口
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const runtimeCorrelation = document.documentElement?.dataset || {};
  const api = window.SteamBuff;
  const reg = api?.reg;
  const log = window.STLoggerFactory.createLogger('steam', 'main', {
    sessionId: runtimeCorrelation.steamBuffRuntimeSessionId || "",
    operationId: runtimeCorrelation.steamBuffRuntimeOperationId || "",
  });
  const runtime = window.STRuntime?.get?.({ id: "steam-buff-page-runtime" });
  const RUNTIME_VERSION = "steam-buff-runtime-v16";
  const RUNTIME_OPERATION_ATTR = "steamBuffRuntimeOperationId";
  const RUNTIME_READY_ATTR = "steamBuffRuntimeReady";
  const RUNTIME_READY_OPERATION_ATTR = "steamBuffRuntimeReadyOperationId";
  const BOOT_MS = 500;
  const UI_WAIT_MS = 1500;
  const BOOT_WAIT_MS = 30000;
  const LOOP_MS = 10000;
  const STEAM_FEATURES_DISABLED_MESSAGE = "__steam_buff_features_disabled";

  if (!api || !reg) {
    return;
  }

  function markRuntimeReady() {
    const el = document.documentElement || document.head;
    if (!el?.dataset) {
      return false;
    }
    el.dataset[RUNTIME_READY_ATTR] = RUNTIME_VERSION;
    el.dataset[RUNTIME_READY_OPERATION_ATTR] = el.dataset[RUNTIME_OPERATION_ATTR] || "";
    return true;
  }

  api.runtimeKernel = runtime || null;

  if (api.runtime?.started && api.runtime.version !== RUNTIME_VERSION) {
    stopPreviousRuntime();
  }

  if (api.runtime?.started && api.runtime.version === RUNTIME_VERSION) {
    markRuntimeReady();
    return;
  }

  /**
   * 生成 Steam runtime 当前上下文元数据。
   * @returns {{route: string, contexts: string[], targets: string[]}} runtime 元数据。
   */
  function runtimeMeta() {
    return {
      route: api.ctx?.route?.() || "",
      contexts: api.ctx?.contexts?.() || [],
      targets: api.ctx?.targets?.() || [],
    };
  }

  /**
   * 执行一次 Steam 功能注册器启动巡检。
   * @returns {Promise<Array<object>>} 本轮功能启动结果。
   */
  async function run() {
    const results = await reg.start();
    const noted = results.filter((result) => result.status !== "skipped" && result.unchanged !== true);
    if (noted.length) {
      api.runtime.results.push(...noted);
    }
    return results;
  }

  function normalizedFeatureSnapshot(results) {
    const allowed = new Set(["waiting", "started", "skipped", "failed", "disabled", "stopped"]);
    return (Array.isArray(results) ? results : [])
      .map((item) => {
        const status = item?.status === "loading" ? "waiting" : String(item?.status || "");
        if (!allowed.has(status)) {
          return null;
        }
        return {
          featureId: String(item?.id || ""),
          context: String(item?.context || ""),
          entry: String(item?.entry || ""),
          status,
          reason: status === "started" ? "" : String(item?.reason || ""),
        };
      })
      .filter((item) => item?.featureId)
      .sort((left, right) => `${left.featureId}:${left.context}:${left.entry}`.localeCompare(`${right.featureId}:${right.context}:${right.entry}`));
  }

  function recordFeatureSnapshot(results) {
    const meta = runtimeMeta();
    const features = normalizedFeatureSnapshot(results);
    const contexts = meta.contexts.slice().sort();
    const key = JSON.stringify({ route: meta.route, contexts, features });
    if (api.runtime.lastFeatureSnapshotKey === key) {
      return false;
    }
    api.runtime.lastFeatureSnapshotKey = key;
    log.info("runtime-feature-snapshot", "Steam 客户端功能状态已更新", {
      runtimeStatus: "ready",
      contexts,
      features,
    });
    return true;
  }

  function hasCtx() {
    return (api.ctx?.contexts?.() || []).length > 0;
  }

  function isSteamMainWindow() {
    // 只允许 Steam 主窗口、SharedJSContext 和真实业务弹窗启动 runtime，避免好友列表/菜单页空巡检。
    if (window.STPageContext?.shouldInject?.() !== true) {
      return false;
    }
    if (api.ctx?.isShared?.() || api.ctx?.isMainUi?.() || api.ctx?.isPropertyDialog?.()) {
      return true;
    }
    const title = document.title || "";
    return ![
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
    ].includes(title) && !/(?:Root Menu|Supernav)$/u.test(title);
  }

  function clearTimer(value, key = "timer") {
    if (!value) {
      return;
    }
    try {
      window.clearTimeout(value);
      window.clearInterval(value);
    } catch (error) {
      log.warn("runtime-clear-timer-failed", "Steam 客户端运行时清理旧定时器失败", {
        key,
        error,
      });
    }
  }

  function clearKnownTimers(state) {
    if (!state || typeof state !== "object") {
      return;
    }
    [
      "timer",
      "syncI",
      "pollT",
      "toastT",
      "delay",
      "failT",
      "searchTimer",
      "capacityTimer",
      "progressTimer",
    ].forEach((key) => {
      clearTimer(state[key], key);
      if (key in state) {
        state[key] = 0;
      }
    });
  }

  function stopState(id) {
    const state = api.state?.[id];
    if (!state || typeof state !== "object") {
      return;
    }
    if (typeof state.stop === "function") {
      try {
        state.stop();
      } catch (error) {
        log.warn("runtime-restart-feature-stop-failed", "Steam 客户端旧功能停止失败", {
          featureId: id,
          error,
        });
      }
    }
    clearKnownTimers(state);
    state.started = false;
    state.fOn = false;
  }

  function stopPreviousRuntime() {
    const meta = {
      previousVersion: api.runtime?.version || "",
      ...runtimeMeta(),
    };
    log.info("runtime-restart-cleanup-start", "Steam 客户端运行时开始清理旧版本", meta);
    try {
      runtime?.disposeByOwnerPrefix?.("steam:");
    } catch (error) {
      log.warn("runtime-restart-cleanup-failed", "Steam 客户端运行时资源清理失败", {
        phase: "runtime-resources",
        ...meta,
        error,
      });
    }
    try {
      api.runtime?.stopSettingsListener?.();
    } catch {
    }
    clearTimer(api.runtime?.timer, "runtime.timer");
    if (api.ctx?.isShared?.() !== true) {
      stopState("library-custom-name");
      stopState("download-auto-shutdown");
      try {
        window.__SteamBuffNewsTranslate?.stop?.();
      } catch (error) {
        log.warn("runtime-restart-feature-stop-failed", "Steam 新闻翻译旧功能停止失败", {
          featureId: "steam-news-translate",
          error,
        });
      }
    }
    api.runtime.started = false;
    api.runtime.status = "restarting";
    api.runtime.version = RUNTIME_VERSION;
    try {
      runtime?.deactivateAdapter?.("steam", "runtime-restarting");
    } catch (error) {
      log.warn("runtime-restart-cleanup-failed", "Steam 客户端运行时适配器停用失败", {
        phase: "runtime-adapter",
        ...meta,
        error,
      });
    }
    log.info("runtime-restart-cleanup-success", "Steam 客户端旧运行时清理完成", meta);
  }

  function disabledFeatureIds(data) {
    const keys = Array.isArray(data?.keys) ? data.keys : [];
    const known = new Set((reg.list?.() || []).map(item => item.id));
    const out = [];
    for (const key of keys) {
      const id = String(key || "").trim();
      if (id && known.has(id) && !out.includes(id)) {
        out.push(id);
      }
    }
    return out;
  }

  function stopDisabledFeature(featureId) {
    const ownerPrefix = `steam:${featureId}:`;
    let disposedCount = 0;
    try {
      disposedCount = runtime?.disposeByOwnerPrefix?.(ownerPrefix) || 0;
    } catch (error) {
      log.warn("runtime-feature-disable-cleanup-failed", "Steam 客户端功能关闭清理资源失败", {
        featureId,
        error,
      });
    }
    stopState(featureId);
    const marked = reg.markStopped?.(featureId) || {};
    log.debug?.("runtime-feature-disabled-cleanup", "Steam 客户端功能关闭清理完成", {
      featureId,
      disposedCount,
      startedCount: marked.started || 0,
      startingCount: marked.starting || 0,
      loadedCount: marked.loaded || 0,
      entryCount: marked.entries || 0,
    });
  }

  function installFeatureDisabledListener() {
    const handler = (event) => {
      if (event.source !== window) {
        return;
      }
      const data = event.data || {};
      if (data.type !== STEAM_FEATURES_DISABLED_MESSAGE) {
        return;
      }
      for (const featureId of disabledFeatureIds(data)) {
        stopDisabledFeature(featureId);
      }
    };
    if (runtime?.listener) {
      runtime.listener("steam:settings-stop", "features-disabled-message", window, "message", handler);
      return;
    }
    window.addEventListener("message", handler);
    api.runtime.stopSettingsListener = () => window.removeEventListener("message", handler);
  }

  function waitDelay(bootUntil) {
    if (Date.now() >= bootUntil) {
      return LOOP_MS;
    }
    if (api.ctx?.isUi?.() && !api.ctx?.isMainUi?.()) {
      return UI_WAIT_MS;
    }
    return BOOT_MS;
  }

  /**
   * 启动 Steam 客户端运行时并保持低频巡检。
   * @returns {Promise<void>} 首轮巡检完成后 resolve。
   */
  async function start() {
    if (!isSteamMainWindow()) {
      return;
    }

    await window.STI18n?.ready?.();
    runtime?.activateAdapter?.("steam", runtimeMeta());
    api.runtime = {
      started: true,
      version: RUNTIME_VERSION,
      startedAt: Date.now(),
      results: [],
      status: "starting",
      timer: 0,
      waitingLogged: false,
      readyLogged: false,
      timeoutLogged: false,
      lastFeatureSnapshotKey: "",
    };
    markRuntimeReady();
    installFeatureDisabledListener();
    log.debug?.("runtime-start", "Steam 客户端运行时开始启动", {
      route: api.ctx?.route?.() || "",
    });

    const bootUntil = Date.now() + BOOT_WAIT_MS;

    const later = (delay) => {
      runtime?.disposeOwner?.("steam:main-loop");
      api.runtime.timer = window.setTimeout(() => {
        tick().catch((error) => {
          runtime?.markError?.("steam-runtime-tick-failed", error, runtimeMeta());
          log.error("runtime-failed", "Steam 客户端运行时巡检失败", {
            ...runtimeMeta(),
            error,
          });
        });
      }, delay);
      runtime?.timer?.("steam:main-loop", "runtime-poll", api.runtime.timer);
    };

    const tick = async () => {
      if (!hasCtx()) {
        // 首次启动时 Steam 可能长时间不暴露 SharedJSContext/UI，不能永久放弃，只在启动窗口后降频等待。
        if (!api.runtime.waitingLogged) {
          api.runtime.waitingLogged = true;
          log.debug?.("runtime-waiting", "Steam 客户端运行时等待上下文就绪", {
            route: api.ctx?.route?.() || "",
            durationMs: Date.now() - api.runtime.startedAt,
          });
        }
        if (Date.now() >= bootUntil && !api.runtime.timeoutLogged) {
          api.runtime.timeoutLogged = true;
          log.warn("runtime-context-timeout", "Steam 客户端运行上下文在启动等待窗口内未就绪", {
            route: api.ctx?.route?.() || "",
            durationMs: Date.now() - api.runtime.startedAt,
          });
        }
        later(waitDelay(bootUntil));
        return;
      }

      const results = await run();
      runtime?.activateAdapter?.("steam", runtimeMeta());
      if (!api.runtime.loop) {
        api.runtime.loop = true;
        api.runtime.status = "running";
      }
      if (!api.runtime.readyLogged) {
        api.runtime.readyLogged = true;
        log.info("runtime-context-ready", "Steam 客户端运行上下文已就绪", {
          route: api.ctx?.route?.() || "",
          contexts: api.ctx?.contexts?.() || [],
          durationMs: Date.now() - api.runtime.startedAt,
        });
      }
      recordFeatureSnapshot(results);

      // Steam 客户端路由切换不会重新加载页面，常驻巡检用于补启动新路由的功能入口。
      later(LOOP_MS);
    };

    await tick();
  }

  start().catch((error) => {
    runtime?.markError?.("steam-runtime-failed", error, runtimeMeta());
    log.error("runtime-failed", "Steam 客户端运行时启动失败", {
      ...runtimeMeta(),
      error,
    });
  });
})();
