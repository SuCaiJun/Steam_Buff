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
  const BAR_FIXED = "st-lcn-bar-fixed";
  const ONE = "__RickyLibraryCustomNameOne";
  const MODAL = "__RickyLibraryCustomNameModal";
  const PROGRESS = "__RickyLibraryCustomNameProgress";
  const REQ_ATTR = "data-steam-buff-name-request";
  const RES_ATTR = "data-steam-buff-name-response";
  const LOOP_MS = 1200;
  const MOUNT_LOG_MS = 60000;
  const RESP_MS = 12000;
  const QUERY_MAX = 100;
  const BATCH_PAGE_SIZE = 120;
  const BACKEND_PAGE_SIZE = 1000;
  const APP_SCAN_YIELD = 2000;
  const SEARCH_DEBOUNCE_MS = 180;
  const SEARCH_SCAN_YIELD = 5000;
  const IMPORT_SCAN_YIELD = 1000;
  const CLOUD_UPLOAD_MAX = 100;
  const CLOUD_UPLOAD_DELAY_MS = 5000;
  const STEAM_CUSTOM_LIMIT = 10000;
  const STEAM_CUSTOM_BYTES = 3145728;
  const STEAM_CUSTOM_LIMIT_TIP = "该限制为 Steam 设置自定义排序名称的限制，超过后的自定义排序名称可能无法保存成功！";
  const CLOUD_TIP_TEXT = "将本次手动修改的自定义排序名称同步到素材君云端（Steam Buff 云端），帮助更多玩家获得更准确的名称建议。";
  const CLOUD_CANCEL_TEXT = "素材君云端共享可以帮助更多玩家获得更准确的自定义名称建议。本次保存将只写入本地 Steam 库，不再同步到素材君云端，确认关闭吗？";
  const CLOUD_TAG_RE = /\[[^\]\r\n]*\]\s*/g;
  const SORT_LABEL_RE = /自定义排序名称|自訂排序名稱|自定義排序名稱|Custom Sort|カスタムソート|カスタム並び替え|사용자 지정 정렬|사용자 정의 정렬/i;
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
    searchQuery: "",
    searchNeedle: "",
    searchRows: [],
    searchSeq: 0,
    searchTimer: 0,
    searchScanned: 0,
    searching: false,
    page: 1,
    selectedCount: 0,
    writeCount: 0,
    storageCapacity: emptyCapacity(),
    capacitySeq: 0,
    capacityTimer: 0,
    cloudQueue: [],
    cloudFlush: null,
    cloudFinishing: false,
    stats: emptyStats(),
    busy: false,
    saving: false,
    paused: false,
    cancelled: false,
    waitCmd: "",
    steamBatch: null,
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

  function searchText(value) {
    return text(value).toLocaleLowerCase();
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
      cloudBatches: 0,
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

  function nodeMeta(el) {
    if (!el) {
      return null;
    }
    return {
      tag: el.tagName || "",
      id: el.id || "",
      className: String(el.className || "").slice(0, 180),
      rect: rectMeta(el),
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
      cloudPending: batch.stats.cloudPending,
      cloudBatches: batch.stats.cloudBatches,
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

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
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

  function appidValue(value) {
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : 0;
  }

  function scanReactAppid(value, seen, depth) {
    if (!value || depth > 6 || (typeof value !== "object" && typeof value !== "function")) {
      return 0;
    }
    if (seen.has(value)) {
      return 0;
    }
    seen.add(value);
    let keys = [];
    try {
      keys = Object.keys(value).slice(0, 100);
    } catch {
      return 0;
    }
    for (const key of keys) {
      let next;
      try {
        next = value[key];
      } catch {
        continue;
      }
      if (/^(appid|appID|unAppID)$/i.test(key)) {
        const id = appidValue(next);
        if (id) {
          return id;
        }
      }
      const found = scanReactAppid(next, seen, depth + 1);
      if (found) {
        return found;
      }
    }
    return 0;
  }

  function reactAppid(input) {
    const nodes = [];
    let cur = input || null;
    for (let i = 0; cur && i < 10; i += 1, cur = cur.parentElement) {
      nodes.push(cur);
    }
    if (document.body) {
      // Steam 属性窗口的 AppID 挂在 React props 上，主库路由切换后仍以这里为准。
      nodes.push(document.body);
      nodes.push(...Array.from(document.body.querySelectorAll("main, section, div")).slice(0, 300));
    }
    const seen = new WeakSet();
    for (const node of nodes) {
      if (!node) {
        continue;
      }
      for (const key of Object.keys(node)) {
        if (!/^__react/.test(key)) {
          continue;
        }
        const id = scanReactAppid(node[key], seen, 0);
        if (id) {
          return id;
        }
      }
    }
    return 0;
  }

  function oneContext(input = sortInput()) {
    const appid = reactAppid(input) || currentAppid();
    return {
      appid,
      title: text(document.title),
    };
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
        flex: 0 0 100%;
        align-self: stretch;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        box-sizing: border-box;
        margin: 10px 0 0;
        padding: 0;
      }
      #${BAR}.${BAR_FIXED} {
        position: fixed;
        z-index: 2147483646;
        flex: none;
        align-self: auto;
        justify-content: center;
        width: max-content;
        max-width: min(360px, calc(100vw - 24px));
        margin: 0;
        padding: 4px;
        border-radius: 3px;
        background: rgba(15, 24, 34, .92);
        box-shadow: 0 8px 24px rgba(0, 0, 0, .28);
      }
      #${BAR}[hidden] {
        display: none;
      }
      #${BAR},
      #${BAR} * {
        -webkit-app-region: no-drag !important;
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
      #${ONE},
      #${MODAL},
      #${PROGRESS},
      #${ONE} *,
      #${MODAL} *,
      #${PROGRESS} * {
        -webkit-app-region: no-drag !important;
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
        z-index: 2147483647;
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
        z-index: 2147483647;
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
        display: inline-flex;
        align-items: center;
        gap: 4px;
        min-height: 30px;
        margin-left: 2px;
      }
      #${BAR} .st-lcn-tip,
      #${MODAL} .st-lcn-tip {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 3px;
        cursor: help;
      }
      #${BAR} .st-lcn-tip {
        cursor: pointer;
      }
      #${BAR} .st-lcn-btn .st-lcn-tip {
        pointer-events: auto;
      }
      #${BAR} .st-lcn-tip-mark,
      #${MODAL} .st-lcn-tip-mark {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 14px;
        height: 14px;
        border: 1px solid rgba(102, 192, 244, .75);
        border-radius: 50%;
        color: #66c0f4;
        background: rgba(102, 192, 244, .12);
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
      }
      #${MODAL} .st-lcn-tip-text {
        cursor: help;
      }
      #${BAR} .st-lcn-tip:hover .st-lcn-tip-mark,
      #${BAR} .st-lcn-tip:focus .st-lcn-tip-mark,
      #${MODAL} .st-lcn-tip:hover .st-lcn-tip-mark,
      #${MODAL} .st-lcn-tip:focus .st-lcn-tip-mark {
        color: #fff;
        border-color: rgba(102, 192, 244, .95);
        background: rgba(102, 192, 244, .28);
      }
      #${BAR} .st-lcn-tip-popover,
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
      #${MODAL} .st-lcn-tip:focus .st-lcn-tip-popover,
      #${BAR} .st-lcn-tip:hover .st-lcn-tip-popover,
      #${BAR} .st-lcn-tip:focus .st-lcn-tip-popover {
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
      #${MODAL} .st-lcn-selectbar {
        display: flex;
        justify-content: flex-start;
        align-items: center;
        gap: 10px;
        margin-top: 8px;
      }
      #${MODAL} .st-lcn-select-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      #${MODAL} .st-lcn-filter-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-left: auto;
      }
      #${MODAL} .st-lcn-search {
        width: min(310px, 34vw);
        height: 28px;
        border: 1px solid rgba(102, 192, 244, .28);
        border-radius: 2px;
        padding: 4px 8px;
        color: #dfe3e6;
        background: rgba(5, 8, 12, .88);
        font-size: 12px;
      }
      #${MODAL} .st-lcn-search:focus {
        outline: none;
        border-color: rgba(102, 192, 244, .78);
        box-shadow: 0 0 0 1px rgba(102, 192, 244, .2);
      }
      #${MODAL} .st-lcn-file {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
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

  function visibleInViewport(el) {
    const rect = el?.getBoundingClientRect?.();
    if (!rect || rect.width <= 30 || rect.height <= 12) {
      return false;
    }
    if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= window.innerWidth || rect.top >= window.innerHeight) {
      return false;
    }
    let cur = el.parentElement;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      if (isClipped(cur)) {
        const clip = cur.getBoundingClientRect();
        if (rect.right <= clip.left || rect.left >= clip.right || rect.bottom <= clip.top || rect.top >= clip.bottom) {
          return false;
        }
      }
      cur = cur.parentElement;
    }
    return true;
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

  function textInputs() {
    return Array.from(document.querySelectorAll("input[type='text'], input:not([type])"))
      .filter(visible);
  }

  function inputMeta(input) {
    return {
      placeholder: String(input?.placeholder || "").slice(0, 80),
      ariaLabel: String(input?.getAttribute?.("aria-label") || "").slice(0, 80),
      rect: rectMeta(input),
      nearText: nearText(input).slice(0, 220),
      parent: nodeMeta(input?.parentElement || null),
    };
  }

  function inputSamples(inputs) {
    return inputs.slice(0, 5).map(inputMeta);
  }

  function sortInput(inputs = textInputs()) {
    return inputs.find(input => SORT_LABEL_RE.test(nearText(input)))
      || inputs.find(input => /排序|sort/i.test(input.placeholder || input.getAttribute("aria-label") || ""))
      || null;
  }

  function customPageHint(inputs = []) {
    if (inputs.some(input => SORT_LABEL_RE.test(nearText(input)))) {
      return true;
    }
    const body = String(document.body?.textContent || "").replace(/\s+/g, " ").slice(0, 12000);
    if (SORT_LABEL_RE.test(body)) {
      return true;
    }
    return /自定义|Custom|自訂|自定義|カスタム|사용자/i.test(body) &&
      /宽幅封面图片|徽标|標誌|背景|Logo|Wide capsule|カプセル|캡슐/i.test(body);
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

  function isClipped(el) {
    const style = window.getComputedStyle?.(el);
    if (!style) {
      return false;
    }
    return /hidden|clip|scroll|auto/i.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`);
  }

  function isRowCandidate(input, el) {
    if (!el || el === document.body || el === document.documentElement) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    const inputRect = input?.getBoundingClientRect?.();
    if (!rect || !inputRect || rect.width < inputRect.width || rect.height < inputRect.height) {
      return false;
    }
    const text = String(el.textContent || "").replace(/\s+/g, " ").trim();
    if (!SORT_LABEL_RE.test(text)) {
      return false;
    }
    return rect.width <= Math.max(inputRect.width + 720, inputRect.width * 4) &&
      rect.height <= Math.max(inputRect.height + 260, inputRect.height * 8);
  }

  function fieldRow(input) {
    let cur = input?.parentElement || null;
    let best = null;
    for (let i = 0; cur && i < 9; i += 1, cur = cur.parentElement) {
      if (isRowCandidate(input, cur)) {
        best = cur;
      }
    }
    return best;
  }

  function rowControl(row, input) {
    if (!row) {
      return null;
    }
    let cur = input?.parentElement || null;
    let best = null;
    while (cur && cur !== row) {
      const rect = cur.getBoundingClientRect();
      const inputRect = input?.getBoundingClientRect?.();
      if (rect?.width >= inputRect?.width && !isClipped(cur)) {
        best = cur;
      }
      cur = cur.parentElement;
    }
    return best || input?.parentElement || row;
  }

  function clampRect(rect) {
    const width = Math.round(window.innerWidth || document.documentElement?.clientWidth || 0);
    const height = Math.round(window.innerHeight || document.documentElement?.clientHeight || 0);
    if (!rect || width <= 0 || height <= 0) {
      return null;
    }
    const out = {
      left: Math.max(0, Math.min(width, rect.left)),
      top: Math.max(0, Math.min(height, rect.top)),
      right: Math.max(0, Math.min(width, rect.right)),
      bottom: Math.max(0, Math.min(height, rect.bottom)),
    };
    out.width = out.right - out.left;
    out.height = out.bottom - out.top;
    return out.width > 160 && out.height > 80 ? out : null;
  }

  // 三个按钮只悬浮在属性面板底部，不插入 Steam 字段 DOM，避免 React/flex 布局把输入框挤窄。
  function fixedArea(input) {
    const rect = input?.getBoundingClientRect?.();
    if (!rect) {
      return null;
    }
    const minWidth = Math.max(320, rect.width + 120);
    const minHeight = Math.max(220, rect.height * 8);
    let cur = input?.parentElement || null;
    const candidates = [];
    for (let i = 0; cur && i < 12; i += 1, cur = cur.parentElement) {
      if (cur === document.body || cur === document.documentElement) {
        break;
      }
      const areaRect = clampRect(cur.getBoundingClientRect?.());
      if (!areaRect || areaRect.width < minWidth || areaRect.height < minHeight) {
        continue;
      }
      candidates.push({
        el: cur,
        rect: areaRect,
        mode: "fixed-area-bottom",
        clipped: isClipped(cur),
      });
    }

    // 右侧内容区通常从侧栏之后开始；优先选择这个稳定区域，避免滚动时在小卡片和外层容器间横跳。
    const pool = candidates.filter(item => item.rect.left >= 120);
    const list = pool.length ? pool : candidates;
    const best = list
      .map(item => ({
        ...item,
        score: item.rect.width * item.rect.height + (item.clipped ? 100000000 : 0),
      }))
      .sort((a, b) => b.score - a.score)[0] || null;
    if (best) {
      return { el: best.el, rect: best.rect, mode: best.mode };
    }
    const viewport = clampRect({
      left: 0,
      top: 0,
      right: window.innerWidth || document.documentElement?.clientWidth || 0,
      bottom: window.innerHeight || document.documentElement?.clientHeight || 0,
    });
    return viewport ? { el: document.body, rect: viewport, mode: "fixed-viewport-bottom" } : null;
  }

  function barHost(input) {
    const area = fixedArea(input);
    return area ? { box: document.body, originalBox: area.el, row: null, mode: area.mode } : null;
  }

  function fixedBar(input, bar) {
    const area = fixedArea(input);
    if (!area?.rect || !bar) {
      return null;
    }
    document.body?.appendChild(bar);
    bar.classList.add(BAR_FIXED);
    bar.hidden = false;
    bar.style.visibility = "hidden";
    const barWidth = Math.max(220, Math.ceil(bar.offsetWidth || 0));
    const barHeight = Math.max(38, Math.ceil(bar.offsetHeight || 0));
    const pad = 12;
    const leftMin = area.rect.left + pad;
    const leftMax = Math.max(leftMin, area.rect.right - barWidth - pad);
    const topMin = area.rect.top + pad;
    const topMax = Math.max(topMin, area.rect.bottom - barHeight - pad);
    const desiredLeft = area.rect.left + (area.rect.width - barWidth) / 2;
    const left = Math.round(Math.min(Math.max(leftMin, desiredLeft), leftMax));
    const top = Math.round(Math.min(Math.max(topMin, area.rect.bottom - barHeight - pad), topMax));
    bar.style.left = `${left}px`;
    bar.style.top = `${top}px`;
    bar.style.visibility = "";
    return area;
  }

  function clearFixed(bar) {
    if (!bar) {
      return;
    }
    bar.classList.remove(BAR_FIXED);
    bar.style.left = "";
    bar.style.top = "";
    bar.style.visibility = "";
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

  function storageCapacity(items) {
    return backend("storage-capacity", {
      items: Array.isArray(items) ? items : [],
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
    if (batch.policy === "current-custom") {
      return hasCustom(row);
    }
    if (batch.policy === "rebuild-mnemonic") {
      return hasCustom(row);
    }
    return true;
  }

  function isCurrentCustomPolicy() {
    return batch.policy === "current-custom";
  }

  function hasStoredState(old) {
    return !!old && Object.prototype.hasOwnProperty.call(old, "checked");
  }

  function makeRow(app, old) {
    const appid = Number(app.appid);
    const custom = text(app.current_custom_name);
    const cloud = batch.cloudMap.get(appid) || "";
    const manual = !!old?.manual;
    const cloudTouched = !!old?.cloudTouched;
    const stored = hasStoredState(old);
    let want = manual ? text(old.want) : "";
    let checked = !!old?.checked;
    let source = old?.cloudSource || "";

    if (!manual && isCurrentCustomPolicy()) {
      want = custom;
      checked = stored ? !!old.checked : false;
      source = "local";
    } else if (!manual && batch.policy === "rebuild-mnemonic") {
      want = custom;
      checked = false;
      source = "local";
    } else if (!manual && cloud) {
      want = cloud;
      checked = (stored ? !!old.checked : true) && !(batch.policy === "skip" && hasCustom(app));
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
    if (!row.checked || !text(row.want)) {
      return false;
    }
    if (isCurrentCustomPolicy() && row.cloudSource === "local" && row.manual !== true) {
      return false;
    }
    return true;
  }

  function isRebuildMnemonicPolicy() {
    return batch.policy === "rebuild-mnemonic";
  }

  function refreshRowSearch(row) {
    if (!row) {
      return "";
    }
    row.searchText = searchText(`${row.appid} ${row.official} ${row.apiName} ${row.custom} ${row.want}`);
    return row.searchText;
  }

  function searchActive() {
    return !!batch.searchNeedle;
  }

  function activeRows() {
    return searchActive() ? batch.searchRows : batch.rows;
  }

  function rowMatchesSearch(row, needle = batch.searchNeedle) {
    if (!needle) {
      return true;
    }
    return (row?.searchText || refreshRowSearch(row)).includes(needle);
  }

  function selectedRows() {
    return activeRows().filter(row => row.checked);
  }

  function canQueryCloud() {
    if (isRebuildMnemonicPolicy()) {
      return false;
    }
    if (!searchActive()) {
      return batch.selectedCount > 0;
    }
    return activeRows().some(row => row.checked);
  }

  function totalPages() {
    return Math.max(1, Math.ceil(activeRows().length / BATCH_PAGE_SIZE));
  }

  function clampPage() {
    batch.page = Math.min(Math.max(1, Number(batch.page) || 1), totalPages());
  }

  function visibleRows() {
    clampPage();
    const rows = activeRows();
    const start = (batch.page - 1) * BATCH_PAGE_SIZE;
    return rows.slice(start, start + BATCH_PAGE_SIZE);
  }

  function visibleRange() {
    const rows = activeRows();
    if (!rows.length) {
      return { from: 0, to: 0 };
    }
    const from = (batch.page - 1) * BATCH_PAGE_SIZE + 1;
    return {
      from,
      to: Math.min(rows.length, from + BATCH_PAGE_SIZE - 1),
    };
  }

  function emptyCapacity() {
    return {
      ok: false,
      count: 0,
      pendingCount: 0,
      currentBytes: 0,
      pendingBytes: 0,
      projectedBytes: 0,
      limit: STEAM_CUSTOM_LIMIT,
      limitBytes: STEAM_CUSTOM_BYTES,
      reason: "",
    };
  }

  function capacityItems() {
    const items = [];
    for (const row of batch.rows) {
      if (canWrite(row)) {
        items.push({ appid: row.appid, name: row.want });
      }
    }
    return items;
  }

  function normalizeCapacity(data) {
    const base = emptyCapacity();
    return {
      ...base,
      ...data,
      ok: data?.ok === true,
      count: Math.max(0, Number(data?.count) || 0),
      pendingCount: Math.max(0, Number(data?.pendingCount) || 0),
      currentBytes: Math.max(0, Number(data?.currentBytes) || 0),
      pendingBytes: Math.max(0, Number(data?.pendingBytes) || 0),
      projectedBytes: Math.max(0, Number(data?.projectedBytes) || 0),
      limit: Math.max(1, Number(data?.limit) || STEAM_CUSTOM_LIMIT),
      limitBytes: Math.max(1, Number(data?.limitBytes) || STEAM_CUSTOM_BYTES),
      reason: text(data?.reason),
    };
  }

  function formatMb(bytes, fixed = true) {
    const mb = Math.max(0, Number(bytes) || 0) / 1048576;
    if (!fixed && Math.abs(mb - Math.round(mb)) < 0.0001) {
      return String(Math.round(mb));
    }
    return mb.toFixed(4);
  }

  function customLimitLine() {
    const meta = customLimitMeta(batch.writeCount);
    const current = batch.storageCapacity?.ok ? batch.storageCapacity.count : meta.current;
    return `${meta.pending}/${current}/${meta.limit}`;
  }

  function capacityLine() {
    const cap = batch.storageCapacity || emptyCapacity();
    return `${formatMb(cap.pendingBytes)}/${formatMb(cap.currentBytes)}/${formatMb(cap.limitBytes, false)}MB`;
  }

  function storageLimitTipHtml(label) {
    const tip = STEAM_CUSTOM_LIMIT_TIP;
    return `<span class="st-lcn-tip st-lcn-limit-tip" tabindex="0" aria-label="${attr(tip)}"><span class="st-lcn-tip-text">${esc(label)}</span><span class="st-lcn-tip-mark" aria-hidden="true">?</span><span class="st-lcn-tip-popover" role="tooltip">${esc(tip)}</span></span>`;
  }

  function previewMessageHtml() {
    const skipped = Math.max(0, batch.rows.length - batch.writeCount);
    const search = searchActive() ? `，搜索 ${activeRows().length}/${batch.rows.length}` : "";
    return `加载完成${search}，已选 ${batch.selectedCount} 项，待写入 ${batch.writeCount} 项，跳过 ${skipped} 项，${storageLimitTipHtml("上限")} ${esc(customLimitLine())} 项，${storageLimitTipHtml("容量")} ${esc(capacityLine())}`;
  }

  function messageHtml() {
    if (batch.message === previewMessage()) {
      return previewMessageHtml();
    }
    return esc(batch.message);
  }

  function refreshStorageCapacitySoon(delay = 180) {
    if (batch.capacityTimer) {
      window.clearTimeout(batch.capacityTimer);
    }
    const seq = batch.capacitySeq + 1;
    batch.capacitySeq = seq;
    batch.capacityTimer = window.setTimeout(() => {
      batch.capacityTimer = 0;
      refreshStorageCapacity(seq).catch(() => {});
    }, Math.max(0, delay));
  }

  async function refreshStorageCapacity(seq = batch.capacitySeq + 1) {
    batch.capacitySeq = seq;
    const data = await storageCapacity(capacityItems());
    if (seq !== batch.capacitySeq) {
      return;
    }
    batch.storageCapacity = normalizeCapacity(data);
    if (!batch.busy && !batch.saving && batch.rows.length) {
      batch.message = previewMessage();
      refreshMessage();
    }
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
    let selected = 0;
    const map = new Map();
    for (let i = 0; i < batch.rows.length; i += 1) {
      const row = batch.rows[i];
      row.index = i;
      row.viewIndex = i;
      refreshRowSearch(row);
      map.set(Number(row.appid), row);
      if (row.checked) {
        selected += 1;
      }
      if (canWrite(row)) {
        write += 1;
      }
    }
    batch.rowMap = map;
    batch.selectedCount = selected;
    batch.writeCount = write;
    clampPage();
    refreshSkip();
    refreshStorageCapacitySoon();
  }

  function clearRows() {
    batch.rows = [];
    batch.rowMap = new Map();
    batch.searchRows = [];
    batch.searchScanned = 0;
    batch.searching = false;
    batch.page = 1;
    batch.selectedCount = 0;
    batch.writeCount = 0;
    refreshSkip();
  }

  function clearLocalRows() {
    batch.localRows = [];
    batch.cloudMap = new Map();
    batch.stateMap = new Map();
    batch.searchQuery = "";
    batch.searchNeedle = "";
    batch.searchSeq += 1;
    batch.storageCapacity = emptyCapacity();
    resetSearchState();
    clearRows();
  }

  function setRows(rows) {
    batch.rows = Array.isArray(rows) ? rows : [];
    batch.page = 1;
    refreshCounts();
    if (searchActive()) {
      batch.searchSeq += 1;
      scheduleSearch(false);
    }
  }

  function appendRows(rows) {
    const list = Array.isArray(rows) ? rows : [];
    for (const row of list) {
      row.index = batch.rows.length;
      row.viewIndex = row.index;
      refreshRowSearch(row);
      batch.rows.push(row);
      batch.rowMap.set(Number(row.appid), row);
      if (row.checked) {
        batch.selectedCount += 1;
      }
      if (canWrite(row)) {
        batch.writeCount += 1;
      }
    }
    clampPage();
    refreshSkip();
    refreshStorageCapacitySoon();
    if (searchActive()) {
      batch.searchSeq += 1;
      scheduleSearch(false);
    }
  }

  function clearSearchTimer() {
    if (batch.searchTimer) {
      window.clearTimeout(batch.searchTimer);
      batch.searchTimer = 0;
    }
  }

  function resetSearchState() {
    clearSearchTimer();
    batch.searchRows = [];
    batch.searchScanned = 0;
    batch.searching = false;
  }

  function setSearchRows(rows, scanned, searching) {
    const list = Array.isArray(rows) ? rows : [];
    batch.searchRows = list;
    batch.searchScanned = Math.max(0, Number(scanned) || 0);
    batch.searching = !!searching;
    clampPage();
  }

  async function runSearch(seq) {
    const needle = batch.searchNeedle;
    const rows = batch.rows;
    if (!needle) {
      resetSearchState();
      renderVisibleRows();
      return;
    }
    const matched = [];
    batch.searching = true;
    for (let i = 0; i < rows.length; i += 1) {
      if (seq !== batch.searchSeq || needle !== batch.searchNeedle) {
        return;
      }
      const row = rows[i];
      if (rowMatchesSearch(row, needle)) {
        row.viewIndex = matched.length;
        matched.push(row);
      }
      if (i > 0 && i % SEARCH_SCAN_YIELD === 0) {
        setSearchRows(matched, i, true);
        renderVisibleRows();
        await yieldUI();
      }
    }
    if (seq !== batch.searchSeq || needle !== batch.searchNeedle) {
      return;
    }
    setSearchRows(matched, rows.length, false);
    batch.page = 1;
    renderVisibleRows();
  }

  function scheduleSearch(debounce = true) {
    clearSearchTimer();
    const seq = batch.searchSeq;
    if (!searchActive()) {
      resetSearchState();
      renderVisibleRows();
      return;
    }
    batch.searchRows = [];
    batch.searchScanned = 0;
    batch.searching = true;
    const start = () => runSearch(seq).catch((error) => {
      if (seq === batch.searchSeq) {
        batch.searching = false;
        batch.message = error?.message || String(error);
        renderVisibleRows();
      }
    });
    if (debounce) {
      batch.searchTimer = window.setTimeout(() => {
        batch.searchTimer = 0;
        start();
      }, SEARCH_DEBOUNCE_MS);
    } else {
      start();
    }
  }

  function setSearchQuery(value) {
    batch.searchQuery = String(value || "");
    batch.searchNeedle = searchText(batch.searchQuery);
    batch.searchSeq += 1;
    batch.page = 1;
    if (!batch.searchNeedle) {
      resetSearchState();
      renderVisibleRows();
      return;
    }
    scheduleSearch(true);
  }

  function readJsonFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("JSON 文件读取失败"));
      reader.readAsText(file, "utf-8");
    });
  }

  function addImportName(map, appid, name) {
    const id = Number(appid);
    const value = text(name);
    if (Number.isFinite(id) && id > 0 && value) {
      map.set(id, value);
    }
  }

  function parseImportNames(raw) {
    const data = JSON.parse(raw);
    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) {
      throw new Error("JSON 格式应包含 items 数组");
    }
    const map = new Map();
    for (const item of items) {
      addImportName(map, item?.appid, item?.name);
    }
    return map;
  }

  async function applyImportedNames(names, seq) {
    let matched = 0;
    let applied = 0;
    const total = batch.rows.length;
    for (let i = 0; i < total; i += 1) {
      if (seq !== batch.previewSeq) {
        return { matched, applied, cancelled: true };
      }
      const row = batch.rows[i];
      const name = names.get(Number(row?.appid));
      if (name) {
        matched += 1;
        updateRowWrite(row, () => {
          row.want = name;
          row.checked = true;
          row.manual = true;
          row.cloudTouched = true;
          row.mnemonicTouched = false;
          row.state = "";
          row.error = "";
          refreshRowSearch(row);
        });
        keepRowState(row);
        applied += 1;
      }
      if (i > 0 && i % IMPORT_SCAN_YIELD === 0) {
        batch.message = `正在导入 JSON ${i}/${total}`;
        refreshMessage();
        await yieldUI();
      }
    }
    return { matched, applied, cancelled: false };
  }

  async function importJsonFile(file) {
    if (!file) {
      return;
    }
    if (!batch.rows.length) {
      batch.message = "请先加载本地列表";
      renderModal();
      return;
    }
    const seq = batch.previewSeq;
    batch.busy = true;
    batch.message = "正在读取 JSON 文件";
    renderModal();
    try {
      const raw = await readJsonFile(file);
      const names = parseImportNames(raw);
      if (!names.size) {
        throw new Error("JSON 中没有识别到 appid/name");
      }
      batch.message = `正在匹配 JSON ${names.size} 项`;
      refreshMessage();
      const result = await applyImportedNames(names, seq);
      if (result.cancelled) {
        return;
      }
      if (searchActive()) {
        batch.searchSeq += 1;
        scheduleSearch(false);
      }
      batch.message = `导入完成，匹配 ${result.matched} 项，填入 ${result.applied} 项`;
      log("info", "library-custom-name-import-success", "库自定义名称 JSON 导入完成", {
        imported: names.size,
        matched: result.matched,
        applied: result.applied,
      });
    } catch (error) {
      batch.message = error?.message || String(error);
      log("error", "library-custom-name-import-failed", "库自定义名称 JSON 导入失败", {
        error: error?.message || String(error),
      });
    } finally {
      if (seq === batch.previewSeq) {
        batch.busy = false;
        refreshCounts();
        renderModal();
      }
    }
  }

  function updateRowWrite(row, apply) {
    const beforeSelected = !!row.checked;
    const before = canWrite(row);
    apply();
    const afterSelected = !!row.checked;
    const after = canWrite(row);
    if (beforeSelected !== afterSelected) {
      batch.selectedCount += afterSelected ? 1 : -1;
    }
    if (before !== after) {
      batch.writeCount += after ? 1 : -1;
      refreshSkip();
    }
    refreshStorageCapacitySoon();
  }

  function previewMessage() {
    const skipped = Math.max(0, batch.rows.length - batch.writeCount);
    const search = searchActive() ? `，搜索 ${activeRows().length}/${batch.rows.length}` : "";
    return `加载完成${search}，已选 ${batch.selectedCount} 项，待写入 ${batch.writeCount} 项，跳过 ${skipped} 项，上限 ${customLimitLine()} 项，容量 ${capacityLine()}`;
  }

  function customLimitMeta(pending) {
    let current = batch.storageCapacity?.ok ? Number(batch.storageCapacity.count) || 0 : 0;
    if (!batch.storageCapacity?.ok) {
      for (const row of batch.localRows) {
        if (hasCustom(row)) {
          current += 1;
        }
      }
    }
    const count = Math.max(0, Number(pending) || 0);
    return {
      current,
      pending: count,
      projected: current + count,
      limit: STEAM_CUSTOM_LIMIT,
    };
  }

  async function confirmSteamLimit(pending) {
    const meta = customLimitMeta(pending);
    if (meta.projected <= meta.limit) {
      return true;
    }
    log("warn", "library-custom-name-save-limit-warning", "库自定义名称保存可能超过 Steam 云端存储数量限制", meta);
    return oneConfirm(`当前自定义名称数量超过1万，无法存储到 Steam 云端，是否继续？当前已有 ${meta.current} 项，本次待写入 ${meta.pending} 项，合计 ${meta.projected} 项。`, {
      title: "Steam 云端存储风险",
      cancel: "取消",
      confirm: "继续保存",
    });
  }

  function resetCloudUpload() {
    batch.cloudQueue = [];
    batch.cloudFlush = null;
    batch.cloudFinishing = false;
    batch.stats.cloudOk = 0;
    batch.stats.cloudFail = 0;
    batch.stats.cloudSkipped = 0;
    batch.stats.cloudPending = 0;
    batch.stats.cloudBatches = 0;
  }

  function cloudPayload(row) {
    if (!batch.uploadCloud || !row || !row.checked || row.cloudTouched !== true || row.manual !== true) {
      return null;
    }
    const custom = stripCloudName(row.want);
    const api = stripCloudName(row.apiName);
    // 只同步用户真正填写或改写的正文；API 原样名和自动助记符不作为社区贡献。
    if (!custom || (api && custom === api) || !text(row.official)) {
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

  async function waitCloudResume() {
    while (batch.paused && !batch.cancelled) {
      if (batch.cloudFinishing && !batch.saving) {
        batch.message = "素材君云端上传已暂停";
        renderProgressSoon();
      }
      await sleep(200);
    }
  }

  async function waitCloudDelay() {
    let left = CLOUD_UPLOAD_DELAY_MS;
    while (left > 0 && !batch.cancelled) {
      await waitCloudResume();
      const step = Math.min(250, left);
      const started = now();
      await sleep(step);
      if (!batch.paused) {
        left -= Math.max(0, now() - started);
      }
    }
  }

  function prepareCloudUploads(rows) {
    resetCloudUpload();
    if (!batch.uploadCloud) {
      return;
    }
    const list = Array.isArray(rows) ? rows : [];
    let skipped = 0;
    for (const row of list) {
      const item = cloudPayload(row);
      if (item) {
        batch.cloudQueue.push(item);
      } else {
        skipped += 1;
      }
    }
    batch.stats.cloudPending = batch.cloudQueue.length;
    batch.stats.cloudSkipped = skipped;
    log("info", "library-custom-name-cloud-upload-queue", "库自定义名称素材君云端上传队列已生成", {
      candidates: list.length,
      queued: batch.cloudQueue.length,
      skipped,
      batchSize: CLOUD_UPLOAD_MAX,
      delayMs: CLOUD_UPLOAD_DELAY_MS,
    });
  }

  function flushCloudUploads() {
    if (batch.cloudFlush) {
      return batch.cloudFlush;
    }
    batch.cloudFlush = (async () => {
      const startedAt = now();
      log("info", "library-custom-name-cloud-upload-start", "开始上传库自定义名称到素材君云端", {
        queued: batch.cloudQueue.length,
        batchSize: CLOUD_UPLOAD_MAX,
        delayMs: CLOUD_UPLOAD_DELAY_MS,
      });
      try {
        while (batch.cloudQueue.length && !batch.cancelled) {
          await waitCloudResume();
          if (batch.cancelled) {
            break;
          }
          const chunk = batch.cloudQueue.splice(0, CLOUD_UPLOAD_MAX);
          batch.stats.cloudPending = Math.max(0, batch.stats.cloudPending - chunk.length);
          batch.stats.cloudBatches += 1;
          try {
            const res = await feedback({ items: chunk });
            const count = countCloudResult(res, chunk.length);
            batch.stats.cloudOk += count.ok;
            batch.stats.cloudFail += count.fail;
            if (count.fail > 0) {
              log("warn", "library-custom-name-cloud-upload-batch-failed", "库自定义名称素材君云端上传批次存在失败项", {
                size: chunk.length,
                ok: count.ok,
                fail: count.fail,
                pending: batch.stats.cloudPending,
              });
            }
          } catch (error) {
            batch.stats.cloudFail += chunk.length;
            log("warn", "library-custom-name-cloud-upload-batch-failed", "库自定义名称素材君云端上传批次失败", {
              size: chunk.length,
              pending: batch.stats.cloudPending,
              error: error?.message || String(error),
            });
          }
          renderProgressSoon();
          if (batch.cloudQueue.length && !batch.cancelled) {
            await waitCloudDelay();
          }
        }
      } finally {
        const cancelled = !!batch.cancelled;
        const dropped = batch.cloudQueue.splice(0).length;
        if (dropped) {
          batch.stats.cloudPending = 0;
        }
        log(cancelled || batch.stats.cloudFail > 0 ? "warn" : "info", cancelled ? "library-custom-name-cloud-upload-cancelled" : "library-custom-name-cloud-upload-success", cancelled ? "库自定义名称素材君云端上传已取消" : "库自定义名称素材君云端上传完成", {
          ...statsMeta(),
          dropped,
          durationMs: now() - startedAt,
        });
        batch.cloudFlush = null;
        batch.cloudFinishing = false;
        if (!batch.saving) {
          batch.summary = true;
          batch.message = cancelled ? "保存队列已取消" : "保存队列已完成";
          renderVisibleRows();
          renderProgressSoon(true);
        } else {
          renderProgressSoon();
        }
      }
    })();
    return batch.cloudFlush;
  }

  function startCloudUploads() {
    if (!batch.uploadCloud || !batch.cloudQueue.length) {
      return;
    }
    batch.cloudFinishing = true;
    batch.message = "正在写入 Steam，素材君云端上传同步进行";
    flushCloudUploads().catch(() => {});
  }

  function cancelCloudUploads(reason) {
    const active = batch.cloudFinishing || batch.cloudFlush || batch.cloudQueue.length || batch.stats.cloudPending > 0;
    const dropped = batch.cloudQueue.splice(0).length;
    if (dropped) {
      batch.stats.cloudPending = 0;
    }
    if (!batch.cloudFlush) {
      batch.cloudFinishing = false;
    }
    if (!active && !dropped) {
      return;
    }
    log("info", "library-custom-name-cloud-upload-cancel", "库自定义名称素材君云端上传队列已取消", {
      reason: reason || "cancel",
      dropped,
      ...statsMeta(),
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
        <div class="st-lcn-one-head"><h3>上传素材君云端</h3></div>
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
      const ctx = oneContext(input);
      let cur = null;
      try {
        cur = await backend("current-app", ctx);
      } catch {
      }
      const appid = Number(cur?.app?.appid) || Number(ctx.appid) || currentAppid();
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
    const ctx = oneContext(input);
    let cur = null;
    try {
      cur = await backend("current-app", ctx);
    } catch {
    }
    const app = cur?.app || {};
    const appid = Number(app.appid) || Number(ctx.appid) || currentAppid();
    if (!appid) {
      oneResult("上传素材君云端失败", "未识别当前游戏 AppID");
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
    oneBox("上传云端", "正在提交...", false);
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
    const tip = CLOUD_TIP_TEXT;
    bar.innerHTML = `
      <button class="st-lcn-btn" type="button" data-lcn-one>获取</button>
      <button class="st-lcn-btn" type="button" data-lcn-batch>批量</button>
      <button class="st-lcn-btn" type="button" data-lcn-feedback aria-label="上传云端">
        <span class="st-lcn-tip" tabindex="0" aria-label="${attr(tip)}">
          <span class="st-lcn-tip-text">上传云端</span>
          <span class="st-lcn-tip-mark" aria-hidden="true">?</span>
          <span class="st-lcn-tip-popover" role="tooltip">${esc(tip)}</span>
        </span>
      </button>
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
      openFeedback().catch((error) => oneResult("上传素材君云端失败", error?.message || String(error)));
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
    const host = barHost(input);
    let bar = document.getElementById(BAR);
    clearBars(bar);
    if (!bar) {
      bar = makeBar();
    }
    clearFixed(bar);
    bar.hidden = false;

    const area = fixedBar(input, bar);
    if (area) {
      return {
        ok: true,
        bar,
        box: bar.parentElement,
        originalBox: area.el || host?.originalBox || null,
        row: null,
        mode: area.mode || host?.mode || "fixed-area-bottom",
      };
    }
    clearBars(null);
    return { ok: false, reason: "host-missing" };
  }

  // tick 是低频驻留扫描，负责在 Steam 切换库详情或 React 重挂输入框后补回三个按钮。
  function tick() {
    css();
    const inputs = textInputs();
    const input = sortInput(inputs);
    const active = !!input || customPageHint(inputs);
    if (!active) {
      clearBars(null);
      return;
    }

    logMountState(
      `ui-start:${document.title}`,
      "info",
      "library-custom-name-ui-start",
      "库自定义名称界面入口已进入目标页"
    );
    if (!input) {
      clearBars(null);
      logMountState(
        `input-missing:${document.title}:${inputs.length}`,
        "info",
        "library-custom-name-mount-input-missing",
        "库自定义名称按钮未找到自定义排序名称输入框",
        {
          inputCount: inputs.length,
          inputSamples: inputSamples(inputs),
        }
      );
      return;
    }

    const result = insertBar(input);
    if (!result.ok) {
      logMountState(
        `host-missing:${document.title}:${inputs.length}`,
        "warn",
        "library-custom-name-mount-host-missing",
        "库自定义名称按钮未找到可挂载容器",
        {
          inputCount: inputs.length,
          input: inputMeta(input),
        }
      );
      return;
    }

    const visibleBar = visibleInViewport(result.bar) && !result.bar.hidden;
    logMountState(
      `mounted:${document.title}:${visibleBar}:${result.mode}:${result.box?.className || ""}`,
      visibleBar ? "info" : "warn",
      visibleBar ? "library-custom-name-mount-success" : "library-custom-name-mount-invisible",
      visibleBar ? "库自定义名称按钮挂载完成" : "库自定义名称按钮已挂载但当前不可见",
      {
        inputCount: inputs.length,
        mode: result.mode || "",
        input: inputMeta(input),
        host: nodeMeta(result.box),
        originalHost: nodeMeta(result.originalBox),
        row: nodeMeta(result.row),
        bar: nodeMeta(result.bar),
      }
    );
  }

  function progressLine() {
    const st = batch.stats;
    const synced = batch.uploadCloud ? st.cloudOk : 0;
    return `总计:${st.total}，处理:${st.processed}，跳过:${st.skipped}，失败:${st.failed}，同步:${synced}`;
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
          <h3>${summary ? "修改结果" : cloud ? "素材君云端上传" : "保存进度"}</h3>
        </div>
        <div class="st-lcn-progress-body">
          <div class="st-lcn-progress-msg">${esc(summary ? "修改完成" : batch.message)}</div>
          <div class="st-lcn-progress-bar" aria-label="保存进度">
            <div class="st-lcn-progress-fill" style="--st-lcn-progress:${esc(pct)}%"></div>
          </div>
          <div class="st-lcn-progress-line">${esc(progressLine())}</div>
          <div class="st-lcn-progress-actions">
            ${summary
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
    const rows = activeRows();
    const pages = totalPages();
    const range = visibleRange();
    const locked = batch.busy || batch.saving;
    const countText = searchActive() ? `${rows.length}（总 ${batch.rows.length}）` : `${batch.rows.length}`;
    const filterbar = `
      <div class="st-lcn-selectbar">
        <div class="st-lcn-select-actions">
          <button class="st-lcn-inline-btn" type="button" data-lcn-select="all" ${locked || !rows.length ? "disabled" : ""}>全选</button>
          <button class="st-lcn-inline-btn" type="button" data-lcn-select="invert" ${locked || !rows.length ? "disabled" : ""}>反选</button>
          <button class="st-lcn-inline-btn" type="button" data-lcn-select="none" ${locked || !rows.length ? "disabled" : ""}>取消全选</button>
        </div>
        <div class="st-lcn-filter-actions">
          <input class="st-lcn-search" type="search" data-lcn-search value="${attr(batch.searchQuery)}" placeholder="搜索游戏 / AppID / 待写入名" ${batch.saving ? "disabled" : ""}>
          <button class="st-lcn-inline-btn" type="button" data-lcn-action="import" ${locked ? "disabled" : ""}>导入</button>
          <input class="st-lcn-file" type="file" data-lcn-import-file accept=".json,application/json">
        </div>
      </div>
    `;
    if (!rows.length) {
      return `
        ${filterbar}
        <div class="st-lcn-empty">${batch.searching ? "正在搜索..." : "没有匹配的游戏"}</div>
      `;
    }
    return `
      <div class="st-lcn-pagebar" data-lcn-pagebar>
        <span>显示 ${range.from}-${range.to} / ${countText}，第 ${batch.page} / ${pages} 页，已选 <span data-lcn-selected-count>${batch.selectedCount}</span> 项</span>
        <div class="st-lcn-page-actions">
          <button class="st-lcn-inline-btn" type="button" data-lcn-page="first" ${batch.page <= 1 || batch.busy ? "disabled" : ""}>首页</button>
          <button class="st-lcn-inline-btn" type="button" data-lcn-page="prev" ${batch.page <= 1 || batch.busy ? "disabled" : ""}>上一页</button>
          <button class="st-lcn-inline-btn" type="button" data-lcn-page="next" ${batch.page >= pages || batch.busy ? "disabled" : ""}>下一页</button>
          <button class="st-lcn-inline-btn" type="button" data-lcn-page="last" ${batch.page >= pages || batch.busy ? "disabled" : ""}>末页</button>
        </div>
      </div>
      ${filterbar}
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
    const queryDisabled = locked || !canQueryCloud();
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
              <legend>模式</legend>
              <label><input type="radio" name="st-lcn-policy" value="cover" ${batch.policy === "cover" ? "checked" : ""} ${locked ? "disabled" : ""}>全部覆盖</label>
              <label><input type="radio" name="st-lcn-policy" value="hide" ${batch.policy === "hide" ? "checked" : ""} ${locked ? "disabled" : ""}>隐藏已有</label>
              <label><input type="radio" name="st-lcn-policy" value="skip" ${batch.policy === "skip" ? "checked" : ""} ${locked ? "disabled" : ""}>跳过已有</label>
              <label><input type="radio" name="st-lcn-policy" value="current-custom" ${isCurrentCustomPolicy() ? "checked" : ""} ${locked ? "disabled" : ""}>当前自定义写入待写</label>
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
            <button class="st-lcn-btn" type="button" data-lcn-action="query" title="只获取已勾选游戏的云端名称" ${queryDisabled ? "disabled" : ""}>获取云端名称</button>
            <button class="st-lcn-btn primary" type="button" data-lcn-action="save" ${locked || !write ? "disabled" : ""}>保存修改</button>
            <label class="st-lcn-action-option">
              <input type="checkbox" data-lcn-upload-cloud ${batch.uploadCloud ? "checked" : ""} ${locked ? "disabled" : ""}>
              <span class="st-lcn-tip" tabindex="0" aria-label="${attr(tip)}">
                <span class="st-lcn-tip-text">上传云端</span>
                <span class="st-lcn-tip-mark" aria-hidden="true">?</span>
                <span class="st-lcn-tip-popover" role="tooltip">${esc(tip)}</span>
              </span>
            </label>
            <label class="st-lcn-action-option"><input type="checkbox" data-lcn-mnemonic ${mnemonicChecked ? "checked" : ""} ${mnemonicDisabled ? "disabled" : ""}>生成助记符</label>
          </div>
          <div class="st-lcn-msg">${messageHtml()}</div>
          ${rowsHtml()}
        </div>
      </div>
    `;
  }

  function renderModal() {
    const modal = document.getElementById(MODAL);
    if (modal) {
      const active = document.activeElement;
      const keepSearch = active?.matches?.("[data-lcn-search]");
      const searchStart = keepSearch ? active.selectionStart : 0;
      const searchEnd = keepSearch ? active.selectionEnd : 0;
      modal.innerHTML = modalHtml();
      bindModalControls(modal);
      if (keepSearch) {
        const next = modal.querySelector("[data-lcn-search]");
        if (next) {
          next.focus();
          try {
            next.setSelectionRange(searchStart, searchEnd);
          } catch {
          }
        }
      }
    }
  }

  function renderVisibleRows() {
    renderModal();
  }

  function refreshMessage() {
    const msg = document.querySelector(`#${MODAL} .st-lcn-msg`);
    if (msg) {
      msg.innerHTML = messageHtml();
    }
  }

  function refreshSaveState() {
    const modal = document.getElementById(MODAL);
    if (!modal) {
      return;
    }
    const queryBtn = modal.querySelector("[data-lcn-action='query']");
    if (queryBtn) {
      queryBtn.disabled = batch.busy || batch.saving || !canQueryCloud();
    }
    const saveBtn = modal.querySelector("[data-lcn-action='save']");
    if (saveBtn) {
      saveBtn.disabled = batch.busy || batch.saving || !batch.writeCount;
    }
  }

  function setSelection(mode) {
    const rows = activeRows();
    if (batch.busy || batch.saving || !rows.length) {
      return;
    }
    for (const row of rows) {
      if (mode === "all") {
        row.checked = true;
      } else if (mode === "none") {
        row.checked = false;
      } else if (mode === "invert") {
        row.checked = !row.checked;
      }
      keepRowState(row);
    }
    refreshCounts();
    batch.message = previewMessage();
    renderVisibleRows();
  }

  function rowVisible(row) {
    const index = searchActive() ? Number(row?.viewIndex) : Number(row?.index);
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
    const hadSaving = !!batch.saving;
    batch.cancelled = true;
    batch.saving = false;
    batch.paused = false;
    batch.waitCmd = "";
    batch.message = "保存队列已取消";
    cancelCloudUploads("save-cancel");
    closeProgress();
    if (hadSaving) {
      backend("cancel").catch(() => {});
    }
  }

  function askStop() {
    return oneConfirm("当前任务正在进行中，是否中断？", {
      title: "确认中断",
      cancel: "否",
      confirm: "是",
    });
  }

  async function closeBatchAsk() {
    if ((batch.saving || batch.cloudFinishing) && !batch.cancelled && !(await askStop())) {
      return;
    }
    if ((batch.saving || batch.cloudFinishing) && !batch.cancelled) {
      cancelSave();
    }
    closeBatch();
  }

  async function closeProgressAsk() {
    if ((batch.saving || batch.cloudFinishing) && !batch.cancelled && !(await askStop())) {
      return;
    }
    if ((batch.saving || batch.cloudFinishing) && !batch.cancelled) {
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
    refreshSaveState();
    if (!batch.busy && !batch.saving && batch.rows.length) {
      batch.message = previewMessage();
      refreshMessage();
    }
    const selected = modal.querySelector("[data-lcn-selected-count]");
    if (selected) {
      selected.textContent = String(batch.selectedCount);
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
    const targets = selectedRows().filter(row => Number(row.appid) > 0);
    if (!targets.length) {
      batch.message = "请先勾选需要获取云端名称的游戏";
      renderModal();
      return;
    }
    if (hasDirtyRows()) {
      const ok = await oneConfirm("当前待写入数据已调整，重新获取云端名称将只刷新已勾选且未手动锁定的待写入数据，是否继续？", {
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
      selected: batch.selectedCount,
      count: targets.length,
    });
    try {
      ensureOn();
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
          row.cloudTouched = false;
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
    const saveRows = [];
    let chosen = 0;
    for (const row of batch.rows) {
      if (!row.checked) {
        continue;
      }
      chosen += 1;
      if (canWrite(row)) {
        items.push({ appid: row.appid, name: row.want });
        saveRows.push(row);
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
    if (!(await confirmSteamLimit(items.length))) {
      batch.message = previewMessage();
      renderModal();
      return;
    }
    batch.saving = true;
    batch.saveStartedAt = now();
    batch.paused = false;
    batch.waitCmd = "";
    batch.steamBatch = null;
    batch.summary = false;
    batch.cancelled = false;
    batch.progressClosed = false;
    batch.stats = {
      ...emptyStats(),
      total: items.length + skipped,
      processed: 0,
      skipped,
    };
    prepareCloudUploads(saveRows);
    batch.message = `正在启动保存队列，预计写入 ${items.length} 项，跳过 ${skipped} 项`;
    renderModal();
    openProgress(false);
    log("info", "library-custom-name-save-start", "开始保存库自定义名称", {
      count: items.length,
      skipped,
      uploadCloud: !!batch.uploadCloud,
      cloudQueueCount: batch.stats.cloudPending,
      cloudSkipped: batch.stats.cloudSkipped,
    });
    try {
      await backend("save-queue", { items, skipped });
      if (batch.cancelled) {
        return;
      }
      startCloudUploads();
      if (!batch.cloudFinishing) {
        batch.message = "正在逐条写入 Steam";
      }
    } catch (error) {
      batch.saving = false;
      batch.summary = true;
      batch.message = error?.message || String(error);
      cancelCloudUploads("save-start-failed");
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
      if (!batch.saving && batch.cloudFinishing) {
        batch.paused = action === "pause";
        batch.message = batch.paused ? "素材君云端上传已暂停" : "素材君云端上传继续执行";
        renderProgress();
        return;
      }
      batch.waitCmd = action;
      batch.message = action === "pause" ? "正在暂停保存队列" : "正在继续保存队列";
      renderProgress();
    } else if (action === "cancel") {
      logCommandStart(action);
      const hadSaving = !!batch.saving;
      batch.cancelled = true;
      batch.saving = false;
      batch.paused = false;
      batch.waitCmd = "";
      batch.message = "保存队列已取消";
      cancelCloudUploads("command-cancel");
      if (!hadSaving) {
        renderProgress();
        return;
      }
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
    if (data.batch) {
      batch.steamBatch = data.batch;
    }
    if (data.action === "pause" || data.action === "resume" || data.type === "save-done") {
      batch.waitCmd = "";
    }
    const done = data.type === "save-done";
    batch.saving = !done && data.running !== false;
    batch.paused = !!data.paused;
    batch.summary = done && (!batch.uploadCloud || !batch.cloudFinishing) ? true : batch.summary;
    if (done) {
      const hasError = !!data.error || batch.stats.failed > 0 || batch.stats.uploadFail > 0;
      log(hasError ? "warn" : "info", hasError ? "library-custom-name-save-failed" : "library-custom-name-save-success", hasError ? "库自定义名称保存完成但存在失败项" : "库自定义名称保存完成", {
        ...statsMeta(),
        durationMs: now() - (batch.saveStartedAt || now()),
        error: data.error || "",
      });
    }
    const b = data.batch || batch.steamBatch || {};
    batch.message = done
      ? (data.error || (batch.cloudFinishing ? "Steam 写入完成，正在等待素材君云端上传完成" : "保存队列已完成"))
      : data.action === "pause"
        ? "保存队列已暂停"
        : data.action === "resume"
          ? "保存队列继续执行"
          : data.batchAction === "wait" || b.waiting
            ? `第 ${b.index || 1} 批写入完成，等待 Steam 云同步 ${Math.ceil((Number(b.waitMs) || 0) / 1000)} 秒`
            : b.index
              ? `正在写入 Steam 第 ${b.index} 批 ${b.written || 0}/${b.max || 2000}${batch.cloudFinishing ? "，素材君云端上传同步进行" : ""}`
              : batch.cloudFinishing
                ? "正在写入 Steam，素材君云端上传同步进行"
                : "正在写入 Steam";

    const items = Array.isArray(data.items) ? data.items : (data.item ? [data.item] : []);
    for (const item of items) {
      const row = batch.rowMap.get(Number(item.appid));
      if (row) {
        row.state = item.status || row.state;
        row.error = item.error || "";
        refreshProgressRow(row);
      }
    }
    if (done) {
      renderVisibleRows();
    } else {
      refreshSaveState();
    }
    if (!batch.progressClosed) {
      openProgress(batch.summary, false);
      renderProgressSoon(done && !batch.cloudFinishing);
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
    const select = event.target.closest("[data-lcn-select]")?.dataset?.lcnSelect;
    if (select) {
      event.preventDefault();
      setSelection(select);
      return;
    }
    const action = event.target.closest("[data-lcn-action]")?.dataset?.lcnAction;
    if (action === "query") {
      fetchCloudNames();
    } else if (action === "save") {
      save();
    } else if (action === "import") {
      event.preventDefault();
      document.querySelector(`#${MODAL} [data-lcn-import-file]`)?.click();
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
    const file = event.target.closest("[data-lcn-import-file]");
    if (file) {
      const picked = file.files?.[0] || null;
      file.value = "";
      importJsonFile(picked).catch((error) => {
        batch.busy = false;
        batch.message = error?.message || String(error);
        renderModal();
      });
      return;
    }
    const policy = event.target.closest("input[name='st-lcn-policy']");
    if (policy) {
      batch.policy = ["cover", "hide", "skip", "current-custom", "rebuild-mnemonic"].includes(policy.value) ? policy.value : "hide";
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
          title: "确认关闭素材君云端上传",
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
    const search = event.target.closest("[data-lcn-search]");
    if (search) {
      setSearchQuery(search.value);
      return;
    }
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
      const base = isCurrentCustomPolicy() || row.cloudSource === "local" ? text(row.custom) : text(row.apiName);
      row.manual = text(row.want) !== base;
      row.cloudTouched = true;
      row.mnemonicTouched = false;
      row.state = "";
      row.error = "";
      refreshRowSearch(row);
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
      if (batch.capacityTimer) {
        window.clearTimeout(batch.capacityTimer);
        batch.capacityTimer = 0;
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
