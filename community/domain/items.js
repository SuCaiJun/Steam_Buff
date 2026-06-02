/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 社区物品数据处理
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STCommunity;
  if (!api || api.items) return;

  function invUrl() {
    const W = api.W;
    if (W.g_strInventoryLoadURL) return W.g_strInventoryLoadURL;
    let profile = `${location.origin}/my/`;
    if (W.g_strProfileURL) {
      profile = W.g_strProfileURL;
    } else {
      const avatar = api.dom.q("#global_actions a.user_avatar");
      if (avatar) profile = avatar.href;
    }
    return `${profile.replace(/\/$/, "")}/inventory/json/`;
  }

  function name(item) {
    if (!item) return null;
    return item.description?.market_hash_name ||
      item.description?.name ||
      item.market_hash_name ||
      item.name ||
      null;
  }

  function tags(item) {
    return item?.tags || item?.description?.tags || [];
  }

  function isCard(item) {
    if (!item) return false;
    if (tags(item).some((tag) => tag.category === "item_class" && tag.internal_name === "item_class_2")) {
      return true;
    }
    if ((item.owner_actions || []).some((act) => String(act.link || "").toLowerCase().includes("gamecards"))) {
      return true;
    }
    return String(item.type || "").toLowerCase().includes("trading card");
  }

  function isFoil(item) {
    if (!isCard(item)) return false;
    if (tags(item).some((tag) => tag.category === "cardborder" && tag.internal_name === "cardborder_1")) {
      return true;
    }
    if ((item.owner_actions || []).some((act) => {
      const link = String(act.link || "").toLowerCase();
      return link.includes("gamecards") && link.includes("border");
    })) {
      return true;
    }
    return String(item.type || "").toLowerCase().includes("foil trading card");
  }

  function isCrate(item) {
    return tags(item).some((tag) => tag.category === "Type" && tag.internal_name === "Supply Crate");
  }

  function canGoo(item) {
    return (item.owner_actions || []).some((act) => String(act.link || "").includes("GetGooValue"));
  }

  function canOpenBooster(item) {
    return (item.owner_actions || []).some((act) => String(act.link || "").includes("OpenBooster"));
  }

  function activeInv() {
    return api.W.g_ActiveInventory;
  }

  async function loadAllInv() {
    const main = activeInv();
    if (!main) return;
    const children = Object.values(main.m_rgChildInventories || {});
    for (const inv of [...children, main]) {
      if (typeof inv.LoadCompleteInventory === "function") {
        await new Promise((resolve) => {
          const rt = inv.LoadCompleteInventory();
          if (rt && typeof rt.done === "function") rt.done(resolve);
          else resolve();
        });
      }
    }
  }

  function flat(item, key) {
    if (!item || typeof item !== "object") return null;
    if (item.description) Object.assign(item, item.description);
    item.id = item.id || key;
    item.assetid = item.assetid || key;
    return item;
  }

  function invItems() {
    const main = activeInv();
    const arr = [];
    if (!main) return arr;

    for (const child of Object.values(main.m_rgChildInventories || {})) {
      for (const [key, item] of Object.entries(child.m_rgAssets || {})) {
        const out = flat(item, key);
        if (out) arr.push(out);
      }
    }
    for (const [key, item] of Object.entries(main.m_rgAssets || {})) {
      const out = flat(item, key);
      if (out) arr.push(out);
    }
    return arr;
  }

  function itemDom(item, trade = api.page === api.pages.TRADE) {
    const id = item.assetid || item.id;
    return document.getElementById(`${trade ? "item" : ""}${item.appid}_${item.contextid}_${id}`) ||
      item.element ||
      null;
  }

  function mark(item, color) {
    const el = itemDom(item, false);
    if (el) el.style.background = color;
  }

  api.items = {
    invUrl,
    name,
    tags,
    isCard,
    isFoil,
    isCrate,
    canGoo,
    canOpenBooster,
    activeInv,
    loadAllInv,
    flat,
    invItems,
    itemDom,
    mark,
  };
})();
