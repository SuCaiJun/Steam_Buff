/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 扩展设置分类与功能目录
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = globalThis.STSettings = globalThis.STSettings || {};

  if (api.catalog) {
    return;
  }

  const UI_LOCALE_KEY = "SETTING_UI_LOCALE";

  const SOURCE_TIPS = Object.freeze({
    translate: "数据来源/运行库：xnx3 translate.js 本地库。授权：MIT License",
    familySharing: "数据来源：Augmented Steam API。授权：GPL-3.0，接口可用性不保证。",
    workshop: "数据来源：Steam Store appdetails categories 分类，接口可用性以 Steam 官方返回为准。",
    subscriptionInfo: "数据来源：SubscriptionInfo。授权： MPL-2.0；数据来源以第三方维护方为准。",
    priceHistory: "数据基于第三方服务实现，使用前请先设置第三方服务。",
    wishlistPriceHistory: "数据来源：Steam Store appdetails 当前价、用户配置的 IsThereAnyDeal API Key 历史价格与 SteamPY 授权价格。",
    steampyCdk: "数据来源：SteamPY。授权/版权：已获得SteamPY官方授权；CDK 价格以 SteamPY 返回为准。",
    steampyProxy: "数据来源：SteamPY。授权/版权：已获得SteamPY官方授权；代购价格以 SteamPY 返回为准。",
    purchaseHistoryClassifier: "功能来源：Steam 消费历史分类器 userscript，作者 SmallFork。授权：MIT License。",
    isthereanydeal: "数据来源：IsThereAnyDeal 官方 API。用户自备 API Key，本扩展不托管、不共享密钥。",
  });

  const TRANSLATE_KEYS = Object.freeze({
    scope: "scope",
    page: "page",
    selection: "selection",
    selectionTrigger: "selectionTrigger",
    selectionAction: "selectionAction",
    selectionClose: "selectionClose",
    selectionService: "selectionService",
    newsPopup: "newsPopup",
    newsPopupService: "newsPopupService",
    local: "local",
    to: "to",
    service: "service",
    aiPerformance: "aiPerformance",
    force: "force",
    select: "select",
    style: "style",
    hover: "hover",
  });

  const TRANSLATE_DEFAULTS = Object.freeze({
    [TRANSLATE_KEYS.scope]: "steam",
    [TRANSLATE_KEYS.page]: false,
    [TRANSLATE_KEYS.selection]: true,
    [TRANSLATE_KEYS.selectionTrigger]: "direct",
    [TRANSLATE_KEYS.selectionAction]: "click",
    [TRANSLATE_KEYS.selectionClose]: "auto",
    [TRANSLATE_KEYS.selectionService]: "follow",
    [TRANSLATE_KEYS.newsPopup]: true,
    [TRANSLATE_KEYS.newsPopupService]: "follow",
    [TRANSLATE_KEYS.local]: "chinese_simplified",
    [TRANSLATE_KEYS.to]: "chinese_simplified",
    [TRANSLATE_KEYS.service]: "client.edge",
    [TRANSLATE_KEYS.aiPerformance]: true,
    [TRANSLATE_KEYS.force]: false,
    [TRANSLATE_KEYS.select]: false,
    [TRANSLATE_KEYS.style]: "dashedLine",
    [TRANSLATE_KEYS.hover]: true,
  });

  const LANGUAGES = Object.freeze([
    { value: "chinese_simplified", label: "简体中文" },
    { value: "chinese_traditional", label: "繁体中文" },
    { value: "english", label: "英语" },
    { value: "japanese", label: "日语" },
    { value: "korean", label: "韩语" },
    { value: "french", label: "法语" },
    { value: "italian", label: "意大利语" },
    { value: "deutsch", label: "德语" },
    { value: "portuguese", label: "葡萄牙语" },
    { value: "spanish", label: "西班牙语" },
    { value: "russian", label: "俄语" },
  ]);

  const TRANSLATE_FIELDS = Object.freeze([
    {
      type: "select",
      key: TRANSLATE_KEYS.scope,
      label: "作用范围",
      options: Object.freeze([
        { value: "steam", label: "Steam 网站" },
        { value: "global", label: "全局网站" },
      ]),
    },
    {
      type: "checkbox",
      key: TRANSLATE_KEYS.page,
      label: "网页自动翻译",
    },
    {
      type: "checkbox",
      key: TRANSLATE_KEYS.selection,
      label: "鼠标划词翻译",
    },
    {
      type: "select",
      key: TRANSLATE_KEYS.selectionTrigger,
      label: "划词触发方式",
      options: Object.freeze([
        { value: "direct", label: "划词后直接翻译" },
        { value: "icon", label: "显示翻译图标" },
        { value: "dot", label: "显示悬浮圆点" },
      ]),
    },
    {
      type: "select",
      key: TRANSLATE_KEYS.selectionAction,
      label: "悬浮触发动作",
      showWhen: Object.freeze({
        key: TRANSLATE_KEYS.selectionTrigger,
        values: Object.freeze(["icon", "dot"]),
      }),
      options: Object.freeze([
        { value: "click", label: "点击翻译" },
        { value: "hover", label: "悬浮触发" },
      ]),
    },
    {
      type: "select",
      key: TRANSLATE_KEYS.selectionClose,
      label: "划词弹窗关闭方式",
      options: Object.freeze([
        { value: "auto", label: "自动关闭" },
        { value: "manual", label: "手动关闭" },
      ]),
    },
    {
      type: "select",
      key: TRANSLATE_KEYS.selectionService,
      label: "划词翻译服务",
      options: Object.freeze([
        { value: "follow", label: "跟随[翻译服务]" },
        { value: "client.edge", label: "微软免费翻译" },
        { value: "steam-buff.ai", label: "Steam Buff AI" },
        { value: "translate.service", label: "开源公共免费翻译" },
      ]),
    },
    {
      type: "checkbox",
      key: TRANSLATE_KEYS.newsPopup,
      label: "Steam 新闻弹窗翻译",
    },
    {
      type: "select",
      key: TRANSLATE_KEYS.newsPopupService,
      label: "新闻弹窗翻译服务",
      options: Object.freeze([
        { value: "follow", label: "跟随[翻译服务]" },
        { value: "client.edge", label: "微软免费翻译" },
        { value: "steam-buff.ai", label: "Steam Buff AI" },
        { value: "translate.service", label: "开源公共免费翻译" },
      ]),
    },
    {
      type: "select",
      key: TRANSLATE_KEYS.local,
      label: "本地语言",
      options: LANGUAGES,
    },
    {
      type: "select",
      key: TRANSLATE_KEYS.to,
      label: "目标语言",
      options: LANGUAGES,
    },
    {
      type: "select",
      key: TRANSLATE_KEYS.service,
      label: "翻译服务",
      options: Object.freeze([
        { value: "client.edge", label: "微软免费翻译[推荐]" },
        { value: "steam-buff.ai", label: "Steam Buff AI" },
        { value: "translate.service", label: "开源公共免费翻译" },
      ]),
    },
    {
      type: "checkbox",
      key: TRANSLATE_KEYS.aiPerformance,
      label: "AI 翻译性能优化",
      aiOnly: true,
    },
    {
      type: "checkbox",
      key: TRANSLATE_KEYS.force,
      label: "强制翻译",
    },
    {
      type: "checkbox",
      key: TRANSLATE_KEYS.select,
      label: "显示原生语言选择框",
      aiHidden: true,
    },
    {
      type: "select",
      key: TRANSLATE_KEYS.style,
      label: "翻译显示样式",
      options: Object.freeze([
        { value: "none", label: "无" },
        { value: "blockquote", label: "引用" },
        { value: "weakened", label: "弱化" },
        { value: "dashedLine", label: "虚线" },
        { value: "wavyLine", label: "波浪线" },
        { value: "border", label: "边框" },
        { value: "background", label: "背景" },
      ]),
    },
    {
      type: "checkbox",
      key: TRANSLATE_KEYS.hover,
      label: "悬停显示原文",
    },
  ]);

  const REVIEW_FILTER_KEYS = Object.freeze({
    rules: "rules",
    maxPlaytimeHours: "maxPlaytimeHours",
    maxReviewPlaytimeHours: "maxReviewPlaytimeHours",
    hideHiddenProfile: "hideHiddenProfile",
    minReviewCount: "minReviewCount",
    minGamesOwned: "minGamesOwned",
  });

  const REVIEW_FILTER_DEFAULTS = Object.freeze({
    [REVIEW_FILTER_KEYS.rules]: Object.freeze([]),
    [REVIEW_FILTER_KEYS.maxPlaytimeHours]: 0,
    [REVIEW_FILTER_KEYS.maxReviewPlaytimeHours]: 0,
    [REVIEW_FILTER_KEYS.hideHiddenProfile]: false,
    [REVIEW_FILTER_KEYS.minReviewCount]: 0,
    [REVIEW_FILTER_KEYS.minGamesOwned]: 0,
  });

  const REVIEW_FILTER_FIELDS = Object.freeze([
    {
      type: "number",
      key: REVIEW_FILTER_KEYS.maxPlaytimeHours,
      label: "隐藏总游戏时间少于",
      min: 0,
      step: 1,
    },
    {
      type: "number",
      key: REVIEW_FILTER_KEYS.maxReviewPlaytimeHours,
      label: "隐藏评测时游戏时间少于",
      min: 0,
      step: 1,
    },
    {
      type: "checkbox",
      key: REVIEW_FILTER_KEYS.hideHiddenProfile,
      label: "隐藏资料不可见的评测",
    },
    {
      type: "number",
      key: REVIEW_FILTER_KEYS.minReviewCount,
      label: "隐藏评测篇数少于",
      min: 0,
      step: 1,
    },
    {
      type: "number",
      key: REVIEW_FILTER_KEYS.minGamesOwned,
      label: "隐藏拥有游戏少于",
      min: 0,
      step: 1,
    },
  ]);

  const SEARCH_SUGGESTION_DEFAULTS = Object.freeze({
    limit: 5,
    nativeMode: "default",
  });

  const SEARCH_SUGGESTION_FIELDS = Object.freeze([
    {
      type: "number",
      key: "limit",
      label: "Steam Buff 联想条数",
      min: "1",
      max: "10",
      step: "1",
    },
    {
      type: "select",
      key: "nativeMode",
      label: "Steam 官方搜索结果",
      options: Object.freeze([
        { value: "default", label: "保持原样" },
        { value: "one", label: "只显示 1 条" },
        { value: "hide", label: "隐藏官方结果" },
      ]),
    },
  ]);

  const FAMILY_LIBRARY_DEFAULTS = Object.freeze({
    refreshInterval: "1d",
    autoRefresh: true,
  });

  const FAMILY_LIBRARY_FIELDS = Object.freeze([
    {
      type: "select",
      key: "refreshInterval",
      label: "更新时间",
      options: Object.freeze([
        { value: "1d", label: "1天" },
        { value: "3d", label: "3天" },
        { value: "7d", label: "7天" },
        { value: "30d", label: "30天" },
        { value: "manual", label: "手动" },
      ]),
    },
    {
      type: "switch",
      key: "autoRefresh",
      label: "自动更新",
    },
  ]);

  const THIRD_PARTY_SERVICES_DEFAULTS = Object.freeze({
    enabled: false,
    defaultProvider: "isthereanydeal",
    isthereanydeal: Object.freeze({
      key: "",
      country: "CN",
      shops: Object.freeze([61]),
    }),
    routes: Object.freeze({
      prices: "isthereanydeal",
      history: "isthereanydeal",
      discountForecast: "isthereanydeal",
    }),
  });

  const THIRD_PARTY_SERVICES_FIELDS = Object.freeze([
    {
      type: "checkbox",
      key: "enabled",
      label: "启用第三方数据服务",
    },
    {
      type: "select",
      key: "defaultProvider",
      label: "默认价格数据源",
      options: Object.freeze([
        { value: "isthereanydeal", label: "IsThereAnyDeal" },
      ]),
    },
    {
      type: "password",
      key: "isthereanydeal.key",
      label: "ITAD API Key",
      placeholder: "输入自己的 IsThereAnyDeal API Key",
    },
  ]);

  const STORE_PRICE_CHART_DEFAULTS = Object.freeze({
    additionalSteamRegions: Object.freeze([]),
    lowCriterion: "api",
    lowReferenceScope: "currentRegular",
    lowOccurrence: "latest",
    lineColors: Object.freeze({}),
  });

  const categories = Object.freeze([
    {
      id: "extension-settings",
      name: "扩展设置",
      desc: "设置中心显示效果和基础偏好。",
      items: Object.freeze([
        {
          id: "settings-startup-animation",
          name: "设置中心启动动画",
          desc: "开启后，设置中心首次打开时播放 Logo 启动动画",
          area: "settings",
          enabled: true,
        },
      ]),
    },
    {
      id: "store-enhancements",
      name: "商店增强",
      desc: "Steam 商店详情、愿望单、购物车、搜索和数据展示增强。",
      items: Object.freeze([
        {
          id: "store-detail-reminders",
          name: "商店详情的提醒与检查",
          desc: "统一控制商店详情页的可用性、语言和第三方组件检查。",
          help: "商店详情的提醒与检查",
          area: "store",
          enabled: true,
          children: Object.freeze([
            {
              id: "store-detail-reminders-unsupported-only",
              name: "仅显示不支持的提醒",
              desc: "配音和创意工坊检查仅在不支持时显示",
              area: "store",
              enabled: false,
              deps: depAll(["store-detail-reminders"]),
            },
            {
              id: "audio-check",
              name: "配音检查",
              desc: "显示游戏支持的配音语言",
              area: "store",
              enabled: true,
              deps: depAll(["store-detail-reminders"]),
            },
            {
              id: "workshop-check",
              name: "创意工坊检查",
              desc: "检测游戏是否支持 Steam 创意工坊",
              sourceTip: SOURCE_TIPS.workshop,
              area: "store",
              enabled: true,
              deps: depAll(["store-detail-reminders"]),
            },
            {
              id: "family-sharing",
              name: "家庭共享检查",
              desc: "检测游戏是否支持家庭共享",
              sourceTip: SOURCE_TIPS.familySharing,
              area: "store",
              enabled: true,
              deps: depAll(["store-detail-reminders"]),
            },
            {
              id: "third-party-check",
              name: "第三方检查",
              desc: "检测第三方 DRM、账号和启动器要求",
              area: "store",
              enabled: true,
              deps: depAll(["store-detail-reminders"]),
            },
          ]),
        },
        {
          id: "subscription-info",
          name: "第三方会员检查",
          desc: "统一控制订阅服务提醒卡片和各页面角标。",
          help: "第三方会员检查",
          sourceTip: SOURCE_TIPS.subscriptionInfo,
          area: "store",
          enabled: true,
          children: Object.freeze([
            {
              id: "subscription-detail-card",
              name: "游戏商店详情提醒卡片",
              desc: "在游戏商店详情页显示订阅服务收录提醒。",
              area: "store",
              enabled: true,
              deps: depAll(["subscription-info"]),
            },
            {
              id: "subscription-store-badge",
              name: "商店角标",
              desc: "在商店首页和活动列表商品封面显示订阅服务角标。",
              area: "store",
              enabled: true,
              deps: depAll(["subscription-info"]),
            },
            {
              id: "subscription-wishlist-badge",
              name: "愿望单角标",
              desc: "在愿望单商品封面显示订阅服务角标。",
              area: "store",
              enabled: true,
              deps: depAll(["subscription-info"]),
            },
            {
              id: "subscription-cart-badge",
              name: "购物车角标",
              desc: "在购物车对应游戏封面左上角显示订阅服务角标。",
              area: "store",
              enabled: true,
              deps: depAll(["subscription-info"]),
            },
          ]),
        },
        {
          id: "family-library-owned-marker",
          name: "家庭组已有游戏标记",
          desc: "统一控制 Steam 家庭组已有游戏的商店角标和详情页提醒卡片。",
          help: "家庭组已有游戏标记",
          area: "store",
          enabled: true,
          panel: "family-library",
          panelPosition: "before",
          children: Object.freeze([
            {
              id: "family-library-exclude-self",
              name: "不统计我的游戏",
              desc: "开启后，家庭组角标和详情提醒卡片不统计当前 Steam 账号。",
              area: "store",
              enabled: false,
              deps: depAll(["family-library-owned-marker"]),
            },
            {
              id: "family-library-detail-card",
              name: "游戏商店详情提醒卡片",
              desc: "在游戏商店详情页显示家庭组已有提示，并提供手动刷新家庭库入口。",
              area: "store",
              enabled: true,
              deps: depAll(["family-library-owned-marker"]),
            },
            {
              id: "family-library-store-badge",
              name: "商店角标",
              desc: "在商店首页和活动列表商品封面显示家庭组拥有成员数量角标。",
              area: "store",
              enabled: true,
              deps: depAll(["family-library-owned-marker"]),
            },
            {
              id: "family-library-wishlist-badge",
              name: "愿望单角标",
              desc: "在愿望单商品封面显示家庭组拥有成员数量角标。",
              area: "store",
              enabled: true,
              deps: depAll(["family-library-owned-marker"]),
            },
            {
              id: "family-library-cart-badge",
              name: "购物车角标",
              desc: "在购物车对应游戏封面左上角显示家庭组拥有成员数量角标。",
              area: "store",
              enabled: true,
              deps: depAll(["family-library-owned-marker"]),
            },
          ]),
        },
        {
          id: "price-related-enhancements",
          name: "价格相关增强",
          desc: "统一控制商店价格历史、趋势预测和 SteamPY 价格展示。",
          help: "价格相关增强",
          area: "store",
          enabled: true,
          children: Object.freeze([
            {
              id: "price-history",
              name: "历史价格",
              desc: "显示商店详情页购买区历史价格和最近 12 个月价格图表",
              sourceTip: SOURCE_TIPS.priceHistory,
              area: "store",
              enabled: true,
              panel: "store-price-chart",
              deps: depAll(["price-related-enhancements"]),
            },
            {
              id: "price-forecast",
              name: "价格预测",
              desc: "基于历史价格数据预测价格走势",
              area: "store",
              enabled: true,
              deps: depAll(["price-related-enhancements", "price-history"]),
              children: Object.freeze([
                {
                  id: "price-forecast-discount",
                  name: "未来折扣推测",
                  desc: "显示下一次常规折扣时间、折扣力度、预计价格和史低参考，并在有历史证据时结合四季特卖时间修正。",
                  area: "store",
                  enabled: true,
                  deps: depAll(["price-forecast"]),
                },
                {
                  id: "price-forecast-seasonal",
                  name: "节日折扣推测",
                  desc: "根据历史节日窗口和价格记录，推荐未来更可能打折的 Steam 活动。",
                  area: "store",
                  enabled: true,
                  deps: depAll(["price-forecast"]),
                },
              ]),
            },
            {
              id: "steampy-cdk-price",
              name: "Steam PY CDK",
              desc: "显示 SteamPY CDK 商城价",
              sourceTip: SOURCE_TIPS.steampyCdk,
              area: "store",
              enabled: true,
              deps: depAll(["price-related-enhancements"]),
            },
            {
              id: "steampy-proxy-price",
              name: "Steam PY 代购",
              desc: "显示 SteamPY 代购商城价",
              sourceTip: SOURCE_TIPS.steampyProxy,
              area: "store",
              enabled: true,
              deps: depAll(["price-related-enhancements"]),
            },
          ]),
        },
        {
          id: "wishlist-price-history",
          name: "愿望单悬浮卡片",
          desc: "在 Steam 愿望单悬停游戏时显示价格悬浮卡片，包含 Steam 当前价、历史最低价和 SteamPY 价格。",
          help: "愿望单悬浮卡片",
          sourceTip: SOURCE_TIPS.wishlistPriceHistory,
          area: "store",
          enabled: true,
          children: Object.freeze([
            {
              id: "wishlist-price-history-hover-through",
              name: "悬浮卡片鼠标穿透",
              desc: "开启后，愿望单历史价格悬浮卡片不响应鼠标点击和悬停，鼠标可直接落到背后的游戏卡片。",
              area: "store",
              enabled: false,
              deps: depAll(["wishlist-price-history"]),
            },
          ]),
        },
        {
          id: "data-display-enhancements",
          name: "数据展示",
          desc: "统一控制评价、在线人数、销量排名、时长和媒体评分展示。",
          help: "数据展示",
          area: "store",
          enabled: true,
          children: Object.freeze([
            {
              id: "reviews",
              name: "好评数据",
              desc: "显示详细的评价统计",
              area: "store",
              enabled: true,
              disabled: true,
              badge: "待开发",
              lock: "旧 API 数据源已下线，等待对接新 API",
              deps: depAll(["data-display-enhancements"]),
            },
            {
              id: "player-stats",
              name: "当前在线",
              desc: "显示当前在线玩家数",
              area: "store",
              enabled: true,
              deps: depAll(["data-display-enhancements"]),
            },
            {
              id: "game-sales-rank",
              name: "游戏销量排名",
              desc: "显示销量排名和排名趋势",
              area: "store",
              enabled: true,
              disabled: true,
              badge: "待开发",
              lock: "旧 API 数据源已下线，等待对接新 API",
              deps: depAll(["data-display-enhancements"]),
            },
            {
              id: "howlongtobeat",
              name: "时长统计",
              desc: "显示平均游戏时长",
              area: "store",
              enabled: true,
              disabled: true,
              badge: "待开发",
              lock: "旧 API 数据源已下线，等待对接新 API",
              deps: depAll(["data-display-enhancements"]),
            },
            {
              id: "media-score",
              name: "媒体平台评分",
              desc: "汇总各大媒体评分",
              area: "store",
              enabled: true,
              disabled: true,
              badge: "待开发",
              lock: "旧 API 数据源已下线，等待对接新 API",
              deps: depAll(["data-display-enhancements"]),
            },
          ]),
        },
        {
          id: "search-suggestions",
          name: "搜索联想词",
          desc: "控制 Steam 商店搜索联想词、中文名称匹配和结果展示增强。",
          help: "搜索联想词",
          area: "store",
          enabled: true,
          member: true,
          memberFeature: "searchSuggestions",
          badge: "赞助者",
          lock: "赞助者可用，开通后会按当前保存状态恢复",
          panel: "search-suggestion",
          children: Object.freeze([
            {
              id: "search-suggestions-user-custom",
              name: "玩家自定义名称",
              desc: "优先匹配当前账号保存的私有自定义名称",
              area: "store",
              enabled: true,
              deps: depAll(["search-suggestions"]),
            },
            {
              id: "search-suggestions-user-alias",
              name: "我的别名",
              desc: "匹配当前账号保存的私有游戏别名",
              area: "store",
              enabled: true,
              deps: depAll(["search-suggestions"]),
            },
            {
              id: "search-suggestions-community",
              name: "公共自定义名称",
              desc: "匹配已达标的社区公共自定义名称",
              area: "store",
              enabled: true,
              deps: depAll(["search-suggestions"]),
            },
            {
              id: "search-suggestions-community-alias",
              name: "社区别名",
              desc: "匹配已达标的社区公共游戏别名",
              area: "store",
              enabled: true,
              deps: depAll(["search-suggestions"]),
            },
            {
              id: "search-suggestions-ai",
              name: "AI 翻译名称",
              desc: "匹配当前启用的 AI 主翻译名称",
              area: "store",
              enabled: true,
              deps: depAll(["search-suggestions"]),
            },
            {
              id: "search-suggestions-pinyin",
              name: "拼音搜索",
              desc: "允许使用完整拼音匹配中文名称，例如 xiadaoliecheshou",
              area: "store",
              enabled: true,
              deps: depAll(["search-suggestions"]),
            },
            {
              id: "search-suggestions-mnemonic",
              name: "助记符搜索",
              desc: "允许使用中文首字母助记符匹配中文名称，例如 xdlcs",
              area: "store",
              enabled: true,
              deps: depAll(["search-suggestions"]),
            },
          ]),
        },
        {
          id: "store-title-custom-name",
          name: "游戏商店标题中文名",
          desc: "在 Steam 商店游戏标题旁显示 Steam Buff 中文名，并支持提交自己的中文名。",
          help: "游戏商店标题中文名",
          area: "store",
          enabled: true,
          children: Object.freeze([
            {
              id: "game-notes",
              name: "游戏备注",
              desc: "在商店详情页和愿望单显示并编辑当前账号的私有游戏备注。",
              area: "store",
              enabled: true,
              deps: depAll(["store-title-custom-name"]),
            },
          ]),
        },
        {
          id: "dlc-tools",
          name: "DLC购买增强",
          desc: "批量选择、加入购物车和领取免费 DLC",
          help: "DLC购买增强",
          area: "store",
          enabled: true,
        },
        {
          id: "cart-select",
          name: "购物车增强",
          desc: "在购物车中选择本次支付项目，并可恢复未支付项目。",
          help: "购物车增强",
          area: "store",
          enabled: true,
          children: Object.freeze([
            {
              id: "cart-remove-all-confirm",
              name: "购物车[移除所有项目] 增加二次确认",
              desc: "点击购物车的移除所有项目时先弹出确认框，确认后才继续执行 Steam 原操作。",
              area: "store",
              enabled: true,
              deps: depAll(["cart-select"]),
            },
          ]),
        },
      ]),
    },
    {
      id: "community-enhancements",
      name: "社区增强",
      desc: "预留给 Steam 社区的一方增强功能。",
      kind: "empty",
      emptyTitle: "暂无独立社区增强功能",
      emptyDesc: "后续一方社区功能会放在这里。",
      items: Object.freeze([]),
    },
    {
      id: "review-filter",
      name: "评论过滤",
      desc: "按关键词、正则、游戏时间和用户资料过滤 Steam 商店评测。",
      help: "评论过滤",
      kind: "review-filter",
      items: Object.freeze([
        {
          id: "review-filter",
          name: "评论过滤",
          desc: "控制评论过滤设置分类和 Steam 商店评测过滤。",
          area: "store",
          enabled: true,
        },
      ]),
    },
    {
      id: "client",
      name: "客户端增强",
      desc: "Steam 客户端库和下载页增强，此页面功能开启或关闭需要重启steam客户端。",
      items: Object.freeze([
        {
          id: "library-sort-title",
          name: "库列表显示自定义名称",
          desc: "库列表优先显示自定义排序名称，并在 Steam 自定义页提供名称管理工具",
          help: "库列表显示自定义名称",
          area: "steam",
          enabled: true,
          children: Object.freeze([
            {
              id: "library-sort-title-original-search",
              name: "优化 Steam 原名搜索",
              desc: "存在自定义排序名称时，将 Steam 原名加入运行时搜索字段",
              area: "steam",
              enabled: false,
              deps: depAll(["library-sort-title"]),
            },
            {
              id: "library-sort-title-stable-mode",
              name: "名称显示模式",
              desc: "流畅模式只处理当前可见项目；稳定模式使用 AppOverview 替换刷新方法，库中游戏数量过多时可能会卡顿",
              area: "steam",
              control: "mode",
              enabled: true,
              options: Object.freeze([
                { value: false, label: "流畅模式" },
                { value: true, label: "稳定模式" },
              ]),
              deps: depAll(["library-sort-title"]),
            },
            {
              id: "library-sort-title-hover-custom-name",
              name: "悬停提示显示自定义名称",
              desc: "开启后，鼠标悬停库列表项目时的 Steam 原生提示框显示自定义名称和分组标签；关闭时恢复 Steam 原始名称",
              area: "steam",
              enabled: false,
              deps: depAll(["library-sort-title"]),
            },
          ]),
        },
        {
          id: "library-group-labels",
          name: "分组显示在名称后面",
          desc: "在 Steam 库列表中隐藏收藏分组名称末尾的 []，并在库项目名称后追加所属分组标签",
          help: "分组显示在名称后面",
          area: "steam",
          enabled: true,
          children: Object.freeze([
            {
              id: "library-group-labels-grouped-mode",
              name: "按收藏分组时也显示",
              desc: "开启 Steam 原生“按收藏分组”后，库项目名称仍继续追加所有分组标签",
              area: "steam",
              enabled: false,
              deps: depAll(["library-group-labels"]),
            },
            {
              id: "library-group-labels-hide-collection-tags",
              name: "隐藏分组名称中的 []",
              desc: "在 Steam 库列表可见的收藏分组名称中隐藏末尾连续的 [] 标签；不修改 Steam 原始分组数据",
              area: "steam",
              enabled: true,
              deps: depAll(["library-group-labels"]),
            },
          ]),
        },
        {
          id: "download-batch-actions",
          name: "下载队列批量操作",
          desc: "在下载管理页提供全部开始、全部暂停和全部移除操作",
          help: "下载队列批量操作",
          area: "steam",
          enabled: true,
        },
        {
          id: "download-auto-shutdown",
          name: "下载完成自动关机",
          desc: "下载队列完成后延迟1分钟执行关机动作",
          help: "下载完成自动关机",
          area: "steam",
          enabled: true,
        },
        {
          id: "steam-news-translate",
          name: "Steam 新闻弹窗翻译",
          desc: "在 Steam 客户端库首页新闻弹窗中手动翻译当前新闻",
          help: "Steam 新闻弹窗翻译",
          area: "steam",
          enabled: true,
          deps: depAll(["translate"]),
        },
      ]),
    },
    {
      id: "translate",
      name: "翻译相关",
      desc: "网页翻译设置，基于translate.js实现。",
      kind: "translate",
      items: Object.freeze([
        {
          id: "translate",
          name: "翻译模块",
          desc: "控制翻译设置分类和网页翻译运行时。",
          help: "翻译模块",
          sourceTip: SOURCE_TIPS.translate,
          area: "web",
          enabled: false,
        },
      ]),
    },
    {
      id: "ai",
      name: "AI服务",
      desc: "大模型网关、模型和密钥配置。",
      help: "AI服务",
      kind: "ai",
      items: Object.freeze([
        {
          id: "ai",
          name: "AI模块",
          desc: "控制 AI 设置分类和 AI 服务配置是否启用。",
          area: "settings",
          enabled: false,
        },
      ]),
    },
    {
      id: "third-party-services",
      name: "第三方服务",
      desc: "管理外部数据服务密钥和连接测试。",
      help: "第三方服务",
      kind: "third-party-services",
      items: Object.freeze([
        {
          id: "third-party-services",
          name: "第三方服务配置",
          desc: "控制第三方数据服务是否启用，以及 IsThereAnyDeal API Key。",
          sourceTip: SOURCE_TIPS.isthereanydeal,
          area: "settings",
          enabled: false,
        },
      ]),
    },
    {
      id: "third-party",
      name: "第三方相关",
      desc: "第三方集成、开源脚本和外部服务增强。",
      help: "第三方相关",
      items: Object.freeze([
        {
          id: "purchase-history-classifier",
          name: "消费历史分类器",
          desc: "在 Steam 消费历史页按直购、送礼、退款、内购、充值、买入和卖出分类统计。",
          help: "消费历史分类器",
          sourceTip: SOURCE_TIPS.purchaseHistoryClassifier,
          area: "store",
          enabled: true,
        },
      ]),
    },
  ]);

  function withI18n(item, prefix) {
    if (!item || !item.id) {
      return item;
    }
    const out = {
      ...item,
      nameKey: item.nameKey || `${prefix}.${item.id}.name`,
      descKey: item.descKey || `${prefix}.${item.id}.desc`,
    };
    if (item.badge && !item.badgeKey) {
      out.badgeKey = `${prefix}.${item.id}.badge`;
    }
    if (item.lock && !item.lockKey) {
      out.lockKey = `${prefix}.${item.id}.lock`;
    }
    if (item.sourceTip && !item.sourceTipKey) {
      out.sourceTipKey = `${prefix}.${item.id}.sourceTip`;
    }
    if (Array.isArray(item.options)) {
      out.options = Object.freeze(item.options.map(option => Object.freeze({
        ...option,
        labelKey: option.labelKey || `${prefix}.${item.id}.option.${String(option.value).replace(/[^A-Za-z0-9_]/g, "_")}`,
      })));
    }
    if (item.emptyTitle && !item.emptyTitleKey) {
      out.emptyTitleKey = `${prefix}.${item.id}.emptyTitle`;
    }
    if (item.emptyDesc && !item.emptyDescKey) {
      out.emptyDescKey = `${prefix}.${item.id}.emptyDesc`;
    }
    if (Array.isArray(item.children)) {
      out.children = Object.freeze(item.children.map(child => withI18n(child, prefix)));
    }
    return out;
  }

  function localizeCatalog(cat) {
    return Object.freeze({
      ...withI18n(cat, "settings.category"),
      items: Object.freeze((cat.items || []).map(item => withI18n(item, "settings.feature"))),
    });
  }

  const localizedCategories = Object.freeze(categories.map(localizeCatalog));

  function flattenItems(items = []) {
    const out = [];
    for (const item of items || []) {
      if (!item) {
        continue;
      }
      out.push(item);
      if (Array.isArray(item.children) && item.children.length) {
        out.push(...flattenItems(item.children));
      }
    }
    return out;
  }

  function list() {
    return localizedCategories;
  }

  function featureItems() {
    return localizedCategories.flatMap(cat => flattenItems(cat.items));
  }

  function withFieldI18n(field, group) {
    if (!field || !field.key) {
      return field;
    }
    const prefix = `settings.field.${group}.${field.key}`;
    return Object.freeze({
      ...field,
      labelKey: field.labelKey || `${prefix}.label`,
      placeholderKey: field.placeholder && /[\u3400-\u9fff]/.test(String(field.placeholder))
        ? field.placeholderKey || `${prefix}.placeholder`
        : field.placeholderKey,
      options: Array.isArray(field.options)
        ? Object.freeze(field.options.map(option => Object.freeze({
          ...option,
          labelKey: option.labelKey || `${prefix}.option.${String(option.value).replace(/[^A-Za-z0-9_]/g, "_")}`,
        })))
        : field.options,
    });
  }

  function localizedFields(fields, group) {
    return Object.freeze((fields || []).map(field => withFieldI18n(field, group)));
  }

  function featureById(id) {
    return featureItems().find((item) => item.id === id) || null;
  }

  function featureIds(area) {
    return featureItems()
      .filter((item) => item.area === area)
      .map((item) => item.id);
  }

  function depAll(ids) {
    return Object.freeze({
      mode: "all",
      ids: Object.freeze(Array.from(ids || [])),
    });
  }

  function depAny(ids) {
    return Object.freeze({
      mode: "any",
      ids: Object.freeze(Array.from(ids || [])),
    });
  }

  function dependency(item) {
    const dep = item?.deps;
    if (!dep || !Array.isArray(dep.ids) || !dep.ids.length) {
      return depAll([]);
    }
    return dep.mode === "any" ? depAny(dep.ids) : depAll(dep.ids);
  }

  function dependentsOf(id) {
    return featureItems()
      .filter((item) => dependency(item).ids.includes(id))
      .map((item) => item.id);
  }

  function defaults() {
    const out = {};
    for (const item of featureItems()) {
      out[item.id] = item.disabled === true ? false : item.enabled !== false;
    }
    return out;
  }

  function translateDefaults() {
    return { ...TRANSLATE_DEFAULTS };
  }

  function translateFields() {
    return localizedFields(TRANSLATE_FIELDS, "translate");
  }

  function reviewFilterDefaults() {
    return { ...REVIEW_FILTER_DEFAULTS };
  }

  function reviewFilterFields() {
    return localizedFields(REVIEW_FILTER_FIELDS, "reviewFilter");
  }

  function searchSuggestionDefaults() {
    return { ...SEARCH_SUGGESTION_DEFAULTS };
  }

  function searchSuggestionFields() {
    return localizedFields(SEARCH_SUGGESTION_FIELDS, "searchSuggestions");
  }

  function familyLibraryDefaults() {
    return { ...FAMILY_LIBRARY_DEFAULTS };
  }

  function familyLibraryFields() {
    return localizedFields(FAMILY_LIBRARY_FIELDS, "familyLibrary");
  }

  function aiDefaults() {
    return globalThis.STAI?.defaults?.() || {};
  }

  function aiFields() {
    return localizedFields(globalThis.STAI?.fields?.() || [], "ai");
  }

  function thirdPartyServicesDefaults() {
    return {
      ...THIRD_PARTY_SERVICES_DEFAULTS,
      isthereanydeal: { ...THIRD_PARTY_SERVICES_DEFAULTS.isthereanydeal },
      routes: { ...THIRD_PARTY_SERVICES_DEFAULTS.routes },
    };
  }

  function thirdPartyServicesFields() {
    return localizedFields(THIRD_PARTY_SERVICES_FIELDS, "thirdPartyServices");
  }

  function storePriceChartDefaults() {
    return {
      additionalSteamRegions: [...STORE_PRICE_CHART_DEFAULTS.additionalSteamRegions],
      lowCriterion: STORE_PRICE_CHART_DEFAULTS.lowCriterion,
      lowReferenceScope: STORE_PRICE_CHART_DEFAULTS.lowReferenceScope,
      lowOccurrence: STORE_PRICE_CHART_DEFAULTS.lowOccurrence,
      lineColors: { ...STORE_PRICE_CHART_DEFAULTS.lineColors },
    };
  }

  api.catalog = Object.freeze({
    UI_LOCALE_KEY,
    list,
    featureItems,
    featureById,
    featureIds,
    dependency,
    dependentsOf,
    defaults,
    translateDefaults,
    translateFields,
    reviewFilterDefaults,
    reviewFilterFields,
    searchSuggestionDefaults,
    searchSuggestionFields,
    familyLibraryDefaults,
    familyLibraryFields,
    aiDefaults,
    aiFields,
    thirdPartyServicesDefaults,
    thirdPartyServicesFields,
    storePriceChartDefaults,
  });
})();
