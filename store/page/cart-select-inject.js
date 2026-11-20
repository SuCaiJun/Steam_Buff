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

  const REQ_EVT = "STStoreAccountCartRowsRequest";
  const RES_EVT = "STStoreAccountCartRowsResponse";
  const ROW_SEL = "[data-st-cart-line-id]";
  const SSR_CART_SEL = "#StoreTemplate section.jGMVnjZbmZM-";
  const SSR_LIST_SEL = ".I3wNTGX8W84-";
  const SSR_ROW_SEL = ".i-xXuvHLioU-";
  const SSR_EMPTY_SEL = ".i-xXuvHLioU-.zLoWY6fxr7Y- > .oQEHUcBaGvk- > .fDgifICDL4M-";
  const SSR_REMOVE_SEL = ".QQ50n6yPgT4- .BFDdk5e7x8k-[role='button']";

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

  function dataFrom(node) {
    let rt = null;
    for (let cur = fiber(node), i = 0; cur && i < 28; i++, cur = cur.return) {
      const props = currentProps(cur);
      if (!props || !props.lineItem?.line_item_id) continue;

      const item = props.storeItem || props.displayItem || props.validatedItem?.store_item || {};
      const line = props.lineItem;
      const valid = props.validatedItem || {};
      const id = String(line.line_item_id || "");
      const pkg = line.packageid;
      const bundle = line.bundleid;
      const kind = bundle ? "bundle" : "package";
      const itemId = String(bundle || pkg || "");
      const amount = valid.subtotal?.amount_in_cents;
      const cents = Number(amount);

      if (!id || !itemId) continue;
      if (typeof line.line_item_id !== "string" || !/^[1-9]\d*$/.test(id) || !/^[1-9]\d*$/.test(itemId)) continue;
      const priceReady = amount != null && amount !== "" && Number.isSafeInteger(cents) && cents >= 0;
      if (!priceReady && rt?.lineId === id && rt.cents != null) continue;

      rt = {
        lineId: id,
        kind,
        itemId,
        key: `${kind}:${itemId}`,
        packageid: pkg ? String(pkg) : "",
        bundleid: bundle ? String(bundle) : "",
        name: item.m_strName || item.name || props.purchaseOption?.purchase_option_name || "",
        price: valid.subtotal?.formatted_amount || "",
        cents: priceReady ? cents : null,
      };
    }
    return rt;
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
      return { items: [], lines: root.querySelector(SSR_EMPTY_SEL) ? [] : null };
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
      const info = dataFrom(row.querySelector(SSR_REMOVE_SEL) || row);
      if (!info) continue;
      if (lines && !matchesCartLine(info, expected.get(info.lineId))) continue;
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

    // This fingerprint changes when Steam changes its cart data, not when cards or prices mount.
    const identity = lines?.map(line => [line.line_item_id, line.packageid, line.bundleid,
      line.flags?.is_gift, line.flags?.is_private, line.gidcoupon_applied]);
    return { items, lines: identity ?? null };
  }

  function signedInAccount() {
    const user = window.UserConfig;
    return user?.logged_in === true && typeof user.steamid === "string" && /^\d{17}$/.test(user.steamid) ? user.steamid : null;
  }

  function accountCartRoute() {
    // The Store cart route receives cartID from its own SSR loader, even before checkout links mount.
    const data = window.SSR?.loaderData?.[1];
    if (typeof data !== "string") return null;
    const type = JSON.parse(data)?.cartID?.type;
    return typeof type === "string" ? type === "account" : null;
  }

  function checkLine(root, lineId, key) {
    const list = root.querySelector(SSR_LIST_SEL);
    const row = typeof lineId === "string" && /^[1-9]\d*$/.test(lineId)
      ? list?.querySelector(`${SSR_ROW_SEL}[data-st-cart-line-id="${lineId}"]`) : null;
    if (!row) return false;
    const item = dataFrom(row.querySelector(SSR_REMOVE_SEL) || row);
    if (item?.lineId !== lineId || item.key !== key) return false;
    const lines = ssrLines(list);
    if (!lines) return true;
    const matches = lines.filter(line => line?.line_item_id === lineId);
    return matches.length === 1 && matchesCartLine(item, matches[0]);
  }

  if (window.__stStoreAccountCartRowsReady) return;
  window.__stStoreAccountCartRowsReady = true;
  window.addEventListener(REQ_EVT, event => {
    const { id, lineId, key, accountOnly } = event.detail ?? {};
    if (typeof id !== "string") return;
    const root = document.querySelector(SSR_CART_SEL);
    let result = null;
    if (root) {
      if (accountOnly === true) result = accountCartRoute() === false ? null : signedInAccount();
      else if (lineId === undefined) result = { ...scanSsr(root), account: signedInAccount(), accountCart: accountCartRoute() };
      else result = checkLine(root, lineId, key);
    }
    window.dispatchEvent(new CustomEvent(RES_EVT, { detail: { id, result } }));
  });
})();
