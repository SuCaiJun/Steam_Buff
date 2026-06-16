/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : Steam 客户端样式工具
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  'use strict';

  const api = root.SteamBuff = root.SteamBuff || {};
  const components = root.STComponents;

  api.styles = Object.freeze({
    applyStyles: components.applyStyles,
    appendContent: components.appendContent,
    createStyledElement: components.createStyledElement,
    templates: components.templates,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
