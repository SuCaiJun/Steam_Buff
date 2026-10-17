/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 后台网络请求超时作用域
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  function timeoutError(timeoutMs) {
    const error = new Error(`请求超时（${Math.round(timeoutMs)}ms）`);
    error.name = "TimeoutError";
    return error;
  }

  async function run(timeoutMs, consume, parentSignal) {
    const timeout = Number(timeoutMs);
    const bounded = Number.isFinite(timeout) && timeout > 0;
    const deadline = bounded ? root.performance.now() + timeout : Infinity;
    const controller = new AbortController();
    const abort = () => controller.abort(parentSignal.reason);
    const check = () => {
      if (!controller.signal.aborted && root.performance.now() >= deadline) {
        controller.abort(timeoutError(timeout));
      }
      if (controller.signal.aborted) throw controller.signal.reason;
    };
    if (parentSignal?.aborted) abort();
    else parentSignal?.addEventListener("abort", abort, { once: true });
    const timer = bounded ? root.setTimeout(() => controller.abort(timeoutError(timeout)), timeout) : 0;
    try {
      check();
      const result = await consume(controller.signal, check);
      // 同步解析会阻止定时器执行，返回成功前必须再次核对截止时间。
      check();
      return result;
    } catch (error) {
      // 原生正文读取可能只抛 AbortError，业务层仍须区分超时和用户取消。
      if (controller.signal.aborted) throw controller.signal.reason;
      throw error;
    } finally {
      if (timer) root.clearTimeout(timer);
      parentSignal?.removeEventListener("abort", abort);
    }
  }

  root.STNetworkRequest = Object.freeze({ run, timeoutError });
})(globalThis);
