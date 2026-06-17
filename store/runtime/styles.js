/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店页样式工具
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  'use strict';

  const api = root.STStore = root.STStore || {};
  const components = root.STComponents;

  /**
   * 统一注入 Store 域样式，避免各功能重复创建 style 和绕开主题 token。
   * @param {string} id - style 元素 ID。
   * @param {string} css - 样式内容。
   * @param {{version?: string, owner?: string, key?: string}} options - 资源登记选项。
   * @returns {HTMLStyleElement|null} style 元素。
   */
  function ensureStyle(id, css, options = {}) {
    if (!id || !root.document?.head) {
      return null;
    }

    let style = root.document.getElementById(id);
    const version = options.version || '';
    if (style && (!version || style.dataset.version === version)) {
      return style;
    }

    if (!style) {
      style = root.document.createElement('style');
      style.id = id;
      root.document.head.appendChild(style);
    }

    if (version) {
      style.dataset.version = version;
    }
    style.textContent = String(css || '');

    if (options.owner && !style.dataset.stStoreStyleResource) {
      style.dataset.stStoreStyleResource = '1';
      root.STRuntime?.current?.()?.registerResource?.({
        owner: options.owner,
        key: options.key || `style:${id}`,
        type: 'style',
        dispose: () => style.remove(),
      });
    }

    return style;
  }

  /**
   * 移除 Store 域统一注入的样式。
   * @param {string} id - style 元素 ID。
   * @returns {boolean} 是否移除成功。
   */
  function removeStyle(id) {
    const style = id ? root.document?.getElementById?.(id) : null;
    if (!style) {
      return false;
    }
    style.remove();
    return true;
  }

  api.styles = Object.freeze({
    applyStyles: components.applyStyles,
    appendContent: components.appendContent,
    createStyledElement: components.createStyledElement,
    ensureStyle,
    removeStyle,
    templates: components.templates,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
