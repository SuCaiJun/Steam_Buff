/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 客户端跨窗口上下文路由器
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.SteamBuff = window.SteamBuff || {};
  const VERSION = "steam-buff-context-router-v2";
  const CHANNEL = "__steam_buff_context_router_Ricky";
  const TASK = "steam-context-router";
  const SOURCE = "steam-context-router";
  const ROUTE_MS = 1000;
  const log = window.STLoggerFactory.createLogger("steam", "context-router");

  if (api.contextRouter?.version === VERSION) {
    return;
  }
  api.contextRouter?.stop?.();

  const state = {
    channel: null,
    listener: null,
    route: "",
    routeSource: null,
    listeners: new Set(),
    started: false,
  };

  function normalized(value) {
    return api.ctx?.normalizeRoute?.(value) || "";
  }

  function emit(next) {
    if (state.route === next) {
      return false;
    }
    state.route = next;
    for (const listener of state.listeners) {
      try {
        listener(next);
      } catch (error) {
        log.error("context-route-listener-failed", "Steam 上下文路由订阅回调失败", { error });
      }
    }
    return true;
  }

  function send(message) {
    try {
      state.channel?.postMessage({ source: SOURCE, ...message });
      return null;
    } catch (error) {
      return error;
    }
  }

  // SharedJSContext 是内部路由的唯一事实源；主窗口只消费已规范化快照。
  function publish(force = false) {
    const next = normalized(api.ctx?.route?.());
    const changed = emit(next);
    if (force || changed) {
      const error = send({ type: "route-snapshot", route: next });
      if (error) {
        log.error("context-route-publish-failed", "Steam 上下文路由发布失败", { error });
      }
    }
    return next;
  }

  // Steam 当前 SharedJSContext 会在 UpdateRoutingInfo 中提交新的内部路由。
  // 仅在该已验证提交点完成后发布一次快照，避免等待下一次低频心跳。
  function installRouteSource() {
    if (api.ctx?.isShared?.() !== true) {
      return false;
    }
    const target = window.tempNavStore;
    const original = target?.UpdateRoutingInfo;
    if (!target || typeof original !== "function") {
      return false;
    }
    const wrapped = function (...args) {
      const result = original.apply(this, args);
      try {
        publish(false);
      } catch (error) {
        log.error("context-route-source-publish-failed", "Steam 内部路由提交后的快照发布失败", { error });
      }
      return result;
    };
    try {
      target.UpdateRoutingInfo = wrapped;
      if (target.UpdateRoutingInfo !== wrapped) {
        return false;
      }
    } catch (error) {
      log.warn("context-route-source-install-failed", "Steam 内部路由提交点接入失败，将保留心跳同步", { error });
      return false;
    }
    state.routeSource = { target, original, wrapped };
    return true;
  }

  function uninstallRouteSource() {
    const source = state.routeSource;
    try {
      if (source?.target?.UpdateRoutingInfo === source.wrapped) {
        source.target.UpdateRoutingInfo = source.original;
      }
    } catch (error) {
      log.warn("context-route-source-uninstall-failed", "Steam 内部路由提交点恢复失败", { error });
    }
    state.routeSource = null;
  }

  function onMessage(event) {
    const data = event?.data || {};
    if (data.source !== SOURCE) {
      return;
    }
    if (api.ctx?.isShared?.() === true && data.type === "route-request") {
      publish(true);
      return;
    }
    if (api.ctx?.isMainUi?.() === true && data.type === "route-snapshot") {
      emit(normalized(data.route));
    }
  }

  function stop() {
    window.STScheduler?.unregister?.(TASK);
    uninstallRouteSource();
    if (state.listener && state.channel) {
      state.channel.removeEventListener("message", state.listener);
    }
    state.channel?.close?.();
    state.channel = null;
    state.listener = null;
    state.listeners.clear();
    state.route = "";
    state.started = false;
  }

  function start() {
    if (state.started) {
      return true;
    }
    const shared = api.ctx?.isShared?.() === true;
    const mainUi = api.ctx?.isMainUi?.() === true;
    if (!shared && !mainUi) {
      return false;
    }
    if (typeof BroadcastChannel !== "function" || !window.STScheduler?.register) {
      log.warn("context-router-unavailable", "Steam 上下文路由器缺少运行能力", {
        hasBroadcastChannel: typeof BroadcastChannel === "function",
        hasScheduler: typeof window.STScheduler?.register === "function",
      });
      return false;
    }

    state.channel = new BroadcastChannel(CHANNEL);
    state.listener = onMessage;
    state.channel.addEventListener("message", state.listener);
    state.started = true;

    if (shared) {
      installRouteSource();
      publish(true);
      window.STScheduler.register(
        TASK,
        () => publish(false),
        () => state.started === true && api.ctx?.isShared?.() === true,
        { intervalMs: ROUTE_MS },
      );
    } else {
      const error = send({ type: "route-request" });
      if (error) {
        log.error("context-route-request-failed", "Steam 主窗口请求上下文路由失败", { error });
      }
    }
    return true;
  }

  api.contextRouter = Object.freeze({
    version: VERSION,
    route() {
      return state.route;
    },
    subscribe(listener) {
      if (typeof listener !== "function") {
        throw new TypeError("Steam 上下文路由订阅器必须是函数");
      }
      state.listeners.add(listener);
      listener(state.route);
      return Object.freeze({
        dispose() {
          state.listeners.delete(listener);
        },
      });
    },
    start,
    stop,
  });

  start();
})();
