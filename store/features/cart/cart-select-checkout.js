/*
 * @Author        : 顾青离
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

  const RESTORE_KEY = "st.store.cartSelect.restore";
  const SEL_KEY = "st.store.cartSelect.selection";
  const ENABLE_KEY = "st.settings.cart-select.enabled";
  const SCHEDULER_TASK = "cart-select-checkout-restore";
  const RESTORE_TTL_MS = 30 * 60 * 1000;
  const RESTORE_RETRY_MS = 2500;
  const RESTORE_MAX_TRIES = 12;
  const REQUEST_TIMEOUT_MS = 12 * 1000;
  const STEAM_API_HOST = globalThis.STConfig?.vendors?.steamApi?.host || "";
  const MATCH = globalThis.STConfig?.matchers;
  const log = window.STLoggerFactory.createLogger("store", "cart-select-checkout");
  let restored = false;
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

  function box() {
    try {
      return chrome.storage.local;
    } catch {
      return null;
    }
  }

  function get(keys) {
    const area = box();
    if (!area) return Promise.resolve({});
    return new Promise(resolve => {
      area.get(keys, rt => resolve(chrome.runtime.lastError ? {} : rt || {}));
    });
  }

  function put(data) {
    const area = box();
    if (!area) return Promise.resolve(false);
    return new Promise(resolve => {
      area.set(data, () => resolve(!chrome.runtime.lastError));
    });
  }

  function remove(keys) {
    const area = box();
    if (!area) return Promise.resolve(false);
    return new Promise(resolve => {
      area.remove(keys, () => resolve(!chrome.runtime.lastError));
    });
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
      if (globalThis.STMessageBus?.send) {
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
      label.textContent = "恢复暂存购物车数据";
      btn.appendChild(label);
      btn.addEventListener("click", event => {
        event.preventDefault();
        manualRestore().catch(() => setBtn("恢复失败，重试", "bad"));
      });
    }

    if (!btn.isConnected) {
      back.insertAdjacentElement("afterend", btn);
    }

    if (restored) setBtn("已恢复暂存购物车", "done");
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
    const rt = await get([ENABLE_KEY]);
    return rt[ENABLE_KEY] !== false;
  }

  function expiredBatch(batch) {
    const createdAt = Number(batch?.createdAt) || 0;
    return !createdAt || Date.now() - createdAt > RESTORE_TTL_MS;
  }

  function alive(batch) {
    return batch?.id
      && Array.isArray(batch.items)
      && !expiredBatch(batch);
  }

  async function batches() {
    const rt = await get([RESTORE_KEY]);
    const out = (Array.isArray(rt[RESTORE_KEY]) ? rt[RESTORE_KEY] : []).filter(alive);
    if (out.length === 0) await remove([RESTORE_KEY]);
    return out;
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

  function tokenFromPage() {
    if (!STEAM_API_HOST) return "";
    const entry = performance.getEntriesByType("resource")
      .map(item => item.name || "")
      .find(url => url.includes(`${STEAM_API_HOST}/`) && url.includes("access_token="));
    if (!entry) return "";

    try {
      return new URL(entry).searchParams.get("access_token") || "";
    } catch {
      return "";
    }
  }

  function countryFromPage() {
    try {
      const config = JSON.parse(document.documentElement.dataset.config || "{}");
      if (config.COUNTRY) return String(config.COUNTRY).toUpperCase();
    } catch {}

    const match = document.cookie.match(/steamCountry=([a-zA-Z]{2})/);
    return match ? match[1].toUpperCase() : "";
  }

  async function restore(batches) {
    const token = batches.find(batch => batch.token)?.token || tokenFromPage();
    if (!token) return false;

    const country = batches.find(batch => batch.country)?.country || countryFromPage() || "CN";
    const items = itemsFrom(batches).map(item => {
      if (item.kind === "bundle") {
        return { bundleid: Number(item.itemId) };
      }
      return { packageid: Number(item.itemId) };
    });

    if (items.length === 0) return true;

    const input = JSON.stringify({
      user_country: country,
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
    if (!res.success) return false;

    try {
      const data = JSON.parse(res.data || "{}");
      return !!(data.response || data.success || res.data);
    } catch {
      return true;
    }
  }

  async function doRestore(batches) {
    if (restoring) {
      logOnce("restore-busy", "info", "checkout-cart-restore-skipped", "结算页购物车恢复已在进行中", batchMeta(batches, {
        reason: "busy",
      }));
      return false;
    }
    restoring = true;
    setBtn("正在恢复暂存购物车数据...", "busy");
    const startedAt = Date.now();
    log.info("checkout-cart-restore-start", "开始恢复结算页暂存购物车数据", batchMeta(batches));

    try {
      const ok = await restore(batches);
      if (ok) {
        restored = true;
        setBtn("已恢复暂存购物车数据", "done");
        log.info("checkout-cart-restore-success", "结算页暂存购物车数据恢复完成", batchMeta(batches, {
          durationMs: Date.now() - startedAt,
        }));
      } else {
        await put({ [RESTORE_KEY]: batches });
        setBtn("恢复失败，重试", "bad");
        log.warn("checkout-cart-restore-failed", "结算页暂存购物车数据恢复失败", batchMeta(batches, {
          durationMs: Date.now() - startedAt,
          reason: "restore-returned-false",
        }));
      }
      return ok;
    } catch (error) {
      await put({ [RESTORE_KEY]: batches });
      setBtn("恢复失败，重试", "bad");
      log.error("checkout-cart-restore-failed", error, batchMeta(batches, {
        durationMs: Date.now() - startedAt,
        error,
      }));
      throw error;
    } finally {
      restoring = false;
    }
  }

  async function manualRestore() {
    const todo = await batches();
    if (todo.length === 0) {
      setBtn("暂无暂存购物车", "done");
      logOnce("manual-empty", "info", "checkout-cart-restore-skipped", "结算页没有可恢复的暂存购物车数据", {
        reason: "empty",
        path: location.pathname,
      });
      return;
    }
    await doRestore(todo);
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
    run().catch(() => {});
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
      run().catch(() => {});
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
