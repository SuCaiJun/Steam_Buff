/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店详情价格图表固定区域与商店目录
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const VERSION = "steam-buff-price-comparison-catalog-v3";
  if (root.STPriceComparisonCatalog?.version === VERSION) return;

  // 主 Steam 定价区、额外 Steam 定价区和非 Steam 商店合计的图表序列上限。
  const MAX_STORE_PRICE_SERIES = 10;
  const STEAM_SHOP_ID = 61;

  function freezeItems(items) {
    return Object.freeze(items.map(item => Object.freeze({ ...item })));
  }

  const STEAM_PRICE_REGIONS = freezeItems([
    { cc: "US", pricingRegion: "USD", expectedCurrency: "USD", label: "美国", group: "local" },
    { cc: "CN", pricingRegion: "CNY", expectedCurrency: "CNY", label: "中国大陆", group: "local" },
    { cc: "JP", pricingRegion: "JPY", expectedCurrency: "JPY", label: "日本", group: "local" },
    { cc: "DE", pricingRegion: "EUR", expectedCurrency: "EUR", label: "欧元区", group: "local" },
    { cc: "RU", pricingRegion: "RUB", expectedCurrency: "RUB", label: "俄罗斯", group: "local" },
    { cc: "PL", pricingRegion: "PLN", expectedCurrency: "PLN", label: "波兰", group: "local" },
    { cc: "BR", pricingRegion: "BRL", expectedCurrency: "BRL", label: "巴西", group: "local" },
    { cc: "VN", pricingRegion: "VND", expectedCurrency: "VND", label: "越南", group: "local" },
    { cc: "KR", pricingRegion: "KRW", expectedCurrency: "KRW", label: "韩国", group: "local" },
    { cc: "ID", pricingRegion: "IDR", expectedCurrency: "IDR", label: "印度尼西亚", group: "local" },
    { cc: "TW", pricingRegion: "TWD", expectedCurrency: "TWD", label: "中国台湾", group: "local" },
    { cc: "HK", pricingRegion: "HKD", expectedCurrency: "HKD", label: "中国香港", group: "local" },
    { cc: "UA", pricingRegion: "UAH", expectedCurrency: "UAH", label: "乌克兰", group: "local" },
    { cc: "KZ", pricingRegion: "KZT", expectedCurrency: "KZT", label: "哈萨克斯坦", group: "local" },
    { cc: "GB", pricingRegion: "GBP", expectedCurrency: "GBP", label: "英国", group: "local" },
    { cc: "CH", pricingRegion: "CHF", expectedCurrency: "CHF", label: "瑞士", group: "local" },
    { cc: "NO", pricingRegion: "NOK", expectedCurrency: "NOK", label: "挪威", group: "local" },
    { cc: "TH", pricingRegion: "THB", expectedCurrency: "THB", label: "泰国", group: "local" },
    { cc: "PH", pricingRegion: "PHP", expectedCurrency: "PHP", label: "菲律宾", group: "local" },
    { cc: "SG", pricingRegion: "SGD", expectedCurrency: "SGD", label: "新加坡", group: "local" },
    { cc: "MY", pricingRegion: "MYR", expectedCurrency: "MYR", label: "马来西亚", group: "local" },
    { cc: "MX", pricingRegion: "MXN", expectedCurrency: "MXN", label: "墨西哥", group: "local" },
    { cc: "CA", pricingRegion: "CAD", expectedCurrency: "CAD", label: "加拿大", group: "local" },
    { cc: "AU", pricingRegion: "AUD", expectedCurrency: "AUD", label: "澳大利亚", group: "local" },
    { cc: "NZ", pricingRegion: "NZD", expectedCurrency: "NZD", label: "新西兰", group: "local" },
    { cc: "IN", pricingRegion: "INR", expectedCurrency: "INR", label: "印度", group: "local" },
    { cc: "CL", pricingRegion: "CLP", expectedCurrency: "CLP", label: "智利", group: "local" },
    { cc: "PE", pricingRegion: "PEN", expectedCurrency: "PEN", label: "秘鲁", group: "local" },
    { cc: "CO", pricingRegion: "COP", expectedCurrency: "COP", label: "哥伦比亚", group: "local" },
    { cc: "ZA", pricingRegion: "ZAR", expectedCurrency: "ZAR", label: "南非", group: "local" },
    { cc: "SA", pricingRegion: "SAR", expectedCurrency: "SAR", label: "沙特阿拉伯", group: "local" },
    { cc: "AE", pricingRegion: "AED", expectedCurrency: "AED", label: "阿联酋", group: "local" },
    { cc: "IL", pricingRegion: "ILS", expectedCurrency: "ILS", label: "以色列", group: "local" },
    { cc: "KW", pricingRegion: "KWD", expectedCurrency: "KWD", label: "科威特", group: "local" },
    { cc: "QA", pricingRegion: "QAR", expectedCurrency: "QAR", label: "卡塔尔", group: "local" },
    { cc: "CR", pricingRegion: "CRC", expectedCurrency: "CRC", label: "哥斯达黎加", group: "local" },
    { cc: "UY", pricingRegion: "UYU", expectedCurrency: "UYU", label: "乌拉圭", group: "local" },
    { cc: "AM", pricingRegion: "USD_CIS", expectedCurrency: "USD", label: "独联体美元区", group: "local" },
    { cc: "AR", pricingRegion: "USD_LATAM", expectedCurrency: "USD", label: "拉丁美洲美元区", group: "local" },
    { cc: "TR", pricingRegion: "USD_MENA", expectedCurrency: "USD", label: "中东和北非美元区", group: "local" },
    { cc: "PK", pricingRegion: "USD_SASIA", expectedCurrency: "USD", label: "南亚美元区", group: "local" },
  ]);

  const ITAD_PRICE_SHOPS = freezeItems([
    { id: 61, label: "Steam", chartLabel: "Steam", fixed: true },
    { id: 6, label: "Fanatical", chartLabel: "Fanatical" },
    { id: 16, label: "Epic Games Store", chartLabel: "Epic" },
    { id: 35, label: "GOG", chartLabel: "GOG" },
    { id: 36, label: "Green Man Gaming", chartLabel: "GMG" },
    { id: 37, label: "Humble Store", chartLabel: "Humble Store" },
    { id: 19, label: "2Game", chartLabel: "2Game" },
    { id: 62, label: "Ubisoft Store", chartLabel: "Ubisoft" },
    { id: 48, label: "Microsoft Store", chartLabel: "Microsoft" },
    { id: 20, label: "GameBillet", chartLabel: "GameBillet" },
    { id: 26, label: "GamesPlanet UK", chartLabel: "GP UK" },
    { id: 27, label: "GamesPlanet DE", chartLabel: "GP DE" },
    { id: 28, label: "GamesPlanet FR", chartLabel: "GP FR" },
    { id: 29, label: "GamesPlanet US", chartLabel: "GP US" },
    { id: 42, label: "IndieGala Store", chartLabel: "IndieGala" },
  ]);

  const regionByCc = new Map(STEAM_PRICE_REGIONS.map(item => [item.cc, item]));
  const shopById = new Map(ITAD_PRICE_SHOPS.map(item => [item.id, item]));

  function cleanCc(value) {
    return String(value || "").trim().toUpperCase();
  }

  function cleanShopId(value) {
    const id = Number.parseInt(value, 10);
    return Number.isInteger(id) ? id : 0;
  }

  function getSteamPriceRegion(cc) {
    return regionByCc.get(cleanCc(cc)) || null;
  }

  function getItadPriceShop(id) {
    return shopById.get(cleanShopId(id)) || null;
  }

  function steamSeriesId(cc) {
    const region = getSteamPriceRegion(cc);
    return region ? `steam:${region.cc}` : "";
  }

  function shopSeriesId(id) {
    const shop = getItadPriceShop(id);
    return shop ? `shop:${shop.id}` : "";
  }

  function steamSeriesLabel(cc) {
    const region = getSteamPriceRegion(cc);
    return region ? `Steam（${region.label}）` : "";
  }

  function shopSeriesLabel(id) {
    return getItadPriceShop(id)?.label || "";
  }

  function shopChartLabel(id) {
    return getItadPriceShop(id)?.chartLabel || "";
  }

  function limitStorePriceSelection(values = {}) {
    const mainCountry = cleanCc(values.mainCountry);
    const additionalSteamRegions = Array.from(new Set(
      (Array.isArray(values.additionalSteamRegions) ? values.additionalSteamRegions : [])
        .map(cleanCc)
        .filter(cc => cc !== mainCountry && !!getSteamPriceRegion(cc)),
    )).slice(0, MAX_STORE_PRICE_SERIES - 1);
    const maxShops = Math.max(1, MAX_STORE_PRICE_SERIES - additionalSteamRegions.length);
    const shops = [
      STEAM_SHOP_ID,
      ...Array.from(new Set((Array.isArray(values.shops) ? values.shops : []).map(cleanShopId)))
        .filter(id => id !== STEAM_SHOP_ID && !!getItadPriceShop(id)),
    ].slice(0, maxShops);
    return {
      additionalSteamRegions,
      shops,
      seriesCount: additionalSteamRegions.length + shops.length,
    };
  }

  const api = Object.freeze({
    version: VERSION,
    STEAM_PRICE_REGIONS,
    ITAD_PRICE_SHOPS,
    STEAM_SHOP_ID,
    MAX_STORE_PRICE_SERIES,
    getSteamPriceRegion,
    getItadPriceShop,
    steamSeriesId,
    shopSeriesId,
    steamSeriesLabel,
    shopSeriesLabel,
    shopChartLabel,
    limitStorePriceSelection,
  });

  root.STPriceComparisonCatalog = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
