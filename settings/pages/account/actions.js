/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 用户中心|页面事件
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  function create(options = {}) {
    const rt = options.state;
    const api = options.api || root.STSettingsAccountApi;
    const auth = options.auth;
    const center = options.center;
    const deviceLogin = options.deviceLogin;

    function refresh(ctx) {
      ctx.refresh("account");
    }

    function openUrl(target) {
      const href = api.externalUrl?.(target) || String(target || "");
      if (href) {
        const link = document.createElement("a");
        link.href = href;
        link.rel = "noreferrer noopener";
        link.style.display = "none";
        (document.body || document.documentElement).appendChild(link);
        link.click();
        link.remove();
      }
    }

    function openCat(id) {
      if (id) {
        root.STSettings?.openCat?.(id);
      }
    }

    function handleCenter(action, target, shadow, ctx) {
      if (action === "open-cat") {
        openCat(target);
        return true;
      }
      if (action === "refresh-center" || action === "retry-center") {
        if (action === "refresh-center") {
          center.clearCenterCache();
        }
        rt.centerError = "";
        center.syncCenter(shadow, ctx, { force: true }).catch(() => {});
        return true;
      }
      if (action === "donate") {
        openUrl(api.urls.donate);
        return true;
      }
      if (action === "vip") {
        openUrl(api.urls.vip);
        return true;
      }
      if (action === "profile") {
        openUrl(api.urls.account);
        return true;
      }
      if (action === "soon") {
        ctx.dialog?.(shadow, {
          title: "功能入口待接入",
          message: "当前功能的管理页还未接入设置面板。",
        });
        return true;
      }
      return false;
    }

    function closeMenus(shadow, keep = null) {
      shadow.querySelectorAll(".action-menu-wrap.open").forEach((wrap) => {
        if (keep && wrap === keep) {
          return;
        }
        wrap.classList.remove("open");
        wrap.querySelector("[data-center-menu]")?.setAttribute("aria-expanded", "false");
      });
    }

    function handle(event, shadow, ctx) {
      const userCopy = event.target.closest("[data-user-copy]");
      if (userCopy) {
        deviceLogin.copyText(userCopy.dataset.userCopy || "").then((ok) => {
          deviceLogin.setCopyMsg(shadow, ok ? "用户 ID 已复制" : "复制失败，请手动复制");
        });
        return true;
      }

      const authCopy = event.target.closest("[data-copy-auth]")?.dataset?.copyAuth;
      if (authCopy) {
        deviceLogin.copy(shadow, authCopy, event.target.closest("[data-copy-auth]"));
        return true;
      }

      const menu = event.target.closest("[data-center-menu]");
      if (menu) {
        const wrap = menu.closest(".action-menu-wrap");
        const open = !wrap?.classList.contains("open");
        closeMenus(shadow, wrap);
        wrap?.classList.toggle("open", open);
        menu.setAttribute("aria-expanded", open ? "true" : "false");
        return true;
      }

      const action = event.target.closest("[data-auth-action]")?.dataset?.authAction;
      if (action === "login") {
        closeMenus(shadow);
        deviceLogin.start(shadow, ctx);
        return true;
      }
      if (action === "open") {
        closeMenus(shadow);
        const authUrl = deviceLogin.fullUrl();
        openUrl(authUrl);
        return true;
      }
      if (action === "cancel") {
        closeMenus(shadow);
        deviceLogin.stopPoll();
        rt.busy = false;
        rt.device = null;
        rt.msg = "已取消登录";
        rt.copyMsg = "";
        deviceLogin.clearCopyTimer();
        refresh(ctx);
        return true;
      }
      if (action === "logout") {
        closeMenus(shadow);
        auth.logout(shadow, ctx, {
          stopPoll: deviceLogin.stopPoll,
          clearCopyTimer: deviceLogin.clearCopyTimer,
          refresh,
        });
        return true;
      }

      const centerAction = event.target.closest("[data-center-action]");
      if (centerAction) {
        closeMenus(shadow);
        return handleCenter(centerAction.dataset.centerAction || "", centerAction.dataset.target || "", shadow, ctx);
      }
      closeMenus(shadow);
      return false;
    }

    return Object.freeze({ handle, handleCenter, closeMenus });
  }

  const api = Object.freeze({ create });
  root.STSettingsAccountActions = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
