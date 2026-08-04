/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 购买区历史价格紧凑展示入口
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const t = (key, fallback, params) => globalThis.STI18n?.text?.(key, fallback, params) ?? fallback;

  const PROVIDER_LABEL = "IsThereAnyDeal";
  const DLC_SECTION_SELECTOR = ".game_area_dlc_section";
  const DLC_ROW_SELECTOR = ".game_area_dlc_row";
  const DLC_NODE_CLASS = "st-dlc-lowest-price";
  const MONITOR_MODAL_ID = "st-price-monitor-modal";
  const MONITOR_QUERY_URL = window.STConfig.steamBuff("/price-monitors/query");
  const MONITOR_SAVE_URL = window.STConfig.steamBuff("/price-monitors");
  const MONITOR_DELETE_URL = window.STConfig.steamBuff("/price-monitors/delete");
  const MONITOR_DASHBOARD_URL = "https://www.sucaijun.com/user/price-alert";
  const AUTH_REFRESH_URL = window.STConfig.loginAuth("/auth/refresh");
  const log = window.STLoggerFactory.createLogger("store", "price-history");
  const THEME = window.STTheme || {};
  const colors = THEME.colors || {};
  const spacing = THEME.spacing || {};
  const { applyStyles } = api.styles || {};
  const hasHiddenAncestor = api.dom?.hasHiddenAncestor;
  const formatPrice = api.format?.formatPrice;
  const formatDate = api.format?.formatDate;
  const calculateDaysDiff = api.format?.calculateDaysDiff;
  const externalNavigation = globalThis.STConfig.externalNavigation;
  let seq = 0;
  let monitorModalState = null;
  const monitorCache = new Map();
  const monitorHosts = new Map();
  const monitorItemNameCache = new Map();
  const monitorItemNamePending = new Map();
  let monitorAuthClient = null;

  function getMonitorAuthClient() {
    if (!monitorAuthClient) {
      monitorAuthClient = window.STAuthClient?.createClient({
        storage: window.STSettings?.storage || null,
        refreshUrl: AUTH_REFRESH_URL,
        loginMessage: t("store_priceHistory_monitorLoginRequired", "请先在设置中登录"),
        expiredMessage: t("store_priceHistory_monitorLoginExpired", "登录已过期，请重新登录"),
      }) || null;
    }
    return monitorAuthClient;
  }

  function normalizeSteamText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isSteamPriceTextFree(priceText) {
    const text = normalizeSteamText(priceText);
    const lowerText = text.toLowerCase();

    return text.includes("免费")
      || text.includes("免費")
      || text.includes("無料")
      || /\bfree\b/.test(lowerText)
      || lowerText.includes("free to play")
      || lowerText.includes("play for free")
      || lowerText.includes("kostenlos")
      || lowerText.includes("gratuit");
  }

  function visibleSections() {
    const sections = Array.from(new Set(Array.from(document.querySelectorAll(
      "#game_area_purchase .game_area_purchase_game, .game_area_purchase_game"
    ))));

    return sections.filter((section) => {
      if (typeof hasHiddenAncestor === "function") {
        return !hasHiddenAncestor(section, true);
      }

      return !!(section.offsetWidth || section.offsetHeight || section.getClientRects().length);
    });
  }

  function secText(section) {
    const nodes = section.querySelectorAll([
      ".title",
      ".game_purchase_price",
      ".discount_final_price",
      ".discount_original_price",
      ".game_purchase_action",
      ".btn_addtocart",
      ".btn_green_steamui",
    ].join(","));

    return normalizeSteamText(Array.from(nodes).map(node => node.textContent).join(" "));
  }

  function isDemoPurchaseSection(section) {
    const text = secText(section).toLowerCase();
    return text.includes("demo")
      || text.includes("试玩")
      || text.includes("試玩")
      || text.includes("体験版");
  }

  function freeSec(section) {
    const text = secText(section);
    return isSteamPriceTextFree(text)
      || !!section.querySelector("[onclick*='AddFreeLicense'], a[href*='/checkout/addfreelicense'], a[href*='/freelicense/addfreelicense']");
  }

  function paidSec(section) {
    if (freeSec(section)) return false;

    const priceText = normalizeSteamText(Array.from(section.querySelectorAll(
      ".game_purchase_price, .discount_final_price, .discount_original_price"
    )).map(node => node.textContent).join(" "));

    return /(?:[$€£¥￥₩₽₹₺฿₫₴]|R\$|A\$|C\$|S\$|HK\$|NT\$|Rp|kr\b|zł)/i.test(priceText)
      || /\d+[.,]\d{2}/.test(priceText);
  }

  function skipPrice() {
    if (!/\/app\/\d+/.test(location.href)) return false;

    const purchaseSections = visibleSections().filter(section => !isDemoPurchaseSection(section));
    if (purchaseSections.length === 0) return false;

    const hasFreeSection = purchaseSections.some(freeSec);
    const hasPaidSection = purchaseSections.some(paidSec);

    return hasFreeSection && !hasPaidSection;
  }

  function clearNode(node) {
    node.replaceChildren();
  }

  function appendText(parent, value) {
    parent.appendChild(document.createTextNode(String(value ?? "")));
  }

  function appendBreak(parent) {
    parent.appendChild(document.createElement("br"));
  }

  function appendSpan(parent, text, className = "", styles = null) {
    const span = document.createElement("span");
    if (className) span.className = className;
    if (styles && typeof applyStyles === "function") applyStyles(span, styles);
    span.textContent = String(text ?? "");
    parent.appendChild(span);
    return span;
  }

  function appendLink(parent, text, url) {
    const link = document.createElement("a");
    externalNavigation.applyToLink(link, safeUrl(url));
    if (typeof applyStyles === "function") {
      applyStyles(link, {
        color: colors.steamBlue,
        textDecoration: "underline",
      });
    }
    link.textContent = String(text ?? "");
    parent.appendChild(link);
    return link;
  }

  function setMessage(node, first, second = "") {
    clearNode(node);
    appendText(node, first);
    if (second) {
      appendBreak(node);
      appendText(node, second);
    }
  }

  function safeUrl(value, fallback = "#") {
    const raw = String(value || "").trim();
    if (!raw || raw === "#") return fallback;
    try {
      const url = new URL(raw, location.origin);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : fallback;
    } catch {
      return fallback;
    }
  }

  async function monitorPost(url, body, operationId = "") {
    const authClient = getMonitorAuthClient();
    if (!authClient) throw new Error(t("store_priceHistory_monitorAuthUnavailable", "打折监控鉴权服务未加载"));
    const response = await authClient.authedPost(url, body, {
      throwOnMissingAuth: true,
      operationId,
    });
    const data = response?.body || {};
    const code = Number(response?.code) || 0;
    if (code < 200 || code >= 300) {
      const error = new Error(data?.message || t("store_priceHistory_monitorRequestFailed", "请求失败：$code$", { code }));
      error.status = code;
      throw error;
    }
    return data;
  }

  async function hasMonitorAuth() {
    const authClient = getMonitorAuthClient();
    if (!authClient) return false;
    const auth = await authClient.readyAuth();
    return !!auth?.access_token;
  }

  function monitorTimezone() {
    try {
      return String(Intl.DateTimeFormat().resolvedOptions().timeZone || "").trim();
    } catch {
      return "";
    }
  }

  function monitorItemNameFallback(target) {
    return `${String(target?.type || "").toUpperCase()} ${Number(target?.id) || 0}`.trim();
  }

  function loadMonitorItemName(target, cc) {
    const type = target?.type === "sub" ? "sub" : target?.type === "app" ? "app" : "";
    const id = Number(target?.id) || 0;
    if (!type || id <= 0) return Promise.reject(new TypeError(t("store_priceHistory_invalidSteamItem", "无效的 Steam 商品标识")));
    const key = `${type}:${id}:${type === "sub" ? String(cc || "CN").toUpperCase() : "basic"}`;
    if (monitorItemNameCache.has(key)) return Promise.resolve(monitorItemNameCache.get(key));
    if (monitorItemNamePending.has(key)) return monitorItemNamePending.get(key);
    const steamStore = globalThis.STConfig?.vendors?.steamStore;
    const url = type === "sub"
      ? steamStore?.packageDetailsForCountry?.(id, cc, "schinese")
      : steamStore?.appDetails?.(id, "basic", "schinese");
    if (!url || typeof api.net?.sendRequest !== "function") {
      return Promise.reject(new Error(t("store_priceHistory_steamItemUnavailable", "Steam 商品详情服务不可用")));
    }
    let task;
    task = api.net.sendRequest({
      url,
      method: "GET",
      headers: { Accept: "application/json" },
      parseJSON: true,
      timeoutMs: 12_000,
      retries: 1,
      messageType: type === "sub" ? "steam-regional-packagedetails" : "steam-regional-appdetails",
      service: "steam-store",
      endpointKey: type === "sub" ? "packagedetails-name" : "appdetails-basic-name",
      logUrl: type === "sub" ? "steam-store://packagedetails-name" : "steam-store://appdetails-basic-name",
      logParams: { itemType: type, itemId: id },
    }).then((data) => {
      const entry = data?.[String(id)];
      const name = normalizeSteamText(entry?.data?.name);
      if (entry?.success !== true || !entry.data || typeof entry.data !== "object" || !name) {
        const error = new Error(t("store_priceHistory_steamItemInvalidResponse", "Steam 商品详情响应格式异常"));
        error.code = "RESPONSE_SHAPE_INVALID";
        throw error;
      }
      monitorItemNameCache.set(key, name);
      return name;
    }).finally(() => {
      if (monitorItemNamePending.get(key) === task) monitorItemNamePending.delete(key);
    });
    monitorItemNamePending.set(key, task);
    return task;
  }

  function monitorContext(target, summary, pageAppId, cc) {
    if (target?.type === "bundle") return null;
    const regular = summary?.current?.regular;
    const regularAmount = amountOf(regular);
    const currency = String(regular?.currency || "").trim().toUpperCase();
    if (regularAmount === null || regularAmount < 0 || !/^[A-Z]{3}$/.test(currency)) return null;
    const context = {
      key: targetKey(target),
      target: { type: target.type, id: target.id },
      appid: Number(pageAppId) || 0,
      itemName: monitorItemNameFallback(target),
      currency,
      regularAmount,
      host: null,
    };
    context.itemNameTask = loadMonitorItemName(context.target, cc).then((name) => {
      context.itemName = name;
      return name;
    }).catch((error) => {
      log.warn("price-monitor-item-name-unavailable", "Steam 商品名称读取失败", {
        itemType: context.target.type,
        itemId: context.target.id,
        errorCode: error?.code || error?.name || "ITEM_NAME_UNAVAILABLE",
      });
      return context.itemName;
    });
    return context;
  }

  function normalizeMonitor(value) {
    if (!value || typeof value !== "object") return null;
    return {
      itemType: String(value.item_type || ""),
      itemId: Number(value.item_id) || 0,
      appid: Number(value.appid) || 0,
      itemName: String(value.item_name || ""),
      currency: String(value.currency || ""),
      regularAmount: Number(value.regular_amount),
      targetMode: String(value.target_mode || ""),
      targetAmount: value.target_amount === null ? null : Number(value.target_amount),
      targetDiscount: value.target_discount === null ? null : Number(value.target_discount),
      notifyQq: value.notify_qq === true,
      notifyEmail: value.notify_email === true,
      notifyTime: String(value.notify_time || ""),
      timezone: String(value.timezone || ""),
      updatedAt: String(value.updated_at || ""),
    };
  }

  function monitorChannels(monitor) {
    const channels = [];
    if (monitor?.notifyQq) channels.push("QQ");
    if (monitor?.notifyEmail) channels.push(t("store_priceHistory_monitorEmail", "邮件"));
    return channels.join(t("store_priceHistory_monitorAnd", " 和 "));
  }

  function monitorAmountText(amount, currency) {
    const value = Number(amount);
    const code = String(currency || "").trim().toUpperCase();
    if (!Number.isFinite(value) || !/^[A-Z]{3}$/.test(code)) return "--";
    try {
      return new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency: code,
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value).replace(/\s+/g, "");
    } catch {
      return `${code} ${value.toFixed(2)}`;
    }
  }

  function monitorSummaryText(monitor) {
    const channels = monitorChannels(monitor);
    const time = String(monitor?.notifyTime || "");
    if (monitor?.targetMode === "amount") {
      return t("store_priceHistory_monitorSummaryAmount", "当$amount$ 及以下时，将于当天 $time$ 通过 $channels$ 通知你。", {
        amount: monitorAmountText(monitor.targetAmount, monitor.currency),
        time,
        channels,
      });
    }
    return t("store_priceHistory_monitorSummaryDiscount", "当折扣达到 $discount$ 及以上时，将于当天 $time$ 通过 $channels$ 通知你。", {
      discount: `${Number(monitor?.targetDiscount)}%`,
      time,
      channels,
    });
  }

  function monitorTrigger(text, title, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "st-price-monitor-trigger";
    button.textContent = text;
    button.title = title;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  function renderMonitorHost(host, context, state = "ready") {
    if (!host?.isConnected) return;
    clearNode(host);
    appendSpan(host, t("store_priceHistory_monitorLabel", "打折监控："), "st-price-monitor-label");
    const monitor = monitorCache.get(context.key);

    if (state === "loading") {
      appendSpan(host, t("store_priceHistory_monitorReading", "正在读取..."), "st-price-monitor-status");
      return;
    }
    if (state === "error") {
      host.appendChild(monitorTrigger(
        t("store_priceHistory_monitorRetry", "读取失败，点击重试"),
        t("store_priceHistory_monitorRetryTitle", "重新读取打折监控"),
        () => hydrateMonitors([context])
      ));
      return;
    }

    if (monitor) {
      host.appendChild(monitorTrigger(
        monitorSummaryText(monitor),
        t("store_priceHistory_monitorEditTitle", "修改打折监控"),
        () => openMonitorModal(context)
      ));
    } else {
      host.appendChild(monitorTrigger(
        t("store_priceHistory_monitorNotSet", "未设置提醒"),
        t("store_priceHistory_monitorSetTitle", "设置打折监控"),
        () => openMonitorModal(context)
      ));
    }
  }

  function mountMonitorLine(node, context) {
    api.styles?.ensureFeatureStyle?.("price-monitor");
    const host = document.createElement("span");
    host.className = "st-price-monitor-row";
    host.dataset.stPriceMonitorTarget = context.key;
    context.host = host;
    monitorHosts.set(context.key, host);
    node.appendChild(host);
    renderMonitorHost(host, context, "ready");
    return context;
  }

  function refreshMonitorHost(context, state = "ready") {
    const host = monitorHosts.get(context.key) || context.host;
    if (host) renderMonitorHost(host, context, state);
  }

  async function hydrateMonitors(contexts) {
    const entries = (contexts || []).filter(context => context?.host?.isConnected);
    if (!entries.length) return;
    try {
      if (!await hasMonitorAuth()) return;
    } catch (error) {
      entries.forEach(context => refreshMonitorHost(context, "error"));
      log.warn("price-monitor-auth-failed", "打折监控鉴权检查失败", {
        count: entries.length,
        error,
      });
      return;
    }

    entries.forEach(context => refreshMonitorHost(context, "loading"));
    const startedAt = Date.now();
    try {
      const body = await monitorPost(MONITOR_QUERY_URL, {
        items: entries.map(context => ({
          item_type: context.target.type,
          item_id: context.target.id,
        })),
      });
      if (!Array.isArray(body.data)) throw new Error(t("store_priceHistory_monitorInvalidResponse", "打折监控响应格式错误"));
      const found = new Map();
      body.data.forEach((item) => {
        const monitor = normalizeMonitor(item);
        if (monitor?.itemType && monitor.itemId > 0) {
          found.set(`${monitor.itemType}:${monitor.itemId}`, monitor);
        }
      });
      entries.forEach((context) => {
        context.monitorDenied = false;
        monitorCache.set(context.key, found.get(context.key) || null);
        refreshMonitorHost(context);
      });
      log.info("price-monitor-query-success", "打折监控读取完成", {
        count: entries.length,
        configuredCount: found.size,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      entries.forEach((context) => {
        context.monitorDenied = error?.status === 403;
        if (context.monitorDenied) monitorCache.set(context.key, null);
        refreshMonitorHost(context, error?.status === 403 ? "denied" : "error");
      });
      log.warn("price-monitor-query-failed", "打折监控读取失败", {
        count: entries.length,
        durationMs: Date.now() - startedAt,
        status: error?.status || 0,
        error,
      });
    }
  }

  function modalElement(tagName, className = "", text = "") {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function modalField(labelText, control, hintText = "") {
    const field = modalElement("div", "st-price-monitor-field");
    field.appendChild(modalElement("span", "st-price-monitor-field-label", labelText));
    field.appendChild(control);
    if (hintText) field.appendChild(modalElement("span", "st-price-monitor-field-hint", hintText));
    return field;
  }

  function modalInput(type, name, className = "st-price-monitor-input") {
    const input = document.createElement("input");
    input.type = type;
    if (name) input.name = name;
    input.className = className;
    return input;
  }

  function monitorCurrencySymbol(currency) {
    const code = String(currency || "").trim().toUpperCase();
    try {
      const part = new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency: code,
        currencyDisplay: "narrowSymbol",
        maximumFractionDigits: 0,
      }).formatToParts(0).find(item => item.type === "currency");
      return part?.value || code;
    } catch {
      return code;
    }
  }

  function monitorClockIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "15");
    svg.setAttribute("height", "15");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("aria-hidden", "true");
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "12");
    circle.setAttribute("cy", "12");
    circle.setAttribute("r", "9");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M12 7v5l3 2");
    svg.append(circle, path);
    return svg;
  }

  function monitorExternalIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "14");
    svg.setAttribute("height", "14");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    ["M14 3h7v7", "M21 3l-9 9", "M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"].forEach((value) => {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", value);
      svg.appendChild(path);
    });
    return svg;
  }

  function clampMonitorControlValue(range, value) {
    const min = Number(range.min);
    const max = Number(range.max);
    return Math.min(max, Math.max(min, Number(value)));
  }

  function formatMonitorControlValue(value, decimals) {
    return decimals > 0 ? Number(value).toFixed(decimals) : String(Math.round(Number(value)));
  }

  function linkMonitorNumericControls(range, numberInput, decimals) {
    range.addEventListener("input", () => {
      numberInput.value = formatMonitorControlValue(range.value, decimals);
      updateMonitorExplanation(range.closest(".st-price-monitor-modal"));
    });
    numberInput.addEventListener("input", () => {
      const value = Number(numberInput.value);
      if (numberInput.value.trim() !== "" && Number.isFinite(value)) {
        range.value = String(clampMonitorControlValue(range, value));
      }
      updateMonitorExplanation(numberInput.closest(".st-price-monitor-modal"));
    });
    numberInput.addEventListener("blur", () => {
      const value = Number(numberInput.value);
      const normalized = Number.isFinite(value)
        ? clampMonitorControlValue(range, value)
        : Number(range.value);
      range.value = String(normalized);
      numberInput.value = formatMonitorControlValue(normalized, decimals);
      updateMonitorExplanation(numberInput.closest(".st-price-monitor-modal"));
    });
  }

  function monitorRangeField(mode, labelText, { min, max, step, decimals, prefix = "", suffix = "" }) {
    const range = modalInput("range", "", "st-price-monitor-range");
    range.min = String(min);
    range.max = String(max);
    range.step = String(step);
    range.dataset.monitorRange = mode;

    const numberInput = modalInput("number", `target_${mode}`, "st-price-monitor-number-input");
    numberInput.min = String(min);
    numberInput.max = String(max);
    numberInput.step = String(step);

    const sliderWrap = modalElement("div", "st-price-monitor-slider-wrap");
    sliderWrap.appendChild(range);
    const numberBox = modalElement("div", "st-price-monitor-number-box");
    if (prefix) {
      const unit = modalElement("span", "st-price-monitor-number-unit", prefix);
      if (mode === "amount") unit.dataset.monitorCurrencyUnit = "true";
      numberBox.appendChild(unit);
    }
    numberBox.appendChild(numberInput);
    if (suffix) numberBox.appendChild(modalElement("span", "st-price-monitor-number-unit", suffix));
    const sliderRow = modalElement("div", "st-price-monitor-slider-row");
    sliderRow.append(sliderWrap, numberBox);
    const field = modalField(labelText, sliderRow);
    field.dataset.monitorField = mode;
    linkMonitorNumericControls(range, numberInput, decimals);
    return field;
  }

  function monitorTimeField() {
    const wrap = modalElement("div", "st-price-monitor-time-wrap");
    const valueInput = modalInput("hidden", "notify_time", "");
    const trigger = modalElement("button", "st-price-monitor-time-trigger st-price-monitor-time-trigger--placeholder");
    trigger.type = "button";
    trigger.dataset.monitorTimeTrigger = "true";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    const timeText = modalElement("span", "st-price-monitor-time-text", "--:--");
    const clock = modalElement("span", "st-price-monitor-time-clock");
    clock.appendChild(monitorClockIcon());
    trigger.append(timeText, clock);

    const panel = modalElement("div", "st-price-monitor-time-panel");
    panel.dataset.monitorTimePanel = "true";
    panel.hidden = true;
    const columns = modalElement("div", "st-price-monitor-time-columns");
    const hourColumn = modalElement("div", "st-price-monitor-time-column");
    hourColumn.dataset.monitorTimeColumn = "hour";
    hourColumn.setAttribute("role", "listbox");
    hourColumn.setAttribute("aria-label", t("store_priceHistory_hour", "小时"));
    const minuteColumn = modalElement("div", "st-price-monitor-time-column");
    minuteColumn.dataset.monitorTimeColumn = "minute";
    minuteColumn.setAttribute("role", "listbox");
    minuteColumn.setAttribute("aria-label", t("store_priceHistory_minute", "分钟"));
    columns.append(hourColumn, minuteColumn);

    const timeActions = modalElement("div", "st-price-monitor-time-actions");
    const now = modalElement("button", "st-price-monitor-time-now", t("store_priceHistory_now", "此刻"));
    now.type = "button";
    now.dataset.monitorTimeAction = "now";
    const confirm = modalElement("button", "st-price-monitor-time-confirm", t("store_priceHistory_confirm", "确定"));
    confirm.type = "button";
    confirm.dataset.monitorTimeAction = "confirm";
    timeActions.append(now, confirm);
    panel.append(columns, timeActions);
    wrap.append(valueInput, trigger, panel);

    trigger.addEventListener("click", () => {
      const modal = trigger.closest(".st-price-monitor-modal");
      if (!modal) return;
      if (panel.hidden) openMonitorTimePanel(modal);
      else closeMonitorTimePanel(modal);
    });
    now.addEventListener("click", () => {
      const modal = now.closest(".st-price-monitor-modal");
      if (!modal) return;
      const current = new Date();
      const value = `${String(current.getHours()).padStart(2, "0")}:${String(current.getMinutes()).padStart(2, "0")}`;
      setMonitorTimeValue(modal, value);
      buildMonitorTimeOptions(modal);
      updateMonitorExplanation(modal);
    });
    confirm.addEventListener("click", () => {
      const modal = confirm.closest(".st-price-monitor-modal");
      if (!modal) return;
      const value = `${modal.dataset.monitorHour || "00"}:${modal.dataset.monitorMinute || "00"}`;
      setMonitorTimeValue(modal, value);
      closeMonitorTimePanel(modal);
      updateMonitorExplanation(modal);
    });

    return wrap;
  }

  function monitorDashboardButton() {
    const button = modalElement("button", "st-price-monitor-dashboard");
    button.type = "button";
    button.dataset.monitorAction = "dashboard";
    button.title = t("store_priceHistory_monitorDashboardTitle", "在素材君查看全部监控");
    button.append(monitorExternalIcon(), modalElement("span", "", t("store_priceHistory_monitorDashboard", "监控列表")));
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      externalNavigation.open(MONITOR_DASHBOARD_URL);
    });
    return button;
  }

  function ensureMonitorModal() {
    let modal = document.getElementById(MONITOR_MODAL_ID);
    if (modal) modal.remove();

    modal = modalElement("section", "st-price-monitor-modal");
    modal.id = MONITOR_MODAL_ID;
    modal.hidden = true;

    const panel = modalElement("div", "st-price-monitor-dialog");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "st-price-monitor-title");

    const header = modalElement("div", "st-price-monitor-head");
    const heading = modalElement("div", "st-price-monitor-heading");
    const title = modalElement("h3", "", t("store_priceHistory_monitorTitle", "打折监控"));
    title.id = "st-price-monitor-title";
    heading.appendChild(title);
    heading.appendChild(modalElement("div", "st-price-monitor-item-name"));
    const close = modalElement("button", "st-price-monitor-close", "×");
    close.type = "button";
    close.title = t("store_priceHistory_close", "关闭");
    close.dataset.monitorAction = "close";
    close.addEventListener("click", closeMonitorModal);
    header.append(heading, close);

    const body = modalElement("div", "st-price-monitor-body");
    const conditionLabel = modalElement("div", "st-price-monitor-group-label", t("store_priceHistory_monitorCondition", "监控条件"));
    const modes = modalElement("div", "st-price-monitor-modes");
    modes.setAttribute("role", "tablist");
    [["amount", t("store_priceHistory_monitorAmount", "期望金额")], ["discount", t("store_priceHistory_monitorDiscount", "期望折扣")]].forEach(([mode, label]) => {
      const button = modalElement("button", "", label);
      button.type = "button";
      button.setAttribute("role", "tab");
      button.dataset.monitorMode = mode;
      button.addEventListener("click", () => setMonitorMode(modal, mode));
      modes.appendChild(button);
    });

    const amountField = monitorRangeField("amount", t("store_priceHistory_monitorAmount", "期望金额"), {
      min: 1,
      max: 1,
      step: 0.01,
      decimals: 2,
      prefix: "¥",
    });
    const discountField = monitorRangeField("discount", t("store_priceHistory_monitorDiscountRange", "期望折扣（1-100%）"), {
      min: 1,
      max: 100,
      step: 1,
      decimals: 0,
      suffix: "%",
    });

    const notifyLabel = modalElement("div", "st-price-monitor-group-label", t("store_priceHistory_monitorNotifyMethod", "提醒方式"));
    const channels = modalElement("div", "st-price-monitor-channels");
    [["notify_qq", "QQ"], ["notify_email", t("store_priceHistory_monitorEmail", "邮件")]].forEach(([name, label]) => {
      const option = modalElement("label", "st-price-monitor-channel");
      const checkbox = modalInput("checkbox", name);
      checkbox.className = "";
      checkbox.addEventListener("change", () => updateMonitorExplanation(checkbox.closest(".st-price-monitor-modal")));
      option.append(checkbox, modalElement("span", "", label));
      channels.appendChild(option);
    });

    const timeLabel = modalElement("div", "st-price-monitor-group-label", t("store_priceHistory_monitorTime", "提醒时间"));
    const timeField = monitorTimeField();
    const explanation = modalElement("div", "st-price-monitor-explanation");
    explanation.dataset.monitorExplanation = "true";
    explanation.setAttribute("role", "status");
    explanation.setAttribute("aria-live", "polite");
    explanation.appendChild(modalElement("p"));

    body.append(
      conditionLabel,
      modes,
      amountField,
      discountField,
      notifyLabel,
      channels,
      timeLabel,
      timeField,
      explanation
    );

    const actions = modalElement("div", "st-price-monitor-actions");
    const remove = modalElement("button", "st-price-monitor-delete", t("store_priceHistory_monitorDelete", "删除监控"));
    remove.type = "button";
    remove.dataset.monitorAction = "delete";
    remove.addEventListener("click", () => deleteMonitorFromModal(modal, remove));
    const dashboard = monitorDashboardButton();
    const spacer = modalElement("span", "st-price-monitor-actions-spacer");
    const cancel = modalElement("button", "st-price-monitor-action", t("store_priceHistory_cancel", "取消"));
    cancel.type = "button";
    cancel.dataset.monitorAction = "close";
    cancel.addEventListener("click", closeMonitorModal);
    const save = modalElement("button", "st-price-monitor-action st-price-monitor-action--primary", t("store_priceHistory_save", "保存"));
    save.type = "button";
    save.dataset.monitorAction = "save";
    save.addEventListener("click", () => saveMonitorFromModal(modal));
    actions.append(remove, dashboard, spacer, cancel, save);

    panel.append(header, body, actions);
    const errorLayer = modalElement("div", "st-price-monitor-error-layer");
    errorLayer.hidden = true;
    errorLayer.dataset.monitorErrorDialog = "true";
    const errorDialog = modalElement("section", "st-price-monitor-error-dialog");
    errorDialog.setAttribute("role", "alertdialog");
    errorDialog.setAttribute("aria-modal", "true");
    errorDialog.setAttribute("aria-labelledby", "st-price-monitor-error-title");
    errorDialog.setAttribute("aria-describedby", "st-price-monitor-error-message");
    const errorTitle = modalElement("h4", "st-price-monitor-error-title");
    errorTitle.id = "st-price-monitor-error-title";
    const errorMessage = modalElement("p", "st-price-monitor-error-message");
    errorMessage.id = "st-price-monitor-error-message";
    const errorActions = modalElement("div", "st-price-monitor-error-actions");
    const errorConfirm = modalElement("button", "st-price-monitor-error-confirm", t("store_priceHistory_confirm", "确定"));
    errorConfirm.type = "button";
    errorConfirm.dataset.monitorErrorAction = "confirm";
    errorConfirm.addEventListener("click", () => closeMonitorErrorDialog(modal));
    errorActions.appendChild(errorConfirm);
    errorDialog.append(errorTitle, errorMessage, errorActions);
    errorLayer.appendChild(errorDialog);
    errorLayer.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeMonitorErrorDialog(modal);
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        errorConfirm.focus();
      }
    });

    modal.append(panel, errorLayer);
    modal.addEventListener("click", (event) => {
      if (!event.target?.closest?.(".st-price-monitor-time-wrap")) closeMonitorTimePanel(modal);
      if (event.target === modal && modal.dataset.busy !== "true") closeMonitorModal();
    });
    modal.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const timePanel = modal.querySelector("[data-monitor-time-panel]");
      if (timePanel && !timePanel.hidden) {
        event.preventDefault();
        event.stopPropagation();
        closeMonitorTimePanel(modal);
        return;
      }
      closeMonitorModal();
    });
    document.documentElement.appendChild(modal);
    return modal;
  }

  function closeMonitorErrorDialog(modal, restoreFocus = true) {
    const layer = modal?.querySelector?.("[data-monitor-error-dialog]");
    if (!layer || layer.hidden) return;
    const returnFocus = layer._stReturnFocus;
    layer._stReturnFocus = null;
    layer.hidden = true;
    modal.querySelector(".st-price-monitor-dialog")?.removeAttribute("aria-hidden");
    if (!restoreFocus) return;
    if (returnFocus?.isConnected) returnFocus.focus?.();
    else modal.querySelector("[data-monitor-action='save']")?.focus?.();
  }

  function showMonitorErrorDialog(modal, title, message) {
    const layer = modal?.querySelector?.("[data-monitor-error-dialog]");
    const titleNode = layer?.querySelector?.(".st-price-monitor-error-title");
    const messageNode = layer?.querySelector?.(".st-price-monitor-error-message");
    const confirm = layer?.querySelector?.("[data-monitor-error-action='confirm']");
    if (!layer || !titleNode || !messageNode || !confirm) return;
    if (layer.hidden) layer._stReturnFocus = document.activeElement;
    titleNode.textContent = String(title || "");
    messageNode.textContent = String(message || "");
    modal.querySelector(".st-price-monitor-dialog")?.setAttribute("aria-hidden", "true");
    layer.hidden = false;
    confirm.focus();
  }

  function setMonitorExplanationStatus(modal, message = "") {
    if (!modal) return;
    modal._stMonitorStatusMessage = String(message || "");
    updateMonitorExplanation(modal);
  }

  function setMonitorNumericValue(modal, mode, value, fallbackValue) {
    const range = modal.querySelector(`[data-monitor-range='${mode}']`);
    const numberInput = modal.querySelector(`[name='target_${mode}']`);
    if (!range || !numberInput) return;
    const parsed = Number(value);
    const hasValue = value !== null && value !== "" && Number.isFinite(parsed);
    const initial = hasValue ? parsed : fallbackValue;
    const normalized = clampMonitorControlValue(range, initial);
    range.value = String(normalized);
    numberInput.value = formatMonitorControlValue(normalized, mode === "amount" ? 2 : 0);
  }

  function parseMonitorTime(value) {
    const match = /^(?:([01]\d|2[0-3])):([0-5]\d)$/.exec(String(value || ""));
    return match ? { hour: match[1], minute: match[2] } : null;
  }

  function setMonitorTimeValue(modal, value) {
    const parsed = parseMonitorTime(value);
    const input = modal.querySelector("[name='notify_time']");
    const trigger = modal.querySelector("[data-monitor-time-trigger]");
    const text = trigger?.querySelector(".st-price-monitor-time-text");
    if (!input || !trigger || !text) return;
    input.value = parsed ? `${parsed.hour}:${parsed.minute}` : "";
    modal.dataset.monitorHour = parsed?.hour || "00";
    modal.dataset.monitorMinute = parsed?.minute || "00";
    text.textContent = input.value || "--:--";
    trigger.classList.toggle("st-price-monitor-time-trigger--placeholder", !parsed);
  }

  function selectMonitorTimePart(modal, part, value) {
    if (part === "hour") modal.dataset.monitorHour = value;
    else modal.dataset.monitorMinute = value;
    modal.querySelectorAll(`[data-monitor-time-column='${part}'] [role='option']`).forEach((option) => {
      const selected = option.dataset.monitorTimeValue === value;
      option.classList.toggle("selected", selected);
      option.setAttribute("aria-selected", selected ? "true" : "false");
    });
  }

  function buildMonitorTimeOptions(modal) {
    [["hour", 24], ["minute", 60]].forEach(([part, count]) => {
      const column = modal.querySelector(`[data-monitor-time-column='${part}']`);
      if (!column) return;
      clearNode(column);
      const selectedValue = part === "hour"
        ? (modal.dataset.monitorHour || "00")
        : (modal.dataset.monitorMinute || "00");
      for (let index = 0; index < count; index += 1) {
        const value = String(index).padStart(2, "0");
        const option = modalElement("button", "st-price-monitor-time-option", value);
        option.type = "button";
        option.dataset.monitorTimeValue = value;
        option.setAttribute("role", "option");
        const selected = value === selectedValue;
        option.classList.toggle("selected", selected);
        option.setAttribute("aria-selected", selected ? "true" : "false");
        option.addEventListener("click", () => selectMonitorTimePart(modal, part, value));
        column.appendChild(option);
      }
    });
  }

  function openMonitorTimePanel(modal) {
    const panel = modal.querySelector("[data-monitor-time-panel]");
    const trigger = modal.querySelector("[data-monitor-time-trigger]");
    if (!panel || !trigger || trigger.disabled) return;
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    buildMonitorTimeOptions(modal);
    panel.querySelectorAll(".st-price-monitor-time-option.selected").forEach((option) => {
      option.scrollIntoView({ block: "center" });
    });
  }

  function closeMonitorTimePanel(modal) {
    const panel = modal?.querySelector?.("[data-monitor-time-panel]");
    const trigger = modal?.querySelector?.("[data-monitor-time-trigger]");
    if (panel) panel.hidden = true;
    trigger?.setAttribute?.("aria-expanded", "false");
  }

  function updateMonitorExplanation(modal) {
    if (!modal || !monitorModalState) return;
    const explanation = modal.querySelector("[data-monitor-explanation]");
    const paragraph = explanation?.querySelector("p");
    if (!explanation || !paragraph) return;
    const context = monitorModalState;
    if (context.monitorDenied) {
      clearNode(paragraph);
      explanation.classList.add("st-price-monitor-explanation--warning");
      appendText(paragraph, t("store_priceHistory_monitorSponsorOnly", "该功能仅限赞助者使用。"));
      return;
    }
    if (context.monitorLoginRequired) {
      clearNode(paragraph);
      explanation.classList.add("st-price-monitor-explanation--warning");
      appendText(paragraph, t("store_priceHistory_monitorLoginRequiredInSettings", "请先在 Steam Buff 设置中登录。"));
      return;
    }
    const statusMessage = String(modal._stMonitorStatusMessage || "");
    if (statusMessage) {
      clearNode(paragraph);
      explanation.classList.remove("st-price-monitor-explanation--warning");
      appendText(paragraph, statusMessage);
      return;
    }
    const mode = modal.dataset.monitorMode === "discount" ? "discount" : "amount";
    const valueInput = modal.querySelector(`[name='target_${mode}']`);
    const rawValue = String(valueInput?.value || "").trim();
    const value = Number(rawValue);
    const valueValid = mode === "amount"
      ? rawValue !== "" && Number.isFinite(value) && value >= 1 && value <= context.regularAmount
      : rawValue !== "" && Number.isInteger(value) && value >= 1 && value <= 100;
    const channels = [];
    if (modal.querySelector("[name='notify_qq']")?.checked) channels.push("QQ");
    if (modal.querySelector("[name='notify_email']")?.checked) channels.push(t("store_priceHistory_monitorEmail", "邮件"));
    const notifyTime = String(modal.querySelector("[name='notify_time']")?.value || "");
    const timeValid = !!parseMonitorTime(notifyTime);
    const missing = [];
    if (!valueValid) missing.push(mode === "amount"
      ? t("store_priceHistory_monitorAmount", "期望金额")
      : t("store_priceHistory_monitorDiscount", "期望折扣"));
    if (!channels.length) missing.push(t("store_priceHistory_monitorNotifyMethod", "提醒方式"));
    if (!timeValid) missing.push(t("store_priceHistory_monitorTime", "提醒时间"));

    clearNode(paragraph);
    explanation.classList.toggle("st-price-monitor-explanation--warning", missing.length > 0);
    if (missing.length) {
      appendText(paragraph, t("store_priceHistory_monitorCompleteFields", "请完善 "));
      appendSpan(paragraph, missing.join(t("store_priceHistory_listSeparator", "、")), "st-price-monitor-explanation-value");
      appendText(paragraph, t("store_priceHistory_monitorEnable", "，以启用本条打折监控。"));
      return;
    }

    const itemName = context.itemName || `${context.target.type.toUpperCase()} ${context.target.id}`;
    appendText(paragraph, t("store_priceHistory_monitorGamePrefix", "当《"));
    appendSpan(paragraph, itemName, "st-price-monitor-explanation-item");
    appendText(paragraph, t("store_priceHistory_monitorGameSuffix", "》"));
    if (mode === "amount") {
      appendText(paragraph, t("store_priceHistory_monitorAmountPrefix", "降至 "));
      appendSpan(paragraph, monitorAmountText(value, context.currency), "st-price-monitor-explanation-value");
      appendText(paragraph, t("store_priceHistory_monitorAmountMiddle", " 及以下时，将于当天 "));
    } else {
      appendText(paragraph, t("store_priceHistory_monitorDiscountPrefix", "折扣达到 "));
      appendSpan(paragraph, `${Math.round(value)}%`, "st-price-monitor-explanation-value");
      appendText(paragraph, t("store_priceHistory_monitorDiscountMiddle", " 及以上时，将于当天 "));
    }
    appendSpan(paragraph, notifyTime, "st-price-monitor-explanation-value");
    appendText(paragraph, t("store_priceHistory_monitorVia", " 通过 "));
    appendSpan(paragraph, channels.join(t("store_priceHistory_monitorAnd", " 和 ")), "st-price-monitor-explanation-value");
    appendText(paragraph, t("store_priceHistory_monitorNotifySuffix", " 通知你。"));
  }

  function setMonitorMode(modal, mode) {
    const selected = mode === "discount" ? "discount" : "amount";
    modal.dataset.monitorMode = selected;
    modal.querySelectorAll("[data-monitor-mode]").forEach((button) => {
      const active = button.dataset.monitorMode === selected;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    modal.querySelectorAll("[data-monitor-field]").forEach((field) => {
      field.hidden = field.dataset.monitorField !== selected;
    });
    updateMonitorExplanation(modal);
  }

  function setMonitorModalBusy(modal, busy) {
    modal.dataset.busy = busy ? "true" : "false";
    modal.querySelectorAll("button, input").forEach((control) => {
      if (control.dataset.monitorAction === "dashboard") return;
      control.disabled = !!busy;
    });
  }

  function setMonitorModalDenied(modal, denied) {
    modal.dataset.denied = denied ? "true" : "false";
    modal.querySelectorAll(
      "[data-monitor-mode], .st-price-monitor-body input, [data-monitor-time-trigger], [data-monitor-time-action], [data-monitor-action='save'], [data-monitor-action='delete']"
    ).forEach((control) => {
      control.disabled = !!denied;
    });
  }

  async function openMonitorModal(context) {
    await context.itemNameTask;
    const modal = ensureMonitorModal();
    const monitor = monitorCache.get(context.key) || null;
    monitorModalState = context;
    modal.dataset.monitorKey = context.key;
    modal.hidden = false;
    setMonitorModalBusy(modal, false);
    setMonitorModalDenied(modal, !!context.monitorDenied);
    modal._stMonitorStatusMessage = "";

    const itemName = modal.querySelector(".st-price-monitor-item-name");
    if (itemName) itemName.textContent = context.itemName || `${context.target.type.toUpperCase()} ${context.target.id}`;

    const amountInput = modal.querySelector("[name='target_amount']");
    const discountInput = modal.querySelector("[name='target_discount']");
    const qqInput = modal.querySelector("[name='notify_qq']");
    const emailInput = modal.querySelector("[name='notify_email']");
    const amountRange = modal.querySelector("[data-monitor-range='amount']");
    const discountRange = modal.querySelector("[data-monitor-range='discount']");
    const currencyUnit = modal.querySelector("[data-monitor-currency-unit]");
    amountInput.max = String(context.regularAmount);
    amountRange.max = String(context.regularAmount);
    discountRange.max = "100";
    if (currencyUnit) currencyUnit.textContent = monitorCurrencySymbol(context.currency);
    const defaultAmount = Number(Math.max(1, context.regularAmount / 2).toFixed(2));
    setMonitorNumericValue(
      modal,
      "amount",
      monitor?.targetMode === "amount" ? monitor.targetAmount : null,
      defaultAmount
    );
    setMonitorNumericValue(
      modal,
      "discount",
      monitor?.targetMode === "discount" ? monitor.targetDiscount : null,
      50
    );
    qqInput.checked = !!monitor?.notifyQq;
    emailInput.checked = !!monitor?.notifyEmail;
    setMonitorTimeValue(modal, monitor?.notifyTime || "");
    const amountLabel = modal.querySelector("[data-monitor-field='amount'] .st-price-monitor-field-label");
    if (amountLabel) amountLabel.textContent = t("store_priceHistory_monitorAmountMaximum", "期望金额（最高$amount$）", {
      amount: money({ amount: context.regularAmount, currency: context.currency }),
    });
    const deleteButton = modal.querySelector("[data-monitor-action='delete']");
    deleteButton.hidden = !monitor || !!context.monitorDenied;
    deleteButton.dataset.confirm = "";
    deleteButton.textContent = t("store_priceHistory_monitorDelete", "删除监控");
    context.monitorLoginRequired = false;
    setMonitorMode(modal, monitor?.targetMode || "amount");
    updateMonitorExplanation(modal);

    if (!context.monitorDenied) {
      try {
        if (!await hasMonitorAuth()) {
          context.monitorLoginRequired = true;
          updateMonitorExplanation(modal);
        }
      } catch (error) {
        showMonitorErrorDialog(
          modal,
          t("store_priceHistory_monitorAuthErrorTitle", "鉴权检查失败"),
          error?.message || t("store_priceHistory_monitorAuthFailed", "鉴权检查失败。")
        );
      }
    }
    const activeInput = modal.querySelector(`[data-monitor-field='${modal.dataset.monitorMode}'] .st-price-monitor-number-input`);
    if (!context.monitorDenied) activeInput?.focus?.();
  }

  function closeMonitorModal() {
    const modal = document.getElementById?.(MONITOR_MODAL_ID);
    if (!modal) return;
    closeMonitorErrorDialog(modal, false);
    closeMonitorTimePanel(modal);
    modal.hidden = true;
    modal.dataset.busy = "false";
    modal._stMonitorStatusMessage = "";
    monitorModalState = null;
  }

  function monitorPayload(modal, context) {
    const mode = modal.dataset.monitorMode === "discount" ? "discount" : "amount";
    const amountText = String(modal.querySelector("[name='target_amount']")?.value || "").trim();
    const discountText = String(modal.querySelector("[name='target_discount']")?.value || "").trim();
    const targetAmount = Number(amountText);
    const targetDiscount = Number(discountText);
    const notifyQq = !!modal.querySelector("[name='notify_qq']")?.checked;
    const notifyEmail = !!modal.querySelector("[name='notify_email']")?.checked;
    const notifyTime = String(modal.querySelector("[name='notify_time']")?.value || "").trim();
    const timezone = monitorTimezone();

    if (mode === "amount" && (amountText === "" || !Number.isFinite(targetAmount) || targetAmount < 1 || targetAmount > context.regularAmount)) {
      throw new Error(t("store_priceHistory_monitorAmountInvalid", "期望金额必须在 1 到$amount$之间。", {
        amount: money({ amount: context.regularAmount, currency: context.currency }),
      }));
    }
    if (mode === "discount" && (discountText === "" || !Number.isInteger(targetDiscount) || targetDiscount < 1 || targetDiscount > 100)) {
      throw new Error(t("store_priceHistory_monitorDiscountInvalid", "期望折扣必须是 1 到 100 之间的整数。"));
    }
    if (!notifyQq && !notifyEmail) throw new Error(t("store_priceHistory_monitorNotifyRequired", "至少选择一种提醒方式。"));
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(notifyTime)) throw new Error(t("store_priceHistory_monitorTimeRequired", "请设置提醒时间。"));
    if (!timezone) throw new Error(t("store_priceHistory_monitorTimezoneRequired", "无法读取当前时区，暂时不能保存。"));

    return {
      item_type: context.target.type,
      item_id: context.target.id,
      appid: context.appid,
      item_name: context.itemName,
      currency: context.currency,
      regular_amount: Number(context.regularAmount.toFixed(2)),
      target_mode: mode,
      target_amount: mode === "amount" ? Number(targetAmount.toFixed(2)) : null,
      target_discount: mode === "discount" ? targetDiscount : null,
      notify_qq: notifyQq,
      notify_email: notifyEmail,
      notify_time: notifyTime,
      timezone,
    };
  }

  async function saveMonitorFromModal(modal) {
    const context = monitorModalState;
    if (!context || modal.dataset.busy === "true") return;
    let payload;
    try {
      payload = monitorPayload(modal, context);
    } catch (error) {
      showMonitorErrorDialog(
        modal,
        t("store_priceHistory_monitorValidationErrorTitle", "无法保存"),
        error?.message || String(error)
      );
      return;
    }

    setMonitorModalBusy(modal, true);
    setMonitorExplanationStatus(modal, t("store_priceHistory_monitorSaving", "正在保存..."));
    const startedAt = Date.now();
    const operationId = window.STLoggerFactory?.createRequestId?.() || "";
    try {
      const body = await monitorPost(MONITOR_SAVE_URL, payload, operationId);
      const monitor = normalizeMonitor(body.data);
      if (!monitor || `${monitor.itemType}:${monitor.itemId}` !== context.key) {
        throw new Error(t("store_priceHistory_monitorSaveResponseInvalid", "打折监控保存响应不完整"));
      }
      monitorCache.set(context.key, monitor);
      refreshMonitorHost(context);
      closeMonitorModal();
      log.info("price-monitor-save-success", "打折监控保存完成", {
        operationId,
        itemType: context.target.type,
        itemId: context.target.id,
        targetMode: monitor.targetMode,
        notifyQq: monitor.notifyQq,
        notifyEmail: monitor.notifyEmail,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      setMonitorModalBusy(modal, false);
      setMonitorExplanationStatus(modal, "");
      showMonitorErrorDialog(
        modal,
        t("store_priceHistory_monitorSaveErrorTitle", "保存失败"),
        error?.message || t("store_priceHistory_monitorSaveFailed", "保存失败，请稍后重试。")
      );
      log.warn("price-monitor-save-failed", "打折监控保存失败", {
        operationId,
        itemType: context.target.type,
        itemId: context.target.id,
        durationMs: Date.now() - startedAt,
        status: error?.status || 0,
        error,
      });
    }
  }

  async function deleteMonitorFromModal(modal, button) {
    const context = monitorModalState;
    if (!context || modal.dataset.busy === "true") return;
    if (button.dataset.confirm !== "true") {
      button.dataset.confirm = "true";
      button.textContent = t("store_priceHistory_monitorConfirmDelete", "确认删除");
      clearTimeout(button._stConfirmTimer);
      button._stConfirmTimer = setTimeout(() => {
        if (!button.isConnected) return;
        button.dataset.confirm = "";
        button.textContent = t("store_priceHistory_monitorDelete", "删除监控");
      }, 4000);
      return;
    }

    setMonitorModalBusy(modal, true);
    setMonitorExplanationStatus(modal, t("store_priceHistory_monitorDeleting", "正在删除..."));
    const startedAt = Date.now();
    const operationId = window.STLoggerFactory?.createRequestId?.() || "";
    try {
      await monitorPost(MONITOR_DELETE_URL, {
        item_type: context.target.type,
        item_id: context.target.id,
      }, operationId);
      monitorCache.set(context.key, null);
      refreshMonitorHost(context);
      closeMonitorModal();
      log.info("price-monitor-delete-success", "打折监控删除完成", {
        operationId,
        itemType: context.target.type,
        itemId: context.target.id,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      setMonitorModalBusy(modal, false);
      setMonitorExplanationStatus(modal, "");
      showMonitorErrorDialog(
        modal,
        t("store_priceHistory_monitorDeleteErrorTitle", "删除失败"),
        error?.message || t("store_priceHistory_monitorDeleteFailed", "删除失败，请稍后重试。")
      );
      log.warn("price-monitor-delete-failed", "打折监控删除失败", {
        operationId,
        itemType: context.target.type,
        itemId: context.target.id,
        durationMs: Date.now() - startedAt,
        status: error?.status || 0,
        error,
      });
    }
  }

  function idsFrom(value) {
    const raw = Array.isArray(value) ? value : [value];
    return raw.map(item => parseInt(item, 10)).filter(item => item > 0);
  }

  function targetKey(target) {
    return `${target.type}:${target.id}`;
  }

  function appidFromDlcRow(row) {
    const appid = parseInt(row?.dataset?.dsAppid, 10);
    return appid > 0 ? appid : 0;
  }

  function dlcPriceText(row) {
    return normalizeSteamText(row?.querySelector?.(".game_area_dlc_price")?.textContent || "");
  }

  function dlcPaid(row) {
    const text = dlcPriceText(row);
    if (!text || isSteamPriceTextFree(text)) return false;
    return /(?:[$€£¥￥₩₽₹₺฿₫₴]|R\$|A\$|C\$|S\$|HK\$|NT\$|Rp|kr\b|zł)/i.test(text)
      || /\d+[.,]\d{2}/.test(text)
      || /\d+/.test(text);
  }

  // 优化: DLC 行只在精准 DLC 容器内做一次 O(n) 收集，不启动观察器，也不退回整页扫描。
  function dlcTargets() {
    const section = document.querySelector?.(DLC_SECTION_SELECTOR);
    if (!section) return [];
    return Array.from(section.querySelectorAll?.(DLC_ROW_SELECTOR) || [])
      .filter(row => {
        if (typeof hasHiddenAncestor === "function" && hasHiddenAncestor(row, true)) return false;
        return dlcPaid(row);
      })
      .map(row => ({ row, id: appidFromDlcRow(row) }))
      .filter(item => item.id > 0);
  }

  function purchaseTargets(appId, type, subIds = [], bundleids = []) {
    const out = [];
    const seen = new Set();
    const add = (kind, id, extra = {}) => {
      const parsed = parseInt(id, 10);
      if (!parsed || parsed <= 0) return;
      const item = { type: kind, id: parsed, ...extra };
      const key = targetKey(item);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    };

    if (type === "bundle") {
      add("bundle", appId);
    } else if (type === "sub") {
      add("sub", appId);
      idsFrom(subIds).forEach(id => add("sub", id));
      idsFrom(bundleids).forEach(id => add("bundle", id));
    } else {
      idsFrom(subIds).forEach(id => add("sub", id));
      idsFrom(bundleids).forEach(id => add("bundle", id));
      if (!out.length) add("app", appId);
    }

    if (type === "app") {
      dlcTargets().forEach(item => add("app", item.id, { surface: "dlc", row: item.row }));
    }

    return out;
  }

  function pageInfo(appId, type, subIds, bundleids, targets = []) {
    return {
      type: type || "app",
      id: appId,
      appid: type === "app" ? appId : "",
      appId,
      appIds: targets.filter(target => target.type === "app" && target.surface === "dlc").map(target => target.id),
      subid: type === "sub" ? appId : "",
      subIds,
      bundleid: type === "bundle" ? appId : "",
      bundleids,
    };
  }

  function inputMatchesTarget(input, target) {
    const name = normalizeSteamText(input.getAttribute?.("name")).toLowerCase();
    const value = parseInt(input.value || input.getAttribute?.("value"), 10);
    if (value !== target.id) return false;
    if (target.type === "bundle") return name.includes("bundle");
    if (target.type === "sub") return name.includes("sub") || name.includes("package");
    return true;
  }

  function sectionFromInput(input) {
    return input.closest?.(".game_area_purchase_game") || input.parentNode?.parentNode || null;
  }

  function dlcPriceAnchor(row) {
    return row?.querySelector?.(".game_area_dlc_price") || null;
  }

  function dlcMountPoint(row) {
    if (!row || row.isConnected === false) return null;
    const price = dlcPriceAnchor(row);
    return price?.parentNode ? { parent: price.parentNode, before: price } : null;
  }

  function mountPointForTarget(target) {
    if (target.surface === "dlc") {
      return dlcMountPoint(target.row);
    }
    const section = sectionForTarget(target);
    return section ? { parent: section, before: null } : null;
  }

  function sectionForTarget(target) {
    if (target.type === "app") {
      return visibleSections().find(section => !isDemoPurchaseSection(section)) || null;
    }

    const inputs = Array.from(document.querySelectorAll("#game_area_purchase .game_area_purchase_game input"));
    const match = inputs.find(input => inputMatchesTarget(input, target));
    return match ? sectionFromInput(match) : null;
  }

  function clearExistingPriceNodes() {
    document.querySelectorAll("#game_area_purchase .game_lowest_price, .game_lowest_price").forEach(node => node.remove());
    monitorHosts.clear();
    closeMonitorModal();
  }

  function markLoading(node, queryId, target) {
    node.dataset.stPriceHistoryQueryId = String(queryId);
    node.dataset.stPriceHistoryTarget = targetKey(target);
    node.dataset.stPriceHistoryProvider = "store-data-service";
    node.dataset.stPriceHistoryState = "loading";
    node.textContent = target.surface === "dlc"
      ? t("store_priceHistory_dlcLoading", "史低读取中...")
      : t("store_priceHistory_loading", "正在读取历史最低价格...");
  }

  function styleDlcNode(node) {
    if (typeof applyStyles !== "function") return;
    applyStyles(node, {
      display: "inline-flex",
      alignItems: "center",
      gap: spacing.xs || "4px",
      margin: `0 ${spacing.xs || "4px"} 0 0`,
      padding: `0 ${spacing.xs || "4px"}`,
      border: "1px solid var(--st-color-border-primary-solid, var(--st-color-border-primary))",
      borderRadius: "2px",
      background: "var(--st-color-surface-panel-dark, var(--st-color-surface-control-strong))",
      boxSizing: "border-box",
      boxShadow: "0 1px 3px var(--st-color-black-alpha-30), inset 0 0 0 1px var(--st-color-white-alpha-08)",
      flex: "0 0 auto",
      whiteSpace: "nowrap",
      fontSize: "12px",
      lineHeight: "18px",
      color: "var(--st-color-text-primary)",
      verticalAlign: "middle",
    });
  }

  function mountNodes(targets, queryId) {
    const nodes = {};
    targets.forEach((target) => {
      const mount = mountPointForTarget(target);
      if (!mount?.parent) return;
      const node = document.createElement(target.surface === "dlc" ? "span" : "div");
      const key = targetKey(target);
      node.className = target.surface === "dlc" ? `game_lowest_price ${DLC_NODE_CLASS}` : "game_lowest_price";
      markLoading(node, queryId, target);
      if (target.surface === "dlc") {
        styleDlcNode(node);
      } else if (typeof applyStyles === "function") {
        applyStyles(node, { margin: `${spacing.sm || "8px"} 0` });
      }
      if (mount.before && typeof mount.parent.insertBefore === "function") {
        mount.parent.insertBefore(node, mount.before);
      } else {
        mount.parent.append(node);
      }
      nodes[key] = { node, target };
    });
    return nodes;
  }

  function activeNode(node, queryId) {
    return node
      && node.isConnected
      && node.dataset.stPriceHistoryQueryId === String(queryId);
  }

  function setActiveMessage(node, queryId, first, second = "") {
    if (!activeNode(node, queryId)) return false;
    node.dataset.stPriceHistoryState = "done";
    setMessage(node, first, second);
    return true;
  }

  function amountOf(price) {
    if (!price || typeof price !== "object") return null;
    const amount = Number(price.amount);
    const amountInt = Number(price.amountInt);
    if (Number.isFinite(amount)) return amount;
    return Number.isFinite(amountInt) ? amountInt / 100 : null;
  }

  function money(price) {
    const amount = amountOf(price);
    if (amount === null) return t("store_priceHistory_unavailable", "暂无");
    const currency = String(price?.currency || "").trim();
    return typeof formatPrice === "function" && currency ? formatPrice(amount, currency) : `${currency} ${amount}`.trim();
  }

  function compactMoney(price) {
    return money(price).replace(/\s+/g, "");
  }

  function dateText(value) {
    if (typeof formatDate === "function") return formatDate(value);
    const time = Date.parse(String(value || ""));
    if (!Number.isFinite(time)) return t("store_priceHistory_unknownDate", "未知日期");
    return new Date(time).toISOString().slice(0, 10);
  }

  function daysText(value) {
    if (typeof calculateDaysDiff !== "function") return "";
    const days = calculateDaysDiff(value);
    return days > 0 ? t("store_priceHistory_daysAgo", "（$days$天前）", { days }) : "";
  }

  function appendDiscount(parent, cut) {
    appendSpan(parent, `-${Number(cut) || 0}%`, "discount_pct");
  }

  function appendDlcDiscount(parent, cut) {
    appendSpan(parent, `-${Number(cut) || 0}%`, `${DLC_NODE_CLASS}__discount`, {
      background: "transparent",
      border: "0",
      padding: "0",
      color: "var(--st-color-success-text, inherit)",
      fontWeight: "700",
    });
  }

  function removeActiveNode(node, queryId) {
    if (!activeNode(node, queryId)) return false;
    node.remove();
    return true;
  }

  function appendCompare(parent, current, low) {
    const currentAmount = amountOf(current?.price);
    const lowAmount = amountOf(low?.price);
    if (currentAmount === null || lowAmount === null) return;

    const currency = current?.price?.currency || low?.price?.currency || "";
    const diff = Number((currentAmount - lowAmount).toFixed(2));
    const cutDiff = (Number(current?.cut) || 0) - (Number(low?.cut) || 0);

    if (diff < 0) {
      appendText(parent, t("store_priceHistory_compareLowPrefix", " ，比历史最低"));
      appendSpan(parent, t("store_priceHistory_compareCheaper", "便宜$amount$元(-$discount$%)。", {
        amount: compactMoney({ amount: Math.abs(diff), currency }),
        discount: Math.abs(cutDiff),
      }), "", {
        color: colors.success,
      });
      return;
    }
    if (diff === 0) {
      appendText(parent, t("store_priceHistory_compareEqual", " ，与历史最低持平。"));
      return;
    }
    appendText(parent, t("store_priceHistory_compareLowPrefix", " ，比历史最低"));
    appendSpan(parent, t("store_priceHistory_compareMoreExpensive", "贵$amount$元(+$discount$%)。", {
      amount: compactMoney({ amount: diff, currency }),
      discount: Math.abs(cutDiff),
    }), "", {
      color: colors.danger,
    });
  }

  function lowSelection(summary, chartSettings) {
    return api.features.dataDisplayCharts.prepareSeries({
      current: summary.current,
      storeLow: summary.historicalLow,
      events: summary.historyEvents,
    }, chartSettings).stats;
  }

  function renderSummary(node, queryId, summary, target, pageAppId, cc, chartSettings) {
    if (!activeNode(node, queryId)) return false;
    const current = summary.current;
    const selection = lowSelection(summary, chartSettings);
    const low = selection.referenceLow;
    if (!summary.found) {
      return setActiveMessage(node, queryId, t("store_priceHistory_itadNotListed", "ITAD 暂未收录当前购买项。"));
    }
    if (!current?.price || !low?.price) {
      return setActiveMessage(node, queryId, t("store_priceHistory_priceIncomplete", "价格数据不完整。"));
    }

    node.dataset.stPriceHistoryState = "done";
    clearNode(node);
    appendText(node, t("store_priceHistory_historicalLowAt", "历史最低折扣在 "));
    appendSpan(node, dateText(low.timestamp), "", { textDecoration: "underline" });
    appendText(node, t("store_priceHistory_historicalLowValuePrefix", "$days$ 为 ", { days: daysText(low.timestamp) }));
    appendDiscount(node, low.cut);
    appendText(node, ` ${money(low.price)}`);

    appendBreak(node);
    const currentIsHistoricalLow = selection.isCurrentLow;
    if (currentIsHistoricalLow) {
      appendSpan(node, t("store_priceHistory_currentHistoricalLow", "当前为历史最低折扣"), "game_purchase_discount_countdown", {
        color: colors.danger,
      });
    } else if ((Number(current.cut) || 0) === 0) {
      appendSpan(node, t("store_priceHistory_currentRegularPrice", "当前为原价"));
    } else {
      appendSpan(node, t("store_priceHistory_currentLowestDiscount", "当前最低折扣"));
    }

    if ((Number(current.cut) || 0) > 0) {
      appendText(node, " ");
      appendDiscount(node, current.cut);
    }
    if (currentIsHistoricalLow) {
      appendSpan(node, ` ${money(current.price)}`, "", { color: colors.danger });
    } else {
      appendText(node, ` ${money(current.price)}`);
    }
    appendCompare(node, current, low);

    if (summary.overviewAvailable) {
      appendText(node, Number.isInteger(summary.bundled)
        ? t("store_priceHistory_bundled", " 进包：$count$次", { count: summary.bundled })
        : t("store_priceHistory_bundledUnavailable", " 进包：暂不可用"));
    }

    const context = monitorContext(target, summary, pageAppId, cc);
    if (context) {
      appendBreak(node);
      mountMonitorLine(node, context);
    }
    appendBreak(node);
    appendBreak(node);
    appendText(node, t("store_priceHistory_viewDetailsPrefix", "在"));
    appendLink(node, summary.source?.name || PROVIDER_LABEL, current.url || low.url || summary.source?.url);
    appendText(node, t("store_priceHistory_viewDetails", "查看详情"));
    return context;
  }

  function bindDlcRegionalPrice(node, queryId, target, historyLabel) {
    const bindTarget = api.features.regionalPricePopover?.bindTarget;
    if (typeof bindTarget !== "function") return;
    Promise.resolve(bindTarget(node, target.id)).then((result) => {
      if (!result?.started || !activeNode(node, queryId)) return;
      node.title = "";
      node.setAttribute("aria-label", historyLabel);
    }).catch(() => {
      // 保留已存在的历史价格 title，区域价格绑定失败时不制造空白悬浮目标。
    });
  }

  function renderDlcSummary(node, queryId, summary, target) {
    if (!activeNode(node, queryId)) return false;
    const low = summary.historicalLow;
    if (!summary.found || !low?.price) {
      return removeActiveNode(node, queryId);
    }
    node.dataset.stPriceHistoryState = "done";
    clearNode(node);
    appendSpan(node, t("store_priceHistory_dlcHistoricalLow", "史低"), `${DLC_NODE_CLASS}__label`);
    if ((Number(low.cut) || 0) > 0) {
      appendDlcDiscount(node, low.cut);
    }
    appendText(node, money(low.price));
    const historyLabel = t("store_priceHistory_dlcHistoryLabel", "历史最低 $price$，$date$，来源 $source$", {
      price: money(low.price),
      date: dateText(low.timestamp),
      source: summary.source?.name || PROVIDER_LABEL,
    });
    node.title = historyLabel;
    bindDlcRegionalPrice(node, queryId, target, historyLabel);
    return true;
  }

  function resultMessage(result = {}) {
    if (result.userMessage) return result.userMessage;
    if (result.code === "PROVIDER_GAME_NOT_FOUND") return t("store_priceHistory_providerGameNotFound", "ITAD 暂未收录当前 Steam 商品。");
    if (result.code === "CAPABILITY_UNSUPPORTED") return t("store_priceHistory_capabilityUnsupported", "当前平台暂不支持价格能力。");
    if (result.code === "PROVIDER_DISABLED") return t("store_priceHistory_providerDisabled", "第三方数据服务已关闭。");
    if (result.code === "PROVIDER_CONFIG_MISSING") return t("store_priceHistory_providerConfigMissing", "第三方价格数据未配置。");
    return t("store_priceHistory_providerUnavailable", "第三方价格数据暂不可用。");
  }

  function renderUnavailable(nodes, queryId, result) {
    Object.values(nodes).forEach(({ node, target }) => {
      if (target.surface === "dlc") {
        removeActiveNode(node, queryId);
        return;
      }
      setActiveMessage(node, queryId, resultMessage(result));
    });
  }

  async function renderPack(nodes, queryId, result, pageAppId, cc, chartSettings) {
    const monitorContexts = [];
    Object.values(nodes).forEach(({ node, target }) => {
      const summary = api.thirdPartyData?.summarizePricePack?.(result, target) || {};
      if (target.surface === "dlc") {
        renderDlcSummary(node, queryId, summary, target);
      } else {
        const context = renderSummary(node, queryId, summary, target, pageAppId, cc, chartSettings);
        if (context) monitorContexts.push(context);
      }
    });
    await Promise.all([
      hydrateMonitors(monitorContexts),
      Promise.all(monitorContexts.map(context => context.itemNameTask)),
    ]);
  }

  async function storePriceChartSettings() {
    const storage = globalThis.STSettings.storage;
    if (typeof storage.getStorePriceChart === "function") return storage.getStorePriceChart();
    return globalThis.STSettings.catalog.storePriceChartDefaults();
  }

  async function queryPricePack(appId, type, subIds, bundleids, cc, targets, chartSettings) {
    return api.thirdPartyData.getPricePack(pageInfo(appId, type, subIds, bundleids, targets), {
      pageCountry: cc,
      mode: "summary",
      includeHistory: type === "app" && chartSettings.lowCriterion !== "api",
      overviewSummary: type === "app",
      items: targets.map(target => ({ type: target.type, id: target.id })),
      overviewItems: targets
        .filter(target => target.surface !== "dlc")
        .map(target => ({ type: target.type, id: target.id })),
      historyItems: targets
        .filter(target => target.surface !== "dlc")
        .map(target => ({ type: target.type, id: target.id })),
      legacyItems: targets
        .filter(target => target.surface === "dlc")
        .map(target => ({ type: target.type, id: target.id })),
    });
  }

  function addPriceHistoryTag(appId, type, subIds = [], bundleids = [], cc = "cn") {
    const startedAt = Date.now();
    const queryId = `${Date.now()}-${seq += 1}`;

    clearExistingPriceNodes();
    if (type === "app" && skipPrice()) {
      log.info("price-history-query-skipped", "免费游戏跳过价格历史查询", {
        appid: Number(appId) || 0,
        type,
        reason: "free-only",
      });
      return Promise.resolve({});
    }

    if (!api.thirdPartyData?.getPricePack || !api.thirdPartyData?.summarizePricePack) {
      log.warn("price-history-service-missing", "价格数据服务未就绪", {
        appid: Number(appId) || 0,
        type: type || "app",
      });
      return Promise.resolve({});
    }

    const targets = purchaseTargets(appId, type, subIds, bundleids);
    const nodes = mountNodes(targets, queryId);
    const targetCount = Object.keys(nodes).length;
    if (!targetCount) {
      return Promise.resolve({});
    }

    log.info("price-history-query-start", "开始查询购买区历史价格", {
      appid: Number(appId) || 0,
      type: type || "app",
      targetCount,
      provider: "isthereanydeal",
    });

    return storePriceChartSettings()
      .then(chartSettings => queryPricePack(appId, type, subIds, bundleids, cc, targets, chartSettings)
        .then(result => ({ chartSettings, result })))
      .then(async ({ chartSettings, result }) => {
        if (result?.ok === true) {
          await renderPack(nodes, queryId, result, appId, cc, chartSettings);
        } else {
          renderUnavailable(nodes, queryId, result || {});
        }
        log[result?.ok === true ? "info" : "warn"](
          result?.ok === true ? "price-history-query-success" : "price-history-query-unavailable",
          result?.ok === true ? "购买区历史价格查询完成" : "购买区历史价格不可用",
          {
            appid: Number(appId) || 0,
            type: type || "app",
            targetCount,
            provider: result?.provider || "isthereanydeal",
            durationMs: Date.now() - startedAt,
            errorCode: result?.code || "",
          }
        );
        return nodes;
      })
      .catch((error) => {
        Object.values(nodes).forEach(({ node }) => {
          setActiveMessage(node, queryId, t("store_priceHistory_queryFailed", "价格查询失败，请稍后重试。"));
        });
        log.error("price-history-query-failed", "购买区历史价格查询异常", {
          appid: Number(appId) || 0,
          type: type || "app",
          durationMs: Date.now() - startedAt,
          errorCode: error?.code || error?.name || "PRICE_HISTORY_QUERY_FAILED",
        });
        return nodes;
      });
  }

  api.features.priceHistory = Object.freeze({
    add: addPriceHistoryTag,
    shouldSkip: skipPrice,
  });
})();
