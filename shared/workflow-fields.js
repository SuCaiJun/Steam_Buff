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
