/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 统一错误边界
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const VERSION = "2026-06-15-p6-error-boundary";

  if (root.STErrorBoundary?.version === VERSION) {
    return;
  }

  function text(value, fallback = "") {
    const out = String(value || "").trim();
    return out || fallback;
  }

  function friendlyMessage(error, fallback = "功能暂时不可用，请稍后重试") {
    const message = text(error?.message || error);
    const code = text(error?.code).toUpperCase();
    if (/NETWORK|FETCH|TIMEOUT|ABORT/u.test(code) || /fetch|network|timeout|超时|网络/iu.test(message)) {
      return "网络请求失败，请检查连接后重试";
    }
    if (/PARSE|JSON/u.test(code) || /JSON|parse|解析/iu.test(message)) {
      return "数据解析失败，请稍后重试";
    }
    if (Number(error?.status || error?.statusCode) >= 500) {
      return "服务器暂时不可用，请稍后重试";
    }
    return fallback;
  }

  function loggerFor(context = {}) {
    return root.STLoggerFactory?.createLogger?.(
      text(context.domain, "shared"),
      text(context.feature, "error-boundary")
    );
  }

  /**
   * 捕获错误并写入脱敏诊断日志。
   * @param {Error|unknown} error - 原始异常。
   * @param {Object} context - domain/feature/phase/meta 等上下文。
   * @returns {Object} 友好的错误摘要。
   */
  function capture(error, context = {}) {
    const domain = text(context.domain, "shared");
    const feature = text(context.feature, "error-boundary");
    const event = text(context.event, "error-boundary-caught");
    const message = text(context.message, "运行时错误已隔离");
    const userMessage = text(context.userMessage, friendlyMessage(error));
    const meta = {
      phase: text(context.phase, "runtime"),
      userMessage,
      ...(context.meta && typeof context.meta === "object" ? context.meta : {}),
    };

    const log = loggerFor({ domain, feature });
    log?.error?.(event, message, {
      ...meta,
      error,
    });
    root.STRuntime?.current?.()?.markError?.(event, error, {
      domain,
      feature,
      phase: meta.phase,
    });

    return Object.freeze({
      ok: false,
      domain,
      feature,
      event,
      message: userMessage,
    });
  }

  /**
   * 用错误边界执行函数，失败时返回 fallback，避免拖垮 runtime。
   * @param {Function} fn - 要执行的函数。
   * @param {Object} context - 错误上下文。
   * @returns {Promise<*>} 执行结果或 fallback。
   */
  async function run(fn, context = {}) {
    try {
      return await fn();
    } catch (error) {
      capture(error, context);
      if (context.rethrow === true) {
        throw error;
      }
      return Object.prototype.hasOwnProperty.call(context, "fallback") ? context.fallback : null;
    }
  }

  /**
   * 返回带错误边界的函数。
   * @param {Function} fn - 要包裹的函数。
   * @param {Object} context - 错误上下文。
   * @returns {Function} 安全函数。
   */
  function wrap(fn, context = {}) {
    return function wrappedErrorBoundary(...args) {
      return run(() => fn.apply(this, args), context);
    };
  }

  root.STErrorBoundary = Object.freeze({
    version: VERSION,
    capture,
    run,
    wrap,
    withErrorBoundary: wrap,
    friendlyMessage,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
