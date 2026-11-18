/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 库变更事件
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

(() => {
  "use strict";
  const api = window.SteamBuff = window.SteamBuff || {};
  if (api.appOverviewEvents) return;

  const listeners = new Set();
  let around = null, hook = null;

  function detach() {
    if (hook && hook.store.OnAppOverviewChange === hook.dispatch)
      hook.store.OnAppOverviewChange = hook.original;
    hook = null;
  }

  /** 名称处理可以包围原生更新，自动化只订阅成功返回后的事件 */
  function ensure(store) {
    if ((!around && !listeners.size) || typeof store?.OnAppOverviewChange !== "function") return false;
    if (hook?.store === store && store.OnAppOverviewChange === hook.dispatch) return true;
    detach();
    const original = store.OnAppOverviewChange;
    function dispatch(...args) {
      if (hook?.dispatch !== dispatch) return original.apply(this, args);
      const next = () => original.apply(this, args);
      const result = around ? around(next, args) : next();
      for (const listener of listeners) listener(...args);
      return result;
    }
    store.OnAppOverviewChange = dispatch;
    if (store.OnAppOverviewChange !== dispatch) return false;
    hook = { store, original, dispatch };
    return true;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (!around && !listeners.size) detach();
    };
  }

  function intercept(listener) {
    around = listener;
    return () => {
      if (around === listener) around = null;
      if (!around && !listeners.size) detach();
    };
  }

  api.appOverviewEvents = Object.freeze({ ensure, subscribe, intercept });
})();
