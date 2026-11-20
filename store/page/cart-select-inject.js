/*
 * @Author        : Ricky
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
  const SSR_CART_SEL = "#StoreTemplate section.jGMVnjZbmZM-";
  const SSR_LIST_SEL = ".I3wNTGX8W84-";
  const SSR_ROW_SEL = ".i-xXuvHLioU-";
  const SSR_EMPTY_SEL = ".i-xXuvHLioU-.zLoWY6fxr7Y- > .oQEHUcBaGvk- > .fDgifICDL4M-";
  const SSR_REMOVE_SEL = ".QQ50n6yPgT4- .BFDdk5e7x8k-[role='button']";
  const SCAN_LIMIT = 1800;

  function reactKey(node) {
    return Object.keys(node || {}).find(key => key.startsWith("__reactFiber"));
  }

  function fiber(node) {
    const key = reactKey(node);
    return key ? node[key] : null;
  }

  function reachesCurrentRoot(branch) {
    for (let depth = 0; branch && depth < 512; depth++, branch = branch.return) {
      if (!branch.return) return branch.tag === 3 && branch.stateNode?.current === branch;
    }
    return false;
  }

  function currentProps(branch) {
    const other = branch.alternate;
    if (!other || branch.memoizedProps === other.memoizedProps) return branch.memoizedProps;
    // 与 Steam 成就组件一样，父链不能唯一确认当前提交时不读取旧 props
    const first = reachesCurrentRoot(branch);
    const second = reachesCurrentRoot(other);
    return first === second ? null : (first ? branch : other).memoizedProps;
  }

  function dataFrom(node, ssr = false) {
    let rt = null;
    for (let cur = fiber(node), i = 0; cur && i < 28; i++, cur = cur.return) {
      const props = ssr ? currentProps(cur) : cur.memoizedProps;
      if (!props || !props.lineItem?.line_item_id) continue;

      const item = props.storeItem || props.displayItem || props.validatedItem?.store_item || {};
      const line = props.lineItem;
      const valid = props.validatedItem || {};
      const id = String(line.line_item_id || "");
      const pkg = ssr ? line.packageid : line.packageid || valid.item_id?.packageid || item.best_purchase_option?.packageid || 0;
      const bundle = ssr ? line.bundleid : line.bundleid || valid.item_id?.bundleid || item.best_purchase_option?.bundleid || 0;
      const kind = bundle ? "bundle" : "package";
      const itemId = String(bundle || pkg || "");
      const amount = ssr ? valid.subtotal?.amount_in_cents
        : valid.subtotal?.amount_in_cents ?? line.price_when_added?.amount_in_cents ?? props.purchaseOption?.final_price_in_cents;
      const cents = Number(amount);

      if (!id || !itemId) continue;
      if (ssr && (typeof line.line_item_id !== "string" || !/^\d+$/.test(id) || !/^[1-9]\d*$/.test(itemId))) continue;
      const priceReady = amount != null && amount !== "" && Number.isSafeInteger(cents) && cents >= 0;
      if (ssr && !priceReady && rt?.lineId === id && rt.cents != null) continue;

      rt = {
        lineId: id,
        kind,
        itemId,
        key: `${kind}:${itemId}`,
        packageid: pkg ? String(pkg) : "",
        bundleid: bundle ? String(bundle) : "",
        name: item.m_strName || item.name || props.purchaseOption?.purchase_option_name || "",
        price: valid.subtotal?.formatted_amount || line.price_when_added?.formatted_amount || props.purchaseOption?.formatted_final_price || "",
        cents: ssr ? (priceReady ? cents : null) : cents || 0,
      };
      if (ssr) rt.canRestore = !line.flags?.is_gift && !line.flags?.is_private && !valid.coupon_applied
        && ![line, valid].some(value => value.gidcoupon_applied && value.gidcoupon_applied !== "0");
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

  function markRow(row, info) {
    if (row.dataset.stCartLineId !== info.lineId) row.dataset.stCartLineId = info.lineId;
    row.dataset.stCartKind = info.kind;
    row.dataset.stCartItemId = info.itemId;
    row.dataset.stCartKey = info.key;
    row.dataset.stCartName = info.name;
    row.dataset.stCartPrice = info.price;
    if (info.cents === null) delete row.dataset.stCartCents;
    else row.dataset.stCartCents = String(info.cents);
    return info;
  }

  function clearStaleSsrRows(root, currentRows) {
    for (const row of root.querySelectorAll(ROW_SEL)) {
      if (currentRows?.has(row)) continue;
      const data = row.dataset;
      delete data.stCartLineId;
      delete data.stCartKind;
      delete data.stCartItemId;
      delete data.stCartKey;
      delete data.stCartName;
      delete data.stCartPrice;
      delete data.stCartCents;
    }
  }

  function ssrLines(list) {
    // Steam 的列表组件持有完整 lineItems，商品卡片可能仍在等待商品和价格数据
    for (let cur = fiber(list), i = 0; cur && i < 28; i++, cur = cur.return) {
      const props = currentProps(cur);
      if (Array.isArray(props?.lineItems)) return props.lineItems;
    }
    return null;
  }

  function matchesCartLine(info, line) {
    return !!line && info.bundleid === String(line.bundleid || "")
      && info.packageid === String(line.packageid || "");
  }

  function scanSsr(root) {
    const list = root.querySelector(SSR_LIST_SEL);
    if (!list) {
      clearStaleSsrRows(root);
      return { items: [], complete: !!root.querySelector(SSR_EMPTY_SEL) };
    }
    const lines = ssrLines(list);
    const expected = new Map();
    for (const line of lines ?? []) {
      const id = line?.line_item_id;
      expected.set(id, expected.has(id) ? null : line);
    }
    const rows = list.querySelectorAll(SSR_ROW_SEL);
    const entries = new Map();
    for (const row of rows) {
      const info = dataFrom(row.querySelector(SSR_REMOVE_SEL) || row, true);
      if (!info) continue;
      if (!matchesCartLine(info, expected.get(info.lineId))) continue;
      entries.set(info.lineId, entries.has(info.lineId) ? null : { row, info });
    }

    const items = [];
    const currentRows = new Set();
    for (const entry of entries.values()) {
      if (!entry) continue;
      currentRows.add(entry.row);
      items.push(markRow(entry.row, entry.info));
    }
    clearStaleSsrRows(root, currentRows);

    const complete = !!lines?.length && rows.length === lines.length && items.length === lines.length
      && items.every(item => item.cents !== null);
    return { items, complete };
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

  function scanLegacy() {
    const seen = new Set();
    const items = [];

    scanNodes(scanRoot()).forEach(node => {
      const info = dataFrom(node);
      if (!info || seen.has(info.lineId)) return;

      const row = rowFor(node, info);
      if (!row || seen.has(info.lineId)) return;

      seen.add(info.lineId);
      items.push(markRow(row, info));
    });

    return items;
  }

  function snapshot() {
    const root = document.querySelector(SSR_CART_SEL);
    if (root) return scanSsr(root);
    return { items: scanLegacy() };
  }

  function checkSsrLine(lineId, key) {
    const root = document.querySelector(SSR_CART_SEL);
    const list = root?.querySelector(SSR_LIST_SEL);
    const row = list?.querySelector(`${SSR_ROW_SEL}[data-st-cart-line-id="${CSS.escape(lineId)}"]`);
    if (!row) return false;
    const info = dataFrom(row.querySelector(SSR_REMOVE_SEL) || row, true);
    if (!info || info.lineId !== lineId || info.key !== key) return false;
    let match;
    for (const line of ssrLines(list) ?? []) {
      if (line?.line_item_id !== lineId) continue;
      if (match) return false;
      match = line;
    }
    return matchesCartLine(info, match);
  }

  function scan() {
    const result = snapshot();
    if (result.complete === false) {
      throw Object.assign(new Error("Steam cart lines are not ready"), { code: "CART_ITEMS_UNAVAILABLE" });
    }
    return result.items;
  }

  function rowByLine(lineId) {
    const items = scan();
    const item = items.find(item => item.lineId === String(lineId));
    if (!item) return null;
    // Steam 原生设置可以在暂存等待期间变化，移除前重新校验当前行是否能还原
    if (item.canRestore === false || (item.canRestore === true && items.some(other => other !== item && other.key === item.key))) {
      throw new Error("购物车商品已变化，请核对后重试。");
    }
    return document.querySelector(`${ROW_SEL}[data-st-cart-line-id="${CSS.escape(String(lineId))}"]`);
  }

  function rowByKey(key) {
    scan();
    return document.querySelector(`${ROW_SEL}[data-st-cart-key="${CSS.escape(String(key))}"]`);
  }

  function removeButton(row) {
    if (row.matches(SSR_ROW_SEL)) return row.querySelector(SSR_REMOVE_SEL);
    const buttons = Array.from(row.querySelectorAll('[role="button"], button, a'));
    return buttons.find(btn => {
      const text = (btn.textContent || "").trim();
      return text === "移除" || text === "Remove";
    }) || null;
  }

  async function waitFor(test, timeout, signal) {
    const start = Date.now();
    while (true) {
      signal.throwIfAborted();
      if (test()) return true;
      if (Date.now() - start >= timeout) return false;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }

  function signedInAccount() {
    const user = window.UserConfig;
    return user?.logged_in === true && typeof user.steamid === "string" && /^\d{17}$/.test(user.steamid) ? user.steamid : null;
  }

  function checkAccount(expected) {
    if (!expected || signedInAccount() !== expected) {
      throw Object.assign(new Error("Steam 购物车账号未确认或已切换"), { code: "CART_ACCOUNT_CHANGED" });
    }
  }

  async function removeLines(lineIds, account, signal) {
    const removed = [];
    const failed = [];

    for (const lineId of lineIds) {
      signal.throwIfAborted();
      checkAccount(account);
      const row = rowByLine(lineId);
      const btn = row ? removeButton(row) : null;
      if (!row || !btn) {
        failed.push(String(lineId));
        continue;
      }

      btn.click();
      const ok = await waitFor(() => {
        checkAccount(account);
        const current = snapshot();
        return current.complete !== false && !current.items.some(item => item.lineId === String(lineId));
      }, 10000, signal);
      if (ok) {
        removed.push(String(lineId));
      } else {
        failed.push(String(lineId));
      }
    }

    checkAccount(account);
    return { removed, failed, items: scan() };
  }

  async function restoreItems(items, account, signal) {
    const restored = [];
    const skipped = [];
    const failed = [];

    for (const item of items || []) {
      signal.throwIfAborted();
      checkAccount(account);
      const key = item?.key || `${item?.kind}:${item?.itemId}`;
      if (!item?.kind || !item?.itemId || !key) continue;

      if (rowByKey(key)) {
        skipped.push(key);
        continue;
      }

      if (typeof window.AddItemToCart !== "function") {
        failed.push(key);
        continue;
      }
      if (item.kind === "bundle") {
        window.AddItemToCart(null, Number(item.itemId));
      } else {
        window.AddItemToCart(Number(item.itemId), undefined);
      }
      const ok = await waitFor(() => !!rowByKey(key), 12000, signal);
      if (ok) {
        restored.push(key);
      } else {
        failed.push(key);
      }
    }

    checkAccount(account);
    return { restored, skipped, failed, items: scan() };
  }

  async function handle(action, detail, signal) {
    if (action === "check-line") return { valid: checkSsrLine(detail.lineId, detail.key) };
    if (action === "remove") return removeLines(detail.lineIds || [], detail.accountSteamId, signal);
    if (action === "restore") return restoreItems(detail.items || [], detail.accountSteamId, signal);
    return { ...snapshot(), accountSteamId: signedInAccount() };
  }

  if (window.__stCartSelectPageReady) {
    snapshot();
    return;
  }

  const operations = new Map();
  window.__stCartSelectPageReady = true;
  window.addEventListener(REQ_EVT, event => {
    const detail = event.detail;
    const id = detail?.id || "";
    const action = detail?.action || "scan";
    if (action === "cancel") {
      operations.get(id)?.abort();
      return;
    }
    const controller = action === "remove" || action === "restore" ? new AbortController() : null;
    if (controller) operations.set(id, controller);
    const reply = response => window.dispatchEvent(new CustomEvent(RES_EVT, { detail: { id, action, ...response } }));
    handle(action, detail, controller?.signal).then(
      result => reply({ ok: !result.failed?.length, result, message: "" }),
      error => reply({
        ok: false, result: null, message: error?.message || String(error), code: error?.code,
        error: { name: error?.name, stack: error?.stack },
      })
    ).finally(() => {
      if (controller && operations.get(id) === controller) operations.delete(id);
    });
  });
  snapshot();
})();
