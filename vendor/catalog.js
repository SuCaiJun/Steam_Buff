/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : 第三方开源项目与随包库清单
 * @File          : Vendor catalog
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  if (root.STVendorCatalog) {
    return;
  }

  const entry = (value) => Object.freeze(value);
  const openSourceLibs = Object.freeze([
    entry({
      id: "augmented-steam",
      name: "Augmented Steam",
      url: "https://github.com/IsThereAnyDeal/AugmentedSteam",
      license: "GPL-3.0-or-later",
      kind: "reference",
    }),
    entry({
      id: "steam-purchase-history-classifier",
      name: "Steam 消费历史分类器",
      nameKey: "settings.feature.purchase-history-classifier.name",
      url: "https://keylol.com/t1035599-1-1",
      license: "MIT",
      kind: "bundled",
      directory: "SmallFork",
    }),
    entry({
      id: "steamdb-extension",
      name: "SteamDB Extension",
      url: "https://github.com/SteamDatabase/BrowserExtension",
      license: "BSD-3-Clause",
      kind: "reference",
    }),
    entry({
      id: "subscription-info",
      name: "SubscriptionInfo",
      url: "https://github.com/alike03/SubscriptionInfo",
      license: "MPL-2.0",
      kind: "reference",
    }),
    entry({
      id: "pinyin-pro",
      name: "pinyin-pro",
      url: "https://github.com/zh-lx/pinyin-pro",
      license: "MIT",
      kind: "bundled",
      directory: "pinyin-pro",
    }),
    entry({
      id: "qrcode-generator",
      name: "qrcode-generator",
      url: "https://github.com/kazuhikoarase/qrcode-generator",
      license: "MIT",
      kind: "bundled",
      directory: "qrcode-generator",
    }),
    entry({
      id: "xnx3-translate",
      name: "xnx3 translate.js",
      url: "https://github.com/xnx3/translate",
      license: "MIT",
      kind: "bundled",
      directory: "xnx3-translate",
    }),
    entry({
      id: "fflate",
      name: "fflate",
      url: "https://github.com/101arrowz/fflate",
      license: "MIT",
      kind: "bundled",
      directory: "fflate",
    }),
    entry({
      id: "markdown-it",
      name: "markdown-it",
      url: "https://github.com/markdown-it/markdown-it",
      license: "MIT",
      kind: "bundled",
      directory: "markdown-it",
    }),
    entry({
      id: "dompurify",
      name: "DOMPurify",
      url: "https://github.com/cure53/DOMPurify",
      license: "MPL-2.0 OR Apache-2.0",
      kind: "bundled",
      directory: "dompurify",
    }),
  ]);

  root.STVendorCatalog = Object.freeze({ openSourceLibs });
})(globalThis);
