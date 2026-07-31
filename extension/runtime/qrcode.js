/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 二维码生成封装
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const DEFAULTS = Object.freeze({
    level: "M",
    cellSize: 4,
    margin: 4,
    foreground: "#000",
    background: "#fff",
  });

  function factory() {
    if (globalThis.qrcode) {
      return globalThis.qrcode;
    }
    try {
      if (typeof qrcode === "function") {
        return qrcode;
      }
    } catch {
      return null;
    }
    return null;
  }

  function make(text, options = {}) {
    const create = factory();
    if (!create) {
      throw new Error("二维码库未加载");
    }

    const opts = { ...DEFAULTS, ...options };
    const qr = create(0, opts.level);
    qr.addData(String(text ?? ""));
    qr.make();
    return qr;
  }

  function svg(text, options) {
    const opts = { ...DEFAULTS, ...options };
    return make(text, opts).createSvgTag({
      cellSize: opts.cellSize,
      margin: opts.margin,
      scalable: true,
    });
  }

  function dataUrl(text, options) {
    const opts = { ...DEFAULTS, ...options };
    return make(text, opts).createDataURL(opts.cellSize, opts.margin);
  }

  function image(text, options = {}) {
    const img = document.createElement("img");
    img.alt = options.alt || "QR Code";
    img.decoding = "async";
    img.loading = "lazy";
    img.src = dataUrl(text, options);

    const size = options.size || options.width;
    if (size) {
      img.width = Number.parseInt(size, 10);
      img.height = Number.parseInt(size, 10);
    }

    return img;
  }

  globalThis.STQRCode = Object.freeze({
    make,
    svg,
    dataUrl,
    image,
  });
})();
