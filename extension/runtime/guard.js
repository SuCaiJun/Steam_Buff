/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 扩展运行环境守卫
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  if (globalThis.STGuard?.ready) {
    return;
  }

  const HOST = "steamloopback.host";
  const MARK = "steamBuffInjected";

  function root() {
    return document.documentElement || document.head;
  }

  function ok() {
    return location.hostname === HOST;
  }

  // lock 只防止同一页面重复注入；失败时 content.js 会调用 fail 释放标记再等待下一轮重试。
  function lock() {
    const el = root();
    if (!el) {
      return false;
    }
    if (el.dataset[MARK] === "1") {
      return false;
    }
    el.dataset[MARK] = "1";
    return true;
  }

  function fail() {
    const el = root();
    if (el) {
      el.dataset[MARK] = "";
    }
  }

  globalThis.STGuard = {
    ready: true,
    ok,
    lock,
    fail,
  };
})();
