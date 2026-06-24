/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 购物车页面主上下文脚本
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const REQ_EVT = "STStoreCartSelectRequest";
  const RES_EVT = "STStoreCartSelectResponse";
  const ROW_SEL = "[data-st-cart-line-id]";
  const SCAN_LIMIT = 1800;
  const STEAM_API_HOST = document.currentScript?.dataset.steamApiHost || "";

  function reactKey(node) {
    return Object.keys(node || {}).find(key => key.startsWith("__reactFiber"));
  }

  function fiber(node) {
    const key = reactKey(node);
    return key ? node[key] : null;
  }

  function dataFrom(node) {
    let rt = null;
    for (let cur = fiber(node), i = 0; cur && i < 28; i++, cur = cur.return) {
      const props = cur.memoizedProps;
      if (!props || !props.lineItem?.line_item_id) continue;

      const item = props.storeItem || props.displayItem || props.validatedItem?.store_item || {};
      const line = props.lineItem;
      const valid = props.validatedItem || {};
      const id = String(line.line_item_id || "");
      const pkg = line.packageid || valid.item_id?.packageid || item.best_purchase_option?.packageid || 0;
      const bundle = line.bundleid || valid.item_id?.bundleid || item.best_purchase_option?.bundleid || 0;
      const kind = bundle ? "bundle" : "package";
      const itemId = String(bundle || pkg || "");

      if (!id || !itemId) continue;

      rt = {
        lineId: id,
        kind,
        itemId,
        key: `${kind}:${itemId}`,
        packageid: pkg ? String(pkg) : "",
        bundleid: bundle ? String(bundle) : "",
        name: item.m_strName || item.name || props.purchaseOption?.purchase_option_name || "",
        price: valid.subtotal?.formatted_amount || line.price_when_added?.formatted_amount || props.purchaseOption?.formatted_final_price || "",
        cents: Number(valid.subtotal?.amount_in_cents || line.price_when_added?.amount_in_cents || props.purchaseOption?.final_price_in_cents || 0),
      };
    }
    return rt;
  }

  function rowFor(node, info) {
    let row = node;
    while (row?.parentElement && dataFrom(row.parentElement)?.lineId === info.lineId) {
      row = row.parentElement;
    }
    return row || node;
  }

  function commonElement(nodes) {
    const items = nodes.filter(Boolean);
    if (items.length < 2) return null;
    let current = items[0];
    while (current && current !== document.body && current !== document.documentElement) {
      if (items.every(item => current.contains(item))) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function compactText(el) {
    return String(el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function scopedRoot() {
    return document.getElementById("responsive_page_template_content")
      || document.querySelector("main")
      || document.querySelector("[role='main']")
      || null;
  }

  function cartAnchors(root) {
    if (!root) return [];
    return Array.from(root.querySelectorAll("h1, h2, button, a, [role='button']"))
      .filter(el => /您的购物车|Your Cart|移除|Remove|支付|Checkout|Purchase|payment/i.test(compactText(el)));
  }

  function scanRoot() {
    const rows = Array.from(document.querySelectorAll(ROW_SEL));
    const rowRoot = rows.length > 1 ? commonElement(rows) : rows[0]?.parentElement;
    if (rowRoot) {
      return rowRoot;
    }

    const root = scopedRoot();
    const anchorRoot = commonElement(cartAnchors(root));
    return anchorRoot || root;
  }

  function scanNodes(root) {
    if (!root) return [];
    const nodes = [root];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    while (nodes.length < SCAN_LIMIT) {
      const node = walker.nextNode();
      if (!node) break;
      nodes.push(node);
    }
    return nodes;
  }

  function scan() {
    const seen = new Set();
    const items = [];

    scanNodes(scanRoot()).forEach(node => {
      const info = dataFrom(node);
      if (!info || seen.has(info.lineId)) return;

      const row = rowFor(node, info);
      if (!row || seen.has(info.lineId)) return;

      seen.add(info.lineId);
      row.dataset.stCartLineId = info.lineId;
      row.dataset.stCartKind = info.kind;
      row.dataset.stCartItemId = info.itemId;
      row.dataset.stCartKey = info.key;
      row.dataset.stCartName = info.name;
      row.dataset.stCartPrice = info.price;
      row.dataset.stCartCents = String(info.cents || 0);

      items.push(info);
    });

    return items;
  }

  function token() {
    if (!STEAM_API_HOST) return "";
    const entry = performance.getEntriesByType("resource")
      .map(item => item.name || "")
      .find(url => url.includes(`${STEAM_API_HOST}/`) && url.includes("access_token="));
    if (!entry) return "";

    try {
      return new URL(entry).searchParams.get("access_token") || "";
    } catch (error) {
      return "";
    }
  }

  function country() {
    try {
      const config = JSON.parse(document.documentElement.dataset.config || "{}");
      if (config.COUNTRY) return String(config.COUNTRY).toUpperCase();
    } catch (error) {
      void error;
    }

    const match = document.cookie.match(/steamCountry=([a-zA-Z]{2})/);
    return match ? match[1].toUpperCase() : "CN";
  }

  function rowByLine(lineId) {
    scan();
    return document.querySelector(`${ROW_SEL}[data-st-cart-line-id="${CSS.escape(String(lineId))}"]`);
  }

  function rowByKey(key) {
    scan();
    return document.querySelector(`${ROW_SEL}[data-st-cart-key="${CSS.escape(String(key))}"]`);
  }

  function removeButton(row) {
    const buttons = Array.from(row.querySelectorAll('[role="button"], button, a'));
    return buttons.find(btn => {
      const text = (btn.textContent || "").trim();
      return text === "移除" || text === "Remove";
    }) || null;
  }

  function waitFor(test, timeout = 10000) {
    const start = Date.now();
    return new Promise(resolve => {
      function tick() {
        if (test()) {
          resolve(true);
          return;
        }
        if (Date.now() - start >= timeout) {
          resolve(false);
          return;
        }
        setTimeout(tick, 150);
      }
      tick();
    });
  }

  async function removeLines(lineIds) {
    const removed = [];
    const failed = [];

    for (const lineId of lineIds) {
      const row = rowByLine(lineId);
      const btn = row ? removeButton(row) : null;
      if (!row || !btn) {
        failed.push(String(lineId));
        continue;
      }

      btn.click();
      const ok = await waitFor(() => !rowByLine(lineId));
      if (ok) {
        removed.push(String(lineId));
      } else {
        failed.push(String(lineId));
      }
    }

    return { removed, failed, items: scan() };
  }

  async function restoreItems(items) {
    const restored = [];
    const skipped = [];
    const failed = [];

    for (const item of items || []) {
      const key = item?.key || `${item?.kind}:${item?.itemId}`;
      if (!item?.kind || !item?.itemId || !key) continue;

      if (rowByKey(key)) {
        skipped.push(key);
        continue;
      }

      try {
        if (typeof window.AddItemToCart !== "function") {
          failed.push(key);
          continue;
        }

        if (item.kind === "bundle") {
          window.AddItemToCart(null, Number(item.itemId));
        } else {
          window.AddItemToCart(Number(item.itemId), undefined);
        }

        const ok = await waitFor(() => !!rowByKey(key), 12000);
        if (ok) {
          restored.push(key);
        } else {
          failed.push(key);
        }
      } catch (error) {
        failed.push(key);
      }
    }

    return { restored, skipped, failed, items: scan() };
  }

  async function handle(detail) {
    const id = detail?.id || "";
    const action = detail?.action || "scan";
    let result = null;
    let ok = true;
    let message = "";

    try {
      if (action === "remove") {
        result = await removeLines(detail.lineIds || []);
        ok = result.failed.length === 0;
      } else if (action === "restore") {
        result = await restoreItems(detail.items || []);
        ok = result.failed.length === 0;
      } else {
        result = { items: scan(), token: token(), country: country() };
      }
    } catch (error) {
      ok = false;
      message = error?.message || String(error || "unknown");
    }

    window.dispatchEvent(new CustomEvent(RES_EVT, {
      detail: { id, action, ok, message, result }
    }));
  }

  if (window.__stCartSelectPageReady) {
    scan();
    return;
  }

  window.__stCartSelectPageReady = true;
  window.addEventListener(REQ_EVT, event => {
    handle(event.detail).catch(() => {});
  });
  scan();
})();
