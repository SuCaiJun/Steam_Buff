/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店详情页数据展示价格图表
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const SVG_NS = "http://www.w3.org/2000/svg";
  const HEIGHT = 180;
  const PAD = Object.freeze({ top: 10, bottom: 40 });
  const MAX_X_LABELS = 6;
  const MIN_X_LABEL_GAP = 14;

  function text(value) {
    return String(value ?? "").trim();
  }

  function amountOf(price) {
    if (!price || typeof price !== "object") return null;
    const amountInt = Number(price.amountInt);
    if (Number.isFinite(amountInt)) return amountInt / 100;
    const amount = Number(price.amount);
    return Number.isFinite(amount) ? amount : null;
  }

  function timeOf(value) {
    const stamp = text(value);
    if (!stamp) return 0;
    const time = Date.parse(stamp);
    return Number.isFinite(time) ? time : 0;
  }

  function pointsFromEvents(events = []) {
    return (Array.isArray(events) ? events : [])
      .map(item => ({
        time: timeOf(item?.timestamp),
        amount: amountOf(item?.price),
        cut: Number(item?.cut) || 0,
        currency: text(item?.price?.currency),
      }))
      .filter(item => item.time > 0 && item.amount !== null && item.amount >= 0)
      .sort((left, right) => left.time - right.time);
  }

  function filterByMonths(points, months) {
    if (!months) return points;
    const minTime = Date.now() - months * 30 * 86400000;
    const out = points.filter(item => item.time >= minTime);
    return out.length ? out : points;
  }

  function dateLabel(time, full = false) {
    const date = new Date(time);
    const year = String(date.getFullYear());
    const shortYear = year.slice(-2).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    if (full) return `${year}-${month}-${day}`;
    return date.getFullYear() === new Date().getFullYear() ? `${month}-${day}` : `${shortYear}-${month}-${day}`;
  }

  function moneyText(amount, currency = "") {
    if (!Number.isFinite(Number(amount))) return "";
    if (api.format?.formatPrice && currency) {
      return api.format.formatPrice(Number(amount), currency);
    }
    return currency ? `${currency} ${amount}` : String(amount);
  }

  function svgEl(name, attrs = {}) {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attrs).forEach(([key, value]) => {
      node.setAttribute(key, String(value));
    });
    return node;
  }

  function createEmpty(message = "暂无历史价格数据") {
    const box = document.createElement("div");
    box.className = "st-data-display-chart st-data-display-chart--empty";
    box.textContent = message;
    return box;
  }

  function createSkeleton() {
    const box = document.createElement("div");
    box.className = "st-data-display-chart st-data-display-chart--loading";
    for (let index = 0; index < 8; index += 1) {
      const bar = document.createElement("span");
      bar.className = "st-data-display-chart__bar";
      bar.style.setProperty("--st-dd-bar", `${32 + ((index * 17) % 52)}%`);
      bar.style.setProperty("--st-dd-delay", `-${index * 110}ms`);
      box.appendChild(bar);
    }
    return box;
  }

  function range(values) {
    if (!values.length) return { min: 0, max: 1 };
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) {
      return { min: Math.max(0, min - 1), max: max + 1 };
    }
    return { min, max };
  }

  function yLabels(points) {
    const prices = range(points.map(item => item.amount));
    const out = [];
    for (let index = 0; index <= 4; index += 1) {
      out.push(Math.round(prices.max - ((prices.max - prices.min) * index / 4)));
    }
    return out;
  }

  function stepWidth(total) {
    return total > 0 ? 100 / total : 100;
  }

  function stepX(index, total) {
    return stepWidth(total) * index;
  }

  function xLabelPos(index, order, total, labelCount) {
    if (order === 0) return 0;
    if (order === labelCount - 1) return 100;
    return stepX(index + 0.5, total);
  }

  function spacedIndices(indices, total) {
    const out = [];
    indices.forEach((index) => {
      if (!out.length) {
        out.push(index);
        return;
      }
      const pos = xLabelPos(index, out.length, total, indices.length);
      const prevIndex = out[out.length - 1];
      const prevPos = xLabelPos(prevIndex, out.length - 1, total, indices.length);
      if (pos - prevPos >= MIN_X_LABEL_GAP || index === total - 1) {
        if (index === total - 1 && pos - prevPos < MIN_X_LABEL_GAP && out.length > 1) {
          out.pop();
        }
        out.push(index);
      }
    });
    return out;
  }

  function xLabelIndices(total) {
    if (total <= MAX_X_LABELS) {
      return Array.from({ length: total }, (_item, index) => index);
    }
    const last = total - 1;
    const indices = [];
    for (let order = 0; order < MAX_X_LABELS; order += 1) {
      const index = Math.round((last * order) / (MAX_X_LABELS - 1));
      if (indices[indices.length - 1] !== index) {
        indices.push(index);
      }
    }
    if (indices[0] !== 0) indices.unshift(0);
    if (indices[indices.length - 1] !== last) indices.push(last);
    return spacedIndices(indices, total);
  }

  function yPos(point, prices) {
    const height = HEIGHT - PAD.top - PAD.bottom;
    return PAD.top + height - ((point.amount - prices.min) / (prices.max - prices.min || 1)) * height;
  }

  function createGrid(svg) {
    const chartHeight = HEIGHT - PAD.top - PAD.bottom;
    for (let index = 0; index <= 4; index += 1) {
      const y = PAD.top + (chartHeight * index / 4);
      svg.appendChild(svgEl("line", {
        class: "st-data-display-chart__grid",
        x1: "0",
        y1: y.toFixed(1),
        x2: "100%",
        y2: y.toFixed(1),
      }));
    }
  }

  function appendStepLines(svg, points) {
    const prices = range(points.map(item => item.amount));
    points.forEach((point, index) => {
      const x = stepX(index, points.length);
      const nextX = stepX(index + 1, points.length);
      const y = yPos(point, prices);
      svg.appendChild(svgEl("line", {
        class: "st-data-display-chart__step",
        x1: `${x}%`,
        y1: y.toFixed(1),
        x2: `${nextX}%`,
        y2: y.toFixed(1),
      }));
      if (index < points.length - 1) {
        const nextY = yPos(points[index + 1], prices);
        svg.appendChild(svgEl("line", {
          class: "st-data-display-chart__step",
          x1: `${nextX}%`,
          y1: y.toFixed(1),
          x2: `${nextX}%`,
          y2: nextY.toFixed(1),
        }));
      }
    });
  }

  function appendTitles(svg, points) {
    const width = stepWidth(points.length);
    points.forEach((point, index) => {
      const rect = svgEl("rect", {
        class: "st-data-display-chart__hit",
        x: `${stepX(index, points.length)}%`,
        y: PAD.top,
        width: `${Math.max(width, 1)}%`,
        height: HEIGHT - PAD.top - PAD.bottom,
      });
      api.chartTooltip?.bindPointTooltip?.(rect, point, {
        date: item => dateLabel(item.time, true),
        price: item => moneyText(item.amount, item.currency),
        discount: item => (item.cut > 0 ? `折扣: -${item.cut}%` : ""),
        label: item => `${dateLabel(item.time, true)} ${moneyText(item.amount, item.currency)}${item.cut > 0 ? ` -${item.cut}%` : ""}`,
      });
      svg.appendChild(rect);
    });
  }

  function createXAxis(points) {
    const axis = document.createElement("div");
    axis.className = "st-data-display-chart__x-axis";
    const count = points.length;
    const indices = xLabelIndices(count);
    indices.forEach((index, order) => {
      const label = document.createElement("div");
      label.className = "st-data-display-chart__x-label";
      if (order === 0) {
        label.style.left = "0";
      } else if (order === indices.length - 1) {
        label.style.right = "0";
      } else {
        label.style.left = `${stepX(index + 0.5, count)}%`;
        label.style.transform = "translateX(-50%)";
      }
      label.textContent = dateLabel(points[index].time);
      axis.appendChild(label);
    });
    return axis;
  }

  function createYAxis(points) {
    const axis = document.createElement("div");
    axis.className = "st-data-display-chart__y-axis";
    yLabels(points).forEach((value) => {
      const label = document.createElement("div");
      label.className = "st-data-display-chart__y-label";
      label.textContent = String(value);
      axis.appendChild(label);
    });
    return axis;
  }

  // 旧版主图表是按历史价格点绘制阶梯线；这里只在详情页数据加载后执行一次，切换区间为 O(当前点数) 重绘。
  function createPriceChart(events = [], options = {}) {
    const allPoints = pointsFromEvents(events);
    const opts = options && typeof options === "object" ? options : {};
    const rawMonths = Object.prototype.hasOwnProperty.call(opts, "months") ? Number(opts.months) : 12;
    const months = Number.isFinite(rawMonths) ? rawMonths : 12;
    const points = filterByMonths(allPoints, months);
    if (!points.length) {
      return createEmpty();
    }

    const box = document.createElement("div");
    box.className = "st-data-display-chart";
    box.appendChild(createYAxis(points));

    const area = document.createElement("div");
    area.className = "st-data-display-chart__area";
    const svg = svgEl("svg", {
      class: "st-data-display-chart__svg",
      width: "100%",
      height: String(HEIGHT),
      role: "img",
      "aria-label": "历史价格走势图",
      preserveAspectRatio: "none",
    });
    createGrid(svg);
    appendStepLines(svg, points);
    appendTitles(svg, points);
    area.append(svg, createXAxis(points));
    box.appendChild(area);
    return box;
  }

  api.features = api.features || {};
  api.features.dataDisplayCharts = Object.freeze({
    createEmpty,
    createSkeleton,
    createPriceChart,
    pointsFromEvents,
  });
})();
