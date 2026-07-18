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

  const COMPONENT_VERSION = 'steam-buff-components-v2';

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

  /**
   * 注入或更新样式节点，避免各功能重复维护 style 创建逻辑。
   * @param {string} id - 样式节点 ID。
   * @param {string} cssText - 样式文本。
   * @param {HTMLElement} target - 样式挂载目标。
   * @returns {HTMLStyleElement|null} 样式节点。
   */
  function ensureStyle(id, cssText = '', target = null) {
    const doc = root.document || document;
    if (!id || !doc?.createElement) {
      return null;
    }

    let style = doc.getElementById?.(id) || null;
    if (!style) {
      style = doc.createElement('style');
      style.id = String(id);
      const host = target || doc.head || doc.documentElement;
      host?.appendChild?.(style);
    }

    const nextText = String(cssText || '');
    if (style.textContent !== nextText) {
      style.textContent = nextText;
    }
    return style;
  }

  const STYLE_BLOCK_DEFAULTS = deepFreeze({
    surfaceCard: {
      prefix: '--st-surface-card',
      margin: 'var(--st-spacing-sm) 0',
      padding: 'var(--st-spacing-md)',
      background: 'var(--st-color-surface-inset-hover)',
      radius: 'var(--st-radius-sm)',
    },
    progress: {
      prefix: '--st-progress',
      height: 'var(--st-spacing-sm)',
      background: 'var(--st-color-surface-subtle-hover)',
      fillBackground: 'var(--st-color-steam-blue)',
      radius: 'var(--st-radius-sm)',
      marginTop: 'var(--st-spacing-xs)',
    },
    notice: {
      prefix: '--st-notice',
      margin: 'var(--st-spacing-sm) 0',
      padding: 'var(--st-spacing-md)',
      color: 'var(--st-color-text-secondary)',
      background: 'var(--st-color-primary-surface)',
      accent: 'var(--st-color-steam-blue)',
      borderWidth: 'var(--st-spacing-xs)',
      radius: 'var(--st-radius-sm)',
      titleWeight: 'var(--st-font-weight-semibold)',
      titleMargin: 'var(--st-spacing-xs)',
    },
    badge: {
      prefix: '--st-badge',
      display: 'inline-flex',
      alignItems: 'center',
      minHeight: '18px',
      padding: '0 var(--st-spacing-sm)',
      radius: 'var(--st-radius-sm)',
      color: 'var(--st-color-white)',
      background: 'var(--st-color-success)',
      fontSize: 'var(--st-font-size-tiny)',
      lineHeight: 'var(--st-line-height-tiny)',
      fontWeight: 'var(--st-font-weight-semibold)',
      shadow: 'var(--st-shadow-control-badge)',
    },
  });

  const DIALOG_VARIANTS = deepFreeze({
    shell: {
      width: 'min(880px, calc(100vw - 40px))',
      maxHeight: 'calc(100vh - 80px)',
      layerAlign: 'center',
      layerPadding: '40px 20px',
      surfaceBackground: 'var(--st-dialog-surface)',
      surfaceShadow: 'var(--st-dialog-panel-shadow)',
      headerHeight: 'var(--st-dialog-shell-header-height)',
      headerPadding: '0 20px',
      bodyPadding: '0',
      surfaceTransform: 'scale(.97)',
    },
    standard: {
      width: 'min(420px, calc(100vw - 32px))',
      maxHeight: 'calc(100vh - 40px)',
      layerAlign: 'flex-start',
      layerPadding: '74px 20px 20px',
      surfaceBackground: 'var(--st-dialog-surface-raised)',
      surfaceShadow: 'var(--st-dialog-shadow)',
      headerHeight: 'var(--st-dialog-header-height)',
      headerPadding: '0 16px 0 20px',
      bodyPadding: 'var(--st-dialog-body-padding)',
      surfaceTransform: 'translateY(-8px)',
    },
    content: {
      width: 'min(520px, calc(100vw - 32px))',
      maxHeight: 'calc(100vh - 40px)',
      layerAlign: 'flex-start',
      layerPadding: 'max(56px, 8vh) 20px 20px',
      surfaceBackground: 'var(--st-dialog-surface-raised)',
      surfaceShadow: 'var(--st-dialog-shadow)',
      headerHeight: 'var(--st-dialog-header-height)',
      headerPadding: '0 16px 0 20px',
      bodyPadding: 'var(--st-dialog-body-padding)',
      surfaceTransform: 'translateY(-8px)',
    },
    data: {
      width: 'min(880px, calc(100vw - 48px))',
      maxHeight: 'calc(100vh - 48px)',
      layerAlign: 'center',
      layerPadding: '24px',
      surfaceBackground: 'var(--st-dialog-surface)',
      surfaceShadow: 'var(--st-dialog-panel-shadow)',
      headerHeight: 'var(--st-dialog-data-header-height)',
      headerPadding: '0 16px',
      bodyPadding: 'var(--st-dialog-body-padding-compact)',
      surfaceTransform: 'translateY(-8px)',
    },
    progress: {
      width: 'min(420px, calc(100vw - 48px))',
      maxHeight: 'calc(100vh - 48px)',
      layerAlign: 'center',
      layerPadding: '24px',
      surfaceBackground: 'var(--st-dialog-surface)',
      surfaceShadow: 'var(--st-dialog-panel-shadow)',
      headerHeight: 'var(--st-dialog-header-height)',
      headerPadding: '0 20px',
      bodyPadding: 'var(--st-dialog-body-padding)',
      surfaceTransform: 'translateY(-8px)',
    },
  });

  const BUTTON_VARIANTS = deepFreeze({
    secondary: {
      border: '1px solid var(--st-dialog-border)',
      color: 'var(--st-dialog-text-color)',
      background: 'var(--st-dialog-secondary-bg)',
      hoverBorder: 'var(--st-dialog-border-hover)',
      hoverBackground: 'var(--st-dialog-secondary-bg-hover)',
      shadow: 'none',
    },
    primary: {
      border: '1px solid transparent',
      color: 'var(--st-color-white)',
      background: 'var(--st-dialog-primary-bg)',
      hoverBorder: 'transparent',
      hoverBackground: 'var(--st-dialog-primary-bg)',
      shadow: 'var(--st-dialog-primary-shadow)',
    },
    danger: {
      border: '1px solid var(--st-color-alert-danger-alpha-45)',
      color: 'var(--st-color-danger-text)',
      background: 'var(--st-color-danger-alpha-72)',
      hoverBorder: 'var(--st-color-danger)',
      hoverBackground: 'var(--st-color-danger-soft-alpha-72)',
      shadow: 'none',
    },
    ghost: {
      border: '1px solid transparent',
      color: 'var(--st-dialog-muted-color)',
      background: 'transparent',
      hoverBorder: 'transparent',
      hoverBackground: 'var(--st-dialog-secondary-bg-hover)',
      shadow: 'none',
    },
  });

  function styleOptions(name, options = {}) {
    const defaults = STYLE_BLOCK_DEFAULTS[name] || {};
    return {
      ...defaults,
      ...options,
      prefix: options.prefix || defaults.prefix,
    };
  }

  function cssVar(prefix, name, fallback) {
    return `var(${prefix}-${name}, ${fallback})`;
  }

  function selectorList(selectors) {
    return selectorItems(selectors)
      .map((selector) => String(selector || '').trim())
      .filter(Boolean)
      .join(',\n');
  }

  function selectorItems(selectors) {
    return (Array.isArray(selectors) ? selectors : [selectors])
      .flat(Infinity)
      .map((selector) => String(selector || '').trim())
      .filter(Boolean);
  }

  function withSuffix(selectors, suffix) {
    return selectorItems(selectors).map((selector) => `${selector}${suffix}`);
  }

  function normalizeDeclaration(line) {
    const text = String(line || '').trim();
    if (!text) {
      return '';
    }
    return text.endsWith(';') ? text : `${text};`;
  }

  function declarationsFromObject(declarations = {}) {
    return Object.entries(declarations)
      .map(([name, value]) => {
        if (value === null || value === undefined || value === '') {
          return '';
        }
        return `${name}: ${value}`;
      })
      .filter(Boolean);
  }

  function buildRule(selectors, declarations = []) {
    const selector = selectorList(selectors);
    const lines = (Array.isArray(declarations) ? declarations : declarationsFromObject(declarations))
      .map(normalizeDeclaration)
      .filter(Boolean);

    if (!selector || !lines.length) {
      return '';
    }

    return `${selector} {\n${lines.map((line) => `  ${line}`).join('\n')}\n}`;
  }

  function composeCss(...blocks) {
    return blocks
      .flat(Infinity)
      .map((block) => String(block || '').trim())
      .filter(Boolean)
      .join('\n\n');
  }

  function variableRule(selectors, variables = {}) {
    return buildRule(selectors, variables);
  }

  function dialogCss(options = {}) {
    const variant = {
      ...(DIALOG_VARIANTS[options.variant] || DIALOG_VARIANTS.standard),
      ...options,
    };
    const layer = options.layerSelectors;
    const surface = options.surfaceSelectors;
    const close = options.closeSelectors;
    const motionSelectors = selectorItems([layer, surface]);
    const surfaceRules = [
      `width: ${variant.width}`,
      `max-height: ${variant.maxHeight}`,
      'border: 1px solid var(--st-dialog-border)',
      'border-radius: var(--st-dialog-radius)',
      'color: var(--st-dialog-text-color)',
      `background: ${variant.surfaceBackground}`,
      `box-shadow: ${variant.surfaceShadow}`,
      'overflow: hidden',
      `transform: ${variant.surfaceTransform}`,
      'transition: transform var(--st-motion-fast)',
    ];
    if (variant.surfacePadding !== null && variant.surfacePadding !== undefined) {
      surfaceRules.push(`padding: ${variant.surfacePadding}`);
    }

    return composeCss(
      buildRule(layer, [
        `position: ${variant.layerPosition || 'fixed'}`,
        'inset: 0',
        `z-index: ${variant.layerZIndex || 'var(--st-z-index-dialog)'}`,
        'display: flex',
        `align-items: ${variant.layerAlign}`,
        'justify-content: center',
        'box-sizing: border-box',
        `padding: ${variant.layerPadding}`,
        'background: var(--st-dialog-overlay-bg)',
        'opacity: 0',
        'pointer-events: none',
        'transition: opacity var(--st-motion-fast)',
      ]),
      buildRule(options.openLayerSelectors, [
        'opacity: 1',
        'pointer-events: auto',
      ]),
      buildRule(surface, surfaceRules),
      buildRule(options.openSurfaceSelectors, [
        'transform: none',
      ]),
      buildRule(options.headerSelectors, [
        `min-height: ${variant.headerHeight}`,
        `padding: ${variant.headerPadding}`,
        'display: flex',
        'align-items: center',
        'justify-content: space-between',
        'gap: var(--st-dialog-gap)',
        'border-bottom: 1px solid var(--st-dialog-divider)',
        'background: var(--st-dialog-header-bg)',
      ]),
      buildRule(options.titleSelectors, [
        'margin: 0',
        'color: var(--st-dialog-title-color)',
        'font-size: var(--st-font-size-dialog-title)',
        'font-weight: var(--st-font-weight-semibold)',
        'line-height: var(--st-line-height-body)',
      ]),
      buildRule(close, [
        'position: relative',
        'flex: 0 0 auto',
        'width: var(--st-control-height-compact)',
        'height: var(--st-control-height-compact)',
        'border: 0',
        'border-radius: var(--st-control-radius)',
        'padding: 0',
        'color: var(--st-dialog-muted-color)',
        'background: transparent',
        'cursor: pointer',
        'font-size: 0',
        'line-height: 0',
      ]),
      buildRule(withSuffix(close, '::before'), [
        'content: ""',
        'position: absolute',
        'left: 50%',
        'top: 50%',
        'width: 12px',
        'height: 1px',
        'border-radius: 1px',
        'background: currentColor',
        'transform: translate(-50%, -50%) rotate(45deg)',
      ]),
      buildRule(withSuffix(close, '::after'), [
        'content: ""',
        'position: absolute',
        'left: 50%',
        'top: 50%',
        'width: 12px',
        'height: 1px',
        'border-radius: 1px',
        'background: currentColor',
        'transform: translate(-50%, -50%) rotate(-45deg)',
      ]),
      buildRule([
        ...withSuffix(close, ':hover'),
        ...withSuffix(close, ':focus-visible'),
      ], [
        'color: var(--st-dialog-text-color)',
        'background: var(--st-dialog-secondary-bg-hover)',
        'outline: none',
      ]),
      buildRule(withSuffix(close, ':focus-visible'), [
        'box-shadow: var(--st-control-focus-shadow)',
      ]),
      buildRule(options.bodySelectors, [
        'min-height: 0',
        `padding: ${variant.bodyPadding}`,
        'color: var(--st-dialog-text-color)',
      ]),
      buildRule(options.footerSelectors, [
        'padding: var(--st-dialog-body-padding)',
        'display: flex',
        'align-items: center',
        'justify-content: flex-end',
        'flex-wrap: wrap',
        'gap: var(--st-dialog-gap)',
      ]),
      motionSelectors.length ? `@media (prefers-reduced-motion: reduce) {\n${buildRule(motionSelectors, ['transition: none'])}\n}` : ''
    );
  }

  function buttonCss(selectors, options = {}) {
    const variant = BUTTON_VARIANTS[options.variant] || BUTTON_VARIANTS.secondary;
    const compact = options.density === 'compact';
    const height = compact ? 'var(--st-control-height-compact)' : 'var(--st-control-height-regular)';
    const padding = options.padding || (compact ? '0 var(--st-spacing-md)' : '0 var(--st-spacing-lg)');
    const fontSize = compact ? 'var(--st-font-size-caption)' : 'var(--st-font-size-body-small)';
    const minWidth = options.minWidth ? `min-width: ${options.minWidth}` : '';

    return composeCss(
      buildRule(selectors, [
        `height: ${height}`,
        minWidth,
        `border: ${variant.border}`,
        'border-radius: var(--st-control-radius)',
        `padding: ${padding}`,
        'display: inline-flex',
        'align-items: center',
        'justify-content: center',
        'gap: var(--st-spacing-xs)',
        `color: ${variant.color}`,
        `background: ${variant.background}`,
        `box-shadow: ${variant.shadow}`,
        'font-family: inherit',
        `font-size: ${fontSize}`,
        'font-weight: var(--st-font-weight-medium)',
        'line-height: 1',
        'white-space: nowrap',
        'cursor: pointer',
        'transition: filter var(--st-motion-fast), background-color var(--st-motion-fast), border-color var(--st-motion-fast), box-shadow var(--st-motion-fast)',
      ]),
      buildRule(withSuffix(selectors, ':hover:not(:disabled)'), [
        `border-color: ${variant.hoverBorder}`,
        `background: ${variant.hoverBackground}`,
        options.variant === 'primary' ? 'filter: brightness(1.1)' : '',
      ]),
      buildRule(withSuffix(selectors, ':focus-visible'), [
        'outline: none',
        'border-color: var(--st-color-primary)',
        'box-shadow: var(--st-control-focus-shadow)',
      ]),
      buildRule(withSuffix(selectors, ':disabled'), [
        'color: var(--st-color-text-disabled)',
        'border-color: var(--st-color-border-normal)',
        'background: var(--st-color-surface-disabled)',
        'box-shadow: none',
        'filter: none',
        'cursor: not-allowed',
      ]),
      buildRule(withSuffix(selectors, '[aria-busy="true"]'), [
        'pointer-events: none',
        'cursor: progress',
      ])
    );
  }

  function fieldCss(selectors, options = {}) {
    const compact = options.density === 'compact';
    const height = compact ? 'var(--st-control-height-compact)' : 'var(--st-control-height-regular)';
    const padding = options.padding || (compact ? '0 var(--st-spacing-sm)' : '0 var(--st-spacing-md)');
    const fontSize = compact ? 'var(--st-font-size-caption)' : 'var(--st-font-size-body-small)';

    return composeCss(
      buildRule(selectors, [
        `height: ${height}`,
        'border: 1px solid var(--st-dialog-border)',
        'border-radius: var(--st-control-radius)',
        `padding: ${padding}`,
        'color: var(--st-dialog-text-color)',
        'background: var(--st-dialog-surface-inset)',
        'font-family: inherit',
        `font-size: ${fontSize}`,
        'outline: none',
        'transition: border-color var(--st-motion-fast), background-color var(--st-motion-fast), box-shadow var(--st-motion-fast)',
      ]),
      buildRule(withSuffix(selectors, ':focus'), [
        'border-color: var(--st-color-primary)',
        'box-shadow: var(--st-control-focus-shadow)',
      ]),
      buildRule(withSuffix(selectors, ':disabled'), [
        'color: var(--st-color-text-disabled)',
        'border-color: var(--st-color-border-normal)',
        'background: var(--st-color-surface-disabled)',
        'cursor: not-allowed',
      ])
    );
  }

  function surfaceCardCss(selectors, options = {}) {
    const settings = styleOptions('surfaceCard', options);
    return buildRule(selectors, [
      `margin: ${cssVar(settings.prefix, 'margin', settings.margin)}`,
      `padding: ${cssVar(settings.prefix, 'padding', settings.padding)}`,
      `background-color: ${cssVar(settings.prefix, 'bg', settings.background)}`,
      `border-radius: ${cssVar(settings.prefix, 'radius', settings.radius)}`,
    ]);
  }

  function progressCss(options = {}) {
    const settings = styleOptions('progress', options);
    return composeCss(
      buildRule(options.trackSelectors || options.selectors, [
        'width: 100%',
        `height: ${cssVar(settings.prefix, 'height', settings.height)}`,
        `background-color: ${cssVar(settings.prefix, 'bg', settings.background)}`,
        `border-radius: ${cssVar(settings.prefix, 'radius', settings.radius)}`,
        'overflow: hidden',
        `margin-top: ${cssVar(settings.prefix, 'margin-top', settings.marginTop)}`,
      ]),
      buildRule(options.fillSelectors, [
        'height: 100%',
        `background-color: ${cssVar(settings.prefix, 'fill-bg', settings.fillBackground)}`,
        `border-radius: ${cssVar(settings.prefix, 'radius', settings.radius)}`,
      ])
    );
  }

  function noticeCss(options = {}) {
    const settings = styleOptions('notice', options);
    return composeCss(
      buildRule(options.rootSelectors || options.selectors, [
        `margin: ${cssVar(settings.prefix, 'margin', settings.margin)}`,
        `padding: ${cssVar(settings.prefix, 'padding', settings.padding)}`,
        `color: ${cssVar(settings.prefix, 'text', settings.color)}`,
        `background-color: ${cssVar(settings.prefix, 'bg', settings.background)}`,
        `border-left: ${cssVar(settings.prefix, 'border-width', settings.borderWidth)} solid ${cssVar(settings.prefix, 'accent', settings.accent)}`,
        `border-radius: ${cssVar(settings.prefix, 'radius', settings.radius)}`,
      ]),
      buildRule(options.titleSelectors, [
        `font-weight: ${settings.titleWeight}`,
        `color: ${cssVar(settings.prefix, 'title-color', cssVar(settings.prefix, 'accent', settings.accent))}`,
        `margin-bottom: ${cssVar(settings.prefix, 'title-margin', settings.titleMargin)}`,
      ])
    );
  }

  function badgeCss(selectors, options = {}) {
    const settings = styleOptions('badge', options);
    const declarations = [
      `display: ${settings.display}`,
    ];

    if (settings.alignItems !== null) {
      declarations.push(`align-items: ${settings.alignItems}`);
    }
    if (settings.minHeight !== null) {
      declarations.push(`min-height: ${cssVar(settings.prefix, 'min-height', settings.minHeight)}`);
    }

    declarations.push(
      `padding: ${cssVar(settings.prefix, 'padding', settings.padding)}`,
      `border-radius: ${cssVar(settings.prefix, 'radius', settings.radius)}`,
      `color: ${cssVar(settings.prefix, 'color', settings.color)}`,
      `background: ${cssVar(settings.prefix, 'bg', settings.background)}`,
      `font-size: ${cssVar(settings.prefix, 'font-size', settings.fontSize)}`,
      `line-height: ${cssVar(settings.prefix, 'line-height', settings.lineHeight)}`,
      `font-weight: ${settings.fontWeight}`,
      `box-shadow: ${cssVar(settings.prefix, 'shadow', settings.shadow)}`,
      'white-space: nowrap'
    );

    return buildRule(selectors, declarations);
  }

  function surfaceCardTemplate(options = {}) {
    const settings = styleOptions('surfaceCard', options);
    return {
      margin: cssVar(settings.prefix, 'margin', settings.margin),
      padding: cssVar(settings.prefix, 'padding', settings.padding),
      backgroundColor: cssVar(settings.prefix, 'bg', settings.background),
      borderRadius: cssVar(settings.prefix, 'radius', settings.radius),
    };
  }

  function progressTrackTemplate(options = {}) {
    const settings = styleOptions('progress', options);
    return {
      width: '100%',
      height: cssVar(settings.prefix, 'height', settings.height),
      backgroundColor: cssVar(settings.prefix, 'bg', settings.background),
      borderRadius: cssVar(settings.prefix, 'radius', settings.radius),
      overflow: 'hidden',
      marginTop: cssVar(settings.prefix, 'margin-top', settings.marginTop),
    };
  }

  function progressFillTemplate(options = {}) {
    const settings = styleOptions('progress', options);
    return {
      height: '100%',
      backgroundColor: cssVar(settings.prefix, 'fill-bg', settings.fillBackground),
      borderRadius: cssVar(settings.prefix, 'radius', settings.radius),
    };
  }

  function noticeTemplate(options = {}) {
    const settings = styleOptions('notice', options);
    return {
      margin: cssVar(settings.prefix, 'margin', settings.margin),
      padding: cssVar(settings.prefix, 'padding', settings.padding),
      color: cssVar(settings.prefix, 'text', settings.color),
      backgroundColor: cssVar(settings.prefix, 'bg', settings.background),
      borderLeft: `${cssVar(settings.prefix, 'border-width', settings.borderWidth)} solid ${cssVar(settings.prefix, 'accent', settings.accent)}`,
      borderRadius: cssVar(settings.prefix, 'radius', settings.radius),
    };
  }

  function noticeTitleTemplate(options = {}) {
    const settings = styleOptions('notice', options);
    return {
      marginBottom: cssVar(settings.prefix, 'title-margin', settings.titleMargin),
      color: cssVar(settings.prefix, 'title-color', cssVar(settings.prefix, 'accent', settings.accent)),
      fontWeight: settings.titleWeight,
    };
  }

  function badgeTemplate(options = {}) {
    const settings = styleOptions('badge', options);
    const template = {
      display: settings.display,
      padding: cssVar(settings.prefix, 'padding', settings.padding),
      borderRadius: cssVar(settings.prefix, 'radius', settings.radius),
      color: cssVar(settings.prefix, 'color', settings.color),
      background: cssVar(settings.prefix, 'bg', settings.background),
      fontSize: cssVar(settings.prefix, 'font-size', settings.fontSize),
      lineHeight: cssVar(settings.prefix, 'line-height', settings.lineHeight),
      fontWeight: settings.fontWeight,
      boxShadow: cssVar(settings.prefix, 'shadow', settings.shadow),
      whiteSpace: 'nowrap',
    };
    if (settings.alignItems !== null) {
      template.alignItems = settings.alignItems;
    }
    if (settings.minHeight !== null) {
      template.minHeight = cssVar(settings.prefix, 'min-height', settings.minHeight);
    }
    return template;
  }

  const css = deepFreeze({
    compose: composeCss,
    rule: buildRule,
    variables: variableRule,
    dialog: dialogCss,
    button: buttonCss,
    field: fieldCss,
    surfaceCard: surfaceCardCss,
    progress: progressCss,
    notice: noticeCss,
    badge: badgeCss,
  });

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
    surfaceCard: surfaceCardTemplate(),
    notice: noticeTemplate(),
    noticeTitle: noticeTitleTemplate(),
    statusBadge: badgeTemplate(),
    progressTrack: progressTrackTemplate(),
    progressFill: progressFillTemplate(),
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
      ...badgeTemplate({
        minHeight: '20px',
        color: colors.steamBlue,
        background: colors.bgDrawer,
        fontWeight: typography.tiny?.fontWeight,
        shadow: 'none',
      }),
      border: `1px solid ${colors.borderNormal}`,
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
    ensureStyle,
    css,
    templates,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
