/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : DLC 列表扫描逻辑
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  function priceText(row) {
    const priceNode = row.querySelector(".discount_final_price")
                   || row.querySelector(".game_area_dlc_price")
                   || row.querySelector("[class*='price']");
    const text = priceNode ? priceNode.textContent.trim() : "";
    return text || row.textContent.trim();
  }

  function isFree(row) {
    const text = priceText(row);
    return text.includes('免费')
        || text.includes('免費')
        || /\bfree\b/i.test(text)
        || text.includes('無料');
  }

  function isOwned(row) {
    const ownedText = row.querySelector('.ds_flag.ds_owned_flag, .ds_owned_flag, [class*="owned"]')?.textContent || '';
    return row.classList.contains("ds_owned")
        || row.querySelector('.ds_flag.ds_owned_flag, .ds_owned_flag') !== null
        || ownedText.includes('已在库中')
        || ownedText.includes('已拥有')
        || /\bin library\b/i.test(ownedText)
        || /\balready owned\b/i.test(ownedText);
  }

  function isWishlisted(row) {
    return row.classList.contains("ds_wishlist")
        || row.querySelector('.ds_flag.ds_wishlist_flag, .ds_wishlist_flag') !== null;
  }

  function cartablePaid(row) {
    return !!row.querySelector("input[name^=subid]")
        && !isOwned(row)
        && !isFree(row);
  }

  function cartableNonFree(row) {
    return !!row.querySelector("input[name^=subid]")
        && !isFree(row);
  }

  function rowUrl(row) {
    if (row.href) return row.href;
    const link = row.querySelector('a[href*="/app/"]');
    return link ? link.href : "";
  }

  function rowName(row) {
    const nameNode = row.querySelector(".game_area_dlc_name")
                  || row.querySelector(".tab_item_name")
                  || row.querySelector("h4");
    const rawName = nameNode ? nameNode.textContent.trim() : row.textContent.trim();
    return rawName.replace(/\s+(免费|免費|Free|FREE|無料)\s*$/, '').trim() || '未知项目';
  }

  function appidFromUrl(url) {
    const match = String(url || '').match(/\/app\/(\d+)/);
    return match ? match[1] : '';
  }

  function freeRows(section) {
    const seen = new Set();
    const result = [];
    section.querySelectorAll(".game_area_dlc_row").forEach(row => {
      if (isOwned(row)) return;
      if (!isFree(row)) return;

      const url = rowUrl(row);
      if (!url || seen.has(url)) return;

      seen.add(url);
      result.push({
        url,
        name: rowName(row),
        appid: appidFromUrl(url)
      });
    });
    return result;
  }

  api.features.dlcScan = Object.freeze({
    freeRows,
    isOwned,
    isWishlisted,
    cartablePaid,
    cartableNonFree,
  });
})();
