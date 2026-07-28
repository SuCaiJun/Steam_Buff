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

  function createBrandMark(options = {}) {
    const suffix = String(options.suffix ?? "").trim();
    const extraClass = String(options.className ?? "").trim();
    const root = document.createElement("span");
    root.className = ["st-brand-mark", extraClass].filter(Boolean).join(" ");
    root.setAttribute("translate", "no");
    root.setAttribute("aria-label", `Steam Buff${suffix ? ` · ${suffix}` : ""}`);

    const steam = document.createElement("span");
    steam.className = "st-brand-mark__steam";
    steam.textContent = "Steam";
    const buff = document.createElement("span");
    buff.className = "st-brand-mark__buff";
    buff.textContent = "Buff";
    root.append(steam, buff);

    if (suffix) {
      const separator = document.createElement("span");
      separator.className = "st-brand-mark__separator";
      separator.setAttribute("aria-hidden", "true");
      separator.textContent = "·";
      const suffixNode = document.createElement("span");
      suffixNode.className = "st-brand-mark__suffix";
      suffixNode.textContent = suffix;
      root.append(separator, suffixNode);
    }
    return root;
  }

  const ImageAssets = Object.freeze({
    MC_LOGO: "store/providers/mc-logo.png",
  });

  api.assets = Object.freeze({
    getImageUrl,
    createBrandMark,
    ImageAssets,
  });
})();
