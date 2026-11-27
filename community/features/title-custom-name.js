/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 社区游戏页头的自定义名称
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

((root) => {
  "use strict";

  const match = root.STConfig.matchers;

  function target() {
    const page = match.communityTitlePage(root.location.href);
    if (!page) return null;
    if (page.section === "guide-detail") return root.STPageContext.communityGuideTitle();

    const classicTitle = document.querySelector(".apphub_HeaderTop .apphub_AppDetails > .apphub_AppName");
    if (classicTitle) return { title: classicTitle, appid: page.appid };

    // 新版工坊用游戏中心链接包住 H1，按同一 AppID 匹配，无需依赖 Steam 构建生成的类名
    if (page.section !== "workshop") return null;
    const headings = document.querySelectorAll("a[href] > h1");
    for (const title of headings) {
      const game = match.communityTitlePage(title.parentElement.href);
      if (game?.section === "" && game.appid === page.appid) return { title, appid: game.appid, editAfter: title.parentElement };
    }
    return null;
  }

  root.STCommunityTitleName = root.STGameTitleDisplay.create({
    surface: "community",
    domain: "community",
    id: "title-custom-name",
    pageScope: ["community-game-header", "community-guide-header"],
    findTarget: target,
    titleStyle: hostClass => `.apphub_AppName.${hostClass}, h1.${hostClass} { white-space: normal; overflow-wrap: anywhere; }`,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
