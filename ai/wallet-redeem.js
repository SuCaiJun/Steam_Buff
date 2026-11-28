/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Project       : Steam Buff
 * @Description   : Steam 钱包充值码独立输入与确认页面
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";
  const byId = id => document.getElementById(id);
  const form = byId("enter-code"), input = byId("wallet-code"), review = byId("review-code");
  const status = byId("wallet-status"), confirm = byId("wallet-confirm"), back = byId("wallet-back");
  const ending = byId("code-ending");
  const { button, field, compose } = STComponents.css;
  STComponents.ensureStyle("steam-wallet-redeem-controls", compose(
    button(".actions > *", { variant: "secondary" }),
    button(".actions > .primary", { variant: "primary" }),
    button(".actions > .danger", { variant: "danger" }),
    field("#wallet-code"),
  ));
  const text = (key, fallback) => STI18n.text(key, fallback);
  let port, staged = "", submitted = false, finished = false;
  let composing = false;

  function clearCode() {
    staged = "";
    form.reset();
    ending.textContent = "";
  }

  function finish(key, fallback, links, balance) {
    if (finished) return;
    finished = true;
    clearCode();
    form.hidden = review.hidden = true;
    status.textContent = text(key, fallback);
    if (balance) {
      byId("wallet-before").hidden = false;
      byId("wallet-balance").textContent = balance;
    }
    byId("wallet-external").hidden = !links;
    port?.disconnect();
    status.focus();
  }

  function showResult(result, balance) {
    switch (result) {
      case "redeemed": finish("ai_chat_wallet_redeemed", "Steam 已确认兑换", false, balance); break;
      case "native_required": finish("ai_chat_wallet_native_required", "请在 Steam 完成地址或验证码核验", true); break;
      case "currency_unverified": finish("ai_chat_wallet_currency_unverified", "Steam 未单独显示币种", true); break;
      case "unavailable": finish("ai_chat_wallet_unavailable", "请在 Steam 官方兑换页核对当前钱包后继续", true); break;
      case "refused": finish("ai_chat_wallet_refused", "Steam 拒绝了这次兑换，请核对账号和充值码", true); break;
      case "rate_limited": finish("ai_chat_wallet_rate_limited", "Steam 限制了请求频率", true); break;
      default: finish("ai_chat_wallet_uncertain", "兑换结果待核实，请查看 Steam 账户记录", true);
    }
  }

  function cancel() {
    if (submitted || finished) return;
    try { port.postMessage({ type: "cancel" }); }
    finally { finish("ai_chat_wallet_cancelled", "已取消兑换", false); }
  }

  input.addEventListener("compositionstart", () => { composing = true; });
  input.addEventListener("compositionend", () => { composing = false; });
  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && (event.isComposing || composing)) event.preventDefault();
  });
  input.addEventListener("input", () => input.setCustomValidity(""));
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (finished || submitted || composing) return;
    staged = input.value.trim();
    if (!staged || /[\r\n]/.test(staged)) {
      input.setCustomValidity(text("ai_chat_wallet_code_required", "请输入一个 Steam 钱包充值码"));
      input.reportValidity();
      return;
    }
    input.value = "";
    const characters = Array.from(staged);
    ending.textContent = "••••" + (characters.length > 4 ? characters.slice(-4).join("") : "");
    form.hidden = true;
    review.hidden = false;
    byId("review-title").focus();
  });
  back.addEventListener("click", () => {
    if (submitted || finished) return;
    input.value = staged;
    staged = "";
    ending.textContent = "";
    review.hidden = true;
    form.hidden = false;
    input.focus();
  });
  confirm.addEventListener("click", event => {
    if (!event.isTrusted || submitted || finished || !staged) return;
    submitted = true;
    confirm.disabled = back.disabled = true;
    review.hidden = true;
    status.textContent = text("ai_chat_wallet_submitting", "Steam 正在处理兑换…");
    status.focus();
    try { port.postMessage({ type: "submit", code: staged }); }
    catch (error) {
      STLoggerFactory.createLogger("extension", "wallet-redeem").warn("wallet-port-lost", "Steam 兑换连接中断",
        { error: new Error("充值码提交连接中断", { cause: error.name }) });
      showResult("uncertain");
    } finally { clearCode(); }
  });
  for (const button of document.querySelectorAll("[data-cancel]")) button.addEventListener("click", cancel);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !event.isComposing && (!form.hidden || !review.hidden)) {
      event.preventDefault();
      cancel();
    }
  });
  window.addEventListener("pagehide", clearCode, { once: true });

  async function start() {
    await STI18n.ready();
    document.documentElement.lang = STI18n.intlLocale();
    for (const node of document.querySelectorAll("[data-text]")) node.textContent = text(node.dataset.text, node.textContent);
    document.title = byId("title").textContent;
    STConfig.externalNavigation.applyToLink(byId("wallet-native"), STConfig.vendors.steamStore.walletRedeemPage);
    STConfig.externalNavigation.applyToLink(byId("wallet-history"), STConfig.vendors.steamStore.purchaseHistory);
    port = chrome.runtime.connect({ name: "st-ai-wallet-redeem-v1" });
    port.onMessage.addListener(message => {
      if (message.type === "ready" && !finished) {
        byId("steam-id").textContent = message.steamId;
        byId("wallet-country").textContent = message.country;
        byId("wallet-currency").textContent = message.currency;
        if (message.balance) {
          byId("wallet-before").hidden = false;
          byId("wallet-balance").textContent = message.balance;
        }
        status.textContent = "";
        byId("wallet-account").hidden = form.hidden = input.disabled = false;
        input.focus();
      } else if (message.type === "cancelled") {
        finish("ai_chat_wallet_cancelled", "已取消兑换", false);
      } else if (message.type === "result") {
        showResult(message.result, message.balance);
      } else if (message.type === "error") {
        finish("ai_chat_wallet_expired", "兑换连接已失效，请重新打开兑换工具", true);
      }
    });
    port.onDisconnect.addListener(() => {
      if (submitted) showResult("uncertain");
      else finish("ai_chat_wallet_expired", "兑换连接已失效，请重新打开兑换工具", true);
    });
    port.postMessage({ type: "open" });
  }

  void start().catch(error => {
    STLoggerFactory.createLogger("extension", "wallet-redeem").error("wallet-window-failed", "未能打开 Steam 钱包兑换界面", { error });
    finish("ai_chat_wallet_expired", "兑换连接已失效，请重新打开兑换工具", false);
  });
})();
