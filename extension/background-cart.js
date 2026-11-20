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

  function decode(bytes, field = 1) {
    const carts = fields(Uint8Array.from(bytes)).filter(entry => entry.tag === field);
    if (carts.length !== 1 || carts[0].wire !== 2) throw new Error("Steam 未返回购物车清单");
    const lines = new Map();
    for (const entry of fields(carts[0].value)) {
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
      lines.set(lineId, { lineId, kind, itemId, key: `${kind}:${itemId}`, identity, canRestore });
    }
    return lines;
  }

  function sameLines(before, after) {
    return before.size === after.size && [...before].every(([id, line]) => after.get(id)?.identity === line.identity);
  }

  async function requestCart(execScript, sender, account, signal, method, country, body, claimLegacy) {
    if (signal?.aborted) {
      throw Object.assign(new Error("购物车请求已取消", { cause: signal.reason }), { beforeRequest: true });
    }
    const [injection] = await execScript({
      target: { tabId: sender.tab.id, documentIds: [sender.documentId] }, world: "MAIN",
      args: [origin, account, method ? methods[method] : null, country || null, body || null, claimLegacy],
      func: async (expectedOrigin, account, path, country, body, claimLegacy) => {
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
        function sessionFailure(error) {
          // The injection result cannot carry an Error object. Keep its frames without copying response text.
          const message = error.name === "SyntaxError" ? "Steam 购物车会话格式无效" : error.message;
          return { beforeRequest: true, transportError: { name: error.name, message, frames: error.stack?.split("\n").slice(1) } };
        }
        let legacyProof = null;
        {
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
          if (config?.steamid !== account || config.storeBrowseContext?.country?.toUpperCase() !== initialCountry) {
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
        return currentCountry() === initialCountry ? { bytes, country: initialCountry, legacyProof } : { changed: true };
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
    if (reply?.changed) throw Object.assign(new Error("Steam 购物车账号或地区已变更"), { beforeRequest: reply.beforeRequest });
    if (!reply?.country || (method && !Array.isArray(reply.bytes))) {
      throw Object.assign(new Error("Steam 未确认购物车请求"), { status: reply?.status, beforeRequest: reply?.beforeRequest });
    }
    return method ? { country: reply.country, lines: decode(reply.bytes, method === "add" ? 2 : 1), legacyProof: reply.legacyProof } : reply;
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
    const batches = cart.records(raw[cart.KEY]).filter(batch => batch.accountSteamId === account);
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
        const body = [...numberField(1, item.lineId), ...bytesField(2, new TextEncoder().encode(snapshot.country))];
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
        const body = [...bytesField(1, new TextEncoder().encode(snapshot.country))];
        for (const item of missing.values()) body.push(...bytesField(2, numberField(item.kind === "bundle" ? 2 : 1, item.itemId)));
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
    if (running.has(account)) return { status: "busy" };
    running.add(account);
    const call = (method, country, body, claimLegacy = false) => requestCart(execScript, sender, account, signal, method, country, body, claimLegacy);
    try {
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
    } finally {
      running.delete(account);
    }
  }

  globalThis.STBackgroundCart = Object.freeze({ handle });
})();
