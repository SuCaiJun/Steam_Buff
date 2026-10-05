/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 独立云端自定义名称右键入口与编辑弹窗
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const ID = "library-independent-name";
  const CH = "__steam_library_independent_name_Ricky";
  const MODAL = "__RickyLibraryIndependentNameModal";
  const BATCH_MODAL = "__RickyLibraryIndependentNameBatchModal";
  const MENU_ENTRY_ATTR = "data-steam-buff-independent-name-entry";
  // SteamUI GameAction_AddToFavorites 的已验证本地化文案（扩展支持的五种语言）。
  const STEAM_FAVORITE_LABELS = Object.freeze([
    "添加至收藏夹",
    "加入我的最愛",
    "Add to Favorites",
    "お気に入りに追加",
    "즐겨찾기에 추가",
  ]);
  const REQ_ATTR = "data-steam-buff-user-names-request";
  const RES_ATTR = "data-steam-buff-user-names-response";
  const PINYIN_LIB = "vendor/pinyin-pro/index.js";
  const MNEMONIC_CORE = "steam/features/library-custom-name/mnemonic.js";
  // 行槽必须保持这个高度，表头在滚动区外，占位才是行数乘这个高度
  const ROW_HEIGHT = 64;
  const VIEWPORT_HEIGHT = 420;
  const OVERSCAN = 8;
  const ALIAS_MAX = 10;
  const SEARCH_MS = 180;
  const READINGS_MS = 300;
  const FILTER_ICON_PATH = "images/ui/filter.svg";
  const FILTER_DELETE_ICON_PATH = "images/ui/delete.svg";
  const FILTER_GROUPS = Object.freeze([
    ["名称", ["custom_name", "aliases", "mnemonic", "pinyin", "original_language"]],
    ["应用", ["app_type", "sources", "collections", "modes", "status", "privacy"]],
    ["内容", ["languages", "genres", "features", "tags"]],
    ["硬件", ["hardware"]],
    ["辅助功能", ["accessibility"]],
    ["评价", ["review_score", "metacritic_score"]],
    ["时间", ["date_added", "date_release", "date_last_played", "playtime_minutes"]],
  ]);
  const LANGUAGE_LABELS = Object.freeze({
    sc_schinese: "简体中文", schinese: "简体中文", tchinese: "繁体中文", english: "英文", koreana: "韩语", japanese: "日语",
    german: "德语", french: "法语", italian: "意大利语", spanish: "西班牙语", latam: "拉丁美洲西班牙语", russian: "俄语",
    portuguese: "葡萄牙语", brazilian: "巴西葡萄牙语", polish: "波兰语", dutch: "荷兰语", danish: "丹麦语", finnish: "芬兰语",
    norwegian: "挪威语", swedish: "瑞典语", hungarian: "匈牙利语", czech: "捷克语", romanian: "罗马尼亚语", turkish: "土耳其语",
    greek: "希腊语", bulgarian: "保加利亚语", ukrainian: "乌克兰语", thai: "泰语", arabic: "阿拉伯语", vietnamese: "越南语",
    indonesian: "印尼语", malay: "马来语",
  });
  const ACCESSIBILITY_LABELS = Object.freeze({
    adjustable_difficulty: "可调整难度", save_anytime: "随时保存", adjustable_text: "可调整文字大小", subtitles: "字幕选项",
    color_alternatives: "可选颜色", contrast: "对比度控制", camera_comfort: "镜头舒适度", playable_without_vision: "无需视觉也可游玩",
    custom_volume: "自定义音量控制", stereo: "立体声", surround: "环绕声", narrated_menus: "朗读游戏菜单", keyboard_only: "可以仅用键盘",
    mouse_only: "可以仅用鼠标", touch_only: "可以仅用触控", without_quick_time: "无需快速反应事件即可游玩", own_pace: "可按自己的节奏游玩",
    speech_to_text: "聊天语音转文字", text_to_speech: "聊天文字转语音",
  });
  const REVIEW_LABELS = Object.freeze({ 9: "好评如潮", 8: "特别好评", 7: "好评", 6: "多半好评", 5: "褒贬不一", 4: "多半差评", 3: "差评", 2: "特别差评", 1: "差评如潮", 0: "无评测分数" });
  const DATE_PRESET_DEFS = Object.freeze([
    ["30m", "近30分钟"], ["1h", "近1小时"], ["6h", "近6小时"], ["24h", "近24小时"],
    ["today", "今日"], ["yesterday", "昨日"], ["3d", "近3日"], ["7d", "近7日"],
    ["14d", "近14日"], ["30d", "近30日"], ["custom", "自定义"],
  ]);
  const FIELD_LABELS = Object.freeze({
    sources: "游戏来源", original_language: "原名称语言", collections: "收藏分组", modes: "游戏模式", status: "游戏状态", privacy: "私密筛选",
    languages: "游戏语言", genres: "游戏题材", features: "游戏特色", tags: "商店标签", hardware: "硬件支持", accessibility: "辅助功能",
    review_score: "Steam 评测", metacritic_score: "Metacritic 分数", date_added: "添加到库日期", date_release: "发行日期", date_last_played: "最后运行日期", playtime_minutes: "游戏时间",
  });
  const ORIGINAL_LANGUAGE_OPTIONS = Object.freeze([
    ["zh_hans", "简体中文"], ["zh_hant", "繁体中文"], ["english", "英文"], ["japanese", "日语"],
    ["korean", "韩语"], ["russian", "俄语"], ["other", "其他"],
  ]);

  function i18n(key, fallback, params) {
    return globalThis.STI18n.text(key, fallback, params);
  }

  const log = window.STLoggerFactory.createLogger("steam", ID);
  const dom = window.STDomUtils || {};
  const VIRTUAL = window.SteamBuff?.virtualList || window.STVirtualList;

  function text(value) {
    return String(value || "").trim();
  }

  function assetUrl(path) {
    return window.SteamBuff?.path?.url ? window.SteamBuff.path.url(path) : path;
  }

  function iconHtml(path, className, label = "") {
    return `<img class="${className}" src="${esc(assetUrl(path))}" alt="${esc(label)}" aria-hidden="${label ? "false" : "true"}" draggable="false">`;
  }

  function steamFavoriteMenuItem(menu) {
    return Array.from(menu?.children || []).find((node) => (
      node.getAttribute?.("role") === "menuitem"
      && STEAM_FAVORITE_LABELS.includes(text(node.textContent))
    )) || null;
  }

  function reactFiber(node) {
    const key = Object.keys(node || {}).find((name) => name.startsWith("__reactFiber"));
    return key ? node[key] : null;
  }

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setHtml(el, html, reason) {
    if (dom.setTrustedHTML && dom.trustedHTML) {
      dom.setTrustedHTML(el, dom.trustedHTML(html, reason));
      return;
    }
    el.textContent = "";
  }

  function postReq(data) {
    document.documentElement?.setAttribute(REQ_ATTR, JSON.stringify({
      script: ID,
      side: "page",
      rid: data.rid || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ...data,
      time: Date.now(),
    }));
  }

  function sameNameDraft(left, right) {
    const aliases = (value) => JSON.stringify(Array.isArray(value?.aliases) ? value.aliases : []);
    return String(left?.custom_name || "") === String(right?.custom_name || "")
      && String(left?.mnemonic || "") === String(right?.mnemonic || "")
      && String(left?.pinyin || "") === String(right?.pinyin || "")
      && (left?.mnemonic_locked === true) === (right?.mnemonic_locked === true)
      && (left?.pinyin_locked === true) === (right?.pinyin_locked === true)
      && aliases(left) === aliases(right);
  }

  function adoptDrafts(drafts, cloudFor) {
    const next = new Map();
    for (const [appid, draft] of drafts) {
      if (!draft?.edited) {
        continue;
      }
      next.set(appid, {
        ...draft,
        conflict: !sameNameDraft(draft.base, cloudFor(appid)),
      });
    }
    return next;
  }

  function request(type, extra = {}, timeoutMs = 20000, signal) {
    const rid = extra.rid || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
      let observer = null;
      const timer = window.setTimeout(() => {
        finish(false, { error: i18n("steam.independentName.timeout", "名称服务响应超时") });
      }, timeoutMs);
      const onAbort = () => finish(false, { error: i18n("common.cancel", "取消") });
      function finish(ok, payload) {
        window.clearTimeout(timer);
        observer?.disconnect();
        signal?.removeEventListener("abort", onAbort);
        if (ok) resolve(payload);
        else reject(new Error(payload?.error || i18n("steam.independentName.requestFailed", "名称请求失败")));
      }
      function read() {
        try {
          return JSON.parse(document.documentElement?.getAttribute(RES_ATTR) || "{}");
        } catch {
          return {};
        }
      }
      observer = new MutationObserver(() => {
        const body = read();
        if (body.script !== ID || body.side !== "content" || body.rid !== rid) {
          return;
        }
        finish(body.ok === true, body);
      });
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: [RES_ATTR],
      });
      if (signal?.aborted) { onAbort(); return; }
      signal?.addEventListener("abort", onAbort, { once: true });
      postReq({ type, rid, ...extra });
    });
  }

  function start(api, _feature, _context, scope) {
    const old = window.__SteamBuffLibraryIndependentNameUi;
    if (old?.started) {
      return { started: false, reason: "already-started", stop: old.stop };
    }

    const state = {
      started: true,
      ch: typeof BroadcastChannel === "function" ? new BroadcastChannel(CH) : null,
      rows: [],
      rowsByAppid: new Map(),
      filtered: [],
      snapshot: { items: {}, count: 0, quota: -1 },
      meta: { options: {}, capabilities: {} },
      drafts: new Map(),
      search: "",
      searchTimer: 0,
      selected: new Set(),
      selectedDrafts: new Set(),
      filters: [],
      filterDraft: null,
      filterSession: null,
      filterPicker: null,
      filterPickerAnchor: null,
      referenceRun: null,
      referencePending: null,
      referenceSession: null,
      virtual: VIRTUAL?.createVirtualWindow?.({
        rowHeight: ROW_HEIGHT,
        viewportHeight: VIEWPORT_HEIGHT,
        overscan: OVERSCAN,
      }) || null,
      scrollTop: 0,
      busy: false,
      message: "",
      pendingImport: null,
      batchSession: null,
      singleSession: null,
      currentGame: null,
      singleBusy: false,
      singleMessage: "",
      opener: null,
      aliasPending: new Map(),
      aliasEditor: null,
      aliasSession: null,
      singleReading: null,
      batchReadings: new Map(),
      batchReadingTimer: 0,
      batchSaving: false,
      readingTimer: 0,
    };
    let painted = null;
    let libsTask = null;

    function cloudOf(appid) {
      const row = state.snapshot.items?.[String(appid)] || state.snapshot.items?.[appid] || {};
      return {
        custom_name: text(row.custom_name),
        aliases: Array.isArray(row.aliases) ? row.aliases.slice() : [],
        mnemonic: text(row.mnemonic),
        pinyin: text(row.pinyin),
        mnemonic_locked: row.mnemonic_locked === true,
        pinyin_locked: row.pinyin_locked === true,
      };
    }

    function draftOf(appid) {
      const draft = state.drafts.get(appid);
      if (draft?.edited) {
        return draft;
      }
      return cloudOf(appid);
    }

    function ensureEdited(appid) {
      const current = state.drafts.get(appid);
      if (current?.edited) {
        return current;
      }
      const cloud = cloudOf(appid);
      const draft = {
        ...cloud,
        aliases: cloud.aliases.slice(),
        edited: true,
        conflict: false,
        base: cloud,
      };
      state.drafts.set(appid, draft);
      syncSelectedDraft(appid);
      return draft;
    }

    // 维护勾选与草稿的交集，输入时只更新当前 AppID，避免逐字遍历勾选集合
    function syncSelectedDraft(appid) {
      const draft = state.drafts.get(appid);
      if (state.selected.has(appid) && draft?.edited) {
        state.selectedDrafts.add(appid);
        return draft;
      }
      state.selectedDrafts.delete(appid);
      return null;
    }

    function syncSelectedDrafts() {
      state.selectedDrafts.clear();
      for (const appid of state.selected) syncSelectedDraft(appid);
    }

    function adoptSnapshot(snapshot) {
      if (snapshot) {
        state.snapshot = snapshot;
        if (snapshot.meta && typeof snapshot.meta === "object") state.meta = snapshot.meta;
      }
      state.drafts = adoptDrafts(state.drafts, cloudOf);
      syncSelectedDrafts();
    }

    function css() {
      api.styles?.ensureFeatureStyle?.(ID);
    }

    function closeBatchModal() {
      closeFilterEditor();
      closeReferenceConfirm();
      if (state.referenceRun) {
        postReq({ type: "cancel-reference", rid: state.referenceRun.rid });
        state.referenceRun.controller.abort();
        state.referenceRun = null;
      }
      window.clearTimeout(state.batchReadingTimer);
      state.batchReadings.clear();
      closeAliasEditor();
      if (state.importRid) {
        postReq({ type: "cancel-import", rid: state.importRid });
        state.importRid = "";
      }
      state.aliasPending.clear();
      state.filters = [];
      state.filterDraft = null;
      state.search = "";
      state.meta = { options: {}, capabilities: {} };
      painted = null;
      const session = state.batchSession;
      state.batchSession = null;
      session?.close?.();
      const modal = document.getElementById(BATCH_MODAL);
      if (modal) {
        modal.hidden = true;
      }
    }

    function bindBatchModal(modal) {
      state.batchSession?.close?.();
      state.batchSession = null;
      const life = window.STDialogLifecycle;
      if (!modal || typeof life?.open !== "function") {
        return;
      }
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "st-lin-batch-title");
      state.batchSession = life.open({
        root: modal,
        restore: state.opener,
        initial: () => modal.querySelector("[data-lin-search]") || modal.querySelector("[data-lin-close]"),
        onEscape: () => {
          if (state.filterDraft) closeFilterEditor();
          else if (state.referencePending) closeReferenceConfirm();
          else closeBatchModal();
        },
      });
      state.batchSession.focusInitial?.();
    }

    function closeSingleModal() {
      window.clearTimeout(state.readingTimer);
      state.singleReading = null;
      const session = state.singleSession;
      state.singleSession = null;
      session?.close?.();
      state.currentGame = null;
      state.singleBusy = false;
      state.singleMessage = "";
      state.aliasPending.clear();
      const modal = document.getElementById(MODAL);
      if (modal) {
        modal.hidden = true;
      }
    }

    function bindSingleModal(modal) {
      state.singleSession?.close?.();
      state.singleSession = null;
      const life = window.STDialogLifecycle;
      if (!modal || typeof life?.open !== "function") {
        return;
      }
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "st-lin-single-title");
      state.singleSession = life.open({
        root: modal,
        restore: state.opener,
        initial: () => modal.querySelector("[data-lin-single-name]") || modal.querySelector("[data-lin-single-close]"),
        onEscape: () => closeSingleModal(),
      });
      state.singleSession.focusInitial?.();
    }

    function officialNameOf(item) {
      return text(item?.__RickyStOriginalName) || text(item?.display_name);
    }

    function singleAliasHtml(appid, aliases) {
      const chips = (aliases || []).map((alias) => `
        <button class="st-lin-chip" type="button" data-lin-single-alias-del="${esc(alias)}">${esc(alias)} ×</button>
      `).join("");
      const pending = state.aliasPending.get(appid) || "";
      return `
        <div class="st-lin-single-aliases">
          ${chips}
          <input data-lin-single-alias type="text" maxlength="40" value="${esc(pending)}" placeholder="${esc(i18n("steam.independentName.aliasHint", "回车或空格添加"))}" ${aliases.length >= ALIAS_MAX || state.singleBusy ? "disabled" : ""}>
        </div>
      `;
    }

    function singleModalHtml() {
      const game = state.currentGame || {};
      const appid = Number(game.appid) || 0;
      const draft = draftOf(appid);
      const status = appid ? syncStatus(appid) : { kind: "", text: "" };
      const message = state.singleMessage || status.text || "";
      const disabled = state.singleBusy || !appid ? "disabled" : "";
      return `
        <div class="st-lin-single-dialog">
          <header class="st-lin-head">
            <h2 id="st-lin-single-title">${esc(i18n("steam.independentName.title", "自定义名称"))}</h2>
            <button class="st-lin-close" type="button" data-lin-single-close aria-label="${esc(i18n("common.close", "关闭"))}">×</button>
          </header>
          <div class="st-lin-single-form" data-appid="${appid}">
            <span class="st-lin-label">${esc(i18n("steam.independentName.colAppid", "AppID"))}</span>
            <output>${appid || ""}</output>
            <span class="st-lin-label">${esc(i18n("steam.independentName.colOfficial", "Steam 原名称"))}</span>
            <output title="${esc(game.official_name)}">${esc(game.official_name)}</output>
            <label for="st-lin-single-name">${esc(i18n("steam.independentName.colCustom", "自定义名称"))}</label>
            <div class="st-lin-single-name-field">
              <input id="st-lin-single-name" data-lin-single-name type="text" maxlength="200" value="${esc(draft.custom_name)}" ${disabled}>
              <div class="st-lin-single-reference" data-lin-single-reference ${game.reference_name ? "" : "hidden"}>
                <span>${esc(i18n("steam.independentName.referenceName", "参考名称："))}</span>
                <button type="button" data-lin-single-use-reference aria-controls="st-lin-single-name" title="${esc(i18n("steam.independentName.referenceHint", "点击填入自定义名称"))}" ${disabled}>${esc(game.reference_name || "")}</button>
              </div>
            </div>
            <span class="st-lin-label">${esc(i18n("steam.independentName.colAlias", "别名"))}</span>
            ${singleAliasHtml(appid, draft.aliases || [])}
            <label for="st-lin-single-mnemonic">${esc(i18n("steam.independentName.colMnemonic", "助记符"))}</label>
            <input id="st-lin-single-mnemonic" data-lin-single-mnemonic type="text" maxlength="200" value="${esc(draft.mnemonic)}" ${disabled}>
            <label for="st-lin-single-pinyin">${esc(i18n("steam.independentName.colPinyin", "拼音全拼"))}</label>
            <input id="st-lin-single-pinyin" data-lin-single-pinyin type="text" maxlength="200" value="${esc(draft.pinyin)}" ${disabled}>
            <div class="st-lin-readings st-lin-single-readings" data-lin-single-readings>${state.singleBusy ? "" : readingsHtml(singleReading(appid))}</div>
          </div>
          <p class="st-lin-msg ${status.kind === "rejected" ? "st-lin-sync-error" : ""}" data-lin-single-msg role="status">${esc(message)}</p>
          <footer class="st-lin-single-footer">
            <button class="st-lin-btn" type="button" data-lin-open-batch>${esc(i18n("steam.independentName.batch", "批量设置"))}</button>
            <div class="st-lin-single-actions">
              <button class="st-lin-btn" type="button" data-lin-single-cancel>${esc(i18n("common.cancel", "取消"))}</button>
              <button class="st-lin-btn st-lin-primary" type="button" data-lin-single-confirm ${disabled}>${esc(i18n("common.confirm", "确认"))}</button>
            </div>
          </footer>
        </div>
      `;
    }

    function renderSingleModal(options = {}) {
      const modal = document.getElementById(MODAL);
      if (!modal || !state.currentGame) {
        return;
      }
      const active = document.activeElement;
      const focusKey = active?.dataset ? Object.keys(active.dataset).find((key) => key.startsWith("linSingle")) : "";
      const start = active?.selectionStart;
      const end = active?.selectionEnd;
      setHtml(modal, singleModalHtml(), "library-independent-name-single-modal");
      if (!options.preserveFocus || !focusKey) {
        return;
      }
      const attr = focusKey.replace(/[A-Z]/g, (value) => `-${value.toLowerCase()}`);
      const input = modal.querySelector(`[data-${attr}]`);
      input?.focus?.({ preventScroll: true });
      if (input?.setSelectionRange && typeof start === "number" && typeof end === "number") {
        input.setSelectionRange(start, end);
      }
    }

    async function loadSingleReference(game) {
      try {
        const result = await request("reference", { appid: game.appid });
        if (state.currentGame !== game || !state.started) return;
        if (typeof result.name !== "string") {
          throw new TypeError("社区参考名称响应格式错误");
        }
        game.reference_name = text(result.name);
        const modal = document.getElementById(MODAL);
        const reference = modal?.querySelector("[data-lin-single-reference]");
        const button = reference?.querySelector("[data-lin-single-use-reference]");
        if (!reference || !button) return;
        button.textContent = game.reference_name;
        button.disabled = state.singleBusy;
        reference.hidden = !game.reference_name;
      } catch (error) {
        if (state.currentGame !== game || !state.started) return;
        log.warn("independent-name-reference-failed", "社区参考名称读取失败", { error, appid: game.appid });
      }
    }

    async function openSingleModal(game) {
      const appid = Number(game?.appid) || 0;
      const officialName = text(game?.official_name);
      if (!appid || !officialName) {
        return;
      }
      css();
      closeBatchModal();
      let modal = document.getElementById(MODAL);
      if (!modal) {
        modal = document.createElement("section");
        modal.id = MODAL;
        modal.addEventListener("click", onSingleClick);
        modal.addEventListener("keydown", onSingleKey);
        modal.addEventListener("input", onSingleInput);
        modal.addEventListener("compositionend", scheduleSingleReadings);
        document.body.appendChild(modal);
      }
      state.opener = document.activeElement;
      state.currentGame = { appid, official_name: officialName };
      const currentGame = state.currentGame;
      state.singleBusy = true;
      state.singleMessage = i18n("steam.independentName.loading", "正在加载...");
      state.aliasPending.delete(appid);
      renderSingleModal();
      modal.hidden = false;
      bindSingleModal(modal);
      try {
        const [snap] = await Promise.all([request("snapshot"), loadLibs()]);
        if (state.currentGame !== currentGame) {
          return;
        }
        adoptSnapshot(snap.data || state.snapshot);
        state.singleBusy = false;
        state.singleMessage = "";
        renderSingleModal();
        state.singleSession?.focusInitial?.();
        void loadSingleReference(currentGame);
      } catch (error) {
        if (state.currentGame !== currentGame) return;
        state.singleBusy = false;
        state.singleMessage = error?.message || String(error);
        log.warn("independent-name-open-failed", "独立版单游戏名称弹窗打开失败", { error, appid });
        renderSingleModal();
      }
    }

    function filterFields() {
      const labels = {
        custom_name: i18n("steam.independentName.colCustom", "自定义名称"),
        aliases: i18n("steam.independentName.colAlias", "别名"),
        mnemonic: i18n("steam.independentName.colMnemonic", "助记符"),
        pinyin: i18n("steam.independentName.colPinyin", "拼音全拼"),
        app_type: i18n("steam.independentName.gameType", "游戏类型"),
        ...Object.fromEntries(Object.entries(FIELD_LABELS).map(([key, value]) => [key, i18n(`steam.independentName.filterField${key}`, value)])),
      };
      return FILTER_GROUPS.flatMap(([, fields]) => fields.map(field => [field, labels[field] || field]));
    }

    function filterGroups() {
      const labels = Object.fromEntries(filterFields());
      return FILTER_GROUPS.map(([group, fields]) => [group, fields.map(field => [field, labels[field]])]);
    }

    function gameTypes() {
      return [
        ["game", i18n("steam.independentName.typeGame", "游戏")],
        ["software", i18n("steam.independentName.typeSoftware", "软件")],
        ["tool", i18n("steam.independentName.typeTool", "工具")],
        ["audio", i18n("steam.independentName.typeAudio", "音频")],
        ["video", i18n("steam.independentName.typeVideo", "视频")],
        ["other", i18n("steam.independentName.typeOther", "其他")],
      ];
    }

    function isDiscreteField(field) {
      return ["app_type", "sources", "original_language", "collections", "modes", "status", "privacy", "languages", "genres", "features", "tags", "hardware", "accessibility", "review_score"].includes(field);
    }

    function isRangeField(field) {
      return ["metacritic_score", "date_added", "date_release", "date_last_played", "playtime_minutes"].includes(field);
    }

    function isDateField(field) {
      return ["date_added", "date_release", "date_last_played"].includes(field);
    }

    function operators(field) {
      const keys = field === "original_language" ? ["contains", "notContains", "equals", "notEquals"] : field === "app_type" || isDiscreteField(field) ? ["equals", "notEquals"] : isRangeField(field) ? ["between", "unknown"] : ["notEmpty", "empty", "contains", "notContains", "equals", "notEquals"];
      const labels = {
        notEmpty: "不为空", empty: "为空",
        contains: "包含", notContains: "不包含", equals: "等于", notEquals: "不等于", between: "范围内", unknown: "未提供",
      };
      return keys.map(key => [key, i18n(`steam.independentName.filterOp${key[0].toUpperCase()}${key.slice(1)}`, labels[key])]);
    }

    function newFilter() {
      return { field: "custom_name", op: "notEmpty", value: "", values: [], min: "", max: "", preset: "", dateStart: "", dateEnd: "" };
    }

    function gameType(type) {
      if (!Number.isSafeInteger(type)) throw new TypeError(i18n("steam.independentName.typeMissing", "游戏类型数据不可用，请更新扩展后重试"));
      // Steam AppOverview 的 EProtoAppType 枚举；其余实际类型归入“其他”
      return ({ 1: "game", 2: "software", 4: "tool", 8192: "audio", 2048: "video" })[type] || "other";
    }

    function filterAvailability(field) {
      if (field === "custom_name" || field === "aliases" || field === "mnemonic" || field === "pinyin") {
        return { ready: true, message: "" };
      }
      if (field === "app_type") {
        const ready = state.rows.length > 0 && state.rows.some(row => Number.isSafeInteger(row.app_type));
        return { ready, message: ready ? "" : i18n("steam.independentName.typeMissing", "游戏类型数据不可用，请更新扩展后重试") };
      }
      if (state.meta?.capabilities?.[field] === false) {
        const label = filterFields().find(([key]) => key === field)?.[1] || field;
        return { ready: false, message: i18n("steam.independentName.metadataUnavailable", "$field$数据不可用，请更新扩展后重试", { field: label }) };
      }
      const ready = state.rows.some(row => rowMetadata(row, field).ready);
      const label = filterFields().find(([key]) => key === field)?.[1] || field;
      return { ready, message: ready ? "" : i18n("steam.independentName.metadataUnavailable", "$field$数据不可用，请更新扩展后重试", { field: label }) };
    }

    function optionList(field) {
      const fallback = {
        sources: [["mine", "自己的游戏"], ["family", "家庭组游戏"]],
        original_language: ORIGINAL_LANGUAGE_OPTIONS,
        modes: [["single", "单人"], ["multiplayer", "多人"], ["coop", "合作"], ["local_multiplayer", "本地多人"]],
        status: [["ready", "准备就绪"], ["installed", "已本地安装"], ["played", "已玩过"], ["unplayed", "未玩过"]],
        privacy: [["normal", "正常"], ["private", "私密"], ["hidden", "隐藏"]],
        languages: Object.entries(LANGUAGE_LABELS),
        genres: [["action", "动作"], ["adventure", "冒险"], ["casual", "休闲"], ["indie", "独立"], ["massively_multiplayer", "大型多人在线"], ["racing", "竞速"], ["rpg", "角色扮演"], ["simulation", "模拟"], ["sports", "体育"], ["strategy", "策略"]],
        features: [["trading_cards", "集换式卡牌"], ["workshop", "创意工坊"], ["achievements", "成就"], ["steam_cloud", "Steam 云"], ["remote_play", "远程同乐"], ["family_sharing", "家庭共享"]],
        tags: [["19", "动作"], ["21", "冒险"], ["122", "角色扮演"], ["492", "独立"], ["597", "休闲"], ["599", "模拟"], ["699", "竞速"], ["701", "体育"]],
        hardware: [["controller_full", "完全支持控制器"], ["controller_partial", "部分支持控制器"], ["controller_recommended", "建议使用控制器"], ["vr", "VR"], ["non_vr", "非 VR"], ["deck_0", "Steam Deck：未知"], ["deck_1", "Steam Deck：Unsupported"], ["deck_2", "Steam Deck：Playable"], ["deck_3", "Steam Deck：Verified"]],
        accessibility: Object.entries(ACCESSIBILITY_LABELS),
        review_score: Object.entries(REVIEW_LABELS),
      };
      const dynamic = state.meta?.options?.[field === "collections" ? "collections" : field === "tags" ? "tags" : field === "languages" ? "languages" : field === "original_language" ? "originalLanguages" : ""];
      const source = Array.isArray(dynamic) && dynamic.length ? dynamic.map(item => [String(item.value), text(item.label)]) : fallback[field] || [];
      const unique = new Map();
      for (const [rawValue, rawLabel] of source) {
        const value = field === "languages" ? (String(rawValue) === "sc_schinese" ? "schinese" : String(rawValue)) : String(rawValue);
        const label = text(rawLabel);
        if (value && label && !unique.has(value)) unique.set(value, label);
      }
      return Array.from(unique, ([value, label]) => [value, label]);
    }

    function sortedFilterOptions(field, selected = []) {
      const selectedSet = new Set(selected.map(String));
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
      return optionList(field).slice().sort((left, right) => {
        const leftSelected = selectedSet.has(String(left[0])) ? 0 : 1;
        const rightSelected = selectedSet.has(String(right[0])) ? 0 : 1;
        return leftSelected - rightSelected || collator.compare(left[1], right[1]) || collator.compare(left[0], right[0]);
      });
    }

    function filterValueDisplay(field, values) {
      const labels = new Map((field === "app_type" ? gameTypes() : optionList(field)).map(([value, label]) => [String(value), label]));
      const selected = values.map(String).map(value => labels.get(value) || value);
      const placeholder = i18n("steam.independentName.filterChooseValue", "选择或输入");
      const text = selected.length > 2 ? `${selected.slice(0, 2).join("、")} +${selected.length - 2}` : selected.join("、");
      return { text: text || placeholder, title: selected.join("、") || placeholder };
    }

    function filterOptionMenuHtml(field, filter) {
      const options = field === "app_type" ? gameTypes() : sortedFilterOptions(field, filter.values);
      const searchLabel = i18n("steam.independentName.filterOptionSearch", "搜索选项");
      const inputPlaceholder = i18n("steam.independentName.filterChooseValue", "选择或输入");
      const optionsHtml = options.map(([key, label]) => `<label class="st-lin-filter-option"><input type="checkbox" data-lin-filter-option="${esc(key)}" ${field === "app_type" ? `data-lin-filter-type="${esc(key)}"` : ""} data-lin-filter-search-text="${esc(`${key} ${label}`.toLocaleLowerCase())}" ${filter.values.includes(key) ? "checked" : ""}> <span>${esc(label)}</span></label>`).join("");
      const display = filterValueDisplay(field, filter.values);
      const valueLabel = i18n("steam.independentName.filterValue", "筛选值");
      return `<div class="st-lin-filter-value-select"><input class="st-lin-btn st-lin-filter-value-button" type="text" role="combobox" data-lin-filter-values data-lin-filter-option-search value="${filter.values.length ? esc(display.text) : ""}" placeholder="${esc(inputPlaceholder)}" autocomplete="off" aria-autocomplete="list" aria-expanded="false" aria-label="${esc(valueLabel)}" title="${esc(display.title)}"><div class="st-lin-filter-option-menu" data-lin-filter-option-menu popover="manual" hidden><div class="st-lin-filter-types">${optionsHtml}</div></div></div>`;
    }

    function datePresets() {
      return DATE_PRESET_DEFS.map(([value, label]) => [value, i18n(`steam.independentName.datePreset${value}`, label)]);
    }

    function dateRange(filter, now = Date.now()) {
      if (!isDateField(filter.field)) return null;
      if (filter.preset && filter.preset !== "custom") {
        const seconds = Math.floor(now / 1000);
        const durations = { "30m": 30 * 60, "1h": 60 * 60, "6h": 6 * 60 * 60, "24h": 24 * 60 * 60, "3d": 3 * 86400, "7d": 7 * 86400, "14d": 14 * 86400, "30d": 30 * 86400 };
        if (durations[filter.preset]) return { min: seconds - durations[filter.preset], max: seconds };
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        const start = Math.floor(today.getTime() / 1000);
        if (filter.preset === "today") return { min: start, max: seconds };
        if (filter.preset === "yesterday") return { min: start - 86400, max: start - 1 };
      }
      if (filter.preset === "custom") {
        const start = filter.dateStart ? new Date(`${filter.dateStart}T00:00:00`).getTime() : NaN;
        const end = filter.dateEnd ? new Date(`${filter.dateEnd}T23:59:59`).getTime() : NaN;
        return { min: Number.isFinite(start) ? Math.floor(start / 1000) : -Infinity, max: Number.isFinite(end) ? Math.floor(end / 1000) : Infinity };
      }
      return null;
    }

    function rowMetadata(row, field) {
      const metadata = row?.metadata;
      if (!metadata || metadata.ready?.[field] === false) return { ready: false, values: [] };
      if (field === "date_added" || field === "date_release" || field === "date_last_played") {
        const value = metadata.dates?.[{ date_added: "added", date_release: "release", date_last_played: "last_played" }[field]];
        return { ready: Number.isFinite(value), value };
      }
      if (field === "metacritic_score" || field === "playtime_minutes") {
        const value = metadata[field];
        return { ready: Number.isFinite(value), value };
      }
      const value = metadata[field];
      if (field === "privacy" && Array.isArray(value) && value.length === 0 && metadata.ready?.privacy !== false) {
        return { ready: true, values: ["normal"] };
      }
      if (field === "original_language") {
        return { ready: value !== undefined && value !== null, values: Array.isArray(value) ? value.map(String) : value == null ? [] : [String(value)] };
      }
      if (field === "languages") {
        return { ready: Array.isArray(value), values: Array.isArray(value) ? value.map(item => String(item) === "sc_schinese" ? "schinese" : String(item)) : [] };
      }
      return { ready: value !== undefined && value !== null, values: Array.isArray(value) ? value.map(String) : [String(value)] };
    }

    function matchesDiscrete(filter, metadata) {
      if (!metadata.ready) return false;
      const wanted = new Set(filter.values.map(String));
      const foundValues = new Set(metadata.values.map(String));
      if (filter.field === "original_language") {
        const intersects = Array.from(foundValues).some(value => wanted.has(value));
        const exact = foundValues.size === wanted.size && Array.from(foundValues).every(value => wanted.has(value));
        if (filter.op === "contains") return intersects;
        if (filter.op === "notContains") return !intersects;
        if (filter.op === "equals") return exact;
        return !exact;
      }
      const found = Array.from(foundValues).some(value => wanted.has(value));
      return filter.op === "equals" ? found : !found;
    }

    function matchesRange(filter, metadata) {
      if (filter.op === "unknown") return !metadata.ready;
      if (!metadata.ready) return false;
      const value = Number(metadata.value);
      const preset = dateRange(filter);
      const min = preset ? preset.min : (filter.min == null || filter.min === "" ? -Infinity : Number(filter.min));
      const max = preset ? preset.max : (filter.max == null || filter.max === "" ? Infinity : Number(filter.max));
      return Number.isFinite(value) && Number.isFinite(min) && Number.isFinite(max) && min <= max && value >= min && value <= max;
    }

    function matchesRow(row) {
      const draft = draftOf(row.appid);
      const q = text(state.search).toLowerCase();
      if (q && ![row.official_name, String(row.appid), draft.custom_name, draft.mnemonic, draft.pinyin, ...draft.aliases].join(" ").toLowerCase().includes(q)) return false;
      return state.filters.every(filter => {
        if (filter.field === "app_type") {
          const found = filter.values.includes(gameType(row.app_type));
          return filter.op === "equals" ? found : !found;
        }
        if (isDiscreteField(filter.field)) return matchesDiscrete(filter, rowMetadata(row, filter.field));
        if (isRangeField(filter.field)) return matchesRange(filter, rowMetadata(row, filter.field));
        const values = (filter.field === "aliases" ? draft.aliases : [draft[filter.field]]).map(value => text(value).toLowerCase()).filter(Boolean);
        if (filter.op === "empty") return values.length === 0;
        if (filter.op === "notEmpty") return values.length > 0;
        const needle = text(filter.value).toLowerCase();
        const found = values.some(value => filter.op === "contains" || filter.op === "notContains" ? value.includes(needle) : value === needle);
        return filter.op === "notContains" || filter.op === "notEquals" ? !found : found;
      });
    }

    // 条件应用和搜索只处理本地库数据；勾选集合始终限定在当前筛选结果内
    function applySearch() {
      state.filtered = state.rows.filter(matchesRow);
      const visible = new Set(state.filtered.map(row => row.appid));
      for (const appid of state.selected) if (!visible.has(appid)) {
        state.selected.delete(appid);
        state.selectedDrafts.delete(appid);
      }
    }

    function refreshDraftFilter(appid) {
      if (!state.filters.length && !text(state.search)) return;
      const row = state.rowsByAppid.get(appid);
      if (!row || matchesRow(row)) return;
      const index = state.filtered.findIndex(item => item.appid === appid);
      if (index < 0) return;
      state.filtered = state.filtered.slice();
      state.filtered.splice(index, 1);
      state.selected.delete(appid);
      state.selectedDrafts.delete(appid);
      renderTable();
    }

    function renderFilterChips() {
      const modal = document.getElementById(BATCH_MODAL);
      const chips = modal?.querySelector("[data-lin-filter-chips]");
      if (!chips) return;
      setHtml(chips, state.filters.map((filter, index) => {
        const field = filterFields().find(([key]) => key === filter.field)?.[1] || filter.field;
        const op = operators(filter.field).find(([key]) => key === filter.op)[1];
        const value = filter.field === "app_type"
          ? gameTypes().filter(([key]) => filter.values.includes(key)).map(([, label]) => label).join(" / ")
          : isDiscreteField(filter.field) ? optionList(filter.field).filter(([key]) => filter.values.includes(key)).map(([, label]) => label).join(" / ")
          : isRangeField(filter.field) ? (isDateField(filter.field) && filter.preset
            ? (datePresets().find(([key]) => key === filter.preset)?.[1] || filter.preset)
            : `${filter.min || filter.dateStart || "-∞"} ~ ${filter.max || filter.dateEnd || "∞"}`) : filter.value;
        const removeLabel = i18n("steam.independentName.removeFilter", "移除筛选");
        return `<span class="st-lin-filter-chip"><button type="button" data-lin-filter-edit>${esc(`${field} ${op} ${value}`)}</button><button class="st-lin-filter-chip-remove" type="button" data-lin-filter-remove="${index}" aria-label="${esc(removeLabel)}" title="${esc(removeLabel)}">${iconHtml(FILTER_DELETE_ICON_PATH, "st-lin-filter-delete-icon")}</button></span>`;
      }).join(""), "library-independent-name-filter-chips");
      const clear = modal.querySelector("[data-lin-filter-clear]");
      clear.hidden = state.filters.length === 0;
      clear.disabled = state.filters.length === 0 || !!state.referenceRun;
    }

    function renderFilterEditor() {
      const editor = document.getElementById(BATCH_MODAL)?.querySelector("[data-lin-filter-editor]");
      if (!editor || !state.filterDraft) return;
      closeFilterPicker();
      setHtml(editor.querySelector("[data-lin-filter-rows]"), state.filterDraft.map((filter, index) => {
        const field = filterFields().find(([key]) => key === filter.field)?.[1] || filter.field;
        const ops = operators(filter.field).map(([key, label]) => `<option value="${key}" ${key === filter.op ? "selected" : ""}>${esc(label)}</option>`).join("");
        const value = isDiscreteField(filter.field)
          ? filterOptionMenuHtml(filter.field, filter)
          : isRangeField(filter.field)
              ? isDateField(filter.field)
                ? `<div class="st-lin-filter-date"><select data-lin-filter-date-preset aria-label="${esc(i18n("steam.independentName.filterDatePreset", "日期范围"))}" ${filter.op === "unknown" ? "hidden" : ""}>${datePresets().map(([key, label]) => `<option value="${esc(key)}" ${filter.preset === key ? "selected" : ""}>${esc(label)}</option>`).join("")}</select><div class="st-lin-filter-range" ${filter.preset !== "custom" || filter.op === "unknown" ? "hidden" : ""}><label class="st-lin-filter-date-bound"><span>${esc(i18n("steam.independentName.filterDateStart", "开始日期"))}</span><input data-lin-filter-date-start type="date" value="${esc(filter.dateStart)}"></label><label class="st-lin-filter-date-bound"><span>${esc(i18n("steam.independentName.filterDateEnd", "结束日期"))}</span><input data-lin-filter-date-end type="date" value="${esc(filter.dateEnd)}"></label></div></div>`
                : `<div class="st-lin-filter-range"><input data-lin-filter-min type="number" value="${esc(filter.min)}" placeholder="${esc(i18n("steam.independentName.filterMin", "最小"))}" ${filter.op === "unknown" ? "hidden" : ""}><input data-lin-filter-max type="number" value="${esc(filter.max)}" placeholder="${esc(i18n("steam.independentName.filterMax", "最大"))}" ${filter.op === "unknown" ? "hidden" : ""}></div>`
              : `<input data-lin-filter-value type="text" maxlength="200" aria-label="${esc(i18n("steam.independentName.filterValue", "筛选值"))}" value="${esc(filter.value)}" ${["empty", "notEmpty"].includes(filter.op) ? "hidden" : ""}>`;
        const fieldPicker = filterGroups().map(([group, fields]) => `<div class="st-lin-filter-picker-group"><strong>${esc(group)}</strong>${fields.map(([key, label]) => {
          const availability = filterAvailability(key);
          const selected = key === filter.field;
          return `<button class="st-lin-btn st-lin-filter-picker-option" type="button" data-lin-filter-field-value="${key}" aria-current="${selected ? "true" : "false"}" ${availability.ready ? "" : `disabled title="${esc(availability.message)}" aria-disabled="true"`}>${esc(label)}</button>`;
        }).join("")}</div>`).join("");
        const availability = filterAvailability(filter.field);
        const unavailable = availability.ready ? "" : `<p class="st-lin-filter-unavailable" data-lin-filter-unavailable role="status">${esc(availability.message)}</p>`;
        const renderedValue = availability.ready ? value : unavailable;
        const removeLabel = i18n("steam.independentName.removeFilter", "移除筛选");
        return `<div class="st-lin-filter-row" data-lin-filter-row="${index}"><div class="st-lin-filter-field"><button class="st-lin-btn st-lin-filter-field-button" type="button" data-lin-filter-field aria-expanded="false">${esc(field)} <span aria-hidden="true">▾</span></button><div class="st-lin-filter-picker" data-lin-filter-picker popover="manual" hidden><div class="st-lin-filter-picker-scroll">${fieldPicker}</div></div></div><select data-lin-filter-op aria-label="${esc(i18n("steam.independentName.filterOperator", "筛选关系"))}" ${availability.ready ? "" : "disabled"}>${ops}</select><div class="st-lin-filter-value">${renderedValue}</div><button class="st-lin-btn st-lin-filter-delete" type="button" data-lin-filter-delete="${index}" aria-label="${esc(removeLabel)}" title="${esc(removeLabel)}">${iconHtml(FILTER_DELETE_ICON_PATH, "st-lin-filter-delete-icon")}</button></div>`;
      }).join(""), "library-independent-name-filter-editor");
      const unavailable = state.filterDraft.map(filter => filterAvailability(filter.field)).find(result => !result.ready);
      const message = editor.querySelector("[data-lin-filter-msg]");
      if (message) message.textContent = unavailable?.message || "";
    }

    function openFilterEditor(opener, add) {
      if (state.referenceRun || state.busy) return;
      const editor = document.getElementById(BATCH_MODAL)?.querySelector("[data-lin-filter-editor]");
      if (!editor) return;
      state.filterDraft = state.filters.map(filter => ({ ...filter, values: filter.values.slice() }));
      if (add || !state.filterDraft.length) state.filterDraft.push(newFilter());
      renderFilterEditor();
      editor.hidden = false;
      editor.addEventListener("scroll", closeFilterPicker, { passive: true });
      editor.querySelector("[data-lin-filter-editor-scroll]")?.addEventListener("scroll", closeFilterPicker, { passive: true });
      state.filterSession = window.STDialogLifecycle.open({ root: editor, restore: opener, initial: () => editor.querySelector("[data-lin-filter-field]"), onEscape: () => {
        if (state.filterPicker) closeFilterPicker();
        else closeFilterEditor();
      } });
      state.filterSession.focusInitial();
    }

    function closeFilterEditor() {
      const editor = document.getElementById(BATCH_MODAL)?.querySelector("[data-lin-filter-editor]");
      if (editor) {
        closeFilterPicker();
        editor.removeEventListener("scroll", closeFilterPicker);
        editor.querySelector("[data-lin-filter-editor-scroll]")?.removeEventListener("scroll", closeFilterPicker);
        editor.hidden = true;
      }
      state.filterDraft = null;
      state.filterSession?.close();
      state.filterSession = null;
    }

    // 菜单进入 top layer，避免条件列表滚动容器裁剪；展开和视口调整只计算当前菜单
    function positionFilterPicker(picker = state.filterPicker, anchorButton = state.filterPickerAnchor) {
      if (!picker || !anchorButton) return;
      const anchor = anchorButton.getBoundingClientRect();
      if (picker.matches("[data-lin-filter-option-menu]")) {
        picker.style.width = `${Math.min(Math.max(anchor.width, 220), window.innerWidth - 16)}px`;
      }
      const rect = picker.getBoundingClientRect();
      picker.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - rect.width - 8))}px`;
      const below = anchor.bottom + 8 + rect.height <= window.innerHeight - 8;
      picker.dataset.linFilterPlacement = below ? "below" : "above";
      picker.style.top = `${below ? anchor.bottom + 8 : Math.max(8, anchor.top - rect.height - 8)}px`;
    }

    function onFilterResize() {
      if (state.filterPicker) positionFilterPicker(state.filterPicker);
    }

    function closeFilterPicker(restoreFocus = true) {
      const picker = state.filterPicker;
      if (!picker) return;
      const button = state.filterPickerAnchor;
      state.filterPicker = null;
      state.filterPickerAnchor = null;
      window.removeEventListener("resize", onFilterResize);
      picker.hidePopover();
      picker.hidden = true;
      button?.setAttribute("aria-expanded", "false");
      if (picker.matches("[data-lin-filter-option-menu]")) {
        for (const option of picker.querySelectorAll("[data-lin-filter-option]")) option.closest("label").hidden = false;
        const row = button?.closest("[data-lin-filter-row]");
        const filter = row && state.filterDraft?.[Number(row.dataset.linFilterRow)];
        if (button && filter) {
          const display = filterValueDisplay(filter.field, filter.values);
          button.value = filter.values.length ? display.text : "";
          button.title = display.title;
        }
      }
      if (restoreFocus) button?.focus({ preventScroll: true });
    }

    function toggleFilterPicker(button, picker, initialSelector) {
      if (state.filterPicker === picker) {
        closeFilterPicker(false);
        return;
      }
      closeFilterPicker(false);
      picker.hidden = false;
      picker.showPopover();
      state.filterPicker = picker;
      state.filterPickerAnchor = button;
      button.setAttribute("aria-expanded", "true");
      positionFilterPicker();
      window.addEventListener("resize", onFilterResize);
      picker.querySelector(initialSelector)?.focus({ preventScroll: true });
    }

    function applyFilters() {
      if (!state.filterDraft) return;
      const editor = document.getElementById(BATCH_MODAL).querySelector("[data-lin-filter-editor]");
      const invalid = state.filterDraft.some(filter => {
        if (!filterAvailability(filter.field).ready) return true;
        if (filter.field === "app_type" || isDiscreteField(filter.field)) return filter.op !== "unknown" && !filter.values.length;
        if (isRangeField(filter.field)) {
          const hasRange = isDateField(filter.field)
            ? !!filter.preset || !!filter.dateStart || !!filter.dateEnd || filter.min !== "" || filter.max !== ""
            : filter.min !== "" || filter.max !== "";
          return filter.op !== "unknown" && !hasRange;
        }
        return !["empty", "notEmpty"].includes(filter.op) && !text(filter.value);
      });
      if (invalid) {
        const unavailable = state.filterDraft.map(filter => filterAvailability(filter.field)).find(result => !result.ready);
        editor.querySelector("[data-lin-filter-msg]").textContent = unavailable?.message || i18n("steam.independentName.filterIncomplete", "请填写筛选值或选择游戏类型");
        return;
      }
      if (state.filterDraft.some(filter => filter.field === "app_type") && state.rows.some(row => !Number.isSafeInteger(row.app_type))) {
        editor.querySelector("[data-lin-filter-msg]").textContent = i18n("steam.independentName.typeMissing", "游戏类型数据不可用，请更新扩展后重试");
        return;
      }
      state.filters = state.filterDraft;
      closeFilterEditor();
      applySearch();
      renderFilterChips();
      renderTable();
    }

    function changeSelection(mode) {
      if (state.referenceRun || state.busy) return;
      if (mode === "clear") state.selected.clear();
      else for (const row of state.filtered) {
        if (mode === "invert" && state.selected.has(row.appid)) state.selected.delete(row.appid);
        else state.selected.add(row.appid);
      }
      syncSelectedDrafts();
      const modal = document.getElementById(BATCH_MODAL);
      for (const input of modal.querySelectorAll("[data-lin-select]")) input.checked = state.selected.has(Number(input.dataset.linSelect));
      refreshBatchSave();
    }

    function aliasHtml(appid, aliases) {
      return `
        <button class="st-lin-alias-summary" type="button" data-lin-alias-edit="${appid}" title="${esc(i18n("steam.independentName.aliasEdit", "编辑别名"))}">
          ${aliasSummaryHtml(aliases)}
        </button>
      `;
    }

    function aliasSummaryHtml(aliases) {
      const summary = aliases.length ? aliases.join("、") : i18n("steam.independentName.aliasAdd", "添加别名");
      return `<span class="st-lin-alias-text">${esc(summary)}</span><span class="st-lin-alias-count">${aliases.length}/${ALIAS_MAX}</span>`;
    }

    function readingBase(appid) {
      const draft = draftOf(appid);
      return { name: draft.custom_name, pinyin: draft.pinyin, mnemonic: draft.mnemonic };
    }

    function sameReadingBase(left, right) {
      return left.name === right.name && left.pinyin === right.pinyin && left.mnemonic === right.mnemonic;
    }

    function makeReading(appid) {
      const base = readingBase(appid);
      const control = { appid, base, model: null, error: "" };
      if (!text(base.name) || !text(base.pinyin)) return control;
      try {
        control.model = window.SteamBuff.libraryCustomNameMnemonic.readings(base.name, base, window.pinyinPro);
      } catch (error) {
        control.error = i18n("steam.independentName.readingFailed", "读音候选加载失败，请重新打开名称设置");
        log.error("independent-name-readings-failed", "名称读音候选解析失败", { error, appid });
      }
      return control;
    }

    function singleReading(appid) {
      if (state.singleReading?.appid === appid && state.singleReading.error) return state.singleReading;
      if (!state.singleReading || state.singleReading.appid !== appid || !sameReadingBase(state.singleReading.base, readingBase(appid))) {
        state.singleReading = makeReading(appid);
      }
      return state.singleReading;
    }

    function readingsHtml(control) {
      if (control?.error) return `<p class="st-lin-msg" role="status">${esc(control.error)}</p>`;
      const model = control?.model;
      if (!model) return "";
      if (!model.groups.length) return "";
      const groups = model.groups.map((group) => {
        const context = i18n("steam.independentName.readingPosition", "第 $n$ 个字：$context$", { n: group.index + 1, context: group.context });
        return `<div class="st-lin-reading-group" role="group" aria-label="${esc(`${group.char} · ${context}`)}">
          <span title="${esc(context)}">${esc(group.char)}：</span>
          ${group.options.map((option) => `<button class="st-lin-reading-option" type="button" data-lin-reading-index="${group.index}" data-lin-reading-value="${esc(option.value)}" aria-pressed="${model.parts[group.index] === option.value}" aria-label="${esc(`${group.char} · ${context} · ${option.label}`)}">${esc(option.label)}</button>`).join("")}
        </div>`;
      }).join("");
      return `<div class="st-lin-reading-groups">${groups}</div>
        <div class="st-lin-reading-preview" data-lin-reading-preview ${model.replace ? "" : "hidden"}>
          <p class="st-lin-msg">${esc(i18n("steam.independentName.readingPreviewHint", "现有内容无法逐字对应。下方是生成预览，应用后将替换全拼和助记符。"))}</p>
          <span>${esc(i18n("steam.independentName.colPinyin", "拼音全拼"))}</span><output data-lin-reading-full>${esc(model.pinyin)}</output>
          <span>${esc(i18n("steam.independentName.colMnemonic", "助记符"))}</span><output data-lin-reading-mnemonic>${esc(model.mnemonic)}</output>
          <button class="st-lin-btn" type="button" data-lin-reading-apply>${esc(i18n("steam.independentName.readingApply", "替换全拼和助记符"))}</button>
        </div>`;
    }

    // 单游戏只解析当前名称，输入法完成后合并输入变化；候选点击不重建输入框或候选按钮
    function scheduleSingleReadings(event) {
      if (event && !event.target.matches("[data-lin-single-name], [data-lin-single-pinyin], [data-lin-single-mnemonic]")) return;
      window.clearTimeout(state.readingTimer);
      state.readingTimer = window.setTimeout(() => {
        state.readingTimer = 0;
        if (!state.currentGame || state.singleBusy) return;
        const panel = document.getElementById(MODAL)?.querySelector("[data-lin-single-readings]");
        if (panel) setHtml(panel, readingsHtml(singleReading(state.currentGame.appid)), "library-independent-name-readings");
      }, READINGS_MS);
    }

    function batchReading(appid) {
      const cached = state.batchReadings.get(appid);
      if (!cached || !sameReadingBase(cached.base, readingBase(appid))) {
        state.batchReadings.set(appid, makeReading(appid));
      }
      return state.batchReadings.get(appid);
    }

    function refreshBatchReading(appid) {
      const row = document.getElementById(BATCH_MODAL)?.querySelector(`tr[data-appid="${appid}"]`);
      const panel = row?.querySelector("[data-lin-batch-readings]");
      if (!panel) return;
      setHtml(panel, readingsHtml(batchReading(appid)), "library-independent-name-readings");
    }

    function scheduleBatchReadings(event) {
      const target = event.target;
      if (!target.matches(".st-lin-name, .st-lin-pinyin, .st-lin-mnemonic")) return;
      window.clearTimeout(state.batchReadingTimer);
      state.batchReadingTimer = 0;
      if (event.isComposing) return;
      const appid = Number(target.closest("tr[data-appid]")?.dataset.appid) || 0;
      state.batchReadingTimer = window.setTimeout(() => {
        state.batchReadingTimer = 0;
        if (state.started && appid) {
          refreshBatchReading(appid);
          refreshDraftFilter(appid);
        }
      }, READINGS_MS);
    }

    function refreshBatchSave() {
      const modal = document.getElementById(BATCH_MODAL);
      const button = modal?.querySelector("[data-lin-save-all]");
      if (!button) return;
      const locked = state.busy || !!state.referenceRun;
      button.disabled = state.batchSaving || locked || state.selectedDrafts.size === 0;
      button.textContent = state.batchSaving
        ? i18n("steam.independentName.saving", "正在保存...")
        : i18n("steam.independentName.saveChanges", "保存修改");
      const quota = Number(state.snapshot.quota);
      const quotaText = quota === -1 ? i18n("steam.independentName.quotaUnlimited", "额度不限") : i18n("steam.independentName.quotaUsed", "已用 $count$ / $quota$", { count: state.snapshot.count, quota });
      modal.querySelector("[data-lin-stats]").textContent = `${i18n("steam.independentName.batchStats", "总 $total$ 款 · 筛选后 $filtered$ 款 · 已勾选 $selected$ 款 · 未保存修改 $dirty$ 款", { total: state.rows.length, filtered: state.filtered.length, selected: state.selected.size, dirty: state.drafts.size })} · ${i18n("steam.independentName.nameQuota", "名称额度：")} ${quotaText}`;
      modal.querySelector("[data-lin-selected-count]").textContent = i18n("steam.independentName.selectedCount", "已选 $n$ 款", { n: state.selected.size });
      modal.querySelector("[data-lin-export]").disabled = locked || !state.selected.size;
      const reference = modal.querySelector("[data-lin-reference-many]");
      reference.disabled = locked || state.batchSaving || !state.selected.size;
      reference.textContent = state.referenceRun ? i18n("steam.independentName.fetchingCommunity", "正在获取社区名称...") : i18n("steam.independentName.fetchCommunity", "获取社区名称");
      for (const control of modal.querySelectorAll("[data-lin-selection], [data-lin-select], [data-lin-search], [data-lin-filter-open], [data-lin-filter-add], [data-lin-import]")) control.disabled = locked;
      modal.querySelector("[data-lin-filter-clear]").disabled = locked || !state.filters.length;
      modal.querySelector("[data-lin-filter-chips]").inert = locked;
    }

    function applyReading(control) {
      const draft = ensureEdited(control.appid);
      draft.pinyin = control.model.pinyin;
      draft.mnemonic = control.model.mnemonic;
      draft.pinyin_locked = true;
      draft.mnemonic_locked = true;
      control.model.replace = false;
      control.base = readingBase(control.appid);
      const root = control.root || document.getElementById(MODAL);
      const pinyin = control.root
        ? document.getElementById(BATCH_MODAL)?.querySelector(`tr[data-appid="${control.appid}"] input.st-lin-pinyin`)
        : root.querySelector("[data-lin-single-pinyin]");
      const mnemonic = control.root
        ? document.getElementById(BATCH_MODAL)?.querySelector(`tr[data-appid="${control.appid}"] input.st-lin-mnemonic`)
        : root.querySelector("[data-lin-single-mnemonic]");
      if (pinyin) pinyin.value = draft.pinyin;
      if (mnemonic) mnemonic.value = draft.mnemonic;
      root.querySelector("[data-lin-reading-preview]").hidden = true;
      refreshBatchSave();
    }

    function onReadingClick(event, control) {
      const choice = event.target.closest("[data-lin-reading-value]");
      const apply = event.target.closest("[data-lin-reading-apply]");
      if (!choice && !apply) return false;
      if (!control?.model || control.error) return true;
      if (!sameReadingBase(control.base, readingBase(control.appid))) {
        const root = control.root || document.getElementById(MODAL)?.querySelector("[data-lin-single-readings]");
        if (control.root) refreshBatchReading(control.appid);
        else setHtml(root, readingsHtml(singleReading(control.appid)), "library-independent-name-readings");
        return true;
      }
      if (choice) {
        control.model = window.SteamBuff.libraryCustomNameMnemonic.selectReading(control.model, Number(choice.dataset.linReadingIndex), choice.dataset.linReadingValue);
        const group = choice.closest(".st-lin-reading-group");
        for (const button of group.querySelectorAll("[data-lin-reading-value]")) button.setAttribute("aria-pressed", String(button === choice));
        const root = control.root || document.getElementById(MODAL);
        root.querySelector("[data-lin-reading-full]").textContent = control.model.pinyin;
        root.querySelector("[data-lin-reading-mnemonic]").textContent = control.model.mnemonic;
      }
      if (apply || !control.model.replace) applyReading(control);
      return true;
    }

    function closeAliasEditor() {
      if (!state.aliasEditor && !state.aliasSession) return;
      const appid = state.aliasEditor?.appid;
      const session = state.aliasSession;
      state.aliasSession = null;
      state.aliasEditor = null;
      const modal = document.getElementById(BATCH_MODAL);
      const editor = modal?.querySelector("[data-lin-alias-editor]");
      if (editor) editor.hidden = true;
      session?.close?.();
      if (appid) modal?.querySelector(`tr[data-appid="${appid}"] [data-lin-alias-edit]`)?.focus?.({ preventScroll: true });
    }

    // 编辑区只维护当前游戏的别名副本，确认后写回待统一保存的草稿。
    function openAliasEditor(appid, opener) {
      const modal = document.getElementById(BATCH_MODAL);
      const editor = modal?.querySelector("[data-lin-alias-editor]");
      if (!editor || !appid) return;
      const aliases = draftOf(appid).aliases.slice();
      state.aliasEditor = { appid, aliases, base: aliases.slice(), editing: -1, input: "", message: "" };
      const official = opener.closest("tr")?.querySelector(".st-lin-official .st-lin-clip")?.textContent || "";
      setHtml(editor, `
        <div class="st-lin-alias-dialog">
          <header class="st-lin-head">
            <h3 id="st-lin-alias-title">${esc(i18n("steam.independentName.aliasEdit", "编辑别名"))}</h3>
            <button class="st-lin-close" type="button" data-lin-alias-cancel aria-label="${esc(i18n("common.close", "关闭"))}">×</button>
          </header>
          <p class="st-lin-alias-game">${esc(official)} <span>AppID ${appid}</span></p>
          <div class="st-lin-alias-tags" data-lin-alias-tags></div>
          <div class="st-lin-alias-entry">
            <input data-lin-alias-editor-input type="text" maxlength="40" aria-label="${esc(i18n("steam.independentName.colAlias", "别名"))}" placeholder="${esc(i18n("steam.independentName.aliasHint", "回车或空格添加"))}">
            <button class="st-lin-btn" type="button" data-lin-alias-commit></button>
            <button class="st-lin-btn" type="button" data-lin-alias-edit-cancel hidden>${esc(i18n("common.cancel", "取消"))}</button>
          </div>
          <p class="st-lin-alias-hint">${esc(i18n("steam.independentName.aliasEditorHint", "点击标签修改，每游戏最多 10 个；确认后点击该行保存。"))}</p>
          <p class="st-lin-msg" data-lin-alias-msg role="status"></p>
          <footer class="st-lin-alias-actions">
            <button class="st-lin-btn" type="button" data-lin-alias-cancel>${esc(i18n("common.cancel", "取消"))}</button>
            <button class="st-lin-btn st-lin-primary" type="button" data-lin-alias-confirm>${esc(i18n("common.confirm", "确认"))}</button>
          </footer>
        </div>
      `, "library-independent-name-alias-editor");
      editor.hidden = false;
      renderAliasEditor();
      const life = window.STDialogLifecycle;
      state.aliasSession = life.open({
        root: editor,
        restore: opener,
        initial: () => editor.querySelector("[data-lin-alias-editor-input]:not(:disabled)") || editor.querySelector("[data-lin-alias-confirm]"),
        onEscape: closeAliasEditor,
      });
      state.aliasSession.focusInitial();
    }

    function renderAliasEditor() {
      const draft = state.aliasEditor;
      const editor = document.getElementById(BATCH_MODAL)?.querySelector("[data-lin-alias-editor]");
      if (!draft || !editor) return;
      setHtml(editor.querySelector("[data-lin-alias-tags]"), draft.aliases.map((alias, index) => `
        <span class="st-lin-alias-tag">
          <button type="button" data-lin-alias-item="${index}" aria-pressed="${draft.editing === index}">${esc(alias)}</button>
          <button type="button" data-lin-alias-remove="${index}" aria-label="${esc(i18n("steam.independentName.aliasRemove", "删除别名：$alias$", { alias }))}">×</button>
        </span>
      `).join(""), "library-independent-name-alias-tags");
      const input = editor.querySelector("[data-lin-alias-editor-input]");
      input.value = draft.input;
      input.disabled = draft.editing < 0 && draft.aliases.length >= ALIAS_MAX;
      const commit = editor.querySelector("[data-lin-alias-commit]");
      commit.textContent = i18n(draft.editing < 0 ? "common.add" : "common.save", draft.editing < 0 ? "添加" : "保存");
      commit.disabled = input.disabled || !text(draft.input);
      editor.querySelector("[data-lin-alias-confirm]").disabled = draft.editing >= 0 && !text(draft.input);
      editor.querySelector("[data-lin-alias-edit-cancel]").hidden = draft.editing < 0;
      editor.querySelector("[data-lin-alias-msg]").textContent = draft.message;
    }

    function commitAliasInput() {
      const draft = state.aliasEditor;
      if (!draft) return false;
      const alias = text(draft.input);
      if (!alias) return draft.editing < 0;
      if (draft.aliases.some((item, index) => index !== draft.editing && item === alias)) {
        draft.message = i18n("steam.independentName.aliasDuplicate", "这个别名已存在");
        renderAliasEditor();
        return false;
      }
      if (draft.editing < 0 && draft.aliases.length >= ALIAS_MAX) return false;
      if (draft.editing < 0) draft.aliases.push(alias);
      else draft.aliases[draft.editing] = alias;
      draft.input = "";
      draft.editing = -1;
      draft.message = "";
      renderAliasEditor();
      const editor = document.getElementById(BATCH_MODAL)?.querySelector("[data-lin-alias-editor]");
      (editor?.querySelector("[data-lin-alias-editor-input]:not(:disabled)") || editor?.querySelector("[data-lin-alias-confirm]"))?.focus({ preventScroll: true });
      return true;
    }

    function onAliasClick(event) {
      const draft = state.aliasEditor;
      if (!draft || !event.target.closest("[data-lin-alias-editor]")) return false;
      if (event.target.closest("[data-lin-alias-cancel]")) {
        closeAliasEditor();
      } else if (event.target.closest("[data-lin-alias-confirm]")) {
        if (!commitAliasInput()) return true;
        const current = draftOf(draft.appid).aliases;
        if (JSON.stringify(current) !== JSON.stringify(draft.base)) {
          draft.message = i18n("steam.independentName.aliasChanged", "别名已更新，请关闭后重新打开编辑区");
          renderAliasEditor();
          return true;
        }
        if (JSON.stringify(draft.aliases) !== JSON.stringify(current)) ensureEdited(draft.appid).aliases = draft.aliases.slice();
        refreshDraftFilter(draft.appid);
        const summary = document.getElementById(BATCH_MODAL)?.querySelector(`tr[data-appid="${draft.appid}"] [data-lin-alias-edit]`);
        if (summary) setHtml(summary, aliasSummaryHtml(draft.aliases), "library-independent-name-alias-summary");
        refreshBatchSave();
        closeAliasEditor();
      } else if (event.target.closest("[data-lin-alias-commit]")) {
        commitAliasInput();
      } else {
        const item = event.target.closest("[data-lin-alias-item]");
        const remove = event.target.closest("[data-lin-alias-remove]");
        if (item) {
          draft.editing = Number(item.dataset.linAliasItem);
          draft.input = draft.aliases[draft.editing];
        } else if (remove) {
          const index = Number(remove.dataset.linAliasRemove);
          draft.aliases.splice(index, 1);
          if (draft.editing === index) { draft.editing = -1; draft.input = ""; }
          else if (draft.editing > index) draft.editing -= 1;
        } else if (event.target.closest("[data-lin-alias-edit-cancel]")) {
          draft.editing = -1;
          draft.input = "";
        } else return true;
        draft.message = "";
        renderAliasEditor();
        document.getElementById(BATCH_MODAL)?.querySelector("[data-lin-alias-editor-input]:not(:disabled)")?.focus({ preventScroll: true });
      }
      return true;
    }

    // 只读快照模块留下的 syncErrors。指纹对不上的旧错误已在 normalize 丢掉
    function syncStatus(appid) {
      const key = String(appid);
      const pending = state.snapshot.pending?.[key];
      const error = state.snapshot.syncErrors?.[key];
      if (pending && error?.message) {
        return {
          kind: "rejected",
          text: i18n("steam.independentName.syncBlocked", "云端拒绝：$message$", {
            message: error.message,
          }),
        };
      }
      if (pending) {
        return {
          kind: "waiting",
          text: i18n("steam.independentName.waitingCloud", "等待云端处理"),
        };
      }
      if (cloudOf(appid).custom_name) {
        return {
          kind: "saved",
          text: i18n("steam.independentName.saved", "本地已保存"),
        };
      }
      return { kind: "", text: "" };
    }

    function slot(html) {
      return `<div class="st-lin-slot">${html}</div>`;
    }

    function statusLine(status) {
      if (!status?.text) {
        return "";
      }
      const value = esc(status.text);
      const cls = status.kind === "rejected" ? "st-lin-sync-error" : "st-lin-sync-note";
      return `<div class="${cls}" title="${value}">${value}</div>`;
    }

    function rowsHtml(range) {
      const list = state.filtered.slice(range.start, range.end);
      const visible = new Set(list.map(row => row.appid));
      for (const appid of state.batchReadings.keys()) {
        if (!visible.has(appid)) state.batchReadings.delete(appid);
      }
      return list.map((row) => {
        const draft = draftOf(row.appid);
        const conflict = draft.conflict
          ? i18n("steam.independentName.draftConflict", "云端名称已更新，这行还有未保存的修改")
          : "";
        const status = syncStatus(row.appid);
        const official = esc(row.official_name);
        return `
          <tr data-appid="${row.appid}">
            <td class="st-lin-appid">${slot(`<label class="st-lin-row-select"><input type="checkbox" data-lin-select="${row.appid}" aria-label="${esc(i18n("steam.independentName.selectGame", "勾选 $name$", { name: row.official_name }))}" ${state.selected.has(row.appid) ? "checked" : ""} ${state.referenceRun ? "disabled" : ""}><span>${row.appid}</span></label>`)}</td>
            <td class="st-lin-official">${slot(`<span class="st-lin-clip" title="${official}">${official}</span>`)}</td>
            <td class="st-lin-custom">${slot(`<input class="st-lin-name" type="text" maxlength="200" value="${esc(draft.custom_name)}" title="${esc(conflict)}">${conflict ? `<div class="st-lin-sync-error" title="${esc(conflict)}">${esc(conflict)}</div>` : statusLine(status)}`)}</td>
            <td class="st-lin-alias">${slot(aliasHtml(row.appid, draft.aliases))}</td>
            <td class="st-lin-mnemonic">${slot(`<input class="st-lin-mnemonic" type="text" maxlength="200" value="${esc(draft.mnemonic)}">`)}</td>
            <td class="st-lin-pinyin">${slot(`<input class="st-lin-pinyin" type="text" maxlength="200" value="${esc(draft.pinyin)}"><div class="st-lin-batch-readings" data-lin-batch-readings>${readingsHtml(batchReading(row.appid))}</div>`)}</td>
          </tr>
        `;
      }).join("");
    }

    function fieldKind(input) {
      if (input.classList?.contains("st-lin-name")) return "name";
      if (input.classList?.contains("st-lin-mnemonic")) return "mnemonic";
      if (input.classList?.contains("st-lin-pinyin")) return "pinyin";
      return "";
    }

    // 名称类字段只抄当前焦点，避免把上一帧画面写回已更新的草稿
    function rememberEditing(body) {
      const active = document.activeElement;
      let focus = null;
      const inputs = typeof body.querySelectorAll === "function" ? body.querySelectorAll("input") : [];
      for (const input of inputs) {
        const appid = Number(input.closest("tr")?.dataset.appid) || 0;
        const kind = fieldKind(input);
        if (!appid || !kind) {
          continue;
        }
        if (input === active) {
          const key = kind === "name" ? "custom_name" : kind;
          if (input.value !== draftOf(appid)[key]) {
            const edited = ensureEdited(appid);
            edited[key] = input.value;
            if (kind === "mnemonic") edited.mnemonic_locked = true;
            if (kind === "pinyin") edited.pinyin_locked = true;
          }
        }
        if (input === active) {
          focus = { appid, kind, start: input.selectionStart, end: input.selectionEnd };
        }
      }
      return focus;
    }

    function restoreFocus(body, focus) {
      if (!focus || typeof body.querySelector !== "function") {
        return;
      }
      const selector = {
        name: ".st-lin-name",
        mnemonic: ".st-lin-mnemonic",
        pinyin: ".st-lin-pinyin",
      }[focus.kind];
      const input = body.querySelector(`tr[data-appid="${focus.appid}"] ${selector}`);
      if (!input || input.disabled) {
        return;
      }
      input.focus({ preventScroll: true });
      if (typeof focus.start === "number" && typeof focus.end === "number") {
        input.setSelectionRange(focus.start, focus.end);
      }
    }

    function sameWindow(range) {
      return painted
        && painted.start === range.start
        && painted.end === range.end
        && painted.before === range.before
        && painted.after === range.after;
    }

    function renderTable(reason) {
      const modal = document.getElementById(BATCH_MODAL);
      const body = modal?.querySelector("[data-lin-body]");
      const scroller = modal?.querySelector("[data-lin-scroll]");
      if (!body || !scroller) {
        return;
      }
      const total = state.filtered.length;
      const range = state.virtual
        ? state.virtual.update({ scrollTop: scroller.scrollTop, viewportHeight: scroller.clientHeight || VIEWPORT_HEIGHT }).range(total)
        : { start: 0, end: total, before: 0, after: 0 };
      // 可见窗口未变时保留现有输入节点，滚动不重建表格
      if (reason === "scroll" && sameWindow(range)) {
        return;
      }
      window.clearTimeout(state.batchReadingTimer);
      const focus = rememberEditing(body);
      setHtml(body, `
        <div style="height:${range.before}px"></div>
        <table class="st-lin-table">
          <tbody>${rowsHtml(range)}</tbody>
        </table>
        <div style="height:${range.after}px"></div>
      `, "library-independent-name-rows");
      painted = { start: range.start, end: range.end, before: range.before, after: range.after };
      restoreFocus(body, focus);
      refreshBatchSave();
      const msg = modal.querySelector("[data-lin-msg]");
      if (msg) {
        let rejectedText = "";
        for (const id of Object.keys(state.snapshot.syncErrors || {})) {
          const status = syncStatus(id);
          if (status.kind === "rejected") {
            rejectedText = status.text;
            break;
          }
        }
        msg.textContent = state.message || rejectedText;
        msg.hidden = !msg.textContent;
      }
    }

    function batchModalHtml() {
      return `
        <div class="st-lin-dialog">
          <header class="st-lin-head">
            <h2 id="st-lin-batch-title">${esc(i18n("steam.independentName.batchTitle", "批量设置自定义名称"))}</h2>
            <button class="st-lin-btn" type="button" data-lin-close>${esc(i18n("common.close", "关闭"))}</button>
          </header>
          <div class="st-lin-top">
            <div class="st-lin-filter-shell" data-lin-filter-shell>
              <div class="st-lin-filter-bar">
                <button class="st-lin-filter-icon-button" type="button" data-lin-filter-open aria-label="${esc(i18n("steam.independentName.filter", "筛选"))}" title="${esc(i18n("steam.independentName.filter", "筛选"))}">${iconHtml(FILTER_ICON_PATH, "st-lin-filter-icon")}</button>
                <div class="st-lin-filter-chips" data-lin-filter-chips></div>
                <button class="st-lin-btn st-lin-link st-lin-filter-add" type="button" data-lin-filter-add>${esc(i18n("steam.independentName.addFilter", "+ 添加筛选"))}</button>
                <button class="st-lin-btn st-lin-link st-lin-filter-clear" type="button" data-lin-filter-clear hidden disabled>${esc(i18n("steam.independentName.clearFilters", "清空筛选"))}</button>
              </div>
              <section class="st-lin-filter-editor" data-lin-filter-editor role="dialog" aria-modal="true" aria-label="${esc(i18n("steam.independentName.filter", "筛选"))}" hidden>
                <div class="st-lin-filter-editor-scroll" data-lin-filter-editor-scroll>
                  <div data-lin-filter-rows></div>
                  <button class="st-lin-btn st-lin-link" type="button" data-lin-filter-row-add>${esc(i18n("steam.independentName.addAndFilter", "+ 添加 AND 条件"))}</button>
                  <p class="st-lin-msg" data-lin-filter-msg role="status"></p>
                  <div class="st-lin-filter-actions">
                    <button class="st-lin-btn" type="button" data-lin-filter-cancel>${esc(i18n("common.cancel", "取消"))}</button>
                    <button class="st-lin-btn st-lin-primary" type="button" data-lin-filter-apply>${esc(i18n("steam.independentName.applyFilter", "应用"))}</button>
                  </div>
                </div>
              </section>
            </div>
            <p class="st-lin-msg st-lin-filter-stats" data-lin-stats></p>
            <div class="st-lin-toolbar">
              <button class="st-lin-btn st-lin-primary" type="button" data-lin-save-all disabled>${esc(i18n("steam.independentName.saveChanges", "保存修改"))}</button>
              <button class="st-lin-btn" type="button" data-lin-reference-many disabled>${esc(i18n("steam.independentName.fetchCommunity", "获取社区名称"))}</button>
            </div>
            <div class="st-lin-toolbar st-lin-selection-bar">
              <button class="st-lin-btn" type="button" data-lin-selection="all">${esc(i18n("steam.independentName.selectAll", "全选"))}</button>
              <button class="st-lin-btn" type="button" data-lin-selection="invert">${esc(i18n("steam.independentName.invertSelection", "反选"))}</button>
              <button class="st-lin-btn" type="button" data-lin-selection="clear">${esc(i18n("steam.independentName.clearSelection", "取消选中"))}</button>
              <span class="st-lin-msg" data-lin-selected-count></span>
              <div class="st-lin-file-tools">
                <button class="st-lin-btn" type="button" data-lin-import>${esc(i18n("steam.independentName.import", "导入"))}</button>
                <button class="st-lin-btn" type="button" data-lin-export disabled>${esc(i18n("steam.independentName.export", "导出"))}</button>
                <input data-lin-search type="search" value="${esc(state.search)}" aria-label="${esc(i18n("steam.independentName.search", "搜索名称 / AppID / 别名"))}" placeholder="${esc(i18n("steam.independentName.search", "搜索名称 / AppID / 别名"))}">
                <input data-lin-file type="file" accept="application/json" hidden>
              </div>
            </div>
            <p class="st-lin-msg" data-lin-msg role="status" hidden></p>
          </div>
          <div class="st-lin-cols">
            <table class="st-lin-table">
              <thead>
                <tr>
                  <th class="st-lin-appid">${esc(i18n("steam.independentName.colAppid", "AppID"))}</th>
                  <th class="st-lin-official">${esc(i18n("steam.independentName.colOfficial", "Steam 原名称"))}</th>
                  <th class="st-lin-custom">${esc(i18n("steam.independentName.colCustom", "自定义名称"))}</th>
                  <th class="st-lin-alias">${esc(i18n("steam.independentName.colAlias", "别名"))}</th>
                  <th class="st-lin-mnemonic">${esc(i18n("steam.independentName.colMnemonic", "助记符"))}</th>
                  <th class="st-lin-pinyin">${esc(i18n("steam.independentName.colPinyin", "拼音全拼"))}</th>
                </tr>
              </thead>
            </table>
          </div>
          <div class="st-lin-scroll" data-lin-scroll>
            <div data-lin-body></div>
          </div>
          <div class="st-lin-import" data-lin-import-dialog hidden>
            <h3>${esc(i18n("steam.independentName.importPromptTitle", "是否导入已存在自定义名称的游戏？"))}</h3>
            <p data-lin-import-msg></p>
            <div class="st-lin-import-actions">
              <button class="st-lin-btn" type="button" data-lin-import-cancel>${esc(i18n("steam.independentName.importCancel", "取消导入"))}</button>
              <button class="st-lin-btn" type="button" data-lin-import-unset>${esc(i18n("steam.independentName.importUnset", "仅未设置"))}</button>
              <button class="st-lin-btn" type="button" data-lin-import-all>${esc(i18n("steam.independentName.importAll", "全部导入"))}</button>
            </div>
          </div>
        </div>
        <section class="st-lin-alias-layer" data-lin-reference-confirm role="dialog" aria-modal="true" aria-labelledby="st-lin-reference-title" hidden>
          <div class="st-lin-reference-dialog">
            <h3 id="st-lin-reference-title">${esc(i18n("steam.independentName.replaceCommunityTitle", "替换已勾选游戏的名称？"))}</h3>
            <p data-lin-reference-confirm-msg></p>
            <div class="st-lin-filter-actions">
              <button class="st-lin-btn" type="button" data-lin-reference-cancel>${esc(i18n("common.cancel", "取消"))}</button>
              <button class="st-lin-btn st-lin-primary" type="button" data-lin-reference-accept>${esc(i18n("common.confirm", "确认"))}</button>
            </div>
          </div>
        </section>
        <section class="st-lin-alias-layer" data-lin-alias-editor role="dialog" aria-modal="true" aria-labelledby="st-lin-alias-title" hidden></section>
      `;
    }

    async function loadLibs() {
      if (libsTask) return libsTask;
      const load = (path) => new Promise((resolve, reject) => {
        if (path.endsWith("mnemonic.js") && window.SteamBuff?.libraryCustomNameMnemonic) {
          resolve();
          return;
        }
        if (path.includes("pinyin-pro") && window.pinyinPro?.pinyin) {
          resolve();
          return;
        }
        const script = document.createElement("script");
        script.src = api.path.url(path);
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(path));
        document.documentElement.appendChild(script);
      });
      // 名称编辑共用正在加载的依赖，失败后允许下一次主动打开重试
      libsTask = (async () => {
        await load(PINYIN_LIB);
        await load(MNEMONIC_CORE);
      })();
      try {
        await libsTask;
      } finally {
        libsTask = null;
      }
    }

    function fillGenerated(draft, prevName, nextName) {
      if (!nextName) {
        draft.mnemonic = "";
        draft.pinyin = "";
        draft.mnemonic_locked = false;
        draft.pinyin_locked = false;
        return;
      }
      if (prevName === nextName) {
        return;
      }
      const core = window.SteamBuff?.libraryCustomNameMnemonic;
      // 锁定表示用户改过，默认生成才套用大写助记符和音节首字母大写的拼音
      if (!draft.mnemonic_locked) {
        draft.mnemonic = core?.mnemonic?.(nextName, window.pinyinPro?.pinyin) || draft.mnemonic;
      }
      if (!draft.pinyin_locked) {
        draft.pinyin = core?.pinyinFull?.(nextName, window.pinyinPro?.pinyin) || draft.pinyin;
      }
    }

    async function loadRows() {
      if (!state.ch) {
        throw new Error(i18n("steam.independentName.channelMissing", "名称列表通道不可用"));
      }
      state.rows = [];
      state.rowsByAppid.clear();
      state.meta = { options: {}, capabilities: {} };
      let offset = 0;
      let done = false;
      while (!done) {
        const page = await new Promise((resolve, reject) => {
          const rid = `${Date.now()}-${offset}`;
          const timer = window.setTimeout(() => reject(new Error(i18n("steam.independentName.listTimeout", "名称列表读取超时"))), 15000);
          const onMsg = (event) => {
            const data = event.data;
            if (data?.script !== ID || data.type !== "list-result" || data.rid !== rid) {
              return;
            }
            window.clearTimeout(timer);
            state.ch.removeEventListener("message", onMsg);
            if (data.ok !== true) {
              reject(new Error(data.error || i18n("steam.independentName.listFailed", "名称列表读取失败")));
              return;
            }
            resolve(data);
          };
          state.ch.addEventListener("message", onMsg);
          state.ch.postMessage({ script: ID, side: "ui", type: "list", rid, offset });
        });
        state.rows.push(...(page.rows || []));
        for (const row of page.rows || []) state.rowsByAppid.set(row.appid, row);
        if (page.meta && typeof page.meta === "object") {
          state.meta = {
            ...state.meta,
            ...page.meta,
            options: { ...(state.meta?.options || {}), ...(page.meta.options || {}) },
            capabilities: { ...(state.meta?.capabilities || {}), ...(page.meta.capabilities || {}) },
          };
        }
        offset = Number(page.offset) || state.rows.length;
        done = page.done === true;
      }
    }

    async function openBatchModal() {
      css();
      let modal = document.getElementById(BATCH_MODAL);
      if (!modal) {
        modal = document.createElement("section");
        modal.id = BATCH_MODAL;
        modal.addEventListener("click", onBatchClick);
        modal.addEventListener("keydown", onBatchKey);
        modal.addEventListener("input", onBatchInput);
        modal.addEventListener("change", onBatchChange);
        modal.addEventListener("compositionend", scheduleBatchReadings);
        document.body.appendChild(modal);
      }
      state.opener = document.activeElement;
      state.aliasPending.clear();
      state.busy = true;
      painted = null;
      setHtml(modal, batchModalHtml(), "library-independent-name-batch-modal");
      renderFilterChips();
      modal.hidden = false;
      bindBatchModal(modal);
      const scroller = modal.querySelector("[data-lin-scroll]");
      scroller?.addEventListener("scroll", () => {
        state.scrollTop = scroller.scrollTop;
        renderTable("scroll");
      }, { passive: true });
      state.message = i18n("steam.independentName.loading", "正在加载...");
      renderTable();
      try {
        const [snap] = await Promise.all([request("snapshot"), loadLibs()]);
        adoptSnapshot(snap.data || state.snapshot);
        await loadRows();
        applySearch();
        state.message = "";
        state.busy = false;
        renderTable();
      } catch (error) {
        state.busy = false;
        state.message = error?.message || String(error);
        log.warn("independent-name-open-failed", "独立版名称页打开失败", { error });
        renderTable();
      }
    }

    function savedItem(appid, value = draftOf(appid)) {
      const row = state.rowsByAppid.get(appid)
        || (state.currentGame?.appid === appid ? state.currentGame : null);
      const draft = { ...value, aliases: value.aliases.slice() };
      const cloud = cloudOf(appid);
      fillGenerated(draft, cloud.custom_name, draft.custom_name);
      if (text(draft.mnemonic) && text(draft.mnemonic) !== text(cloud.mnemonic) && cloud.custom_name === draft.custom_name) {
        draft.mnemonic_locked = true;
      }
      if (text(draft.pinyin) && text(draft.pinyin) !== text(cloud.pinyin) && cloud.custom_name === draft.custom_name) {
        draft.pinyin_locked = true;
      }
      return {
        appid,
        steam_name: row?.official_name || "",
        custom_name: draft.custom_name,
        aliases: Array.isArray(draft.aliases) ? draft.aliases.slice() : [],
        mnemonic: draft.mnemonic,
        pinyin: draft.pinyin,
        mnemonic_locked: draft.mnemonic_locked === true,
        pinyin_locked: draft.pinyin_locked === true,
      };
    }

    async function saveRow(appid) {
      await loadLibs();
      const saved = savedItem(appid);
      await request("save", { item: saved });
      const snap = await request("snapshot");
      // 只清掉这次已经发出的内容，保存期间又改过的同一行草稿要留下
      const current = state.drafts.get(appid);
      if (current?.edited && sameNameDraft(current, saved)) {
        state.drafts.delete(appid);
      }
      adoptSnapshot(snap.data || state.snapshot);
      state.message = syncStatus(appid).text;
      if (state.currentGame?.appid === appid) {
        state.singleMessage = state.message;
        renderSingleModal();
      }
      log.info("independent-name-save-success", "独立版自定义名称已保存", { appid });
      renderTable();
    }

    async function saveAllDrafts() {
      if (state.batchSaving || state.referenceRun || state.busy || !state.selectedDrafts.size) return;
      const items = [];
      for (const appid of state.selected) {
        const draft = syncSelectedDraft(appid);
        if (draft) items.push(savedItem(appid, draft));
      }
      if (!items.length) return;
      state.batchSaving = true;
      refreshBatchSave();
      try {
        const result = await request("save-all", { items });
        if (!result.data?.items || typeof result.data.items !== "object" || Array.isArray(result.data.items)) {
          throw new TypeError("批量保存响应缺少名称快照");
        }
        for (const item of items) {
          const current = state.drafts.get(item.appid);
          if (current?.edited && sameNameDraft(current, item)) state.drafts.delete(item.appid);
        }
        adoptSnapshot(result.data);
        applySearch();
        state.message = i18n("steam.independentName.savedAll", "已保存 $n$ 款游戏", { n: items.length });
        log.info("independent-name-save-all-success", "独立版自定义名称批量已保存", { count: items.length });
      } catch (error) {
        state.message = error?.message || String(error);
        log.warn("independent-name-save-all-failed", "独立版自定义名称批量保存失败", { error, count: items.length });
      } finally {
        state.batchSaving = false;
        if (state.started) renderTable();
      }
    }

    // 文件里没有锁定字段时视为未锁定，不能因为助记符或拼音非空就当成用户手工锁定
    function importLock(item, key) {
      if (!item || typeof item !== "object" || !Object.prototype.hasOwnProperty.call(item, key)) {
        return false;
      }
      return item[key] === true;
    }

    function exportJson() {
      if (!state.selected.size || state.referenceRun || state.busy) return;
      try {
        const items = state.rows.filter(row => state.selected.has(row.appid)).map((row) => {
          const draft = cloudOf(row.appid);
          return {
            appid: row.appid,
            name: row.official_name,
            custom_name: draft.custom_name,
            aliases: draft.aliases,
            mnemonic: draft.mnemonic,
            pinyin: draft.pinyin,
            mnemonic_locked: draft.mnemonic_locked === true,
            pinyin_locked: draft.pinyin_locked === true,
          };
        });
        const blob = new Blob([JSON.stringify({ items }, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        try {
          const a = document.createElement("a");
          a.href = url;
          a.download = "steam-buff-independent-names.json";
          a.click();
        } finally { URL.revokeObjectURL(url); }
        log.info("independent-name-export-success", "独立版名称已导出", { count: items.length });
      } catch (error) {
        state.message = i18n("steam.independentName.exportFailed", "导出失败，请重试");
        log.error("independent-name-export-failed", "独立版名称导出失败", { error });
        renderTable();
      }
    }

    function closeReferenceConfirm() {
      const box = document.getElementById(BATCH_MODAL)?.querySelector("[data-lin-reference-confirm]");
      if (box) box.hidden = true;
      state.referencePending = null;
      state.referenceSession?.close();
      state.referenceSession = null;
    }

    function fetchSelectedCommunity(opener) {
      if (!state.selected.size || state.referenceRun || state.batchSaving || state.busy) return;
      window.clearTimeout(state.searchTimer);
      applySearch();
      if (!state.selected.size) { refreshBatchSave(); return; }
      const appids = Array.from(state.selected);
      const existing = appids.filter(appid => !!text(draftOf(appid).custom_name)).length;
      if (!existing) {
        void fetchCommunity(appids);
        return;
      }
      const box = document.getElementById(BATCH_MODAL).querySelector("[data-lin-reference-confirm]");
      state.referencePending = appids;
      box.querySelector("[data-lin-reference-confirm-msg]").textContent = i18n("steam.independentName.replaceCommunityPrompt", "已勾选 $n$ 款，其中 $existing$ 款已有自定义名称。确认后获取社区名称并替换；没有社区名称的游戏保留原内容。", { n: appids.length, existing });
      box.hidden = false;
      state.referenceSession = window.STDialogLifecycle.open({ root: box, restore: opener, initial: () => box.querySelector("[data-lin-reference-cancel]"), onEscape: closeReferenceConfirm });
      state.referenceSession.focusInitial();
    }

    // 查询结果先全部校验再填入草稿；用户在等待期间改过的行保留较新的内容
    async function fetchCommunity(appids) {
      if (state.referenceRun || !appids.length) return;
      const before = new Map(appids.map(appid => { const draft = draftOf(appid); return [appid, { ...draft, aliases: draft.aliases.slice() }]; }));
      const run = { rid: `${Date.now()}-${Math.random().toString(36).slice(2)}`, controller: new AbortController() };
      state.referenceRun = run;
      state.message = "";
      refreshBatchSave();
      log.info("independent-name-community-start", "已开始获取勾选游戏的社区名称", { count: appids.length, requestId: run.rid });
      try {
        const result = await request("reference-many", { appids, rid: run.rid }, Math.max(20000, Math.ceil(appids.length / 100) * 20000), run.controller.signal);
        if (state.referenceRun !== run || !state.started) return;
        const expected = new Set(appids);
        if (!Array.isArray(result.rows) || result.rows.length !== appids.length || result.rows.some(row => !row || !expected.delete(row.appid) || typeof row.name !== "string")) throw new TypeError("社区名称响应格式错误");
        let filled = 0;
        let missing = 0;
        let preserved = 0;
        for (let index = 0; index < result.rows.length; index += 1) {
          if (state.referenceRun !== run || !state.started) return;
          const row = result.rows[index];
          const name = text(row.name);
          if (!name) missing += 1;
          else if (!state.selected.has(row.appid) || !sameNameDraft(draftOf(row.appid), before.get(row.appid))) preserved += 1;
          else {
            const draft = ensureEdited(row.appid);
            const previous = draft.custom_name;
            draft.custom_name = name;
            fillGenerated(draft, previous, name);
            filled += 1;
          }
          if ((index + 1) % 100 === 0) await new Promise(resolve => window.setTimeout(resolve, 0));
        }
        applySearch();
        state.message = i18n("steam.independentName.communityFilled", "已填入 $filled$ 款，无社区名称 $missing$ 款，保留新修改 $preserved$ 款；请点击保存修改。", { filled, missing, preserved });
        log.info("independent-name-community-success", "社区名称已填入待保存草稿", { count: appids.length, filled, missing, preserved, requestId: run.rid });
      } catch (error) {
        if (state.referenceRun !== run || !state.started) return;
        postReq({ type: "cancel-reference", rid: run.rid });
        state.message = error?.message || i18n("steam.independentName.requestFailed", "名称请求失败");
        log.error("independent-name-community-failed", "勾选游戏的社区名称获取失败", { error, count: appids.length, requestId: run.rid });
      } finally {
        if (state.referenceRun === run) {
          state.referenceRun = null;
          if (state.started) renderTable();
        }
      }
    }

    function parseImportFile(parsed) {
      const source = Array.isArray(parsed?.items) ? parsed.items : [];
      const byId = new Map(state.rows.map((row) => [row.appid, row]));
      const matched = [];
      let existing = 0;
      let unset = 0;
      for (const item of source) {
        const appid = Number(item?.appid) || 0;
        const custom_name = text(item?.custom_name);
        if (!appid || !custom_name || !byId.has(appid)) {
          continue;
        }
        const hasMine = !!cloudOf(appid).custom_name;
        if (hasMine) {
          existing += 1;
        } else {
          unset += 1;
        }
        matched.push({
          appid,
          steam_name: byId.get(appid).official_name,
          custom_name,
          aliases: Array.isArray(item.aliases) ? item.aliases.slice(0, ALIAS_MAX) : [],
          mnemonic: text(item.mnemonic),
          pinyin: text(item.pinyin),
          mnemonic_locked: importLock(item, "mnemonic_locked"),
          pinyin_locked: importLock(item, "pinyin_locked"),
          hasMine,
        });
      }
      return {
        file: source.length,
        matched: matched.length,
        existing,
        unset,
        items: matched,
      };
    }

    function closeImportDialog() {
      const box = document.getElementById(BATCH_MODAL)?.querySelector("[data-lin-import-dialog]");
      if (box) {
        box.hidden = true;
      }
      state.pendingImport = null;
    }

    function showImportDialog(stats) {
      const box = document.getElementById(BATCH_MODAL)?.querySelector("[data-lin-import-dialog]");
      const msg = box?.querySelector("[data-lin-import-msg]");
      if (!box || !msg) {
        return;
      }
      msg.textContent = i18n(
        "steam.independentName.importPromptStats",
        "文件中名称 $file$ 项，库内匹配 $matched$ 项；其中已有自定义名称 $existing$ 项，未设置 $unset$ 项",
        stats,
      );
      box.hidden = false;
      box.querySelector("[data-lin-import-cancel]")?.focus?.();
    }

    async function importParsed(parsed, mode) {
      await loadLibs();
      const items = (parsed.items || []).filter((item) => mode !== "unset" || !item.hasMine).map((item) => {
        const next = {
          appid: item.appid,
          steam_name: item.steam_name,
          custom_name: item.custom_name,
          aliases: item.aliases,
          mnemonic: item.mnemonic,
          pinyin: item.pinyin,
          mnemonic_locked: item.mnemonic_locked === true,
          pinyin_locked: item.pinyin_locked === true,
        };
        fillGenerated(next, "", next.custom_name);
        return next;
      });
      const quota = Number(state.snapshot.quota);
      if (quota >= 0) {
        const existing = new Set(Object.keys(state.snapshot.items || {}).map(Number));
        let next = existing.size;
        for (const item of items) {
          if (item.custom_name && !existing.has(item.appid)) {
            next += 1;
          }
          if (!item.custom_name && existing.has(item.appid)) {
            next -= 1;
          }
        }
        if (next > quota) {
          throw new Error(i18n("steam.independentName.quotaExceeded", "导入后将超过自定义名称额度"));
        }
      }
      const rid = `import-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      state.importRid = rid;
      state.message = i18n("steam.independentName.importing", "正在导入 $n$ 条，关闭窗口可取消", { n: items.length });
      renderTable();
      try {
        await request("import", { items, rid });
      } finally {
        if (state.importRid === rid) {
          state.importRid = "";
        }
      }
      const snap = await request("snapshot");
      adoptSnapshot(snap.data || state.snapshot);
      state.message = i18n("steam.independentName.imported", "已导入 $n$ 条", { n: items.length });
      log.info("independent-name-import-success", "独立版名称已导入", { count: items.length, mode });
      applySearch();
      renderTable();
    }

    function addSingleAlias(appid, value) {
      const alias = text(value);
      if (!alias) {
        return;
      }
      const draft = ensureEdited(appid);
      if (draft.aliases.length >= ALIAS_MAX || draft.aliases.includes(alias)) {
        return;
      }
      draft.aliases.push(alias);
      renderSingleModal();
    }

    function closeNativeMenu(entry) {
      const root = entry?.parentElement;
      for (let fiber = reactFiber(root), depth = 0; fiber && depth < 16; fiber = fiber.return, depth += 1) {
        const close = fiber.memoizedProps?.fnOnMenuItemSelected;
        if (typeof close !== "function") {
          continue;
        }
        try {
          close();
          return;
        } catch (error) {
          log.warn("independent-name-native-menu-close-failed", "Steam 原生菜单关闭回调执行失败", { error });
          break;
        }
      }
      root?.dispatchEvent?.(new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
      }));
    }

    function addContextMenuEntry(game) {
      const appid = Number(game?.appid) || 0;
      if (!appid) {
        return false;
      }
      const popup = document.getElementById("popup_target");
      const items = popup?.querySelectorAll?.("div[role='menuitem'].contextMenuItem") || [];
      let matched = null;
      for (const item of items) {
        if (Number(api.ctx?.contextMenuOverview?.(item)?.appid) === appid) {
          matched = item;
          break;
        }
      }
      if (!matched) {
        return false;
      }
      const menu = matched.parentElement;
      if (!menu) {
        return false;
      }
      const favorite = steamFavoriteMenuItem(menu);
      if (!favorite) {
        return false;
      }
      const children = Array.from(menu.children || []);
      const favoriteIndex = children.indexOf(favorite);
      const next = favoriteIndex >= 0 ? children[favoriteIndex + 1] || null : null;
      const existing = menu.querySelector?.(`[${MENU_ENTRY_ATTR}]`);
      if (existing) {
        existing.__steamBuffIndependentNameGame = {
          appid,
          official_name: text(game?.official_name),
        };
        if (existing !== next) {
          menu.insertBefore(existing, next);
        }
        return true;
      }
      const entry = favorite.cloneNode?.(true);
      if (!entry) {
        return false;
      }
      entry.setAttribute("role", "menuitem");
      entry.setAttribute("tabindex", "-1");
      entry.setAttribute(MENU_ENTRY_ATTR, "");
      entry.classList?.add?.("st-lin-context-entry");
      entry.textContent = i18n("steam.independentName.open", "自定义名称");
      entry.__steamBuffIndependentNameGame = {
        appid,
        official_name: text(game?.official_name),
      };
      entry.addEventListener("click", () => {
        closeNativeMenu(entry);
        const current = entry.__steamBuffIndependentNameGame;
        openSingleModal(current).catch((error) => {
          log.warn("independent-name-open-failed", "独立版单游戏名称弹窗打开失败", {
            error,
            appid: Number(current?.appid) || 0,
          });
        });
      });
      menu.insertBefore(entry, next);
      return true;
    }

    function onLibraryContextMenu(event) {
      const row = api.ctx?.libraryRow?.(event.target);
      const item = api.ctx?.libraryRowItem?.(row);
      const appid = Number(item?.appid) || 0;
      const officialName = officialNameOf(item);
      if (!appid || !officialName) {
        return;
      }
      // 当前 Steam 菜单在原生 contextmenu 结束时已创建，下一帧只覆盖同一次用户操作的 React 提交
      window.requestAnimationFrame(() => {
        if (state.started !== true || window.__SteamBuffLibraryIndependentNameUi !== state) {
          return;
        }
        addContextMenuEntry({ appid, official_name: officialName });
      });
    }

    function onSingleClick(event) {
      if (!state.singleBusy && onReadingClick(event, state.singleReading)) return;
      if (event.target.closest("[data-lin-single-close], [data-lin-single-cancel]")) {
        closeSingleModal();
        return;
      }
      if (event.target.closest("[data-lin-open-batch]")) {
        closeSingleModal();
        openBatchModal().catch((error) => {
          log.warn("independent-name-open-failed", "独立版批量名称页打开失败", { error });
        });
        return;
      }
      if (event.target.closest("[data-lin-single-use-reference]") && state.currentGame && !state.singleBusy) {
        const name = state.currentGame.reference_name;
        const input = document.getElementById(MODAL)?.querySelector("[data-lin-single-name]");
        if (!name || !input) return;
        input.value = name;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus({ preventScroll: true });
        return;
      }
      const del = event.target.closest("[data-lin-single-alias-del]");
      if (del && state.currentGame) {
        const draft = ensureEdited(state.currentGame.appid);
        draft.aliases = draft.aliases.filter((item) => item !== del.dataset.linSingleAliasDel);
        renderSingleModal();
        return;
      }
      if (event.target.closest("[data-lin-single-confirm]") && state.currentGame && !state.singleBusy) {
        state.singleBusy = true;
        state.singleMessage = i18n("steam.independentName.saving", "正在保存...");
        renderSingleModal();
        const appid = state.currentGame.appid;
        saveRow(appid).then(() => {
          if (state.currentGame?.appid === appid) {
            closeSingleModal();
          }
        }).catch((error) => {
          state.singleBusy = false;
          state.singleMessage = error?.message || String(error);
          log.warn("independent-name-save-failed", "独立版自定义名称保存失败", { error, appid });
          renderSingleModal();
        });
      }
    }

    function onSingleKey(event) {
      const input = event.target.closest("[data-lin-single-alias]");
      if (!input || (event.key !== "Enter" && event.key !== " ") || !state.currentGame) {
        return;
      }
      if (event.isComposing || event.keyCode === 229) {
        return;
      }
      event.preventDefault();
      const value = input.value;
      input.value = "";
      state.aliasPending.delete(state.currentGame.appid);
      addSingleAlias(state.currentGame.appid, value);
    }

    function onSingleInput(event) {
      const appid = Number(state.currentGame?.appid) || 0;
      if (!appid || state.singleBusy) {
        return;
      }
      if (event.target.matches("[data-lin-single-alias]")) {
        if (event.target.value) state.aliasPending.set(appid, event.target.value);
        else state.aliasPending.delete(appid);
        return;
      }
      const draft = ensureEdited(appid);
      if (event.target.matches("[data-lin-single-name]")) {
        const previous = draft.custom_name;
        draft.custom_name = event.target.value;
        fillGenerated(draft, previous, draft.custom_name);
        const modal = document.getElementById(MODAL);
        const mnemonic = modal?.querySelector("[data-lin-single-mnemonic]");
        const pinyin = modal?.querySelector("[data-lin-single-pinyin]");
        if (mnemonic && mnemonic !== document.activeElement) mnemonic.value = draft.mnemonic;
        if (pinyin && pinyin !== document.activeElement) pinyin.value = draft.pinyin;
      } else if (event.target.matches("[data-lin-single-mnemonic]")) {
        draft.mnemonic = event.target.value;
        draft.mnemonic_locked = true;
      } else if (event.target.matches("[data-lin-single-pinyin]")) {
        draft.pinyin = event.target.value;
        draft.pinyin_locked = true;
      }
      if (event.isComposing) {
        window.clearTimeout(state.readingTimer);
        state.readingTimer = 0;
      } else scheduleSingleReadings(event);
    }

    function onBatchClick(event) {
      const target = event.target;
      if (state.filterDraft) {
        const editor = target.closest("[data-lin-filter-editor]");
        if (!editor || target.closest("[data-lin-filter-cancel]")) { closeFilterEditor(); return; }
        if (state.filterPicker && !state.filterPicker.contains(target) && !target.closest("[data-lin-filter-field], [data-lin-filter-values]")) closeFilterPicker(false);
        if (target.closest("[data-lin-filter-apply]")) { applyFilters(); return; }
        if (target.closest("[data-lin-filter-row-add]")) { state.filterDraft.push(newFilter()); renderFilterEditor(); return; }
        const del = target.closest("[data-lin-filter-delete]");
        if (del) { state.filterDraft.splice(Number(del.dataset.linFilterDelete), 1); renderFilterEditor(); return; }
        const row = target.closest("[data-lin-filter-row]");
        if (!row) return;
        const value = target.closest("[data-lin-filter-field-value]");
        if (value) {
          if (value.disabled) return;
          const filter = state.filterDraft[Number(row.dataset.linFilterRow)];
          filter.field = value.dataset.linFilterFieldValue;
          filter.op = filter.field === "original_language" || filter.field === "app_type" || isDiscreteField(filter.field) ? "equals" : isRangeField(filter.field) ? "between" : "notEmpty";
          filter.value = "";
          filter.values = [];
          filter.min = "";
          filter.max = "";
          filter.preset = isDateField(filter.field) ? "30m" : "";
          filter.dateStart = "";
          filter.dateEnd = "";
          renderFilterEditor();
          editor.querySelector(`[data-lin-filter-row="${row.dataset.linFilterRow}"] [data-lin-filter-field]`).focus({ preventScroll: true });
          return;
        }
        const field = target.closest("[data-lin-filter-field]");
        if (field) {
          const picker = row.querySelector("[data-lin-filter-picker]");
          toggleFilterPicker(field, picker, "button");
          return;
        }
        const values = target.closest("[data-lin-filter-values]");
        if (values) {
          const picker = row.querySelector("[data-lin-filter-option-menu]");
          toggleFilterPicker(values, picker, null);
        }
        return;
      }
      if (target.closest("[data-lin-reference-cancel]")) { closeReferenceConfirm(); return; }
      if (target.closest("[data-lin-reference-accept]")) {
        const appids = state.referencePending;
        closeReferenceConfirm();
        if (appids) void fetchCommunity(appids);
        return;
      }
      if (target.closest("[data-lin-filter-open], [data-lin-filter-add], [data-lin-filter-edit]")) {
        openFilterEditor(target.closest("button"), !!target.closest("[data-lin-filter-add]"));
        return;
      }
      const remove = target.closest("[data-lin-filter-remove]");
      if (remove && !state.referenceRun) {
        state.filters.splice(Number(remove.dataset.linFilterRemove), 1);
        applySearch(); renderFilterChips(); renderTable(); return;
      }
      if (target.closest("[data-lin-filter-clear]") && !state.referenceRun) {
        state.filters = []; applySearch(); renderFilterChips(); renderTable(); return;
      }
      const selection = target.closest("[data-lin-selection]");
      if (selection) { changeSelection(selection.dataset.linSelection); return; }
      const community = target.closest("[data-lin-reference-many]");
      if (community) { fetchSelectedCommunity(community); return; }
      const panel = event.target.closest("[data-lin-batch-readings]");
      if (panel) {
        const appid = Number(panel.closest("tr")?.dataset.appid) || 0;
        const control = state.batchReadings.get(appid);
        if (control) control.root = panel;
        if (onReadingClick(event, control)) return;
      }
      if (onAliasClick(event)) return;
      const alias = event.target.closest("[data-lin-alias-edit]");
      if (alias) {
        openAliasEditor(Number(alias.dataset.linAliasEdit), alias);
        return;
      }
      if (event.target.closest("[data-lin-close]")) {
        closeBatchModal();
        return;
      }
      if (event.target.closest("[data-lin-import-cancel]")) {
        closeImportDialog();
        return;
      }
      if (event.target.closest("[data-lin-import-unset]") || event.target.closest("[data-lin-import-all]")) {
        const mode = event.target.closest("[data-lin-import-all]") ? "all" : "unset";
        const pending = state.pendingImport;
        closeImportDialog();
        if (!pending) {
          return;
        }
        importParsed(pending, mode).catch((error) => {
          state.message = error?.message || String(error);
          log.warn("independent-name-import-failed", "独立版名称导入失败", { error });
          renderTable();
        });
        return;
      }
      const save = event.target.closest("[data-lin-save-all]");
      if (save) {
        void saveAllDrafts();
        return;
      }
      if (event.target.closest("[data-lin-export]")) {
        exportJson();
        return;
      }
      if (event.target.closest("[data-lin-import]")) {
        document.getElementById(BATCH_MODAL)?.querySelector("[data-lin-file]")?.click();
      }
    }

    function onBatchKey(event) {
      if (event.key === "Escape" && state.filterPicker && event.target.closest?.("[data-lin-filter-option-search]")) {
        event.preventDefault();
        closeFilterPicker();
        return;
      }
      const input = event.target.closest("[data-lin-alias-editor-input]");
      if (!input || (event.key !== "Enter" && event.key !== " ")) {
        return;
      }
      if (event.isComposing || event.keyCode === 229) {
        return;
      }
      event.preventDefault();
      commitAliasInput();
    }

    function onBatchInput(event) {
      if (event.target.matches?.("[data-lin-select]")) return;
      if (event.target.matches?.("[data-lin-filter-option-search]")) {
        const query = text(event.target.value).toLocaleLowerCase();
        const menu = event.target.closest("[data-lin-filter-option-menu]")
          || event.target.closest("[data-lin-filter-row]")?.querySelector("[data-lin-filter-option-menu]");
        for (const option of menu?.querySelectorAll("[data-lin-filter-option]") || []) {
          option.closest("label").hidden = !!query && !text(option.dataset.linFilterSearchText).includes(query);
        }
        return;
      }
      if (event.target.matches?.("[data-lin-filter-value]") && state.filterDraft) {
        const index = Number(event.target.closest("[data-lin-filter-row]").dataset.linFilterRow);
        state.filterDraft[index].value = event.target.value;
        return;
      }
      if (event.target.matches?.("[data-lin-filter-min], [data-lin-filter-max]") && state.filterDraft) {
        const index = Number(event.target.closest("[data-lin-filter-row]").dataset.linFilterRow);
        const filter = state.filterDraft[index];
        if (event.target.matches("[data-lin-filter-min]")) filter.min = event.target.value;
        else filter.max = event.target.value;
        return;
      }
      if (event.target.matches?.("[data-lin-filter-date-start], [data-lin-filter-date-end]") && state.filterDraft) {
        const index = Number(event.target.closest("[data-lin-filter-row]").dataset.linFilterRow);
        const filter = state.filterDraft[index];
        if (event.target.matches("[data-lin-filter-date-start]")) filter.dateStart = event.target.value;
        else filter.dateEnd = event.target.value;
        return;
      }
      if (event.target.matches?.("[data-lin-alias-editor-input]") && state.aliasEditor) {
        state.aliasEditor.input = event.target.value;
        const editor = event.target.closest("[data-lin-alias-editor]");
        const hasValue = !!text(event.target.value);
        editor.querySelector("[data-lin-alias-commit]").disabled = !hasValue;
        editor.querySelector("[data-lin-alias-confirm]").disabled = state.aliasEditor.editing >= 0 && !hasValue;
        return;
      }
      const search = event.target.closest("[data-lin-search]");
      if (search) {
        if (state.referenceRun || state.busy) return;
        state.search = search.value;
        window.clearTimeout(state.searchTimer);
        state.searchTimer = window.setTimeout(() => {
          applySearch();
          renderTable();
        }, SEARCH_MS);
        return;
      }
      const tr = event.target.closest("tr[data-appid]");
      const appid = Number(tr?.dataset.appid) || 0;
      if (!appid) {
        return;
      }
      const draft = ensureEdited(appid);
      if (event.target.classList.contains("st-lin-name")) {
        const previous = draft.custom_name;
        draft.custom_name = event.target.value;
        fillGenerated(draft, previous, draft.custom_name);
        const mnemonic = tr.querySelector("input.st-lin-mnemonic");
        const pinyin = tr.querySelector("input.st-lin-pinyin");
        if (mnemonic) mnemonic.value = draft.mnemonic;
        if (pinyin) pinyin.value = draft.pinyin;
      } else if (event.target.classList.contains("st-lin-mnemonic")) {
        draft.mnemonic = event.target.value;
        draft.mnemonic_locked = true;
      } else if (event.target.classList.contains("st-lin-pinyin")) {
        draft.pinyin = event.target.value;
        draft.pinyin_locked = true;
      }
      refreshBatchSave();
      scheduleBatchReadings(event);
    }

    function onBatchChange(event) {
      const selection = event.target.closest("[data-lin-select]");
      if (selection) {
        if (state.referenceRun || state.busy) return;
        const appid = Number(selection.dataset.linSelect);
        if (selection.checked) state.selected.add(appid);
        else state.selected.delete(appid);
        syncSelectedDraft(appid);
        refreshBatchSave();
        return;
      }
      const filterRow = event.target.closest("[data-lin-filter-row]");
      if (filterRow && state.filterDraft) {
        const filter = state.filterDraft[Number(filterRow.dataset.linFilterRow)];
        if (event.target.matches("[data-lin-filter-op]")) {
          filter.op = event.target.value;
          const index = filterRow.dataset.linFilterRow;
          renderFilterEditor();
          document.getElementById(BATCH_MODAL).querySelector(`[data-lin-filter-row="${index}"] [data-lin-filter-op]`).focus({ preventScroll: true });
        } else if (event.target.matches("[data-lin-filter-date-preset]")) {
          filter.preset = event.target.value;
          renderFilterEditor();
          document.getElementById(BATCH_MODAL).querySelector(`[data-lin-filter-row="${filterRow.dataset.linFilterRow}"] [data-lin-filter-date-preset]`)?.focus({ preventScroll: true });
        } else if (event.target.matches("[data-lin-filter-option], [data-lin-filter-type]")) {
          const type = event.target.dataset.linFilterOption || event.target.dataset.linFilterType;
          filter.values = filter.values.filter(value => value !== type);
          if (event.target.checked) filter.values.push(type);
          const input = filterRow.querySelector("[data-lin-filter-values]");
          const display = filterValueDisplay(filter.field, filter.values);
          if (input) {
            input.value = display.text;
            input.title = display.title;
            input.setAttribute("aria-label", `${i18n("steam.independentName.filterValue", "筛选值")}: ${display.title}`);
          }
        }
        return;
      }
      const file = event.target.closest("[data-lin-file]");
      if (!file?.files?.[0]) {
        return;
      }
      const selected = file.files[0];
      file.value = "";
      selected.text().then((textValue) => {
        const parsed = parseImportFile(JSON.parse(textValue));
        state.pendingImport = parsed;
        showImportDialog(parsed);
      }).catch((error) => {
        state.message = error?.message || String(error);
        log.warn("independent-name-import-failed", "独立版名称导入失败", { error });
        renderTable();
      });
    }

    function onVisibility() {
      // modal 不存在时 hidden 是 undefined，不能把它当成窗口仍打开
      if (state.started !== true || window.__SteamBuffLibraryIndependentNameUi !== state || document.hidden) {
        return;
      }
      const modal = document.getElementById(BATCH_MODAL);
      if (!modal || modal.hidden !== false) {
        return;
      }
      request("snapshot").then((snap) => {
        if (state.started !== true || window.__SteamBuffLibraryIndependentNameUi !== state) {
          return;
        }
        adoptSnapshot(snap.data || state.snapshot);
        // 新快照到达后丢掉上一次操作提示，横幅改看当前拒绝或额度
        state.message = "";
        renderTable();
      }).catch(() => {});
    }

    css();
    scope?.listener?.("library-context-menu", document, "contextmenu", onLibraryContextMenu, true);
    if (!scope?.listener) {
      document.addEventListener("contextmenu", onLibraryContextMenu, true);
    }
    document.addEventListener("visibilitychange", onVisibility);

    const stop = () => {
      state.started = false;
      closeSingleModal();
      closeBatchModal();
      if (!scope?.listener) {
        document.removeEventListener("contextmenu", onLibraryContextMenu, true);
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(state.searchTimer);
      window.clearTimeout(state.readingTimer);
      window.clearTimeout(state.batchReadingTimer);
      state.ch?.close?.();
      document.getElementById(MODAL)?.remove();
      document.getElementById(BATCH_MODAL)?.remove();
      if (window.__SteamBuffLibraryIndependentNameUi === state) {
        delete window.__SteamBuffLibraryIndependentNameUi;
      }
    };
    state.stop = stop;
    window.__SteamBuffLibraryIndependentNameUi = state;
    return { started: true, stop };
  }

  window.SteamBuff.reg.addEntry(ID, "ui.js", start);
})();
