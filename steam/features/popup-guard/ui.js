/*
 * @Author        : 顾青离
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
  let seq = 0;

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

  function release(el) {
    if (!el?.isConnected || !isSteamPopupCover(el)) {
      return;
    }

    // Steam 偶尔会留下透明全屏菜单遮罩；只在用户点过遮罩后兜底放行。
    el.dataset[MARK] = "1";
    styles?.applyStyles?.(el, { pointerEvents: "none" });
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
      release(el);
    }, WAIT_MS);
    handle = rt?.scope?.timer?.(key, timer);
  }

  function start(api, _feature, _context, scope) {
    if (!api.ctx?.isMainUi?.()) {
      return { started: false, reason: "not-main-ui" };
    }
    if (window[RT]) {
      return { started: false, reason: "already-started", stop: window[RT].stop };
    }

    const rt = {
      scope: scope || null,
      stop() {
        document.removeEventListener("pointerdown", onPointer, true);
        document.removeEventListener("mousedown", onPointer, true);
        if (window[RT] === rt) {
          window[RT] = null;
        }
      },
    };

    window[RT] = rt;
    scope?.listener?.("document-pointerdown", document, "pointerdown", onPointer, true);
    scope?.listener?.("document-mousedown", document, "mousedown", onPointer, true);
    return { started: true, stop: rt.stop };
  }

  window.SteamBuff.reg.addEntry(ID, "ui.js", start);
})();
