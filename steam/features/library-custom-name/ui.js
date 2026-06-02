/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 库游戏自定义名称界面
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const ID = "library-custom-name";
  const CH = "__steam_library_custom_name_Ricky";
  const STYLE = "__RickyLibraryCustomNameStyle";
  const BAR = "__RickyLibraryCustomNameBar";
  const ONE = "__RickyLibraryCustomNameOne";
  const MODAL = "__RickyLibraryCustomNameModal";
  const PROGRESS = "__RickyLibraryCustomNameProgress";
  const REQ_ATTR = "data-steam-buff-name-request";
  const RES_ATTR = "data-steam-buff-name-response";
  const LOOP_MS = 1200;
  const RESP_MS = 12000;
  const QUERY_MAX = 100;
  const BATCH_PAGE_SIZE = 120;
  const BACKEND_PAGE_SIZE = 1000;
  const APP_SCAN_YIELD = 2000;
  const CLOUD_UPLOAD_MAX = 100;
  const CLOUD_TIP_TEXT = "将本次手动修改的自定义排序名称同步到素材君社区，帮助更多玩家获得更准确的名称建议。";
  const CLOUD_CANCEL_TEXT = "云端共享可以帮助更多玩家获得更准确的自定义名称建议。本次保存将只写入本地 Steam 库，不再同步到素材君社区，确认关闭吗？";
  const CLOUD_TAG_RE = /\[[^\]\r\n]*\]\s*/g;
  const PINYIN_LIB = "vendor/pinyin-pro/index.js";
  const MNEMONIC_CORE = "steam/features/library-custom-name/mnemonic.js";

  const root = window.SteamBuff.state = window.SteamBuff.state || {};
  const s = root[ID] = root[ID] || {};
  const pend = new Map();
  const qpend = new Map();
  const batch = {
    policy: "hide",
    types: {
      game: true,
      software: false,
      tool: false,
      other: false,
    },
    mnemonic: false,
    uploadCloud: true,
    localRows: [],
    cloudMap: new Map(),
    stateMap: new Map(),
    rows: [],
    rowMap: new Map(),
    page: 1,
    writeCount: 0,
    cloudQueue: [],
    cloudFlush: null,
    cloudFinishing: false,
    stats: emptyStats(),
    busy: false,
    saving: false,
    paused: false,
    waitCmd: "",
    // 本地加载和云端获取可能跨多次异步请求，关闭弹窗后用序号让旧结果失效，避免回头重绘。
    previewSeq: 0,
    summary: false,
    progressClosed: false,
    progressRenderAt: 0,
    progressTimer: 0,
    message: "等待查询",
  };

  function now() {
    return Date.now();
  }

  function rid() {
    return `${now()}-${Math.random().toString(16).slice(2)}`;
  }

  function text(value) {
    return String(value || "").trim();
  }

  function esc(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
  }

  function attr(value) {
    return esc(value)
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function assetUrl(path) {
    return window.SteamBuff?.path?.url ? window.SteamBuff.path.url(path) : path;
  }

  function emptyStats() {
    return {
      total: 0,
      processed: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      uploadOk: 0,
      uploadFail: 0,
      cloudOk: 0,
      cloudFail: 0,
      cloudSkipped: 0,
      cloudPending: 0,
    };
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

  function statsMeta() {
    return {
      total: batch.stats.total,
      processed: batch.stats.processed,
      success: batch.stats.success,
      failed: batch.stats.failed,
      skipped: batch.stats.skipped,
      cloudOk: batch.stats.cloudOk,
      cloudFail: batch.stats.cloudFail,
      cloudSkipped: batch.stats.cloudSkipped,
    };
  }

  function logCommandStart(action) {
    log("info", "library-custom-name-command-start", "库自定义名称保存队列命令已触发", {
      action,
      saving: !!batch.saving,
      paused: !!batch.paused,
      waitCmd: batch.waitCmd || "",
      ...statsMeta(),
    });
  }

  function yieldUI() {
    return new Promise((resolve) => {
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => resolve());
      } else {
        window.setTimeout(resolve, 0);
      }
    });
  }

  function chan() {
    if (s.ch) {
      return s.ch;
    }
    if (typeof BroadcastChannel !== "function") {
      return null;
    }
    s.ch = new BroadcastChannel(CH);
    s.ch.addEventListener("message", onBackend);
    return s.ch;
  }

  function backend(type, data) {
    const ch = chan();
    if (!ch) {
      return Promise.reject(new Error("通信通道不可用"));
    }
    const id = rid();
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        pend.delete(id);
        reject(new Error("Steam 客户端后端没有响应"));
      }, RESP_MS);
      pend.set(id, { resolve, reject, timer });
      ch.postMessage({
        script: ID,
        side: "ui",
        type,
        rid: id,
        ...data,
      });
    });
  }

  function onBackend(event) {
    const data = event.data || {};
    if (data.script !== ID || data.side !== "backend") {
      return;
    }

    if (data.type === "save-progress" || data.type === "save-done") {
      if (!batch.cancelled) {
        applyProgress(data);
      }
      return;
    }

    const wait = pend.get(data.rid);
    if (!wait) {
      return;
    }
    window.clearTimeout(wait.timer);
    pend.delete(data.rid);
    if (data.ok === false) {
      wait.reject(new Error(data.error || "操作失败"));
    } else {
      wait.resolve(data);
    }
  }

  // 云端名称查询不能在 Steam 主上下文里直接调用 chrome API，必须通过 content.js 的 DOM 属性桥接转发。
  function contentReq(type, data) {
    const id = rid();
    const msg = {
      script: ID,
      side: "page",
      type,
      rid: id,
      ...data,
    };
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        qpend.delete(id);
        reject(new Error("云端名称接口没有响应"));
      }, RESP_MS);
      qpend.set(id, { resolve, reject, timer });
      try {
        document.documentElement?.setAttribute(REQ_ATTR, JSON.stringify(msg));
      } catch {
      }
    });
  }

  function queryNames(appids) {
    const ids = Array.isArray(appids) ? appids : [appids];
    return contentReq("query", { appids: ids });
  }

  function feedback(data) {
    return contentReq("feedback", data);
  }

  function settings() {
    const raw = document.documentElement?.dataset?.steamBuffSettings || "{}";
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }

  function settingOn(id) {
    return settings()[id] !== false;
  }

  function offMsg(st) {
    return "库自定义名称填充已关闭";
  }

  function ensureOn() {
    const st = {
      enabled: settingOn(ID),
      nameOn: settingOn(ID),
    };
    if (!st.enabled) {
      throw new Error(offMsg(st));
    }
    return st;
  }

  // content.js 会把查询/反馈结果写回属性，MutationObserver 可能重复触发，rid 用于只结算对应请求。
  function onQuery(event) {
    if (event && event.attributeName && event.attributeName !== RES_ATTR) {
      return;
    }

    let data = {};
    try {
      data = JSON.parse(document.documentElement?.getAttribute(RES_ATTR) || "{}");
    } catch {
      data = {};
    }
    if (data.script !== ID || data.side !== "content" || (data.type !== "query-result" && data.type !== "feedback-result")) {
      return;
    }
    const wait = qpend.get(data.rid);
    if (!wait) {
      return;
    }
    window.clearTimeout(wait.timer);
    qpend.delete(data.rid);
    if (data.type === "feedback-result") {
      wait.resolve(data.data || {});
    } else if (data.ok === false) {
      wait.reject(new Error(data.error || "查询失败"));
    } else {
      wait.resolve(data.data || {});
    }
  }

  function currentAppid() {
    const route = window.SteamBuff?.ctx?.route?.() || window.tempNavStore?.m_locationPathname || "";
    const match = String(route).match(/\/library\/app\/(\d+)/);
    if (match) {
      return Number(match[1]) || 0;
    }
    const href = String(window.location.href || "");
    const urlMatch = href.match(/[?&]appid=(\d+)/) || href.match(/\/app\/(\d+)/);
    return urlMatch ? Number(urlMatch[1]) || 0 : 0;
  }

  function css() {
    let style = document.getElementById(STYLE);
    if (style) {
      return;
    }
    style = document.createElement("style");
    style.id = STYLE;
    style.textContent = `
      #${BAR} {
        display: flex;
        gap: 8px;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: nowrap;
        width: 100%;
        box-sizing: border-box;
        margin: 10px 0 0;
        padding: 0;
      }
      #${BAR}[hidden] {
        display: none;
      }
      #${BAR} .st-lcn-btn,
      #${ONE} .st-lcn-btn,
      #${MODAL} .st-lcn-btn,
      #${PROGRESS} .st-lcn-btn {
        min-height: 30px;
        border: 1px solid #417a9b;
        border-radius: 2px;
        padding: 0 12px;
        color: #fff;
        background: #26566c;
        cursor: pointer;
        font-size: 12px;
        white-space: nowrap;
      }
      #${BAR} .st-lcn-btn:hover:not(:disabled),
      #${ONE} .st-lcn-btn:hover:not(:disabled),
      #${MODAL} .st-lcn-btn:hover:not(:disabled),
      #${PROGRESS} .st-lcn-btn:hover:not(:disabled) {
        background: #316f8c;
      }
      #${ONE} .st-lcn-btn.primary,
      #${MODAL} .st-lcn-btn.primary,
      #${PROGRESS} .st-lcn-btn.primary {
        background: linear-gradient(90deg, #06bfff 0%, #2d89ff 100%);
        border-color: rgba(102, 192, 244, .65);
      }
      #${MODAL} .st-lcn-btn.danger,
      #${PROGRESS} .st-lcn-btn.danger {
        border-color: rgba(255, 91, 91, .5);
        background: rgba(155, 45, 45, .78);
      }
      #${PROGRESS} .st-lcn-btn.success {
        border-color: rgba(91, 210, 122, .55);
        background: rgba(48, 142, 74, .86);
      }
      #${PROGRESS} .st-lcn-btn.success:hover:not(:disabled) {
        background: rgba(59, 168, 88, .96);
      }
      #${PROGRESS} .st-lcn-btn.danger:hover:not(:disabled) {
        background: rgba(180, 54, 54, .9);
      }
      #${PROGRESS} .st-lcn-spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255, 255, 255, .35);
        border-top-color: #fff;
        border-radius: 50%;
        animation: st-lcn-spin .75s linear infinite;
        vertical-align: -2px;
      }
      @keyframes st-lcn-spin {
        to {
          transform: rotate(360deg);
        }
      }
      #${BAR} .st-lcn-btn:disabled,
      #${ONE} .st-lcn-btn:disabled,
      #${MODAL} .st-lcn-btn:disabled,
      #${PROGRESS} .st-lcn-btn:disabled {
        color: #77808a;
        background: rgba(0, 0, 0, .35);
        border-color: rgba(255, 255, 255, .08);
        cursor: not-allowed;
      }
      #${ONE} {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(0, 0, 0, .58);
        color: #c7d5e0;
        font-family: Motiva Sans, Arial, Helvetica, sans-serif;
      }
      #${ONE}[hidden] {
        display: none;
      }
      #${ONE} .st-lcn-one-panel {
        width: min(380px, calc(100vw - 48px));
        border: 1px solid rgba(102, 192, 244, .2);
        background: #1b2838;
        box-shadow: 0 18px 54px rgba(0, 0, 0, .55);
      }
      #${ONE} .st-lcn-one-head {
        padding: 14px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, .1);
        background: #16202d;
      }
      #${ONE} h3 {
        margin: 0;
        color: #fff;
        font-size: 16px;
        letter-spacing: 0;
      }
      #${ONE} .st-lcn-one-body {
        padding: 16px;
        color: #c7d5e0;
        font-size: 13px;
        line-height: 1.6;
      }
      #${ONE} .st-lcn-one-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 0 16px 16px;
      }
      #${ONE} .st-lcn-form {
        display: grid;
        gap: 10px;
      }
      #${ONE} .st-lcn-form label {
        display: grid;
        gap: 5px;
        color: #acb9c5;
        font-size: 12px;
      }
      #${ONE} .st-lcn-form input {
        height: 34px;
        border: 1px solid rgba(255, 255, 255, .12);
        background: rgba(0, 0, 0, .32);
        color: #dfe3e6;
        padding: 0 10px;
        outline: none;
      }
      #${ONE} .st-lcn-form input:disabled {
        color: #8f9aa5;
        background: rgba(0, 0, 0, .2);
      }
      #${MODAL} {
        position: fixed;
        inset: 0;
        z-index: 2147483645;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(0, 0, 0, .62);
        color: #c7d5e0;
        font-family: Motiva Sans, Arial, Helvetica, sans-serif;
      }
      #${MODAL}[hidden] {
        display: none;
      }
      #${PROGRESS} {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(0, 0, 0, .58);
        color: #c7d5e0;
        font-family: Motiva Sans, Arial, Helvetica, sans-serif;
      }
      #${PROGRESS}[hidden] {
        display: none;
      }
      #${PROGRESS} .st-lcn-progress-panel {
        width: min(420px, calc(100vw - 48px));
        border: 1px solid rgba(102, 192, 244, .2);
        background: #1b2838;
        box-shadow: 0 18px 54px rgba(0, 0, 0, .55);
      }
      #${PROGRESS} .st-lcn-progress-head {
        padding: 14px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, .1);
        background: #16202d;
      }
      #${PROGRESS} h3 {
        margin: 0;
        color: #fff;
        font-size: 15px;
        letter-spacing: 0;
      }
      #${PROGRESS} .st-lcn-progress-body {
        padding: 16px;
      }
      #${PROGRESS} .st-lcn-progress-msg {
        margin-bottom: 12px;
        color: #8f98a0;
        font-size: 12px;
      }
      #${PROGRESS} .st-lcn-progress-bar {
        height: 8px;
        overflow: hidden;
        background: rgba(0, 0, 0, .35);
        border: 1px solid rgba(255, 255, 255, .1);
      }
      #${PROGRESS} .st-lcn-progress-fill {
        height: 100%;
        width: var(--st-lcn-progress, 0%);
        background: linear-gradient(90deg, #06bfff 0%, #2d89ff 100%);
      }
      #${PROGRESS} .st-lcn-progress-line {
        margin-top: 10px;
        color: #c7d5e0;
        font-size: 12px;
      }
      #${PROGRESS} .st-lcn-progress-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 14px;
      }
      #${MODAL} .st-lcn-panel {
        width: min(780px, calc(100vw - 48px));
        max-height: min(620px, calc(100vh - 48px));
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        border: 1px solid rgba(102, 192, 244, .18);
        background: #1b2838;
        box-shadow: 0 18px 54px rgba(0, 0, 0, .55);
      }
      #${MODAL} .st-lcn-head {
        position: relative;
        z-index: 5;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, .1);
        background: #16202d;
      }
      #${MODAL} h2,
      #${MODAL} h3 {
        margin: 0;
        color: #fff;
        letter-spacing: 0;
      }
      #${MODAL} h2 {
        font-size: 16px;
      }
      #${MODAL} h3 {
        font-size: 14px;
      }
      #${MODAL} .st-lcn-close {
        position: relative;
        z-index: 6;
        flex: 0 0 auto;
        width: 32px;
        height: 32px;
        border: 0;
        color: #c7d5e0;
        background: transparent;
        cursor: pointer;
        font-size: 24px;
        line-height: 32px;
      }
      #${MODAL} .st-lcn-body {
        min-height: 0;
        overflow: auto;
        padding: 14px 16px 16px;
      }
      #${MODAL} .st-lcn-note {
        margin: 4px 0 14px;
        color: #8f98a0;
        font-size: 12px;
      }
      #${MODAL} .st-lcn-controls {
        display: grid;
        grid-template-columns: minmax(300px, 315px) minmax(300px, 360px);
        gap: 12px;
      }
      #${MODAL} fieldset {
        margin: 0;
        border: 1px solid rgba(255, 255, 255, .1);
        padding: 8px 10px 10px;
      }
      #${MODAL} legend {
        color: #8f98a0;
        font-size: 12px;
      }
      #${MODAL} label {
        display: inline-flex;
        gap: 6px;
        align-items: center;
        margin-right: 12px;
        color: #c7d5e0;
        font-size: 12px;
      }
      #${MODAL} input {
        accent-color: #66c0f4;
      }
      #${MODAL} input[type="radio"],
      #${MODAL} input[type="checkbox"] {
        appearance: none;
        -webkit-appearance: none;
        flex: 0 0 auto;
        width: 13px;
        height: 13px;
        margin: 0;
        border: 1px solid #7a8794;
        background: rgba(0, 0, 0, .22);
      }
      #${MODAL} input[type="radio"] {
        border-radius: 50%;
      }
      #${MODAL} input[type="checkbox"] {
        border-radius: 2px;
      }
      #${MODAL} input[type="radio"]:checked {
        border-color: #66c0f4;
        background: radial-gradient(circle, #66c0f4 0 36%, transparent 40%), rgba(102, 192, 244, .16);
      }
      #${MODAL} input[type="checkbox"]:checked {
        border-color: #66c0f4;
        background:
          linear-gradient(135deg, transparent 0 42%, #0e1a24 43% 55%, transparent 56%),
          linear-gradient(45deg, transparent 0 48%, #0e1a24 49% 61%, transparent 62%),
          #66c0f4;
      }
      #${MODAL} input[type="radio"]:disabled,
      #${MODAL} input[type="checkbox"]:disabled {
        cursor: not-allowed;
        border-color: #6f7780;
        background-color: rgba(255, 255, 255, .08);
      }
      #${MODAL} input[type="radio"]:disabled:checked {
        border-color: #9fb7c7;
        background: radial-gradient(circle, #c7d5e0 0 36%, transparent 40%), rgba(255, 255, 255, .12);
      }
      #${MODAL} input[type="checkbox"]:disabled:checked {
        border-color: #9fb7c7;
        background:
          linear-gradient(135deg, transparent 0 42%, #1b2838 43% 55%, transparent 56%),
          linear-gradient(45deg, transparent 0 48%, #1b2838 49% 61%, transparent 62%),
          #c7d5e0;
      }
      #${MODAL} .st-lcn-inline-btn {
        min-height: 22px;
        margin-left: 2px;
        border: 1px solid rgba(102, 192, 244, .35);
        border-radius: 2px;
        padding: 0 8px;
        color: #9fd3f5;
        background: rgba(102, 192, 244, .08);
        cursor: pointer;
        font-size: 12px;
      }
      #${MODAL} .st-lcn-inline-btn:hover:not(:disabled) {
        color: #fff;
        background: rgba(102, 192, 244, .16);
      }
      #${MODAL} .st-lcn-inline-btn:disabled {
        color: #6f7780;
        border-color: rgba(255, 255, 255, .08);
        background: rgba(255, 255, 255, .04);
        cursor: not-allowed;
      }
      #${MODAL} .st-lcn-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        margin-top: 12px;
      }
      #${MODAL} .st-lcn-action-option {
        min-height: 30px;
        margin-left: 2px;
      }
      #${MODAL} .st-lcn-tip {
        position: relative;
        display: inline-flex;
        align-items: center;
        margin-left: -6px;
      }
      #${MODAL} .st-lcn-tip-icon {
        width: 15px;
        height: 15px;
        opacity: .68;
        cursor: help;
      }
      #${MODAL} .st-lcn-tip:hover .st-lcn-tip-icon,
      #${MODAL} .st-lcn-tip:focus .st-lcn-tip-icon {
        opacity: .95;
      }
      #${MODAL} .st-lcn-tip-popover {
        position: absolute;
        left: 50%;
        bottom: calc(100% + 8px);
        z-index: 2;
        width: 250px;
        padding: 8px 10px;
        border: 1px solid rgba(102, 192, 244, .2);
        border-radius: 3px;
        color: #dfe3e6;
        background: #0f1a24;
        box-shadow: 0 12px 28px rgba(0, 0, 0, .42);
        font-size: 12px;
        line-height: 1.5;
        transform: translateX(-50%) translateY(4px);
        opacity: 0;
        pointer-events: none;
        transition: opacity .12s ease, transform .12s ease;
      }
      #${MODAL} .st-lcn-tip:hover .st-lcn-tip-popover,
      #${MODAL} .st-lcn-tip:focus .st-lcn-tip-popover {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
      #${MODAL} .st-lcn-msg {
        min-height: 18px;
        margin-top: 10px;
        color: #8f98a0;
        font-size: 12px;
      }
      #${MODAL} .st-lcn-empty {
        margin-top: 12px;
        border: 1px dashed rgba(255, 255, 255, .12);
        padding: 20px;
        color: #8f98a0;
        text-align: center;
        font-size: 12px;
      }
      #${MODAL} .st-lcn-pagebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-top: 12px;
        color: #8f98a0;
        font-size: 12px;
      }
      #${MODAL} .st-lcn-page-actions {
        display: flex;
        gap: 6px;
      }
      #${MODAL} .st-lcn-table-wrap {
        position: relative;
        z-index: 1;
        max-height: 310px;
        margin-top: 12px;
        overflow: auto;
        border: 1px solid rgba(255, 255, 255, .1);
      }
      #${MODAL} table {
        width: 100%;
        min-width: 680px;
        border-collapse: collapse;
        table-layout: fixed;
        font-size: 12px;
      }
      #${MODAL} th:first-child,
      #${MODAL} td:first-child {
        width: 44px;
        text-align: center;
      }
      #${MODAL} th,
      #${MODAL} td {
        border-bottom: 1px solid rgba(255, 255, 255, .07);
        padding: 7px 8px;
        text-align: left;
        vertical-align: middle;
        overflow-wrap: anywhere;
      }
      #${MODAL} th {
        position: sticky;
        top: 0;
        background: #16202d;
        color: #8f98a0;
        font-weight: 500;
      }
      #${MODAL} .st-lcn-input {
        width: 100%;
        height: 28px;
        border: 1px solid rgba(255, 255, 255, .14);
        border-radius: 2px;
        padding: 4px 7px;
        color: #fff;
        background: #050608;
        font-size: 12px;
      }
      #${MODAL} .st-lcn-appid {
        display: block;
        margin-top: 2px;
        color: #61707f;
        font-size: 11px;
      }
      #${MODAL} tr.ok td {
        background: rgba(92, 184, 92, .08);
      }
      #${MODAL} tr.fail td {
        background: rgba(255, 91, 91, .09);
      }
    `;
    document.head.appendChild(style);
  }

  function visible(el) {
    const r = el?.getBoundingClientRect?.();
    return !!r && r.width > 30 && r.height > 12;
  }

  function nearText(el) {
    let cur = el;
    let out = "";
    for (let i = 0; cur && i < 6; i += 1, cur = cur.parentElement) {
      if (cur === document.body || cur === document.documentElement) {
        break;
      }
      out += ` ${cur.textContent || ""}`;
    }
    return out.replace(/\s+/g, " ").trim();
  }

  function sortInput() {
    const inputs = Array.from(document.querySelectorAll("input[type='text'], input:not([type])"))
      .filter(visible);
    return inputs.find(input => /自定义排序名称|Custom Sort/i.test(nearText(input)))
      || inputs.find(input => /排序|sort/i.test(input.placeholder || input.getAttribute("aria-label") || ""))
      || null;
  }

  function setNative(input, value) {
    const proto = Object.getPrototypeOf(input);
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc?.set) {
      desc.set.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Steam 库排序输入框由 React 动态挂载，不能固定插入点，只能沿输入框附近容器寻找稳定承载区。
  function barHost(input) {
    const inputRect = input?.getBoundingClientRect?.();
    let cur = input?.parentElement || null;
    for (let i = 0; cur && i < 6; i += 1, cur = cur.parentElement) {
      const rect = cur.getBoundingClientRect();
      const style = window.getComputedStyle?.(cur);
      if (rect.width >= inputRect.width && rect.width <= inputRect.width + 90 && style?.display !== "flex") {
        return cur;
      }
    }
    return input?.parentElement || null;
  }

  function apiRows(data) {
    if (Array.isArray(data?.data)) {
      return data.data;
    }
    return data?.data ? [data.data] : [];
  }

  function apiMap(parts) {
    const map = new Map();
    for (const data of parts) {
      for (const row of apiRows(data)) {
        const appid = Number(row?.appid);
        if (Number.isFinite(appid) && appid > 0) {
          map.set(appid, row);
        }
      }
    }
    return map;
  }

  function loadLib(path) {
    s.libs = s.libs || {};
    const url = window.SteamBuff?.path?.url ? window.SteamBuff.path.url(path) : path;
    if (s.libs[url]) {
      return s.libs[url];
    }

    s.libs[url] = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = false;
      script.onload = () => {
        script.remove();
        resolve();
      };
      script.onerror = () => {
        script.remove();
        reject(new Error(`依赖加载失败：${path}`));
      };
      (document.documentElement || document.head || document.body).appendChild(script);
    }).finally(() => {
      delete s.libs[url];
    });
    return s.libs[url];
  }

  // 助记符只在批量开关确认后加载，避免平时打开自定义页就解析拼音词库。
  async function ensureMnemonic() {
    if (!window.pinyinPro?.pinyin) {
      await loadLib(PINYIN_LIB);
    }
    if (!window.SteamBuff?.libraryCustomNameMnemonic?.withMnemonic) {
      await loadLib(MNEMONIC_CORE);
    }
    const core = window.SteamBuff?.libraryCustomNameMnemonic;
    if (!core?.withMnemonic || !core?.rebuildMnemonic || !core?.stripMnemonic) {
      throw new Error("助记符工具加载失败");
    }
    return core;
  }

  // 云端名称按 100 个 AppID 分片，和后端 /get 的批量限制保持一致，失败分片不阻断其它分片。
  async function queryMap(appids) {
    const parts = [];
    for (let i = 0; i < appids.length; i += QUERY_MAX) {
      const ids = appids.slice(i, i + QUERY_MAX);
      try {
        parts.push(await queryNames(ids));
      } catch (error) {
        if (!String(error?.message || error).includes("404")) {
          throw error;
        }
      }
    }
    return apiMap(parts);
  }

  function stripCloudName(name) {
    return text(name).replace(CLOUD_TAG_RE, "").trim();
  }

  function itemType(app) {
    const type = Number(app?.app_type);
    if (type === 1) return "Game";
    if (type === 4) return "Tool";
    return "App";
  }

  function prepareList(requireCustom, policy = batch.policy, types = batch.types) {
    return backend("prepare-list", {
      policy,
      types: { ...types },
      requireCustom: !!requireCustom,
    });
  }

  function listPage(sid, offset) {
    return backend("list-page", {
      sid,
      offset,
      limit: BACKEND_PAGE_SIZE,
    });
  }

  async function collectAppids(apps, seq) {
    const ids = [];
    for (let i = 0; i < apps.length; i += 1) {
      const id = Number(apps[i]?.appid);
      if (Number.isFinite(id) && id > 0) {
        ids.push(id);
      }
      if (i > 0 && i % APP_SCAN_YIELD === 0) {
        batch.message = `正在整理查询队列 ${i}/${apps.length}`;
        refreshMessage();
        await yieldUI();
        if (seq !== batch.previewSeq) {
          return null;
        }
      }
    }
    return ids;
  }

  function hasCustom(app) {
    return app?.has_custom_sort_as === true || !!text(app?.current_custom_name);
  }

  function typeOn(row) {
    const type = Number(row?.app_type);
    const key = type === 1 ? "game" : type === 2 ? "software" : type === 4 ? "tool" : "other";
    return !!batch.types[key];
  }

  function localRowVisible(row) {
    if (!typeOn(row)) {
      return false;
    }
    if (batch.policy === "hide") {
      return !hasCustom(row);
    }
    if (batch.policy === "rebuild-mnemonic") {
      return hasCustom(row);
    }
    return true;
  }

  function makeRow(app, old) {
    const appid = Number(app.appid);
    const custom = text(app.current_custom_name);
    const cloud = batch.cloudMap.get(appid) || "";
    const manual = !!old?.manual;
    const cloudTouched = !!old?.cloudTouched;
    let want = manual ? text(old.want) : "";
    let checked = !!old?.checked;
    let source = old?.cloudSource || "";

    if (!manual && batch.policy === "rebuild-mnemonic") {
      want = custom;
      checked = false;
      source = "local";
    } else if (!manual && cloud) {
      want = cloud;
      checked = !(batch.policy === "skip" && hasCustom(app));
      source = "api";
    } else if (!manual) {
      want = "";
      checked = false;
      source = "";
    }

    return {
      appid,
      app_type: Number(app.app_type) || 0,
      itemType: itemType(app),
      official: text(app.official_name),
      custom,
      apiName: cloud,
      want,
      checked,
      manual,
      cloudTouched,
      cloudSource: source,
      state: old?.state || "",
      error: old?.error || "",
    };
  }

  function keepRowState(row) {
    if (!row) {
      return;
    }
    batch.stateMap.set(Number(row.appid), {
      checked: !!row.checked,
      want: text(row.want),
      manual: !!row.manual,
      cloudTouched: !!row.cloudTouched,
      cloudSource: row.cloudSource || "",
      mnemonicTouched: !!row.mnemonicTouched,
      state: row.state || "",
      error: row.error || "",
    });
  }

  function resetRowsForPolicy() {
    for (const row of batch.rows) {
      keepRowState(row);
    }
    const rows = [];
    for (const app of batch.localRows) {
      if (!localRowVisible(app)) {
        continue;
      }
      rows.push(makeRow(app, batch.stateMap.get(Number(app.appid))));
    }
    setRows(rows);
    batch.message = previewMessage();
  }

  function applyLocalFilters() {
    resetRowsForPolicy();
    renderModal();
  }

  function hasDirtyRows() {
    return batch.rows.some(row => row.manual || row.mnemonicTouched || row.cloudTouched);
  }

  async function loadLocalRows() {
    const seq = batch.previewSeq + 1;
    const startedAt = now();
    batch.previewSeq = seq;
    batch.busy = true;
    batch.loadingLocal = true;
    clearLocalRows();
    batch.stats = emptyStats();
    batch.message = "正在读取 Steam 客户端库列表";
    renderModal();
    log("info", "library-custom-name-preview-start", "开始加载库自定义名称本地列表", {
      policy: batch.policy,
    });
    try {
      ensureOn();
      const prepared = await prepareList(false, "cover", {
        game: true,
        software: true,
        tool: true,
        other: true,
      });
      if (seq !== batch.previewSeq) {
        return;
      }
      const sid = text(prepared.sid);
      const total = Number(prepared.total) || 0;
      for (let offset = 0; offset < total;) {
        const page = await listPage(sid, offset);
        const apps = Array.isArray(page.apps) ? page.apps : [];
        for (const app of apps) {
          const appid = Number(app?.appid);
          if (Number.isFinite(appid) && appid > 0) {
            batch.localRows.push({
              appid,
              official_name: text(app.official_name),
              current_custom_name: text(app.current_custom_name),
              has_custom_sort_as: app?.has_custom_sort_as === true || !!text(app.current_custom_name),
              app_type: Number(app.app_type) || 0,
            });
          }
        }
        offset = Number(page.nextOffset) || (offset + apps.length);
        resetRowsForPolicy();
        batch.message = `正在加载本地列表 ${Math.min(offset, total)}/${total}`;
        renderVisibleRows();
        await yieldUI();
        if (seq !== batch.previewSeq) {
          return;
        }
      }
      batch.message = previewMessage();
      log("info", "library-custom-name-preview-success", "库自定义名称本地列表加载完成", {
        ...statsMeta(),
        durationMs: now() - startedAt,
      });
    } catch (error) {
      if (seq !== batch.previewSeq) {
        return;
      }
      batch.message = error?.message || String(error);
      log("error", "library-custom-name-preview-failed", "库自定义名称本地列表加载失败", {
        durationMs: now() - startedAt,
        error: error?.message || String(error),
      });
    } finally {
      if (seq === batch.previewSeq) {
        batch.busy = false;
        batch.loadingLocal = false;
        renderModal();
      }
    }
  }

  function canWrite(row) {
    return !!row.checked && !!text(row.want);
  }

  function isRebuildMnemonicPolicy() {
    return batch.policy === "rebuild-mnemonic";
  }

  function totalPages() {
    return Math.max(1, Math.ceil(batch.rows.length / BATCH_PAGE_SIZE));
  }

  function clampPage() {
    batch.page = Math.min(Math.max(1, Number(batch.page) || 1), totalPages());
  }

  function visibleRows() {
    clampPage();
    const start = (batch.page - 1) * BATCH_PAGE_SIZE;
    return batch.rows.slice(start, start + BATCH_PAGE_SIZE);
  }

  function visibleRange() {
    if (!batch.rows.length) {
      return { from: 0, to: 0 };
    }
    const from = (batch.page - 1) * BATCH_PAGE_SIZE + 1;
    return {
      from,
      to: Math.min(batch.rows.length, from + BATCH_PAGE_SIZE - 1),
    };
  }

  function refreshSkip() {
    batch.stats = {
      ...batch.stats,
      total: batch.rows.length,
      skipped: Math.max(0, batch.rows.length - batch.writeCount),
    };
  }

  function refreshCounts() {
    let write = 0;
    const map = new Map();
    for (let i = 0; i < batch.rows.length; i += 1) {
      const row = batch.rows[i];
      row.index = i;
      map.set(Number(row.appid), row);
      if (canWrite(row)) {
        write += 1;
      }
    }
    batch.rowMap = map;
    batch.writeCount = write;
    clampPage();
    refreshSkip();
  }

  function clearRows() {
    batch.rows = [];
    batch.rowMap = new Map();
    batch.page = 1;
    batch.writeCount = 0;
    refreshSkip();
  }

  function clearLocalRows() {
    batch.localRows = [];
    batch.cloudMap = new Map();
    batch.stateMap = new Map();
    clearRows();
  }

  function setRows(rows) {
    batch.rows = Array.isArray(rows) ? rows : [];
    batch.page = 1;
    refreshCounts();
  }

  function appendRows(rows) {
    const list = Array.isArray(rows) ? rows : [];
    for (const row of list) {
      row.index = batch.rows.length;
      batch.rows.push(row);
      batch.rowMap.set(Number(row.appid), row);
      if (canWrite(row)) {
        batch.writeCount += 1;
      }
    }
    clampPage();
    refreshSkip();
  }

  function updateRowWrite(row, apply) {
    const before = canWrite(row);
    apply();
    const after = canWrite(row);
    if (before !== after) {
      batch.writeCount += after ? 1 : -1;
      refreshSkip();
    }
  }

  function previewMessage() {
    const skipped = Math.max(0, batch.rows.length - batch.writeCount);
    return `加载完成，写入 ${batch.writeCount} 项，跳过 ${skipped} 项`;
  }

  function resetCloudUpload() {
    batch.cloudQueue = [];
    batch.cloudFlush = null;
    batch.cloudFinishing = false;
    batch.stats.cloudOk = 0;
    batch.stats.cloudFail = 0;
    batch.stats.cloudSkipped = 0;
    batch.stats.cloudPending = 0;
  }

  function cloudPayload(row) {
    if (!batch.uploadCloud || !row || row.cloudSource !== "api") {
      return null;
    }
    // 只有用户编辑过正文才同步云端，API 原样名和自动助记符不作为社区贡献。
    const touched = row.cloudTouched === true;
    if (!touched) {
      return null;
    }
    const custom = stripCloudName(row.want);
    const api = stripCloudName(row.apiName);
    if (!custom || custom === api || !text(row.official)) {
      return null;
    }
    return {
      type: row.itemType || "Game",
      appid: Number(row.appid) || 0,
      steam_name: text(row.official),
      custom_name: custom,
    };
  }

  function countCloudResult(res, size) {
    const results = Array.isArray(res?.results) ? res.results : [];
    if (results.length) {
      let ok = 0;
      let fail = 0;
      for (const item of results) {
        const code = Number(item?.code) || 0;
        if (code >= 200 && code < 300) {
          ok += 1;
        } else {
          fail += 1;
        }
      }
      return { ok, fail };
    }
    const accepted = Number(res?.accepted);
    const failed = Number(res?.failed);
    if (Number.isFinite(accepted) || Number.isFinite(failed)) {
      return {
        ok: Math.max(0, Number.isFinite(accepted) ? accepted : 0),
        fail: Math.max(0, Number.isFinite(failed) ? failed : 0),
      };
    }
    return { ok: size, fail: 0 };
  }

  function flushCloudUploads() {
    if (batch.cloudFlush) {
      return batch.cloudFlush;
    }
    batch.cloudFlush = (async () => {
      try {
        while (batch.cloudQueue.length) {
          const chunk = batch.cloudQueue.splice(0, CLOUD_UPLOAD_MAX);
          batch.stats.cloudPending = Math.max(0, batch.stats.cloudPending - chunk.length);
          try {
            const res = await feedback({ items: chunk });
            const count = countCloudResult(res, chunk.length);
            batch.stats.cloudOk += count.ok;
            batch.stats.cloudFail += count.fail;
          } catch {
            batch.stats.cloudFail += chunk.length;
          }
          renderProgressSoon();
          await yieldUI();
        }
      } finally {
        batch.cloudFlush = null;
      }
    })();
    return batch.cloudFlush;
  }

  function queueCloudUpload(row) {
    if (!batch.uploadCloud || !row || row.cloudQueued) {
      return;
    }
    row.cloudQueued = true;
    const item = cloudPayload(row);
    if (!item) {
      batch.stats.cloudSkipped += 1;
      return;
    }
    batch.cloudQueue.push(item);
    batch.stats.cloudPending += 1;
    flushCloudUploads().catch(() => {});
  }

  function finishCloudUploads() {
    if (batch.cloudFinishing) {
      return;
    }
    batch.cloudFinishing = true;
    Promise.resolve(batch.cloudFlush).then(() => {
      if (batch.cloudQueue.length) {
        return flushCloudUploads();
      }
      return null;
    }).catch(() => {}).finally(() => {
      batch.cloudFinishing = false;
      batch.summary = true;
      batch.saving = false;
      batch.message = "保存队列已完成";
      renderVisibleRows();
      renderProgressSoon(true);
    });
  }

  function setOneBusy(on) {
    s.oneBusy = !!on;
    const btn = document.querySelector(`#${BAR} [data-lcn-one]`);
    if (btn) {
      btn.disabled = !!on;
      btn.textContent = on ? "获取中..." : "获取";
    }
  }

  function oneBox(title, message, done) {
    css();
    let box = document.getElementById(ONE);
    if (!box) {
      box = document.createElement("section");
      box.id = ONE;
      box.addEventListener("click", onOneClick);
      document.body.appendChild(box);
    }
    box.hidden = false;
    box.innerHTML = `
      <div class="st-lcn-one-panel" role="dialog" aria-modal="true">
        <div class="st-lcn-one-head"><h3>${esc(title)}</h3></div>
        <div class="st-lcn-one-body">${esc(message)}</div>
        ${done ? `<div class="st-lcn-one-actions"><button class="st-lcn-btn primary" type="button" data-lcn-one="ok">确认</button></div>` : ""}
      </div>
    `;
  }

  function oneConfirm(message, opt = {}) {
    css();
    let box = document.getElementById(ONE);
    if (!box) {
      box = document.createElement("section");
      box.id = ONE;
      box.addEventListener("click", onOneClick);
      document.body.appendChild(box);
    }
    box.hidden = false;
    const title = opt.title || "确认覆盖";
    const cancel = opt.cancel || "取消";
    const confirm = opt.confirm || "继续";
    return new Promise((resolve) => {
      if (s.oneResolve) {
        s.oneResolve(false);
      }
      s.oneResolve = resolve;
      box.innerHTML = `
        <div class="st-lcn-one-panel" role="dialog" aria-modal="true">
          <div class="st-lcn-one-head"><h3>${esc(title)}</h3></div>
          <div class="st-lcn-one-body">${esc(message)}</div>
          <div class="st-lcn-one-actions">
            <button class="st-lcn-btn" type="button" data-lcn-one="cancel">${esc(cancel)}</button>
            <button class="st-lcn-btn primary" type="button" data-lcn-one="confirm">${esc(confirm)}</button>
          </div>
        </div>
      `;
    });
  }

  function closeOne() {
    const box = document.getElementById(ONE);
    if (box) {
      box.hidden = true;
    }
  }

  function oneFail(message) {
    oneBox("获取失败", message || "操作失败", true);
  }

  function oneResult(title, message) {
    oneBox(title, message || "操作完成", true);
  }

  function feedbackBox(app, custom) {
    css();
    let box = document.getElementById(ONE);
    if (!box) {
      box = document.createElement("section");
      box.id = ONE;
      box.addEventListener("click", onOneClick);
      document.body.appendChild(box);
    }
    box.hidden = false;
    box.innerHTML = `
      <div class="st-lcn-one-panel" role="dialog" aria-modal="true">
        <div class="st-lcn-one-head"><h3>反馈</h3></div>
        <div class="st-lcn-one-body">
          <div class="st-lcn-form">
            <label>APPID<input type="text" value="${attr(app.appid)}" disabled></label>
            <label>steam原名<input type="text" value="${attr(app.official_name)}" disabled></label>
            <label>自定义名<input type="text" value="${attr(custom)}" data-lcn-feedback-name></label>
          </div>
        </div>
        <div class="st-lcn-one-actions">
          <button class="st-lcn-btn" type="button" data-lcn-one="cancel">取消</button>
          <button class="st-lcn-btn primary" type="button" data-lcn-one="feedback-submit">提交</button>
        </div>
      </div>
    `;
  }

  function onOneClick(event) {
    const action = event.target.closest?.("[data-lcn-one]")?.dataset?.lcnOne;
    if (!action) {
      return;
    }
    if (action === "confirm" || action === "cancel") {
      const resolve = s.oneResolve;
      s.oneResolve = null;
      closeOne();
      if (resolve) {
        resolve(action === "confirm");
      }
      return;
    }
    if (action === "ok") {
      closeOne();
      return;
    }
    if (action === "feedback-submit") {
      submitFeedback().catch((error) => oneResult("提交失败", error?.message || String(error)));
    }
  }

  async function fillOne() {
    const input = sortInput();
    if (!input) {
      oneFail("未找到自定义排序名称输入框");
      return;
    }
    if (s.oneBusy) {
      const box = document.getElementById(ONE);
      if (box && !box.hidden) {
        oneBox("获取名称", "正在获取...", false);
        return;
      }
      s.oneBusy = false;
    }
    const inputName = text(input.value);
    if (inputName && !(await oneConfirm("当前操作会覆盖当前自定义排序名称，是否继续？"))) {
      return;
    }

    setOneBusy(true);
    oneBox("获取名称", "正在获取...", false);

    try {
      ensureOn();
      let cur = null;
      try {
        cur = await backend("current-app");
      } catch {
      }
      const appid = Number(cur?.app?.appid) || currentAppid();
      if (!appid) {
        throw new Error("未识别当前游戏 AppID");
      }
      const current = text(cur?.app?.current_custom_name);
      if (!inputName && current && !(await oneConfirm("当前操作会覆盖当前自定义排序名称，是否继续？"))) {
        return;
      }
      oneBox("获取名称", "正在获取...", false);

      const names = await queryMap([appid]);
      const name = text(names.get(appid)?.name);
      if (!name) {
        throw new Error("云端没有找到当前游戏名称");
      }
      await backend("save-one", { appid, name });
      setNative(input, name);
      closeOne();
    } catch (error) {
      oneFail(error?.message || String(error));
    } finally {
      setOneBusy(false);
    }
  }

  async function openFeedback() {
    const input = sortInput();
    let cur = null;
    try {
      cur = await backend("current-app");
    } catch {
    }
    const app = cur?.app || {};
    const appid = Number(app.appid) || currentAppid();
    if (!appid) {
      oneResult("反馈失败", "未识别当前游戏 AppID");
      return;
    }
    s.feedback = {
      appid,
      official_name: text(app.official_name),
    };
    feedbackBox(s.feedback, text(input?.value) || text(app.current_custom_name));
  }

  async function submitFeedback() {
    const app = s.feedback || {};
    const name = text(document.querySelector(`#${ONE} [data-lcn-feedback-name]`)?.value);
    if (!Number(app.appid)) {
      oneResult("提交失败", "未识别当前游戏 AppID");
      return;
    }
    if (!text(app.official_name)) {
      oneResult("提交失败", "未识别 Steam 原名");
      return;
    }
    oneBox("反馈", "正在提交...", false);
    const res = await feedback({
      appid: Number(app.appid),
      steam_name: app.official_name,
      custom_name: name,
    });
    const code = Number(res?.code) || 0;
    const message = text(res?.message) || "提交完成";
    oneResult(code >= 200 && code < 300 ? "提交成功" : "提交失败", message);
  }

  function makeBar() {
    const bar = document.createElement("div");
    bar.id = BAR;
    bar.addEventListener("click", onBarClick);
    bar.innerHTML = `
      <button class="st-lcn-btn" type="button" data-lcn-one>获取</button>
      <button class="st-lcn-btn" type="button" data-lcn-batch>批量</button>
      <button class="st-lcn-btn" type="button" data-lcn-feedback>反馈</button>
    `;

    return bar;
  }

  function onBarClick(event) {
    const one = event.target.closest?.("[data-lcn-one]");
    const batchBtn = event.target.closest?.("[data-lcn-batch]");
    const feedBtn = event.target.closest?.("[data-lcn-feedback]");
    if (!one && !batchBtn && !feedBtn) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (one) {
      fillOne().catch((error) => oneFail(error?.message || String(error)));
      return;
    }
    if (feedBtn) {
      openFeedback().catch((error) => oneResult("反馈失败", error?.message || String(error)));
      return;
    }
    openBatch();
  }

  function clearBars(keep) {
    document.querySelectorAll(`#${BAR}`).forEach((bar) => {
      if (bar !== keep) {
        bar.remove();
      }
    });
  }

  function insertBar(input) {
    const box = barHost(input);
    if (!box) {
      clearBars(null);
      return false;
    }

    let bar = document.getElementById(BAR);
    clearBars(bar);
    if (!bar) {
      bar = makeBar();
    }
    if (bar.parentElement !== box || box.lastElementChild !== bar) {
      box.appendChild(bar);
    }
    bar.hidden = false;
    return true;
  }

  // tick 是低频驻留扫描，负责在 Steam 切换库详情或 React 重挂输入框后补回三个按钮。
  function tick() {
    css();
    const input = sortInput();
    if (!input) {
      clearBars(null);
      return;
    }
    insertBar(input);
  }

  function progressLine() {
    const st = batch.stats;
    const local = `总:${st.total}，处理:${st.processed}，跳过:${st.skipped}，失败:${st.failed}`;
    if (!batch.uploadCloud) {
      return `${local}，云端上传已关闭`;
    }
    return `${local}，云端成功:${st.cloudOk}，云端失败:${st.cloudFail}，云端跳过:${st.cloudSkipped}，待传:${st.cloudPending}`;
  }

  function progressPct() {
    const total = Number(batch.stats.total) || 0;
    if (!total) {
      return 0;
    }
    const done = (Number(batch.stats.processed) || 0) + (Number(batch.stats.skipped) || 0);
    return Math.max(0, Math.min(100, Math.round(done * 100 / total)));
  }

  function progressHtml() {
    const pct = progressPct();
    const cloud = batch.cloudFinishing && !batch.saving;
    const summary = batch.summary || (!batch.saving && !batch.cloudFinishing);
    const paused = !!batch.paused;
    const action = paused ? "resume" : "pause";
    const cls = paused ? "success" : "danger";
    const text = batch.waitCmd ? `<span class="st-lcn-spinner" aria-hidden="true"></span>` : (paused ? "继续" : "暂停");
    const disabled = batch.waitCmd ? " disabled" : "";
    const label = batch.waitCmd ? (paused ? "继续中" : "暂停中") : (paused ? "继续" : "暂停");
    return `
      <div class="st-lcn-progress-panel">
        <div class="st-lcn-progress-head">
          <h3>${summary ? "修改结果" : cloud ? "云端上传" : "保存进度"}</h3>
        </div>
        <div class="st-lcn-progress-body">
          <div class="st-lcn-progress-msg">${esc(summary ? "修改完成" : batch.message)}</div>
          <div class="st-lcn-progress-bar" aria-label="保存进度">
            <div class="st-lcn-progress-fill" style="--st-lcn-progress:${esc(pct)}%"></div>
          </div>
          <div class="st-lcn-progress-line">${esc(progressLine())}</div>
          <div class="st-lcn-progress-actions">
            ${summary || cloud
              ? `<button class="st-lcn-btn" type="button" data-lcn-progress="hide">关闭</button>`
              : `
                <button class="st-lcn-btn" type="button" data-lcn-progress="cancel">关闭</button>
                <button class="st-lcn-btn ${cls}" type="button" data-lcn-progress="${attr(action)}" aria-label="${attr(label)}" title="${attr(label)}"${disabled}>${text}</button>
              `}
          </div>
        </div>
      </div>
    `;
  }

  function rowsHtml() {
    if (!batch.rows.length) {
      return `<div class="st-lcn-empty">${batch.loadingLocal ? "正在加载本地库列表..." : "暂无本地列表数据"}</div>`;
    }
    const pages = totalPages();
    const range = visibleRange();
    return `
      <div class="st-lcn-pagebar" data-lcn-pagebar>
        <span>显示 ${range.from}-${range.to} / ${batch.rows.length}，第 ${batch.page} / ${pages} 页</span>
        <div class="st-lcn-page-actions">
          <button class="st-lcn-inline-btn" type="button" data-lcn-page="first" ${batch.page <= 1 || batch.busy ? "disabled" : ""}>首页</button>
          <button class="st-lcn-inline-btn" type="button" data-lcn-page="prev" ${batch.page <= 1 || batch.busy ? "disabled" : ""}>上一页</button>
          <button class="st-lcn-inline-btn" type="button" data-lcn-page="next" ${batch.page >= pages || batch.busy ? "disabled" : ""}>下一页</button>
          <button class="st-lcn-inline-btn" type="button" data-lcn-page="last" ${batch.page >= pages || batch.busy ? "disabled" : ""}>末页</button>
        </div>
      </div>
      <div class="st-lcn-table-wrap">
        <table>
          <thead>
            <tr>
              <th>选择</th>
              <th>官方名称</th>
              <th>云端名称</th>
              <th>当前自定义排序名</th>
              <th>待写入名</th>
            </tr>
          </thead>
          <tbody>
            ${visibleRows().map(row => `
              <tr data-appid="${attr(row.appid)}" class="${row.state === "success" ? "ok" : row.state === "failed" ? "fail" : ""}">
                <td><input type="checkbox" data-lcn-check="${attr(row.appid)}" ${row.checked ? "checked" : ""} ${batch.saving || batch.busy ? "disabled" : ""}></td>
                <td>${esc(row.official)}<span class="st-lcn-appid">${esc(row.appid)}</span></td>
                <td>${esc(row.apiName)}</td>
                <td>${esc(row.custom)}</td>
                <td><input class="st-lcn-input" data-lcn-name="${attr(row.appid)}" value="${attr(row.want)}" ${batch.saving || batch.busy ? "disabled" : ""}></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function modalHtml() {
    const write = batch.writeCount;
    const locked = batch.busy || batch.saving;
    const mnemonicDisabled = locked || isRebuildMnemonicPolicy();
    const mnemonicChecked = batch.mnemonic && !isRebuildMnemonicPolicy();
    const tip = CLOUD_TIP_TEXT;
    return `
      <div class="st-lcn-panel">
        <div class="st-lcn-head">
          <h2>库名称批量修改</h2>
          <button class="st-lcn-close" type="button" data-lcn-close>&times;</button>
        </div>
        <div class="st-lcn-body">
          <div class="st-lcn-note">读取 Steam 客户端库列表，获取云端名称后逐条写入自定义排序名称。</div>
          <div class="st-lcn-controls">
            <fieldset>
              <legend>覆盖策略</legend>
              <label><input type="radio" name="st-lcn-policy" value="cover" ${batch.policy === "cover" ? "checked" : ""} ${locked ? "disabled" : ""}>全部覆盖</label>
              <label><input type="radio" name="st-lcn-policy" value="hide" ${batch.policy === "hide" ? "checked" : ""} ${locked ? "disabled" : ""}>隐藏已有</label>
              <label><input type="radio" name="st-lcn-policy" value="skip" ${batch.policy === "skip" ? "checked" : ""} ${locked ? "disabled" : ""}>跳过已有</label>
              <label><input type="radio" name="st-lcn-policy" value="rebuild-mnemonic" ${isRebuildMnemonicPolicy() ? "checked" : ""} ${locked ? "disabled" : ""}>重建助记符</label>
            </fieldset>
            <fieldset>
              <legend>类型范围</legend>
              <label><input type="checkbox" data-lcn-type="game" ${batch.types.game ? "checked" : ""} ${locked ? "disabled" : ""}>游戏</label>
              <label><input type="checkbox" data-lcn-type="software" ${batch.types.software ? "checked" : ""} ${locked ? "disabled" : ""}>软件</label>
              <label><input type="checkbox" data-lcn-type="tool" ${batch.types.tool ? "checked" : ""} ${locked ? "disabled" : ""}>工具</label>
              <label><input type="checkbox" data-lcn-type="other" ${batch.types.other ? "checked" : ""} ${locked ? "disabled" : ""}>其他</label>
            </fieldset>
          </div>
          <div class="st-lcn-actions">
            <button class="st-lcn-btn" type="button" data-lcn-action="query" ${locked || isRebuildMnemonicPolicy() ? "disabled" : ""}>获取云端名称</button>
            <button class="st-lcn-btn primary" type="button" data-lcn-action="save" ${locked || !write ? "disabled" : ""}>保存修改</button>
            <label class="st-lcn-action-option"><input type="checkbox" data-lcn-upload-cloud ${batch.uploadCloud ? "checked" : ""} ${locked ? "disabled" : ""}>上传云端</label>
            <span class="st-lcn-tip" tabindex="0" aria-label="${attr(tip)}" title="${attr(tip)}">
              <img class="st-lcn-tip-icon" src="${attr(assetUrl("images/tip.svg"))}" alt="">
              <span class="st-lcn-tip-popover" role="tooltip">${esc(tip)}</span>
            </span>
            <label class="st-lcn-action-option"><input type="checkbox" data-lcn-mnemonic ${mnemonicChecked ? "checked" : ""} ${mnemonicDisabled ? "disabled" : ""}>生成助记符</label>
          </div>
          <div class="st-lcn-msg">${esc(batch.message)}</div>
          ${rowsHtml()}
        </div>
      </div>
    `;
  }

  function renderModal() {
    const modal = document.getElementById(MODAL);
    if (modal) {
      modal.innerHTML = modalHtml();
      bindModalControls(modal);
    }
  }

  function renderVisibleRows() {
    renderModal();
  }

  function refreshMessage() {
    const msg = document.querySelector(`#${MODAL} .st-lcn-msg`);
    if (msg) {
      msg.textContent = batch.message;
    }
  }

  function refreshSaveState() {
    const saveBtn = document.querySelector(`#${MODAL} [data-lcn-action='save']`);
    if (saveBtn) {
      saveBtn.disabled = batch.busy || batch.saving || !batch.writeCount;
    }
  }

  function rowVisible(row) {
    const index = Number(row?.index);
    if (!Number.isFinite(index)) {
      return false;
    }
    const start = (batch.page - 1) * BATCH_PAGE_SIZE;
    return index >= start && index < start + BATCH_PAGE_SIZE;
  }

  function refreshProgressRow(row) {
    if (!row || !rowVisible(row)) {
      return;
    }
    const tr = document.querySelector(`#${MODAL} tr[data-appid="${row.appid}"]`);
    if (!tr) {
      return;
    }
    tr.classList.toggle("ok", row.state === "success");
    tr.classList.toggle("fail", row.state === "failed");
  }

  function onModalCloseClick(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    closeBatchAsk().catch(() => {});
  }

  function bindModalControls(modal) {
    modal.querySelector("[data-lcn-close]")?.addEventListener("click", onModalCloseClick);
  }

  function renderProgress() {
    const modal = document.getElementById(PROGRESS);
    if (modal) {
      modal.innerHTML = progressHtml();
      batch.progressRenderAt = now();
    }
  }

  function renderProgressSoon(force) {
    if (force) {
      if (batch.progressTimer) {
        window.clearTimeout(batch.progressTimer);
        batch.progressTimer = 0;
      }
      renderProgress();
      return;
    }
    if (now() - batch.progressRenderAt > 250) {
      renderProgress();
      return;
    }
    if (!batch.progressTimer) {
      batch.progressTimer = window.setTimeout(() => {
        batch.progressTimer = 0;
        renderProgress();
      }, 250);
    }
  }

  function openProgress(summary, render = true) {
    let modal = document.getElementById(PROGRESS);
    if (!modal) {
      modal = document.createElement("section");
      modal.id = PROGRESS;
      modal.addEventListener("click", onProgressClick);
      document.body.appendChild(modal);
    }
    batch.summary = !!summary;
    modal.hidden = false;
    if (render) {
      renderProgress();
    }
  }

  function closeProgress() {
    const modal = document.getElementById(PROGRESS);
    batch.progressClosed = true;
    if (modal) {
      modal.hidden = true;
    }
    if (batch.progressTimer) {
      window.clearTimeout(batch.progressTimer);
      batch.progressTimer = 0;
    }
  }

  function cancelSave() {
    logCommandStart("cancel");
    batch.cancelled = true;
    batch.saving = false;
    batch.paused = false;
    batch.waitCmd = "";
    batch.message = "保存队列已取消";
    closeProgress();
    backend("cancel").catch(() => {});
  }

  function askStop() {
    return oneConfirm("当前任务正在进行中，是否中断？", {
      title: "确认中断",
      cancel: "否",
      confirm: "是",
    });
  }

  async function closeBatchAsk() {
    if (batch.saving && !batch.cancelled && !(await askStop())) {
      return;
    }
    if (batch.saving && !batch.cancelled) {
      cancelSave();
    }
    closeBatch();
  }

  async function closeProgressAsk() {
    if (batch.saving && !batch.cancelled && !(await askStop())) {
      return;
    }
    if (batch.saving && !batch.cancelled) {
      cancelSave();
      return;
    }
    closeProgress();
  }

  function refreshLive(row) {
    refreshSkip();
    const modal = document.getElementById(MODAL);
    if (!modal) {
      return;
    }
    const saveBtn = modal.querySelector("[data-lcn-action='save']");
    if (saveBtn) {
      saveBtn.disabled = batch.busy || batch.saving || !batch.writeCount;
    }
    if (!batch.busy && !batch.saving && batch.rows.length) {
      batch.message = previewMessage();
      refreshMessage();
    }
    const tr = modal.querySelector(`tr[data-appid="${row.appid}"]`);
    const check = tr?.querySelector("[data-lcn-check]");
    if (check) {
      check.checked = !!row.checked;
    }
  }

  function openBatch() {
    css();
    batch.uploadCloud = true;
    let modal = document.getElementById(MODAL);
    if (!modal) {
      modal = document.createElement("section");
      modal.id = MODAL;
      modal.addEventListener("click", onModalClick);
      modal.addEventListener("change", onModalChange);
      modal.addEventListener("input", onModalInput);
      document.body.appendChild(modal);
    }
    modal.hidden = false;
    renderModal();
    if (!batch.localRows.length && !batch.busy) {
      loadLocalRows().catch((error) => {
        batch.busy = false;
        batch.loadingLocal = false;
        batch.message = error?.message || String(error);
        renderModal();
      });
    }
  }

  function closeBatch() {
    const wasLoadingLocal = batch.loadingLocal;
    batch.previewSeq += 1;
    batch.busy = false;
    batch.loadingLocal = false;
    if (wasLoadingLocal) {
      clearLocalRows();
    }
    backend("cancel-preview").catch(() => {});
    const modal = document.getElementById(MODAL);
    if (modal) {
      modal.style.pointerEvents = "none";
      modal.hidden = true;
      window.setTimeout(() => {
        modal.style.pointerEvents = "";
      }, 0);
    }
  }

  async function fetchCloudNames() {
    const seq = batch.previewSeq + 1;
    const startedAt = now();
    if (isRebuildMnemonicPolicy()) {
      batch.message = "重建助记符不需要获取云端名称";
      renderModal();
      return;
    }
    if (!batch.localRows.length) {
      await loadLocalRows();
      if (seq !== batch.previewSeq || !batch.localRows.length) {
        return;
      }
    }
    if (hasDirtyRows()) {
      const ok = await oneConfirm("当前待写入数据已调整，重新获取云端名称将刷新未手动锁定的待写入数据，是否继续？", {
        title: "确认获取云端名称",
        cancel: "否",
        confirm: "是",
      });
      if (!ok) {
        renderModal();
        return;
      }
    }
    batch.previewSeq = seq;
    batch.busy = true;
    batch.message = "正在整理云端名称请求";
    renderModal();
    log("info", "library-custom-name-preview-start", "开始获取库自定义名称云端名称", {
      policy: batch.policy,
      count: batch.rows.length,
    });
    try {
      ensureOn();
      const targets = batch.rows.filter(row => Number(row.appid) > 0);
      const total = targets.length;
      for (let offset = 0; offset < total; offset += BACKEND_PAGE_SIZE) {
        const part = targets.slice(offset, offset + BACKEND_PAGE_SIZE);
        const ids = await collectAppids(part, seq);
        if (!ids || seq !== batch.previewSeq) {
          return;
        }
        batch.message = `正在获取云端名称 ${Math.min(offset + part.length, total)}/${total}`;
        refreshMessage();
        const names = await queryMap(ids);
        if (seq !== batch.previewSeq) {
          return;
        }
        for (const [appid, got] of names) {
          const name = text(got?.name);
          if (name) {
            batch.cloudMap.set(Number(appid), name);
          }
        }
        resetRowsForPolicy();
        renderVisibleRows();
        await yieldUI();
      }
      batch.message = previewMessage();
      log("info", "library-custom-name-preview-success", "库自定义名称云端名称获取完成", {
        ...statsMeta(),
        durationMs: now() - startedAt,
      });
    } catch (error) {
      if (seq !== batch.previewSeq) {
        return;
      }
      batch.message = error?.message || String(error);
      log("error", "library-custom-name-preview-failed", "库自定义名称云端名称获取失败", {
        durationMs: now() - startedAt,
        error: error?.message || String(error),
      });
    } finally {
      if (seq === batch.previewSeq) {
        batch.busy = false;
        renderModal();
      }
    }
  }

  async function applyMnemonicToRows(on) {
    const ok = await oneConfirm("该操作将刷新待写入数据，是否继续？", {
      title: on ? "确认勾选助记符" : "确认取消助记符",
      cancel: "否",
      confirm: "是",
    });
    if (!ok) {
      batch.mnemonic = !on;
      renderModal();
      return;
    }

    const rows = batch.rows.filter(row => row.checked && text(row.want));
    const total = rows.length;
    const core = await ensureMnemonic();
    batch.mnemonic = !!on;
    batch.busy = true;
    batch.summary = false;
    batch.progressClosed = false;
    batch.stats = {
      ...emptyStats(),
      total,
    };
    batch.message = on ? "正在生成助记符" : "正在取消助记符";
    openProgress(false);
    renderModal();
    try {
      for (let i = 0; i < total; i += 1) {
        const row = rows[i];
        updateRowWrite(row, () => {
          const base = on ? text(row.want) : core.stripMnemonic(row.want);
          row.want = on ? core.rebuildMnemonic(base) : base;
          row.manual = text(row.want) !== text(row.apiName);
          row.mnemonicTouched = true;
          row.cloudTouched = row.cloudSource === "api" && row.manual;
          row.state = "";
          row.error = "";
        });
        keepRowState(row);
        batch.stats.processed = i + 1;
        if (i % 100 === 0) {
          batch.message = `${on ? "正在生成助记符" : "正在取消助记符"} ${i + 1}/${total}`;
          renderProgressSoon();
          await yieldUI();
        }
      }
      batch.message = previewMessage();
    } finally {
      batch.busy = false;
      batch.summary = true;
      renderVisibleRows();
      renderProgressSoon(true);
    }
  }

  async function rebuildMnemonicRows() {
    const core = await ensureMnemonic();
    for (const row of batch.rows) {
      if (!text(row.custom)) {
        continue;
      }
      updateRowWrite(row, () => {
        const want = core.rebuildMnemonic(row.custom);
        row.want = want;
        row.checked = !!want && want !== row.custom;
        row.manual = false;
        row.mnemonicTouched = true;
        row.cloudTouched = false;
        row.cloudSource = "local";
        row.state = "";
        row.error = "";
      });
      keepRowState(row);
    }
    batch.message = previewMessage();
    renderVisibleRows();
  }

  async function save() {
    refreshCounts();
    const items = [];
    let chosen = 0;
    for (const row of batch.rows) {
      if (!row.checked) {
        continue;
      }
      chosen += 1;
      if (text(row.want)) {
        items.push({ appid: row.appid, name: row.want });
      }
    }
    const skipped = Math.max(0, chosen - items.length);
    if (!items.length) {
      batch.message = "没有可写入的条目";
      renderModal();
      log("warn", "library-custom-name-save-failed", "库自定义名称保存缺少可写入条目", {
        chosen,
        skipped,
        reason: "empty",
      });
      return;
    }
    try {
      ensureOn();
    } catch (error) {
      batch.message = error?.message || String(error);
      renderModal();
      log("error", "library-custom-name-save-failed", "库自定义名称保存未启用", {
        count: items.length,
        skipped,
        error: error?.message || String(error),
      });
      return;
    }
    batch.saving = true;
    batch.saveStartedAt = now();
    batch.paused = false;
    batch.waitCmd = "";
    batch.summary = false;
    batch.cancelled = false;
    batch.progressClosed = false;
    batch.stats = {
      ...emptyStats(),
      total: items.length + skipped,
      processed: 0,
      skipped,
    };
    resetCloudUpload();
    batch.message = `正在启动保存队列，预计写入 ${items.length} 项，跳过 ${skipped} 项`;
    renderModal();
    openProgress(false);
    log("info", "library-custom-name-save-start", "开始保存库自定义名称", {
      count: items.length,
      skipped,
      uploadCloud: !!batch.uploadCloud,
    });
    try {
      await backend("save-queue", { items, skipped });
      batch.message = "正在逐条写入 Steam";
    } catch (error) {
      batch.saving = false;
      batch.summary = true;
      batch.message = error?.message || String(error);
      log("error", "library-custom-name-save-failed", "库自定义名称保存队列启动失败", {
        count: items.length,
        skipped,
        durationMs: now() - (batch.saveStartedAt || now()),
        error: error?.message || String(error),
      });
    }
    renderModal();
    renderProgress();
  }

  async function cmd(action) {
    if (action === "pause" || action === "resume") {
      if (batch.waitCmd) {
        return;
      }
      logCommandStart(action);
      batch.waitCmd = action;
      batch.message = action === "pause" ? "正在暂停保存队列" : "正在继续保存队列";
      renderProgress();
    } else if (action === "cancel") {
      logCommandStart(action);
      batch.cancelled = true;
      batch.saving = false;
      batch.paused = false;
      batch.waitCmd = "";
      batch.message = "保存队列已取消";
    }
    try {
      await backend(action);
      if (action === "pause" || action === "resume") {
        batch.waitCmd = "";
        batch.paused = action === "pause";
        batch.message = batch.paused ? "保存队列已暂停" : "保存队列继续执行";
        renderProgress();
      }
    } catch (error) {
      if (action === "pause" || action === "resume") {
        batch.waitCmd = "";
      }
      batch.message = error?.message || String(error);
      renderProgress();
    }
  }

  function applyProgress(data) {
    if (batch.cancelled) {
      return;
    }
    if (data.stats) {
      batch.stats = { ...batch.stats, ...data.stats };
    }
    if (data.action === "pause" || data.action === "resume" || data.type === "save-done") {
      batch.waitCmd = "";
    }
    const done = data.type === "save-done";
    batch.saving = !done && data.running !== false;
    batch.paused = !!data.paused;
    batch.summary = done && !batch.uploadCloud ? true : batch.summary;
    if (done) {
      const hasError = !!data.error || batch.stats.failed > 0 || batch.stats.uploadFail > 0;
      log(hasError ? "warn" : "info", hasError ? "library-custom-name-save-failed" : "library-custom-name-save-success", hasError ? "库自定义名称保存完成但存在失败项" : "库自定义名称保存完成", {
        ...statsMeta(),
        durationMs: now() - (batch.saveStartedAt || now()),
        error: data.error || "",
      });
    }
    batch.message = done
      ? (batch.uploadCloud ? "本地写入完成，正在等待云端上传完成" : "保存队列已完成")
      : data.action === "pause"
        ? "保存队列已暂停"
        : data.action === "resume"
          ? "保存队列继续执行"
          : "正在逐条写入 Steam";

    const item = data.item || {};
    const row = batch.rowMap.get(Number(item.appid));
    if (row) {
      row.state = item.status || row.state;
      row.error = item.error || "";
      if (item.status === "success") {
        queueCloudUpload(row);
      }
      refreshProgressRow(row);
    }
    if (done) {
      renderVisibleRows();
      if (batch.uploadCloud) {
        finishCloudUploads();
      }
    } else {
      refreshSaveState();
    }
    if (!batch.progressClosed) {
      openProgress(batch.summary, false);
      renderProgressSoon(done && !batch.uploadCloud);
    }
  }

  function onModalClick(event) {
    if (event.target.id === MODAL) {
      return;
    }
    if (event.target.closest("[data-lcn-close]")) {
      onModalCloseClick(event);
      return;
    }
    const page = event.target.closest("[data-lcn-page]")?.dataset?.lcnPage;
    if (page) {
      event.preventDefault();
      if (page === "first") {
        batch.page = 1;
      } else if (page === "prev") {
        batch.page -= 1;
      } else if (page === "next") {
        batch.page += 1;
      } else if (page === "last") {
        batch.page = totalPages();
      }
      clampPage();
      renderVisibleRows();
      return;
    }
    const action = event.target.closest("[data-lcn-action]")?.dataset?.lcnAction;
    if (action === "query") {
      fetchCloudNames();
    } else if (action === "save") {
      save();
    }
  }

  function onProgressClick(event) {
    const action = event.target.closest("[data-lcn-progress]")?.dataset?.lcnProgress;
    if (!action) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (action === "hide") {
      closeProgress();
      return;
    }
    if (action === "cancel") {
      closeProgressAsk().catch(() => {});
      return;
    }
    if (action === "pause" || action === "resume") {
      cmd(action);
    }
  }

  async function onModalChange(event) {
    const policy = event.target.closest("input[name='st-lcn-policy']");
    if (policy) {
      batch.policy = ["cover", "hide", "skip", "rebuild-mnemonic"].includes(policy.value) ? policy.value : "hide";
      if (isRebuildMnemonicPolicy()) {
        batch.mnemonic = false;
      }
      applyLocalFilters();
      if (isRebuildMnemonicPolicy()) {
        rebuildMnemonicRows().catch((error) => {
          batch.message = error?.message || String(error);
          renderModal();
        });
      }
      return;
    }
    const upload = event.target.closest("[data-lcn-upload-cloud]");
    if (upload) {
      if (!upload.checked) {
        const ok = await oneConfirm(CLOUD_CANCEL_TEXT, {
          title: "确认关闭云端上传",
          cancel: "继续上传",
          confirm: "确认关闭",
        });
        if (!ok) {
          batch.uploadCloud = true;
          renderModal();
          return;
        }
      }
      batch.uploadCloud = !!upload.checked;
      return;
    }
    const check = event.target.closest("[data-lcn-check]");
    if (check) {
      const appid = Number(check.dataset.lcnCheck);
      const row = batch.rowMap.get(appid);
      if (row) {
        updateRowWrite(row, () => {
          row.checked = !!check.checked;
        });
        refreshLive(row);
      }
      return;
    }
    const mnemonic = event.target.closest("[data-lcn-mnemonic]");
    if (mnemonic) {
      if (isRebuildMnemonicPolicy()) {
        batch.mnemonic = false;
        mnemonic.checked = false;
        return;
      }
      applyMnemonicToRows(!!mnemonic.checked).catch((error) => {
        batch.mnemonic = !mnemonic.checked;
        batch.busy = false;
        batch.message = error?.message || String(error);
        renderModal();
      });
      return;
    }
    const type = event.target.closest("[data-lcn-type]");
    if (type) {
      batch.types[type.dataset.lcnType] = !!type.checked;
      applyLocalFilters();
    }
  }

  function onModalInput(event) {
    const input = event.target.closest("[data-lcn-name]");
    if (!input) {
      return;
    }
    const appid = Number(input.dataset.lcnName);
    const row = batch.rowMap.get(appid);
    if (!row) {
      return;
    }
    updateRowWrite(row, () => {
      row.want = input.value;
      row.checked = !!text(row.want);
      row.manual = text(row.want) !== text(row.apiName);
      row.cloudTouched = true;
      row.cloudQueued = false;
      row.state = "";
      row.error = "";
    });
    keepRowState(row);
    refreshLive(row);
  }

  function start() {
    if (s.started) {
      return { started: false, reason: "already-started" };
    }
    s.started = true;
    s.resObs = new MutationObserver((items) => {
      for (const item of items) {
        onQuery(item);
      }
    });
    s.resObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [RES_ATTR],
    });
    onQuery();
    tick();
    s.timer = window.setInterval(tick, LOOP_MS);
    s.stop = () => {
      if (s.resObs) {
        s.resObs.disconnect();
        s.resObs = null;
      }
      if (s.timer) {
        window.clearInterval(s.timer);
        s.timer = 0;
      }
      if (s.ch && typeof s.ch.close === "function") {
        s.ch.close();
        s.ch = null;
      }
      if (batch.progressTimer) {
        window.clearTimeout(batch.progressTimer);
        batch.progressTimer = 0;
      }
      if (s.oneResolve) {
        s.oneResolve(false);
        s.oneResolve = null;
      }
      s.oneBusy = false;
      document.getElementById(BAR)?.remove();
      document.getElementById(ONE)?.remove();
      document.getElementById(MODAL)?.remove();
      document.getElementById(PROGRESS)?.remove();
      s.started = false;
    };
    return { started: true, stop: s.stop };
  }

  window.SteamBuff.reg.addEntry(ID, "ui.js", start);
})();
