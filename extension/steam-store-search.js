/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 商店搜索参数与搜索结果解析
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

((root) => {
  "use strict";

  const PAGE_SIZE = 50;
  const CATALOG_TTL = 5 * 60 * 1000;
  const REGION = "CN";
  const base = { cc: REGION.toLowerCase(), l: "schinese", ndl: "1" };
  const groups = {
    languages: "supportedlang", tags: "tags", excludeTags: "tags", types: "category1",
    playerModes: "category3", features: "category2", controllers: "controllersupport",
    accessibility: "accessibility", deck: "deck_compatibility", vr: "vrsupport", os: "os",
  };
  const sorting = {
    relevance: "_ASC", releaseDate: "Released_DESC", name: "Name_ASC",
    priceAsc: "Price_ASC", priceDesc: "Price_DESC", reviews: "Reviews_DESC",
  };
  const itemTypes = { App: "app", Sub: "sub", Bundle: "bundle" };
  let catalogCache;

  const invalid = message => Object.assign(new TypeError(message), { code: "CHAT_TOOL_INVALID" });
  const malformed = () => Object.assign(new Error("Steam 商店搜索响应结构异常"), { code: "AI_TOOL_RESPONSE_INVALID" });
  const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const parse = html => root.STSteamSearchHTML.parseDocument(html);
  const classes = element => (element.attribs?.class || "").split(/\s+/);
  const hasClass = (element, name) => classes(element).includes(name);
  const text = node => node.type === "text" ? node.data : node.name === "br" ? " " :
    (node.children || []).filter(child => !["script", "style"].includes(child.type)).map(text).join("");

  function json(source) {
    try { return JSON.parse(source); }
    catch (cause) { throw Object.assign(malformed(), { cause }); }
  }

  function* elements(node) {
    for (const child of node.children || []) {
      if (child.type !== "tag") continue;
      yield child;
      yield* elements(child);
    }
  }

  /** 对话与工作流共用输入定义。空数组和空关键词按未设筛选处理 */
  function validate(args) {
    const properties = root.STAI.STORE_SEARCH_PROPERTIES;
    if (!record(args)) throw invalid("Steam 商店搜索参数需要是字典");
    for (const [key, value] of Object.entries(args)) {
      if (!Object.hasOwn(properties, key)) throw invalid("Steam 商店搜索包含未登记的筛选");
      const { type, minimum, maxLength, enum: choices } = properties[key];
      const valid = type === "array" ? Array.isArray(value) && value.every(item => typeof item === "string" && item.trim()) :
        type === "number" ? Number.isFinite(value) && value >= minimum &&
          Number.isSafeInteger(Math.round(value * 100)) && Math.round(value * 100) / 100 === value :
        type === "integer" ? Number.isSafeInteger(value) && value >= minimum :
        typeof value === type && (maxLength === undefined || value.length <= maxLength) && (!choices || choices.includes(value));
      if (!valid) throw invalid("Steam 商店搜索参数无效：" + key);
    }
    if (args.freeOnly && (args.hideFreeToPlay || args.priceBelow !== undefined))
      throw invalid("免费价格档不能与隐藏免费开玩或价格上限一起使用");
    return args;
  }

  function readCatalog(html) {
    const options = new Map(Object.values(groups).map(key => [key, new Map()]));
    for (const node of elements(parse(html))) {
      if (!hasClass(node, "tab_filter_control_row")) continue;
      const { "data-param": group, "data-value": value, "data-loc": title } = node.attribs;
      if (options.has(group) && /^[a-z0-9_-]+$/i.test(value || "") && title) {
        options.get(group).set(value.toLowerCase(), value);
        options.get(group).set(title.trim().toLowerCase(), value);
      }
    }
    const match = /\bvar rgPriceStopData = (\[.*?\]);/.exec(html);
    if (!match || [...options.values()].some(group => !group.size)) throw malformed();
    const ranges = json(match[1]);
    if (!Array.isArray(ranges) || ranges[0]?.price !== "free" || ranges.at(-1)?.price !== null ||
      ranges.length < 3 || ranges.slice(1, -1).some((entry, index) => !Number.isSafeInteger(entry?.price) ||
        entry.price <= (index ? ranges[index].price : 0))) throw malformed();
    return { options, prices: ranges.slice(1, -1).map(entry => entry.price) };
  }

  async function catalog(request, store, signal) {
    if (Date.now() < catalogCache?.expires) return catalogCache.data;
    const url = new URL(store.search);
    url.search = new URLSearchParams({ term: "", ...base });
    const data = readCatalog(await request(url, signal, "text/html"));
    catalogCache = { data, expires: Date.now() + CATALOG_TTL };
    return data;
  }

  function searchParams(args, directory) {
    const params = new URLSearchParams({ term: args.term?.trim() || "", ...base });
    for (const [key, group] of Object.entries(groups)) {
      if (!args[key]?.length) continue;
      const options = directory.options.get(group);
      const choices = args[key].map(name => {
        const choice = options.get(name.trim().toLowerCase());
        if (!choice) throw invalid("Steam 商店无法识别筛选值：" + key + " · " + name);
        return choice;
      });
      params.set(key === "excludeTags" ? "untags" : group, [...new Set(choices)].join(","));
    }
    if (args.discountsOnly) params.set("specials", "1");
    if (args.hideFreeToPlay) params.set("hidef2p", "1");
    if (args.excludeVrOnly) params.set("unvrsupport", "401");
    if (args.sortBy) params.set("sort_by", sorting[args.sortBy]);
    if (args.freeOnly) params.set("maxprice", "free");
    if (args.priceBelow !== undefined) {
      const ceiling = directory.prices.find(price => price >= args.priceBelow);
      if (ceiling !== undefined) params.set("maxprice", String(ceiling));
    }
    return params;
  }

  function minor(textValue) {
    const match = /^¥\s*(\d[\d,]*)(?:\.(\d{2}))?$/.exec(textValue);
    if (!match) throw malformed();
    const amount = Number(match[1].replaceAll(",", "")) * 100 + Number(match[2] ?? 0);
    if (!Number.isSafeInteger(amount)) throw malformed();
    return amount;
  }

  function item(row, store) {
    const key = /^(App|Sub|Bundle)_(\d+)$/.exec(row.attribs["data-ds-itemkey"] || "");
    const id = Number(key?.[2]);
    if (!key || !Number.isSafeInteger(id) || id < 1 || !row.attribs.href) throw malformed();
    const type = itemTypes[key[1]];
    const href = new URL(row.attribs.href);
    if (href.origin !== store.origin || !href.pathname.startsWith(`/${type}/${id}/`)) throw malformed();
    const fields = [...elements(row)];
    const field = name => fields.find(element => hasClass(element, name));
    const title = field("title");
    const summary = field("search_review_summary")?.attribs["data-tooltip-html"];
    const final = field("discount_final_price");
    const original = field("discount_original_price");
    const discount = field("discount_block")?.attribs["data-discount"];
    const prices = field("search_price_discount_combined");
    const name = title && text(title).trim();
    if (!name || !prices || (!final && text(prices).trim()) ||
      discount !== undefined && (!/^\d{1,3}$/.test(discount) || Number(discount) > 100)) throw malformed();
    // Steam 部分免费商品的 data-price-final 是付费版价格，卡片显示价才是当前展示报价
    const priceMinor = final ? hasClass(final, "free") ? 0 : minor(text(final).trim()) : null;
    return {
      type, id, name, url: new URL(`/${type}/${id}/`, store.origin).href,
      currency: "CNY", priceMinor, originalPriceMinor: original ? minor(text(original).trim()) : null,
      discountPercent: discount === undefined ? null : Number(discount),
      reviewSummary: summary ? text(parse(summary)).split(/\s+/).filter(Boolean).join(" ") : null,
    };
  }

  function readResults(raw, start, store) {
    const response = json(raw);
    if (response?.success !== 1 || typeof response.results_html !== "string" ||
      !Number.isSafeInteger(response.total_count) || response.total_count < 0) throw malformed();
    const document = parse(response.results_html);
    const cards = [...elements(document)].filter(node => node.name === "a" &&
      (hasClass(node, "search_result_row") || Object.hasOwn(node.attribs, "data-ds-itemkey")));
    if (cards.some(card => !hasClass(card, "search_result_row"))) throw malformed();
    const rows = cards;
    const listBoundary = document.children.filter(node => node.type === "comment").map(node => node.data.trim());
    if (!listBoundary.includes("List Items") || !listBoundary.includes("End List Items")) throw malformed();
    if (response.start === -1 && !rows.length && start >= response.total_count)
      return { candidateTotal: response.total_count, scanned: 0, items: [], nextStart: null };
    if (response.start !== start || start >= response.total_count || !rows.length || rows.length > PAGE_SIZE) throw malformed();
    return { candidateTotal: response.total_count, scanned: rows.length, items: rows.map(row => item(row, store)),
      nextStart: start + PAGE_SIZE < response.total_count ? start + PAGE_SIZE : null };
  }

  /** 请求单页，金额以分返回。精确价格筛选只影响本页命中，不改变 Steam 的候选数与分页 */
  async function search(args, request, signal) {
    const store = root.STConfig.vendors.steamStore;
    const start = args.start ?? 0;
    const usesCatalog = args.priceBelow !== undefined || Object.keys(groups).some(key => args[key]?.length);
    const directory = usesCatalog ? await catalog(request, store, signal) : null;
    signal.throwIfAborted();
    const filters = searchParams(args, directory);
    const url = new URL(store.searchResults);
    url.search = new URLSearchParams({ ...Object.fromEntries(filters), query: "", start, count: PAGE_SIZE, dynamic_data: "", infinite: "1" });
    const result = readResults(await request(url, signal, "application/json"), start, store);
    if (args.freeOnly) result.items = result.items.filter(item => item.priceMinor === 0);
    if (args.priceBelow !== undefined) {
      const bound = Math.round(args.priceBelow * 100);
      result.items = result.items.filter(item => item.priceMinor !== null && item.priceMinor < bound);
    }
    const source = new URL(store.search);
    source.search = filters;
    return { source: "Steam", url: source.href, checkedAt: new Date().toISOString(), term: filters.get("term"), start, ...result };
  }

  root.STSteamStoreSearch = Object.freeze({ validate, search });
})(globalThis);
