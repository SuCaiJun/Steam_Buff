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
  if (api.ready) {
    return;
  }

  function clean(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function steamHost(host) {
    const name = clean(host).toLowerCase();
    return name === "store.steampowered.com"
      || name === "steamcommunity.com"
      || name === "help.steampowered.com"
      || name.endsWith(".steamcommunity.com")
      || name.endsWith(".steampowered.com");
  }

  function meta(title) {
    const text = clean(title);
    return text ? `\n\n## 上下文信息\n文档标题：${text}` : "";
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
      "1. 游戏、DLC、捆绑包、版本、平台名称优先使用目标语言中的官方译名；没有可靠官方译名时保留原文。",
      "2. Steam 功能和页面标签必须保持一致，例如成就、集换式卡牌、创意工坊、Steam Deck、云存档、远程同乐、家庭共享、直播、抢先体验、免费开玩、愿望单、鉴赏家、试玩版、Steam 输入、完全控制器支持、部分控制器支持等。",
      "3. 商店页面要保留最低配置、推荐配置、价格、折扣、标签、硬件型号和系统需求结构。",
      "4. 更新公告、补丁说明和更新日志要保留版本号、构建号和变更标题层级，例如新增、调整、修复、移除等。",
      "5. 社区内容要匹配原板块语气：讨论区可以自然口语，指南偏教学说明，评测保留个人表达，公告保持官方口吻。",
      "",
      protocol(),
      meta(ctx?.title),
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
      meta(ctx?.title),
    ].join("\n");
  }

  function system(ctx) {
    return steamHost(ctx?.host) ? steamSystem(ctx) : normalSystem(ctx);
  }

  function user(ctx) {
    const from = clean(ctx?.from) || "自动识别";
    const to = clean(ctx?.to) || "目标语言";
    return [
      `请将下面 JSON 数组从「${from}」翻译为「${to}」。`,
      "仅输出 JSON 字符串数组：",
      "",
      JSON.stringify(Array.isArray(ctx?.texts) ? ctx.texts : []),
    ].join("\n");
  }

  Object.assign(api, {
    ready: true,
    steamHost,
    system,
    user,
  });
})();
