/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 扩展域内嵌云同步设置卡片
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

(() => {
  "use strict";

  const parentUrl = new URLSearchParams(location.hash.slice(1)).get("parent");
  if (window.parent === window || !parentUrl) return;
  const parentOrigin = new URL(parentUrl);
  const match = STConfig.matchers;
  if (parentOrigin.protocol !== "https:" || !(match.isSteamPoweredLikeHost(parentOrigin.hostname)
    || match.isSteamCommunityLikeHost(parentOrigin.hostname))) return;

  // 宿主页只接收布局、草稿状态和窗口操作，配置读写由扩展文档直接请求后台
  function post(action, details = {}) {
    window.parent.postMessage({ type: "steam-buff-cloud-card", action, ...details }, parentOrigin.origin);
  }

  async function mount() {
    await STI18n.ready();
    document.documentElement.lang = STI18n.intlLocale();
    document.title = STI18n.text("settings.cloud.title", "设置云同步");
    const ui = STSettingsCloudUi;
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STSettingsStyles.css(`
      :host { display: block; position: static; pointer-events: auto; }
      .overlay.cloud-card-overlay.open { display: block; position: static; padding: 0; background: none; overflow: visible; }
      .overlay.cloud-card-overlay.open .panel {
        display: block; width: 100%; height: auto; min-width: 0; min-height: 0; max-width: none; max-height: none;
        padding: 0; margin: 0; border: 0; border-radius: 0; overflow: visible;
        background: var(--st-dialog-surface); box-shadow: none; transform: none; transition: none;
      }
      .settings-cloud-card { margin: 0; }
      @media (min-width: 460px) {
        .settings-cloud-card .settings-row:not(.cloud-dav-actions) { flex-direction: row; align-items: center; }
        .settings-cloud-card .settings-value { width: auto; justify-content: flex-end; }
        .settings-cloud-card .settings-control { width: min(280px, 100%); }
        .settings-cloud-card .switch { margin: 0; }
      }
    `);
    const overlay = document.createElement("main");
    overlay.className = "overlay open cloud-card-overlay";
    const panel = document.createElement("div");
    panel.className = "panel";
    STDomUtils.setTrustedHTML(panel, STDomUtils.trustedHTML(ui.htmlSync(), "settings-cloud-card-template"));
    overlay.append(panel);
    shadow.append(style, overlay);
    document.body.append(host);

    const ctx = { openCat: () => { post("account"); return true; } };
    shadow.addEventListener("click", event => ui.handleClick(event, shadow, ctx));
    shadow.addEventListener("keydown", event => {
      if (event.key === "Escape" && !shadow.querySelector("dialog[open]")) post("close");
    });
    let hasDraft = false;
    ui.bind(shadow, pending => {
      if (pending === hasDraft) return;
      hasDraft = pending;
      post("draft", { pending });
    });
    await ui.refresh(shadow);
    const card = panel.querySelector(".settings-cloud-card");
    let height = 0;
    const report = () => {
      const next = Math.ceil(card.getBoundingClientRect().height);
      if (next <= 0 || next === height) return;
      height = next;
      post("layout", { height });
    };
    const observer = new ResizeObserver(report);
    observer.observe(card);
    window.addEventListener("pagehide", () => { observer.disconnect(); ui.dispose(shadow); }, { once: true });
    report();
  }

  void mount().catch(error => {
    post("failed");
    STLoggerFactory.reportError(error, { domain: "settings", feature: "settings-cloud", event: "settings-cloud-frame-failed",
      message: "嵌入设置云同步卡片失败", level: "error" });
  });
})();
