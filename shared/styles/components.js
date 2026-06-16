/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 跨域通用组件样式模板
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  'use strict';

  const COMPONENT_VERSION = '2026-06-16-p11-theme-tokens';

  if (root.STComponents?.version === COMPONENT_VERSION) {
    return;
  }

  const THEME = root.STTheme || {};
  const colors = THEME.colors || {};
  const spacing = THEME.spacing || {};
  const typography = THEME.typography || {};
  const fontWeights = THEME.fontWeights || {};
  const radius = THEME.radius || {};
  const transitions = THEME.transitions || {};
  const shadows = THEME.shadows || {};
  const zIndex = THEME.zIndex || {};
  const gradients = THEME.gradients || {};

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
      return value;
    }

    Object.getOwnPropertyNames(value).forEach((key) => {
      deepFreeze(value[key]);
    });
    return Object.freeze(value);
  }

  /**
   * 应用对象样式，优先复用共享 DOM 工具以保持跨域行为一致。
   * @param {HTMLElement} element - 目标元素。
   * @param {Record<string, string|number|null|undefined>} styles - 样式对象。
   * @returns {HTMLElement} 目标元素。
   */
  function applyStyles(element, styles = {}) {
    if (root.STDomUtils?.setStyles) {
      return root.STDomUtils.setStyles(element, styles);
    }

    if (!element?.style) {
      return element;
    }

    Object.entries(styles || {}).forEach(([name, value]) => {
      if (value === null || value === undefined) {
        element.style.removeProperty(name);
        return;
      }
      if (name.startsWith('--')) {
        element.style.setProperty(name, String(value));
        return;
      }
      element.style[name] = String(value);
    });
    return element;
  }

  /**
   * 安全追加文本或节点内容。
   * @param {HTMLElement} element - 目标元素。
   * @param {Node|string|number|Array<Node|string|number>} content - 待追加内容。
   * @returns {HTMLElement} 目标元素。
   */
  function appendContent(element, content) {
    if (content === null || content === undefined || content === false) {
      return element;
    }

    const doc = root.document || document;
    const items = Array.isArray(content) ? content.flat(Infinity) : [content];
    items.forEach((item) => {
      if (item === null || item === undefined || item === false) {
        return;
      }
      if (item?.nodeType) {
        element.appendChild(item);
        return;
      }
      element.appendChild(doc.createTextNode(String(item)));
    });
    return element;
  }

  /**
   * 创建元素并应用共享样式模板。
   * @param {string} tag - 元素标签名。
   * @param {Record<string, string|number|null|undefined>} styles - 样式对象。
   * @param {Node|string|number|Array<Node|string|number>} content - 初始内容。
   * @returns {HTMLElement} 创建后的元素。
   */
  function createStyledElement(tag, styles = {}, content) {
    const doc = root.document || document;
    const element = doc.createElement(tag || 'div');
    applyStyles(element, styles);
    return appendContent(element, content);
  }

  const templates = deepFreeze({
    moduleContainer: {
      margin: `${spacing.sm} 0`,
      fontFamily: typography.fontFamily,
      color: colors.textPrimary,
    },
    moduleContent: {
      padding: spacing.md,
      color: colors.textSecondary,
      background: colors.bgCard,
      border: `1px solid ${colors.borderLight}`,
      borderRadius: radius.lg,
    },
    moduleTitle: {
      margin: `0 0 ${spacing.sm}`,
      color: colors.textPrimary,
      fontSize: typography.body?.fontSize,
      lineHeight: typography.body?.lineHeight,
      fontWeight: fontWeights.medium,
    },
    moduleDescription: {
      margin: '0',
      color: colors.textMuted,
      fontSize: typography.caption?.fontSize,
      lineHeight: typography.caption?.lineHeight,
      fontWeight: typography.caption?.fontWeight,
    },
    inlineRow: {
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
    },
    stack: {
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.sm,
    },
    primaryButton: {
      minHeight: '32px',
      border: 'none',
      borderRadius: radius.md,
      padding: `0 ${spacing.lg}`,
      color: colors.white,
      background: gradients.primaryVertical,
      boxShadow: shadows.buttonPrimary,
      fontSize: typography.bodySmall?.fontSize,
      fontWeight: fontWeights.medium,
      cursor: 'pointer',
      transition: `filter ${transitions.fast}`,
    },
    secondaryButton: {
      minHeight: '32px',
      border: `1px solid ${colors.borderNormal}`,
      borderRadius: radius.md,
      padding: `0 ${spacing.lg}`,
      color: colors.textPrimary,
      background: colors.surface?.subtle,
      fontSize: typography.bodySmall?.fontSize,
      fontWeight: fontWeights.medium,
      cursor: 'pointer',
      transition: `background ${transitions.fast}, border-color ${transitions.fast}`,
    },
    input: {
      minHeight: '34px',
      border: `1px solid ${colors.borderNormal}`,
      borderRadius: radius.md,
      padding: `0 ${spacing.md}`,
      color: colors.textPrimary,
      background: colors.bgInput,
      fontSize: typography.bodySmall?.fontSize,
      fontFamily: typography.fontFamily,
      outline: 'none',
      transition: `border-color ${transitions.normal}, background ${transitions.normal}`,
    },
    badge: {
      display: 'inline-flex',
      alignItems: 'center',
      minHeight: '20px',
      border: `1px solid ${colors.borderNormal}`,
      borderRadius: radius.sm,
      padding: `0 ${spacing.sm}`,
      color: colors.steamBlue,
      background: colors.bgDrawer,
      fontSize: typography.tiny?.fontSize,
      lineHeight: typography.tiny?.lineHeight,
      fontWeight: typography.tiny?.fontWeight,
    },
    loadingText: {
      color: colors.steamBlue,
      fontSize: typography.caption?.fontSize,
      lineHeight: typography.caption?.lineHeight,
      textAlign: 'center',
    },
    mutedText: {
      color: colors.textMuted,
      fontSize: typography.caption?.fontSize,
      lineHeight: typography.caption?.lineHeight,
    },
    errorText: {
      color: colors.danger,
      fontSize: typography.caption?.fontSize,
      lineHeight: typography.caption?.lineHeight,
      textAlign: 'center',
    },
    tooltip: {
      position: 'fixed',
      maxWidth: '300px',
      border: `1px solid ${colors.steamBlue}`,
      borderRadius: radius.sm,
      padding: spacing.md,
      color: colors.white,
      background: colors.black,
      boxShadow: shadows.tooltip,
      fontSize: typography.caption?.fontSize,
      lineHeight: typography.caption?.lineHeight,
      pointerEvents: 'none',
      zIndex: zIndex.tooltip,
    },
    dialogSurface: {
      border: `1px solid ${colors.borderLight}`,
      borderRadius: radius.lg,
      color: colors.textPrimary,
      background: colors.bgCard,
      boxShadow: shadows.dialog,
    },
    focusRing: {
      outline: `2px solid ${colors.steamBlue}`,
      outlineOffset: '2px',
    },
  });

  root.STComponents = deepFreeze({
    version: COMPONENT_VERSION,
    applyStyles,
    appendContent,
    createStyledElement,
    templates,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
