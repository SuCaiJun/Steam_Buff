/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 设置面板|更新日志安全渲染
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";

  if (root.STUpdateLogRenderer) {
    return;
  }

  function cleanText(text) {
    return String(text || "")
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ")
      .split("\n")
      .map(line => line.replace(/[ \t\f\v]+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  }

  function textOf(el) {
    return (el?.innerText || el?.textContent || "").trim();
  }

  function escHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeColor(el) {
    const color = String(el?.style?.color || "").trim();
    if (!color || color.length > 80 || /url|expression|var\s*\(/i.test(color)) {
      return "";
    }
    const probe = document.createElement("span");
    probe.style.color = "";
    probe.style.color = color;
    return probe.style.color ? color : "";
  }

  function copyColor(src, dst) {
    if (dst?.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    const color = safeColor(src);
    if (color) {
      dst.style.color = color;
    }
  }

  function copyInline(src, dst) {
    if (src.nodeType === Node.TEXT_NODE) {
      dst.appendChild(document.createTextNode(src.nodeValue || ""));
      return;
    }
    if (src.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    if (src.tagName === "BR") {
      dst.appendChild(document.createTextNode("\n"));
      return;
    }

    const tag = src.tagName.toLowerCase();
    const safeTag = tag === "b" ? "strong" : tag === "i" ? "em" : tag;
    const allow = safeTag === "strong" || safeTag === "em" || safeTag === "code";
    const out = allow
      ? document.createElement(safeTag)
      : (safeColor(src) ? document.createElement("span") : document.createDocumentFragment());
    copyColor(src, out);
    src.childNodes.forEach(child => copyInline(child, out));
    dst.appendChild(out);
  }

  function hasBlock(el) {
    return !!el?.querySelector?.("h1,h2,h3,h4,h5,h6,p,ul,ol,li");
  }

  function copyListItem(src, dst) {
    src.childNodes.forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName.toLowerCase();
        if (tag === "ul" || tag === "ol") {
          copyBlock(child, dst);
          return;
        }
      }
      copyInline(child, dst);
    });
  }

  function appendBlock(out, dst) {
    if (!textOf(out) && !out.querySelector?.("ul,ol")) {
      return;
    }
    dst.appendChild(out);
  }

  /* 更新日志块级重建 */
  function copyBlock(src, dst) {
    if (src.nodeType === Node.TEXT_NODE) {
      const text = cleanText(src.nodeValue || "");
      if (text) {
        const out = document.createElement("p");
        out.textContent = text;
        dst.appendChild(out);
      }
      return;
    }
    if (src.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const tag = src.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag) || tag === "p") {
      const out = document.createElement(tag);
      copyColor(src, out);
      src.childNodes.forEach(child => copyInline(child, out));
      appendBlock(out, dst);
      return;
    }
    if (tag === "ul" || tag === "ol") {
      const out = document.createElement(tag);
      copyColor(src, out);
      Array.from(src.children)
        .filter(child => child.tagName?.toLowerCase() === "li")
        .forEach(child => copyBlock(child, out));
      appendBlock(out, dst);
      return;
    }
    if (tag === "li") {
      const out = document.createElement("li");
      copyColor(src, out);
      copyListItem(src, out);
      appendBlock(out, dst);
      return;
    }

    src.childNodes.forEach(child => copyBlock(child, dst));
  }

  function blockHtml(el) {
    const box = document.createElement("div");
    el.childNodes.forEach(node => copyBlock(node, box));
    return box.innerHTML.trim();
  }

  function bodyText(el) {
    if (!el) {
      return "";
    }
    const clone = el.cloneNode(true);
    clone.querySelectorAll("script,style,button").forEach(node => node.remove());
    clone.querySelectorAll("br").forEach(node => node.replaceWith("\n"));
    const blocks = Array.from(clone.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li"))
      .map(textOf)
      .filter(Boolean);
    return cleanText(blocks.length ? blocks.join("\n") : textOf(clone));
  }

  function bodyHtml(el) {
    if (!el) {
      return "";
    }
    const clone = el.cloneNode(true);
    clone.querySelectorAll("script,style,button").forEach(node => node.remove());
    clone.querySelectorAll("br").forEach(node => node.replaceWith("\n"));
    if (hasBlock(clone)) {
      return blockHtml(clone);
    }
    return escHtml(bodyText(clone));
  }

  function contentHtml(text) {
    const raw = String(text || "").trim();
    if (!raw) {
      return "";
    }
    try {
      const dom = new DOMParser().parseFromString(raw, "text/html");
      return bodyHtml(dom.body);
    } catch {
      return escHtml(cleanText(raw));
    }
  }

  function contentText(text) {
    const raw = String(text || "").trim();
    if (!raw) {
      return "";
    }
    try {
      const dom = new DOMParser().parseFromString(raw, "text/html");
      return bodyText(dom.body);
    } catch {
      return cleanText(raw.replace(/<[^>]+>/g, " "));
    }
  }

  root.STUpdateLogRenderer = Object.freeze({
    cleanText,
    contentHtml,
    contentText,
  });
})(typeof globalThis !== "undefined" ? globalThis : window);
