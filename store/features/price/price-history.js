/*
 * @Author        : 顾青离
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

  const PROVIDER_LABEL = "IsThereAnyDeal";
  const LOADING_TEXT = "正在读取历史最低价格...";
  const DLC_LOADING_TEXT = "史低读取中...";
  const DLC_SECTION_SELECTOR = ".game_area_dlc_section";
  const DLC_ROW_SELECTOR = ".game_area_dlc_row";
  const DLC_NODE_CLASS = "st-dlc-lowest-price";
  const log = window.STLoggerFactory.createLogger("store", "price-history");
  const THEME = window.STTheme || {};
  const colors = THEME.colors || {};
  const spacing = THEME.spacing || {};
  const { applyStyles } = api.styles || {};
  const hasHiddenAncestor = api.dom?.hasHiddenAncestor;
  const formatPrice = api.format?.formatPrice;
  const formatDate = api.format?.formatDate;
  const calculateDaysDiff = api.format?.calculateDaysDiff;
  let seq = 0;

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
    link.href = safeUrl(url);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
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

  function idsFrom(value) {
    const raw = Array.isArray(value) ? value : [value];
    return raw.map(item => parseInt(item, 10)).filter(item => item > 0);
  }

  function targetKey(target) {
    return `${target.type}:${target.id}`;
  }

  function appidFromValue(value) {
    const match = String(value || "").match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  }

  function appidFromDlcRow(row) {
    const own = appidFromValue(row?.dataset?.dsAppid || row?.getAttribute?.("data-ds-appid"));
    if (own) return own;
    const holder = row?.querySelector?.("[data-ds-appid], [data-appid], [data-app-id]");
    const fromHolder = appidFromValue(holder?.dataset?.dsAppid || holder?.dataset?.appid || holder?.dataset?.appId);
    if (fromHolder) return fromHolder;
    const link = row?.querySelector?.('a[href*="/app/"]');
    const match = String(link?.href || "").match(/\/app\/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  function dlcPriceText(row) {
    const nodes = row?.querySelectorAll?.([
      ".discount_final_price",
      ".discount_original_price",
      ".game_area_dlc_price",
      ".dlc_purchase_action",
    ].join(",")) || [];
    const text = Array.from(nodes).map(node => node.textContent).join(" ");
    return normalizeSteamText(text || row?.textContent || "");
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
    const selectors = [".game_area_dlc_price", ".dlc_purchase_action", ".discount_block", ".game_purchase_discount"];
    for (const selector of selectors) {
      const node = row.querySelector?.(selector);
      if (node) return node;
    }
    const price = row.querySelector?.(".discount_final_price") || row.querySelector?.(".discount_original_price");
    return price?.closest?.(".discount_block, .game_purchase_discount") || price?.parentNode || price || null;
  }

  function dlcFallbackNode(row) {
    const selectors = [".game_area_dlc_name", ".tab_item_name", "h4"];
    for (const selector of selectors) {
      const node = row.querySelector?.(selector);
      if (node) return node;
    }

    return Array.from(row.children || []).find((child) => {
      const cls = ` ${String(child?.className || "")} `;
      return !cls.includes(" game_area_dlc_price ")
        && !cls.includes(" dlc_purchase_action ")
        && !cls.includes(" discount_final_price ")
        && !cls.includes(" discount_original_price ");
    }) || row;
  }

  function dlcMountPoint(row) {
    if (!row || row.isConnected === false) return null;
    const price = dlcPriceAnchor(row);
    if (price?.parentNode) return { parent: price.parentNode, before: price };
    return { parent: dlcFallbackNode(row), before: null };
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
  }

  function markLoading(node, queryId, target) {
    node.dataset.stPriceHistoryQueryId = String(queryId);
    node.dataset.stPriceHistoryTarget = targetKey(target);
    node.dataset.stPriceHistoryProvider = "store-data-service";
    node.dataset.stPriceHistoryState = "loading";
    node.textContent = target.surface === "dlc" ? DLC_LOADING_TEXT : LOADING_TEXT;
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
    if (amount === null) return "暂无";
    const currency = String(price?.currency || "").trim();
    return typeof formatPrice === "function" && currency ? formatPrice(amount, currency) : `${currency} ${amount}`.trim();
  }

  function dateText(value) {
    if (typeof formatDate === "function") return formatDate(value);
    const time = Date.parse(String(value || ""));
    if (!Number.isFinite(time)) return "未知日期";
    return new Date(time).toISOString().slice(0, 10);
  }

  function daysText(value) {
    if (typeof calculateDaysDiff !== "function") return "";
    const days = calculateDaysDiff(value);
    return days > 0 ? `（${days}天前）` : "";
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

    if (currentAmount <= lowAmount) {
      if ((Number(current?.cut) || 0) > (Number(low?.cut) || 0)) {
        appendText(parent, " ，比历史最低");
        appendSpan(parent, `便宜${money({ amount: Math.abs(diff), currency })}(-${Math.abs(cutDiff)}%)`, "", {
          color: colors.success,
        });
      } else {
        appendText(parent, " ，与历史最低折扣持平");
      }
      return;
    }

    appendText(parent, " ，比历史最低");
    appendSpan(parent, `贵${money({ amount: diff, currency })}(+${Math.abs(cutDiff)}%)`, "", {
      color: colors.danger,
    });
  }

  function renderSummary(node, queryId, summary) {
    if (!activeNode(node, queryId)) return false;
    const current = summary.current;
    const low = summary.historicalLow;
    if (!summary.found) {
      return setActiveMessage(node, queryId, "ITAD 暂未收录当前购买项。");
    }
    if (!current?.price || !low?.price) {
      return setActiveMessage(node, queryId, "价格数据不完整。");
    }

    node.dataset.stPriceHistoryState = "done";
    clearNode(node);
    appendText(node, "历史最低折扣在 ");
    appendSpan(node, dateText(low.timestamp), "", { textDecoration: "underline" });
    appendText(node, `${daysText(low.timestamp)} 为 `);
    appendDiscount(node, low.cut);
    appendText(node, ` ${money(low.price)}`);

    appendBreak(node);
    const currentAmount = amountOf(current.price);
    const lowAmount = amountOf(low.price);
    if (currentAmount !== null && lowAmount !== null && currentAmount <= lowAmount) {
      appendSpan(node, "当前为历史最低折扣", "game_purchase_discount_countdown", {
        color: colors.danger,
      });
    } else if ((Number(current.cut) || 0) === 0) {
      appendSpan(node, "当前为原价");
    } else {
      appendSpan(node, "当前最低折扣");
    }

    if ((Number(current.cut) || 0) > 0) {
      appendText(node, " ");
      appendDiscount(node, current.cut);
    }
    appendText(node, ` ${money(current.price)}`);
    appendCompare(node, current, low);

    appendBreak(node);
    appendBreak(node);
    appendText(node, "在");
    appendLink(node, summary.source?.name || PROVIDER_LABEL, current.url || low.url || summary.source?.url);
    appendText(node, "查看详情");
    return true;
  }

  function renderDlcSummary(node, queryId, summary) {
    if (!activeNode(node, queryId)) return false;
    const low = summary.historicalLow;
    if (!summary.found || !low?.price) {
      return removeActiveNode(node, queryId);
    }
    node.dataset.stPriceHistoryState = "done";
    clearNode(node);
    appendSpan(node, "史低", `${DLC_NODE_CLASS}__label`);
    if ((Number(low.cut) || 0) > 0) {
      appendDlcDiscount(node, low.cut);
    }
    appendText(node, money(low.price));
    node.title = `历史最低 ${money(low.price)}，${dateText(low.timestamp)}，来源 ${summary.source?.name || PROVIDER_LABEL}`;
    return true;
  }

  function resultMessage(result = {}) {
    if (result.userMessage) return result.userMessage;
    if (result.code === "PROVIDER_GAME_NOT_FOUND") return "ITAD 暂未收录当前 Steam 商品。";
    if (result.code === "CAPABILITY_UNSUPPORTED") return "当前平台暂不支持价格能力。";
    if (result.code === "PROVIDER_DISABLED") return "第三方数据服务已关闭。";
    if (result.code === "PROVIDER_CONFIG_MISSING") return "第三方价格数据未配置。";
    return "第三方价格数据暂不可用。";
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

  function renderPack(nodes, queryId, result) {
    Object.values(nodes).forEach(({ node, target }) => {
      const summary = api.thirdPartyData?.summarizePricePack?.(result, target) || {};
      if (target.surface === "dlc") {
        renderDlcSummary(node, queryId, summary);
      } else {
        renderSummary(node, queryId, summary);
      }
    });
  }

  async function queryPricePack(appId, type, subIds, bundleids, cc, targets) {
    return api.thirdPartyData.getPricePack(pageInfo(appId, type, subIds, bundleids, targets), {
      pageCountry: cc,
      mode: "summary",
      includeHistory: false,
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

    return queryPricePack(appId, type, subIds, bundleids, cc, targets)
      .then((result) => {
        if (result?.ok === true) {
          renderPack(nodes, queryId, result);
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
          setActiveMessage(node, queryId, "价格查询失败，请稍后重试。");
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
