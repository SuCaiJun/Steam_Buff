/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 独立云端自定义名称后台列表
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const ID = "library-independent-name";
  const CH = "__steam_library_independent_name_Ricky";
  const RT = "__SteamBuffLibraryIndependentNameBackend";
  const PATCHES = "__RickyStIndependentNameSearchPatches";
  const MATCHES_FLAG = "__RickyStIndependentNameSearchMatchesPatched";
  const SCORED_FLAG = "__RickyStIndependentNameSearchScoredPatched";
  const SET_SEARCH_FLAG = "__RickyStIndependentNameSearchSetterPatched";
  const SEARCH_ATTRIBUTE = "data-steam-buff-user-name-search";
  const ORIGINAL_NAME = "__RickyStOriginalName";
  const PAGE_MAX = 1000;
  // 单页最多 1000 条，让出间隔必须更小，否则这一页循环走不到让出
  const SCAN_YIELD = 200;

  const MODE_CATEGORIES = Object.freeze({
    single: [2],
    multiplayer: [1, 36, 37, 27, 20, 24],
    coop: [9, 38, 39],
    local_multiplayer: [39, 37, 24],
  });
  const FEATURE_CATEGORIES = Object.freeze({
    trading_cards: 29,
    workshop: 30,
    achievements: 22,
    steam_cloud: 23,
    remote_play: 44,
    family_sharing: 62,
  });
  const GENRE_TAGS = Object.freeze({
    action: 19,
    adventure: 21,
    casual: 597,
    indie: 492,
    massively_multiplayer: 128,
    racing: 699,
    rpg: 122,
    simulation: 599,
    sports: 701,
    strategy: 9,
  });
  const ACCESSIBILITY_CATEGORIES = Object.freeze({
    adjustable_difficulty: 78,
    save_anytime: 79,
    adjustable_text: 64,
    subtitles: 65,
    color_alternatives: 66,
    contrast: 82,
    camera_comfort: 67,
    playable_without_vision: 81,
    custom_volume: 68,
    stereo: 69,
    surround: 70,
    narrated_menus: 71,
    keyboard_only: 75,
    mouse_only: 76,
    touch_only: 77,
    without_quick_time: 74,
    own_pace: 80,
    speech_to_text: 72,
    text_to_speech: 73,
  });
  // CAppOverview.bitfield_supported_languages 使用 ELanguage 的数值作为位索引。
  // 该映射与 Steam 原生库语言筛选使用的是同一枚举；`sc_schinese` 与 `schinese`
  // 保持为独立内部值，后续由 UI 合并为一个展示选项。
  const SUPPORTED_LANGUAGE_BITS = Object.freeze({
    english: 1n << 0n,
    german: 1n << 1n,
    french: 1n << 2n,
    italian: 1n << 3n,
    koreana: 1n << 4n,
    spanish: 1n << 5n,
    schinese: 1n << 6n,
    tchinese: 1n << 7n,
    russian: 1n << 8n,
    thai: 1n << 9n,
    japanese: 1n << 10n,
    portuguese: 1n << 11n,
    polish: 1n << 12n,
    danish: 1n << 13n,
    dutch: 1n << 14n,
    finnish: 1n << 15n,
    norwegian: 1n << 16n,
    swedish: 1n << 17n,
    hungarian: 1n << 18n,
    czech: 1n << 19n,
    romanian: 1n << 20n,
    turkish: 1n << 21n,
    brazilian: 1n << 22n,
    bulgarian: 1n << 23n,
    greek: 1n << 24n,
    ukrainian: 1n << 25n,
    vietnamese: 1n << 26n,
    latam: 1n << 27n,
    sc_schinese: 1n << 29n,
    indonesian: 1n << 30n,
    malay: 1n << 31n,
  });
  const LANGUAGE_LABELS = Object.freeze({
    sc_schinese: "简体中文",
    schinese: "简体中文",
    tchinese: "繁体中文",
    english: "英文",
    koreana: "韩语",
    japanese: "日语",
    german: "德语",
    french: "法语",
    italian: "意大利语",
    spanish: "西班牙语",
    latam: "拉丁美洲西班牙语",
    russian: "俄语",
    portuguese: "葡萄牙语",
    brazilian: "巴西葡萄牙语",
    polish: "波兰语",
    dutch: "荷兰语",
    danish: "丹麦语",
    finnish: "芬兰语",
    norwegian: "挪威语",
    swedish: "瑞典语",
    hungarian: "匈牙利语",
    czech: "捷克语",
    romanian: "罗马尼亚语",
    turkish: "土耳其语",
    greek: "希腊语",
    bulgarian: "保加利亚语",
    ukrainian: "乌克兰语",
    thai: "泰语",
    arabic: "阿拉伯语",
    vietnamese: "越南语",
    indonesian: "印尼语",
    malay: "马来语",
  });
  const ORIGINAL_LANGUAGE_LABELS = Object.freeze({
    zh_hans: "简体中文",
    zh_hant: "繁体中文",
    english: "英文",
    japanese: "日语",
    korean: "韩语",
    russian: "俄语",
    other: "其他",
  });
  const ORIGINAL_LANGUAGE_ORDER = Object.freeze([
    "zh_hans", "zh_hant", "english", "japanese", "korean", "russian", "other",
  ]);
  // 这里只使用能区分简体和繁体两种中文书写变体的字符。
  // 常见汉字本身信息不足；标题没有其他标记时，将其按简体中文处理。
  const HAN_SIMPLIFIED_MARKERS = new Set(Array.from(
    "简体国语网录门开关这个为与云发现电车书画号机风见里说过还来进长东对实学时会头让给们远结业该动观复广库归处备级线统严单亲质权务识术达资传参变许万伤价产规华却轻设计认论证调断义习讲试览题领欢别边际约组终继续医响觉气队阵险阶敌馆艺齐绝潜",
  ));
  const HAN_TRADITIONAL_MARKERS = new Set(Array.from(
    "簡體國語網錄門開關這個為與雲發現電車書畫號機風見裡說過還來進長東對實學時會頭讓給們遠結業該動觀復廣庫歸處備級線統嚴單親質權務識術達資傳參變許萬傷價產規華卻輕設計認論證調斷義習講試覽題領歡別邊際約組終繼續醫響覺氣隊陣險階敵館藝齊遊戲",
  ));

  const log = window.STLoggerFactory.createLogger("steam", ID);

  function text(value) {
    return String(value || "").trim();
  }

  function lower(value) {
    return text(value).toLocaleLowerCase();
  }

  function toSet(value) {
    if (value instanceof Set) return new Set(value);
    if (Array.isArray(value)) return new Set(value);
    if (value && typeof value[Symbol.iterator] === "function" && typeof value !== "string") {
      try { return new Set(value); } catch { return null; }
    }
    return null;
  }

  function stringSet(value) {
    const set = toSet(value);
    return set ? new Set(Array.from(set, item => text(item)).filter(Boolean)) : new Set();
  }

  function hasValue(set, value) {
    return !!set && (set.has(value) || set.has(String(value)) || set.has(Number(value)));
  }

  function numberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function originalName(app) {
    return text(app?.[ORIGINAL_NAME]) || text(app?.display_name);
  }

  function originalLanguages(value) {
    const raw = text(value);
    if (!raw) return [];
    const order = [];
    const add = (language) => {
      if (!order.includes(language)) order.push(language);
    };
    let hasHan = false;
    let hasSimplifiedHan = false;
    let hasTraditionalHan = false;
    let hasKana = false;
    let hasRussianCyrillic = false;
    let hasOtherCyrillic = false;
    let hasOtherLetter = false;
    for (const character of raw) {
      // 组合附加符号和修饰字母（例如日语的“ー”）本身不能用于判断语言。
      if (/\p{M}|\p{Lm}/u.test(character)) continue;
      if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(character)) {
        hasKana = true;
        add("japanese");
        continue;
      }
      if (/\p{Script=Hangul}/u.test(character)) {
        add("korean");
        continue;
      }
      if (/\p{Script=Han}/u.test(character)) {
        hasHan = true;
        add("han");
        if (HAN_SIMPLIFIED_MARKERS.has(character)) hasSimplifiedHan = true;
        if (HAN_TRADITIONAL_MARKERS.has(character)) hasTraditionalHan = true;
        continue;
      }
      if (/\p{Script=Cyrillic}/u.test(character)) {
        if (/[А-Яа-яЁё]/.test(character)) hasRussianCyrillic = true;
        else hasOtherCyrillic = true;
        continue;
      }
      if (/\p{Script=Latin}/u.test(character)) {
        add("english");
        continue;
      }
      if (/\p{L}/u.test(character)) hasOtherLetter = true;
    }
    if (hasKana) {
      // 与日语共用的汉字不应作为第二个中文语言信号。
      for (let index = order.indexOf("han"); index >= 0; index = order.indexOf("han")) order.splice(index, 1);
      for (let index = order.indexOf("japanese"); index >= 0; index = order.indexOf("japanese")) order.splice(index, 1);
      add("japanese");
    } else if (hasHan) {
      const languages = [];
      if (hasSimplifiedHan) languages.push("zh_hans");
      if (hasTraditionalHan) languages.push("zh_hant");
      if (!languages.length) languages.push("zh_hans");
      const index = order.indexOf("han");
      if (index >= 0) order.splice(index, 1, ...languages);
      else order.push(...languages);
    }
    if (hasRussianCyrillic) add("russian");
    if (hasOtherCyrillic || hasOtherLetter) add("other");
    return order.filter(language => ORIGINAL_LANGUAGE_ORDER.includes(language));
  }

  function categoriesOf(app) {
    return stringSet(app?.m_setStoreCategories);
  }

  function tagsOf(app) {
    return stringSet(app?.m_setStoreTags);
  }

  function hasCategory(categories, value) {
    return categories.has(String(value)) || categories.has(value);
  }

  function valuesForCategories(categories, mapping) {
    return Object.entries(mapping)
      .filter(([, ids]) => (Array.isArray(ids) ? ids : [ids]).some(id => hasCategory(categories, id)))
      .map(([key]) => key);
  }

  function callBoolean(app, name) {
    try {
      return typeof app?.[name] === "function" ? app[name]() === true : null;
    } catch {
      return null;
    }
  }

  function languageValues(app) {
    const raw = app?.bitfield_supported_languages;
    if (Array.isArray(raw)) return raw.map(text).filter(Boolean);
    if (typeof raw === "string" && /^\d+$/.test(raw)) {
      try {
        const bits = BigInt(raw);
        return Object.entries(SUPPORTED_LANGUAGE_BITS)
          .filter(([, mask]) => (bits & mask) !== 0n)
          .map(([key]) => key);
      } catch {
        return [];
      }
    }
    if (typeof raw === "bigint") {
      return Object.entries(SUPPORTED_LANGUAGE_BITS)
        .filter(([, mask]) => (raw & mask) !== 0n)
        .map(([key]) => key);
    }
    return [];
  }

  function collectionSnapshot(store) {
    const collections = [];
    const byApp = new Map();
    const source = Array.isArray(store?.userCollections) ? store.userCollections : [];
    for (const item of source) {
      const id = text(item?.m_strId);
      const label = text(item?.m_strName);
      const apps = toSet(item?.m_setApps);
      // Live Steam 集合对象中，favorite 是用户收藏夹；其余可筛选集合都带有
      // 动态、可删除或可编辑标记。type-music、uncategorized 等固定系统视图
      // 没有这些标记，不能混入“收藏分组”条件。
      const filterable = id === "favorite"
        || item?.bIsDynamic === true
        || item?.bIsDeletable === true
        || item?.bIsEditable === true;
      if (!id || !label || !apps || !filterable) continue;
      collections.push({ id, label });
      for (const appid of apps) {
        const key = String(Number(appid) || appid);
        if (!byApp.has(key)) byApp.set(key, new Set());
        byApp.get(key).add(id);
      }
    }
    return { collections, byApp };
  }

  function metadataContext() {
    const appStore = window.appStore || {};
    const collectionStore = window.collectionStore || {};
    const hidden = toSet(collectionStore.collectionsFromStorage?.get?.("hidden")?.apps);
    const privateApps = toSet(appStore.m_setPrivateApps);
    const collections = collectionSnapshot(collectionStore);
    const tagLabels = new Map();
    const localizations = appStore.m_mapStoreTagLocalization;
    if (localizations && typeof localizations === "object" && !Array.isArray(localizations)) {
      // Steam CEF 当前暴露普通对象；测试契约与旧运行态仍使用 Map。
      const entries = typeof localizations.entries === "function" ? localizations.entries() : Object.entries(localizations);
      for (const [id, label] of entries) {
        const value = text(label);
        if (value) tagLabels.set(String(id), value);
      }
    }
    return {
      hidden,
      privateApps,
      collections,
      tagLabels,
      ready: {
        hidden: hidden instanceof Set,
        privacy: privateApps instanceof Set,
        collections: Array.isArray(collectionStore.userCollections),
        tags: tagLabels.size > 0,
      },
    };
  }

  function sourceValues(app) {
    const values = [];
    let owned = false;
    let borrowed = false;
    try { owned = app?.BIsOwned?.() === true; } catch { owned = false; }
    try { borrowed = app?.BIsBorrowed?.() === true; } catch { borrowed = false; }
    if (owned && !borrowed) values.push("mine");
    const owner = Number(app?.owner_account_id) || 0;
    let family = false;
    try { family = owner > 0 && window.App?.BIsFamilyGroupMember?.(owner) === true; } catch { family = false; }
    if (family) values.push("family");
    return { values, ready: owner === 0 || typeof window.App?.BIsFamilyGroupMember === "function" };
  }

  function metadata(app, context) {
    const categories = categoriesOf(app);
    const tags = tagsOf(app);
    const categoriesReady = Object.prototype.hasOwnProperty.call(app || {}, "m_setStoreCategories");
    const tagsReady = Object.prototype.hasOwnProperty.call(app || {}, "m_setStoreTags");
    const languagesReady = Object.prototype.hasOwnProperty.call(app || {}, "bitfield_supported_languages");
    const source = sourceValues(app);
    const appid = Number(app?.appid) || 0;
    const privacy = [];
    if (hasValue(context.privateApps, appid)) privacy.push("private");
    if (hasValue(context.hidden, appid)) privacy.push("hidden");
    const status = [];
    const localInstalled = app?.local_per_client_data?.installed === true;
    const installed = app?.installed === true || localInstalled;
    if (localInstalled) status.push("installed");
    if (installed) status.push("ready");
    let lastPlayedRaw;
    try { lastPlayedRaw = typeof app?.GetLastTimePlayed === "function" ? app.GetLastTimePlayed() : app?.rt_last_time_played; } catch { lastPlayedRaw = null; }
    const lastPlayed = numberOrNull(lastPlayedRaw);
    if (lastPlayed) status.push("played");
    else if (app && Object.prototype.hasOwnProperty.call(app, "rt_last_time_played")) status.push("unplayed");
    const tagValues = Array.from(tags, value => String(value));
    const tagOptions = tagValues.map(value => ({ value, label: context.tagLabels.get(value) || "" })).filter(item => item.label);
    const collectionValues = Array.from(context.collections.byApp.get(String(appid)) || []);
    const dates = {
      added: numberOrNull(app?.rt_purchased_time),
      release: numberOrNull(app?.GetCanonicalReleaseDate?.()),
      last_played: lastPlayed,
    };
    const hardware = [];
    const controllerSupport = Number(app?.xbox_controller_support);
    if (controllerSupport === 2) hardware.push("controller_full");
    if (controllerSupport === 1 || controllerSupport === 2) hardware.push("controller_partial");
    if (app?.gamepad_preferred === true) hardware.push("controller_recommended");
    const supportsVr = callBoolean(app, "BSupportsVR");
    const nonVr = callBoolean(app, "BIsNonVRGame");
    if (supportsVr === true) hardware.push("vr");
    if (nonVr === true) hardware.push("non_vr");
    let deck = null;
    try {
      deck = Number(app?.steam_deck_compat_category);
    } catch {
      deck = null;
    }
    if (Number.isInteger(deck) && deck >= 0 && deck <= 3) hardware.push(`deck_${deck}`);
    const localMultiplayer = callBoolean(app, "BIsLocalMultiplayer");
    const modes = valuesForCategories(categories, MODE_CATEGORIES);
    if (localMultiplayer === true && !modes.includes("local_multiplayer")) modes.push("local_multiplayer");
    const accessibility = Object.entries(ACCESSIBILITY_CATEGORIES)
      .filter(([, id]) => hasCategory(categories, id)).map(([key]) => key);
    return {
      sources: source.values,
      source_ready: source.ready,
      original_language: originalLanguages(originalName(app)),
      collections: collectionValues,
      privacy,
      privacy_ready: context.ready.privacy && context.ready.hidden,
      modes,
      status,
      languages: languageValues(app),
      genres: Object.entries(GENRE_TAGS).filter(([, id]) => tags.has(String(id)) || tags.has(id)).map(([key]) => key),
      features: valuesForCategories(categories, FEATURE_CATEGORIES),
      tags: tagValues,
      hardware,
      accessibility,
      review_score: Number.isFinite(Number(app?.review_score)) ? Number(app.review_score) : null,
      metacritic_score: Number.isFinite(Number(app?.metacritic_score)) && Number(app?.metacritic_score) > 0 ? Number(app.metacritic_score) : null,
      dates,
      playtime_minutes: Number.isFinite(Number(app?.minutes_playtime_forever)) ? Number(app.minutes_playtime_forever) : null,
      ready: {
        sources: source.ready,
        original_language: !!originalName(app),
        collections: context.ready.collections,
        privacy: context.ready.privacy && context.ready.hidden,
        modes: categoriesReady,
        status: Object.prototype.hasOwnProperty.call(app || {}, "rt_last_time_played"),
        languages: languagesReady,
        genres: tagsReady,
        features: categoriesReady,
        tags: tagsReady && context.ready.tags,
        hardware: Object.prototype.hasOwnProperty.call(app || {}, "xbox_controller_support")
          || typeof app?.BSupportsVR === "function"
          || typeof app?.BIsNonVRGame === "function"
          || Number.isInteger(deck),
        accessibility: categoriesReady,
      },
      _tag_options: tagOptions,
    };
  }

  function metadataOptions(context, list) {
    const tags = new Map();
    const languages = new Set();
    for (const app of list) {
      for (const language of languageValues(app)) languages.add(language);
      for (const tag of tagsOf(app)) {
        const label = context.tagLabels.get(String(tag));
        if (label) tags.set(String(tag), label);
      }
    }
    return {
      collections: context.collections.collections.map(item => ({ value: item.id, label: item.label })),
      tags: Array.from(tags, ([value, label]) => ({ value, label })),
      languages: Array.from(languages, value => ({ value, label: LANGUAGE_LABELS[value] || value })),
      originalLanguages: ORIGINAL_LANGUAGE_ORDER.map(value => ({ value, label: ORIGINAL_LANGUAGE_LABELS[value] })),
    };
  }

  function prototypeOwner(obj, name) {
    if (!obj || (typeof obj !== "object" && typeof obj !== "function")) {
      return null;
    }
    for (let current = Object.getPrototypeOf(obj); current; current = Object.getPrototypeOf(current)) {
      if (Object.prototype.hasOwnProperty.call(current, name)) {
        return current;
      }
    }
    return null;
  }

  function patchRecords() {
    if (!Array.isArray(window[PATCHES])) {
      window[PATCHES] = [];
    }
    return window[PATCHES];
  }

  function restorePatches() {
    for (const item of patchRecords().splice(0)) {
      try {
        if (item?.obj?.[item.name] === item.fn) {
          item.obj[item.name] = item.orig;
        }
      } catch {
      }
    }
  }

  function patch(obj, name, flag, wrap) {
    const original = obj?.[name];
    if (typeof original !== "function") {
      return false;
    }
    if (original[flag] === true) {
      return true;
    }
    const wrapped = wrap(original);
    if (typeof wrapped !== "function") {
      return false;
    }
    try {
      Object.defineProperty(wrapped, flag, { value: true });
      wrapped.toString = () => original.toString();
      obj[name] = wrapped;
      if (obj[name] !== wrapped) {
        return false;
      }
      patchRecords().push({ obj, name, fn: wrapped, orig: original });
      return true;
    } catch {
      return false;
    }
  }

  function readSearchIndex() {
    const raw = document.documentElement?.dataset?.steamBuffUserNameSearch || "{}";
    const out = new Map();
    let data;
    try {
      data = JSON.parse(raw) || {};
    } catch {
      return out;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return out;
    }
    for (const [id, value] of Object.entries(data)) {
      const appid = Number(id) || 0;
      if (!appid || !value || typeof value !== "object" || Array.isArray(value)) {
        continue;
      }
      out.set(appid, {
        steam_name: text(value.steam_name),
        custom_name: text(value.custom_name),
        aliases: Array.isArray(value.aliases) ? value.aliases.map(text).filter(Boolean) : [],
        mnemonic: text(value.mnemonic),
        pinyin: text(value.pinyin),
      });
    }
    return out;
  }

  function searchMatches(row, app, query) {
    const needle = lower(query);
    if (!row || !needle) {
      return false;
    }
    const values = [
      row.steam_name,
      row.custom_name,
      ...(Array.isArray(row.aliases) ? row.aliases : []),
      row.mnemonic,
      row.pinyin,
      app?.[ORIGINAL_NAME],
    ];
    return values.some((value) => lower(value).includes(needle));
  }

  // 用继承代理只扩展原生文本字段；原生过滤器仍负责全部类型、状态和权限筛选。
  function searchableApp(app, query) {
    if (!app || (typeof app !== "object" && typeof app !== "function")) {
      return null;
    }
    try {
      const proxy = Object.create(app);
      const displayName = `${text(app.display_name)} ${text(query)}`.trim();
      const sortAs = `${text(app.sort_as)} ${text(query)}`.trim();
      Object.defineProperties(proxy, {
        display_name: { value: displayName, configurable: true },
        sort_as: { value: sortAs, configurable: true },
      });
      return proxy;
    } catch {
      return null;
    }
  }

  function filterBaseOwner(filter) {
    const child = prototypeOwner(filter, "MatchesImpl");
    let owner = child ? Object.getPrototypeOf(child) : null;
    while (owner && !Object.prototype.hasOwnProperty.call(owner, "MatchesImpl")) {
      owner = Object.getPrototypeOf(owner);
    }
    if (!owner || typeof owner.MatchesScoredImpl !== "function") {
      return null;
    }
    const source = String(owner.MatchesImpl || "");
    // 只接受当前已实测的 Steam 基类结构，未知结构不猜测兼容。
    if (!source.includes("m_filterSpec") || !source.includes("filterGroups") || !source.includes("strSearchText")) {
      return null;
    }
    return owner;
  }

  function ensureSearchPatch(rt) {
    if (!rt?.scheduled) {
      return false;
    }
    const filter = window.uiStore?.m_currentAppFilter;
    const owner = filterBaseOwner(filter);
    if (!owner) {
      return false;
    }
    if (rt.searchOwner === owner
      && owner.MatchesImpl?.[MATCHES_FLAG] === true
      && owner.MatchesScoredImpl?.[SCORED_FLAG] === true) {
      return true;
    }
    if (rt.searchOwner && rt.searchOwner !== owner) {
      restorePatches();
      rt.searchOwner = null;
      hookSearchSetter(rt);
    }
    const matchesReady = patch(owner, "MatchesImpl", MATCHES_FLAG, (original) => function independentMatches(...args) {
      const current = window[RT];
      if (!current?.scheduled) {
        return original.apply(this, args);
      }
      const app = args[0];
      const result = original.apply(this, args);
      if (result || !app) {
        return result;
      }
      const query = this?.m_filterSpec?.strSearchText;
      const row = current.searchIndex.get(Number(app?.appid) || 0);
      if (!searchMatches(row, app, query)) {
        return result;
      }
      const proxy = searchableApp(app, query);
      return proxy ? original.call(this, proxy, ...args.slice(1)) : result;
    });
    const scoredReady = patch(owner, "MatchesScoredImpl", SCORED_FLAG, (original) => function independentMatchesScored(...args) {
      const current = window[RT];
      if (!current?.scheduled) {
        return original.apply(this, args);
      }
      const app = args[0];
      const result = original.apply(this, args);
      if (result > 0 || !app) {
        return result;
      }
      const query = this?.m_filterSpec?.strSearchText;
      const row = current.searchIndex.get(Number(app?.appid) || 0);
      if (!searchMatches(row, app, query)) {
        return result;
      }
      const proxy = searchableApp(app, query);
      return proxy ? original.call(this, proxy, ...args.slice(1)) : result;
    });
    if (!matchesReady || !scoredReady) {
      restorePatches();
      return false;
    }
    rt.searchOwner = owner;
    return true;
  }

  function hookSearchSetter(rt) {
    const owner = prototypeOwner(window.uiStore, "SetSearchText");
    if (!owner) {
      return false;
    }
    return patch(owner, "SetSearchText", SET_SEARCH_FLAG, (original) => function independentSetSearchText(...args) {
      const result = original.apply(this, args);
      ensureSearchPatch(window[RT]);
      return result;
    });
  }

  function refreshSearch() {
    const filter = window.uiStore?.m_currentAppFilter;
    if (!text(filter?.m_filterSpec?.strSearchText)) {
      return;
    }
    try {
      window.uiStore?.UpdateGameListSelection?.();
    } catch {
    }
  }

  function observeSearchIndex(rt) {
    if (!document.documentElement || typeof MutationObserver !== "function") {
      return false;
    }
    const observer = new MutationObserver(() => {
      if (!rt.scheduled) {
        return;
      }
      rt.searchIndex = readSearchIndex();
      ensureSearchPatch(rt);
      refreshSearch();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [SEARCH_ATTRIBUTE],
    });
    rt.searchObserver = observer;
    return true;
  }

  function row(app, context) {
    const appid = Number(app?.appid);
    if (!Number.isFinite(appid) || appid <= 0) {
      return null;
    }
    return {
      appid,
      official_name: text(app?.__RickyStOriginalName) || text(app?.display_name),
      app_type: app.app_type,
      metadata: metadata(app, context),
    };
  }

  function post(ch, msg) {
    try {
      ch?.postMessage({
        script: ID,
        side: "backend",
        time: Date.now(),
        ...msg,
      });
    } catch {
    }
  }

  async function listPage(offset, context) {
    const list = window.SteamBuff?.ctx?.apps?.() || [];
    const start = Math.max(0, Number(offset) || 0);
    const end = Math.min(list.length, start + PAGE_MAX);
    const rows = [];
    for (let i = start; i < end; i += 1) {
      const item = row(list[i], context);
      if (item) {
        rows.push(item);
      }
      if ((i - start + 1) % SCAN_YIELD === 0) {
        await Promise.resolve();
      }
    }
    return {
      rows,
      offset: end,
      done: end >= list.length,
      total: list.length,
      ...(start === 0 ? { meta: { version: 1, options: metadataOptions(context, list), capabilities: context.ready } } : {}),
    };
  }

  function start(api, _feature, _context, scope) {
    const old = window[RT];
    if (old?.started) {
      return { started: false, reason: "already-started", stop: old.stop };
    }
    if (typeof BroadcastChannel !== "function") {
      return { started: false, reason: "channel-unavailable" };
    }

    const rt = {
      started: true,
      scheduled: true,
      ch: new BroadcastChannel(CH),
      searchIndex: readSearchIndex(),
      searchOwner: null,
      searchObserver: null,
      metadataContext: null,
    };

    rt.onMessage = (event) => {
      const data = event?.data;
      if (data?.script !== ID || data.side !== "ui") {
        return;
      }
      if (data.type === "list") {
        if (Number(data.offset) === 0 || !rt.metadataContext) rt.metadataContext = metadataContext();
        listPage(data.offset, rt.metadataContext).then((page) => {
          post(rt.ch, { type: "list-result", rid: data.rid || "", ok: true, ...page });
        }).catch((error) => {
          log.warn("independent-name-list-failed", "独立版名称库列表读取失败", { error });
          post(rt.ch, {
            type: "list-result",
            rid: data.rid || "",
            ok: false,
            error: error?.message || String(error),
          });
        });
      }
    };
    const channelListenerHandle = scope?.listener?.(
      "independent-name-channel",
      rt.ch,
      "message",
      rt.onMessage,
    ) || null;
    if (!channelListenerHandle) {
      rt.ch.addEventListener("message", rt.onMessage);
    }

    hookSearchSetter(rt);
    ensureSearchPatch(rt);
    observeSearchIndex(rt);

    rt.stop = () => {
      rt.scheduled = false;
      rt.searchObserver?.disconnect?.();
      rt.searchObserver = null;
      restorePatches();
      rt.searchOwner = null;
      channelListenerHandle?.dispose?.();
      if (!channelListenerHandle) {
        rt.ch.removeEventListener("message", rt.onMessage);
      }
      rt.ch.close();
      if (window[RT] === rt) {
        delete window[RT];
      }
    };
    window[RT] = rt;
    return { started: true, stop: rt.stop };
  }

  window.SteamBuff.reg.addEntry(ID, "backend.js", start);
})();
