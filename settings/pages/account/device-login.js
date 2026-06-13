/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 用户中心|设备码登录
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  const log = root.STLoggerFactory.createLogger("settings", "account");

  function create(options = {}) {
    const rt = options.state;
    const api = options.api || root.STSettingsAccountApi;
    const auth = options.auth;
    const getCenter = typeof options.getCenter === "function" ? options.getCenter : () => null;

    function refresh(ctx) {
      ctx.refresh("account");
    }

    function stopPoll() {
      if (rt.pollTimer) {
        window.clearTimeout(rt.pollTimer);
        rt.pollTimer = 0;
      }
    }

    function clearCopyTimer() {
      if (rt.copyTimer) {
        window.clearTimeout(rt.copyTimer);
        rt.copyTimer = 0;
      }
    }

    function schedule(shadow, ctx) {
      stopPoll();
      if (!rt.device) {
        return;
      }
      const delay = Math.max(1, Number(rt.device.interval) || 3) * 1000;
      rt.pollTimer = window.setTimeout(() => {
        poll(shadow, ctx).catch((error) => {
          rt.busy = false;
          setStatus(shadow, error?.message || String(error));
        });
      }, delay);
    }

    async function start(shadow, ctx) {
      if (rt.busy) {
        return;
      }
      const startedAt = Date.now();
      stopPoll();
      rt.busy = true;
      rt.device = null;
      rt.center = null;
      rt.loadError = "";
      rt.centerError = "";
      rt.msg = "正在获取验证码";
      rt.copyMsg = "";
      clearCopyTimer();
      log.info("device-login-start", "开始设备码登录");
      refresh(ctx);
      try {
        const res = await api.request("/auth/device/start", { device_name: ctx.deviceName() }, "", ctx, "POST", api.urls.loginAuthBase);
        if (!api.okCode(res) || !res.body?.device_code) {
          throw new Error(res.body?.message || "获取验证码失败");
        }
        rt.device = {
          device_code: res.body.device_code,
          user_code: res.body.user_code || "",
          verify_url: res.body.verify_url_complete || res.body.verify_url || api.urls.device,
          interval: res.body.interval,
          expires_at: Date.now() + Math.max(1, Number(res.body.expires_in) || 600) * 1000,
          started_at: startedAt,
        };
        rt.busy = false;
        rt.msg = "等待浏览器授权";
        log.info("device-login-code-success", "设备码获取成功", {
          interval: Number(rt.device.interval) || 0,
          durationMs: Date.now() - startedAt,
        });
        refresh(ctx);
        schedule(shadow, ctx);
      } catch (error) {
        rt.busy = false;
        rt.msg = error?.message || String(error);
        rt.loadError = "数据加载失败，点击重试";
        log.error("device-login-failed", "设备码登录启动失败", {
          error: error?.message || String(error),
          durationMs: Date.now() - startedAt,
        });
        refresh(ctx);
      }
    }

    async function poll(shadow, ctx) {
      if (!rt.device) {
        return;
      }
      if (Date.now() >= Number(rt.device.expires_at)) {
        const startedAt = Number(rt.device.started_at) || Date.now();
        rt.busy = false;
        rt.msg = "验证码已过期";
        rt.copyMsg = "";
        clearCopyTimer();
        rt.device = null;
        log.warn("device-login-failed", "设备码已过期", {
          durationMs: Date.now() - startedAt,
        });
        refresh(ctx);
        return;
      }

      const startedAt = Number(rt.device.started_at) || Date.now();
      const res = await api.request("/auth/device/token", { device_code: rt.device.device_code }, "", ctx, "POST", api.urls.loginAuthBase);
      const code = Number(res.body?.code) || res.status || 0;
      if (code === 202) {
        setStatus(shadow, "等待浏览器授权");
        schedule(shadow, ctx);
        return;
      }
      if (!api.okCode(res) || !res.body?.access_token) {
        rt.busy = false;
        rt.msg = res.body?.message || "登录失败";
        rt.copyMsg = "";
        clearCopyTimer();
        rt.device = null;
        log.error("device-login-failed", "设备码登录失败", {
          status: code,
          reason: res.body?.message || "登录失败",
          durationMs: Date.now() - startedAt,
        });
        refresh(ctx);
        return;
      }

      await auth.storeAuth(ctx, root.STSettingsAccountAuth.nextAuth(res.body, rt.auth || {}));
      rt.busy = false;
      rt.msg = "登录成功";
      rt.loadError = "";
      rt.copyMsg = "";
      clearCopyTimer();
      rt.device = null;
      log.info("device-login-success", "设备码登录成功", {
        durationMs: Date.now() - startedAt,
      });
      refresh(ctx);
      getCenter()?.syncCenter?.(shadow, ctx).catch(() => {});
    }

    async function copyText(text) {
      const value = String(text || "");
      if (!value) {
        return false;
      }

      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch {
        const input = document.createElement("textarea");
        input.value = value;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        let ok = true;
        try {
          ok = document.execCommand("copy");
        } catch {
          ok = false;
        }
        input.remove();
        return ok;
      }
    }

    function userCode() {
      const value = String(rt.device?.user_code || "");
      const raw = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (raw.length === 12) {
        return (raw.match(/.{1,4}/g) || []).join("-");
      }
      return value;
    }

    function fullUrl() {
      const target = String(rt.device?.verify_url || api.urls.device);
      const code = userCode();
      if (!code) {
        return target;
      }
      try {
        const next = new URL(target);
        if (next.hostname === api.urls.siteApex) {
          next.hostname = api.urls.siteHost;
        }
        next.searchParams.set("code", code);
        return next.toString();
      } catch {
        const sep = target.includes("?") ? "&" : "?";
        return `${target}${sep}code=${encodeURIComponent(code)}`;
      }
    }

    function displayUrl() {
      try {
        const next = new URL(fullUrl());
        next.search = "";
        next.hash = "";
        return next.toString().replace(/\/$/, "");
      } catch {
        return api.urls.device;
      }
    }

    function setStatus(shadow, message) {
      rt.msg = message;
      const status = shadow.querySelector(".auth-status strong");
      if (status) {
        status.textContent = message || "等待浏览器授权";
      }
    }

    function setCopyMsg(shadow, message) {
      clearCopyTimer();
      rt.copyMsg = message;
      const note = shadow.querySelector("[data-auth-note]");
      if (note) {
        note.textContent = message || "";
        note.hidden = !message;
      }
      if (message) {
        rt.copyTimer = window.setTimeout(() => {
          rt.copyMsg = "";
          const current = shadow.querySelector("[data-auth-note]");
          if (current && current.textContent === message) {
            current.textContent = "";
            current.hidden = true;
          }
        }, 2600);
      }
    }

    function selectText(el) {
      if (!el) {
        return;
      }
      if (typeof el.select === "function") {
        el.select();
        return;
      }
      try {
        const range = document.createRange();
        range.selectNodeContents(el);
        const root = el.getRootNode?.();
        const selection = root?.getSelection?.() || window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      } catch {
      }
    }

    function copy(shadow, key, el) {
      const value = key === "verify_url" ? fullUrl() : userCode();
      selectText(el);
      copyText(value).then((ok) => {
        selectText(el);
        setCopyMsg(shadow, ok ? (key === "verify_url" ? "完整授权链接已复制" : "授权码已复制") : "复制失败，请手动复制");
      });
    }

    return Object.freeze({
      start,
      poll,
      schedule,
      stopPoll,
      clearCopyTimer,
      copyText,
      fullUrl,
      displayUrl,
      userCode,
      setStatus,
      setCopyMsg,
      copy,
    });
  }

  const api = Object.freeze({ create });
  root.STSettingsAccountDeviceLogin = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
