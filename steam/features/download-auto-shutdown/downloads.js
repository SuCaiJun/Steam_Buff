/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 下载页面自动关机交互
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const ID = "download-auto-shutdown";
  const LOG_PREFIX = "[Steam Buff]";
  const CH = "__steam_download_auto_shutdown_Ricky";
  const STYLE = "__Rickydownload-auto-shutdown-style";
  const ROOT = "__Rickydownload-auto-shutdown-root";
  const TOAST = "__Rickydownload-auto-shutdown-toast";
  const SYNC_MS = 1500;
  const RESP_MS = 8000;
  const RETRY_MS = 1000;
  const TOAST_MS = 4200;
  const MOUNT_LOG_MS = 60000;
  const ST = Object.freeze({
    READY: "backend-ready",
    OFF: "disabled-by-user",
    NO_WORK: "waiting-for-downloads",
    ARMED: "monitoring-ready",
    WAIT: "waiting-downloads",
    PAUSED: "waiting-paused-download",
    SHUT: "shutdown-started",
    FAIL: "shutdown-failed",
  });

  const rootState = window.SteamBuff.state = window.SteamBuff.state || {};
  const s = rootState[ID] = rootState[ID] || {};

  function now() {
    return Date.now();
  }

  function post(ch, msg) {
    try {
      ch?.postMessage({
        script: ID,
        time: now(),
        ...msg,
      });
    } catch {
    }
  }

  function chan() {
    if (s.ch) {
      return s.ch;
    }
    if (typeof BroadcastChannel !== "function") {
      return null;
    }
    s.ch = new BroadcastChannel(CH);
    return s.ch;
  }

  function log(level, event, message, meta = {}) {
    try {
      const entry = {
        domain: "steam",
        feature: ID,
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

  function rectMeta(el) {
    const rect = el?.getBoundingClientRect?.();
    if (!rect) {
      return null;
    }
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      visible: rect.width > 0 && rect.height > 0,
    };
  }

  function pageMeta(extra = {}) {
    return {
      route: window.SteamBuff?.ctx?.route?.() || window.tempNavStore?.m_locationPathname || "",
      title: document.title || "",
      innerWidth: Math.round(window.innerWidth || 0),
      innerHeight: Math.round(window.innerHeight || 0),
      devicePixelRatio: Number(window.devicePixelRatio) || 1,
      ...extra,
    };
  }

  function logMountState(key, level, event, message, meta = {}) {
    const at = now();
    const repeatMs = Number(meta.repeatMs) || 0;
    if (s.mountLogKey === key && (!repeatMs || at - (s.mountLogAt || 0) < repeatMs)) {
      return;
    }
    s.mountLogKey = key;
    s.mountLogAt = at;
    const { repeatMs: _repeatMs, ...cleanMeta } = meta;
    log(level, event, message, pageMeta(cleanMeta));
  }

  function css() {
    if (document.getElementById(STYLE)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE;
    style.textContent = `
      #${ROOT} {
        position: fixed;
        top: 99px;
        right: 57px;
        z-index: 999999;
        height: 28px;
        display: flex;
        align-items: center;
        font-family: Motiva Sans, Arial, Helvetica, sans-serif;
        color: #dfe3ea;
        pointer-events: auto;
      }
      #${ROOT}[hidden] {
        display: none !important;
      }
      #${ROOT} .sdas-toggle {
        position: relative;
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        height: 28px;
        padding: 0 10px;
        border: 1px solid rgba(110, 128, 150, 0.5);
        border-top: 0;
        background: rgba(26, 35, 46, 0.92);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
        cursor: pointer;
        user-select: none;
        white-space: nowrap;
      }
      #${ROOT} .sdas-toggle::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 1px;
        background: rgba(110, 128, 150, 0.5);
      }
      #${ROOT} .sdas-toggle:hover {
        border-color: rgba(104, 165, 218, 0.9);
        background: rgba(32, 47, 62, 0.96);
      }
      #${ROOT} .sdas-toggle:hover::before {
        background: rgba(104, 165, 218, 0.9);
      }
      #${ROOT} .sdas-toggle input {
        width: 14px;
        height: 14px;
        margin: 0;
        accent-color: #1a9fff;
      }
      #${ROOT} .sdas-label {
        font-size: 13px;
        line-height: 1;
      }
      #${TOAST} {
        position: fixed;
        top: 132px;
        right: 54px;
        z-index: 1000000;
        max-width: 360px;
        padding: 10px 12px;
        border: 1px solid rgba(104, 165, 218, 0.6);
        background: rgba(26, 35, 46, 0.98);
        color: #dfe3ea;
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.36);
        font-family: Motiva Sans, Arial, Helvetica, sans-serif;
        font-size: 13px;
        line-height: 1.35;
        opacity: 0;
        transform: translateY(-4px);
        transition: opacity 160ms ease, transform 160ms ease;
        pointer-events: none;
      }
      #${TOAST}.sdas-show {
        opacity: 1;
        transform: translateY(0);
      }
      #${TOAST}[data-kind="warn"] {
        border-color: rgba(227, 179, 65, 0.75);
      }
      #${TOAST}[data-kind="error"] {
        border-color: rgba(217, 79, 61, 0.8);
      }
      @media (max-width: 1250px) {
        #${ROOT} {
          top: 139px;
          right: 27px;
        }
        #${TOAST} {
          top: 172px;
          right: 24px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function toast(msg, kind = "info") {
    css();
    let el = document.getElementById(TOAST);
    if (!el) {
      el = document.createElement("div");
      el.id = TOAST;
      document.body.appendChild(el);
    }

    el.textContent = msg;
    el.dataset.kind = kind;
    el.classList.add("sdas-show");

    if (s.toastT) {
      window.clearTimeout(s.toastT);
    }
    s.toastT = window.setTimeout(() => {
      el.classList.remove("sdas-show");
    }, TOAST_MS);
  }

  function on(st) {
    return !!st?.on;
  }

  function mon(st) {
    return !!st?.mon;
  }

  function shut(st) {
    return !!st?.shut;
  }

  function text(st) {
    if (!st) {
      return "后台初始化中";
    }
    if (shut(st)) {
      return "下载已完成，正在关机";
    }
    switch (st.reason) {
      case ST.ARMED:
        return "已启用";
      case ST.WAIT:
        return "正在等待下载完成";
      case ST.PAUSED:
        return "下载已暂停，恢复并完成后关机";
      case ST.NO_WORK:
        return "等待下载任务开始";
      case ST.OFF:
        return "已关闭自动关机";
      case ST.SHUT:
        return "下载已完成，正在关机";
      case ST.FAIL:
        return "关机调用失败，查看日志";
      case ST.READY:
        return on(st) ? "已启用" : "下载完成后自动关机";
      default:
        return on(st) ? "已启用" : "下载完成后自动关机";
    }
  }

  function tip(st) {
    const rows = [`当前状态：${text(st)}`];
    const err = st?.error || st?.err;
    if (err) {
      const msg = String(err).replace(/^Error:\s*/, "");
      rows.push(`错误日志：${msg.startsWith(LOG_PREFIX) ? msg : `${LOG_PREFIX} ${msg}`}`);
    }
    return rows.join("\n");
  }

  function paint(el, st) {
    const input = el.querySelector("input");
    const label = el.querySelector(".sdas-label");
    const checked = on(st) || shut(st);

    input.checked = checked;
    label.textContent = "下载完成后关机";
    el.title = tip(st);

    if (shut(st)) {
      el.dataset.status = "shutdown";
    } else if (st?.reason === ST.FAIL) {
      el.dataset.status = "error";
    } else if (checked) {
      el.dataset.status = mon(st) ? "monitoring" : "waiting";
    } else {
      el.dataset.status = "off";
    }
  }

  function make(api, ch) {
    css();
    const el = document.createElement("div");
    el.id = ROOT;
    el.dataset.status = "off";
    el.innerHTML = `
      <label class="sdas-toggle">
        <input type="checkbox" aria-label="下载完成后自动关机">
        <span class="sdas-label">下载完成后关机</span>
      </label>
    `;

    const input = el.querySelector("input");
    input.addEventListener("change", () => {
      const rid = `${now()}-${Math.random().toString(16).slice(2)}`;
      s.rid = rid;
      s.sentAt = now();
      s.want = input.checked;
      post(ch, {
        type: "set-enabled",
        on: input.checked,
        rid,
      });
      toast(input.checked ? "正在检查下载任务..." : "已关闭自动关机");
      paint(el, {
        on: input.checked,
        mon: false,
        reason: input.checked ? ST.READY : ST.OFF,
      });
    });

    document.body.appendChild(el);
    logMountState(
      `mount-created:${window.SteamBuff?.ctx?.route?.() || ""}`,
      "info",
      "download-auto-shutdown-mount-success",
      "下载完成自动关机按钮已挂载",
      {
        rect: rectMeta(el),
        status: el.dataset.status || "",
      }
    );
    return el;
  }

  function main(api) {
    return api.ctx?.isMainUi?.() === true;
  }

  function cleanup() {
    document.getElementById(ROOT)?.remove();
    document.getElementById(TOAST)?.remove();
  }

  function isView() {
    return !!s.st?.show;
  }

  function render(api, ch) {
    if (!main(api)) {
      cleanup();
      logMountState(
        "mount-skipped:not-main-ui",
        "info",
        "download-auto-shutdown-mount-skipped",
        "下载完成自动关机按钮跳过非主界面"
      );
      return null;
    }
    const show = isView();
    let el = document.getElementById(ROOT);
    if (show && !el) {
      el = make(api, ch);
      paint(el, s.st);
    }
    if (el) {
      el.hidden = !show;
      if (show || s.lastShow) {
        logMountState(
          `mount-state:${show}:${el.dataset.status || ""}:${window.SteamBuff?.ctx?.route?.() || ""}`,
          "info",
          show ? "download-auto-shutdown-mount-visible" : "download-auto-shutdown-mount-hidden",
          show ? "下载完成自动关机按钮当前可见" : "下载完成自动关机按钮按路由隐藏",
          {
            status: el.dataset.status || "",
            backendReason: s.st?.reason || "",
            backendShow: !!s.st?.show,
            rect: rectMeta(el),
          }
        );
      }
    } else if (show) {
      logMountState(
        `mount-waiting:${window.SteamBuff?.ctx?.route?.() || ""}:${!!s.st}`,
        "info",
        "download-auto-shutdown-mount-waiting",
        "下载完成自动关机按钮等待后台状态",
        {
          hasBackendStatus: !!s.st,
          backendReason: s.st?.reason || "",
          backendShow: !!s.st?.show,
        }
      );
    }
    s.lastShow = show;
    return el;
  }

  function sync(api, ch) {
    if (!main(api)) {
      cleanup();
      return;
    }
    post(ch, { type: "frontend-hello" });
    render(api, ch);

    if (
      s.rid &&
      s.want === true &&
      now() - s.sentAt > RETRY_MS &&
      now() - s.sentAt < RESP_MS
    ) {
      post(ch, {
        type: "set-enabled",
        on: true,
        rid: s.rid,
      });
    }

    if (
      s.want === true &&
      s.rid &&
      now() - s.sentAt >= RESP_MS
    ) {
      const el = document.getElementById(ROOT);
      if (el) {
        paint(el, {
          on: false,
          reason: ST.FAIL,
          error: "后台 8 秒内没有响应，请检查下载关机后端是否已注入。",
        });
      }
      logMountState(
        `frontend-timeout:${s.rid}`,
        "error",
        "download-auto-shutdown-frontend-timeout",
        "下载完成自动关机前端等待后台响应超时",
        {
          rid: s.rid,
          elapsedMs: now() - s.sentAt,
        }
      );
      s.rid = "";
      s.sentAt = 0;
      s.want = false;
    }
  }

  function start(api) {
    if (s.fOn) {
      return { started: false, reason: "already-started" };
    }
    if (!main(api)) {
      cleanup();
      logMountState(
        "ui-start-skipped:not-main-ui",
        "info",
        "download-auto-shutdown-ui-start-skipped",
        "下载完成自动关机界面入口跳过非主界面"
      );
      return { started: false, reason: "not-main-ui" };
    }
    if (typeof document === "undefined" || !document.body) {
      logMountState(
        "ui-start-skipped:body-unavailable",
        "warn",
        "download-auto-shutdown-ui-start-skipped",
        "下载完成自动关机界面入口等待 document.body"
      );
      return { started: false, reason: "document-body-unavailable" };
    }

    const ch = chan();
    if (!ch) {
      logMountState(
        "ui-start-skipped:broadcast-channel-unavailable",
        "warn",
        "download-auto-shutdown-ui-start-skipped",
        "下载完成自动关机界面入口缺少 BroadcastChannel"
      );
      return { started: false, reason: "broadcast-channel-unavailable" };
    }

    s.fOn = true;
    s.st = null;
    logMountState(
      "ui-start",
      "info",
      "download-auto-shutdown-ui-start",
      "下载完成自动关机界面入口已启动"
    );
    s.stop = () => {
      if (s.syncI) {
        window.clearInterval(s.syncI);
        s.syncI = 0;
      }
      if (s.ch && typeof s.ch.close === "function") {
        s.ch.close();
        s.ch = null;
      }
      s.fOn = false;
    };

    ch.addEventListener("message", (event) => {
      const data = event.data || {};
      if (data.script !== ID || data.type !== "backend-status") {
        return;
      }
      s.st = data;
      const rid = data.rid;
      if (rid && rid === s.rid) {
        toast(text(data), data.reason === ST.FAIL ? "error" : "info");
        s.rid = "";
        s.sentAt = 0;
        s.want = false;
      }
      const el = render(api, ch);
      if (el) {
        paint(el, data);
      }
    });

    s.syncI = window.setInterval(() => {
      sync(api, ch);
    }, SYNC_MS);

    sync(api, ch);
    return { started: true };
  }

  window.SteamBuff.reg.addEntry(ID, "downloads.js", start);
})();
