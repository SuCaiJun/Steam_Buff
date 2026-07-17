/*
 * @Author        : 顾青离
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
    Object.freeze({ id: "account", title: "登录账号", copy: "登录不是必需，可直接进入下一步。", note: "感谢使用Steam Buff", nextLabel: "下一步" }),
    Object.freeze({ id: "client", title: "客户端增强", copy: "设置将在完成引导时保存。", note: "感谢使用Steam Buff", nextLabel: "下一步" }),
    Object.freeze({ id: "complete", title: "完成", copy: "确认摘要后即可开始使用。", note: "感谢使用Steam Buff", nextLabel: "开始使用" }),
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
