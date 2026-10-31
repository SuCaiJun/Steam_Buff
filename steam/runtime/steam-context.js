/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 客户端主上下文桥接
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.SteamBuff = window.SteamBuff || {};
  const PROPERTY_PANEL_SELECTOR = "[role='tabpanel'][id*='/app/'][id*='/properties/']";
  const LIBRARY_GRID_SELECTOR = "div[role='grid'].ReactVirtualized__List";
  const LIBRARY_CONTAINER_SELECTOR = ".ReactVirtualized__Grid__innerScrollContainer";
  const LIBRARY_ROW_SELECTOR = "[draggable='true']";
  const log = window.STLoggerFactory.createLogger("steam", "steam-context");
  let namesRaw = null;
  let namesSnapshot = {};
  const nameRecoveries = new Map();

  /* Steam 客户端上下文识别 */
  function isShared() {
    return document.title === "SharedJSContext";
  }

  // SharedJSContext 没有普通 UI DOM，但能访问 Steam 后台对象；UI 上下文负责页面按钮和展示。
  function isUi() {
    return !isShared() && typeof document !== "undefined" && !!document.body;
  }

  function isMainUi() {
    if (!isUi()) {
      return false;
    }
    if (document.title === "Steam") {
      return true;
    }
    try {
      return new URL(window.location.href).searchParams.get("browserType") === "4";
    } catch {
      return false;
    }
  }

  function isSteamLoopback() {
    try {
      return new URL(window.location.href).hostname === "steamloopback.host";
    } catch {
      return false;
    }
  }

  function hasPropertyPanel() {
    try {
      return !!document.querySelector(PROPERTY_PANEL_SELECTOR);
    } catch {
      return false;
    }
  }

  function isPropertyDialogShell() {
    if (!isUi() || isMainUi() || !isSteamLoopback()) {
      return false;
    }
    return document.body?.classList?.contains("ModalDialogBody") === true && hasPropertyPanel();
  }

  function isPropertyDialog() {
    if (!isUi() || isMainUi()) {
      return false;
    }
    const value = String(window.location?.href || "");
    if (value.startsWith("about:blank") &&
      /(?:[?&])createflags=/u.test(value) &&
      /(?:[?&])centerOnBrowserID=/u.test(value) &&
      !/(?:[?&])browserType=/u.test(value)) {
      return true;
    }
    // 优化:属性窗口落地到 steamloopback 后会丢失 about:blank 参数，用属性页 tabpanel 续判。
    return isPropertyDialogShell();
  }

  function cleanRoute(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return "";
    }
    const tries = [raw];
    try {
      const decoded = decodeURIComponent(raw);
      if (decoded && decoded !== raw) {
        tries.push(decoded);
      }
    } catch {
    }
    for (const item of tries) {
      const text = item.replace(/\\/g, "/");
      const appMatch = text.match(/\/library\/app\/(\d+)(?=$|[/?#&:,\s"'<>)])/i);
      if (appMatch) {
        return `/library/app/${appMatch[1]}`;
      }
      const match = text.match(/\/library\/(home|collections|downloads)(?=$|[/?#&:,\s"'<>)])/i);
      if (match) {
        return `/library/${match[1].toLowerCase()}`;
      }
    }
    return "";
  }

  function browserManager() {
    return window.MainWindowBrowserManager || null;
  }

  function routeSources() {
    const mgr = browserManager();
    return {
      tempNav: window.tempNavStore?.m_locationPathname || "",
      mainWindowUrlRequested: mgr?.m_URLRequested || "",
      mainWindowUrl: mgr?.m_URL || "",
      href: window.location?.href || "",
    };
  }

  // Steam 内部路由不总反映在 location 上，下载页在部分客户端只写入 MainWindowBrowserManager 的 data URL。
  function route() {
    const sources = routeSources();
    const local = cleanRoute(sources.tempNav) ||
      cleanRoute(sources.mainWindowUrlRequested) ||
      cleanRoute(sources.mainWindowUrl) ||
      cleanRoute(sources.href) ||
      "";
    if (local || isShared()) {
      return local;
    }
    return api.contextRouter?.route?.() || "";
  }

  function isDown() {
    return route() === "/library/downloads";
  }

  function targets() {
    const current = route();
    switch (current) {
      case "/library/home":
        return ["home"];
      case "/library/collections":
        return ["collections"];
      case "/library/downloads":
        return ["downloads"];
      default:
        if (/^\/library\/app\/\d+$/.test(current)) {
          return ["app"];
        }
        return [];
    }
  }

  function contexts() {
    const out = [];
    if (isShared()) {
      out.push("backend");
    }
    if (isMainUi() || isPropertyDialog()) {
      out.push("ui");
    }
    if (isMainUi()) {
      out.push("downloads");
    }
    return out;
  }

  // appStore 只在客户端主上下文存在，库排序和自定义名都依赖这里的 AppOverview 数据。
  function apps() {
    const store = window.appStore;
    if (!store?.m_mapApps || typeof store.m_mapApps.values !== "function") {
      return null;
    }
    return Array.from(store.m_mapApps.values()).filter(Boolean);
  }

  // 内容脚本把开关写到 dataset，主上下文脚本只能通过这个快照读取设置。
  function settings() {
    const raw = document.documentElement?.dataset?.steamBuffSettings || "{}";
    try {
      const next = JSON.parse(raw) || {};
      window.STPageContext?.setSettingsSnapshot?.(next);
      return next;
    } catch {
      window.STPageContext?.setSettingsSnapshot?.({});
      return {};
    }
  }

  function settingOn(id) {
    return settings()[id] !== false;
  }

  function settingValue(id, fallback) {
    const snapshot = settings();
    return Object.prototype.hasOwnProperty.call(snapshot, id) ? snapshot[id] : fallback;
  }

  function independentNamesOn() {
    return window.STConfig.effectiveLibraryNameMode(settings())
      === window.STConfig.libraryNameMode.values.INDEPENDENT;
  }

  function reactFiber(node) {
    const keys = Object.keys(node || {}).filter((key) => key.startsWith("__reactFiber"));
    return keys.length === 1 ? node[keys[0]] : null;
  }

  // 仅在两个已知分支参数不同时检查当前 HostRoot，不遍历组件子树
  function activeFiber(fiber) {
    for (let depth = 0; fiber && depth < 512; depth += 1, fiber = fiber.return) {
      if (!fiber.return) return fiber.tag === 3 && fiber.stateNode?.current === fiber;
    }
    return false;
  }

  /**
   * 从已确认的成就面板读取所属页面组件的 AppID；失败、已分离的旧节点或分支归属不明返回 0
   * 只读当前面板的有限 Fiber 父链，不读取封面、全局选中游戏或其他组件树
   */
  function achievementAppId(panel) {
    if (!panel?.isConnected) return 0;
    const id = (props) => props && Object.hasOwn(props, "appid") &&
      Object.hasOwn(props, "bShowGameInfoInHeader") && typeof props.bShowGameInfoInHeader === "boolean" &&
      Number.isSafeInteger(props.appid) && props.appid > 0 ? props.appid : 0;
    for (let fiber = reactFiber(panel), depth = 0; fiber && depth < 8; depth += 1, fiber = fiber.return) {
      const props = fiber.memoizedProps;
      if (!props || !Object.hasOwn(props, "bShowGameInfoInHeader") || !Object.hasOwn(props, "appid")) continue;
      const first = id(props), other = fiber.alternate;
      if (!other) return first;
      const second = id(other.memoizedProps);
      if (first === second) return first;
      const current = [fiber, other].filter(activeFiber);
      return current.length === 1 ? id(current[0].memoizedProps) : 0;
    }
    return 0;
  }

  /**
   * 读取库页实际成就卡片的有限父链；活动使用 strID，右栏 schema 使用 api_name
   * 两种已取证结构由调用方明确指定；归属或原文不可读返回 null，不使用文字、图片或路由猜测 ID
   */
  function achievementDisplayItem(node, kind) {
    if (!node?.isConnected) return null;
    if (kind !== "activity" && kind !== "summary") throw new TypeError("原生成就卡片类型无效");
    function item(props) {
      if (!Number.isSafeInteger(props?.appid) || props.appid <= 0 || !props.achievement) return null;
      const raw = props.achievement;
      const id = kind === "activity" ? raw.strID : raw.api_name;
      const title = kind === "activity" ? raw.strName : raw.name;
      const description = kind === "activity" ? raw.strDescription : raw.description;
      if (typeof id !== "string" || !id || typeof title !== "string" || typeof description !== "string") return null;
      return { appId: props.appid, id, title, description };
    }
    for (let fiber = reactFiber(node), depth = 0; fiber && depth < 8; depth += 1, fiber = fiber.return) {
      const props = fiber.memoizedProps;
      if (!props || !Object.hasOwn(props, "appid") || !Object.hasOwn(props, "achievement")) continue;
      const first = item(props), other = fiber.alternate;
      if (!other) return first;
      const second = item(other.memoizedProps);
      if (first && second && first.appId === second.appId && first.id === second.id && first.title === second.title && first.description === second.description) return first;
      const current = [fiber, other].filter(activeFiber);
      return current.length === 1 ? item(current[0].memoizedProps) : null;
    }
    return null;
  }

  /** 从单条原生通知容器的有限父链读取通知对象；其他类型只返回 type，不解析未知 payload */
  function achievementNotificationItem(node) {
    if (!node?.isConnected) return null;
    for (let fiber = reactFiber(node), depth = 0; fiber && depth < 8; depth += 1, fiber = fiber.return) {
      if (!fiber.memoizedProps || !Object.hasOwn(fiber.memoizedProps, "notification")) continue;
      let current = fiber;
      if (fiber.alternate && fiber.memoizedProps.notification !== fiber.alternate.memoizedProps?.notification) {
        const branches = [fiber, fiber.alternate].filter(activeFiber);
        if (branches.length !== 1) return null;
        current = branches[0];
      }
      const event = current.memoizedProps?.notification;
      if (!event || typeof event.eType !== "number") return null;
      if (event.eType !== 5) return { type: event.eType };
      const data = event.data;
      if (!Object.hasOwn(event, "notificationID") || typeof data?.appid !== "function" || typeof data.achievement_id !== "function" ||
        typeof data.name !== "function" || typeof data.description !== "function") return null;
      return { type: event.eType, notificationID: event.notificationID, appId: data.appid(), id: data.achievement_id(), title: data.name(), description: data.description() };
    }
    return null;
  }

  /**
   * 只读新版成就列表所属组件的 React Query schema；按 AppID 校验缓存，不发请求或遍历组件子树。
   * 列表父链与组件依赖来自原生 AchievementsList / useQuery，未就绪时返回 null，由调用方提示刷新。
   */
  function achievementSchema(list, appId) {
    if (!list?.isConnected || !Number.isSafeInteger(appId) || appId <= 0) return null;
    for (let fiber = reactFiber(list), depth = 0; fiber && depth < 8; depth += 1, fiber = fiber.return) {
      const props = fiber.memoizedProps;
      if (!props || !Object.hasOwn(props, "typeFilter") || !Object.hasOwn(props, "compareTo")) continue;
      const first = fiber.dependencies?.firstContext;
      // Steam 的上下文值可来自另一 JavaScript realm，不能用当前窗口的 instanceof Set 判定。
      if (first?.memoizedValue?.appid !== appId || typeof first.memoizedValue.revealedAchievements?.has !== "function" || typeof first.memoizedValue.setRevealedAchievements !== "function") return null;
      for (let dependency = first, count = 0; dependency && count < 8; count += 1, dependency = dependency.next) {
        const client = dependency.memoizedValue;
        if (typeof client?.getQueryData === "function") {
          const schema = client.getQueryData(["achievements", appId, "schema"]);
          return schema?.appid === appId ? schema : null;
        }
      }
      return null;
    }
    return null;
  }

  /** 从当前原生分组标题所属组件读取稳定组 ID 与原名；不解析标题译文或遍历组件子树。 */
  function achievementGroup(node) {
    if (!node?.isConnected) return null;
    for (let fiber = reactFiber(node), depth = 0; fiber && depth < 8; depth += 1, fiber = fiber.return) {
      const props = fiber.memoizedProps, group = props?.group;
      if (props && Object.hasOwn(props, "groupSummary") && Number.isSafeInteger(group?.id) && group.id >= 0 && typeof group.name === "string") return { id: group.id, name: group.name };
    }
    return null;
  }

  // 仅沿已取证的 ReactVirtualized 库行 Fiber 链读取 item，不扫描其他 React 节点
  function libraryRowItem(row) {
    let fiber = reactFiber(row);
    for (let depth = 0; fiber && depth < 12; depth += 1, fiber = fiber.return) {
      const item = fiber.memoizedProps?.item;
      if (item && Number(item.appid) > 0) {
        return item;
      }
    }
    return null;
  }

  // 右键入口只接受精确库列表容器中的真实游戏行
  function libraryRow(target) {
    const row = target?.closest?.(LIBRARY_ROW_SELECTOR);
    // Steam 当前列表行由 Focusable/gridcell 包裹，容器不是游戏行的直接父节点。
    const container = row?.closest?.(LIBRARY_CONTAINER_SELECTOR);
    const grid = container?.closest?.(LIBRARY_GRID_SELECTOR);
    if (!row || !grid || !container?.matches?.(LIBRARY_CONTAINER_SELECTOR)) {
      return null;
    }
    return libraryRowItem(row) ? row : null;
  }

  // 返回所属文档的只读名称快照；输入改变才解析，损坏输入清空旧结果并记录一次错误。
  function userNames() {
    const raw = document.documentElement?.dataset?.steamBuffUserNames || "{}";
    if (raw === namesRaw) return namesSnapshot;
    namesRaw = raw;
    namesSnapshot = {};
    try {
      const next = JSON.parse(raw) || {};
      if (typeof next !== "object") throw new TypeError("显示名称快照必须是对象");
      namesSnapshot = next;
    } catch (error) {
      log.error("user-names-snapshot-invalid", "Steam 显示名称快照读取失败", { error });
    }
    return namesSnapshot;
  }

  /**
   * 名称只读请求超时后，通过现有 content 属性桥接定向恢复后台
   * 同一功能的并发恢复共用任务；完成、超时或页面离开后释放监听
   * @param {"library-sort-title"|"library-custom-name"} featureId 名称功能 ID
   * @param {number[]} appids 当前显示快照批次内的正整数 AppID，管理请求传空数组
   * @param {AbortSignal} [signal] 可选的界面生命周期取消信号，不改变后台保存任务
   * @returns {Promise<{ready: boolean, pendingCount?: number}>} 就绪回执；失败或页面离开时拒绝
   */
  function recoverNameBackend(featureId, appids = [], signal) {
    if (!["library-sort-title", "library-custom-name"].includes(featureId)
      || (!isMainUi() && !isPropertyDialog())) {
      return Promise.reject(new Error("当前页面不能恢复库名称后台"));
    }
    if (!Array.isArray(appids) || appids.some(id => !Number.isInteger(id) || id <= 0)) {
      return Promise.reject(new TypeError("名称恢复 AppID 列表无效"));
    }
    if (signal !== undefined && !(signal instanceof window.AbortSignal)) {
      return Promise.reject(new TypeError("名称恢复取消信号无效"));
    }
    if (signal?.aborted) return Promise.reject(new Error("名称后台接入已取消"));
    if (nameRecoveries.has(featureId)) return nameRecoveries.get(featureId);
    const rid = `name-recovery-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const requestAttr = "data-steam-buff-name-request";
    const responseAttr = "data-steam-buff-name-response";
    const element = document.documentElement;
    const ids = Array.from(new Set(appids)).slice(0, 200);
    let flight;
    flight = new Promise((resolve, reject) => {
      let timer;
      let settled = false;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        observer.disconnect();
        window.removeEventListener("pagehide", onLeave);
        signal?.removeEventListener("abort", onAbort);
        if (flight && nameRecoveries.get(featureId) === flight) nameRecoveries.delete(featureId);
        if (error) reject(error);
        else resolve(result);
      };
      const onLeave = () => finish(new Error("页面已离开，名称后台恢复已取消"));
      const onAbort = () => finish(new Error("名称后台接入已取消"));
      const observer = new MutationObserver(() => {
        try {
          const data = JSON.parse(element.getAttribute(responseAttr) || "null");
          if (data?.script !== "library-custom-name" || data.side !== "content"
            || data.type !== "recover-backend-result" || data.rid !== rid) return;
          if (data.ok !== true || data.data?.ready !== true) throw new Error(data.error || "库名称后台恢复失败");
          finish(null, data.data);
        } catch (error) {
          finish(error);
        }
      });
      observer.observe(element, { attributes: true, attributeFilter: [responseAttr] });
      window.addEventListener("pagehide", onLeave, { once: true });
      signal?.addEventListener("abort", onAbort, { once: true });
      timer = window.setTimeout(() => finish(new Error("库名称后台恢复没有响应")), 8000);
      try {
        element.setAttribute(requestAttr, JSON.stringify({
          script: "library-custom-name", side: "page", type: "recover-backend", rid, featureId, appids: ids,
        }));
      } catch (error) {
        finish(error);
      }
    }).finally(() => {
      if (nameRecoveries.get(featureId) === flight) nameRecoveries.delete(featureId);
    });
    nameRecoveries.set(featureId, flight);
    return flight;
  }

  api.ctx = {
    isShared,
    isUi,
    isMainUi,
    isPropertyDialog,
    normalizeRoute: cleanRoute,
    route,
    routeSources,
    isDown,
    targets,
    contexts,
    apps,
    libraryRow,
    libraryRowItem,
    achievementAppId,
    achievementDisplayItem,
    achievementNotificationItem,
    achievementSchema,
    achievementGroup,
    settings,
    settingOn,
    settingValue,
    independentNamesOn,
    userNames,
    recoverNameBackend,
  };
})();
