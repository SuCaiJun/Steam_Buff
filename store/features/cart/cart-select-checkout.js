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
  const REQUEST_TIMEOUT_MS = 12 * 1000;
  const MATCH = globalThis.STConfig?.matchers;
  const log = window.STLoggerFactory.createLogger("store", "cart-select-checkout");
  const restoredIds = new Set();
  let restoring = false;
  let btn = null;
  const seenLogs = new Set();

  function logOnce(key, level, event, message, meta = {}) {
    if (seenLogs.has(key)) return;
    seenLogs.add(key);
    const method = log[level] || log.info;
    method(event, message, meta);
  }

  function batchMeta(batches, extra = {}) {
    return {
      batchCount: Array.isArray(batches) ? batches.length : 0,
      itemCount: itemsFrom(Array.isArray(batches) ? batches : []).length,
      path: location.pathname,
      ...extra,
    };
  }

  function storeFetch(url, options = {}) {
    return new Promise(resolve => {
      let done = false;
      let timer = 0;
      const finish = (response) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(response || { success: false, error: "请求失败" });
      };
      timer = setTimeout(() => {
        finish({ success: false, error: "请求超时", status: 0, ok: false });
      }, Number(options.timeoutMs) || REQUEST_TIMEOUT_MS);
      if (globalThis.STMessageBus?.ready && globalThis.STMessageBus?.send) {
        globalThis.STMessageBus.send({
          type: "STORE_FETCH",
          url,
          method: options.method || "GET",
          headers: options.headers || {},
          body: options.body,
          data: options.data,
          timeoutMs: options.timeoutMs || REQUEST_TIMEOUT_MS,
        }, {
          timeoutMs: options.timeoutMs || REQUEST_TIMEOUT_MS,
        }).then(response => finish(response)).catch(error => {
          globalThis.STLoggerFactory.reportError(error, { domain: "store", feature: "cart", event: "store-fetch-failed", message: "商店功能处理失败", level: "error", phase: "storeFetch" });
          finish({ success: false, error: error?.message || "请求失败", status: 0, ok: false });
        });
        return;
      }
      chrome.runtime.sendMessage({
        type: "STORE_FETCH",
        url,
        method: options.method || "GET",
        headers: options.headers || {},
        body: options.body,
        data: options.data,
        timeoutMs: options.timeoutMs || REQUEST_TIMEOUT_MS,
      }, response => finish(response));
    });
  }

  function visible(el) {
    return !!(el?.offsetWidth || el?.offsetHeight || el?.getClientRects?.().length);
  }

  function returnButton() {
    return Array.from(document.querySelectorAll("a, button"))
      .find(el => visible(el) && /返回商店|继续购物|Return to Store|Return to store|Continue Shopping|Continue shopping/i.test((el.textContent || "").trim()));
  }

  function setBtn(text, state = "") {
    if (!btn) return;
    btn.querySelector("span").textContent = text;
    btn.classList.toggle("st_cart_restore_busy", state === "busy" || state === "done");
    btn.classList.toggle("st_cart_restore_bad", state === "bad");
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
      btn.href = "#";
      btn.id = "st_cart_restore_checkout";
      btn.className = "btnv6_blue_hoverfade btn_medium";
      const label = document.createElement("span");
      label.textContent = t("store_cartCheckout_restoreButton", "恢复暂存购物车数据");
      btn.appendChild(label);
      btn.addEventListener("click", event => {
        event.preventDefault();
        manualRestore().catch(error => {
          log.error("checkout-cart-restore-failed", "手动恢复购物车失败", { error });
          setBtn(t("store_cartCheckout_restoreButton", "恢复暂存购物车数据"));
          void window.STFeedback.show(document.body, { message: error.message });
        });
      });
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

  async function batches() {
    const rt = await chrome.storage.local.get([cart.KEY]);
    return cart.read(rt[cart.KEY]);
  }

  function itemsFrom(batches) {
    const out = [];
    const seen = new Set();
    for (const batch of batches) {
      for (const item of batch.items || []) {
        if (!item?.kind || !item?.itemId || seen.has(item.key)) continue;
        seen.add(item.key);
        out.push(item);
      }
    }
    return out;
  }

  async function restore(batches, { country, token }) {
    const items = itemsFrom(batches).map(item => {
      if (item.kind === "bundle") {
        return { bundleid: Number(item.itemId) };
      }
      return { packageid: Number(item.itemId) };
    });

    if (items.length === 0) return false;

    const input = JSON.stringify({
      user_country: country.toUpperCase(),
      items,
    });
    const apiCfg = globalThis.STConfig?.vendors?.steamApi;
    const url = apiCfg?.cartAddItems?.() || "";
    const body = apiCfg?.cartAddItemsBody?.(token, input) || "";
    if (!url) return false;
    const res = await storeFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body,
    });
    // AddItemsToCart 返回更新后的购物车，逐项核对本次暂存的商品。
    const uncertain = t("store_cartCheckout_restoreUnconfirmed", "无法确认已恢复全部商品，请打开购物车核对。暂存记录已保留。");
    if (!res.success) throw new Error(uncertain, { cause: new Error(res.error || "购物车恢复请求失败") });
    let data;
    try {
      data = JSON.parse(res.data);
    } catch (cause) {
      throw new Error(uncertain, { cause });
    }
    if (!cart.containsItems(data, items)) {
      throw new Error(uncertain);
    }
    return true;
  }

  async function doRestore(batches, session) {
    if (restoring) {
      logOnce("restore-busy", "info", "checkout-cart-restore-skipped", "结算页购物车恢复已在进行中", batchMeta(batches, {
        reason: "busy",
      }));
      return false;
    }
    restoring = true;
    setBtn(t("store_cartCheckout_restoring", "正在恢复暂存购物车数据..."), "busy");
    const startedAt = Date.now();
    log.info("checkout-cart-restore-start", "开始恢复结算页暂存购物车数据", batchMeta(batches));

    try {
      const ok = await restore(batches, session);
      if (ok) {
        for (const batch of batches) restoredIds.add(batch.id);
        setBtn(t("store_cartCheckout_restoreComplete", "已恢复暂存购物车数据"), "done");
        void window.STFeedback.show(document.body, { message: t("store_cartCheckout_restoreComplete", "已恢复暂存购物车数据") });
        log.info("checkout-cart-restore-success", "结算页暂存购物车数据恢复完成", batchMeta(batches, {
          durationMs: Date.now() - startedAt,
        }));
      } else {
        setBtn(t("store_cartCheckout_restoreButton", "恢复暂存购物车数据"));
        void window.STFeedback.show(document.body, { message: t("store_cartCheckout_restoreFailed", "恢复失败，请重试") });
        log.warn("checkout-cart-restore-failed", "结算页暂存购物车数据恢复失败", batchMeta(batches, {
          durationMs: Date.now() - startedAt,
          reason: "restore-returned-false",
        }));
      }
      return ok;
    } finally {
      restoring = false;
    }
  }

  async function manualRestore() {
    const todo = await batches();
    if (todo.length === 0) {
      void window.STFeedback.show(document.body, { message: t("store_cartCheckout_empty", "暂无暂存购物车") });
      logOnce("manual-empty", "info", "checkout-cart-restore-skipped", "结算页没有可恢复的暂存购物车数据", {
        reason: "empty",
        path: location.pathname,
      });
      return;
    }
    const session = cart.pageSession(document);
    if (typeof session?.country !== "string" || !/^[a-z]{2}$/i.test(session.country)
      || typeof session.token !== "string" || !session.token) {
      throw new Error(t("store_cartCheckout_sessionUnavailable", "无法确认当前 Steam 账号或商店国家。暂存已保留，请回到购物车恢复。"));
    }
    const mine = cart.owned(todo, session.accountSteamId, session.token);
    if (!mine.length) {
      throw new Error(t("store_cartCheckout_ownerUnconfirmed", "无法确认暂存商品属于当前 Steam 账号。请使用暂存时的账号，回到购物车核对。"));
    }
    const pending = mine.filter(batch => !restoredIds.has(batch.id));
    if (pending.length) await doRestore(pending, session);
    else setBtn(t("store_cartCheckout_restored", "已恢复暂存购物车"), "done");
  }

  async function run() {
    if (!await on()) {
      logOnce("disabled", "info", "checkout-cart-restore-skipped", "结算页购物车恢复因设置关闭而跳过", {
        reason: "disabled",
        path: location.pathname,
      });
      return;
    }

    const todo = await batches();
    if (todo.length === 0) {
      logOnce("empty", "info", "checkout-cart-restore-skipped", "结算页没有暂存购物车数据", {
        reason: "empty",
        path: location.pathname,
      });
      return;
    }
    if (!resultPage()) {
      logOnce("not-result-page", "info", "checkout-cart-restore-skipped", "结算页未进入支付结果页，暂不显示恢复入口", batchMeta(todo, {
        reason: "not-result-page",
      }));
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
