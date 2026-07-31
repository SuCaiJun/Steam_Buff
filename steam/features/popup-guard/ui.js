/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 弹窗守卫界面
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const ID = "popup-guard";
  const RT = "__SteamBuffPopupGuard";
  const MARK = "steamBuffPopupBypass";
  const WAIT_MS = 150;
  const styles = window.SteamBuff?.styles;
  const log = window.STLoggerFactory.createLogger("steam", ID);
  let seq = 0;

  function rectMeta(el) {
    const rect = el?.getBoundingClientRect?.();
    if (!rect) {
      return null;
    }
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      visible: rect.width > 0 && rect.height > 0,
    };
  }

  function coverMeta(el, extra = {}) {
    return {
      inPopupTarget: !!el?.closest?.("#popup_target"),
      hasElementId: !!el?.id,
      rect: rectMeta(el),
      ...extra,
    };
  }

  function emptyFull(el) {
    if (!el || el.id || el.children.length || String(el.textContent || "").trim()) {
      return false;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width < window.innerWidth * 0.95 || rect.height < window.innerHeight * 0.95) {
      return false;
    }

    const style = window.getComputedStyle(el);
    return style.position === "fixed" &&
      style.pointerEvents !== "none" &&
      style.display !== "none" &&
      style.visibility !== "hidden";
  }

  function isSteamPopupCover(el) {
    return emptyFull(el) && !!el.closest("#popup_target");
  }

  function release(el, source) {
    if (!el?.isConnected || !isSteamPopupCover(el)) {
      return;
    }

    // Steam 偶尔会留下透明全屏菜单遮罩；只在用户点过遮罩后兜底放行。
    const alreadyReleased = el.dataset[MARK] === "1";
    el.dataset[MARK] = "1";
    if (styles?.applyStyles) {
      styles.applyStyles(el, { pointerEvents: "none" });
    } else {
      el.style.pointerEvents = "none";
      log.warn("popup-guard-style-helper-missing", "Steam 弹窗守卫缺少样式工具，已使用最小兜底", coverMeta(el));
    }
    if (!alreadyReleased) {
      const rt = window[RT];
      if (rt) {
        rt.releaseCount = (rt.releaseCount || 0) + 1;
      }
      log.info("popup-guard-overlay-release", "Steam 弹窗透明遮罩已释放", coverMeta(el, {
        source: source || "unknown",
        delayMs: WAIT_MS,
      }));
    }
  }

  function onPointer(event) {
    const el = event.target;
    if (!isSteamPopupCover(el)) {
      return;
    }

    const rt = window[RT];
    const key = `release-${seq += 1}`;
    let handle = null;
    const timer = window.setTimeout(() => {
      handle?.dispose?.();
      release(el, event.type);
    }, WAIT_MS);
    handle = rt?.scope?.timer?.(key, timer);
  }

  function start(api, _feature, _context, scope) {
    if (!api.ctx?.isMainUi?.()) {
      log.info("popup-guard-start-skipped", "Steam 弹窗守卫跳过非主界面", {
        reason: "not-main-ui",
      });
      return { started: false, reason: "not-main-ui" };
    }
    if (window[RT]) {
      log.info("popup-guard-start-skipped", "Steam 弹窗守卫已启动，跳过重复启动", {
        reason: "already-started",
      });
      return { started: false, reason: "already-started", stop: window[RT].stop };
    }

    const rt = {
      scope: scope || null,
      releaseCount: 0,
      stop() {
        document.removeEventListener("pointerdown", onPointer, true);
        document.removeEventListener("mousedown", onPointer, true);
        if (window[RT] === rt) {
          window[RT] = null;
        }
        log.info("popup-guard-stop", "Steam 弹窗守卫已停止", {
          releaseCount: rt.releaseCount || 0,
        });
      },
    };

    window[RT] = rt;
    const pointerHandle = scope?.listener?.("document-pointerdown", document, "pointerdown", onPointer, true);
    const mouseHandle = scope?.listener?.("document-mousedown", document, "mousedown", onPointer, true);
    if (!pointerHandle || !mouseHandle) {
      if (!pointerHandle) {
        document.addEventListener("pointerdown", onPointer, true);
      }
      if (!mouseHandle) {
        document.addEventListener("mousedown", onPointer, true);
      }
      log.warn("popup-guard-resource-scope-missing", "Steam 弹窗守卫缺少资源作用域，已使用直接监听兜底", {});
    }
    log.info("popup-guard-start-success", "Steam 弹窗守卫已启动", {
      hasResourceScope: !!scope,
      hasStyleHelper: !!styles?.applyStyles,
      delayMs: WAIT_MS,
    });
    return { started: true, stop: rt.stop };
  }

  window.SteamBuff.reg.addEntry(ID, "ui.js", start);
})();
