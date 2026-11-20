/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 结算页购物车选择处理
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const t = (key, fallback, params) => globalThis.STI18n?.text?.(key, fallback, params) ?? fallback;

  const cart = globalThis.STCartRestore;
  const ENABLE_KEY = "st.settings.cart-select.enabled";
  const SCHEDULER_TASK = "cart-select-checkout-restore";
  const RESTORE_RETRY_MS = 2500;
  const RESTORE_MAX_TRIES = 12;
  const MATCH = globalThis.STConfig?.matchers;
  const log = window.STLoggerFactory.createLogger("store", "cart-select-checkout");
  let btn = null;
  const seenLogs = new Set();

  function logOnce(key, level, event, message, meta = {}) {
    if (seenLogs.has(key)) return;
    seenLogs.add(key);
    const method = log[level] || log.info;
    method(event, message, meta);
  }

  function visible(el) {
    return !!(el?.offsetWidth || el?.offsetHeight || el?.getClientRects?.().length);
  }

  function returnButton() {
    return Array.from(document.querySelectorAll("a, button"))
      .find(el => visible(el) && /返回商店|继续购物|Return to Store|Return to store|Continue Shopping|Continue shopping/i.test((el.textContent || "").trim()));
  }

  function addStyles() {
    window.STStore?.styles?.ensureFeatureStyle?.("cart-select-checkout");
  }

  function ensureButton() {
    if (!resultPage()) return;
    const back = returnButton();
    if (!back) return;

    addStyles();
    if (!btn) {
      btn = document.createElement("a");
      btn.href = new URL("/cart/", globalThis.STConfig.vendors.steamStore.origin).href;
      btn.id = "st_cart_restore_checkout";
      btn.className = "btnv6_blue_hoverfade btn_medium";
      const label = document.createElement("span");
      label.textContent = t("store_cartCheckout_restoreButton", "返回购物车恢复");
      btn.appendChild(label);
    }

    if (!btn.isConnected) {
      back.insertAdjacentElement("afterend", btn);
    }

  }

  function donePage() {
    if (!MATCH?.isSteamCheckoutHost?.(location.hostname)) return false;
    if (/receipt|thank|complete/i.test(location.pathname)) return true;

    const text = (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 5000);
    return /您的购物收据|确认代码|Your receipt|Confirmation code/i.test(text)
      || (/安装您的新内容/.test(text) && /库中找到新内容/.test(text))
      || (/Install your new content/i.test(text) && /library/i.test(text));
  }

  function errorPage() {
    if (!MATCH?.isSteamCheckoutHost?.(location.hostname)) return false;

    const text = (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 5000);
    return /购买尚未完成|请稍候几分钟，然后重试|反复遇到此错误|purchase has not been completed|try again in a few minutes/i.test(text);
  }

  function resultPage() {
    return donePage() || errorPage();
  }

  async function on() {
    const rt = await chrome.storage.local.get([ENABLE_KEY]);
    return rt[ENABLE_KEY] !== false;
  }

  async function run() {
    if (!await on()) {
      logOnce("disabled", "info", "checkout-cart-restore-skipped", "结算页购物车恢复因设置关闭而跳过", {
        reason: "disabled",
        path: location.pathname,
      });
      return;
    }

    const account = cart.pageAccount(document);
    if (!account) return;
    const stored = await chrome.storage.local.get(cart.KEY);
    const hasBatch = cart.records(stored[cart.KEY]).some(batch => batch.accountSteamId === account);
    if (!hasBatch) {
      logOnce("empty", "info", "checkout-cart-restore-skipped", "结算页没有暂存购物车数据", {
        reason: "empty",
        path: location.pathname,
      });
      return;
    }
    if (!resultPage()) {
      logOnce("not-result-page", "info", "checkout-cart-restore-skipped", "结算页未进入支付结果页，暂不显示恢复入口", {
        reason: "not-result-page",
      });
      return;
    }

    ensureButton();
  }

  function start() {
    run().catch((error) => {
      globalThis.STLoggerFactory.reportError(error, { domain: "store", feature: "cart", event: "start-failed", message: "启动功能失败", level: "error", phase: "start" });});
    if (!globalThis.STScheduler?.register) {
      logOnce("scheduler-unavailable", "warn", "checkout-cart-restore-skipped", "结算页购物车恢复缺少统一调度器", {
        reason: "scheduler-unavailable",
        path: location.pathname,
      });
      return;
    }
    let tries = 0;
    // 恢复入口补挂载迁移到统一调度器，保持原短轮询窗口并在完成后主动注销。
    globalThis.STScheduler.register(SCHEDULER_TASK, () => {
      tries++;
      run().catch((error) => {
        globalThis.STLoggerFactory.reportError(error, { domain: "store", feature: "cart", event: "start-failed", message: "启动功能失败", level: "error", phase: "start" });});
      if (tries >= RESTORE_MAX_TRIES || (resultPage() && btn?.isConnected)) {
        globalThis.STScheduler?.unregister?.(SCHEDULER_TASK);
      }
    }, null, { intervalMs: RESTORE_RETRY_MS });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
