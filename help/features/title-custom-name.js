/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 客服游戏卡片的自定义名称
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

((root) => {
  "use strict";

  const match = root.STConfig.matchers;

  function findTarget(wizard) {
    const page = match.helpWizardPage(root.location.href);
    if (!page?.section || !page.appid) return null;
    const title = wizard.querySelector(":scope > .wizard_content_wrapper > .help_app_header > div > .subbox_left > .game_name");
    const link = title?.querySelector(":scope > a[href]");
    const game = link && match.helpWizardPage(link.href);
    // 向导先改 URL 再换卡片，必须同时确认当前路由和原生标题链接指向同一游戏
    return game?.section === "HelpWithGame" && game.appid === page.appid ? { title, appid: page.appid } : null;
  }

  const feature = root.STGameTitleDisplay.create({
    surface: "help",
    domain: "web",
    id: "help-title-custom-name",
    pageScope: ["steam-help-wizard"],
    findTarget,
    // 封面为原生浮动元素，独立排版上下文让标题各行留在封面右侧
    titleStyle: hostClass => `.game_name.${hostClass} { display: flow-root; white-space: normal; overflow-wrap: anywhere; }`,
  });

  root.STHelpTitleName = Object.freeze({
    start(getAuthClient, loadEditor) {
      const wizard = document.getElementById("wizard_contents");
      if (wizard) feature.start(getAuthClient, loadEditor, wizard);
    },
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
