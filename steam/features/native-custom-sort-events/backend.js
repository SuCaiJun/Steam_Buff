/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 原生自定义排序保存事件代理
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const ID = "native-custom-sort-events";
  const API = "__SteamBuffNativeCustomSortEvents";
  const FLAG = "__SteamBuffNativeCustomSortEventsPatched";

  const log = window.STLoggerFactory.createLogger("steam", ID);

  function clean(value) {
    return typeof value === "string" ? value : "";
  }

  function start(_api, _feature, _context, scope) {
    if (window[API]?.started === true) {
      return { started: false, reason: "already-started", stop: window[API].stop };
    }

    const state = {
      started: true,
      subscribers: new Map(),
      store: null,
      orig: null,
      wrapped: null,
    };

    function notify(phase, data) {
      for (const [owner, handlers] of Array.from(state.subscribers.entries())) {
        const handler = handlers?.[phase];
        if (typeof handler !== "function") {
          continue;
        }
        try {
          handler(data);
        } catch (error) {
          log.warn("native-custom-sort-subscriber-failed", "Steam 原生自定义排序保存订阅处理失败", {
            owner,
            phase,
            error,
          });
        }
      }
    }

    function storedName(store, appid) {
      if (typeof store?.GetCustomSortAs !== "function") {
        return { known: false, value: "" };
      }
      try {
        return { known: true, value: clean(store.GetCustomSortAs(appid)) };
      } catch {
        return { known: false, value: "" };
      }
    }

    function restore() {
      if (state.store?.SetCustomSortAs === state.wrapped) {
        state.store.SetCustomSortAs = state.orig;
      }
      state.store = null;
      state.orig = null;
      state.wrapped = null;
    }

    // 原生组件在 onBlur 调用 SetCustomSortAs；这里只代理该单次保存，不观察 DOM、CloudStorage 全量 key 或运行时 tick。
    function ensure(store = window.appStore) {
      if (!store || typeof store.SetCustomSortAs !== "function") {
        return false;
      }
      if (state.store === store && store.SetCustomSortAs === state.wrapped) {
        return true;
      }
      if (state.wrapped) {
        restore();
      }
      if (store.SetCustomSortAs?.[FLAG] === true) {
        return false;
      }

      const orig = store.SetCustomSortAs;
      const wrapped = async function customSortEventHook(appid, sortAs, ...rest) {
        const id = Number(appid) || 0;
        const name = clean(sortAs);
        const app = typeof this.GetAppOverviewByAppID === "function" ? this.GetAppOverviewByAppID(id) : null;
        let shortcut = false;
        try {
          shortcut = app?.BIsShortcut?.() === true;
        } catch {
        }
        const before = shortcut ? { known: false, value: "" } : storedName(this, id);
        const base = {
          store: this,
          app,
          appid: id,
          sortAs: name,
          before: before.value,
          comparable: before.known,
          shortcut,
        };
        notify("before", base);

        let result;
        try {
          result = await orig.call(this, appid, sortAs, ...rest);
        } catch (error) {
          notify("after", { ...base, ok: false, changed: false, error });
          throw error;
        }

        const ok = result !== false;
        notify("after", {
          ...base,
          ok,
          changed: ok && before.known && before.value !== name,
          result,
        });
        return result;
      };

      try {
        Object.defineProperty(wrapped, FLAG, { value: true });
        wrapped.toString = () => orig.toString();
        store.SetCustomSortAs = wrapped;
      } catch {
        return false;
      }
      if (store.SetCustomSortAs !== wrapped) {
        return false;
      }

      state.store = store;
      state.orig = orig;
      state.wrapped = wrapped;
      return true;
    }

    function subscribe(owner, handlers) {
      const key = String(owner || "").trim();
      if (!key || !handlers || typeof handlers !== "object") {
        return null;
      }
      state.subscribers.set(key, handlers);
      ensure();
      let active = true;
      return () => {
        if (!active) {
          return;
        }
        active = false;
        state.subscribers.delete(key);
        if (!state.subscribers.size) {
          restore();
        }
      };
    }

    function stop() {
      state.subscribers.clear();
      restore();
      state.started = false;
      if (window[API] === api) {
        delete window[API];
      }
    }

    const api = Object.freeze({
      started: true,
      ensure,
      subscribe,
      stop,
    });
    window[API] = api;
    scope?.resource?.({ key: "native-custom-sort-events", type: "method-hook", dispose: stop });
    return { started: true, stop };
  }

  window.SteamBuff.reg.addEntry(ID, "backend.js", start);
})();
