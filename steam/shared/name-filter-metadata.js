/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 名称批量筛选共享 Steam 元数据
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";
  const ORIGINAL_NAME="__RickyStOriginalName";
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

  function text(value) { return String(value || "").trim(); }
  function toSet(value) {
    if (value instanceof Set) return new Set(value);
    if (Array.isArray(value)) return new Set(value);
    if (value && typeof value[Symbol.iterator] === "function" && typeof value !== "string") {
      return new Set(value);
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
    return typeof app?.[name] === "function" ? app[name]() === true : null;
  }

  function languageValues(app) {
    const raw = app?.bitfield_supported_languages;
    if (Array.isArray(raw)) return raw.map(text).filter(Boolean);
    if (typeof raw === "string" && /^\d+$/.test(raw)) {
      const bits = BigInt(raw);
        return Object.entries(SUPPORTED_LANGUAGE_BITS)
          .filter(([, mask]) => (bits & mask) !== 0n)
          .map(([key]) => key);
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
      optionTags: new Map(), optionLanguages: new Set(), failures: 0, error: null,
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
    const owned = app?.BIsOwned?.() === true;
    const borrowed = app?.BIsBorrowed?.() === true;
    if (owned && !borrowed) values.push("mine");
    const owner = Number(app?.owner_account_id) || 0;
    const family = owner > 0 && window.App?.BIsFamilyGroupMember?.(owner) === true;
    if (family) values.push("family");
    return { values, ready: typeof app?.BIsOwned === "function" && typeof app?.BIsBorrowed === "function" && (owner === 0 || typeof window.App?.BIsFamilyGroupMember === "function") };
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
    const lastPlayedRaw = typeof app?.GetLastTimePlayed === "function" ? app.GetLastTimePlayed() : app?.rt_last_time_played;
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
    const deck = Number(app?.steam_deck_compat_category);
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

  const METADATA_FIELDS = ['sources','original_language','collections','privacy','modes','status','languages','genres','features','tags','hardware','accessibility','review_score','metacritic_score','date_added','date_release','date_last_played','playtime_minutes'];
  // 单行异常只让该行元数据不可用；原始 Error 交给同一分页批次的 reportFailure 汇总。
  function capture(error,context) { context.failures++; if (!context.error) context.error=error; }
  function project(app,context) {
    try {
      const result=metadata(app,context);
      for (const language of result.languages) context.optionLanguages.add(language);
      for (const tag of result.tags) {const label=context.tagLabels.get(tag);if(label)context.optionTags.set(tag,label);}
      return result;
    } catch(error) {
      capture(error,context);
      return {ready:Object.fromEntries(METADATA_FIELDS.map(field=>[field,false]))};
    }
  }
  function metadataOptions(context) {
    return {
      collections: context.collections.collections.map(item=>({value:item.id,label:item.label})),
      tags: Array.from(context.optionTags,([value,label])=>({value,label})),
      languages: Array.from(context.optionLanguages,value=>({value,label:LANGUAGE_LABELS[value]||value})),
      originalLanguages: ORIGINAL_LANGUAGE_ORDER.map(value=>({value,label:ORIGINAL_LANGUAGE_LABELS[value]})),
    };
  }
  function reportFailure(context,log,requestId) {
    if (!context.failures) return;
    log.warn('name-filter-metadata-partial','部分游戏的筛选元数据读取失败，已标记为不可用',{error:context.error,failed:context.failures,requestId});
    context.error=null;context.failures=0;
  }
  window.SteamBuff.nameFilterMetadata = Object.freeze({ context: metadataContext, row: project, options: metadataOptions, reportFailure });
})();
