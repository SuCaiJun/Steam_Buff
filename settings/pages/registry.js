/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置页面注册器
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = globalThis.STSettingsPages = globalThis.STSettingsPages || {};

  if (api.ready) {
    return;
  }

  const pages = [];

  function sortPages() {
    pages.sort((left, right) => {
      const byOrder = (Number(left.order) || 0) - (Number(right.order) || 0);
      return byOrder || String(left.id).localeCompare(String(right.id));
    });
  }

  function register(page) {
    if (!page?.id) {
      return null;
    }

    const idx = pages.findIndex(item => item.id === page.id);
    if (idx >= 0) {
      pages[idx] = page;
    } else {
      pages.push(page);
    }
    sortPages();
    return page;
  }

  function list() {
    return pages.slice();
  }

  function get(id) {
    return pages.find(page => page.id === id) || null;
  }

  function categories() {
    return pages.map(page => ({
      id: page.id,
      name: page.name || page.id,
      desc: page.desc || "",
      order: Number(page.order) || 0,
      kind: "page",
      items: Object.freeze([]),
    }));
  }

  function styles() {
    return pages.map(page => page.style || "").filter(Boolean).join("\n");
  }

  async function load(ctx) {
    for (const page of pages) {
      if (typeof page.load === "function") {
        try {
          await page.load(ctx);
        } catch {
        }
      }
    }
  }

  Object.assign(api, {
    ready: true,
    register,
    list,
    get,
    categories,
    styles,
    load,
  });
})();
