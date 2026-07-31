/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 安装升级与赞助提示状态契约
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const DAY_MS = 24 * 60 * 60 * 1000;
  const api = Object.freeze({
    version: 1,
    startedAtKey: "steam_buff_engagement_started_at",
    installedVersionKey: "steam_buff_lifecycle_installed_version",
    supportDecisionKey: "steam_buff_support_prompt_decision",
    pendingUpdateKey: "steam_buff_post_update_prompt",
    dayMs: DAY_MS,
    isDecision(value) {
      return value?.action === "declined" || value?.action === "donate";
    },
    isDayElapsed(startedAt, now = Date.now()) {
      const started = Number(startedAt);
      return started > 0 && Number(now) - started >= DAY_MS;
    },
  });

  root.STLifecyclePromptContract = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
