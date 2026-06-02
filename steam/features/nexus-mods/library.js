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
  const BTN = "__RickyNexusModsButton";
  const STYLE = "__RickyNexusModsStyle";
  const ORIG = "__RickyStOriginalName";
  const LOOP_MS = 1500;
  const NAV_RE = /指南|Guides|创意工坊|Workshop|讨论区|Discussions|社区中心|Community Hub/;
  const WORKSHOP_RE = /创意工坊|Workshop/;

  const rootState = window.SteamBuff.state = window.SteamBuff.state || {};
  const s = rootState[ID] = rootState[ID] || {};

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

  function css() {
    if (document.getElementById(STYLE)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE;
    style.textContent = `
      #${BTN} {
        min-width: 96px;
      }
      #${BTN}.st-nexus-mods-busy {
        opacity: 0.72;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
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
      const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic&l=english`, {
        credentials: "omit",
      });
      const json = await res.json();
      const name = json?.[appid]?.data?.name;
      const clean = typeof name === "string" ? name.trim() : "";
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
      log("info", "nexus-mods-open-start", "开始打开 Nexus Mods 搜索", {
        appid,
      });
      try {
        const name = await steamName();
        const link = url(name);
        if (link) {
          const ok = open(link);
          log(ok ? "info" : "warn", ok ? "nexus-mods-open-success" : "nexus-mods-open-failed", ok ? "Nexus Mods 搜索已打开" : "Nexus Mods 搜索打开失败", {
            appid,
            nameLength: name.length,
            durationMs: Date.now() - startedAt,
          });
        } else {
          log("warn", "nexus-mods-open-failed", "Nexus Mods 搜索链接为空", {
            appid,
            reason: "empty-link",
            durationMs: Date.now() - startedAt,
          });
        }
      } catch (error) {
        log("error", "nexus-mods-open-failed", "Nexus Mods 搜索打开异常", {
          appid,
          durationMs: Date.now() - startedAt,
          error: error?.message || String(error),
        });
      } finally {
        window.setTimeout(() => a.classList.remove("st-nexus-mods-busy"), 1000);
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
    if (!root || root.querySelector(`#${BTN}`) || !appName()) {
      return false;
    }

    const tabs = items(root);
    const ref = tabs.find((item) => WORKSHOP_RE.test(text(item))) || tabs[tabs.length - 1];
    if (!ref) {
      return false;
    }

    const btn = linkLike(ref);
    ref.insertAdjacentElement("afterend", btn);
    return true;
  }

  function tick() {
    css();

    const root = nav();
    if (!root) {
      return;
    }

    insert(root);
  }

  function start() {
    if (s.started) {
      return { started: false, reason: "already-started" };
    }

    s.started = true;
    tick();
    s.timer = window.setInterval(tick, LOOP_MS);
    return { started: true };
  }

  window.SteamBuff.reg.addEntry(ID, "library.js", start);
})();
