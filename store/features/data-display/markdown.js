/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : AI 对话 Markdown 安全渲染
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const root = window;
  const api = root.STStore;
  if (!api) return;

  const ALLOWED_TAGS = Object.freeze([
    "p", "br", "hr",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "em", "s", "blockquote",
    "ul", "ol", "li",
    "code", "pre",
    "table", "thead", "tbody", "tr", "th", "td",
    "a",
  ]);
  const ALLOWED_ATTR = Object.freeze(["href", "title"]);
  const SAFE_LINK_PROTOCOL = /^https?:\/\//i;
  const externalNavigation = root.STConfig?.externalNavigation;
  const log = root.STLoggerFactory?.createLogger?.("store", "ai-markdown");
  let parser = null;
  let errorReported = false;

  function reportErrorOnce(error) {
    if (errorReported) return;
    errorReported = true;
    log?.error?.("ai-markdown-render-failed", "AI Markdown 渲染不可用，已退回纯文本", {
      errorCode: error?.code || error?.name || "AI_MARKDOWN_RENDER_FAILED",
      error,
    });
  }

  function markdownParser() {
    if (parser) return parser;
    if (typeof root.markdownit !== "function") {
      throw new Error("markdown-it 未加载");
    }
    parser = root.markdownit({
      html: false,
      linkify: false,
      breaks: true,
      typographer: false,
    });
    // 注: 图片语法不进入 HTML，避免 AI 回复触发任何外部图片请求。
    parser.disable(["image"]);
    const defaultLinkOpen = parser.renderer.rules.link_open;
    parser.renderer.rules.link_open = (tokens, index, options, env, self) => {
      const token = tokens[index];
      const hrefIndex = token.attrIndex("href");
      const href = hrefIndex >= 0 ? String(token.attrs[hrefIndex][1] || "") : "";
      if (!SAFE_LINK_PROTOCOL.test(href)) {
        if (hrefIndex >= 0) token.attrs.splice(hrefIndex, 1);
      }
      return defaultLinkOpen
        ? defaultLinkOpen(tokens, index, options, env, self)
        : self.renderToken(tokens, index, options);
    };
    return parser;
  }

  function sanitizedHtml(value) {
    if (typeof root.DOMPurify?.sanitize !== "function") {
      throw new Error("DOMPurify 未加载");
    }
    const dirty = markdownParser().render(String(value ?? ""));
    return root.DOMPurify.sanitize(dirty, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_ARIA_ATTR: false,
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ["img", "iframe", "svg", "style", "script"],
      FORBID_ATTR: ["src", "srcset", "style"],
      ALLOWED_URI_REGEXP: SAFE_LINK_PROTOCOL,
    });
  }

  function renderInto(element, value) {
    if (!element) return false;
    const source = String(value ?? "");
    try {
      const dom = root.STDomUtils;
      if (typeof dom?.trustedHTML !== "function" || typeof dom?.setTrustedHTML !== "function") {
        throw new Error("STDomUtils 可信 HTML 能力未加载");
      }
      if (typeof externalNavigation?.applyToLink !== "function") {
        throw new Error("外部链接导航能力未加载");
      }
      const clean = sanitizedHtml(source);
      dom.setTrustedHTML(element, dom.trustedHTML(clean, "ai-markdown-dompurify-sanitized"));
      element.querySelectorAll("a[href]").forEach(link => {
        externalNavigation.applyToLink(link, link.href);
      });
      return true;
    } catch (error) {
      element.textContent = source;
      reportErrorOnce(error);
      return false;
    }
  }

  api.features = api.features || {};
  api.features.dataDisplayMarkdown = Object.freeze({ renderInto });
})();
