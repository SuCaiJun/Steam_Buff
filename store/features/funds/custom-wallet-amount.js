/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店钱包充值与礼物卡自定义金额
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

/**
 * 在 Steam 钱包充值和礼物卡页克隆最低档，插入自定义金额行。
 * 提交只写页面已有的隐藏表单，金额倍率从最低档显示价与 Steam 最小单位算出。
 */
((root, factory) => {
  "use strict";

  const core = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = core;
    return;
  }

  const api = root.STStore;
  if (!api) return;
  api.features = api.features || {};
  api.features.customWalletAmount = Object.freeze({
    start: core.start,
    stop: core.stop,
  });
})(typeof globalThis !== "undefined" ? globalThis : window, (root) => {
  "use strict";

  const FEATURE_ID = "custom-wallet-amount";
  const MARK = "st-custom-wallet-amount";
  const INPUT_ID = "st-custom-wallet-amount-input";
  const WALLET_PATH = /^\/steamaccount\/addfunds\/?$/i;
  const GIFT_PATH = /^\/digitalgiftcards\/selectgiftcard\/?$/i;
  const GIFT_AMOUNT_RE = /submitSelectGiftCard\(\s*(\d+)\s*\)/i;
  const MATCH = root.STConfig?.matchers;

  /**
   * 从价格文案解析用户可见金额。
   * 末尾 3 位分隔符按千分位处理，2 位按小数处理；与 live 页 ¥ 500 / ¥ 1,000 及欧式 5,00 格式一致。
   * @param {string} text - 页面价格文案。
   * @returns {number|null} 解析出的金额，失败时为 null。
   */
  function parseDisplayAmount(text) {
    const numeric = String(text || "").replace(/[^\d.,]/g, "");
    if (!numeric) return null;
    const lastComma = numeric.lastIndexOf(",");
    const lastDot = numeric.lastIndexOf(".");
    if (lastComma < 0 && lastDot < 0) {
      const value = Number(numeric);
      return Number.isFinite(value) ? value : null;
    }
    const lastSep = Math.max(lastComma, lastDot);
    const frac = numeric.slice(lastSep + 1);
    if (frac.length === 3) {
      const value = Number(numeric.replace(/[.,]/g, ""));
      return Number.isFinite(value) ? value : null;
    }
    const intPart = numeric.slice(0, lastSep).replace(/[.,]/g, "");
    const value = Number(`${intPart}.${frac}`);
    return Number.isFinite(value) ? value : null;
  }

  /**
   * 拆出价格文案里数字前后的货币符号。
   * @param {string} text - 页面价格文案。
   * @returns {{prefix: string, suffix: string, numeric: string}} 符号与数字片段。
   */
  function splitPriceParts(text) {
    const raw = String(text || "");
    const start = raw.search(/\d/u);
    if (start < 0) {
      return { prefix: raw, suffix: "", numeric: "" };
    }
    let end = raw.length;
    for (let i = raw.length - 1; i >= start; i -= 1) {
      if (/\d/u.test(raw[i])) {
        end = i + 1;
        break;
      }
    }
    return {
      prefix: raw.slice(0, start),
      suffix: raw.slice(end),
      numeric: raw.slice(start, end),
    };
  }

  /**
   * 用最低档显示价和 Steam 最小单位计算倍率。
   * @param {number} display - 页面显示金额。
   * @param {number} steam - 按钮 data-amount 或 submitSelectGiftCard 参数。
   * @returns {number|null} 倍率，对不上时为 null。
   */
  function resolveScale(display, steam) {
    if (!Number.isFinite(display) || display <= 0 || !Number.isFinite(steam) || steam <= 0) {
      return null;
    }
    const scale = Math.round(steam / display);
    if (!Number.isFinite(scale) || scale <= 0) {
      return null;
    }
    if (Math.round(display * scale) !== steam) {
      return null;
    }
    return scale;
  }

  /**
   * 把用户输入换成 Steam 表单 amount 字符串。
   * @param {number} value - 用户可见金额。
   * @param {number} scale - 显示价到最小单位的倍率。
   * @returns {string|null} 整数金额字符串。
   */
  function toSteamAmount(value, scale) {
    if (!Number.isFinite(value) || !Number.isFinite(scale) || scale <= 0) {
      return null;
    }
    return String(Math.round(value * scale));
  }

  /**
   * 自定义金额是否允许提交。低于最低档、空值和非数字都不可提交。
   * @param {number} value - 输入框数值。
   * @param {number} minValue - 页面最低档显示金额。
   * @returns {boolean} 是否允许提交。
   */
  function isValidAmount(value, minValue) {
    return Number.isFinite(value) && Number.isFinite(minValue) && value >= minValue;
  }

  /**
   * 从充值按钮或礼物卡链接读取 Steam 最小单位金额。
   * 钱包 live DOM 使用 data-amount；礼物卡 live DOM 把金额写在 href 的 submitSelectGiftCard 参数里。
   * @param {Element|null} link - 提交用的 a 元素。
   * @returns {number|null} Steam 最小单位金额。
   */
  function steamAmountFromLink(link) {
    const dataAmount = link?.getAttribute?.("data-amount") || "";
    if (/^\d+$/u.test(dataAmount)) {
      return Number(dataAmount);
    }
    const href = link?.getAttribute?.("href") || "";
    const match = href.match(GIFT_AMOUNT_RE);
    return match ? Number(match[1]) : null;
  }

  /**
   * 判断当前是否为钱包充值或礼物卡选额页。
   * @param {string} pathname - location.pathname。
   * @param {string} hostname - location.hostname。
   * @returns {{ok: boolean, gift: boolean}} 是否命中及是否礼物卡。
   */
  function detectPage(pathname, hostname) {
    if (MATCH?.isSteamStoreHost?.(hostname) !== true) {
      return { ok: false, gift: false };
    }
    const path = String(pathname || "");
    if (WALLET_PATH.test(path)) {
      return { ok: true, gift: false };
    }
    if (GIFT_PATH.test(path)) {
      return { ok: true, gift: true };
    }
    return { ok: false, gift: false };
  }

  function i18n(key, fallback, params) {
    return root.STI18n?.text?.(key, fallback, params) ?? fallback;
  }

  function logger() {
    return root.STLoggerFactory?.createLogger?.("store", FEATURE_ID);
  }

  function storeApi() {
    return root.STStore;
  }

  function enabled() {
    return storeApi()?.settings?.on?.(FEATURE_ID) === true;
  }

  /**
   * 按最低档原文格式化用户输入，保留货币符号和千分位。
   * @param {string} template - 最低档价格文案。
   * @param {number} value - 用户输入。
   * @returns {string} 用于标题或礼物卡角标的文案。
   */
  function formatLikeTemplate(template, value) {
    const parts = splitPriceParts(template);
    const sample = parts.numeric;
    const lastComma = sample.lastIndexOf(",");
    const lastDot = sample.lastIndexOf(".");
    const lastSep = Math.max(lastComma, lastDot);
    let thousand = ",";
    let decimal = ".";
    let places = 0;
    if (lastSep >= 0) {
      const frac = sample.slice(lastSep + 1);
      if (frac.length === 3) {
        thousand = sample[lastSep];
      } else {
        decimal = sample[lastSep];
        thousand = decimal === "," ? "." : ",";
        places = frac.length;
      }
    }
    const abs = Math.abs(value);
    const usePlaces = Number.isInteger(abs) ? 0 : Math.max(places, 2);
    const [intPart, fracPart = ""] = abs.toFixed(usePlaces).split(".");
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/gu, thousand);
    const numberText = usePlaces > 0 ? `${grouped}${decimal}${fracPart}` : grouped;
    return `${parts.prefix}${numberText}${parts.suffix}`;
  }

  function inputStep(scale) {
    if (!Number.isFinite(scale) || scale <= 0) return "1";
    const step = 1 / scale;
    if (step >= 1) return "1";
    const places = Math.min(6, Math.max(1, Math.round(Math.log10(scale))));
    return step.toFixed(places);
  }

  function currentPage() {
    return detectPage(root.location?.pathname || "", root.location?.hostname || "");
  }

  function fundsForm(doc) {
    return doc.querySelector("#form_addfunds");
  }

  function amountField(form) {
    return form?.querySelector("#input_amount") || form?.querySelector('input[name="amount"]');
  }

  function currencyField(form) {
    return form?.querySelector("#input_currency") || form?.querySelector('input[name="currency"]');
  }

  function bindInputGuard(node) {
    node.addEventListener("click", (event) => event.stopPropagation());
    node.addEventListener("mousedown", (event) => event.stopPropagation());
    node.addEventListener("keydown", (event) => event.stopPropagation());
  }

  /**
   * 根据输入合法性切换提交按钮，低于最低档时只提示不改写金额。
   * @param {{clone: Element, submit: Element, hint: Element|null, giftText: Element|null, input: HTMLInputElement, minValue: number, minLabel: string, priceTemplate: string, gift: boolean, scale: number}} ctx - 当前自定义行上下文。
   * @returns {{ok: boolean, value: number, steamAmount: string|null}} 校验结果。
   */
  function syncState(ctx) {
    const value = ctx.input.value === "" ? Number.NaN : Number(ctx.input.value);
    const ok = isValidAmount(value, ctx.minValue);
    const steamAmount = ok ? toSteamAmount(value, ctx.scale) : null;
    ctx.clone.classList.toggle("is-invalid", !ok);
    ctx.submit.setAttribute("aria-disabled", ok ? "false" : "true");
    const hintText = ok
      ? (ctx.gift
        ? i18n("store_customWalletAmount_giftHint", "选择自定义金额")
        : i18n("store_customWalletAmount_hint", "请输入不低于 $min$ 的金额", { min: ctx.minLabel }))
      : (ctx.gift
        ? i18n("store_customWalletAmount_giftBelowMin", "不能低于 $min$", { min: ctx.minLabel })
        : i18n("store_customWalletAmount_belowMin", "不能低于最低资金级别 $min$", { min: ctx.minLabel }));
    ctx.submit.title = ok ? "" : hintText;
    if (ctx.hint) {
      ctx.hint.textContent = hintText;
      ctx.hint.classList.toggle("is-invalid", !ok);
    }
    if (ctx.giftText && Number.isFinite(value)) {
      ctx.giftText.textContent = formatLikeTemplate(ctx.priceTemplate, value);
    }
    if (!ctx.gift) {
      const heading = ctx.clone.querySelector("h1");
      if (heading) {
        heading.textContent = i18n("store_customWalletAmount_title", "充值自定义金额");
      }
    }
    return { ok, value, steamAmount };
  }

  /**
   * 把自定义金额写入 Steam 隐藏表单并提交。
   * 钱包页同时写 currency；礼物卡页 live DOM 没有 #input_currency，提交函数也只改 amount。
   * @param {{gift: boolean, currency: string, form: HTMLFormElement, steamAmount: string}} payload - 提交数据。
   * @returns {boolean} 是否成功提交。
   */
  function submitFunds(payload) {
    const amount = amountField(payload.form);
    if (!amount) {
      return false;
    }
    amount.value = payload.steamAmount;
    if (!payload.gift) {
      const currency = currencyField(payload.form);
      if (!currency) {
        return false;
      }
      currency.value = payload.currency;
    }
    payload.form.submit();
    return true;
  }

  function cleanup(doc) {
    doc.querySelector(`.${MARK}`)?.remove();
    storeApi()?.styles?.removeFeatureStyle?.(FEATURE_ID);
  }

  /**
   * 在最低档前面插入自定义金额行。
   * @returns {boolean} 是否插入成功。
   */
  function mount() {
    const page = currentPage();
    const doc = root.document;
    const log = logger();
    if (!page.ok || !doc) {
      return false;
    }
    if (doc.querySelector(`.${MARK}`)) {
      return true;
    }

    const form = fundsForm(doc);
    if (!form || !amountField(form)) {
      log?.warn?.("custom-wallet-amount-form-missing", "自定义金额未插入，缺少 Steam 充值表单", {
        gift: page.gift,
        path: root.location?.pathname || "",
      });
      return false;
    }
    if (!page.gift && !currencyField(form)) {
      log?.warn?.("custom-wallet-amount-form-missing", "自定义金额未插入，缺少钱包货币字段", {
        gift: false,
        path: root.location?.pathname || "",
      });
      return false;
    }

    const minRow = doc.querySelector(page.gift ? ".giftcard_selection" : ".addfunds_area_purchase_game");
    const parent = minRow?.parentNode;
    if (!minRow || !parent) {
      log?.warn?.("custom-wallet-amount-row-missing", "自定义金额未插入，找不到最低档行", {
        gift: page.gift,
        path: root.location?.pathname || "",
      });
      return false;
    }

    const priceNode = minRow.querySelector(page.gift ? ".giftcard_text" : ".price");
    const submit = minRow.querySelector("a");
    const priceTemplate = priceNode?.textContent?.trim() || "";
    const display = parseDisplayAmount(priceTemplate);
    const steam = steamAmountFromLink(submit);
    const scale = resolveScale(display, steam);
    if (!priceNode || !submit || display == null || steam == null || scale == null) {
      log?.warn?.("custom-wallet-amount-scale-invalid", "自定义金额未插入，无法从最低档计算金额倍率", {
        gift: page.gift,
        path: root.location?.pathname || "",
      });
      return false;
    }

    const clone = minRow.cloneNode(true);
    clone.classList.add(MARK);
    const clonePrice = clone.querySelector(page.gift ? ".giftcard_text" : ".price");
    const cloneSubmit = clone.querySelector("a");
    const cloneHint = page.gift
      ? clone.querySelector(".giftcard_style")
      : clone.querySelector("p");
    if (!clonePrice || !cloneSubmit || !cloneHint) {
      log?.warn?.("custom-wallet-amount-clone-invalid", "自定义金额未插入，克隆行缺少价格或提交按钮", {
        gift: page.gift,
        path: root.location?.pathname || "",
      });
      return false;
    }

    cloneSubmit.removeAttribute("href");
    cloneSubmit.removeAttribute("onclick");
    cloneSubmit.setAttribute("role", "button");

    const parts = splitPriceParts(priceTemplate);
    const input = doc.createElement("input");
    input.type = "number";
    input.id = INPUT_ID;
    input.className = `${MARK}__input`;
    input.min = String(display);
    input.step = inputStep(scale);
    input.value = String(display);
    input.setAttribute("inputmode", "decimal");
    input.setAttribute("aria-label", i18n("store_customWalletAmount_inputAria", "自定义金额"));

    const hintNode = doc.createElement("span");
    hintNode.className = `${MARK}__hint`;
    if (page.gift) {
      cloneHint.replaceChildren();
      cloneHint.append(hintNode, " ", input);
      bindInputGuard(cloneHint);
    } else {
      clonePrice.replaceChildren();
      if (parts.prefix) clonePrice.append(parts.prefix);
      clonePrice.append(input);
      if (parts.suffix) clonePrice.append(parts.suffix);
      const heading = clone.querySelector("h1");
      if (heading) {
        heading.textContent = i18n("store_customWalletAmount_title", "充值自定义金额");
      }
      cloneHint.replaceChildren(hintNode);
    }
    bindInputGuard(input);

    const ctx = {
      clone,
      submit: cloneSubmit,
      hint: hintNode,
      giftText: page.gift ? clonePrice : null,
      input,
      minValue: display,
      minLabel: priceTemplate,
      priceTemplate,
      gift: page.gift,
      scale,
    };
    const currency = cloneSubmit.getAttribute("data-currency") || submit.getAttribute("data-currency") || "";

    const onInput = () => {
      syncState(ctx);
    };
    input.addEventListener("input", onInput);
    input.addEventListener("change", onInput);
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      event.stopPropagation();
      cloneSubmit.click();
    });

    cloneSubmit.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const state = syncState(ctx);
      if (!state.ok || !state.steamAmount) {
        return;
      }
      const ok = submitFunds({
        gift: page.gift,
        currency,
        form,
        steamAmount: state.steamAmount,
      });
      if (!ok) {
        log?.error?.("custom-wallet-amount-submit-failed", "自定义金额提交失败，Steam 充值表单字段不可用", {
          gift: page.gift,
          path: root.location?.pathname || "",
        });
      }
    });

    parent.insertBefore(clone, minRow);
    syncState(ctx);
    log?.info?.("custom-wallet-amount-start-success", "自定义金额行已插入最低档之前", {
      gift: page.gift,
      path: root.location?.pathname || "",
    });
    return true;
  }

  /**
   * 启动自定义金额。非目标页或开关关闭时直接跳过。
   * @returns {boolean} 是否完成插入。
   */
  function start() {
    const page = currentPage();
    if (!page.ok || !enabled()) {
      return false;
    }
    try {
      storeApi()?.styles?.ensureFeatureStyle?.(FEATURE_ID);
      return mount();
    } catch (error) {
      logger()?.error?.("custom-wallet-amount-start-failed", "自定义金额启动失败", {
        gift: page.gift,
        path: root.location?.pathname || "",
        error,
      });
      return false;
    }
  }

  /**
   * 移除自定义金额行和样式。
   * @returns {boolean} 是否执行了清理。
   */
  function stop() {
    const doc = root.document;
    if (!doc) return false;
    cleanup(doc);
    return true;
  }

  return {
    FEATURE_ID,
    parseDisplayAmount,
    splitPriceParts,
    resolveScale,
    toSteamAmount,
    isValidAmount,
    steamAmountFromLink,
    detectPage,
    formatLikeTemplate,
    start,
    stop,
  };
});
