/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Store 页面主世界|消费历史分类器 GM_info 环境桥
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  window.GM_info = {
    script: {
      name: "Steam 消费历史分类器",
      version: "2.2.2",
    },
  };

  if (typeof window.GM_xmlhttpRequest === "function") return;

  // 新版分类器只使用此接口读取匿名汇率，桥接范围限定在已核实的固定数据文件
  window.GM_xmlhttpRequest = async ({ method, url, onload, onerror, ontimeout }) => {
    const target = new URL(url);
    const cdn = target.origin === "https://cdn.jsdelivr.net" &&
      /^\/npm\/@fawazahmed0\/currency-api@(?:latest|\d{4}-\d{2}-\d{2})\/v1\/currencies\/usd\.json$/.test(target.pathname);
    const mirror = target.origin === "https://latest.currency-api.pages.dev" && target.pathname === "/v1/currencies/usd.json";
    if (method !== "GET" || !(cdn || mirror) || target.username || target.password || target.search || target.hash) {
      onerror();
      return;
    }
    const signal = AbortSignal.timeout(10000);
    let responseText;
    try {
      const response = await fetch(target, { credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", signal });
      if (!response.ok) {
        onerror();
        return;
      }
      responseText = await response.text();
    } catch (error) {
      if (signal.aborted) ontimeout();
      else onerror();
      return;
    }
    onload({ responseText });
  };
})();
