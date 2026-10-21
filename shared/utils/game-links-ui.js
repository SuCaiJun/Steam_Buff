/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : 商店与库详情共用的相关链接和二维码卡片
 * @File          : 共享相关链接卡片
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  function createController(options) {
    const api = options.api;
    const model = root.STGameLinks;
    const log = options.logger;
    const ID = options.id;
    let card = null, grid = null, note = null, appId = 0, gameName = "", customName = "";
    let config = model.defaults(), subscription = null, nameSubscription = null;
    const context = () => appId ? { appId, gameName, customName: options.customName ? options.customName(appId) : customName } : null;
    let generation = 0, configSeq = 0, configReady = false;
    const tr = (key, fallback, params) => root.STI18n.text(`gameLinks.${key}`, fallback, params);
    const qrUrls = new WeakMap(), qrImages = new WeakMap();
    let qrPopup = null, qrTrigger = null;
    function hideQR() {
      qrTrigger?.removeAttribute("aria-describedby");
      qrPopup?.remove();
      qrPopup = qrTrigger = null;
      root.document.removeEventListener("keydown", qrEscape);
    }
    function qrEscape(event) {
      if (event.key === "Escape") hideQR();
    }
    function leaveQR(event) {
      if (qrPopup?.contains(event.relatedTarget) || qrTrigger?.contains(event.relatedTarget)) return;
      if (root.document.activeElement === qrTrigger) return;
      hideQR();
    }
    function showQR(node) {
      const url = qrUrls.get(node);
      if (!url || qrTrigger === node) return;
      hideQR();
      try {
        if (!qrImages.has(node)) qrImages.set(node, root.STQRCode.image(url, { size: 176, alt: tr("qrImage", "链接二维码") }));
        const image = qrImages.get(node);
        if (!image) return;
        const popup = root.document.createElement("div"), caption = root.document.createElement("p");
        popup.id = `${ID}-qr`;
        popup.className = "st-game-links__qr";
        popup.setAttribute("role", "tooltip");
        caption.textContent = tr("qrHint", "使用手机扫码打开");
        popup.append(image, caption);
        root.document.documentElement.append(popup);
        const rect = node.getBoundingClientRect(), width = popup.offsetWidth, height = popup.offsetHeight;
        popup.style.left = `${Math.max(8, Math.min(root.innerWidth - width - 8, rect.left + (rect.width - width) / 2))}px`;
        popup.style.top = `${Math.max(8, rect.bottom + height + 8 > root.innerHeight ? rect.top - height - 8 : rect.bottom + 8)}px`;
        node.setAttribute("aria-describedby", popup.id);
        qrPopup = popup;
        qrTrigger = node;
        popup.addEventListener("pointerleave", leaveQR);
        root.document.addEventListener("keydown", qrEscape);
      } catch (error) {
        qrImages.set(node, null);
        node.title = tr("qrFailed", "二维码生成失败，请缩短链接后重试。");
        log.error("qr-generate-failed", "相关链接二维码生成失败", { appid: appId, linkId: node.dataset.stGameLink, error });
      }
    }
    function bindQR() {
      const find = event => event.target.closest('[data-st-game-link-type="qrcode"]');
      grid.addEventListener("pointerover", event => {
        const node = find(event);
        if (node) showQR(node);
      });
      grid.addEventListener("focusin", event => {
        const node = find(event);
        if (node) showQR(node);
      });
      grid.addEventListener("pointerout", leaveQR);
      grid.addEventListener("focusout", event => {
        if (!qrPopup?.contains(event.relatedTarget)) hideQR();
      });
      grid.addEventListener("click", event => {
        if (find(event)) event.preventDefault();
      });
    }
    function prepareStyles() {
      api.styles.ensureStyle("st-game-links-style", `
      .st-game-links{margin:8px 0}
      .st-game-links__link{display:flex;align-items:center;justify-content:center;gap:8px}
      .st-game-links__icon{display:inline-block;flex:0 0 16px;width:16px;height:16px;background:currentColor;mask-size:contain;mask-repeat:no-repeat;mask-position:center}
      .st-game-links__icon[data-type="web"]{mask-image:url("${options.iconUrl("web")}")}
      .st-game-links__icon[data-type="qrcode"]{mask-image:url("${options.iconUrl("qrcode")}")}
      .st-game-links__qr{position:fixed;z-index:10000;box-sizing:border-box;width:208px;max-width:calc(100vw - 16px);padding:16px;border-radius:8px;border:1px solid var(--st-color-border-light);background:var(--st-color-bg-card);color:var(--st-color-text-primary);box-shadow:var(--st-shadow-dialog);text-align:center}
      .st-game-links__qr img{display:block;width:176px;height:176px;max-width:100%;image-rendering:pixelated}
      .st-game-links__qr p{margin:8px 0 0;font-size:12px}
      .st-game-links--library{margin:0 0 16px;font-size:14px}
      .st-game-links--library .st-game-links__head{margin:0;background:none;font-size:14px;font-weight:400;line-height:normal;letter-spacing:1px;text-transform:uppercase}
      .st-game-links--library .st-game-links__panel{border:1px solid var(--st-color-border-normal);background:var(--st-color-surface-subtle)}
      .st-game-links--library .st-game-links__grid{padding:12px 16px 14px}
      .st-game-links__head{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .st-game-links__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:8px}
      .st-game-links[data-columns="1"] .st-game-links__grid{grid-template-columns:minmax(0,1fr)}
      .st-game-links__link{box-sizing:border-box;min-width:0;white-space:normal;overflow-wrap:anywhere;text-align:center;font-size:12px;text-decoration:none}
      .st-game-links .st-game-links__link{height:auto;min-height:32px;white-space:normal;line-height:1.5}
      .st-game-links[data-columns="1"] .st-game-links__link{height:auto;min-height:40px;padding:8px 16px;gap:8px;justify-content:flex-start;text-align:left;white-space:normal;font-size:14px;line-height:1.5}
      .st-game-links__link[aria-disabled="true"]{opacity:.6;cursor:default}
      .st-game-links__note{margin:0;padding:8px;color:var(--st-color-text-muted);font-size:12px}
      .st-game-links__note:empty{display:none}
      .st-game-links__link:focus-visible{outline:2px solid var(--st-color-steam-blue);outline-offset:2px}
      @media(max-width:400px){.st-game-links__grid{grid-template-columns:1fr}}
      ${api.styles.css.button(".st-game-links__link", { variant: "secondary" })}
    `);
    }
    function target() {
      return options.getTarget();
    }
    function current(ticket) {
      return ticket === generation && !!card?.isConnected && Number(options.currentAppId()) === appId;
    }
    function itemName(item) {
      const entry = model.definition(item);
      return entry.builtin && !Object.hasOwn(item, "name") ? tr(`preset.${entry.id}`, entry.name) : entry.name;
    }
    function render() {
      if (!grid) return;
      card.dataset.columns = String(config.columns);
      const fragment = root.document.createDocumentFragment();
      let visible = 0;
      for (const item of config.items) {
        if (!model.visible(item, options.surface)) continue;
        visible += 1;
        let resolved = null, reason = "";
        try {
          if (configReady) resolved = model.resolve(item, context());
        } catch (error) {
          reason = tr("linkUnavailable", "当前游戏缺少链接所需的数据");
          if (error.code !== "GAME_NAME_REQUIRED") log.error("link-resolve-failed", "游戏相关链接解析失败", { appid: appId, linkId: item.id, error });
        }
        const node = root.document.createElement(resolved?.url ? (item.type === "qrcode" ? "button" : "a") : "span");
        node.className = "st-game-links__link";
        node.dataset.stGameLink = item.id;
        node.dataset.stGameLinkType = item.type;
        const icon = root.document.createElement("span");
        icon.className = "st-game-links__icon";
        icon.dataset.type = item.type;
        icon.setAttribute("aria-hidden", "true");
        const name = resolved && (!resolved.builtin || Object.hasOwn(item, "name")) ? resolved.name : itemName(item);
        node.textContent = name;
        node.prepend(icon);
        if (resolved?.url) {
          if (item.type === "qrcode") {
            node.type = "button";
            qrUrls.set(node, resolved.url);
          } else {
            root.STConfig.externalNavigation.applyToLink(node, resolved.url);
          }
        } else {
          node.setAttribute("aria-disabled", "true");
          node.title = !configReady ? tr("loadingConfig", "正在加载链接设置") : reason;
        }
        fragment.appendChild(node);
      }
      hideQR();
      grid.replaceChildren(fragment);
      card.hidden = configReady && visible === 0;
    }
    async function loadConfig(ticket) {
      const request = ++configSeq;
      try {
        const next = model.normalize(await options.loadConfig());
        if (!current(ticket) || request !== configSeq) return;
        config = next;
        configReady = true;
        note.textContent = "";
        render();
      } catch (error) {
        if (!current(ticket) || request !== configSeq) return;
        note.textContent = tr("configFailed", "链接设置读取失败，请重试读取。原配置尚未覆盖。");
        if (error.reported !== true) log.error("config-load-failed", "游戏相关链接配置读取失败", { appid: appId, error });
      }
    }
    function stop() {
      hideQR();
      generation += 1;
      configSeq += 1;
      subscription?.dispose();
      subscription = null;
      nameSubscription?.dispose();
      nameSubscription = null;
      card?.remove();
      card = grid = note = null;
      appId = 0;
    }
    function start(id) {
      const parent = target();
      if (!parent || Number(options.currentAppId()) !== Number(id)) return null;
      if (appId === Number(id) && card?.parentElement === parent) return card;
      stop();
      appId = Number(id);
      const ticket = generation;
      gameName = options.gameName();
      customName = '';
      config = model.defaults();
      configReady = false;
      card = root.document.createElement("div");
      card.id = ID;
      card.className = `st-game-links st-game-links--${options.surface} ${options.cardClass || ""}`;
      const library = options.surface === "library";
      const head = root.document.createElement(library ? "h2" : "div"), title = root.document.createElement("span");
      head.className = library ? "_3A_c3YHYd4YIjA8Y-olnPl _1Q2q_tQ9_Eq8YdEHNAHS3F _3jY6xWI4URhFyYsanh9VKL st-game-links__head" : "block responsive_apppage_details_right heading st-game-links__head";
      title.textContent = `${library ? "Steam Buff · " : ""}${tr("title", "相关链接")}`;
      head.append(title);
      const panel = root.document.createElement("div");
      panel.className = options.surface === "library" ? "_31ptFGGMZrSQc5BCX1e5lm _2G5B7o_YoI__u11--EFjal _3KfxIwlXEvum7FCD_AM2_t Panel st-game-links__panel" : "block responsive_apppage_details_right st-game-links__panel";
      grid = root.document.createElement("div");
      grid.className = "st-game-links__grid";
      note = root.document.createElement("p");
      note.className = "st-game-links__note";
      note.setAttribute("role", "status");
      note.textContent = tr("loadingConfig", "正在加载链接设置");
      panel.append(grid, note);
      card.append(head, panel);
      options.insertCard(card, parent);
      bindQR();
      render();
      subscription = options.subscribe(event => {
        if (!current(ticket)) return;
        if (event.changedKeys.includes(model.KEY)) void loadConfig(ticket);
      }, { owner: "store:game-links", key: "config", keys: [model.KEY] });
      if (options.subscribeNames) nameSubscription = options.subscribeNames(event => {
        if (current(ticket) && event.appId === appId) render();
      });
      void loadConfig(ticket);
      if (options.loadName) void options.loadName(appId).then(names => {
        if (current(ticket)) {
          gameName = names.gameName;
          customName = names.customName;
          render();
        }
      }).catch(error => {
        if (current(ticket) && error.reported !== true) log.error("game-name-load-failed", "相关链接原始游戏名称读取失败", { appid: appId, error });
      });
      return card;
    }
    return Object.freeze({
      prepareStyles,
      start,
      stop,
      context,
      mountState: () => ({ target: target(), host: card })
    });
  }
  root.STGameLinksUi = Object.freeze({ createController });
})(globalThis);
