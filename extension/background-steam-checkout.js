/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Project       : Steam Buff
 * @Description   : Steam 结账预览和原生结账入口
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const store = root.STConfig.vendors.steamStore;
  const cart = root.STBackgroundCart;
  const wallet = root.STBackgroundSteamWallet;
  const { approve, readCart, sameCart, displayLine } = root.STBackgroundSteamCommerce;
  const log = () => root.STLoggerFactory.createLogger("background", "steam-checkout");
  const fault = (code, message, extra) => Object.assign(new Error(message), { code, aiToolFailure: true, ...extra });

  async function approveRead(session, approval, signal, kind) {
    if (approval.mode !== "ask") return;
    await approve(session, approval, signal, {
      checkout: true, operations: [{ kind: "steam-read", commerceRead: kind }],
    });
  }

  async function checkoutSnapshot(session, signal) {
    const result = await cart.withAccount(session.steamId, async () => ({
      cart: await readCart(session, signal), held: await cart.holds(session.steamId),
    }));
    if (result.status === "busy") throw fault("STEAM_COMMERCE_BUSY", "Steam 购物车正在处理另一笔操作");
    return result;
  }

  async function verifyCartTab(session, tab, signal) {
    const url = tab.url && new URL(tab.url);
    if (tab.pendingUrl || !url || url.origin !== store.origin || !/^\/cart\/?$/.test(url.pathname) ||
        !await session.isCurrent()) throw fault("STEAM_COMMERCE_CHANGED", "Steam 购物车标签页已变化，请重新打开购物车核对");
    signal.throwIfAborted();
  }

  async function checkoutTool(tool, signal, approval, execScript) {
    const session = await cart.openForCommerce(execScript, approval.expectedSteamId, signal);
    if (!session) throw fault("STEAM_CART_PAGE_REQUIRED", "请先打开当前 Steam 账号已登录的商店购物车页面");
    await approveRead(session, approval, signal, "checkout");
    const { cart: snapshot, held } = await checkoutSnapshot(session, signal);
    const details = await wallet.read(await wallet.bind(session, signal, execScript), signal, execScript);
    const items = [...snapshot.lines.values()].map(displayLine);
    const url = store.origin + "/cart/";
    const preview = {
      status: "ok", source: "Steam 购物车", url, checkedAt: new Date().toISOString(),
      steamAccountId: session.steamId, country: session.country, items, held,
      estimatedSubtotal: snapshot.subtotal ?? null, finalTotal: null, walletBalance: details.balance,
      walletCurrency: details.currency,
    };
    if (tool.kind === "checkout_preview") return preview;
    if (!items.length) return { ...preview, status: "skipped", reason: "Steam 购物车为空" };

    // 当前证据限于购物车和匿名 Steam 入口。原生按钮继续负责所选商品处理和最终付费确认。
    await approve(session, approval, signal, {
      checkout: true, checkoutAction: "openCart",
      parameters: { steamAccountId: session.steamId, country: session.country,
        estimatedSubtotal: preview.estimatedSubtotal?.formatted, walletBalance: preview.walletBalance },
      operations: [{ kind: "steam-read", commerceRead: "checkoutHandoff" }],
      items: items.map(item => ({ ...item, commerceAction: "checkout" })),
    });
    const { cart: latest } = await checkoutSnapshot(session, signal);
    if (!sameCart(snapshot, latest))
      throw fault("STEAM_COMMERCE_CHANGED", "Steam 购物车或报价已变化，请重新核对后再结账");
    await approval.checkDefinition();
    const { tabId } = session.target;
    const tab = await chrome.tabs.get(tabId);
    await verifyCartTab(session, tab, signal);
    const activated = await chrome.tabs.update(tabId, { active: true });
    signal.throwIfAborted();
    await chrome.windows.update(activated.windowId, { focused: true });
    await verifyCartTab(session, await chrome.tabs.get(tabId), signal);
    return { ...preview, status: "native_checkout", purchaseHistory: store.purchaseHistory,
      reason: "已打开原购物车，请在 Steam 核对结账商品、最终金额和钱包支付方式后确认付款" };
  }

  async function execute(tool, args, signal, approval, execScript) {
    if (!approval || !root.STAI.CHAT_APPROVAL_MODES.includes(approval.mode))
      throw fault("CHAT_TOOL_NOT_ALLOWED", "请在 AI 对话中直接调用 Steam 结账或钱包工具");
    root.STBackgroundSteamStoreTools.argumentsFor(tool, args);
    try {
      if (tool.kind === "wallet_redeem") {
        const session = await wallet.open(approval.expectedSteamId, signal, execScript);
        if (!session) return wallet.needsPage();
        await approveRead(session, approval, signal, "wallet");
        return await wallet.redeem(session, signal, approval, execScript);
      }
      if (["checkout_preview", "wallet_checkout"].includes(tool.kind))
        return await checkoutTool(tool, signal, approval, execScript);
      throw new TypeError("Steam 结账或钱包工具未登记");
    } catch (error) {
      signal.throwIfAborted();
      if (error.code !== "CHAT_TOOL_DECLINED")
        log().warn("checkout-tool-failed", "Steam 结账或钱包工具执行失败", { error, phase: tool.kind });
      throw error;
    }
  }

  root.STBackgroundSteamCheckout = Object.freeze({ execute });
})(globalThis);
