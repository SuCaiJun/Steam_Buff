/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 客户端功能入口
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.SteamBuff;
  const reg = api?.reg;
  const BOOT_MS = 500;
  const BOOT_WAIT_MS = 30000;
  const LOOP_MS = 5000;

  if (!api || !reg) {
    return;
  }

  if (api.runtime?.started) {
    return;
  }

  function log(level, event, message, meta = {}) {
    try {
      const entry = {
        domain: "steam",
        feature: "steam-runtime",
        event,
        message,
        meta,
      };
      if (level === "error") {
        window.STLogger?.error?.(entry);
      } else if (level === "warn") {
        window.STLogger?.warn?.(entry);
      } else {
        window.STLogger?.info?.(entry);
      }
    } catch {
    }
  }

  function summary(results) {
    const list = Array.isArray(results) ? results : [];
    return {
      total: list.length,
      started: list.filter(item => item.status === "started").length,
      skipped: list.filter(item => item.status === "skipped").length,
      failed: list.filter(item => item.status === "failed").length,
    };
  }

  async function run() {
    const results = await reg.start();
    const noted = results.filter((result) => result.status !== "skipped");
    if (noted.length) {
      api.runtime.results.push(...noted);
    }
    return results;
  }

  function hasCtx() {
    return (api.ctx?.contexts?.() || []).length > 0;
  }

  async function start() {
    api.runtime = {
      started: true,
      startedAt: Date.now(),
      results: [],
      status: "starting",
      timer: 0,
      waitingLogged: false,
      readyLogged: false,
    };
    log("info", "runtime-start", "Steam 客户端运行时开始启动", {
      route: api.ctx?.route?.() || "",
    });

    const bootUntil = Date.now() + BOOT_WAIT_MS;

    const later = (delay) => {
      api.runtime.timer = window.setTimeout(() => {
        tick().catch(() => {});
      }, delay);
    };

    const tick = async () => {
      if (!hasCtx()) {
        // 首次启动时 Steam 可能长时间不暴露 SharedJSContext/UI，不能永久放弃，只在启动窗口后降频等待。
        if (!api.runtime.waitingLogged) {
          api.runtime.waitingLogged = true;
          log("info", "runtime-waiting", "Steam 客户端运行时等待上下文就绪", {
            route: api.ctx?.route?.() || "",
            durationMs: Date.now() - api.runtime.startedAt,
          });
        }
        later(Date.now() < bootUntil ? BOOT_MS : LOOP_MS);
        return;
      }

      const results = await run();
      if (!api.runtime.loop) {
        api.runtime.loop = true;
        api.runtime.status = "running";
      }
      if (!api.runtime.readyLogged) {
        api.runtime.readyLogged = true;
        log("info", "runtime-ready", "Steam 客户端运行时已就绪", {
          route: api.ctx?.route?.() || "",
          contexts: api.ctx?.contexts?.() || [],
          ...summary(results),
          durationMs: Date.now() - api.runtime.startedAt,
        });
      }

      // Steam 客户端路由切换不会重新加载页面，常驻巡检用于补启动新路由的功能入口。
      later(LOOP_MS);
    };

    await tick();
  }

  start().catch(() => {});
})();
