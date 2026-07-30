/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : SteamPY 购买区价格入口
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;
  const STEAMPY = globalThis.STConfig.vendors.steampy;
  const externalNavigation = globalThis.STConfig.externalNavigation;

  const hasHiddenAncestor = api.dom.hasHiddenAncestor;
  const apiCache = api.cache;
  const sendRequest = api.net.sendRequest;

  const ROOT_CLASS = "st_steampy_deals";
  const OWNER = "store:steampy-deals";
  const NARROW_WIDTH = 720;
  const FEATURES = Object.freeze({
    cdk: "steampy-cdk-price",
    proxy: "steampy-proxy-price",
  });
  const log = window.STLoggerFactory.createLogger("store", "steampy-deals");
  let resizeHooked = false;
  let nextResourceId = 0;
  const disposers = new Set();
  const panelResources = new WeakMap();

  function track(dispose) {
    const wrapped = () => {
      if (!disposers.delete(wrapped)) return;
      dispose();
    };
    disposers.add(wrapped);
    return wrapped;
  }

  function cleanText(value) {
    return String(value || "").trim();
  }

  function on(id) {
    return api.settings?.on?.(id) !== false;
  }

  function needPy() {
    return on(FEATURES.cdk) || on(FEATURES.proxy);
  }

  function anyEnabled() {
    return needPy();
  }

  function visibleSections() {
    const sections = Array.from(new Set(document.querySelectorAll(
      "#game_area_purchase .game_area_purchase_game, .game_area_purchase_game"
    )));

    return sections.filter(section => {
      if (typeof hasHiddenAncestor === "function") {
        return !hasHiddenAncestor(section, true);
      }
      return !!(section.offsetWidth || section.offsetHeight || section.getClientRects().length);
    });
  }

  function firstSection() {
    return visibleSections()[0] || null;
  }

  function productInput(section) {
    return section.querySelector('input[name="subid"], input[name="bundleid"]');
  }

  function productKey(section) {
    const input = productInput(section);
    if (!input?.value || !input.name) return "";
    return `${input.name}:${input.value}`;
  }

  function cleanup(appId) {
    const visible = new Set(visibleSections());
    const seen = new Set();

    document.querySelectorAll(`.${ROOT_CLASS}`).forEach(node => {
      const section = node.closest(".game_area_purchase_game");
      const key = section ? productKey(section) || "app" : "";
      const cacheKey = `${node.dataset.steamAppId || ""}:${key}`;
      const keep = section
        && visible.has(section)
        && node.dataset.steamAppId === appId
        && !hasHiddenAncestor?.(node, false)
        && !seen.has(cacheKey);

      if (keep) {
        seen.add(cacheKey);
        return;
      }

      disposePanel(node);
      node.remove();
    });
  }

  function disposePanel(root) {
    panelResources.get(root)?.();
    panelResources.delete(root);
  }

  function hasPanel(section, appId) {
    return Array.from(section.children).some(node => {
      return node.classList?.contains(ROOT_CLASS) && node.dataset.steamAppId === appId;
    });
  }

  function ensureStyle() {
    api.styles?.ensureFeatureStyle?.("steampy-deals", { owner: OWNER, key: "style" });
  }

  function parsePrice(text) {
    const raw = cleanText(text).replace(/\s+/g, "");
    if (!raw) return null;

    const match = raw.match(/(?:￥|¥|CNY)?([0-9][0-9,]*(?:\.[0-9]+)?)/i);
    if (!match) return null;

    const value = Number(match[1].replace(/,/g, ""));
    return Number.isFinite(value) ? value : null;
  }

  function basePrice(section) {
    const original = parsePrice(section.querySelector(".discount_original_price")?.textContent);
    if (original && original > 0) return original;

    const regular = parsePrice(section.querySelector(".game_purchase_price")?.textContent);
    if (regular && regular > 0) return regular;

    const finalPrice = parsePrice(section.querySelector(".discount_final_price")?.textContent);
    return finalPrice && finalPrice > 0 ? finalPrice : null;
  }

  function pct(base, price, fallback) {
    if (Number.isFinite(Number(fallback)) && Number(fallback) > 0) {
      return Math.round(Number(fallback));
    }
    if (!base || !price || price >= base) return 0;
    return Math.max(0, Math.round((1 - price / base) * 100));
  }

  function fmtPrice(price) {
    const value = Number(price);
    if (!Number.isFinite(value)) return "";
    return `￥${value.toFixed(2)}`;
  }

  function createRow(name, cut, price, url, extraClass = "") {
    const row = document.createElement(url ? "a" : "div");
    row.className = `${ROOT_CLASS}_row ${extraClass}`.trim();
    if (url) {
      externalNavigation.applyToLink(row, url);
    }

    const nameNode = document.createElement("span");
    nameNode.className = `${ROOT_CLASS}_name`;
    nameNode.textContent = name;

    const labelNode = document.createElement("span");
    labelNode.className = `${ROOT_CLASS}_label`;
    labelNode.appendChild(nameNode);

    const cutNode = document.createElement("span");
    cutNode.className = `${ROOT_CLASS}_cut`;
    cutNode.textContent = cut > 0 ? `-${cut}%` : "";

    const priceNode = document.createElement("span");
    priceNode.className = `${ROOT_CLASS}_price`;
    priceNode.textContent = fmtPrice(price);

    const valueNode = document.createElement("span");
    valueNode.className = `${ROOT_CLASS}_value`;
    valueNode.append(cutNode, priceNode);

    row.append(labelNode, valueNode);
    return row;
  }

  function createLoadingRow() {
    const row = document.createElement("div");
    row.className = `${ROOT_CLASS}_empty`;
    row.textContent = "正在读取价格...";
    return row;
  }

  function setRows(root, rows) {
    root.querySelectorAll(`.${ROOT_CLASS}_row, .${ROOT_CLASS}_empty`).forEach(node => node.remove());
    const section = root.closest(".game_area_purchase_game");
    root.hidden = rows.length === 0;
    if (section) {
      section.classList.toggle(`${ROOT_CLASS}_host`, rows.length > 0);
      section.classList.toggle(`${ROOT_CLASS}_host_compact`, rows.length > 0 && root.classList.contains("compact"));
    }
    rows.forEach(row => root.appendChild(row));
  }

  function sectionPayload(section, appId) {
    const input = productInput(section);
    if (!input || !input.value || !/^\d+$/.test(input.value)) return null;
    const type = input.name === "bundleid" ? "bundleid" : "subid";
    return {
      id: input.value,
      type,
      url: STEAMPY.gameData(input.value, appId, type),
    };
  }

  function fetchPy(section, appId) {
    const payload = sectionPayload(section, appId);
    if (!payload) return Promise.resolve(null);

    const cacheKey = `steampy_deal::${appId}::${payload.type}::${payload.id}`;
    const cached = apiCache.get(cacheKey);
    if (cached) return Promise.resolve(cached);

    const startedAt = Date.now();
    log.info("steampy-price-query-start", "开始查询 SteamPY 价格", {
      appid: appId,
      [payload.type]: payload.id,
    });

    return sendRequest({
      method: "GET",
      headers: { Accept: "application/json" },
      url: payload.url,
      parseJSON: true,
      timeoutMs: 10 * 1000,
      retries: 1,
      validate(data) {
        return !!data && typeof data === "object";
      },
    }).then(data => {
      apiCache.set(cacheKey, data);
      log.info("steampy-price-query-success", "SteamPY 价格查询完成", {
        appid: appId,
        [payload.type]: payload.id,
        status: data?.success === false ? "empty" : "ok",
        durationMs: Date.now() - startedAt,
      });
      return data;
    }).catch((error) => {
      log.error("steampy-price-query-failed", "SteamPY 价格查询失败", {
        appid: appId,
        [payload.type]: payload.id,
        durationMs: Date.now() - startedAt,
        error,
      });
      return null;
    });
  }

  function pyRows(data, base) {
    const result = data?.result;
    if (!data?.success || !result) return [];

    const rows = [];
    const id = result.id;
    const keyPrice = Number(result.keyPrice);
    const daiPrice = Number(result.daiPrice);

    if (on(FEATURES.cdk) && Number.isFinite(keyPrice) && keyPrice > 0) {
      rows.push(createRow(
        "PY CDK",
        pct(base, keyPrice),
        keyPrice,
        id ? STEAMPY.cdkDetail(id) : null
      ));
    }

    if (on(FEATURES.proxy) && Number.isFinite(daiPrice) && daiPrice > 0) {
      rows.push(createRow(
        "PY 代购",
        pct(base, daiPrice),
        daiPrice,
        id ? STEAMPY.proxyDetail(id) : null
      ));
    }

    return rows;
  }

  function compact(root) {
    const section = root.closest(".game_area_purchase_game");
    if (!section) return;
    const isCompact = section.getBoundingClientRect().width < NARROW_WIDTH;
    root.classList.toggle("compact", isCompact);
    section.classList.toggle(`${ROOT_CLASS}_host_compact`, isCompact);
  }

  function hookResize(root) {
    compact(root);
    if (typeof ResizeObserver === "function") {
      const section = root.closest(".game_area_purchase_game");
      if (!section) return;
      const observer = new ResizeObserver(() => compact(root));
      observer.observe(section);
      const key = `resize:${root.dataset.steamPyResourceId || root.dataset.steamAppId || "app"}`;
      const disposeObserver = track(() => observer.disconnect());
      const handle = window.STRuntime?.current?.()?.registerResource?.({
        owner: OWNER,
        key,
        type: "observer",
        dispose: disposeObserver,
      });
      panelResources.set(root, () => {
        if (handle) {
          handle.dispose();
        } else {
          disposeObserver();
        }
      });
      return;
    }
    if (resizeHooked) return;
    resizeHooked = true;
    const onResize = () => {
      document.querySelectorAll(`.${ROOT_CLASS}`).forEach(compact);
    };
    window.addEventListener("resize", onResize);
    const disposeResize = track(() => window.removeEventListener("resize", onResize));
    window.STRuntime?.current?.()?.registerResource?.({
      owner: OWNER,
      key: "window-resize",
      type: "listener",
      meta: { event: "resize" },
      dispose: disposeResize,
    });
  }

  function createPanel(section, appId) {
    const root = document.createElement("div");
    root.className = ROOT_CLASS;
    root.dataset.steamAppId = appId;
    root.dataset.steamPyResourceId = String(++nextResourceId);
    root.appendChild(createLoadingRow());

    const base = basePrice(section);
    const usePy = needPy();

    (usePy ? fetchPy(section, appId) : Promise.resolve(null)).then(py => {
      const rows = usePy ? pyRows(py, base) : [];
      setRows(root, rows);
      compact(root);
    }).catch(() => {
      setRows(root, []);
    });

    return root;
  }

  function render(appId) {
    if (!anyEnabled()) return false;

    const sections = visibleSections();
    if (!sections.length) return false;

    ensureStyle();

    let rendered = false;
    sections.forEach(section => {
      if (hasPanel(section, appId)) return;
      if (window.getComputedStyle(section).position === "static") {
        section.style.position = "relative";
      }
      const panel = createPanel(section, appId);
      section.classList.add(`${ROOT_CLASS}_host`);
      section.appendChild(panel);
      hookResize(panel);
      rendered = true;
    });

    return rendered;
  }

  function add(appId) {
    const id = cleanText(appId);
    if (!id || !/^\d+$/.test(id) || !location.pathname.includes(`/app/${id}`)) {
      return Promise.resolve();
    }
    if (!anyEnabled()) {
      return Promise.resolve();
    }

    cleanup(id);
    const section = firstSection();
    if (!section || hasPanel(section, id)) {
      return Promise.resolve();
    }

    render(id);
    return Promise.resolve();
  }

  function has(appId) {
    if (!anyEnabled()) return true;

    const id = cleanText(appId);
    if (!id) return false;

    const sections = visibleSections();
    return sections.length === 0 || sections.every(section => hasPanel(section, id));
  }

  function stop() {
    document.querySelectorAll(`.${ROOT_CLASS}`).forEach(node => {
      disposePanel(node);
      node.remove();
    });
    window.STRuntime?.current?.()?.disposeOwner?.(OWNER);
    Array.from(disposers).forEach(dispose => dispose());
    resizeHooked = false;
  }

  api.features.steamPyDeals = Object.freeze({
    add,
    has,
    stop,
  });
})();
