/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 安装引导本地步骤与跨运行域纯校验契约
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  if (root.STOnboardingContract) return;

  const MAX_CLOUD_PAGE_COUNT = 20;
  const MESSAGES = Object.freeze({
    openLocalPage: "STEAM_BUFF_ONBOARDING_OPEN_LOCAL_PAGE",
    openSettings: "STEAM_BUFF_ONBOARDING_OPEN_SETTINGS",
  });
  const LOCAL_STEPS = Object.freeze([
    Object.freeze({ id: "account", title: "登录账号", copy: "登录素材君账号，也可以暂时跳过。", note: "未登录也可以使用本地功能。", nextLabel: "下一步" }),
    Object.freeze({ id: "client", title: "客户端增强", copy: "选择需要的功能，下一步保存。", note: "部分增强需要重启 Steam 后生效。", nextLabel: "保存并继续" }),
    Object.freeze({ id: "name-mode", title: "名称方案", copy: "按你的使用习惯，选择一种名称方案。", note: "以后可以在设置中心切换。", nextLabel: "保存并继续" }),
    Object.freeze({ id: "third-party", title: "价格数据", copy: "填入自己的 ITAD API Key，再测试连接。", note: "还没有密钥？可以稍后配置。", nextLabel: "保存并继续" }),
    Object.freeze({ id: "ai", title: "AI 服务", copy: "填写服务商提供的地址、模型和密钥。", note: "暂时不需要 AI？可以稍后配置。", nextLabel: "保存并继续" }),
    Object.freeze({ id: "complete", title: "一切就绪", copy: "看看这次保存的设置。", note: "需要调整时，打开 Steam Buff 设置中心。", nextLabel: "开始使用" }),
  ]);

  // 校验服务器允许发布的云端页数范围
  function validCloudPageCount(value) {
    return Number.isInteger(value) && value > 0 && value <= MAX_CLOUD_PAGE_COUNT;
  }

  // 从只含 pageCount 的 flow.json 对象读取云端页数
  function cloudPageCount(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
    const keys = Object.keys(value);
    return keys.length === 1 && keys[0] === "pageCount" && validCloudPageCount(value.pageCount)
      ? value.pageCount
      : 0;
  }

  // 严格读取 URL 中唯一的正整数全局页码
  function readPage(urlValue) {
    let url;
    try {
      url = new URL(String(urlValue || ""));
    } catch {
      return Object.freeze({ ok: false, error: "引导地址无法解析。" });
    }
    const values = url.searchParams.getAll("page");
    if (values.length === 0) {
      return Object.freeze({ ok: false, error: "引导地址缺少 page 参数。" });
    }
    if (values.length !== 1 || !/^[1-9]\d*$/.test(values[0])) {
      return Object.freeze({ ok: false, error: "地址中的 page 必须是单个正整数。" });
    }
    const page = Number(values[0]);
    return Number.isSafeInteger(page)
      ? Object.freeze({ ok: true, page })
      : Object.freeze({ ok: false, error: "地址中的 page 超出可解析范围。" });
  }

  // 计算云端页与固定本地页的总页数
  function totalPageCount(pageCount) {
    return validCloudPageCount(pageCount) ? pageCount + LOCAL_STEPS.length : 0;
  }

  // 把全局页码映射为本地步骤索引
  function localIndexForPage(page, pageCount) {
    if (!Number.isSafeInteger(page) || !validCloudPageCount(pageCount)) return -1;
    const index = page - pageCount - 1;
    return index >= 0 && index < LOCAL_STEPS.length ? index : -1;
  }

  // 把本地步骤索引映射为全局页码
  function pageForLocalIndex(index, pageCount) {
    return Number.isInteger(index) && index >= 0 && index < LOCAL_STEPS.length && validCloudPageCount(pageCount)
      ? pageCount + index + 1
      : 0;
  }

  root.STOnboardingContract = Object.freeze({
    LOCAL_STEPS,
    MESSAGES,
    MAX_CLOUD_PAGE_COUNT,
    validCloudPageCount,
    cloudPageCount,
    readPage,
    totalPageCount,
    localIndexForPage,
    pageForLocalIndex,
    localPageCount: () => LOCAL_STEPS.length,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
