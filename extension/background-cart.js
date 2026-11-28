/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 账号购物车请求与暂存结算
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，允许二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

(() => {
  "use strict";

  const cart = globalThis.STCartRestore;
  const methods = globalThis.STConfig.vendors.steamStore.cartMethods;
  const origin = globalThis.STConfig.vendors.steamStore.origin;
  const running = new Set();
  const log = globalThis.STLoggerFactory.createLogger("store", "cart-select");
  let writes = Promise.resolve();

  // Steam BrowserAPI uses binary protobuf and binds auth to the Store document's cookies.
  function integer(value) {
    const bytes = [];
    let rest = BigInt(value);
    do {
      const next = rest >> 7n;
      bytes.push(Number(rest & 127n) | (next ? 128 : 0));
      rest = next;
    } while (rest);
    return bytes;
  }

  const numberField = (tag, value) => [tag * 8, ...integer(value)];
  const bytesField = (tag, value) => [tag * 8 + 2, ...integer(value.length), ...value];
  const countryBytes = country => new TextEncoder().encode(country);
  const removeBody = (country, lineId) => [...numberField(1, lineId), ...bytesField(2, countryBytes(country))];
  const addBody = (country, items) => [...bytesField(1, countryBytes(country)),
    ...items.flatMap(item => bytesField(2, numberField(item.kind === "bundle" ? 2 : 1, item.itemId)))];

  function fields(bytes) {
    const result = [];
    let offset = 0;
    function readInteger() {
      let value = 0n;
      for (let shift = 0n; shift <= 63n && offset < bytes.length; shift += 7n) {
        const byte = bytes[offset++];
        value |= BigInt(byte & 127) << shift;
        if (!(byte & 128) && value <= 0xffffffffffffffffn) return value;
      }
      throw new TypeError("Steam 购物车 protobuf 整数格式无效");
    }
    while (offset < bytes.length) {
      const key = readInteger();
      const tag = Number(key >> 3n);
      const wire = Number(key & 7n);
      if (!tag || tag > 0x1fffffff) throw new TypeError("Steam 购物车 protobuf 字段无效");
      if (wire === 0) {
        result.push({ tag, wire, value: readInteger() });
        continue;
      }
      const length = wire === 2 ? Number(readInteger()) : wire === 1 ? 8 : wire === 5 ? 4 : -1;
      if (length < 0 || length > bytes.length - offset) throw new TypeError("Steam 购物车 protobuf 长度无效");
      result.push({ tag, wire, value: bytes.subarray(offset, offset + length) });
      offset += length;
    }
    return result;
  }

  function decode(bytes, field = 1, details) {
    const carts = fields(Uint8Array.from(bytes)).filter(entry => entry.tag === field);
    if (carts.length !== 1 || carts[0].wire !== 2) throw new Error("Steam 未返回购物车清单");
    const lines = new Map();
    const contents = fields(carts[0].value);
    const displayed = new Map();
    for (const row of details || []) displayed.set(row.lineId, displayed.has(row.lineId) ? null : row);
    for (const entry of contents) {
      if (entry.tag !== 1) continue;
      if (entry.wire !== 2) throw new TypeError("Steam 购物车行格式无效");
      const parts = fields(entry.value);
      const read = (tag, wire) => {
        const matches = parts.filter(part => part.tag === tag);
        if (!matches.length) return undefined;
        if (matches.length !== 1 || matches[0].wire !== wire) throw new TypeError("Steam 购物车行字段格式无效");
        return matches[0].value;
      };
      const lineId = read(1, 0)?.toString();
      const packageId = read(3, 0) || 0n;
      const bundleId = read(4, 0) || 0n;
      if (!cart.validLineId(lineId) || lines.has(lineId) || !!packageId === !!bundleId || packageId > 0xffffffffn || bundleId > 0xffffffffn) {
        throw new TypeError("Steam 购物车行身份无效或重复");
      }
      const kind = bundleId ? "bundle" : "package";
      const itemId = String(bundleId || packageId);
      const gift = read(12, 2);
      const flags = read(13, 2);
      const activeFlags = flags ? fields(flags).filter(flag => flag.wire !== 0 || flag.value !== 0n) : [];
      const coupon = read(14, 0) || 0n;
      const canRestore = !gift?.length && !activeFlags.length && !coupon;
      const identity = JSON.stringify([kind, itemId, String(read(2, 0) || 0n), String(coupon), Array.from(gift || []),
        activeFlags.map(flag => [flag.tag, flag.wire, flag.wire === 0 ? String(flag.value) : Array.from(flag.value)])]);
      const line = { lineId, kind, itemId, key: kind + ":" + itemId, identity, canRestore };
      if (details) {
        const row = displayed.get(lineId);
        if (row?.kind === kind && row.itemId === itemId) {
          if (row.name) line.name = row.name;
          if (row.price) line.price = row.price;
        }
        const previousPrice = read(11, 2);
        if (previousPrice) line.priceWhenAdded = decodeSubtotal(previousPrice);
        if (gift?.length || activeFlags.some(flag => flag.tag === 1 && flag.value === 1n)) line.gift = true;
        if (activeFlags.some(flag => flag.tag === 2 && flag.value === 1n)) line.privatePurchase = true;
        if (coupon) line.coupon = true;
      }
      lines.set(lineId, line);
    }
    const subtotal = details && contents.find(entry => entry.tag === 2 && entry.wire === 2);
    return { lines, ...(subtotal && { subtotal: decodeSubtotal(subtotal.value) }) };
  }

  function decodeSubtotal(bytes) {
    const parts = fields(bytes);
    const amount = parts.find(part => part.tag === 1 && part.wire === 0)?.value ?? 0n;
    const currencyCode = Number(parts.find(part => part.tag === 2 && part.wire === 0)?.value);
    const display = parts.find(part => part.tag === 3 && part.wire === 2)?.value;
    if (amount > BigInt(Number.MAX_SAFE_INTEGER) || !Number.isSafeInteger(currencyCode) || currencyCode <= 0 || !display?.length) return undefined;
    return { amount: Number(amount), currencyCode, formatted: new TextDecoder().decode(display) };
  }

  function sameLines(before, after) {
    return before.size === after.size && [...before].every(([id, line]) => after.get(id)?.identity === line.identity);
  }

  async function requestCart(execScript, sender, account, signal, method, country, body, claimLegacy, commerce) {
    if (signal?.aborted) {
      throw Object.assign(new Error("购物车请求已取消", { cause: signal.reason }), { beforeRequest: true });
    }
    const [injection] = await execScript({
      target: { tabId: sender.tab.id, documentIds: [sender.documentId] }, world: "MAIN",
      args: [origin, account, method ? methods[method] : null, country || null, body || null, claimLegacy, commerce ?? null],
      func: async (expectedOrigin, account, path, country, body, claimLegacy, commerce) => {
        const currentCountry = () => {
          const user = window.UserConfig;
          if (location.origin !== expectedOrigin || !/^\/cart\/?$/.test(location.pathname)
            || user?.logged_in !== true || user.steamid !== account
            || typeof user.country_code !== "string" || !/^[a-z]{2}$/i.test(user.country_code)) return null;
          return user.country_code.toUpperCase();
        };
        const initialCountry = currentCountry();
        if (!initialCountry || (country && country !== initialCountry)) return { changed: true, beforeRequest: true };
        if (!path) return { country: initialCountry };
        const options = { credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) };
        const proofKey = Symbol.for("SteamBuff.cart-preflight");
        const steamSession = () => document.cookie.match(/(?:^|;\s*)sessionid=([^;]+)/)?.[1];
        const initialSession = commerce && steamSession();
        const binding = commerce && window[Symbol.for("SteamBuff.cart-commerce-session")];
        const current = () => currentCountry() === initialCountry && (!commerce || binding?.id === commerce.binding &&
          binding.current() && steamSession() === initialSession);
        if (!current()) return { changed: true, beforeRequest: true };
        function sessionFailure(error) {
          // The injection result cannot carry an Error object. Keep its frames without copying response text.
          const message = error.name === "SyntaxError" ? "Steam 购物车会话格式无效" : error.message;
          return { beforeRequest: true, transportError: { name: error.name, message, frames: error.stack?.split("\n").slice(1) } };
        }
        let legacyProof = null;
        if (commerce?.commit) {
          const proof = window[proofKey];
          if (!proof || proof.id !== commerce.commit || proof.path !== path || proof.body !== body.join(",") || Date.now() >= proof.expiresAt)
            return { expired: true, beforeRequest: true };
          delete window[proofKey];
          if (!proof.current()) return { changed: true, beforeRequest: true };
        } else {
          // UserConfig in a background tab can outlive a Steam sign-in change in another tab.
          const session = await (async () => {
            const page = await fetch(new URL("/cart/", expectedOrigin), {
              ...options,
              headers: { "x-valve-request-type": "routeData", "x-valve-loader-index": "0" },
            });
            if (!page.ok || page.headers.get("x-valve-response-type") !== "routeData") return { status: page.status, beforeRequest: true };
            return { config: JSON.parse(await page.text()) };
          })().catch(sessionFailure);
          if (session.beforeRequest) return session;
          const { config } = session;
          if (config?.steamid !== account || config.storeBrowseContext?.country?.toUpperCase() !== initialCountry || !current()) {
            return { changed: true, beforeRequest: true };
          }
          if (claimLegacy && typeof config.strWebAPIToken === "string" && config.strWebAPIToken) {
            const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(config.strWebAPIToken));
            legacyProof = Array.from(new Uint8Array(digest)).join(",");
          }
        }
        const url = new URL(path, expectedOrigin);
        const headers = { Accept: "application/octet-stream" };
        options.headers = headers;
        if (body) {
          headers["Content-Type"] = "application/octet-stream";
          options.method = "POST";
          options.body = Uint8Array.from(body);
        } else {
          // GetCart request contains only field 1 (user_country).
          url.searchParams.set("input_protobuf_encoded", btoa(`\x0a\x02${initialCountry}`));
        }
        const response = await fetch(url, options);
        if (!response.ok || response.headers.get("x-eresult") !== "1"
          || !response.headers.get("content-type")?.startsWith("application/octet-stream")) return { status: response.status };
        const bytes = Array.from(new Uint8Array(await response.arrayBuffer()));
        if (!current()) return { changed: true };
        if (commerce?.prepare) {
          if (!initialSession) return { sessionRequired: true, beforeRequest: true };
          const ttl = 5000, expiresAt = Date.now() + ttl;
          const prep = commerce.prepare;
          const proof = { id: prep.id, path: prep.path, body: prep.body.join(","), expiresAt, current };
          Object.defineProperty(window, proofKey, { configurable: true, value: proof });
          AbortSignal.timeout(ttl).addEventListener("abort", () => {
            if (window[proofKey] === proof) delete window[proofKey];
          }, { once: true });
        }
        const rows = commerce?.readRows && Array.from(
          document.querySelectorAll("#StoreTemplate section.jGMVnjZbmZM- [data-st-cart-line-id]"), row => {
            const { stCartLineId, stCartKind, stCartItemId, stCartName, stCartPrice, stCartCents } = row.dataset;
            const amount = stCartCents === undefined ? null : Number(stCartCents);
            return { lineId: stCartLineId, kind: stCartKind, itemId: stCartItemId, name: stCartName,
              ...(stCartPrice && { price: { formatted: stCartPrice, amount: Number.isSafeInteger(amount) && amount >= 0 ? amount : null } }) };
          });
        return { bytes, country: initialCountry, legacyProof, rows };
      },
    });
    signal?.throwIfAborted();
    const reply = injection?.result;
    if (reply?.transportError) {
      const { name, message, frames } = reply.transportError;
      const cause = Object.assign(new Error(message), { name });
      if (frames?.length) cause.stack = [`${name}: ${message}`, ...frames].join("\n");
      throw Object.assign(new Error("Steam 购物车会话读取失败", { cause }), { beforeRequest: true });
    }
    if (reply?.changed) throw Object.assign(new Error("Steam 购物车账号或地区已变更"), { beforeRequest: reply.beforeRequest, accountChanged: true });
    if (reply?.expired) throw Object.assign(new Error("Steam 购物车预检已过期，请重新确认"), { beforeRequest: true, expired: true });
    if (reply?.sessionRequired) throw Object.assign(new Error("Steam 购物车缺少当前登录会话，请刷新购物车页面"), { beforeRequest: true });
    if (!reply?.country || (method && !Array.isArray(reply.bytes))) {
      throw Object.assign(new Error("Steam 未确认购物车请求"), { status: reply?.status, beforeRequest: reply?.beforeRequest });
    }
    return method ? { country: reply.country, ...decode(reply.bytes, method === "add" ? 2 : 1, reply.rows), legacyProof: reply.legacyProof } : reply;
  }

  async function openForCommerce(execScript, expectedSteamId, signal) {
    const [tab] = (await chrome.tabs.query({ url: origin + "/cart/*" })).sort((a, b) => Number(b.active) - Number(a.active));
    signal.throwIfAborted();
    if (!tab) return null;
    const [injection] = await execScript({ target: { tabId: tab.id }, world: "MAIN", args: [origin], func: expectedOrigin => {
      const user = window.UserConfig;
      if (location.origin !== expectedOrigin || !/^\/cart\/?$/.test(location.pathname) || user?.logged_in !== true ||
        typeof user.country_code !== "string") return null;
      const steamId = user.steamid, country = user.country_code.toUpperCase();
      const session = () => document.cookie.match(/(?:^|;\s*)sessionid=([^;]+)/)?.[1];
      const original = session();
      const key = Symbol.for("SteamBuff.cart-commerce-session");
      if (!window[key]?.current()) {
        const current = () => location.origin === expectedOrigin && /^\/cart\/?$/.test(location.pathname) &&
          window.UserConfig?.logged_in === true && window.UserConfig.steamid === steamId &&
          window.UserConfig.country_code?.toUpperCase() === country && session() === original;
        Object.defineProperty(window, key, { configurable: true, value: { id: crypto.randomUUID(), current } });
      }
      return { steamId, country, binding: window[key].id };
    } });
    const { steamId, country, binding } = injection?.result ?? {};
    if (!injection?.documentId || !binding || !cart.validAccount(steamId) || !/^[A-Z]{2}$/.test(country) ||
      (expectedSteamId && expectedSteamId !== steamId)) return null;
    const sender = { tab, documentId: injection.documentId };
    const target = { tabId: tab.id, documentIds: [injection.documentId] };
    const call = (method, body, options) => requestCart(execScript, sender, steamId, signal, method, country, body, false, { ...options, binding });
    async function checkDocument(refresh) {
      signal.throwIfAborted();
      const [update] = await execScript({ target, world: "MAIN", args: [binding, refresh], func: (id, reload) => {
        const current = window[Symbol.for("SteamBuff.cart-commerce-session")];
        if (current?.id !== id || !current.current()) return false;
        if (reload) location.reload();
        return true;
      } });
      return update?.result === true;
    }
    return { steamId, country, binding, target,
      read: prepare => call("get", null, { prepare, readRows: true }),
      commit: transaction => call(transaction.method, transaction.body, { commit: transaction.id }),
      isCurrent: () => checkDocument(false),
      refresh: () => checkDocument(true),
    };
  }

  function transaction(country, method, item) {
    const body = method === "add" ? addBody(country, [item]) : removeBody(country, item.lineId);
    return { id: crypto.randomUUID(), method, path: methods[method], body };
  }

  const accountBatches = (raw, account) => cart.records(raw[cart.KEY]).filter(batch => batch.accountSteamId === account);
  async function holds(account) {
    const raw = await chrome.storage.local.get(cart.KEY);
    return accountBatches(raw, account).map(batch => ({ status: batch.state,
      items: batch.items.filter(item => !["planned", "present"].includes(item.phase))
        .map(({ kind, itemId, phase }) => ({ kind, itemId, phase })) }));
  }

  async function withAccount(account, run) {
    if (running.has(account)) return { status: "busy" };
    running.add(account);
    try { return await run(); } finally { running.delete(account); }
  }

  function write(change) {
    const task = writes.then(async () => {
      const raw = await chrome.storage.local.get([cart.KEY, cart.SELECTION_KEY, cart.LEGACY_SELECTION_KEY]);
      const patch = change(raw);
      if (patch) await chrome.storage.local.set(patch);
    });
    writes = task.then(() => undefined, () => undefined);
    return task;
  }

  function updateBatch(id, next) {
    return write(raw => {
      const records = cart.records(raw[cart.KEY]).filter(batch => batch.id !== id);
      if (next) records.push(next);
      return { [cart.KEY]: records };
    });
  }

  async function claimBatches(account, candidates, proof) {
    const updates = new Map();
    for (const entry of candidates) {
      let digest = entry.sessionProof;
      if (typeof entry.token === "string" && entry.token) {
        digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(entry.token)))).join(",");
      }
      const { token, sessionProof, ...record } = entry;
      if (typeof digest === "string" && digest && digest === proof) updates.set(entry.id, { ...record, accountSteamId: account });
      else if (typeof token === "string" && digest) updates.set(entry.id, { ...record, sessionProof: digest });
    }
    if (updates.size) await write(raw => ({ [cart.KEY]: cart.records(raw[cart.KEY]).map(batch =>
      Object.hasOwn(batch, "accountSteamId") ? batch : updates.get(batch.id) || batch) }));
  }

  async function view(account, snapshot) {
    const raw = await chrome.storage.local.get([cart.KEY, cart.SELECTION_KEY, cart.LEGACY_SELECTION_KEY]);
    const legacy = raw[cart.LEGACY_SELECTION_KEY];
    const excluded = (raw[cart.SELECTION_KEY]?.[account] || []).filter(id => snapshot.lines.has(id)).sort();
    const keys = [...snapshot.lines].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    const identity = JSON.stringify([snapshot.country, keys.map(([id, line]) => [id, line.identity])]);
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
    const batches = accountBatches(raw, account);
    return {
      account,
      revision: Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join(""),
      lines: [...snapshot.lines.values()].map(({ lineId, kind, itemId, key }) => ({ lineId, kind, itemId, key })),
      excluded,
      migration: [...snapshot.lines.values()].filter(line => legacy?.[line.key] === false).length,
      held: batches.reduce((sum, batch) => sum + batch.items.filter(item => !["planned", "present"].includes(item.phase)).length, 0),
      reviewItems: batches.flatMap(batch => batch.items.filter(item => item.phase === "uncertain" || item.phase === "adding")
        .map(({ kind, itemId }) => ({ kind, itemId }))),
      hasBatch: batches.length !== 0,
      batchIds: batches.map(batch => batch.id).sort(),
    };
  }

  async function selection(account, snapshot, action, lineId, checked) {
    let excluded;
    await write(raw => {
      const all = raw[cart.SELECTION_KEY] || {};
      const ids = new Set((all[account] || []).filter(id => !snapshot || snapshot.lines.has(id)));
      const legacy = { ...raw[cart.LEGACY_SELECTION_KEY] };
      if (action === "toggle") {
        if (checked) ids.delete(lineId);
        else ids.add(lineId);
      } else if (action === "all") {
        ids.clear();
      } else if (action === "none" || action === "invert") {
        for (const id of snapshot.lines.keys()) {
          if (action === "invert" && ids.has(id)) ids.delete(id);
          else ids.add(id);
        }
      } else {
        for (const line of snapshot.lines.values()) {
          if (legacy[line.key] !== false) continue;
          if (action === "migrate") ids.add(line.lineId);
        }
        for (const line of snapshot.lines.values()) delete legacy[line.key];
      }
      excluded = [...ids].sort();
      return { [cart.SELECTION_KEY]: { ...all, [account]: excluded }, [cart.LEGACY_SELECTION_KEY]: legacy };
    });
    return excluded;
  }

  async function prepare(request, sender, snapshot, current, call) {
    if (current.hasBatch) return { status: "held", view: current };
    const excluded = new Set(current.excluded);
    if (excluded.size === snapshot.lines.size) return { status: "empty", view: current };
    if (!excluded.size) return { status: "ready", view: current };
    const pending = [...snapshot.lines.values()].filter(line => excluded.has(line.lineId));
    if (pending.some(line => !line.canRestore) || new Set([...snapshot.lines.values()].map(line => line.key)).size !== snapshot.lines.size) {
      return { status: "unsupported", view: current };
    }
    const expected = new Map(snapshot.lines);
    const batch = {
      id: crypto.randomUUID(), createdAt: Date.now(), accountSteamId: request.accountSteamId,
      tabId: sender.tab.id, state: "removing",
      items: pending.map(({ key, kind, itemId, lineId }) => ({ key, kind, itemId, lineId, phase: "planned" })),
    };
    await updateBatch(batch.id, batch);
    let attempting;
    try {
      for (const item of batch.items) {
        request.signal?.throwIfAborted();
        item.phase = "uncertain";
        attempting = item;
        await updateBatch(batch.id, batch);
        const body = removeBody(snapshot.country, item.lineId);
        const actual = await call("remove", snapshot.country, body);
        expected.delete(item.lineId);
        item.phase = actual.lines.has(item.lineId) ? "present" : "removed";
        if (!sameLines(expected, actual.lines)) throw new Error("Steam 移除后的购物车与预期不一致");
        await updateBatch(batch.id, batch);
        attempting = null;
      }
      const final = await call("get", snapshot.country);
      if (!sameLines(expected, final.lines)) throw new Error("结算前 Steam 购物车发生变化");
      batch.state = "checkout";
      await updateBatch(batch.id, batch);
      return { status: "ready", view: await view(request.accountSteamId, final) };
    } catch (error) {
      // Keep an unacknowledged write recoverable across timeout, navigation and worker restart.
      if (error.beforeRequest && attempting?.phase === "uncertain") attempting.phase = "planned";
      batch.state = "interrupted";
      await updateBatch(batch.id, batch);
      if (request.signal?.aborted) throw error;
      const latest = await call("get", snapshot.country).catch(readError => {
        throw new AggregateError([error, readError], "Steam 购物车暂存已保留，移除结果待核对");
      });
      for (const item of batch.items) {
        if (item.phase === "uncertain" && !latest.lines.has(item.lineId)) item.phase = "removed";
      }
      await updateBatch(batch.id, batch);
      log.warn("cart-select-remove-interrupted", "购物车移除已中止，暂存保留", { error, removedCount: batch.items.filter(item => item.phase === "removed").length });
      return { status: "interrupted", view: await view(request.accountSteamId, latest) };
    }
  }

  async function restore(sender, account, snapshot, call, discard = false) {
    const raw = await chrome.storage.local.get(cart.KEY);
    const batches = cart.records(raw[cart.KEY]).filter(batch => batch.accountSteamId === account);
    const ids = new Set(batches.map(batch => batch.id));
    if (batches.some(batch => batch.state === "checkout" && batch.tabId !== sender.tab.id)) {
      const tabs = await chrome.tabs.query({});
      if (batches.some(batch => batch.state === "checkout" && batch.tabId !== sender.tab.id
        && tabs.some(tab => tab.id === batch.tabId && (!tab.url || tab.url.startsWith(`${origin}/cart/`)
          || globalThis.STConfig.matchers.isSteamCheckoutHost(new URL(tab.url).hostname))))) {
        return { status: "checkout-open", view: await view(account, snapshot) };
      }
    }
    const existing = new Set([...snapshot.lines.values()].map(line => line.key));
    const ordinary = new Set([...snapshot.lines.values()].filter(line => line.canRestore).map(line => line.key));
    const missing = new Map();
    const recoverable = new Set();
    const uncertain = new Set();
    if (!discard) {
      for (const item of batches.flatMap(batch => batch.items)) {
        if (item.phase === "planned" || item.phase === "present") continue;
        if ((item.phase === "uncertain" && snapshot.lines.has(item.lineId)) || (item.phase === "adding" && !ordinary.has(item.key))) {
          uncertain.add(item.key);
          continue;
        }
        const identifier = Number(item.itemId);
        if (!["package", "bundle"].includes(item.kind) || !Number.isInteger(identifier) || identifier < 1
          || identifier > 0xffffffff || item.key !== `${item.kind}:${identifier}`) throw new TypeError("暂存商品身份无效");
        if (existing.has(item.key) && !ordinary.has(item.key)) throw new Error("购物车已有购买属性不同的暂存商品");
        recoverable.add(item.key);
        if (!ordinary.has(item.key)) missing.set(item.key, item);
      }
      for (const key of uncertain) {
        missing.delete(key);
        recoverable.delete(key);
      }
      if (missing.size) {
        const body = addBody(snapshot.country, [...missing.values()]);
        // A timed-out Add may still complete. A later Restore must read it back before sending another Add.
        const checkpoint = (phaseOf) => write(stored => ({ [cart.KEY]: cart.records(stored[cart.KEY]).map(batch => {
          if (!ids.has(batch.id)) return batch;
          return { ...batch, items: batch.items.map(item => missing.has(item.key) && !["planned", "present"].includes(item.phase)
            ? { ...item, phase: phaseOf(item) } : item) };
        }) }));
        await checkpoint(() => "adding");
        const result = await call("add", snapshot.country, body).catch(async error => {
          if (error.beforeRequest) await checkpoint(() => "removed");
          throw error;
        });
        const present = new Set([...result.lines.values()].filter(line => line.canRestore).map(line => line.key));
        if ([...recoverable].some(key => !present.has(key))) {
          await checkpoint(item => present.has(item.key) ? "present" : "removed");
          throw new Error("Steam 未确认已恢复全部暂存商品");
        }
        snapshot = await call("get", snapshot.country);
        const verified = new Set([...snapshot.lines.values()].filter(line => line.canRestore).map(line => line.key));
        if ([...recoverable].some(key => !verified.has(key))) throw new Error("Steam 未确认已恢复全部暂存商品");
      }
    }
    await write(raw => {
      const records = cart.records(raw[cart.KEY]).flatMap(batch => {
        if (!ids.has(batch.id)) return [batch];
        const items = batch.items.filter(item => uncertain.has(item.key));
        return items.length ? [{ ...batch, items }] : [];
      });
      if (discard) return { [cart.KEY]: records };
      const completed = new Set(batches.flatMap(batch => batch.items).filter(item => !uncertain.has(item.key)
        && !["planned", "present"].includes(item.phase)).map(item => item.lineId));
      const selections = raw[cart.SELECTION_KEY] || {};
      return { [cart.KEY]: records, [cart.SELECTION_KEY]: {
        ...selections,
        [account]: (selections[account] || []).filter(id => !completed.has(id)),
      } };
    });
    return { status: discard ? "discarded" : uncertain.size ? "uncertain" : "restored", view: await view(account, snapshot) };
  }

  /** Handles the account cart only on the sender's current top-level Store document. */
  async function handle(request, sender, execScript) {
    const { accountSteamId: account, action, revision, lineId, checked, signal } = request;
    const url = new URL(sender.url);
    if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || typeof sender.documentId !== "string" || !sender.documentId
      || !Number.isInteger(sender.tab?.id) || sender.tab.id < 0
      || url.origin !== origin || !/^\/cart\/?$/.test(url.pathname) || !cart.validAccount(account)) {
      throw new Error("Steam 购物车操作来源无效");
    }
    const call = (method, country, body, claimLegacy = false) => requestCart(execScript, sender, account, signal, method, country, body, claimLegacy);
    return withAccount(account, async () => {
      if (action === "toggle") {
        if (!cart.validLineId(lineId) || typeof checked !== "boolean") throw new TypeError("购物车勾选请求无效");
        await call();
        const excluded = await selection(account, null, action, lineId, checked);
        return { status: "saved", excluded };
      }
      const raw = await chrome.storage.local.get(cart.KEY);
      const legacy = cart.records(raw[cart.KEY]).filter(batch => !Object.hasOwn(batch, "accountSteamId")
        && (batch.sessionProof || batch.token));
      const snapshot = await call("get", undefined, undefined, legacy.length > 0);
      if (legacy.length) await claimBatches(account, legacy, snapshot.legacyProof);
      const current = await view(account, snapshot);
      if (action === "read") return { status: "read", view: current };
      if (action === "restore" || action === "discard") {
        if (!current.hasBatch || JSON.stringify(current.batchIds) !== JSON.stringify(request.batchIds)) {
          return { status: "changed", view: current };
        }
        return await restore(sender, account, snapshot, call, action === "discard");
      }
      if (current.revision !== revision || JSON.stringify(current.excluded) !== JSON.stringify(request.excluded)) {
        return { status: "changed", view: current };
      }
      if (action === "checkout") return current.migration ? { status: "migration", view: current } : await prepare(request, sender, snapshot, current, call);
      if (!["all", "none", "invert", "migrate", "reset-legacy"].includes(action)) throw new TypeError("购物车操作无效");
      await selection(account, snapshot, action);
      return { status: "saved", view: await view(account, snapshot) };
    });
  }

  globalThis.STBackgroundCart = Object.freeze({ handle, openForCommerce, transaction, holds, withAccount, sameLines });
})();
