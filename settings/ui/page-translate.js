/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 悬浮栏手动网页翻译入口
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

((root) => {
  "use strict";

  if (root.STSettingsPageTranslate) return;

  const log = root.STLoggerFactory.createLogger("translate", "manual-page");
  const views = new Set();
  let task = null;
  let status = "";
  let message = "";
  let hideTimer = 0;

  function available() {
    return root.top === root
      && root.STPageContext.settingsPage() === "settings-web"
      && root.STPageContext.translateAllowed({ scope: "steam" }).allowed === true;
  }

  function tr(key, fallback, params) {
    return root.STI18n.text(key, fallback, params);
  }

  function paint(view) {
    const title = message || tr("settings.shell.pageTranslateButton", "手动翻译网页（使用设置中的目标语言）");
    view.button.disabled = !!task;
    view.button.setAttribute("aria-busy", task ? "true" : "false");
    view.button.title = title;
    view.button.setAttribute("aria-label", title);
    view.button.dataset.state = status;
    view.notice.textContent = message;
    view.notice.hidden = !message;
    view.notice.dataset.state = status;
  }

  function update(nextStatus, nextMessage) {
    status = nextStatus;
    message = nextMessage;
    root.clearTimeout(hideTimer);
    for (const view of views) paint(view);
    if (!task && message) hideTimer = root.setTimeout(() => update("", ""), 6000);
  }

  function requestRuntime(payload, options = {}) {
    if (root.STMessageBus?.ready && root.STMessageBus?.request) {
      return root.STMessageBus.request(payload, options);
    }
    return new Promise((resolve, reject) => {
      try {
        root.chrome.runtime.sendMessage(payload, (response) => {
          const error = root.chrome.runtime.lastError;
          if (error) {
            reject(new Error(error.message || "运行时消息请求失败"));
            return;
          }
          if (options.expectSuccess === true && response?.success === false) {
            reject(new Error(response.error || "运行时消息请求失败"));
            return;
          }
          resolve(response || null);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  // 两种悬浮栏共享同一个任务；配置只在点击时读取，不写入设置或启动自动模式
  function run() {
    if (task) return task;
    const operationId = root.STLoggerFactory.createOperationId();
    const startedAt = Date.now();
    const href = location.href;
    const body = document.body;
    const checkPage = () => {
      if (location.href !== href || document.body !== body) throw new Error(tr("settings.shell.pageTranslatePageChanged", "页面已变化，请在当前页面重新点击翻译"));
    };
    task = Promise.resolve().then(async () => {
      if (!available()) throw new Error(tr("settings.shell.pageTranslateUnavailable", "当前页面不支持手动翻译"));
      const storage = root.STSettings.storage;
      const [conf, ai] = await Promise.all([storage.getTranslate(), storage.getAi()]);
      checkPage();
      log.info("manual-page-start", "用户开始手动翻译网页", { operationId, to: conf.to, service: conf.service });
      await requestRuntime({
        type: "TRANSLATE_INJECT", action: "manual-page", cfg: { ...conf, ai }, operationId,
      }, { expectSuccess: true });
      checkPage();
      const runner = root.STTranslateRunner;
      if (typeof runner?.manualPage !== "function") throw new Error(tr("settings.shell.pageTranslateRuntimeMissing", "手动翻译运行时未加载，请刷新网页后重试"));
      const result = await runner.manualPage({ ...conf, ai });
      log.info("manual-page-success", "手动网页翻译完成", { operationId, ...result, durationMs: Date.now() - startedAt });
      return result;
    }).then((result) => {
      task = null;
      update("success", tr("settings.shell.pageTranslateSuccess", "翻译完成；刷新网页可恢复原文"));
      return result;
    }, (error) => {
      task = null;
      log.error("manual-page-failed", "手动网页翻译失败", { operationId, error, durationMs: Date.now() - startedAt });
      update("error", tr("settings.shell.pageTranslateFailed", "翻译未完成：$error$。请再次点击重试", { error: error.message }));
      return null;
    });
    update("busy", tr("settings.shell.pageTranslateBusy", "正在翻译网页…"));
    return task;
  }

  /**
   * 挂载共用翻译按钮及状态提示，返回 button 和 dispose
   * 点击/拖动由所属悬浮栏处理；释放视图不取消正在执行的页面任务
   * 非 Steam 网页不展示此入口
   */
  function mount(item) {
    item.hidden = !available();
    if (item.hidden) return { button: null, dispose() {} };
    const button = document.createElement("button");
    button.className = "page-translate";
    button.type = "button";
    const content = document.createElement("span");
    content.className = "content";
    const img = document.createElement("img");
    img.alt = "";
    img.src = root.STSettingsAssets.pageTranslateIcon();
    content.appendChild(img);
    button.appendChild(content);
    const notice = document.createElement("span");
    notice.className = "page-translate-status";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    item.replaceChildren(button, notice);
    const view = { button, notice };
    views.add(view);
    paint(view);
    return { button, dispose: () => views.delete(view) };
  }

  root.STSettingsPageTranslate = Object.freeze({ mount, run });
})(globalThis);
