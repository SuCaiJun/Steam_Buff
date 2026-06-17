/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Nexus Mods 库页面入口
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const ID = "nexus-mods";
  const SCHEDULER_TASK = "nexus-mods-library";
  const BTN = "__RickyNexusModsButton";
  const STYLE = "__RickyNexusModsStyle";
  const ORIG = "__RickyStOriginalName";
  const LOOP_MS = 1500;
  const MOUNT_LOG_MS = 60000;
  const REQUEST_TIMEOUT_MS = 10 * 1000;
  const REQUEST_RETRY_MS = 500;
  const NAV_RE = /指南|Guides|创意工坊|Workshop|讨论区|Discussions|社区中心|Community Hub/;
  const WORKSHOP_RE = /创意工坊|Workshop/;

  const rootState = window.SteamBuff.state = window.SteamBuff.state || {};
  const s = rootState[ID] = rootState[ID] || {};

  const styles = window.SteamBuff?.styles;
  const log = window.STLoggerFactory.createLogger("steam", ID);

  function logByLevel(level, event, message, meta = {}) {
    const method = level === "error" ? "error" : level === "warn" ? "warn" : "info";
    log[method](event, message, meta);
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
      text: text(el).slice(0, 180),
    };
  }

  function pageMeta(extra = {}) {
    return {
      route: window.SteamBuff?.ctx?.route?.() || "",
      title: document.title || "",
      innerWidth: Math.round(window.innerWidth || 0),
      innerHeight: Math.round(window.innerHeight || 0),
      devicePixelRatio: Number(window.devicePixelRatio) || 1,
      ...extra,
    };
  }

  function logMountState(key, level, event, message, meta = {}) {
    const at = Date.now();
    const repeatMs = Number(meta.repeatMs) || 0;
    if (s.mountLogKey === key && (!repeatMs || at - (s.mountLogAt || 0) < repeatMs)) {
      return;
    }
    s.mountLogKey = key;
    s.mountLogAt = at;
    const { repeatMs: _repeatMs, ...cleanMeta } = meta;
    logByLevel(level, event, message, pageMeta(cleanMeta));
  }

  function css() {
    if (document.getElementById(STYLE)) {
      return;
    }

    styles?.ensureStyle?.(STYLE, `
      #${BTN} {
        min-width: 96px;
      }
      #${BTN}.st-nexus-mods-busy {
        opacity: 0.72;
        pointer-events: none;
      }
    `);
  }

  function appidFromRoute() {
    const route = window.SteamBuff?.ctx?.route?.() || "";
    const match = route.match(/\/library\/app\/(\d+)/);
    return match ? Number(match[1]) : 0;
  }

  function appById(appid) {
    if (!appid) {
      return null;
    }

    try {
      if (typeof window.appStore?.GetAppOverviewByAppID === "function") {
        return window.appStore.GetAppOverviewByAppID(appid);
      }
    } catch {
    }

    try {
      return window.appStore?.m_mapApps?.get?.(appid) || null;
    } catch {
    }
    return null;
  }

  function appName() {
    const app = appById(appidFromRoute());
    const name = app?.[ORIG]
      || app?.originalDisplayName
      || app?.english_name
      || app?.name
      || app?.display_name
      || "";
    return typeof name === "string" ? name.trim() : "";
  }

  function hasLocale(text) {
    return /[^\x20-\x7e]/.test(text);
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  function timeoutError(timeoutMs) {
    const error = new Error(`请求超时（${Math.round(timeoutMs)}ms）`);
    error.name = "TimeoutError";
    return error;
  }

  async function fetchWithTimeout(url, options = {}) {
    const timeoutMs = Number(options.timeoutMs) || REQUEST_TIMEOUT_MS;
    const { timeoutMs: _timeoutMs, ...fetchOptions } = options;
    void _timeoutMs;
    if (typeof AbortController === "function") {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(timeoutError(timeoutMs)), timeoutMs);
      try {
        return await fetch(url, {
          credentials: "omit",
          ...fetchOptions,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    }
    let timer = 0;
    return Promise.race([
      fetch(url, { credentials: "omit", ...fetchOptions }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(timeoutMs)), timeoutMs);
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  function validAppDetails(data, appid) {
    const row = data?.[appid];
    return !!row && typeof row === "object" && (row.success === false || typeof row.data === "object");
  }

  async function fetchAppDetailsName(url, appid) {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await fetchWithTimeout(url);
        if (!res.ok) {
          throw new Error(`HTTP状态码错误: ${res.status}`);
        }
        const json = await res.json();
        if (!validAppDetails(json, appid)) {
          throw new Error("Steam 应用详情格式异常");
        }
        const name = json?.[appid]?.data?.name;
        return typeof name === "string" ? name.trim() : "";
      } catch (error) {
        lastError = error;
        if (attempt === 0) {
          await sleep(REQUEST_RETRY_MS);
          continue;
        }
      }
    }
    throw lastError || new Error("Steam 应用详情请求失败");
  }

  async function steamName() {
    const appid = appidFromRoute();
    const local = appName();

    if (!appid || (local && !hasLocale(local))) {
      return local;
    }

    if (!s.names) {
      s.names = new Map();
    }
    if (s.names.has(appid)) {
      return s.names.get(appid) || local;
    }

    try {
      const url = window.STConfig?.vendors?.steamStore?.appDetails?.(appid, "basic", "english") || "";
      if (!url) {
        return local;
      }
      const clean = await fetchAppDetailsName(url, appid);
      s.names.set(appid, clean);
      return clean || local;
    } catch {
      s.names.set(appid, "");
      return local;
    }
  }

  function url(name) {
    return name ? window.STConfig.nexusSearch(name) : "";
  }

  function tryCall(obj, name, link) {
    const fn = obj?.[name];
    if (typeof fn !== "function") {
      return false;
    }

    try {
      fn.call(obj, link);
      return true;
    } catch {
    }
    return false;
  }

  function openExternal(link) {
    const client = window.SteamClient;
    const system = client?.System;
    const browser = client?.Browser;

    return tryCall(system, "OpenInSystemBrowser", link)
      || tryCall(system, "OpenURLInSystemBrowser", link)
      || tryCall(browser, "OpenURLInSystemBrowser", link)
      || tryCall(browser, "OpenExternalBrowserURL", link)
      || tryCall(system, "OpenURL", link)
      || tryCall(browser, "OpenURL", link)
      || tryCall(client, "OpenURL", link);
  }

  function open(link) {
    if (openExternal(link)) {
      return true;
    }

    try {
      window.open(link, "_blank", "noopener,noreferrer");
      return true;
    } catch {
    }

    try {
      location.href = link;
      return true;
    } catch {
    }
    return false;
  }

  function linkLike(btn) {
    const a = document.createElement("a");
    a.id = BTN;
    a.className = `${typeof btn.className === "string" ? btn.className : ""} st-nexus-mods`.trim();
    a.textContent = "Nexus Mods";
    a.href = "#";
    a.setAttribute("role", "button");
    a.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      a.classList.add("st-nexus-mods-busy");
      const appid = appidFromRoute();
      const startedAt = Date.now();
      log.info("nexus-mods-open-start", "开始打开 Nexus Mods 搜索", {
        appid,
      });
      try {
        const name = await steamName();
        const link = url(name);
        if (link) {
          const ok = open(link);
          logByLevel(ok ? "info" : "warn", ok ? "nexus-mods-open-success" : "nexus-mods-open-failed", ok ? "Nexus Mods 搜索已打开" : "Nexus Mods 搜索打开失败", {
            appid,
            nameLength: name.length,
            durationMs: Date.now() - startedAt,
          });
        } else {
          log.warn("nexus-mods-open-failed", "Nexus Mods 搜索链接为空", {
            appid,
            reason: "empty-link",
            durationMs: Date.now() - startedAt,
          });
        }
      } catch (error) {
        log.error("nexus-mods-open-failed", "Nexus Mods 搜索打开异常", {
          appid,
          durationMs: Date.now() - startedAt,
          error: error?.message || String(error),
        });
      } finally {
        if (s.busyHandle) {
          const handle = s.busyHandle;
          s.busyHandle = null;
          handle.dispose();
        }
        s.busyTimer = window.setTimeout(() => {
          const handle = s.busyHandle;
          s.busyHandle = null;
          s.busyTimer = 0;
          handle?.dispose?.();
          a.classList.remove("st-nexus-mods-busy");
        }, 1000);
        s.busyHandle = s.scope?.resource?.({
          key: "busy-reset",
          type: "timer",
          dispose() {
            if (s.busyTimer) {
              window.clearTimeout(s.busyTimer);
              s.busyTimer = 0;
            }
            s.busyHandle = null;
          },
        }) || null;
      }
    });
    return a;
  }

  function text(el) {
    return (el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function validItem(el) {
    const value = text(el);
    if (!value || value.length > 40) {
      return false;
    }

    const rect = el.getBoundingClientRect();
    return rect.width >= 24 && rect.height >= 12 && rect.height <= 60;
  }

  function items(root) {
    const semantic = Array.from(root.querySelectorAll("a, button, [role='button']")).filter(validItem);
    if (semantic.length >= 2) {
      return semantic;
    }

    const direct = Array.from(root.children).filter(validItem);
    return direct.length >= 2 ? direct : semantic;
  }

  function navScore(el) {
    const value = text(el);
    if (!NAV_RE.test(value)) {
      return 0;
    }

    const tabs = items(el);
    if (tabs.length < 2 || tabs.length > 12) {
      return 0;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width < 250 || rect.height < 20 || rect.height > 80) {
      return 0;
    }

    return tabs.length + (WORKSHOP_RE.test(value) ? 10 : 0);
  }

  function nav() {
    let best = null;
    let score = 0;
    const nodes = document.querySelectorAll("div, nav");

    for (const el of nodes) {
      const next = navScore(el);
      if (next > score) {
        best = el;
        score = next;
      }
    }

    return best;
  }

  function insert(root) {
    if (!root) {
      return false;
    }
    const exists = root.querySelector(`#${BTN}`);
    if (exists) {
      const rect = rectMeta(exists);
      const visible = !!rect?.visible;
      logMountState(
        `mount-existing:${appidFromRoute()}:${visible}`,
        visible ? "info" : "warn",
        visible ? "nexus-mods-mount-success" : "nexus-mods-mount-invisible",
        visible ? "Nexus Mods 按钮已存在且可见" : "Nexus Mods 按钮已存在但当前不可见",
        {
          appid: appidFromRoute(),
          nav: nodeMeta(root),
          button: nodeMeta(exists),
        }
      );
      return true;
    }
    const name = appName();
    if (!name) {
      logMountState(
        `mount-skipped:no-app-name:${appidFromRoute()}`,
        "info",
        "nexus-mods-mount-skipped",
        "Nexus Mods 按钮未识别当前游戏名称",
        {
          appid: appidFromRoute(),
          nav: nodeMeta(root),
        }
      );
      return false;
    }

    const tabs = items(root);
    const ref = tabs.find((item) => WORKSHOP_RE.test(text(item))) || tabs[tabs.length - 1];
    if (!ref) {
      logMountState(
        `mount-skipped:no-ref:${appidFromRoute()}`,
        "warn",
        "nexus-mods-mount-skipped",
        "Nexus Mods 按钮未找到插入参照项",
        {
          appid: appidFromRoute(),
          nav: nodeMeta(root),
          tabCount: tabs.length,
        }
      );
      return false;
    }

    const btn = linkLike(ref);
    ref.insertAdjacentElement("afterend", btn);
    const rect = rectMeta(btn);
    const visible = !!rect?.visible;
    logMountState(
      `mount:${appidFromRoute()}:${visible}`,
      visible ? "info" : "warn",
      visible ? "nexus-mods-mount-success" : "nexus-mods-mount-invisible",
      visible ? "Nexus Mods 按钮挂载完成" : "Nexus Mods 按钮已挂载但当前不可见",
      {
        appid: appidFromRoute(),
        nav: nodeMeta(root),
        ref: nodeMeta(ref),
        button: nodeMeta(btn),
        nameLength: name.length,
      }
    );
    return true;
  }

  function tick() {
    css();

    const appid = appidFromRoute();
    if (!appid) {
      return;
    }
    logMountState(
      `ui-start:${appid}`,
      "info",
      "nexus-mods-ui-start",
      "Nexus Mods 库页面入口已进入游戏详情页",
      { appid }
    );

    const root = nav();
    if (!root) {
      logMountState(
        `mount-skipped:no-nav:${appid}`,
        "info",
        "nexus-mods-mount-skipped",
        "Nexus Mods 按钮未找到库详情导航栏",
        {
          appid,
          navCandidateCount: document.querySelectorAll("div, nav").length,
        }
      );
      return;
    }

    insert(root);
  }

  function start(_api, _feature, _context, scope) {
    if (s.started) {
      return { started: false, reason: "already-started" };
    }
    if (!window.STScheduler?.register) {
      logMountState(
        "ui-start-skipped:scheduler-unavailable",
        "warn",
        "nexus-mods-mount-skipped",
        "Nexus Mods 库页面入口缺少统一调度器"
      );
      return { started: false, reason: "scheduler-unavailable" };
    }

    s.started = true;
    s.scope = scope || null;
    tick();
    // Nexus Mods 按钮补挂载迁移到统一调度器，保留原库详情巡检节奏。
    window.STScheduler.register(SCHEDULER_TASK, tick, () => s.started === true, { intervalMs: LOOP_MS });
    scope?.schedulerTask?.("library-mount", SCHEDULER_TASK);
    s.stop = () => {
      window.STScheduler?.unregister?.(SCHEDULER_TASK);
      s.timer = 0;
      if (s.busyHandle) {
        const handle = s.busyHandle;
        s.busyHandle = null;
        handle.dispose();
      } else if (s.busyTimer) {
        window.clearTimeout(s.busyTimer);
        s.busyTimer = 0;
      }
      document.getElementById(BTN)?.remove();
      s.started = false;
      s.scope = null;
    };
    return { started: true, stop: s.stop };
  }

  window.SteamBuff.reg.addEntry(ID, "library.js", start);
})();
