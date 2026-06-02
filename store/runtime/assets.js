/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页资源路径工具
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore = window.STStore || {};

  function getImageUrl(imageName) {
    return chrome.runtime.getURL(`images/${imageName}`);
  }

  const ImageAssets = Object.freeze({
    MC_LOGO: "mc_logo_no_text.png",
  });

  api.assets = Object.freeze({
    getImageUrl,
    ImageAssets,
  });
})();
