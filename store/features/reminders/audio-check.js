/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店音频语言检查
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const MODULE_CLASSES = api.dom.MODULE_CLASSES;
  const insertModule = api.dom.insertModule;
  const isUsableExistingModule = api.dom.isUsableExistingModule;
  const log = window.STLoggerFactory?.createLogger?.("store", "audio-check");
  const workshopLog = window.STLoggerFactory?.createLogger?.("store", "workshop-check") || log;
  const WORKSHOP_MODULE_CLASS = MODULE_CLASSES.WORKSHOP_CHECK || "es_workshop_check";
  const UNSUPPORTED_ONLY_SETTING_ID = "store-detail-reminders-unsupported-only";
  const STEAM_STORE = window.STConfig?.vendors?.steamStore;
  const APPDETAILS_FILTERS = "categories";
  // 注: 2026-07-10 实测 appdetails 中 1606180 同时返回 30/51，description 会本地化且重复，支持判断只认已验证 ID。
  const WORKSHOP_IDS = Object.freeze(new Set([30, 51]));
  const WORKSHOP_NAMES = Object.freeze(new Set(["Steam Workshop", "Steam 创意工坊"]));
  const workshopCache = new Map();
  const workshopRequests = new Map();

  function text(value) {
    return String(value ?? "").trim();
  }

  function i18n(key, fallback, params) {
    return globalThis.STI18n.text(key, fallback, params);
  }

  function unsupportedOnly() {
    return api.settings?.on?.(UNSUPPORTED_ONLY_SETTING_ID) === true;
  }

  function pageMeta(extra = {}) {
    const ctx = window.STPageContext?.snapshot?.() || {};
    return {
      path: location.pathname,
      pageType: ctx.pageType || "",
      title: document.title || "",
      ...extra,
    };
  }

  function pageAppId() {
    const info = api.ctx?.pageInfo?.();
    if (info?.type === "app" && info.appId) return text(info.appId);
    const match = location.pathname.match(/\/app\/(\d+)/);
    return match ? match[1] : "";
  }

  function appDetailsUrl(appId) {
    return STEAM_STORE?.appDetails?.(appId, APPDETAILS_FILTERS, "schinese") || "";
  }

  function parseWorkshop(categories) {
    const ids = [];
    const unknownSameNameIds = [];
    for (const item of Array.isArray(categories) ? categories : []) {
      const id = Number(item?.id);
      if (!Number.isFinite(id)) continue;
      if (WORKSHOP_IDS.has(id)) {
        ids.push(id);
      } else if (WORKSHOP_NAMES.has(text(item?.description))) {
        unknownSameNameIds.push(id);
      }
    }
    return {
      supported: ids.length > 0,
      ids: Array.from(new Set(ids)),
      unknownSameNameIds: Array.from(new Set(unknownSameNameIds)),
    };
  }

  async function loadWorkshop(appId) {
    if (!appId || typeof api.net?.sendRequest !== "function") {
      return { ok: false, code: "request-unavailable" };
    }
    if (workshopCache.has(appId)) {
      return workshopCache.get(appId);
    }
    if (workshopRequests.has(appId)) {
      return workshopRequests.get(appId);
    }

    const url = appDetailsUrl(appId);
    if (!url) {
      return { ok: false, code: "config-missing" };
    }

    const request = api.net.sendRequest({
      method: "GET",
      headers: { Accept: "application/json" },
      url,
      parseJSON: true,
      timeoutMs: 10 * 1000,
      retries: 1,
      validate(data) {
        return !!data && typeof data === "object";
      },
    }).then((data) => {
      const box = data?.[appId];
      const categories = box?.data?.categories;
      if (box?.success !== true || !Array.isArray(categories)) {
        return { ok: false, code: "categories-missing" };
      }
      const result = { ok: true, ...parseWorkshop(categories) };
      workshopCache.set(appId, result);
      return result;
    }).catch((error) => {
      workshopLog?.warn?.("workshop-check-load-failed", "创意工坊状态加载失败", pageMeta({
        appid: Number(appId) || 0,
        error,
      }));
      return { ok: false, code: "request-failed" };
    }).finally(() => {
      workshopRequests.delete(appId);
    });

    workshopRequests.set(appId, request);
    return request;
  }

  function renderWorkshopLine(container, line, result) {
    if (!line) return;
    container?.classList?.remove("supported", "not-supported", "error");
    line.classList.remove("is-loading", "is-supported", "is-not-supported", "is-error");
    line.dataset.workshopDone = "1";
    delete line.dataset.categoryIds;
    if (!result?.ok) {
      container?.classList?.add("error");
      line.classList.add("is-error");
      line.textContent = i18n("store.workshop.statusUnavailable", "创意工坊状态暂时无法获取");
      return;
    }
    if (result.supported) {
      container?.classList?.add("supported");
      line.classList.add("is-supported");
      line.textContent = i18n("store.workshop.supported", "此游戏支持 Steam 创意工坊");
      line.dataset.categoryIds = result.ids.join(",");
      line.title = result.ids.length
        ? i18n("store.workshop.verifiedCategoryIds", "已验证分类 ID：$ids$", { ids: result.ids.join(", ") })
        : "";
    } else {
      container?.classList?.add("not-supported");
      line.classList.add("is-not-supported");
      line.textContent = i18n("store.workshop.unsupported", "此游戏未标记支持 Steam 创意工坊");
      line.title = "";
    }
    if (result.unknownSameNameIds?.length) {
      workshopLog?.warn?.("workshop-check-unknown-category", "发现未登记的创意工坊分类 ID", pageMeta({
        unknownIds: result.unknownSameNameIds,
      }));
    }
  }

  function updateWorkshop(container, appId, line) {
    loadWorkshop(appId).then((result) => {
      if (!container?.isConnected || container.dataset.steamAppId !== appId) return;
      if (result?.ok && result.supported && unsupportedOnly()) {
        container.remove();
        return;
      }
      renderWorkshopLine(container, line, result);
    });
  }

  function removeInlineWorkshopLines(root = document) {
    root.querySelectorAll?.(".es_audio_check_workshop").forEach((node) => node.remove());
  }

  function currentWorkshopCard(appId) {
    let current = null;
    document.querySelectorAll(`.${WORKSHOP_MODULE_CLASS}`).forEach((existing) => {
      if (existing.dataset.steamAppId === appId && isUsableExistingModule(existing) && !current) {
        current = existing;
      } else {
        existing.remove();
      }
    });
    return current;
  }

  function ensureWorkshopStatusLine(container) {
    let body = container.querySelector(":scope > .es_workshop_check_body");
    if (!body) {
      body = document.createElement("div");
      body.className = "es_workshop_check_body";
      container.appendChild(body);
    }

    let line = body.querySelector(":scope > .es_workshop_check_status");
    if (!line) {
      line = document.createElement("div");
      line.className = "es_workshop_check_text es_workshop_check_status is-loading";
      line.textContent = i18n("store.workshop.loading", "正在检查 Steam 创意工坊状态...");
      body.appendChild(line);
    }
    return line;
  }

  function insertWorkshopCard(container, afterElement) {
    if (afterElement?.parentNode && isUsableExistingModule(afterElement)) {
      afterElement.parentNode.insertBefore(container, afterElement.nextSibling);
      return true;
    }
    return insertModule(container, WORKSHOP_MODULE_CLASS, false, true);
  }

  function mountWorkshopCheck(appId, afterElement = null) {
    removeInlineWorkshopLines();
    const current = currentWorkshopCard(appId);
    if (current) {
      if (current.classList.contains("supported") && unsupportedOnly()) {
        current.remove();
        return null;
      }
      const line = ensureWorkshopStatusLine(current);
      if (line.dataset.workshopDone !== "1") {
        updateWorkshop(current, appId, line);
      }
      return current;
    }

    const container = document.createElement("div");
    container.className = WORKSHOP_MODULE_CLASS;
    container.dataset.steamAppId = appId;

    const title = document.createElement("div");
    title.className = "es_workshop_check_title";
    title.textContent = i18n("settings.feature.workshop-check.name", "创意工坊检查");

    container.appendChild(title);
    const line = ensureWorkshopStatusLine(container);

    if (!insertWorkshopCard(container, afterElement)) {
      workshopLog?.warn?.("workshop-check-mount-failed", "创意工坊检查挂载失败", pageMeta({
        appid: Number(appId) || 0,
      }));
      return null;
    }

    workshopLog?.info?.("workshop-check-mount-success", "创意工坊检查已挂载", pageMeta({
      appid: Number(appId) || 0,
    }));
    updateWorkshop(container, appId, line);
    return container;
  }

  function addWorkshopCheck(appId = pageAppId()) {
    if (!appId) return null;
    return mountWorkshopCheck(appId);
  }

  function removeWorkshopCheck() {
    let removed = false;
    removeInlineWorkshopLines();
    document.querySelectorAll(`.${WORKSHOP_MODULE_CLASS}`).forEach((node) => {
      node.remove();
      removed = true;
    });
    return removed;
  }

  function addAudioCheck() {
    const startedAt = Date.now();
    const appId = pageAppId();
    if (!appId) return;

    let currentModule = null;
    document.querySelectorAll(`.${MODULE_CLASSES.AUDIO_CHECK}`).forEach(existing => {
        if (existing.dataset.steamAppId === appId && isUsableExistingModule(existing) && !currentModule) {
            currentModule = existing;
        } else {
            existing.remove();
        }
    });
    if (currentModule) {
        removeInlineWorkshopLines(currentModule);
        if (currentModule.classList.contains("supported") && unsupportedOnly()) {
            currentModule.remove();
            return null;
        }
        return currentModule;
    }

    const languagesTable = document.querySelector('table.game_language_options');
    if (!languagesTable) {
        log?.warn?.("audio-check-mount-target-missing", "配音检查语言表未找到", {
            appid: Number(appId) || 0,
            selector: "table.game_language_options",
            path: location.pathname,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
                dpr: window.devicePixelRatio,
            },
        });
        return null;
    }

    let hasChineseAudio = false;
    const rows = languagesTable.querySelectorAll('tr');

    for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3) {
            const languageName = cells[0].textContent.trim();
            if (languageName === '简体中文') {
                // 注意：Steam 的表格结构中，th 依次是：空, 界面, 完全音频, 字幕
                // 对应 td 依次是：语言名称, 界面勾选, 完全音频勾选, 字幕勾选
                const audioCell = cells[2]; 
                if (audioCell && audioCell.querySelector('span') && audioCell.textContent.includes('✔')) {
                    hasChineseAudio = true;
                }
                break;
            }
        }
    }

    if (hasChineseAudio && unsupportedOnly()) {
        return null;
    }

    const audioContainer = document.createElement("div");
    audioContainer.className = MODULE_CLASSES.AUDIO_CHECK;
    audioContainer.dataset.steamAppId = appId;

    const title = document.createElement("div");
    title.className = "es_audio_check_title";
    title.textContent = i18n("settings.feature.audio-check.name", "配音检查");

    const body = document.createElement("div");
    body.className = "es_audio_check_body";

    const text = document.createElement("div");
    text.className = "es_audio_check_text";
    if (hasChineseAudio) {
        audioContainer.classList.add('supported');
        text.textContent = i18n("store.audio.supported", "此游戏支持简体中文配音");
    } else {
        audioContainer.classList.add('not-supported');
        text.textContent = i18n("store.audio.unsupported", "此游戏不支持简体中文配音");
    }

    body.append(text);
    audioContainer.append(title, body);

    if (!insertModule(audioContainer, MODULE_CLASSES.AUDIO_CHECK, false, true)) {
        log?.warn?.("audio-check-mount-failed", "配音检查挂载失败", {
            appid: Number(appId) || 0,
            supported: hasChineseAudio,
            path: location.pathname,
        });
        return null;
    }
    log?.info?.("audio-check-mount-success", "配音检查已挂载", {
        appid: Number(appId) || 0,
        supported: hasChineseAudio,
        rowCount: rows.length,
        durationMs: Date.now() - startedAt,
    });
    return audioContainer;
  }

  api.features.audioCheck = Object.freeze({
    add: addAudioCheck,
  });

  api.features.workshopCheck = Object.freeze({
    add: addWorkshopCheck,
    remove: removeWorkshopCheck,
  });
})();
