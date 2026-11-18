/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置面板|保存提示
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const log = globalThis.STLoggerFactory?.createLogger?.("settings", "toast") || {
    info() {},
    warn() {},
  };

  function text(key, fallback) {
    return globalThis.STI18n.text(key, fallback);
  }

  function savePrompt(shadow) {
    const startedAt = Date.now();
    log.info("settings-save-prompt-open", "设置保存提示打开", {
      hasShadow: !!shadow,
    });
    return globalThis.STSettingsDialogs.notice(shadow, {
      title: text("settings.savePrompt.title", "保存成功"),
      message: text("common.saved", "设置已保存。"),
    }).then(() => {
      log.info("settings-save-prompt-close", "设置保存提示关闭", {
        durationMs: Date.now() - startedAt,
      });
    });
  }

  const api = Object.freeze({ savePrompt });
  globalThis.STSettingsToast = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
