/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 好友窗口共用挂载与游戏自定义名称显示
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

(() => {
  "use strict";

  const api = window.SteamBuff;
  const NAME_ID = "friends-list-custom-name";
  const entry = "steam/features/friends-list/ui.js";
  const registerFeature = () => api.reg.addEntry(NAME_ID, entry, () => api.friendsList.startNames());
  if (api.friendsList) {
    registerFeature();
    return;
  }

  const log = window.STLoggerFactory.createLogger("steam", "friends-list");
  const SURFACE_WAIT_MS = 3000;
  const PLAYER = ".friend";
  const PLAYING = ".friend.ingame";
  const GAME_GROUP = ".friendGroup.gameGroup";
  const SUFFIX = "st-friend-game-custom-name";
  const EMPTY_NAMES = Object.freeze({});
  const entries = new Map();
  const windows = new Map();
  let subscription = null;
  let nextHostId = 0;

  function listTarget(doc) {
    const root = doc.getElementById("popup_target");
    if (!root?.classList.contains("popup_chat_frame")) return null;
    const header = root.querySelector(".friendListHeaderContainer.titleBarContainer");
    const panel = header?.nextElementSibling;
    if (!panel?.matches(".FriendsListContent")) return null;
    const list = panel.querySelector(":scope > .friendlistListContainer");
    const content = list?.querySelector(":scope > .listContentContainer");
    return content ? { doc, panel, list, content } : null;
  }

  function inspect(popup, opener) {
    const id = popup.GetName();
    if (!/^friendslist_uid\d+$/.test(id)) return;
    const win = popup.window;
    if (!win || win.closed || windows.has(win)
      || win.opener !== opener || win.location.origin !== window.location.origin) return;

    const doc = win.document;
    const host = window.STSurfaceManager.createHost({ id: "friends-list-" + ++nextHostId });
    const mounted = new Map();
    let target = null, observing = null, pending = null, expired = false;

    function unmount(id) {
      const mountedEntry = mounted.get(id);
      mounted.delete(id);
      mountedEntry?.stop();
    }

    function stopObserving() {
      host.disconnectObserver();
      observing = null;
      if (pending !== null) win.clearTimeout(pending);
      pending = null;
    }

    function detach() {
      windows.delete(win);
      win.removeEventListener("DOMContentLoaded", ready);
      win.removeEventListener("pagehide", detach);
      doc.removeEventListener("visibilitychange", visibility);
      stopObserving();
      for (const id of mounted.keys()) unmount(id);
      host.stop();
    }

    function waitForRoot() {
      const root = doc.getElementById("popup_target");
      if (!root || doc.hidden || expired || observing === root) return;
      stopObserving();
      observing = root;
      host.observe(root, ready, { attributes: true, attributeFilter: ["class"], childList: true });
      pending = win.setTimeout(() => {
        stopObserving();
        expired = true;
        log.warn("friends-list-target-unavailable", "好友列表挂载位置不可用", { phase: "friends-root" });
      }, SURFACE_WAIT_MS);
    }

    function reconcile() {
      const next = listTarget(doc);
      if (next?.content !== target?.content || next?.list !== target?.list || next?.panel !== target?.panel) {
        for (const id of mounted.keys()) unmount(id);
        target = next;
        stopObserving();
        host.setContext(target, !!target);
      }
      if (!target) return waitForRoot();

      for (const [id, mount] of entries) {
        if (mounted.has(id) || (id === NAME_ID && doc.hidden)) continue;
        try {
          mounted.set(id, mount(target));
        } catch (error) {
          mounted.set(id, null);
          log.error("friends-list-entry-mount-failed", "好友列表功能挂载失败", { featureId: id, error });
        }
      }
      if (!mounted.get(NAME_ID)) {
        stopObserving();
        return;
      }
      if (observing === target.panel) return;

      // 原生滚动列表的子容器会重绘。共用观察器从启动根切到列表区域
      stopObserving();
      observing = target.panel;
      host.observe(target.panel, records => {
        if (!target.list.isConnected || target.content.parentElement !== target.list) return ready();
        updateNames(names => names.changed(records));
      }, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "src"] });
    }

    function updateNames(update) {
      const names = mounted.get(NAME_ID);
      if (!names) return;
      try {
        update(names);
      } catch (error) {
        stopObserving();
        unmount(NAME_ID);
        mounted.set(NAME_ID, null);
        log.error("friends-list-name-update-failed", "好友游戏名称更新失败", { error });
      }
    }

    function ready() {
      try {
        reconcile();
      } catch (error) {
        detach();
        log.error("friends-list-mount-failed", "好友列表挂载失败", { error });
      }
    }

    function visibility() {
      if (doc.hidden) {
        stopObserving();
        unmount(NAME_ID);
        return;
      }
      expired = false;
      ready();
    }

    windows.set(win, {
      reconcile: ready, detach,
      remove(id) { unmount(id); ready(); },
      refreshNames() { updateNames(names => names.refresh()); },
    });
    win.addEventListener("pagehide", detach, { once: true });
    doc.addEventListener("visibilitychange", visibility);
    if (doc.getElementById("popup_target")) ready();
    else win.addEventListener("DOMContentLoaded", ready, { once: true });
  }

  /**
   * 为已识别的好友列表登记渲染入口，挂载回调返回只清理该入口的 stop
   * @returns {() => void} 注销当前功能并释放其挂载
   */
  function register(id, mount) {
    if (entries.has(id)) throw new Error("好友列表功能重复挂载：" + id);
    entries.set(id, mount);
    function stop() {
      if (entries.get(id) !== mount) return;
      entries.delete(id);
      if (entries.size) {
        for (const windowEntry of windows.values()) windowEntry.remove(id);
        return;
      }
      subscription?.Unregister();
      subscription = null;
      for (const windowEntry of windows.values()) windowEntry.detach();
    }
    try {
      if (!subscription) {
        const opener = window.opener;
        const manager = opener?.g_PopupManager;
        if (typeof manager?.GetPopups !== "function" || typeof manager.AddPopupCreatedCallback !== "function") {
          throw new Error("Steam 好友窗口管理器不可用");
        }
        subscription = manager.AddPopupCreatedCallback(popup => {
          try { inspect(popup, opener); }
          catch (error) { log.error("friends-list-window-failed", "无法识别 Steam 好友窗口", { error }); }
        });
        for (const popup of manager.GetPopups()) inspect(popup, opener);
      } else {
        for (const windowEntry of windows.values()) windowEntry.reconcile();
      }
    } catch (error) {
      stop();
      throw error;
    }
    return stop;
  }

  function gameTitle(row) {
    const label = row.querySelector(":scope > .labelHolder");
    if (label?.childElementCount !== 2) return null;
    // 原生 PersonaNameAndStatus 的第二块把游戏标题与游戏内状态放在固定的两个 React 子节点槽位
    const fiberKey = Object.keys(label).find(key => key.startsWith("__reactFiber$"));
    const component = label[fiberKey]?.return;
    const props = component?.memoizedProps;
    const persona = props?.persona;
    if (!persona?.is_ingame || persona.is_in_nonsteam_game || props.bHasGamePrivacy
      || component.alternate?.memoizedProps?.bHasGamePrivacy) return null;
    const block = label.children[1];
    const propsKey = Object.keys(block).find(key => key.startsWith("__reactProps$"));
    const children = block[propsKey]?.children;
    if (!Array.isArray(children) || children[0]?.type !== "div") return null;
    const title = block.firstElementChild;
    const original = title?.firstChild?.nodeType === 3 ? title.firstChild.data : "";
    const appid = persona.m_unGamePlayedAppID;
    return original && Number.isSafeInteger(appid) && appid > 0 && original === persona.GetCurrentGameName()
      ? { title, original, appid } : null;
  }

  function mountNames({ doc, content }) {
    const labels = new Map();
    const rows = new Set();
    let names = EMPTY_NAMES;

    function readNames() {
      const config = window.STConfig;
      const independent = config.effectiveLibraryNameMode(api.ctx.settings()) === config.libraryNameMode.values.INDEPENDENT;
      return independent ? api.ctx.userNames() : EMPTY_NAMES;
    }

    function remove(row) {
      labels.get(row)?.remove();
      labels.delete(row);
    }

    function isPlaying(row) {
      return row.matches(PLAYING) && !!row.closest(GAME_GROUP) && content.contains(row);
    }

    function render(row) {
      if (!isPlaying(row)) {
        rows.delete(row);
        remove(row);
        return;
      }
      rows.add(row);
      const game = gameTitle(row);
      const saved = game && names[game.appid];
      const name = typeof saved === "string" ? saved.trim() : "";
      if (!game || !name || name.toLowerCase() === game.original.trim().toLowerCase()) return remove(row);

      let suffix = labels.get(row);
      if (suffix?.parentElement !== game.title) {
        remove(row);
        suffix = doc.createElement("span");
        suffix.className = SUFFIX;
        suffix.style.opacity = ".82";
        labels.set(row, suffix);
        game.title.append(suffix);
      }
      const text = " [" + name + "]";
      if (suffix.textContent !== text) suffix.textContent = text;
    }

    function refresh() {
      names = readNames();
      for (const row of rows) render(row);
    }

    function changed(records) {
      const touched = new Set();
      const track = row => {
        if (rows.has(row) || isPlaying(row)) touched.add(row);
      };
      function collect(node) {
        if (node.nodeType !== 1) return;
        if (node.matches(PLAYER)) track(node);
        else for (const row of node.querySelectorAll(PLAYER)) track(row);
      }
      for (const record of records) {
        const element = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        if (!element || !content.contains(element) || element.closest("." + SUFFIX)) continue;
        const row = element.closest(PLAYER);
        if (record.type === "attributes") {
          if (element === row && isPlaying(row) !== rows.has(row)) touched.add(row);
          else if (row && element.matches("img.gameIcon")) track(row);
          else if (element.matches(".friendGroup")) collect(element);
          continue;
        }
        if (row) {
          if (record.type === "childList" && !record.removedNodes.length
            && record.addedNodes.length === 1 && record.addedNodes[0].classList?.contains(SUFFIX)) continue;
          track(row);
        } else {
          for (const node of record.addedNodes) collect(node);
          for (const node of record.removedNodes) collect(node);
        }
      }
      for (const row of touched) render(row);
    }

    function stop() {
      for (const row of labels.keys()) remove(row);
      rows.clear();
      names = EMPTY_NAMES;
    }

    for (const row of content.querySelectorAll(GAME_GROUP + " " + PLAYING)) rows.add(row);
    try {
      refresh();
    } catch (error) {
      stop();
      throw error;
    }
    return { changed, refresh, stop };
  }

  function startNames() {
    const event = window.STConfig.libraryNameMode.snapshotChangedEvent;
    const stop = register(NAME_ID, mountNames);
    const refresh = () => {
      for (const windowEntry of windows.values()) windowEntry.refreshNames();
    };
    document.addEventListener(event, refresh);
    return { started: true, stop() {
      document.removeEventListener(event, refresh);
      stop();
    } };
  }

  api.friendsList = Object.freeze({ register, startNames });
  registerFeature();
})();
