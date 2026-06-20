/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置面板|用户中心入口
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const root = globalThis;
  const pages = root.STSettingsPages;
  if (!pages?.register) {
    return;
  }
  const log = root.STLoggerFactory?.createLogger?.("settings", "account") || {
    warn() {},
  };

  const rt = root.STSettingsAccountState.create();
  const api = root.STSettingsAccountApi;
  let auth = null;
  const center = root.STSettingsAccountCenter.create({
    state: rt,
    api,
    getAuth: () => auth,
  });
  auth = root.STSettingsAccountAuth.create({ state: rt, api, center });
  center.setAuth?.(auth);
  const deviceLogin = root.STSettingsAccountDeviceLogin.create({
    state: rt,
    api,
    auth,
    getCenter: () => center,
  });
  const view = root.STSettingsAccountView.create({ state: rt, center, deviceLogin });
  const actions = root.STSettingsAccountActions.create({
    state: rt,
    api,
    auth,
    center,
    deviceLogin,
  });

  async function load(ctx) {
    await auth.load(ctx);
  }

  async function onOpen(shadow, ctx) {
    const before = JSON.stringify(rt.auth || null);
    await auth.load(ctx);
    if (JSON.stringify(rt.auth || null) !== before) {
      ctx.refresh("account");
    }
    if (rt.auth?.access_token || rt.auth?.refresh_token) {
      center.syncCenter(shadow, ctx).catch((error) => {
        log.warn("account-center-sync-unhandled", "用户中心同步兜底失败", {
          source: "page-open",
          error: error?.message || String(error),
        });
      });
    }
  }

  pages.register({
    id: "account",
    name: "用户中心",
    desc: "账号、身份标识与功能用量。",
    order: -100,
    load,
    html: (ctx) => view.html(ctx),
    handle: (event, shadow, ctx) => actions.handle(event, shadow, ctx),
    onOpen,
    style: root.STSettingsAccountStyle.css(),
  });
})();
