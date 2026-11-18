/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 触发器日程校验与本机时间计算
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

((root) => {
  "use strict";
  const MINUTE = 60_000, DAY = 1440 * MINUTE;
  const MAX_DATE = new Date(9999, 11, 31, 23, 59, 59, 999).getTime();
  const clock = (date) => date.getHours() * 60 + date.getMinutes();
  const pad = (n) => String(n).padStart(2, "0");
  const dateKey = (date) => String(date.getFullYear()).padStart(4, "0") + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  const dayOf = (at) => { const day = new Date(at); day.setHours(0, 0, 0, 0); return day; };
  const tomorrow = (day) => { const next = new Date(day); next.setDate(day.getDate() + 1); return dayOf(next); };

  function integer(n, min, max, message) {
    if (!Number.isSafeInteger(n) || n < min || n > max) throw new TypeError(message);
    return n;
  }
  function minuteOfDay(value) {
    if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new TypeError("请选择有效的时间");
    return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  }
  function calendarDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError("请选择有效的日历日期");
    const date = new Date(value + "T12:00");
    if (!Number.isFinite(date.getTime()) || dateKey(date) !== value) throw new TypeError("请选择有效的日历日期");
    return dayOf(date);
  }
  function endTime(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new TypeError("请选择定时结束的日期和时间");
    const day = calendarDate(value.slice(0, 10)), minute = minuteOfDay(value.slice(11));
    const at = day.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
    if (clock(day) !== minute) throw new TypeError("所选日期不存在这个本地时间");
    return at;
  }
  function allowedClock(window, minute) {
    if (!window) return true;
    const [start, end] = window;
    return start < end ? minute >= start && minute < end : minute >= start || minute < end;
  }
  function parseWindow(window) {
    if (window === undefined) return null;
    const start = minuteOfDay(window?.start), end = minuteOfDay(window?.end);
    if (start === end) throw new TypeError("每天起止时间不能相同");
    return [start, end];
  }

  function cronPart(value, min, max) {
    const out = new Set(), width = max - min + 1;
    for (const term of value.split(",")) {
      const match = /^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/.exec(term);
      if (!match || (match[1] === "*" && match[2])) throw new TypeError("Cron 时间表达式格式无效");
      const first = match[1] === "*" ? min : Number(match[1]);
      const last = match[2] ? Number(match[2]) : match[1] === "*" ? max : first;
      const step = match[3] ? Number(match[3]) : 1;
      if (!Number.isSafeInteger(step) || step < 1 || step > width || first < min || last > max || first > last)
        throw new TypeError("Cron 时间表达式的数值超出范围");
      for (let n = first; n <= last; n += step) out.add(n);
    }
    return out;
  }
  function cron(value) {
    const parts = typeof value === "string" ? value.trim().split(/\s+/) : [];
    if (parts.length !== 5) throw new TypeError("请输入五段 Cron（分、时、日、月、星期）");
    const [minutes, hours, days, months, weekdays] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]]
      .map(([min, max], index) => cronPart(parts[index], min, max));
    if (weekdays.delete(7)) weekdays.add(0);
    const daysRestricted = days.size < 31, weeksRestricted = weekdays.size < 7;
    // 日期和星期同时受限时采用标准的任一匹配
    const onDate = (date) => {
      if (!months.has(date.getMonth() + 1)) return false;
      const day = days.has(date.getDate()), week = weekdays.has(date.getDay());
      return daysRestricted && weeksRestricted ? day || week : day && week;
    };
    return { minutes: () => [...hours].flatMap(hour => [...minutes].map(minute => hour * 60 + minute)), onDate };
  }
  function timing({ mode, every, minute, time, weekdays, day, expression }) {
    const anyDay = () => true;
    switch (mode) {
      case "minute": return { step: integer(every, 1, Math.floor(MAX_DATE / MINUTE), "请输入有效的间隔分钟数") * MINUTE, onDate: anyDay };
      case "hour": {
        integer(minute, 0, 59, "请选择 0 至 59 分");
        return { minutes: () => Array.from({ length: 24 }, (_, hour) => hour * 60 + minute), onDate: anyDay };
      }
      case "day": {
        const at = minuteOfDay(time);
        return { minutes: () => [at], onDate: anyDay };
      }
      case "week": {
        if (!Array.isArray(weekdays) || !weekdays.length || new Set(weekdays).size !== weekdays.length || weekdays.some(value => !Number.isInteger(value) || value < 0 || value > 6))
          throw new TypeError("请至少选择一个星期");
        const at = minuteOfDay(time);
        return { minutes: () => [at], onDate: date => weekdays.includes(date.getDay()) };
      }
      case "month": {
        integer(day, 1, 31, "请选择 1 至 31 号");
        const at = minuteOfDay(time);
        return { minutes: () => [at], onDate: date => date.getDate() === day };
      }
      case "cron": return cron(expression);
      default: throw new TypeError("请选择执行频率");
    }
  }
  function parse(event) {
    if (!event?.timing) throw new TypeError("请选择执行频率");
    if (!["minute", "hour"].includes(event.timing.mode) && (event.window !== undefined || event.dates !== undefined))
      throw new TypeError("每天起止时间和指定日历仅适用于每分钟或每小时");
    const plan = timing(event.timing), window = parseWindow(event.window);
    const endsAt = event.endsAt === undefined ? MAX_DATE : integer(event.endsAt, 1, MAX_DATE, "定时结束时间无效");
    let dates = null;
    if (event.dates !== undefined) {
      if (!Array.isArray(event.dates) || !event.dates.length || new Set(event.dates).size !== event.dates.length)
        throw new TypeError("请至少选择一个日历日期");
      dates = event.dates.map(calendarDate);
    }
    return { ...plan, window, endsAt, dates };
  }
  /** 验证已保存日程。工作流每步校验配置时无需展开分钟列表 */
  function validate(event) { parse(event); }
  /** 将日程编译为供界面预览和调度使用的候选时点 */
  function compile(event) {
    const plan = parse(event);
    plan.dates?.sort((left, right) => left - right);
    plan.minutes = plan.minutes?.().filter(value => allowedClock(plan.window, value)).sort((left, right) => left - right);
    return plan;
  }
  /** 排队开始前只需核验实际时间是否仍处于允许的日期和窗口 */
  function allowsStart(event, at) {
    if (!event.timing || (event.endsAt !== undefined && at >= event.endsAt)) return false;
    const date = new Date(at);
    return (!event.dates || event.dates.includes(dateKey(date))) && allowedClock(parseWindow(event.window), clock(date));
  }
  function intervalSlot(from, through, origin, step, latest) {
    const factor = latest ? Math.floor((through - origin) / step) : Math.ceil((from - origin) / step);
    const slot = origin + factor * step;
    return slot >= from && slot <= through ? slot : null;
  }
  function slotOnDay(plan, day, from, through, origin, latest = false) {
    if (!plan.onDate(day)) return null;
    if (plan.step) {
      const first = Math.max(from, +day, origin + plan.step);
      const nextDay = +tomorrow(day), last = Math.min(through, nextDay - 1);
      if (first > last) return null;
      if (!plan.window) return intervalSlot(first, last, origin, plan.step, latest);
      if (nextDay - +day === DAY && clock(day) === 0) {
        const [start, end] = plan.window.map(minute => +day + minute * MINUTE);
        const windows = start < end ? [[start, end]] : [[+day, end], [start, nextDay]];
        if (latest) windows.reverse();
        for (const [low, high] of windows) {
          const slot = intervalSlot(Math.max(first, low), Math.min(last, high - 1), origin, plan.step, latest);
          if (slot !== null) return slot;
        }
        return null;
      }
      // 夏令时切换日按实际分钟判断窗口，正常日期直接计算窗口内的间隔相位
      let slot = intervalSlot(first, last, origin, plan.step, latest);
      while (slot !== null && slot >= first && slot <= last) {
        if (allowedClock(plan.window, clock(new Date(slot)))) return slot;
        slot += latest ? -plan.step : plan.step;
      }
      return null;
    }
    const count = plan.minutes.length;
    for (let index = 0; index < count; index++) {
      const minute = plan.minutes[latest ? count - index - 1 : index], date = new Date(day);
      const slot = date.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
      // 本地时间缺失时跳过。时钟回拨时 Date 为同一墙钟时间选择第一次
      if (slot >= from && slot <= through && clock(date) === minute) return slot;
    }
    return null;
  }
  /** 返回严格晚于 after 的下一个有效时点。没有有效时点时返回 null */
  function next(plan, after, origin = after) {
    const from = after + 1, through = plan.endsAt - 1;
    if (from > through || plan.minutes?.length === 0) return null;
    if (plan.step && !plan.dates && !plan.window) {
      const slot = origin + Math.max(1, Math.ceil((from - origin) / plan.step)) * plan.step;
      return slot <= through ? slot : null;
    }
    if (plan.dates) {
      for (const day of plan.dates) {
        if (+day > through) break;
        if (+tomorrow(day) <= from) continue;
        const slot = slotOnDay(plan, day, from, through, origin);
        if (slot !== null) return slot;
      }
      return null;
    }
    // 公历闰日最多相隔八年。固定间隔加时间窗还需覆盖其本地分钟相位
    const horizon = Math.min(through, from + Math.max(9 * 366 * DAY, (plan.step || 0) * 1440));
    for (let day = dayOf(from); +day <= horizon;) {
      const slot = slotOnDay(plan, day, from, through, origin);
      if (slot !== null) return slot;
      const following = tomorrow(day);
      if (!plan.step) day = following;
      else {
        const raw = origin + Math.max(1, Math.ceil((+following - origin) / plan.step)) * plan.step;
        if (raw > horizon) break;
        day = dayOf(raw);
      }
    }
    return null;
  }
  /** 唤醒后最多领取今天最近的合规时点。计划时点早于 first 的记录已经处理过 */
  function latestToday(event, plan, first, now, origin) {
    if (!allowsStart(event, now) || first > now) return null;
    const day = dayOf(now);
    return slotOnDay(plan, day, Math.max(first, +day), now, origin, true);
  }
  root.STAutomationCalendar = Object.freeze({ MINUTE, dateKey, endTime, validate, compile, next, latestToday, allowsStart });
})(globalThis);
