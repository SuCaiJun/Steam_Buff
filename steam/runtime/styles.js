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
  const THEME = root.STTheme;
  const colors = THEME?.colors || {};
  const spacing = THEME?.spacing || {};
  const typography = THEME?.typography || {};
  const fontWeights = THEME?.fontWeights || {};
  const radius = THEME?.radius || {};
  const transitions = THEME?.transitions || {};
  const shadows = THEME?.shadows || {};

  function gradient(direction, start, end) {
    if (!start || !end) {
      return undefined;
    }
    return `linear-gradient(${direction}, ${start} 0%, ${end} 100%)`;
  }

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

  function appendContent(element, content) {
    if (content === null || content === undefined || content === false) {
      return element;
    }

    const items = Array.isArray(content) ? content.flat(Infinity) : [content];
    items.forEach((item) => {
      if (item === null || item === undefined || item === false) {
        return;
      }
      if (item?.nodeType) {
        element.appendChild(item);
        return;
      }
      element.appendChild(document.createTextNode(String(item)));
    });
    return element;
  }

  function createStyledElement(tag, styles = {}, content) {
    const element = document.createElement(tag || 'div');
    applyStyles(element, styles);
    return appendContent(element, content);
  }

  const templates = Object.freeze({
    moduleContainer: Object.freeze({
      margin: `${spacing.sm} 0`,
      fontFamily: typography.fontFamily,
      color: colors.textPrimary,
    }),
    moduleContent: Object.freeze({
      padding: spacing.md,
      color: colors.textSecondary,
      background: colors.bgCard,
      border: `1px solid ${colors.borderLight}`,
      borderRadius: radius.lg,
    }),
    moduleTitle: Object.freeze({
      margin: `0 0 ${spacing.sm}`,
      color: colors.textPrimary,
      fontSize: typography.body?.fontSize,
      lineHeight: typography.body?.lineHeight,
      fontWeight: fontWeights.medium,
    }),
    moduleDescription: Object.freeze({
      margin: '0',
      color: colors.textMuted,
      fontSize: typography.caption?.fontSize,
      lineHeight: typography.caption?.lineHeight,
      fontWeight: typography.caption?.fontWeight,
    }),
    inlineRow: Object.freeze({
      display: 'flex',
      alignItems: 'center',
      gap: spacing.sm,
    }),
    stack: Object.freeze({
      display: 'flex',
      flexDirection: 'column',
      gap: spacing.sm,
    }),
    primaryButton: Object.freeze({
      minHeight: '32px',
      border: 'none',
      borderRadius: radius.md,
      padding: `0 ${spacing.lg}`,
      color: colors.white,
      background: gradient('180deg', colors.primary, colors.primaryDark),
      boxShadow: shadows.buttonPrimary,
      fontSize: typography.bodySmall?.fontSize,
      fontWeight: fontWeights.medium,
      cursor: 'pointer',
      transition: `filter ${transitions.fast}`,
    }),
    secondaryButton: Object.freeze({
      minHeight: '32px',
      border: `1px solid ${colors.borderNormal}`,
      borderRadius: radius.md,
      padding: `0 ${spacing.lg}`,
      color: colors.textPrimary,
      background: colors.bgInput,
      fontSize: typography.bodySmall?.fontSize,
      fontWeight: fontWeights.medium,
      cursor: 'pointer',
      transition: `background ${transitions.fast}, border-color ${transitions.fast}`,
    }),
    input: Object.freeze({
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
    }),
    badge: Object.freeze({
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
    }),
    loadingText: Object.freeze({
      color: colors.steamBlue,
      fontSize: typography.caption?.fontSize,
      lineHeight: typography.caption?.lineHeight,
      textAlign: 'center',
    }),
    mutedText: Object.freeze({
      color: colors.textMuted,
      fontSize: typography.caption?.fontSize,
      lineHeight: typography.caption?.lineHeight,
    }),
    errorText: Object.freeze({
      color: colors.danger,
      fontSize: typography.caption?.fontSize,
      lineHeight: typography.caption?.lineHeight,
      textAlign: 'center',
    }),
    tooltip: Object.freeze({
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
      zIndex: '1000001',
    }),
  });

  api.styles = Object.freeze({
    applyStyles,
    createStyledElement,
    templates,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
