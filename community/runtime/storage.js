/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 社区增强存储封装
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STCommunity;
  if (!api || api.storage) return;

  function get(kind, key) {
    const box = kind === "local" ? localStorage : sessionStorage;
    try {
      const raw = box.getItem(`st_see_${key}`);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function set(kind, key, value) {
    const box = kind === "local" ? localStorage : sessionStorage;
    try {
      box.setItem(`st_see_${key}`, JSON.stringify(value));
    } catch {
      // 缓存写满不影响主流程。
    }
  }

  function stripCookieQuotes(value) {
    const text = String(value ?? "");
    if (text.length >= 2 && (
      (text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'"))
    )) {
      return text.slice(1, -1);
    }
    return text;
  }

  function cookie(name) {
    const prefix = `${name}=`;
    for (let item of document.cookie.split(";")) {
      item = item.trim();
      if (item.startsWith(prefix)) {
        const raw = stripCookieQuotes(item.slice(prefix.length));
        try {
          return stripCookieQuotes(decodeURIComponent(raw));
        } catch {
          return raw;
        }
      }
    }
    return null;
  }

  api.storage = {
    get,
    set,
    cookie,
  };
})();
