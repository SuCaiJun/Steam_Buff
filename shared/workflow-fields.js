/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 筛选与AI占位符共享字段目录
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const groups = [
    [
      "名称",
      [
        ["official", "Steam 原名"],
        ["current", "当前名称"],
        ["custom_name", "自定义名称"],
        ["sort", "自定义排序名称"],
        ["aliases", "别名"],
        ["mnemonic", "助记符"],
        ["pinyin", "拼音全拼"],
        ["original_language", "原名称语言"],
      ],
    ],
    [
      "应用",
      [
        ["appid", "AppID"],
        ["app_type", "游戏类型"],
        ["sources", "游戏来源"],
        ["collections", "收藏分组"],
        ["collection_names", "收藏分组名称"],
        ["modes", "游戏模式"],
        ["status", "游戏状态"],
        ["privacy", "私密筛选"],
      ],
    ],
    [
      "内容",
      [
        ["languages", "游戏语言"],
        ["genres", "游戏题材"],
        ["features", "游戏特色"],
        ["tags", "商店标签"],
      ],
    ],
    ["硬件", [["hardware", "硬件支持"]]],
    ["辅助功能", [["accessibility", "辅助功能"]]],
    [
      "评价",
      [
        ["review_score", "Steam 评测"],
        ["metacritic_score", "Metacritic 分数"],
      ],
    ],
    [
      "时间",
      [
        ["date_added", "添加到库日期"],
        ["date_release", "发行日期"],
        ["date_last_played", "最后运行日期"],
        ["playtime_minutes", "游戏时间"],
      ],
    ],
  ];
  const labels = Object.freeze(Object.fromEntries(groups.flatMap(([, entries]) => entries)));
  const personalNames = Object.freeze(["custom_name", "aliases", "mnemonic", "pinyin"]);
  const readGroups = [
    ["游戏名称", [
      ["official", "text", "typography", 30, "steam-original-name", "Steam 原名称"],
      ["current", "text", "eye", 10, "steam-display-name", "当前显示名称"],
      ["original_language", "list", "language", 70],
      ["custom_name", "text", "tag", 20, "steam-custom-name", "独立自定义名称"],
      ["aliases", "list", "tags", 40, null, "游戏别名"],
      ["mnemonic", "text", "letter-case-upper", 60, null, "游戏助记符"],
      ["pinyin", "text", "language", 50, null, "游戏拼音全拼"],
      ["sort", "text", "sort-ascending-letters", 80, "steam-sort-name"],
    ]],
    ["应用与状态", [
      ["appid", "number", "hash", 20, null, "AppID"],
      ["app_type", "text", "category", 40], ["sources", "list", "source-code", 30], ["modes", "list", "device-gamepad-2", 50],
      ["status", "list", "activity", 70], ["privacy", "list", "eye-off", 60, null, "游戏隐私状态"],
    ]],
    ["内容与支持", [
      ["languages", "list", "language", 60], ["genres", "list", "category", 50], ["features", "list", "sparkles", 40],
      ["tags", "list", "tags", 20], ["hardware", "list", "cpu", 30], ["accessibility", "list", "accessible", 10],
    ]],
    ["评价与时间", [
      ["review_score", "number", "star", 30, null, "Steam 评测等级"],
      ["metacritic_score", "number", "chart-bar", 20],
      ["date_added", "number", "calendar-plus", 40], ["date_release", "number", "calendar-event", 10],
      ["date_last_played", "number", "calendar-clock", 60],
      ["playtime_minutes", "number", "clock", 50, null, "游戏时长"],
    ]],
    ["收藏分组", [
      ["collections", "list", "folder", 20, "steam-game-collections", "游戏所属分组 ID"],
      ["collection_names", "list", "folders", 30, null, "游戏所属分组名称"],
    ]],
  ];
  const gameReads = {};
  for (const [group, fields] of readGroups) {
    for (const [key, type, icon, order, id, label] of fields) {
      if (Object.hasOwn(gameReads, key)) throw new Error("Steam 游戏读取字段重复：" + key);
      gameReads[key] = Object.freeze({ id: id || "steam-game-" + key.replaceAll("_", "-"), label: label || labels[key], group, type, icon, order });
    }
  }
  Object.freeze(gameReads);
  const numeric = new Set([
    "appid",
    "review_score",
    "metacritic_score",
    "playtime_minutes",
    "achievement_count",
    "untranslated_count",
  ]);
  const dates = new Set(["date_added", "date_release", "date_last_played"]);
  const discrete = new Set([
    "app_type",
    "sources",
    "original_language",
    "collections",
    "modes",
    "status",
    "privacy",
    "languages",
    "genres",
    "features",
    "tags",
    "hardware",
    "accessibility",
    "review_score",
  ]);
  const filterChoices = Object.freeze({
    sources: [["mine", "自己的游戏"], ["family", "家庭组游戏"]],
    original_language: [
      ["zh_hans", "简体中文"], ["zh_hant", "繁体中文"], ["english", "英文"], ["japanese", "日语"],
      ["korean", "韩语"], ["russian", "俄语"], ["other", "其他"],
    ],
    modes: [["single", "单人"], ["multiplayer", "多人"], ["coop", "合作"], ["local_multiplayer", "本地多人"]],
    status: [["ready", "准备就绪"], ["installed", "已本地安装"], ["played", "已玩过"], ["unplayed", "未玩过"]],
    privacy: [["normal", "正常"], ["private", "私密"], ["hidden", "隐藏"]],
  });
  const LANGUAGE_LABELS = Object.freeze({
    sc_schinese: "简体中文", schinese: "简体中文", tchinese: "繁体中文", english: "英文", koreana: "韩语", japanese: "日语",
    german: "德语", french: "法语", italian: "意大利语", spanish: "西班牙语", latam: "拉丁美洲西班牙语", russian: "俄语",
    portuguese: "葡萄牙语", brazilian: "巴西葡萄牙语", polish: "波兰语", dutch: "荷兰语", danish: "丹麦语", finnish: "芬兰语",
    norwegian: "挪威语", swedish: "瑞典语", hungarian: "匈牙利语", czech: "捷克语", romanian: "罗马尼亚语", turkish: "土耳其语",
    greek: "希腊语", bulgarian: "保加利亚语", ukrainian: "乌克兰语", thai: "泰语", arabic: "阿拉伯语", vietnamese: "越南语",
    indonesian: "印尼语", malay: "马来语",
  });
  const LANGUAGE_TAGS = Object.freeze({
    schinese: "zh-Hans", tchinese: "zh-Hant", english: "en", koreana: "ko", japanese: "ja", german: "de",
    french: "fr", italian: "it", spanish: "es", latam: "es-419", russian: "ru", portuguese: "pt",
    brazilian: "pt-BR", polish: "pl", dutch: "nl", danish: "da", finnish: "fi", norwegian: "no",
    swedish: "sv", hungarian: "hu", czech: "cs", romanian: "ro", turkish: "tr", greek: "el",
    bulgarian: "bg", ukrainian: "uk", thai: "th", arabic: "ar", vietnamese: "vi", indonesian: "id",
    malay: "ms", zh_hans: "zh-Hans", zh_hant: "zh-Hant", korean: "ko",
  });
  const ACCESSIBILITY_LABELS = Object.freeze({
    adjustable_difficulty: "可调整难度", save_anytime: "随时保存", adjustable_text: "可调整文字大小", subtitles: "字幕选项",
    color_alternatives: "可选颜色", contrast: "对比度控制", camera_comfort: "镜头舒适度", playable_without_vision: "无需视觉也可游玩",
    custom_volume: "自定义音量控制", stereo: "立体声", surround: "环绕声", narrated_menus: "朗读游戏菜单", keyboard_only: "可以仅用键盘",
    mouse_only: "可以仅用鼠标", touch_only: "可以仅用触控", without_quick_time: "无需快速反应事件即可游玩", own_pace: "可按自己的节奏游玩",
    speech_to_text: "聊天语音转文字", text_to_speech: "聊天文字转语音",
  });
  const REVIEW_LABELS = Object.freeze({ 9: "好评如潮", 8: "特别好评", 7: "好评", 6: "多半好评", 5: "褒贬不一", 4: "多半差评", 3: "差评", 2: "特别差评", 1: "差评如潮", 0: "无评测分数" });
  const DATE_PRESET_DEFS = Object.freeze([
    ["30m", "近30分钟"], ["1h", "近1小时"], ["6h", "近6小时"], ["24h", "近24小时"],
    ["today", "今日"], ["yesterday", "昨日"], ["3d", "近3日"], ["7d", "近7日"],
    ["14d", "近14日"], ["30d", "近30日"], ["custom", "自定义"],
  ]);
  const candidateChoices = Object.freeze({
    ...filterChoices,
    app_type: [["game", "游戏"], ["software", "软件"], ["tool", "工具"], ["audio", "音频"], ["video", "视频"], ["other", "其他"]],
    languages: Object.entries(LANGUAGE_LABELS),
    genres: [["action", "动作"], ["adventure", "冒险"], ["casual", "休闲"], ["indie", "独立"], ["massively_multiplayer", "大型多人在线"], ["racing", "竞速"], ["rpg", "角色扮演"], ["simulation", "模拟"], ["sports", "体育"], ["strategy", "策略"]],
    features: [["trading_cards", "集换式卡牌"], ["workshop", "创意工坊"], ["achievements", "成就"], ["steam_cloud", "Steam 云"], ["remote_play", "远程同乐"], ["family_sharing", "家庭共享"]],
    tags: [["19", "动作"], ["21", "冒险"], ["122", "角色扮演"], ["492", "独立"], ["597", "休闲"], ["599", "模拟"], ["699", "竞速"], ["701", "体育"]],
    hardware: [["controller_full", "完全支持控制器"], ["controller_partial", "部分支持控制器"], ["controller_recommended", "建议使用控制器"], ["vr", "VR"], ["non_vr", "非 VR"], ["deck_0", "Steam Deck：未知"], ["deck_1", "Steam Deck：Unsupported"], ["deck_2", "Steam Deck：Playable"], ["deck_3", "Steam Deck：Verified"]],
    accessibility: Object.entries(ACCESSIBILITY_LABELS),
    review_score: Object.entries(REVIEW_LABELS),
  });
  const searchOptions = description => ({ type: "array", items: { type: "string" }, description });
  const storeSearchProperties = Object.freeze({
    term: { type: "string", maxLength: 64, description: "Game name or search keyword, up to 64 characters. You can use the game's original name. Omit to search without a keyword." },
    priceBelow: { type: "number", minimum: 0, description: "Final displayed price strictly below this amount in CNY, with up to two decimals. For example, 50 excludes ¥50.00. Incompatible with freeOnly: true." },
    freeOnly: { type: "boolean", description: "Use true for Steam's Free price filter and keep items with a displayed price of zero. Omit priceBelow and leave hideFreeToPlay off when freeOnly is true." },
    discountsOnly: { type: "boolean", description: "Use true to select Steam's Discounts & Events filter. With false or when omitted, include items without discounts." },
    hideFreeToPlay: { type: "boolean", description: "Use true to hide free-to-play items. Incompatible with freeOnly: true." },
    languages: searchOptions('Supported game language codes or Steam Simplified Chinese labels, e.g. ["schinese", "japanese"]. Omit for any language.'),
    tags: searchOptions('Steam tags to include, e.g. ["独立", "解谜"]. Natural-language labels must match Steam’s Simplified Chinese catalog. IDs are strings, e.g. "492".'),
    excludeTags: searchOptions('Steam tags to exclude, e.g. ["独立"] or ["492"]. Uses the same format as tags.'),
    types: searchOptions('Store product types, e.g. ["游戏"] for games only or ["DLC"] for downloadable content. Accepts Steam Simplified Chinese labels or ID strings such as "998".'),
    playerModes: searchOptions('Player modes, e.g. ["在线合作"]. Accepts Steam Simplified Chinese labels or ID strings.'),
    features: searchOptions('Store features, e.g. ["Steam 云", "家庭共享"]. Accepts Steam Simplified Chinese labels or ID strings.'),
    controllers: searchOptions('Controller support, e.g. ["Xbox 控制器支持"]. Accepts Steam Simplified Chinese labels or ID strings.'),
    accessibility: searchOptions('Accessibility features, e.g. ["可调整难度"]. Accepts Steam Simplified Chinese labels or ID strings.'),
    deck: searchOptions('Steam Deck compatibility, e.g. ["通过验证"] or ["3", "2"] for Verified and Playable.'),
    vr: searchOptions('VR support, e.g. ["支持 VR"]. Accepts Steam Simplified Chinese labels or ID strings.'),
    excludeVrOnly: { type: "boolean", description: "Use true to exclude VR-only items while allowing games that can also be played without VR." },
    os: searchOptions('Supported operating systems, e.g. ["win", "mac", "linux"]. Also accepts Steam Simplified Chinese labels.'),
    sortBy: { type: "string", enum: ["relevance", "releaseDate", "name", "priceAsc", "priceDesc", "reviews"],
      description: "Sort by relevance (default), releaseDate (newest first), name (A–Z), priceAsc (lowest first), priceDesc (highest first), or reviews (Steam user review order)." },
    start: { type: "integer", minimum: 0, description: "Page offset, default 0. Keep the same filters and sort order and pass the previous nextStart as start. Stop when nextStart is null. An empty items array can still have a nextStart." },
  });
  const textOps = Object.freeze(["equals", "notEquals", "contains", "notContains", "startsWith", "endsWith", "empty", "notEmpty", "lengthGt", "lengthLt", "regex"]);
  const listOps = Object.freeze([...textOps.filter(op => !["lengthGt", "lengthLt"].includes(op)), "countGt", "countLt"]);
  const numberOps = Object.freeze(["equals", "notEquals", "gt", "gte", "lt", "lte", "between", "unknown"]);
  const enumOps = Object.freeze(textOps.slice(0, 4));
  const optionalSetFields = new Set(["collections", "modes", "languages", "genres", "features", "tags", "hardware", "accessibility"]);
  const unaryOps = Object.freeze(["empty", "notEmpty", "unknown"]);
  const opLabels = Object.freeze({
    equals: "等于", notEquals: "不等于", contains: "包含", notContains: "不包含", startsWith: "以…开头", endsWith: "以…结尾",
    empty: "为空", notEmpty: "不为空", lengthGt: "长度大于", lengthLt: "长度小于", countGt: "数量大于", countLt: "数量小于",
    regex: "正则匹配", gt: "大于", gte: "大于等于", lt: "小于", lte: "小于等于", between: "范围内", unknown: "未提供",
  });
  const fieldType = field => dates.has(field) ? "date" : numeric.has(field) && field !== "review_score" ? "number"
    : discrete.has(field) ? "set" : ["aliases", "collection_names"].includes(field) ? "list" : "text";
  const fieldSpec = (label, type, field) => Object.freeze({ label, type, ops: type === "set" ?
    optionalSetFields.has(field) ? [...enumOps, "empty", "notEmpty"] : enumOps : type === "text" ? textOps :
    type === "list" ? listOps : type === "boolean" ? ["equals", "notEquals", "unknown"] : numberOps });
  const libraryFields = Object.freeze(Object.fromEntries(Object.entries(labels).map(([key, label]) => [key, fieldSpec(label, fieldType(key), key)])));
  const wishlistFields = Object.freeze({
    appid: libraryFields.appid, name: fieldSpec("游戏名称", "text"), addedAt: fieldSpec("添加日期", "date"),
    originalPrice: fieldSpec("原价", "number"), currentPrice: fieldSpec("现价", "number"),
    discounted: fieldSpec("是否打折", "boolean"), discountPercent: fieldSpec("折扣幅度", "number"),
  });
  const priceFields = Object.freeze(["originalPrice", "currentPrice", "discounted", "discountPercent"]);
  const querySorts = Object.freeze({
    library: Object.freeze(["name", "appid", "playtime_minutes", "recentPlaytimeMinutes", "date_last_played", "date_added"]),
    wishlist: Object.freeze(["priority", "name", "appid", "addedAt", "currentPrice", "discountPercent"]),
  });
  const sortLabels = Object.freeze({ name: "名称", appid: "AppID", playtime_minutes: "累计游戏时间",
    recentPlaytimeMinutes: "近两周游玩时间", date_last_played: "最后运行日期", date_added: "添加到库日期",
    priority: "愿望单顺序", addedAt: "添加日期", currentPrice: "现价", discountPercent: "折扣幅度" });
  const queryFields = Object.freeze({ library: libraryFields, wishlist: wishlistFields });
  const foldText = value => String(value).trim().toLocaleLowerCase();
  const dynamicOptions = Object.freeze(["collections", "tags"]);
  const choiceId = (field, id) => field === "languages" && String(id) === "sc_schinese" ? "schinese" : String(id);
  const text = (key, fallback) => root.STI18n?.text(key, fallback) ?? fallback;
  const datePresets = (i18n = text) => DATE_PRESET_DEFS.map(([id, label]) => [id, i18n(`steam.independentName.datePreset${id}`, label)]);
  const dateDurations = Object.freeze({ "30m": 30 * 60_000, "1h": 3_600_000, "6h": 6 * 3_600_000, "24h": 86_400_000,
    "3d": 3 * 86_400_000, "7d": 7 * 86_400_000, "14d": 14 * 86_400_000, "30d": 30 * 86_400_000 });

  /** 候选 ID 与展示名由批量页和查询共用；动态来源由各调用方提供已核验的列表 */
  function options(field, source = candidateChoices[field] ?? [], i18n = text) {
    const names = ["languages", "original_language"].includes(field)
      ? new Intl.DisplayNames([root.STI18n?.intlLocale?.() || "zh-CN"], { type: "language" }) : null;
    const unique = new Map();
    for (const [rawId, rawLabel] of source) {
      const id = choiceId(field, rawId), fallback = String(rawLabel ?? "").trim();
      const label = field === "collections" ? fallback : field === "app_type" ? i18n(`steam.independentName.type${id[0].toUpperCase()}${id.slice(1)}`, fallback)
        : names && Object.hasOwn(LANGUAGE_TAGS, id) ? names.of(LANGUAGE_TAGS[id]) : i18n(`nameFilter.option.${field}.${id}`, fallback);
      if (id && label && !unique.has(id)) unique.set(id, label);
    }
    return Array.from(unique);
  }

  /** 只认已有 ID 或唯一对应的展示名称，保留以已知标签保存的旧配置 */
  function resolveOption(field, input, source) {
    const value = foldText(input), choices = options(field, source);
    const id = choices.find(([key]) => dynamicOptions.includes(field) ? key === input.trim() : foldText(key) === choiceId(field, value));
    if (id) return id[0];
    const candidates = new Set();
    for (const [key, label] of [...(source ?? candidateChoices[field] ?? []), ...choices]) {
      if (foldText(label) === value) candidates.add(choiceId(field, key));
    }
    return candidates.size === 1 ? [...candidates][0] : undefined;
  }

  function validateCatalog(field, entries) {
    if (!Array.isArray(entries) || entries.some(entry => !Array.isArray(entry) || entry.length !== 2 ||
        entry.some(part => typeof part !== "string" || !part.trim())))
      throw Object.assign(new TypeError("Steam 筛选候选数据无效：" + libraryFields[field].label), { code: "AI_TOOL_RESPONSE_INVALID", field });
    return entries;
  }

  function presetRange(preset, now) {
    if (Object.hasOwn(dateDurations, preset)) return [now - dateDurations[preset], now];
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (preset === "today") return [start.getTime(), now];
    if (preset === "yesterday") {
      const end = start.getTime() - 1;
      start.setDate(start.getDate() - 1);
      return [start.getTime(), end];
    }
  }

  /** 批量编辑器和 Steam 查询使用同一套文本含义，调用方区分已知空值与资料缺失 */
  function matchText(op, candidates, value, regex) {
    const values = candidates.map(item => String(item ?? "").trim()).filter(Boolean);
    if (op === "regex") {
      if (!regex) throw new Error("正则筛选缺少已验证表达式");
      return values.some(item => regex.test(item));
    }
    const query = foldText(value);
    if (op === "startsWith") return values.some(item => foldText(item).startsWith(query));
    if (op === "endsWith") return values.some(item => foldText(item).endsWith(query));
    if (op === "lengthGt") return values.some(item => Array.from(item).length > Number(value));
    if (op === "lengthLt") return values.some(item => Array.from(item).length < Number(value));
    const found = values.some(item => ["contains", "notContains"].includes(op) ? foldText(item).includes(query) : foldText(item) === query);
    return ["notContains", "notEquals"].includes(op) ? !found : found;
  }

  function queryInputError(label, cause, field) {
    return Object.assign(new TypeError("筛选参数无效：" + label, { cause }), { code: "CHAT_TOOL_INVALID", field });
  }
  function dateValue(value) {
    if (typeof value === "number") return value;
    if (typeof value !== "string") return NaN;
    const calendarDay = /^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(value)?.[1];
    if (!calendarDay) return NaN;
    const calendarDate = new Date(calendarDay + "T00:00:00Z");
    if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== calendarDay) return NaN;
    if (value === calendarDay) {
      const date = new Date(value + "T00:00:00");
      const end = new Date(date);
      end.setDate(date.getDate() + 1);
      return { min: date.getTime(), max: end.getTime() - 1 };
    }
    return Date.parse(value);
  }
  const dateStart = value => typeof value === "object" ? value.min : value;
  const dateEnd = value => typeof value === "object" ? value.max : value;
  const priceInMinorUnits = value => {
    const minor = Math.round(value * 100);
    return typeof value === "number" && value >= 0 && Number.isSafeInteger(minor) && minor / 100 === value ? minor : NaN;
  };

  function validateCondition(kind, input, { catalogs, now = Date.now() } = {}) {
    const fields = queryFields[kind], field = input?.field, op = input?.op, spec = Object.hasOwn(fields, field) && fields[field];
    if (!spec || !spec.ops.includes(op) || Object.keys(input).some(key => !["field", "op", "value"].includes(key))) {
      const label = spec ? spec.label + " · " + (opLabels[op] ?? String(op)) : String(field ?? "字段");
      throw queryInputError(label, undefined, field);
    }
    if (unaryOps.includes(op)) {
      if (Object.hasOwn(input, "value")) throw queryInputError(spec.label + " · " + opLabels[op], undefined, field);
      return { field, op };
    }
    const { value } = input;
    const invalid = cause => queryInputError(spec.label, cause, field);
    if (spec.type === "boolean") {
      if (typeof value !== "boolean") throw invalid();
    } else if (spec.type === "set") {
      const values = Array.isArray(value) ? value : [value];
      if (!values.length || values.some(item => typeof item !== "string" || !item.trim())) throw invalid();
      const dynamic = dynamicOptions.includes(field), source = catalogs?.[field];
      if (dynamic && !catalogs) return { field, op, value: values };
      if (dynamic && !Array.isArray(source)) throw invalid();
      const selected = values.map(item => {
        const id = resolveOption(field, item, source);
        if (!id) throw queryInputError(spec.label + " · " + item, undefined, field);
        return id;
      });
      return { field, op, value: [...new Set(selected)] };
    } else if (spec.type === "number" || spec.type === "date") {
      const convert = spec.type === "date" ? dateValue : ["originalPrice", "currentPrice"].includes(field) ? priceInMinorUnits
        : item => typeof item === "number" && (field !== "appid" || Number.isInteger(item) && item >= 1 && item <= 4294967295) ? item : NaN;
      if (op === "between") {
        const range = spec.type === "date" && typeof value === "string" && presetRange(value, now);
        if (range) return { field, op, value: range };
        if (!Array.isArray(value) || value.length !== 2 || value.every(bound => bound === null)) throw invalid();
        const from = value[0] === null ? null : dateStart(convert(value[0]));
        const to = value[1] === null ? null : dateEnd(convert(value[1]));
        if (from !== null && !Number.isFinite(from) || to !== null && !Number.isFinite(to) || from !== null && to !== null && from > to) throw invalid();
        return { field, op, value: [from, to] };
      }
      const converted = convert(value);
      if (!Number.isFinite(dateStart(converted))) throw invalid();
      return { field, op, value: converted };
    } else if (["countGt", "countLt", "lengthGt", "lengthLt"].includes(op)) {
      if (!Number.isSafeInteger(value) || value < 0) throw invalid();
    } else {
      const selected = spec.type === "list" && enumOps.includes(op);
      const values = selected && Array.isArray(value) ? value : [value];
      if (!values.length || values.some(item => typeof item !== "string" || !item.trim())) throw invalid();
      if (op === "regex") {
        try { new RegExp(value, "i"); }
        catch (error) { if (error instanceof SyntaxError) throw invalid(error); throw error; }
      }
    }
    return { field, op, value };
  }

  /** 校验手动条件和 AI 条件共用的请求格式。日期和报价在匹配前统一单位 */
  function validateQuery(kind, input, catalogs) {
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        Object.keys(input).some(key => !["conditions", "sortBy", "direction", "limit"].includes(key)))
      throw queryInputError("查询输入");
    const { conditions = [], sortBy = querySorts[kind][0], direction = "asc", limit } = input;
    if (!Array.isArray(conditions)) throw queryInputError("筛选条件");
    if (!querySorts[kind].includes(sortBy)) throw queryInputError("排序字段");
    if (!["asc", "desc"].includes(direction)) throw queryInputError("排序方向");
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) throw queryInputError("取前几项");
    const now = Date.now();
    const filters = conditions.map(item => validateCondition(kind, item, { catalogs, now }));
    return { conditions: filters, sortBy, direction, limit };
  }

  function matchesNumber(value, op, target) {
    if (op === "between") return (target[0] === null || target[0] <= value) && (target[1] === null || value <= target[1]);
    const min = dateStart(target), max = dateEnd(target);
    if (op === "equals" || op === "notEquals") return (value >= min && value <= max) === (op === "equals");
    if (op === "gt") return value > max;
    if (op === "gte") return value >= min;
    if (op === "lt") return value < min;
    return value <= max;
  }

  function matchesQuery(kind, condition, actual) {
    const { field, op, value } = condition;
    const known = actual !== undefined && actual !== null;
    if (op === "unknown") return !known;
    if (!known) return false;
    const { type } = queryFields[kind][field];
    if (type === "date" || type === "number") return Number.isFinite(actual) && matchesNumber(actual, op, value);
    if (type === "boolean") return typeof actual === "boolean" && (actual === value) === (op === "equals");
    const values = (Array.isArray(actual) ? actual : [actual]).filter(item => String(item ?? "").trim());
    if (op === "empty" || op === "notEmpty") return (!values.length) === (op === "empty");
    if (op === "countGt") return values.length > value;
    if (op === "countLt") return values.length < value;
    if (type === "set") {
      const ids = new Set(values.map(item => choiceId(field, item)));
      const exactLanguage = field === "original_language" && ["equals", "notEquals"].includes(op);
      const found = exactLanguage ? ids.size === value.length && value.every(id => ids.has(id)) : value.some(id => ids.has(id));
      return found === (op === "equals" || op === "contains");
    }
    if (Array.isArray(value)) {
      const negate = op === "notContains" || op === "notEquals";
      const comparison = op === "notContains" ? "contains" : op === "notEquals" ? "equals" : op;
      return value.some(item => matchText(comparison, values, item)) !== negate;
    }
    return matchText(op, values, value);
  }

  const sortByField = (kind, sort) => sort === "name" && kind === "library" ? "official" : sort;
  const regexValues = actual => (Array.isArray(actual) ? actual : [actual]).map(item => String(item ?? "").trim()).filter(Boolean);
  const query = Object.freeze({ fields: queryFields, sorts: querySorts, sortLabels, opLabels, unaryOps, priceFields, matchText, sortByField,
    validate: validateQuery, validateCondition, matches: matchesQuery, regexValues, options, dynamicOptions, resolveOption, validateCatalog, datePresets,
    schema(kind, standalone = false) {
      if (standalone) {
        const controls = Object.fromEntries(Object.entries(queryFields[kind]).map(([field, spec]) => {
          const ids = spec.type === "set" && !dynamicOptions.includes(field) ? options(field).map(([id]) => id) : [];
          const hint = ids.length ? "Candidate IDs: " + ids.join(", ") + ". "
            : dynamicOptions.includes(field) ? "Use existing Steam IDs or exact unambiguous names. " : "";
          const value = { description: hint + "Omit for empty, notEmpty or unknown. A range uses [min,max] with null for one open endpoint." +
              (spec.type === "date" ? " Use YYYY-MM-DD or ISO dates, or a between preset: " +
                DATE_PRESET_DEFS.filter(([id]) => id !== "custom").map(([id]) => id).join(", ") + "." : "") +
              (spec.type === "boolean" ? " Use a boolean." : "") };
          return [field, { type: "array", items: { type: "object", additionalProperties: false, required: ["op"],
            properties: { op: { type: "string", enum: spec.ops }, value } } }];
        }));
        return { ...controls, sortBy: { type: "string", enum: querySorts[kind] },
          direction: { type: "string", enum: ["asc", "desc"] }, limit: { type: "integer", minimum: 1 } };
      }
      const candidateList = Object.entries(queryFields[kind]).filter(([field, spec]) => spec.type === "set" && !dynamicOptions.includes(field))
        .map(([field]) => `${field}: ${options(field).map(([id]) => id).join(", ")}`).join(". ");
      return {
        conditions: { type: "array", items: { type: "object", additionalProperties: false, required: ["field", "op"], properties: {
          field: { type: "string", enum: Object.keys(queryFields[kind]) },
          op: { type: "string", enum: [...new Set(Object.values(queryFields[kind]).flatMap(spec => spec.ops))] },
          value: { description: "For candidate fields use equals, notEquals, contains or notContains with an existing ID or a list of IDs. " +
              (candidateList ? `${candidateList}. collections and tags use real Steam IDs. ` : "discounted uses a boolean. ") +
              "Omit value for empty, notEmpty or unknown. between takes [min,max] with null for one open endpoint. Dates use YYYY-MM-DD or ISO timestamps, or a between preset: " +
              DATE_PRESET_DEFS.filter(([id]) => id !== "custom").map(([id]) => id).join(", ") +
              ". Game time is in minutes. Prices are in the configured currency's main unit.",
            anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "array", items: { anyOf: [{ type: "string" }, { type: "number" }, { type: "null" }] } }] },
        } } },
        sortBy: { type: "string", enum: querySorts[kind] },
        direction: { type: "string", enum: ["asc", "desc"] },
        limit: { type: "integer", minimum: 1 },
      };
    },
  });
  const task = Object.freeze({
    target_name: "目标名称",
    achievement_language: "成就原文语言",
    untranslated_count: "未翻译成就数",
    achievement_count: "成就数量",
    logged_in: "Steam 已登录",
    has_family: "已加入家庭组",
  });
  /** 纯目录不采集数据、不注册监听；各运行域提供明确的字段快照 */
  root.STWorkflowFields = Object.freeze({
    groups: Object.freeze(
      groups.map(([label, entries]) =>
        Object.freeze([label, Object.freeze(entries.map(Object.freeze))]),
      ),
    ),
    labels,
    gameReads,
    personalNames,
    task,
    numeric,
    dates,
    discrete,
    filterChoices,
    storeSearchProperties,
    query,
    kind(field) {
      return numeric.has(field)
        ? "number"
        : dates.has(field)
          ? "date"
          : ["logged_in", "has_family"].includes(field)
            ? "boolean"
            : discrete.has(field)
              ? "set"
              : "text";
    },
    valid(field) {
      return Object.hasOwn(labels, field) || Object.hasOwn(task, field);
    },
  });
})(globalThis);
