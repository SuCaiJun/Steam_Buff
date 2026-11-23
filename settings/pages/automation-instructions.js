/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 工作流指令图标与可视化说明
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const tr = (key, fallback) => globalThis.STI18n?.text(key, fallback) ?? fallback;
  const flow = root.STWorkflow, model = root.STAutomation;
  const categories = Object.freeze({
    "数据处理": "database", "条件判断": "sitemap", "循环": "repeat", "AI": "brain", "Steam 操作": "device-gamepad-2",
    "网络": "link", "消息": "messages", "等待与控制": "player-pause", "脚本": "terminal-2", "其他": "category",
  });
  const otherCategories = Object.freeze({ "日志与备注": "notebook", "折叠": "layout-list", "异常处理": "shield-exclamation" });
  const groups = Object.freeze({
    "输入与变量": "variable", "列表操作": "list", "字典操作": "braces", "文本操作": "typography",
    "JSON 转换": "file-code", "日期时间": "calendar", "CSV 转换": "file-type-csv", "Base64 编解码": "binary",
    "游戏名称": "tag", "收藏分组": "folders", "家庭库": "users-group", "游戏成就": "trophy",
    "应用与状态": "apps", "内容与支持": "list-details", "评价与时间": "chart-bar",
  });
  const definitions = [...flow.catalog,
    { id: "trigger-parameters", name: "触发器传参", category: "数据处理", group: "输入与变量" },
    { id: "ai-parameters", name: "AI传参", category: "数据处理", group: "输入与变量" },
    { id: "fold-start", name: "折叠开始", category: "折叠" },
    { id: "fold-end", name: "折叠结束", category: "折叠" }];
  const byId = Object.fromEntries(definitions.map(item => [item.id, item]));
  const commands = [
    "ai-call", "tool-call",
    "tool-return", "wait", "stop",
    "http-request", "query-provider-data", "script",
    "log", "comment",
    "base64-encode", "base64-decode",
    "csv-parse", "csv-stringify",
    "json", "json-stringify",
    "trigger-parameters", "ai-parameters", "set", "get", "convert", "calculate", "random",
    "list", "append", "list-get", "list-set", "list-insert", "list-filter-condition", "list-filter", "list-field",
    "list-sort", "list-unique", "list-merge", "list-length", "list-index", "list-slice", "list-chunk",
    "list-intersection", "list-reverse", "list-shuffle", "list-remove", "list-clear",
    "record", "dict-set", "dict-get", "dict-get-default", "dict-has", "dict-keys", "dict-values", "dict-delete", "dict-clear",
    "text-append", "text-replace", "text-trim", "text-split", "text-join", "text-slice", "text-extract",
    "text-length", "text-case", "text-pad", "text-pinyin", "text-mnemonic",
    "date-now", "date-parse", "date-format", "date-add", "date-diff", "date-parts", "date-to-timestamp", "date-from-timestamp",
    "family-refresh",
    "steam-game-accessibility", "steam-game-tags", "steam-game-hardware", "steam-game-features", "steam-game-genres", "steam-game-languages",
    "steam-game-date-release", "steam-game-metacritic-score", "steam-game-review-score", "steam-game-date-added",
    "steam-game-playtime-minutes", "steam-game-date-last-played",
    "steam-collections", "steam-game-collections", "steam-game-collection-names", "steam-add-collections",
    "steam-game-appid", "steam-game-sources", "steam-game-app-type", "steam-game-modes", "steam-game-privacy", "steam-game-status",
    "steam-save-translations", "steam-translations", "steam-achievements",
    "steam-display-name", "steam-custom-name", "steam-original-name", "steam-game-aliases", "steam-game-pinyin", "steam-game-mnemonic",
    "steam-game-original-language", "steam-sort-name", "steam-set-custom-name", "steam-set-aliases", "steam-set-pinyin",
    "steam-set-mnemonic", "steam-set-sort-name",
    "if", "if-many", "else", "else-if", "else-if-many", "end-if",
    "interactive", "notify",
    "for", "while", "forever", "foreach", "entries", "continue", "break", "end-loop",
    "try", "catch", "finally", "end-try", "raise",
    "fold-start", "fold-end",
  ].map(id => byId[id]);
  const categoryOrder = Object.keys(categories).flatMap(name => name === "其他" ? Object.keys(otherCategories) : [name]);
  const groupOrder = Object.keys(groups);
  const catalog = Object.freeze(commands.sort((a, b) =>
    categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category) ||
    groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group)));
  // 键沿用指令契约，值使用 Tabler 上游 SVG 文件名。
  const commandIcons = Object.freeze({
    "ai-call": "sparkles", "tool-call": "link", "tool-return": "arrow-back-up", "http-request": "link", "query-provider-data": "database", wait: "hourglass", stop: "player-stop", script: "code", log: "article",
    comment: "message", "base64-encode": "binary", "base64-decode": "file-symlink",
    "csv-parse": "file-type-csv", "csv-stringify": "file-export", json: "braces",
    "json-stringify": "file-code", "list-filter-condition": "filter-check", list: "list",
    "list-get": "list-search", "list-reverse": "arrows-sort", "list-filter": "filter",
    "list-merge": "arrows-join", "list-intersection": "circles-relation", "list-length": "list-numbers",
    "list-index": "list-search", "list-slice": "slice", "list-insert": "list-details",
    "list-chunk": "layout-grid", "list-sort": "sort-ascending", "list-unique": "list-check",
    "list-shuffle": "arrows-shuffle", "list-clear": "playlist-off", "list-field": "list-details",
    "list-set": "list-details", "list-remove": "playlist-x", append: "playlist-add",
    "date-now": "calendar-clock", "date-diff": "hourglass", "date-parts": "calendar",
    "date-to-timestamp": "clock-up", "date-format": "calendar-event",
    "date-from-timestamp": "clock-down", "date-add": "calendar-plus", "date-parse": "calendar-search",
    random: "dice", get: "file-search", receive: "download", "trigger-parameters": "download", "ai-parameters": "download", convert: "switch-horizontal",
    set: "variable", calculate: "calculator", "text-pad": "text-wrap", "text-extract": "regex",
    "text-case": "letter-case", "text-length": "ruler-measure", "text-slice": "slice",
    "text-join": "arrows-join", "text-trim": "scissors", "text-pinyin": "language",
    "text-mnemonic": "letter-case-upper", "text-split": "separator", "text-replace": "replace",
    "text-append": "text-plus", record: "braces", "dict-get": "file-search",
    "dict-get-default": "file-check", "dict-keys": "key", "dict-values": "list-details",
    "dict-has": "checklist", "dict-clear": "eraser", "dict-delete": "file-minus",
    "dict-set": "file-pencil", "family-refresh": "refresh", "steam-save-translations": "file-check",
    "steam-translations": "language", "steam-achievements": "trophy", "steam-display-name": "eye",
    "steam-custom-name": "tag", "steam-original-name": "typography",
    "steam-sort-name": "sort-ascending-letters", "steam-set-custom-name": "tag-star",
    "steam-set-sort-name": "sort-descending-letters",
    "steam-collections": "folders", "steam-game-collections": "folder",
    "steam-add-collections": "folder-plus", else: "arrow-back-up", "else-if": "git-compare",
    "else-if-many": "git-pull-request", "end-if": "git-merge", "if-many": "sitemap", if: "git-branch",
    interactive: "message-question", notify: "bell", for: "list-numbers", foreach: "list-details",
    entries: "list-letters", continue: "player-skip-forward", break: "logout", while: "list-check",
    forever: "infinity", "end-loop": "repeat-off", catch: "shield-check", "end-try": "shield-off",
    finally: "flag-check", raise: "alert-triangle", try: "shield", "fold-start": "square-minus",
    "fold-end": "square-plus",
  });
  const fieldIcons = Object.freeze({
    original_language: "language", aliases: "tags", mnemonic: "letter-case-upper", pinyin: "language",
    appid: "hash", app_type: "category", sources: "source-code", modes: "device-gamepad-2",
    status: "activity", privacy: "eye-off", languages: "language", genres: "category",
    features: "sparkles", tags: "tags", hardware: "cpu", accessibility: "accessible",
    custom_name: "tag", review_score: "star", metacritic_score: "chart-bar",
    date_added: "calendar-plus", date_release: "calendar-event", date_last_played: "calendar-clock",
    playtime_minutes: "clock", collection_names: "folders",
  });
  const hints = Object.freeze({
    ...Object.fromEntries(Object.values(flow.definitions).map(item => [item.id, item.hint])),
    if: "条件满足时执行内部指令", "if-many": "按全部满足或任一满足组合多个条件", "else-if": "前面的条件不满足时继续判断", "else-if-many": "前面的条件不满足时判断一组条件",
    else: "以上条件均不满足时执行", "end-if": "结束条件判断",
    for: "按指定次数执行内部指令", while: "每轮开始前判断条件，满足时继续循环", foreach: "逐项读取列表并执行内部指令", entries: "逐项读取字典的键和值", forever: "重复执行内部指令，直到流程退出循环",
    continue: "跳过当前轮剩余指令，开始下一轮", break: "退出当前循环", "end-loop": "结束当前循环区域",
    "ai-call": "发送内容给 AI，保存回复原文",
    "tool-call": "执行登记的工具，或为 AI 记录一条已有结果",
    "tool-return": "返回数据并结束工具执行",
    "query-provider-data": "按所选数据来源查询 Steam 或 ITAD 数据",
    notify: "按配置的级别、范围和方式发送通知", interactive: "发送带操作按钮的消息并等待用户操作或超时",
    wait: "等待指定时间后继续执行", stop: "结束本次工作流运行", log: "将内容写入本次运行日志", comment: "为流程添加不参与执行的备注",
    try: "尝试执行内部指令", catch: "发生异常时执行，并保存异常信息", finally: "无论成功或失败都执行", "end-try": "结束异常处理区域", raise: "主动抛出异常，由 Catch 处理或结束失败",
    script: "执行 JavaScript，可直接读取流程变量并返回结果",
    "http-request": "向已授权的站点发送请求并保存响应",
    "fold-start": "从这里开始折叠一组指令", "fold-end": "结束当前折叠区域",
  });
  // 只解析内置字段与选项的显示名称，自定义名称由各控件原样呈现。
  const schemaKeys = Object.freeze({
    "AI 回复": "seed_variable_ai",
    "Base64 文本": "workflow_ui_base64_text",
    "Base64 编解码": "workflow_ui_base64_encoding",
    "CSV 文本": "workflow_ui_csv_text",
    "CSV 转换": "workflow_ui_csv_conversion",
    "HTTP 状态码": "workflow_ui_http_status_code",
    "JSON 文本": "workflow_ui_json_text",
    "JSON 转换": "workflow_ui_json_conversion",
    "Metacritic 分数": "promptToken_game_metacritic_score",
    "Steam 原名": "store_titleCustomName_steamName",
    "Steam 已登录": "workflow_ui_signed_in_to_steam",
    "Steam 操作": "workflow_ui_steam_actions",
    "Steam 评测": "promptToken_game_review_score",
    "Steam 账号": "workflow_ui_steam_account",
    "不为空": "steam_independentName_filterOpNotEmpty",
    "不以对象2开头": "workflow_ui_does_not_start_with_the_second_operand",
    "不以对象2结束": "workflow_ui_does_not_end_with_the_second_operand",
    "不以比较值开头": "workflow_ui_does_not_start_with",
    "不以比较值结束": "workflow_ui_does_not_end_with",
    "不包含": "common_notIncluded",
    "不是空值": "workflow_ui_is_not_empty",
    "不等于": "steam_independentName_filterOpNotEquals",
    "为假": "workflow_ui_is_false",
    "为真": "workflow_ui_is_true",
    "为空": "steam_independentName_filterOpEmpty",
    "乘": "workflow_ui_multiply",
    "以…开头": "steam_independentName_filterOpStartsWith",
    "以…结尾": "steam_independentName_filterOpEndsWith",
    "以对象2开头": "workflow_ui_starts_with_the_second_operand",
    "以对象2结束": "workflow_ui_ends_with_the_second_operand",
    "以比较值开头": "workflow_ui_starts_with",
    "以比较值结束": "workflow_ui_ends_with",
    "俄语": "settings_field_translate_local_option_russian",
    "保留匹配项目": "workflow_ui_keep_matching_items",
    "关系": "workflow_ui_operator",
    "其他": "steam_libraryCustomName_typeOther",
    "内容": "common_content",
    "内容与支持": "workflow_ui_content_and_support",
    "准备就绪": "nameFilter_option_status_ready",
    "减": "workflow_ui_subtract",
    "分": "workflow_ui_minute",
    "分组 ID 列表": "workflow_ui_collection_ids",
    "分钟": "store_priceHistory_minute",
    "分隔符": "workflow_ui_separator",
    "列表": "seed_variable_list",
    "列表或字典": "workflow_ui_list_or_dictionary",
    "列表操作": "workflow_ui_list_operations",
    "初始键值对": "workflow_ui_initial_key_value_pairs",
    "初始项目": "workflow_ui_initial_items",
    "别名": "steam_independentName_colAlias",
    "别名列表（整组替换）": "workflow_ui_aliases_replace_all",
    "加": "workflow_ui_add",
    "助记符": "steam_independentName_colMnemonic",
    "包含": "common_included",
    "匹配的项目": "workflow_ui_matching_items",
    "升序": "workflow_ui_ascending",
    "单人": "nameFilter_option_modes_single",
    "原名称语言": "promptToken_game_original_language",
    "原因代码": "workflow_ui_reason_code",
    "原始原因": "workflow_ui_original_cause",
    "发行日期": "promptToken_game_date_release",
    "取余": "workflow_ui_remainder",
    "变量值": "workflow_ui_variable_value",
    "另一个列表": "workflow_ui_other_list",
    "只生成整数": "workflow_ui_integers_only",
    "合作": "nameFilter_option_modes_coop",
    "合并的列表": "workflow_ui_list_to_merge",
    "名称": "nameFilter_group_official",
    "响应体": "workflow_ui_response_body",
    "响应头": "workflow_ui_response_headers",
    "商店标签": "promptToken_game_tags",
    "填充文本": "workflow_ui_padding_text",
    "增减数量": "workflow_ui_amount_to_add_or_subtract",
    "多人": "nameFilter_option_modes_multiplayer",
    "大于": "workflow_ui_greater_than",
    "大于等于": "workflow_ui_greater_than_or_equal",
    "天": "workflow_ui_days",
    "失败": "workflow_ui_failed",
    "失败原因": "workflow_ui_failure_reason",
    "字典": "seed_variable_record",
    "字典列表或二维列表": "workflow_ui_list_of_dictionaries_or_rows",
    "字典操作": "workflow_ui_dictionary_operations",
    "字段值": "workflow_ui_field_value",
    "字段名称": "workflow_ui_field_name",
    "字段或位置（从 0 开始）": "workflow_ui_field_or_index_zero_based",
    "家庭库": "workflow_ui_family_library",
    "家庭成员": "workflow_ui_family_members",
    "家庭游戏": "workflow_ui_family_games",
    "家庭组 ID": "workflow_ui_family_group_id",
    "家庭组名称": "workflow_ui_family_group_name",
    "家庭组游戏": "nameFilter_option_sources_family",
    "对象1": "workflow_ui_first_operand",
    "对象2": "workflow_ui_second_operand",
    "小于": "workflow_ui_less_than",
    "小于等于": "workflow_ui_less_than_or_equal",
    "小时": "store_priceHistory_hour",
    "已保存的译文": "workflow_ui_saved_translations",
    "已加入家庭组": "workflow_ui_family_group_member",
    "已本地安装": "nameFilter_option_status_installed",
    "已玩过": "nameFilter_option_status_played",
    "已确认保存": "workflow_ui_save_confirmed",
    "已赋值": "workflow_ui_is_defined",
    "布尔值": "workflow_ui_boolean",
    "带时区的 ISO 文本": "workflow_ui_iso_text_with_time_zone",
    "幂": "workflow_ui_power",
    "年": "workflow_ui_years",
    "年-月-日": "workflow_ui_year_month_day",
    "年-月-日 时:分:秒": "workflow_ui_year_month_day_hour_minute_second",
    "应用": "steam_independentName_applyFilter",
    "应用与状态": "workflow_ui_application_and_status",
    "开头": "workflow_ui_beginning",
    "开始位置": "workflow_ui_start_index",
    "开始位置（从 0 开始）": "workflow_ui_start_index_zero_based",
    "开始标记": "workflow_ui_start_marker",
    "异常信息": "workflow_ui_exception_details",
    "异常内容": "workflow_ui_exception_message",
    "异常处理": "workflow_ui_exception_handling",
    "异常类型": "workflow_ui_exception_type",
    "当前名称": "steam_libraryCustomName_currentName",
    "待处理文本": "workflow_ui_input_text",
    "循环": "workflow_ui_loops",
    "成功": "messageCenter_level_success",
    "成就原文语言": "workflow_ui_achievement_source_language",
    "成就数量": "workflow_ui_achievement_count",
    "截取字符数": "workflow_ui_character_count",
    "截取项数": "workflow_ui_item_count",
    "执行状态": "workflow_ui_execution_status",
    "折叠": "workflow_ui_folding",
    "拼音全拼": "steam_independentName_colPinyin",
    "指令 ID": "workflow_ui_action_id",
    "按拼音全拼": "workflow_ui_by_full_pinyin",
    "按文字": "workflow_ui_by_text",
    "按钮名称": "workflow_ui_button_name",
    "排序名称": "workflow_ui_sort_name",
    "排序方式": "workflow_ui_sort_direction",
    "排除匹配项目": "workflow_ui_exclude_matching_items",
    "接收的数据": "workflow_ui_incoming_data",
    "插入位置（从 0 开始）": "workflow_ui_insertion_index_zero_based",
    "插入的项目": "workflow_ui_item_to_insert",
    "收藏分组": "promptToken_game_collections",
    "收藏分组名称": "steam_independentName_filterFieldcollection_names",
    "数字": "steam_independentName_bulk_number",
    "数据处理": "workflow_ui_data_processing",
    "文字或拼音": "workflow_ui_text_or_pinyin",
    "文本": "steam_independentName_bulk_text",
    "文本操作": "workflow_ui_text_operations",
    "新的项目": "workflow_ui_new_item",
    "日": "workflow_ui_day",
    "日志与备注": "workflow_ui_logs_and_comments",
    "日期文本": "workflow_ui_date_text",
    "日期时间": "workflow_ui_date_and_time",
    "日语": "locale_ja",
    "时": "workflow_ui_hour",
    "时区": "workflow_ui_time_zone",
    "时间": "settings_account_profileUsageTime",
    "时间单位": "workflow_ui_time_unit",
    "时间戳": "workflow_ui_timestamp",
    "时间戳单位": "workflow_ui_timestamp_unit",
    "是否成功": "workflow_ui_succeeded",
    "是空值": "workflow_ui_is_empty",
    "普通": "messageCenter_level_info",
    "更新时间": "settings_field_familyLibrary_refreshInterval_label",
    "替换为": "steam_independentName_bulk_replacement",
    "替换全部": "workflow_ui_replace_all",
    "最后运行日期": "promptToken_game_date_last_played",
    "最大值": "workflow_ui_maximum",
    "最小值": "workflow_ui_minimum",
    "最近 1 小时": "workflow_ui_last_hour",
    "最近 12 小时": "workflow_ui_last_12_hours",
    "最近 14 天": "workflow_ui_last_14_days",
    "最近 24 小时": "workflow_ui_last_24_hours",
    "最近 3 天": "workflow_ui_last_3_days",
    "最近 30 分钟": "workflow_ui_last_30_minutes",
    "最近 30 天": "workflow_ui_last_30_days",
    "最近 6 小时": "workflow_ui_last_6_hours",
    "最近 7 天": "workflow_ui_last_7_days",
    "月": "workflow_ui_months",
    "未提供": "steam_independentName_filterOpUnknown",
    "未来 1 天": "workflow_ui_next_day",
    "未来 3 天": "workflow_ui_next_3_days",
    "未来 30 天": "workflow_ui_next_30_days",
    "未来 7 天": "workflow_ui_next_7_days",
    "未玩过": "nameFilter_option_status_unplayed",
    "未翻译成就数": "workflow_ui_untranslated_achievements",
    "未赋值": "workflow_ui_is_undefined",
    "末尾": "workflow_ui_end",
    "本地多人": "nameFilter_option_modes_local_multiplayer",
    "本次事件": "workflow_ui_current_event",
    "条件判断": "workflow_ui_conditions",
    "查找文本": "workflow_ui_text_to_find",
    "查找的项目": "workflow_ui_item_to_find",
    "正则匹配": "steam_independentName_filterOpRegex",
    "正常": "nameFilter_option_privacy_normal",
    "每批项目数": "workflow_ui_items_per_batch",
    "比较值": "workflow_ui_comparison_value",
    "毫秒": "workflow_ui_milliseconds",
    "消息": "messageCenter_messages",
    "添加到库日期": "promptToken_game_date_added",
    "游戏": "steam_libraryCustomName_typeGame",
    "游戏助记符": "workflow_ui_game_mnemonic",
    "游戏名称": "seed_workflow_name",
    "游戏成就": "workflow_ui_achievements",
    "游戏拼音全拼": "workflow_ui_full_game_pinyin",
    "游戏时间": "promptToken_game_playtime_minutes",
    "游戏来源": "promptToken_game_sources",
    "游戏模式": "promptToken_game_modes",
    "游戏特色": "promptToken_game_features",
    "游戏状态": "promptToken_game_status",
    "游戏类型": "steam_independentName_gameType",
    "游戏语言": "promptToken_game_languages",
    "游戏题材": "promptToken_game_genres",
    "生成方式": "workflow_ui_generation_method",
    "用户操作": "workflow_ui_user_action",
    "用户数据": "workflow_ui_user_data",
    "目标名称": "workflow_ui_target_name",
    "目标字符数": "workflow_ui_target_length",
    "目标语言": "settings_field_translate_to_label",
    "硬件": "nameFilter_group_hardware",
    "硬件支持": "promptToken_game_hardware",
    "私密": "nameFilter_option_privacy_private",
    "私密筛选": "promptToken_game_privacy",
    "秒": "workflow_ui_seconds",
    "移除位置（从 0 开始）": "workflow_ui_removal_index_zero_based",
    "等于": "steam_independentName_filterOpEquals",
    "等待与控制": "workflow_ui_wait_and_control",
    "筛选字段（选填）": "workflow_ui_filter_field_optional",
    "筛选方式": "workflow_ui_filter_mode",
    "简体中文": "locale_zh_CN",
    "系统时区": "workflow_ui_system_time_zone",
    "繁体中文": "settings_field_translate_local_option_chinese_traditional",
    "结束时间": "workflow_ui_end_time",
    "结束标记": "workflow_ui_end_marker",
    "结果单位": "workflow_ui_result_unit",
    "缓存到期时间": "workflow_ui_cache_expiry",
    "缩进排版": "workflow_ui_indent_output",
    "网络": "workflow_ui_network",
    "脚本": "workflow_ui_scripts",
    "自定义名称": "store_titleCustomName_customName",
    "自定义排序名称": "steam_libraryCustomName_customSortName",
    "自己的游戏": "nameFilter_option_sources_mine",
    "英文": "workflow_ui_english",
    "范围内": "steam_independentName_filterOpBetween",
    "补齐位置": "workflow_ui_padding_side",
    "要转换的数据": "workflow_ui_data_to_convert",
    "触发输入": "workflow_ui_trigger_input",
    "警告": "messageCenter_level_warning",
    "评价": "nameFilter_group_review_score",
    "评价与时间": "workflow_ui_reviews_and_time",
    "译文列表": "workflow_ui_translation_list",
    "译文来源": "workflow_ui_translation_source",
    "请求体": "workflow_ui_request_body",
    "请求头": "workflow_ui_request_headers",
    "调用堆栈": "workflow_ui_stack_trace",
    "跳过": "workflow_ui_skipped_label",
    "转大写": "workflow_ui_uppercase",
    "转小写": "workflow_ui_lowercase",
    "转换为": "workflow_ui_convert_to",
    "转换方式": "workflow_ui_conversion_method",
    "辅助功能": "promptToken_game_accessibility",
    "输入与变量": "workflow_ui_input_and_variables",
    "输入字段": "workflow_ui_input_field",
    "输入格式": "workflow_ui_input_format",
    "输出格式": "workflow_ui_output_format",
    "输出表头": "workflow_ui_include_column_headers",
    "运算": "workflow_ui_operation",
    "运行信息": "workflow_ui_run_information",
    "追加的文本": "workflow_ui_text_to_append",
    "追加的项目": "workflow_ui_item_to_append",
    "错误": "common_error",
    "错误代码": "workflow_ui_error_code",
    "降序": "workflow_ui_descending",
    "除": "workflow_ui_divide",
    "隐藏": "nameFilter_option_privacy_hidden",
    "韩语": "locale_ko",
    "项目位置（从 0 开始）": "workflow_ui_item_index_zero_based",
    "首行为表头": "workflow_ui_first_row_contains_headers",
    "默认值": "workflow_ui_default_value",
  });
  const schemaLabel = label => Object.hasOwn(schemaKeys, label) ? tr(schemaKeys[label], label) : label;
  const schemaChoices = rows => rows.map(([value, label]) => [value, schemaLabel(label)]);
  const name = id => tr("workflow.command." + id + ".name", byId[id].name);
  const hint = id => tr("workflow.command." + id + ".hint", hints[id] || byId[id].name);
  const key = row => ["", "else-if"].includes(row.marker || "") && row.node.kind === "if" ? (row.marker ? "else-if" : "if") + (flow.multiple(row.node.branches[row.branch || 0].condition) ? "-many" : "") : row.marker || (row.node.action === "notify" && row.node.messageType === "interactive" ? "interactive" : flow.type(row.node));
  const iconAsset = name => root.chrome.runtime.getURL("images/tabler/" + name + ".svg");
  function iconName(id) {
    const effect = flow.effects[id], field = effect?.gameField || effect?.nameField;
    const name = commandIcons[id] || fieldIcons[field];
    if (!name) throw new Error("自动化指令缺少图标：" + id);
    return name;
  }
  const iconUrl = id => iconAsset(iconName(id));
  const icon = (name, className = "") => `<span class="aw-command-icon ${className}" aria-hidden="true" style="--aw-command-icon:url('${iconAsset(name)}')"></span>`;
  const iconTone = id => id === "comment" ? "aw-icon-note" : "aw-icon-instruction";
  const commandIcon = id => icon(iconName(id), iconTone(id));
  /** 返回比较字段的 [稳定值, 显示名称] 选项；交互按钮按其输出变量关联，其他字段返回空列表 */
  function choices(workflow, left) {
    left = flow.activeValue(left);
    if (left.source !== "variable" || left.path.length !== 1) return [];
    if (left.path[0] === "status") return [...flow.walk(workflow.steps)].some(node =>
      node.errorOutput === left.id || node.action === "notify" && node.output === left.id) ? schemaChoices(Object.entries(model.STEP_STATES)) : [];
    if (left.path[0] !== "decision") return [];
    const buttons = new Map();
    for (const node of flow.walk(workflow.steps)) if (node.action === "notify" && node.messageType === "interactive" && node.output === left.id) {
      for (const button of node.buttons) buttons.set(button.id, button.label);
      if (node.timeout) buttons.set("timeout", tr("workflow_ui_timed_out_label", "超时"));
      buttons.set("delivery-failed", tr("workflow_ui_delivery_failed", "投递失败"));
    }
    return [...buttons];
  }
  /** 返回文字和参数片段，由编辑器按纯文本渲染；说明不参与保存和执行 */
  function describe(row, workflow, editor) {
    const node = row.node, id = key(row), token = value => ({ value: String(value) });
    const value = (item, choices) => root.STWorkflowValues.summaryParts(item, workflow, choices);
    const variable = name => ({ value: workflow.variables.find(item => item.id === name)?.name || name, reference: true });
    const output = name => name ? [tr("workflow_ui_save_result_to_label", "，结果保存到 "), variable(name)] : [];
    function condition(item) {
      if (item.children) {
        if (!item.children.length) return [item.op === "all" ? tr("workflow_ui_condition_group_match_all_0_conditions", "条件组：全部满足（0 项）") : tr("workflow_ui_condition_group_match_any_0_conditions", "条件组：任一满足（0 项）")];
        return item.children.flatMap((child, index) => [index ? item.op === "all" ? tr("workflow_ui_and", " 且 ") : tr("settings_lock_depOr", " 或 ") : "", ...child.children ? ["（", ...condition(child), "）"] : condition(child)]);
      }
      const parts = [...value(item.left), " ", schemaLabel(flow.operations[item.op])];
      if (!flow.unary.has(item.op)) {
        const right = flow.activeValue(item.right);
        const label = Object.hasOwn(right, "literal") && (right.display || choices(workflow, item.left).find(([id]) => id === right.literal)?.[1]);
        parts.push(" ", ...(label ? [{ value: label, fragment: true }] : value(item.right)));
      }
      return parts;
    }
    if (["if", "if-many", "else-if", "else-if-many"].includes(id)) return [id.startsWith("if") ? tr("workflow_ui_if", "如果 ") : tr("workflow_ui_else_if", "否则如果 "), ...condition(node.branches[row.branch || 0].condition), tr("workflow_ui_run_the_following_actions", "，执行以下指令")];
    if (["else", "end-if", "end-loop", "continue", "break", "stop", "end-try"].includes(id)) return [hint(id)];
    if (id === "for") return [tr("workflow_ui_repeat", "重复执行 "), ...value(node.count), tr("workflow_ui_times", " 次")];
    if (id === "while") return [tr("workflow_ui_check_before_each_iteration", "每轮开始前判断："), ...condition(node.condition)];
    if (id === "forever") return [tr("workflow_ui_repeat_with_an_interval_of", "重复执行，每轮间隔 "), ...value(node.seconds), tr("workflow_ui_seconds_label", " 秒")];
    if (id === "foreach" || id === "entries") return [tr("workflow_ui_iterate_over", "逐项读取 "), ...value(node.value), "，", id === "entries" ? tr("workflow_ui_current_value", "当前值") : tr("seed_variable_item", "当前项目"), tr("workflow_ui_save_current_to", "保存到 "), variable(node.item), "，", id === "entries" ? tr("workflow_ui_current_key", "当前键") : tr("seed_variable_index", "当前序号"), tr("workflow_ui_save_current_to", "保存到 "), variable(node.index)];
    if (id === "try" || id === "finally") return [hint(id)];
    if (id === "catch") return [tr("workflow_ui_on_error_save_the_exception_to", "发生异常时执行，异常保存到 "), variable(node.error)];
    if (id === "ai-call") {
      const { plan, service, fields, errors } = root.STWorkflowTools.resolvePrompt(node, editor.plans, editor.registry);
      const userParameter = root.STPromptPlans.userParameter(plan);
      const inputs = plan && service && errors.length ? [tr("workflow_ui_check_prompt_template", "，检查提示词模板")] : fields.flatMap(name => {
        const input = node.inputs && Object.hasOwn(node.inputs, name) ? node.inputs[name] : undefined;
        return ["，", name === userParameter ? tr("workflow_ui_user_prompt", "用户提示词") : name, " ", ...(input ? value(input) : [tr("workflow_ui_input_required", "待填写")])];
      });
      return [tr("workflow_ui_use", "使用 "), token(service?.name || tr("workflow_ui_select_ai_service", "待选 AI 服务")), tr("settings_lock_depAnd", " 和 "),
        token(plan?.name || tr("workflow_ui_select_prompt_template", "待选提示词模板")), ...inputs, ...(node.output ? [tr("workflow_ui_save_reply_to_label", "，回复保存到 "), variable(node.output)] : []),
        ...(node.context && flow.activeValue(node.context).literal !== "" ? [tr("workflow_ui_pass_chat_history", "，传入对话历史 "), ...value(node.context)] : []),
        ...(node.contextOutput ? [tr("workflow_ui_save_chat_history_to", "，对话历史保存到 "), variable(node.contextOutput)] : []),
        ...(node.toolResults ? ["，", tr("workflow_ui_tool_results_input", "传入工具结果"), " ", ...value(node.toolResults)] : []),
        ...(node.toolRequestsOutput ? ["，", tr("workflow_ui_save_tool_requests_to", "保存工具请求至"), " ", variable(node.toolRequestsOutput)] : [])];
    }
    if (id === "notify" || id === "interactive") return [tr("workflow_ui_send", "发送 "), ...value(node.body), "（", schemaLabel(model.NOTICE_TYPES[node.level]), "），", token(node.delivery === "popup" ? tr("workflow_ui_message_center_and_popup", "消息中心并弹出") : tr("messageCenter_navigationLabel", "消息中心")),
      ...id === "interactive" ? [tr("workflow_ui_buttons", "；按钮："), token(node.buttons.map(item => item.label || item.id).join(" / ")), ...node.timeout ? [tr("workflow_ui_wait_up_to", "，最多等待 "), token(node.timeout.seconds), tr("workflow_ui_seconds_label", " 秒")] : [tr("workflow_ui_no_timeout", "，不设置超时")]] : ["，", token(node.scope === "device" ? tr("workflow_ui_this_device", "本机") : tr("workflow_ui_current_account", "当前账号"))], ...output(node.output)];
    if (id === "receive") return [tr("workflow_ui_receive", "接收 "), ...value(node.value), ...output(node.output)];
    if (id === "set") return [tr("workflow_ui_set", "将 "), variable(node.output), tr("workflow_ui_to", " 设为 "), ...value(node.value), "（", root.STWorkflowTools.typeNames[node.valueType || "any"], "）"];
    if (id === "list" || id === "record" || id === "json") return [id === "json" ? tr("workflow_ui_parse", "解析 ") : tr("workflow_ui_create", "创建 "), ...value(node.value), ...output(node.output)];
    if (id === "get") return [tr("workflow_ui_from", "从 "), ...value(node.value), tr("workflow_ui_read", " 读取 "), ...value(node.key), ...output(node.output)];
    if (id === "http-request") {
      const origin = flow.staticHttpOrigin(node.url);
      return [...(origin ? [tr("workflow_ui_to_label", "向 "), token(origin), tr("workflow_ui_send_label", " 发送 ")] : []),
        token(node.method), tr("workflow_ui_request", " 请求"), ...output(node.output)];
    }
    if (id === "tool-call") {
      const tool = editor.toolLibrary?.find(item => item.id === node.toolId);
      return [tool && node.toolMode === "registered" ? token(tool.name) : hint(id), ...output(node.output)];
    }
    if (id === "query-provider-data") {
      const provider = root.STAI.CHAT_TOOLS.find(item => item.id === node.provider);
      if (node.provider === root.STAI.STORE_SEARCH_TOOL_ID)
        return [token(tr(provider.label, provider.name)), " · ", ...value(node.filters), ...output(node.output)];
      return [token(provider ? tr(provider.label, provider.name) : tr("workflow_tool_provider", "数据来源")),
        " · AppID ", ...value(node.appId), ...output(node.output)];
    }
    if (id === "tool-return") return value(node.value);
    if (flow.definitions[id]) return [...(flow.definitions[id].fields.length ? [] : [hint(id)]), ...flow.definitions[id].fields.flatMap((field, index) => [index ? "，" : "", schemaLabel(field.label), " ", ...value(node[field.key], schemaChoices(field.choices || []))]), ...output(node.output)];
    if (id === "script") {
      const references = [...new Set(flow.inputs(node).filter(([path]) => path.startsWith("code.")).map(([, ref]) => ref.id))];
      return [tr("workflow_ui_run_javascript", "运行 JavaScript"), ...references.flatMap((id, index) => [index ? "、" : tr("workflow_ui_read_label", "，读取 "), variable(id)]), tr("workflow_ui_time_limit", "，超时 "), token(node.seconds), tr("workflow_ui_seconds_label", " 秒"), ...output(node.output)];
    }
    if (id === "wait") return [tr("workflow_ui_wait", "等待 "), ...value(node.seconds), tr("workflow_ui_seconds_then_continue", " 秒后继续执行")];
    if (id === "log") return [tr("workflow_ui_log", "打印日志（"), schemaLabel(model.NOTICE_TYPES[node.level]), "）：", ...value(node.value)];
    if (id === "comment") return [node.text || tr("workflow_ui_empty_note", "备注内容为空")];
    if (id === "raise") return [tr("workflow_ui_raise_an_exception", "抛出异常："), ...value(node.value)];
    throw new Error("未定义指令说明：" + id);
  }
  root.STWorkflowInstructions = Object.freeze({ catalog, categories, otherCategories, groups, hints, name, hint, schemaLabel, schemaChoices, key, iconAsset, icon, iconUrl, iconTone, commandIcon, choices, describe });
})(globalThis);
