/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Project       : Steam Buff
 * @Description   : AI 对话中的 Steam 购物车与免费许可证
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const { steamStore } = root.STConfig.vendors;
  const cart = root.STBackgroundCart;
  const config = root.STAI;
  const { publicJson, argumentsFor } = root.STBackgroundSteamStoreTools;
  const activeClaims = new Set();
  const log = () => root.STLoggerFactory.createLogger("background", "steam-commerce");
  const changed = "Steam 账号、商店地区或已确认的商品已经变化，请重新确认";
  const unconfirmed = "Steam 写入结果未能核实，请在商店检查后再操作";
  const fault = (code, message, extra) => Object.assign(new Error(message), { code, aiToolFailure: true, ...extra });
  const invalid = message => fault("CHAT_TOOL_INVALID", message);
  const stale = () => fault("STEAM_COMMERCE_CHANGED", changed);
  const busy = () => fault("STEAM_COMMERCE_BUSY", "当前 Steam 账号有正在进行的操作");
  const steamContext = session => ({ steamAccountId: session.steamId, country: session.country });
  const stamp = (source, url) => ({ source, url, checkedAt: new Date().toISOString() });
  const idOK = config.isToolAppId;

  async function approve(session, approval, signal, scope) {
    signal.throwIfAborted();
    if (!await approval.requestApproval({ commerce: true, parameters: steamContext(session), items: [], ...scope }))
      throw fault("CHAT_TOOL_DECLINED", "用户拒绝了本次工具操作");
    await approval.checkDefinition();
    signal.throwIfAborted();
  }

  async function authorizeRead(kind, session, approval, signal, appId) {
    if (approval.mode === "ask") await approve(session, approval, signal, {
      parameters: { ...steamContext(session), ...(appId && { appIds: [appId] }) },
      operations: [{ kind: "steam-read", commerceRead: kind }],
    });
  }

  function cartArguments(args) {
    const { operation, appId, packageId, bundleId, lineId } = args;
    if (operation === "clear" && Object.keys(args).length === 1) return;
    if (operation === "remove" && root.STCartRestore.validLineId(lineId) && Object.keys(args).length === 2) return;
    if (operation === "add" && !lineId && (bundleId ? !appId && !packageId : appId || packageId)) return;
    throw invalid("加购须指定 AppID、套餐或捆绑包。移除只接受购物车行 ID，清空只接受操作名称");
  }

  function licenseAppId({ appId, url }) {
    if (appId && !url) return appId;
    if (appId || !url || !URL.canParse(url)) throw invalid("请提供一个 AppID 或 Steam 商店游戏链接");
    const target = new URL(url);
    const id = Number(target.pathname.match(/^\/app\/([1-9]\d*)(?:\/|$)/)?.[1]);
    if (target.origin !== steamStore.origin || target.username || target.password || !idOK(id))
      throw invalid("请提供 Steam 商店的游戏或 DLC 链接");
    return id;
  }

  async function readCart(session, signal, prepare) {
    try { return await session.read(prepare); }
    catch (cause) {
      signal.throwIfAborted();
      if (cause.accountChanged) throw fault("STEAM_COMMERCE_CHANGED", changed, { cause });
      if (cause.status === 429) throw fault("STEAM_RATE_LIMITED", "Steam 限制了购物车读取频率", { cause, status: cause.status });
      throw fault("STEAM_CART_READ_FAILED", "Steam 未返回可核对的当前账号购物车", { cause, status: cause.status });
    }
  }

  function displayLine({ lineId, kind, itemId, name, price, priceWhenAdded, gift, privatePurchase, coupon }) {
    return { lineId, kind, itemId, name, price: price ?? null, priceWhenAdded, gift, privatePurchase, coupon };
  }

  const priceMatches = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  function sameCart(a, b) {
    return cart.sameLines(a.lines, b.lines) && priceMatches(a.subtotal, b.subtotal) &&
      [...a.lines].every(([id, item]) => priceMatches(item.price, b.lines.get(id).price));
  }

  async function cartLock(session, run) {
    const value = await cart.withAccount(session.steamId, run);
    if (value.status === "busy") throw busy();
    return value;
  }

  async function appDetails(appId, country, signal, filters) {
    const value = (await publicJson(steamStore.appDetailsForCountry(appId, country, filters, "english"), signal, "no-store"))?.[appId];
    if (value?.success === false) return null;
    const data = value?.data;
    if (value?.success !== true || data?.steam_appid !== appId || typeof data.name !== "string" || !data.name.trim())
      throw fault("AI_TOOL_RESPONSE_INVALID", "Steam 未返回可核对的商品资料");
    return data;
  }

  function purchaseOptions(data) {
    const groups = data?.package_groups;
    if (groups === undefined) return [];
    if (!Array.isArray(groups) || groups.some(group => !Array.isArray(group?.subs)))
      throw fault("AI_TOOL_RESPONSE_INVALID", "Steam 套餐列表格式无效");
    const options = groups.flatMap(group => group.subs);
    if (options.some(row => !idOK(row?.packageid)))
      throw fault("AI_TOOL_RESPONSE_INVALID", "Steam 购买选项缺少可核对的套餐 ID");
    return options;
  }

  function displayMoney(amount, currency) {
    if (!Number.isSafeInteger(amount) || amount < 0 || typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return null;
    return { amount, currency, formatted: new Intl.NumberFormat("en", { style: "currency", currency }).format(amount / 100) };
  }

  async function bundleQuote(session, bundleId, signal, execScript) {
    signal.throwIfAborted();
    const [injection] = await execScript({ target: session.target, world: "MAIN",
      args: [steamStore.bundle(bundleId) + "?l=english", session.steamId, session.country, bundleId, session.binding],
      func: async (bundleUrl, steamId, country, bundleId, bindingId) => {
        const binding = window[Symbol.for("SteamBuff.cart-commerce-session")];
        if (binding?.id !== bindingId || !binding.current()) return null;
        const page = await fetch(new URL(bundleUrl), {
          credentials: "same-origin", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12000),
        });
        if (!page.ok || !page.headers.get("content-type")?.startsWith("text/html")) return null;
        const doc = new DOMParser().parseFromString(await page.text(), "text/html");
        const context = doc.getElementById("application_config")?.dataset;
        if (JSON.parse(context?.config ?? "{}").COUNTRY !== country || JSON.parse(context?.userinfo ?? "{}").steamid !== steamId)
          return null;
        const matches = doc.querySelectorAll('.game_area_purchase.tablet_hidden .game_area_purchase_game.bundle[data-ds-bundleid="' + bundleId + '"]');
        if (matches.length !== 1) return null;
        const area = matches[0];
        const offers = area.querySelectorAll(".game_purchase_action .discount_block[data-price-final]");
        const name = area.querySelector("h1")?.textContent.trim();
        const button = area.querySelector(".game_purchase_action .btn_addtocart a");
        const id = button?.getAttribute("href")?.match(/^javascript:addBundleToCart\(\s*([1-9]\d*)\s*\);?\s*$/i)?.[1];
        if (offers.length !== 1 || Number(id) !== bundleId || !name || !binding.current()) return null;
        const raw = offers[0].getAttribute("data-price-final");
        const amount = Number(raw);
        const formatted = offers[0].querySelector(".discount_final_price")?.textContent.trim();
        if (!/^\d+$/.test(raw) || !Number.isSafeInteger(amount) || !formatted) return null;
        return { name, price: { amount, formatted } };
      } });
    signal.throwIfAborted();
    return injection?.result ? { kind: "bundle", itemId: bundleId, ...injection.result } : null;
  }

  async function addOffer(session, args, signal, execScript) {
    if (args.bundleId) return { offer: await bundleQuote(session, args.bundleId, signal, execScript) };
    const { country } = session;
    let packageId = args.packageId;
    if (args.appId) {
      const data = await appDetails(args.appId, country, signal, "basic,packages,package_groups,price_overview");
      const options = [...new Map(purchaseOptions(data).map(row => [row.packageid, row])).values()];
      if (packageId && !options.some(row => row.packageid === packageId))
        return { reason: "指定套餐不在该 AppID 的 Steam 商店购买选项中" };
      if (!packageId && options.length > 1) return { choices: options.map(row => ({
        packageId: row.packageid, name: row.option_text,
        price: displayMoney(row.price_in_cents_with_discount, data.price_overview?.currency),
      })) };
      packageId ??= options[0]?.packageid;
    }
    if (!packageId) return {};
    const info = (await publicJson(steamStore.packageDetailsForCountry(packageId, country, "english"), signal, "no-store"))?.[packageId];
    const data = info?.data;
    const price = displayMoney(data?.price?.final, data?.price?.currency);
    if (info?.success !== true || !price || typeof data?.name !== "string" || !data.name.trim() ||
      args.appId && !data.apps?.some(app => app.id === args.appId)) return {};
    return { offer: { appId: args.appId, kind: "package", itemId: packageId, name: data.name, price } };
  }

  function publishReceipt(items, approval) {
    const batchId = root.crypto.randomUUID();
    return () => approval.receipt?.(items.map(item => ({ ...item })), { batchId });
  }

  function writeResult(operation, session, items, issue) {
    const status = !issue ? "ok" : items.some(item => item.status === "saved") ? "partial" : "failed";
    return { ...steamContext(session), operation, status, items, ...(issue && { code: issue.code, reason: issue.message }) };
  }

  async function cartWrite(session, before, items, args, approval, signal, execScript) {
    const { operation } = args;
    const method = operation === "add" ? "add" : "remove";
    const publish = publishReceipt(items, approval);
    const fail = (item, error, uncertain) => {
      item.status = uncertain ? "uncertain" : "failed";
      item.code = error.code;
      publish();
      return writeResult(operation, session, items, error);
    };
    let expected = before;
    if (operation === "add") {
      const { offer } = await addOffer(session, args, signal, execScript);
      const [{ appId, kind, itemId, name, price }] = items;
      if (!offer || offer.appId !== appId || offer.kind !== kind || offer.itemId !== itemId || offer.name !== name || !priceMatches(offer.price, price))
        return writeResult(operation, session, items, stale());
    }
    for (const item of items) {
      const transaction = cart.transaction(session.country, method, item);
      let fresh;
      try {
        await approval.checkDefinition();
        fresh = await readCart(session, signal, transaction);
        if (!sameCart(expected, fresh)) return fail(item, stale(), false);
        await approval.checkDefinition();
      } catch (error) {
        signal.throwIfAborted();
        if (!error.aiToolFailure || !items.some(row => row.status === "saved")) throw error;
        log().warn("commerce-cart-partial-preflight", error.message, { error, phase: operation });
        return fail(item, error, false);
      }
      signal.throwIfAborted();
      item.status = "uncertain";
      publish();
      try { await session.commit(transaction); }
      catch (cause) {
        signal.throwIfAborted();
        if (cause.beforeRequest) return fail(item, cause.accountChanged ? stale() : fault("STEAM_CART_PRECHECK_EXPIRED", cause.message, { cause }), false);
        if (cause.status === 429) return fail(item, fault("STEAM_RATE_LIMITED", "Steam 限制了购物车修改频率", { cause, status: cause.status }), false);
        log().warn("commerce-cart-write-unconfirmed", unconfirmed, { error: cause, phase: operation });
      }
      let latest;
      try { latest = await readCart(session, signal); }
      catch (cause) {
        signal.throwIfAborted();
        const error = fault("STEAM_CART_UNCONFIRMED", unconfirmed, { cause });
        log().warn("commerce-cart-readback-failed", error.message, { error, phase: operation });
        return fail(item, error, true);
      }
      const others = new Map(fresh.lines);
      let achieved;
      let priceChanged = false;
      if (method === "add") {
        const added = [...latest.lines.values()].filter(line => line.kind === item.kind && Number(line.itemId) === item.itemId && line.canRestore);
        achieved = added.length === 1;
        if (achieved) {
          const [line] = added;
          const observed = line.price ?? (latest.lines.size === 1 ? latest.subtotal : null) ?? null;
          const confirmed = observed?.amount ?? line.priceWhenAdded?.amount;
          const priorCurrency = fresh.subtotal?.currencyCode;
          const currentCurrency = observed?.currencyCode ?? latest.subtotal?.currencyCode ?? line.priceWhenAdded?.currencyCode;
          priceChanged = (Number.isSafeInteger(confirmed) && confirmed !== item.price.amount) ||
            (!!priorCurrency && !!currentCurrency && priorCurrency !== currentCurrency);
          Object.assign(item, { lineId: line.lineId, approvedPrice: item.price, price: observed,
            priceWhenAdded: line.priceWhenAdded });
          others.set(item.lineId, line);
        }
      } else {
        others.delete(item.lineId);
        achieved = !latest.lines.has(item.lineId);
      }
      if (!achieved) return fail(item, fault("STEAM_CART_UNCONFIRMED", unconfirmed), true);
      item.status = "saved";
      publish();
      if (!cart.sameLines(others, latest.lines)) return writeResult(operation, session, items, stale());
      if (priceChanged) return writeResult(operation, session, items,
        fault("STEAM_CART_PRICE_CHANGED", "商品已加购，Steam 回读的价格与确认时不同"));
      if (operation === "clear" && [...others].some(([id, line]) => !priceMatches(line.price, latest.lines.get(id).price)))
        return writeResult(operation, session, items, stale());
      expected = latest;
    }
    return writeResult(operation, session, items);
  }

  async function cartTool(tool, args, signal, approval, execScript) {
    const { operation } = args;
    if (operation) cartArguments(args);
    const session = await cart.openForCommerce(execScript, approval.expectedSteamId, signal);
    if (!session) throw fault("STEAM_CART_PAGE_REQUIRED", "请打开当前 Steam 账号已登录的商店购物车页面");
    await authorizeRead("cart", session, approval, signal);
    const initial = await cartLock(session, async () => ({
      snapshot: await readCart(session, signal), holds: await cart.holds(session.steamId),
    }));
    const { snapshot } = initial;
    if (tool.kind === "cart_read") return {
      status: "ok", ...steamContext(session), ...stamp("Steam 商店购物车", steamStore.origin + "/cart/"),
      items: [...snapshot.lines.values()].map(displayLine), subtotal: snapshot.subtotal ?? null, held: initial.holds,
    };
    if (initial.holds.some(batch => batch.status === "checkout" || batch.status === "removing")) throw busy();
    let selected;
    if (operation === "add") {
      const { offer, choices, reason } = await addOffer(session, args, signal, execScript);
      if (choices) return { ...steamContext(session), status: "choose_package", choices };
      if (!offer) return { ...steamContext(session), status: "unavailable", reason: reason || "Steam 未返回可核实的购买选项和价格" };
      if ([...snapshot.lines.values()].some(line => line.kind === offer.kind && Number(line.itemId) === offer.itemId))
        return { ...steamContext(session), status: "skipped", reason: "购物车已有此套餐或捆绑包" };
      selected = [offer];
    } else {
      const lines = operation === "clear" ? [...snapshot.lines.values()] : [snapshot.lines.get(args.lineId)].filter(Boolean);
      selected = lines.map(displayLine);
    }
    if (!selected.length) return { ...steamContext(session), status: "skipped",
      reason: operation === "clear" ? "Steam 购物车为空" : "所选购物车行已不存在" };
    const items = selected.map(item => ({ ...item, commerceAction: operation, status: "proposed" }));
    await approve(session, approval, signal, { operations: [], items });
    return cartLock(session, async () => {
      if ((await cart.holds(session.steamId)).some(batch => batch.status === "checkout" || batch.status === "removing")) throw busy();
      let result;
      try {
        result = await cartWrite(session, snapshot, items, args, approval, signal, execScript);
      } finally {
        if (!signal.aborted && items.some(item => item.status === "saved")) {
          let refreshed = false;
          try { refreshed = await session.refresh(); }
          catch (error) {
            log().warn("commerce-cart-refresh-failed", "购物车已核对，商店页面刷新未确认", { error, phase: operation });
          }
          if (result) result.cartPageRefreshed = refreshed;
        }
      }
      return result;
    });
  }

  // Steam 的购买按钮和所有权只在绑定的商店文档解析，凭据保留在页面主世界。
  async function inLicensePage({ origin, expected, productUrl, userdataUrl, appId, baseAppId, packageIds, preparing, readback }) {
    const account = window.g_AccountID, sessionid = window.g_sessionID;
    const country = JSON.parse(document.getElementById("application_config")?.dataset.config ?? "{}").COUNTRY;
    const cookie = () => document.cookie.match(/(?:^|;\s*)sessionid=([^;]+)/)?.[1];
    const current = () => location.origin === origin && /^\/app\/[1-9]\d*(?:\/|$)/.test(location.pathname) &&
      Number.isSafeInteger(account) && account > 0 && account <= 0xffffffff && window.g_AccountID === account &&
      typeof sessionid === "string" && !!sessionid && window.g_sessionID === sessionid && cookie() === sessionid &&
      /^[A-Z]{2}$/.test(country) && JSON.parse(document.getElementById("application_config")?.dataset.config ?? "{}").COUNTRY === country;
    if (!current()) return { changed: true };
    const steamId = String(0x0110000100000000n + BigInt(account));
    if (expected?.steamId && expected.steamId !== steamId || expected?.country && expected.country !== country) return { changed: true };
    const key = Symbol.for("SteamBuff.free-license-session");
    if (!productUrl) {
      if (!window[key]?.current()) Object.defineProperty(window, key, { configurable: true, value: { id: crypto.randomUUID(), current } });
      return { steamId, country, binding: window[key].id };
    }
    const binding = window[key];
    const bound = () => window[key] === binding && binding?.id === expected.binding && binding.current() && current();
    if (!bound()) return { changed: true };
    const request = { credentials: "same-origin", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12000) };
    const loadProduct = async () => {
      const page = await fetch(productUrl, request);
      if (!page.ok) return { status: page.status };
      if (!page.headers.get("Content-Type")?.startsWith("text/html")) return { invalid: true };
      const doc = new DOMParser().parseFromString(await page.text(), "text/html");
      const context = doc.getElementById("application_config")?.dataset;
      if (JSON.parse(context?.userinfo ?? "{}").steamid !== steamId || JSON.parse(context?.config ?? "{}").COUNTRY !== country || !bound())
        return { changed: true };
      return { page: doc };
    };
    // 核对动态商店请求前后的账号，并只采用最后一份商品购买选项。
    const before = await loadProduct();
    if (!before.page) return before;
    const url = new URL(userdataUrl);
    url.searchParams.set("id", account);
    url.searchParams.set("cc", country);
    const response = await fetch(url.href, request);
    if (!response.ok) return { status: response.status };
    const { rgOwnedPackages, rgOwnedApps } = await response.json();
    const validIds = ids => Array.isArray(ids) && ids.every(id => Number.isSafeInteger(id) && id > 0 && id <= 0xffffffff);
    if (!validIds(rgOwnedPackages) || !readback && !validIds(rgOwnedApps)) return { invalid: true };
    const latest = await loadProduct();
    if (!latest.page) return latest;
    const { page } = latest;
    const purchase = page.getElementById("game_area_purchase");
    const sections = purchase?.querySelectorAll('.game_area_purchase_game[aria-labelledby="game_area_purchase_section_free_' + appId + '"]');
    const native = sections?.length === 1 ? sections[0] : null;
    const actions = [];
    if (native && !readback) {
      for (const button of native.querySelectorAll(".game_purchase_action .btn_addtocart :is(a, button)")) {
        if (button.closest(".game_area_purchase_game") !== native) continue;
        const action = button.hasAttribute("onclick") ? button.getAttribute("onclick") :
          button.getAttribute("href")?.match(/^javascript:([\s\S]*)$/i)?.[1];
        const subid = Number(action?.match(/^\s*AddFreeLicense\s*\(\s*([1-9]\d*)\s*,/)?.[1]);
        if (Number.isInteger(subid) && subid > 0 && subid <= 0xffffffff) actions.push(subid);
      }
    }
    const nativePackageId = actions.length === 1 ? actions[0] : undefined;
    const freePrice = native?.querySelector(".game_purchase_action .game_purchase_price.price")?.textContent.trim() === "Free";
    const packages = new Set([...packageIds, nativePackageId].filter(Boolean));
    const ownedPackages = rgOwnedPackages.filter(id => packages.has(id));
    const ownsApp = !readback && rgOwnedApps.includes(appId);
    const ownsBase = !readback && !!baseAppId && rgOwnedApps.includes(baseAppId);
    if (preparing && preparing.subid === nativePackageId && freePrice && ownsBase && !ownsApp && !ownedPackages.includes(preparing.subid)) {
      const key = Symbol.for("SteamBuff.free-license-preflight");
      const ttl = 5000, expiresAt = Date.now() + ttl;
      const proof = { ...preparing, expiresAt, current: bound };
      Object.defineProperty(window, key, { configurable: true, value: proof });
      AbortSignal.timeout(ttl).addEventListener("abort", () => {
        if (window[key] === proof) delete window[key];
      }, { once: true });
    }
    return { steamId, country, nativePackageId, freePrice, hasPurchaseArea: !!purchase, hasFreeSection: !!native, ownedPackages, ownsApp, ownsBase };
  }

  async function licensePage(execScript, target, args, signal) {
    signal.throwIfAborted();
    let injection;
    try { [injection] = await execScript({ target, world: "MAIN", func: inLicensePage,
      args: [{ origin: steamStore.origin, userdataUrl: steamStore.dynamicStoreUserdataBase, ...args }] }); }
    catch (cause) {
      signal.throwIfAborted();
      throw fault("STEAM_LICENSE_READ_FAILED", "未能核对当前 Steam 商店账号的免费许可证", { cause });
    }
    signal.throwIfAborted();
    const page = injection?.result;
    if (page?.changed && args.expected?.steamId) throw stale();
    if (page?.status === 429) throw fault("STEAM_RATE_LIMITED", "Steam 限制了商店商品或所有权查询频率", { status: 429 });
    if (page?.status) throw fault("STEAM_LICENSE_READ_FAILED", "Steam 商品或所有权查询失败（HTTP " + page.status + "）", { status: page.status });
    if (page?.invalid) throw fault("AI_TOOL_RESPONSE_INVALID", "Steam 未返回可核对的商品页面或所有权记录");
    if (!injection?.documentId || !page?.steamId)
      throw fault("STEAM_LICENSE_PAGE_REQUIRED", "请刷新当前 Steam 账号已登录的游戏页面，确认商品可见后重试");
    return { ...page, documentId: injection.documentId };
  }

  async function inspectLicense(session, appId, packageId, signal, execScript, preparing) {
    const productUrl = steamStore.app(appId) + "?l=english";
    const context = { ...steamContext(session), appId, ...stamp("Steam 商店", productUrl) };
    const data = await appDetails(appId, session.country, signal, "basic,fullgame,packages,package_groups,price_overview");
    if (!data || !["game", "dlc"].includes(data.type))
      return { ...context, eligibility: "unverified", reason: "Steam 未返回游戏或 DLC 资料" };
    const baseAppId = data.type === "dlc" && idOK(Number(data.fullgame?.appid)) ? Number(data.fullgame.appid) : null;
    const options = purchaseOptions(data);
    const packageIds = [...new Set([...options.map(row => row.packageid), packageId].filter(Boolean))];
    const proof = await licensePage(execScript, session.target, {
      expected: session, appId, baseAppId, packageIds, productUrl, preparing,
    }, signal);
    const { nativePackageId } = proof;
    const candidates = [...new Set([...options.filter(row => row.can_get_free_license === "1" && row.price_in_cents_with_discount === 0)
      .map(row => row.packageid), nativePackageId].filter(Boolean))];
    const selected = packageId ?? nativePackageId;
    const ordinary = { ...context, name: data.name, baseAppId, packageId: selected ?? null, candidatePackageIds: candidates };
    const result = (eligibility, reason) => ({ ...ordinary, eligibility, ...(reason && { reason }) });
    if (packageId && !candidates.includes(packageId) && !options.some(row => row.packageid === packageId))
      return result("unverified", "Steam 未证明指定套餐属于此商品");
    if (selected ? proof.ownedPackages.includes(selected) : proof.ownsApp || (candidates.length && candidates.every(id => proof.ownedPackages.includes(id))))
      return result("already_owned");
    const selectedOffer = packageId && options.find(row => row.packageid === packageId);
    if (selectedOffer?.price_in_cents_with_discount > 0 && selected !== nativePackageId) return result("paid");
    if (data.type === "dlc" && data.is_free === true && nativePackageId && selected === nativePackageId && proof.freePrice) {
      if (!baseAppId) return result("unverified", "Steam 未返回此 DLC 的本体");
      if (!proof.ownsBase) return result("base_required", "当前 Steam 账号未拥有 DLC 所需的游戏本体");
      if (proof.ownsApp) return result("already_owned");
      return { ...result("claimable"), licenseType: "free_dlc", price: { amount: 0, formatted: "0" } };
    }
    if (data.type === "game" && data.is_free === true && proof.hasPurchaseArea) return result("free_to_play");
    if (candidates.length || proof.hasFreeSection || options.some(row => row.price_in_cents_with_discount === 0))
      return result("unverified", "当前优惠的许可证类型或领取入口尚未核实");
    if (proof.hasPurchaseArea && data.is_free === false && data.price_overview?.final > 0) return result("paid");
    return result("unverified", "Steam 未显示可核实的免费领取入口");
  }

  async function claimLicense(session, preview, approval, signal, execScript) {
    const { appId, packageId, baseAppId, name, licenseType, price } = preview;
    const item = { appId, itemId: packageId, kind: "package", name, licenseType, price, commerceAction: "claim", status: "proposed" };
    await approve(session, approval, signal, { operations: [], items: [item] });
    const key = session.steamId + ":" + packageId;
    if (activeClaims.has(key)) throw busy();
    activeClaims.add(key);
    try {
      const publish = publishReceipt([item], approval);
      const result = issue => writeResult("claim", session, [item], issue);
      const proof = { id: root.crypto.randomUUID(), subid: packageId };
      const now = await inspectLicense(session, appId, packageId, signal, execScript, proof);
      if (now.eligibility === "already_owned") {
        item.status = "skipped";
        return result();
      }
      if (now.eligibility !== "claimable" || now.name !== name || now.baseAppId !== baseAppId || now.licenseType !== licenseType ||
          now.packageId !== packageId || !priceMatches(now.price, price)) throw stale();
      await approval.checkDefinition();
      signal.throwIfAborted();
      item.status = "uncertain";
      publish();
      let reply;
      try {
        const [injection] = await execScript({ target: session.target, world: "MAIN", func: root.STSteamFreeLicense.submit,
          args: [packageId, null, proof] });
        reply = injection?.result;
      } catch (error) {
        signal.throwIfAborted();
        log().warn("commerce-license-write-unconfirmed", unconfirmed, { error, appId, packageId });
      }
      signal.throwIfAborted();
      if (reply?.sent === false || reply?.status === "failed") {
        item.status = "failed";
        const issue = reply.sent === false ? stale() : fault("STEAM_LICENSE_WRITE_FAILED",
          reply.labelId === "baseRequired" ? "Steam 确认缺少游戏本体" :
            reply.labelId === "rateLimit" ? "Steam 限制了请求频率" : "Steam 拒绝了免费许可证领取");
        publish();
        return result(issue);
      }
      try {
        const readback = await licensePage(execScript, session.target, { expected: session, appId,
          productUrl: preview.url, packageIds: [packageId], readback: true }, signal);
        if (readback.ownedPackages.includes(packageId)) {
          item.status = reply?.status === "owned" ? "skipped" : "saved";
          publish();
          return result();
        }
      } catch (error) {
        signal.throwIfAborted();
        log().warn("commerce-license-readback-failed", unconfirmed, { error, appId, packageId });
      }
      return result(fault("STEAM_LICENSE_UNCONFIRMED", unconfirmed));
    } finally { activeClaims.delete(key); }
  }

  async function freeTool(tool, args, signal, approval, execScript) {
    const appId = licenseAppId(args);
    const [tab] = (await chrome.tabs.query({ url: steamStore.origin + "/app/*" })).sort((a, b) => Number(b.active) - Number(a.active));
    if (!tab) throw fault("STEAM_LICENSE_PAGE_REQUIRED", "请先打开已登录的 Steam 商店游戏页面");
    const { steamId, country, binding, documentId } = await licensePage(execScript, { tabId: tab.id },
      { expected: { steamId: approval.expectedSteamId } }, signal);
    const session = { steamId, country, binding, target: { tabId: tab.id, documentIds: [documentId] } };
    await authorizeRead("license", session, approval, signal, appId);
    const preview = await inspectLicense(session, appId, args.packageId, signal, execScript);
    if (tool.kind === "free_eligibility" || preview.eligibility !== "claimable") return preview;
    return claimLicense(session, preview, approval, signal, execScript);
  }

  async function execute(tool, args, signal, approval, execScript) {
    if (!approval || !config.CHAT_APPROVAL_MODES.includes(approval.mode))
      throw fault("CHAT_TOOL_NOT_ALLOWED", "请在 AI 对话中直接调用 Steam 购物车或免费许可证工具");
    argumentsFor(tool, args);
    try {
      if (tool.kind === "cart_read" || tool.kind === "cart_change") return await cartTool(tool, args, signal, approval, execScript);
      if (tool.kind === "free_eligibility" || tool.kind === "free_claim") return await freeTool(tool, args, signal, approval, execScript);
      throw new TypeError("Steam 购物车或免费许可证工具未登记");
    } catch (error) {
      signal.throwIfAborted();
      if (error.name === "SyntaxError") root.STLoggerSchema.markJsonError(error);
      if (error.code !== "CHAT_TOOL_DECLINED") log().warn("commerce-tool-failed", "Steam 购物车或免费许可证工具执行失败", { error, phase: tool.kind });
      throw error;
    }
  }

  root.STBackgroundSteamCommerce = Object.freeze({ execute, approve, readCart, sameCart, displayLine });
})(globalThis);
