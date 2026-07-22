/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 页面脚本注入工具
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  function root() {
    return document.documentElement || document.head;
  }

  function logInjectFailed(path, reason, error) {
    try {
      globalThis.STLoggerFactory?.createLogger?.("extension", "page-script-injector")?.error?.(
        "page-script-inject-failed",
        "页面脚本注入失败",
        {
          error: error || reason,
          scriptPath: path,
          reason,
          host: location.hostname,
          path: location.pathname,
        },
      );
    } catch {
    }
  }

  // 注入顺序依赖前一个脚本注册全局对象，script.async 必须保持 false 并逐个 await。
  function one(path) {
    return new Promise((resolve, reject) => {
      const el = root();
      if (!el) {
        const error = new Error(`未找到可注入的文档节点：${path}`);
        logInjectFailed(path, "missing-root", error);
        reject(error);
        return;
      }

      const script = document.createElement("script");
      script.src = chrome.runtime.getURL(path);
      script.async = false;
      script.onload = () => {
        script.remove();
        resolve();
      };
      script.onerror = () => {
        script.remove();
        const error = new Error(`脚本注入失败：${path}，请检查 manifest 的 web_accessible_resources 配置`);
        logInjectFailed(path, "load-error", error);
        reject(error);
      };
      el.appendChild(script);
    });
  }

  async function inject(paths) {
    for (const path of paths) {
      await one(path);
    }
  }

  globalThis.STInject = {
    inject,
  };
})();
