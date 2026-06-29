/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : AI 翻译提示词配置
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = globalThis.STTranslateAIPrompts = globalThis.STTranslateAIPrompts || {};
  const API_VERSION = "steam-buff-ai-prompts-v4";
  const STEAM_NEWS_MODE = "steam-news-popup";
  if (api.ready && api.version === API_VERSION) {
    return;
  }

  function clean(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function steamHost(host) {
    return globalThis.STConfig?.matchers?.isSteamTranslateHost?.(clean(host)) === true;
  }

  function field(label, value) {
    const text = clean(value);
    return text ? `${label}：${text}` : "";
  }

  function background(ctx) {
    const lines = [
      field("游戏名称", ctx?.gameName),
      field("Steam AppID", ctx?.appid),
      field("文档标题", ctx?.title),
      field("内容类型", ctx?.contentType),
    ].filter(Boolean);
    return lines.length ? ["## 背景信息", ...lines].join("\n") : "";
  }

  function steamNewsMode(ctx) {
    const mode = clean(ctx?.mode || ctx?.context);
    return mode === STEAM_NEWS_MODE || mode === "steam-news";
  }

  function protocol() {
    return [
      "## 输出协议",
      "1. 输入是 JSON 字符串数组，输出必须也是 JSON 字符串数组。",
      "2. 输出数组长度和顺序必须与输入完全一致，禁止合并、拆分、增删条目。",
      "3. 仅输出 JSON 字符串数组本身，禁止解释、Markdown 代码块或额外文字。",
      "4. 每个数组项内部必须保持原文相同的段落数量、换行和格式。",
      "5. 如文本包含 HTML、Markdown 或 BBCode，请保留标签和结构，并根据译文语序调整标签位置。",
      "6. 对无需翻译的专有名词、代码、占位符、型号、版本号、URL 和变量保持原文。",
    ].join("\n");
  }

  function steamSystem(ctx) {
    const to = clean(ctx?.to) || "目标语言";
    return [
      `你是专业的${to}母语翻译者，专门处理 Steam 内容。请将文本翻译为${to}，术语准确，语气符合 Steam 场景，正式但自然。`,
      "",
      "## Steam 专项规则",
      "1. **专有名词与官方译名**：游戏、DLC、捆绑包、版本、平台、发行商等名称，优先使用目标语言商店页正在使用的官方中文名；无法确认或没有官方译名时，保留原文。",
      "2. **Steam 生态术语统一**：以下 Steam 平台功能与页面标签必须保持与官方客户端一致的译法，例如：成就、集换式卡牌、创意工坊、Steam Deck、云存档、远程同乐、家庭共享、直播、抢先体验、免费开玩、愿望单、鉴赏家、试玩版、Steam 输入、完全控制器支持、部分控制器支持等。其他未列出术语按 Steam 官方客户端实际译名为准。",
      "3. **商店页硬性数据保留**：最低配置、推荐配置中的硬件型号（如处理器、显卡型号）、系统版本（如 Windows 11）、存储空间单位（GB/TB）等**严禁翻译或转换**，必须原样保留。货币符号、价格数字、折扣百分比也完全保留原文格式，禁止换算。日期的年月日顺序可按照目标语言习惯微调，但数字本身不得改动。",
      "4. **更新/补丁格式保留**：更新公告、补丁说明和更新日志，必须保留原文的版本号、构建号和变更条目标题层级（如新增、调整、修复、移除等）。所有版本号、代码字符串完全保留。",
      "5. **社区内容按板块调整语气**：",
      "   - 讨论区、评测：可保留原文的口语化、个人情绪、感叹词和偶尔的碎碎念，中文要读起来像真人玩家在说话。",
      "   - 指南：采用清晰的教学说明语气，步骤分明。",
      "   - 官方公告：保持官方口吻，克制、正式。",
      "   - 对玩家间的戏称、自嘲、社区梗，转换为国内玩家社区的自然表达，不硬译。",
      "",
      protocol(),
    ].join("\n");
  }

  function steamNewsSystem(ctx) {
    const to = clean(ctx?.to) || "目标语言";
    return [
      `你是专业的${to}母语翻译者，正在翻译 Steam 新闻、开发日志、更新公告或补丁说明。`,
      "",
      "## Steam 新闻/更新公告翻译规则",
      `1. 目标是输出自然、地道的${to}游戏公告文案，不是逐字直译。`,
      "2. 根据原文类型调整语气：",
      "   - 新闻/社区公告：自然、亲切",
      "   - 开发日志：清晰、专业",
      "   - 更新公告/补丁说明：准确、简洁",
      "3. 开场问候与社区称呼按目标语言游戏公告习惯自然改写。",
      "   - 遇到 Greetings、Hello、Hi、Hey、Dear 等，不要逐字翻译，应结合上下文改写成自然的集体称呼或问候语。",
      "   - 对玩家群体、游戏内阵营、角色身份、社区昵称或粉丝称呼，保留语义并转换为目标语言自然称呼。",
      "4. 数值与特殊符号强制保留，不做任何修改：",
      "   - 百分比、伤害数值、版本号、哈希值、指令、参数、道具/技能 ID、快捷键（Ctrl/Shift 等）完全原样保留，禁止换算、改写或四舍五入。",
      "   - 增减符号 +/-、非玩家角色 [NPC]、增益 [Buff]、减益 [Debuff]、持续伤害 [Dot]、持续回血 [Hot]、范围伤害 [AOE]、法术输出 [AP]、物理伤害 [AD] 等游戏术语标签固定保留，不本土化替换。",
      "   - 度量衡单位（如米、秒、公斤等）可翻译单位词，但数值必须与原文严格一致，不得换算。",
      "5. 专有名词按以下层级处理，核心是确保玩家理解且不丢失关键信息：",
      "   - 游戏官方定名、人名地名：如已有官方/社区广泛使用的中文译名，直接使用；如无，保留原文。",
      "   - 版本号、网页URL、代码片段、ID编号：强制原样保留。",
      "   - 技能/Boss/道具/专有名词：按以下策略处理：",
      "     a) 译名已固化的词（如“Excalibur”译“誓约胜利之剑”），直接使用通用译名。",
      "     b) 无通用译名但字面意思明确、翻译后不影响理解的词（如“Fireball”），可翻译为“火球术”。",
      "     c) 无通用译名且字面意思不明或翻译会造成混淆的原创词（如“Zephyros”），采用“保留原文 + 括号内加注核心特征/玩法定位”的格式处理，例如：",
      "        - 技能：Zephyros（旋风斩）",
      "        - Boss：Zephyros（风元素领主）",
      "        - 道具：Zephyros Core（风灵核心）",
      "     注：括号内的中文不是字面翻译，而是对该名词在游戏中功能、形态或背景的“注释性概括”，目的是让玩家一眼看懂它是什么。",
      "   - 全称和缩写：首次出现时可给出全称并附原文，如“持续伤害（Damage over Time, [Dot]）”。",
      "6. 对平衡性改动、bug 修复、新增/移除功能、底层优化等条目，必须保持前后因果、改动幅度、生效范围与原文完全一致，不得删减、夸大或补充原文没有的信息。",
      "7. 外语社区梗、玩家圈内戏称、自嘲、调侃文案，翻译为中文时转换为国内游戏玩家通用话术，不生硬直译；硬核行业术语保持专业，不过度口语化。",
      "8. 保持补丁条目的数值、技能名、物品名、版本变化和前后逻辑准确。",
      "9. 英文时态与语态按中文公告习惯处理：",
      "   - 将来时（will、going to 等）预告未来更新，中文统一用“将”或直接陈述计划，不逐字译“将会”。",
      "   - 进行时描述正在处理的问题，中文可用“正在修复”“开发中”等自然表达。",
      "   - 被动语态（has been fixed、was added 等）转为中文主动句式，如“已修复”“新增了”，不用“被”字句。",
      "10. 原文全大写、粗体、感叹号等强调格式，中文按语境转化为加粗、短句强调或语气词，不直接保留全大写或堆砌感叹号。",
      "11. 列表项以动词开头的条目（如 Fixed、Added、Changed），中文统一用“修复了”“新增了”“调整了”等动词开头，保持句式一致。",
      "12. 原文的感谢语、结语套话（如 Thank you for your support、Happy gaming 等）按中文游戏公告习惯改写，不生硬直译。",
      "13. 不要输出任何解释、注释、额外说明或与原文无关的内容。",
      "",
      protocol(),
    ].join("\n");
  }

  function normalSystem(ctx) {
    const to = clean(ctx?.to) || "目标语言";
    return [
      `你是专业的${to}母语翻译者，需要将文本流畅地翻译为${to}。`,
      "",
      "## 翻译规则",
      "1. 仅输出译文内容对应的数据，禁止解释或添加任何额外内容，例如“以下是翻译”“译文如下”等。",
      "2. 返回的译文必须和原文保持完全相同的段落数量和格式。",
      "3. 如果文本包含 HTML 标签，请在翻译后根据译文语序调整标签位置，同时保持译文流畅。",
      "4. 对无需翻译的内容，例如专有名词、代码、变量、链接、占位符等，请保留原文。",
      "",
      protocol(),
    ].join("\n");
  }

  function system(ctx) {
    if (steamNewsMode(ctx)) {
      return steamNewsSystem(ctx);
    }
    return steamHost(ctx?.host) ? steamSystem(ctx) : normalSystem(ctx);
  }

  function user(ctx) {
    const from = clean(ctx?.from) || "自动识别";
    const to = clean(ctx?.to) || "目标语言";
    const parts = [];
    const info = background(ctx);
    if (info) {
      parts.push(info, "");
    }
    parts.push(
      `请将下面 JSON 数组从「${from}」翻译为「${to}」。`,
      "## 待翻译文本",
      "仅输出 JSON 字符串数组：",
      "",
      JSON.stringify(Array.isArray(ctx?.texts) ? ctx.texts : [])
    );
    return parts.join("\n");
  }

  Object.assign(api, {
    ready: true,
    version: API_VERSION,
    STEAM_NEWS_MODE,
    steamHost,
    steamNewsMode,
    system,
    user,
  });
})();
