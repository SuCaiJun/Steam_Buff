/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 模态弹窗焦点、Tab 约束与 Escape 关闭
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

// 只负责焦点进出和键盘约束。各页面自己画内容，不把设置弹窗整份搬到 Steam
(() => {
  "use strict";

  if (globalThis.STDialogLifecycle?.ready) {
    return;
  }

  function focus(element) {
    if (!element || typeof element.focus !== "function") {
      return false;
    }
    try {
      element.focus({ preventScroll: true });
    } catch {
      element.focus();
    }
    return true;
  }

  function controls(layer) {
    if (!layer?.querySelectorAll) {
      return [];
    }
    return Array.from(layer.querySelectorAll("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])"))
      .filter((element) => !element.hidden && element.getAttribute?.("hidden") == null && (typeof element.getClientRects !== "function" || element.getClientRects().length > 0));
  }

  function trapTab(layer, event) {
    if (event.key !== "Tab") {
      return;
    }
    const items = controls(layer);
    if (!items.length) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (event.target === first || !layer.contains(event.target))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (event.target === last || !layer.contains(event.target))) {
      event.preventDefault();
      first.focus();
    }
  }

  function inside(root, event) {
    if (!root) {
      return false;
    }
    if (root.contains?.(event.target)) {
      return true;
    }
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    return path.includes(root);
  }

  function holdBackground(root) {
    const parent = root?.parentElement;
    if (!parent) {
      return () => {};
    }
    const changed = [];
    for (const child of parent.children) {
      if (child === root || !("inert" in child) || child.inert) {
        continue;
      }
      child.inert = true;
      changed.push(child);
    }
    return () => {
      for (const child of changed) {
        child.inert = false;
      }
    };
  }

  function open(options = {}) {
    const root = options.root;
    const trap = options.trap || root;
    const restore = options.restore || globalThis.document?.activeElement || null;
    let closed = false;
    const releaseBackground = holdBackground(root);
    const onKey = (event) => {
      if (closed) {
        return;
      }
      trapTab(trap, event);
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        options.onEscape?.();
      }
    };
    const onFocusIn = (event) => {
      if (closed || inside(root, event)) {
        return;
      }
      focus(typeof options.initial === "function" ? options.initial() : options.initial);
    };
    root?.addEventListener?.("keydown", onKey);
    globalThis.document?.addEventListener?.("focusin", onFocusIn, true);
    const focusInitial = () => {
      if (closed) {
        return;
      }
      const target = typeof options.initial === "function" ? options.initial() : options.initial;
      if (!focus(target)) {
        focus(root);
      }
    };
    return {
      focusInitial,
      close() {
        if (closed) {
          return;
        }
        closed = true;
        root?.removeEventListener?.("keydown", onKey);
        globalThis.document?.removeEventListener?.("focusin", onFocusIn, true);
        releaseBackground();
        focus(restore);
      },
    };
  }

  globalThis.STDialogLifecycle = Object.freeze({
    ready: true,
    focus,
    controls,
    trapTab,
    open,
  });
})();
