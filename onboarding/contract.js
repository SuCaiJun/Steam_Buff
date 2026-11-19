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
    getLocale: "STEAM_BUFF_ONBOARDING_GET_LOCALE",
    setLocale: "STEAM_BUFF_ONBOARDING_SET_LOCALE",
    complete: "STEAM_BUFF_ONBOARDING_COMPLETE",
    openSettings: "STEAM_BUFF_ONBOARDING_OPEN_SETTINGS",
  });
  function localizedSteps(text) {
    return Object.freeze([
      Object.freeze({
        id: "account",
        title: text("onboarding_signIn", "登录账号"),
        copy: text("onboarding_accountStepCopy", "登录素材君账号，也可暂时跳过。"),
        note: text("onboarding_guestAccessHint", "未登录也可使用大部分功能。"),
        nextLabel: text("onboarding_next", "下一步"),
      }),
      Object.freeze({
        id: "client",
        title: text("settings_category_client_name", "客户端增强"),
        copy: text("onboarding_chooseFeaturesAndSave", "选择需要的功能，下一步保存。"),
        note: text("onboarding_restartSomeFeatures", "部分增强需要重启 Steam 后生效。"),
        nextLabel: text("onboarding_saveAndContinue", "保存并继续"),
      }),
      Object.freeze({
        id: "name-mode",
        title: text("onboarding_namingMethod", "名称方案"),
        copy: text("onboarding_namingStepCopy", "按你的使用习惯，选择一种名称方案。"),
        note: text("onboarding_changeLaterInSettings", "以后可以在设置中心切换。"),
        nextLabel: text("onboarding_saveAndContinue", "保存并继续"),
      }),
      Object.freeze({
        id: "third-party",
        title: text("onboarding_priceData", "价格数据"),
        copy: text("onboarding_enterItadKeyAndTest", "填入自己的 ITAD API Key，再测试连接。"),
        note: text("onboarding_deferPriceSetup", "还没有密钥？可以稍后配置。"),
        nextLabel: text("onboarding_saveAndContinue", "保存并继续"),
      }),
      Object.freeze({
        id: "ai",
        title: text("onboarding_aiServices", "AI 服务"),
        copy: text("onboarding_enterAiCredentials", "填写服务商提供的地址、模型和密钥。"),
        note: text("onboarding_deferAiSetup", "暂时不需要 AI？可以稍后配置。"),
        nextLabel: text("onboarding_saveAndContinue", "保存并继续"),
      }),
      Object.freeze({
        id: "complete",
        title: text("onboarding_allSet", "一切就绪"),
        copy: text("onboarding_reviewSavedSettings", "看看这次保存的设置。"),
        note: text("onboarding_openSettingsToModify", "需要调整时，打开 Steam Buff 设置中心。"),
        nextLabel: text("onboarding_getStarted", "开始使用"),
      }),
    ]);
  }
  const LOCAL_STEPS = localizedSteps((_key, source) => source);

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
    localizedSteps,
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
