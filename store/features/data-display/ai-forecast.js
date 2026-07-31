/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店详情页 AI 未来打折预测对话
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const api = window.STStore;
  if (!api) return;

  const STREAM_TYPE = "AI_CHAT_COMPLETIONS_STREAM";
  const STORAGE_PREFIX = "st.aiDiscountForecast.session.v1.";
  const SESSION_VERSION = 3;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
  const SESSION_TTL_MS = 7 * DAY_MS;
  const AI_TIMEOUT_MS = 120 * 1000;
  const STREAM_RENDER_INTERVAL_MS = 100;
  const CARD_SUMMARY_CHARS = 300;
  const CARD_SUMMARY_OPEN = "<CARD_SUMMARY>";
  const CARD_SUMMARY_CLOSE = "</CARD_SUMMARY>";
  const MESSAGE_ROLES = new Set(["system", "user", "assistant"]);
  const states = new WeakMap();
  const log = window.STLoggerFactory?.createLogger?.("store", "ai-discount-forecast");
  const SYSTEM_PROMPT = [
    "你是 Steam 游戏未来折扣预测分析师。核心任务是根据对话中提供的当前价格、历史折扣、历史节日和未来节日信息，预测距离当前日期最近、最有可能发生的下一次折扣，并给出最合理的折扣比例范围和购买建议。分析范围不超过未来一年。",
    "只能使用对话中提供的数据，以及根据这些数据进行的日期、间隔、频率、价格和折扣计算。不得编造未提供的销量、评价、玩家人数、媒体评分、发行商计划或其他外部事实。",
    "首先明确给出一个主要预测时间窗口和最合理的折扣比例范围。只有数据确实支持时，才补充最多两个次要候选窗口；不要把所有未来节日都列为高概率窗口。",
    "只要存在有效的当前价格或历史折扣记录，就必须给出最佳可用预测。数据较少时降低置信度并解释原因，不能只复述数据或仅以无法预测结束回答。",
    "预测必须由历史折扣频率、间隔、力度、最近一次折扣、当前价格状态、发行时间或节日重合证据支撑。不要因为不确定性而过度保守，也不得为了给出结论脱离数据随意预测。",
    "未来节日只是候选时间窗口，不代表游戏一定参加。历史折扣与节日时间重叠只能作为相关证据，不能表述为确定因果关系。",
    i18n("store.aiForecast.responseInstruction", "必须明确建议现在购买、等待主要预测窗口，或达到什么折扣再购买。使用中文回答，并明确区分事实、推测和不确定性。不要给出没有数据支撑的精确日期或精确概率。"),
  ].join("\n");

  function text(value) {
    return String(value ?? "").trim();
  }

  function i18n(key, fallback, params) {
    return globalThis.STI18n.text(key, fallback, params);
  }

  function el(tag, className = "", value = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value) node.textContent = value;
    return node;
  }

  function entity(pageInfo = {}) {
    const type = text(pageInfo.type).toLowerCase();
    const id = text(pageInfo.appId || pageInfo.appid || pageInfo.id);
    if (!new Set(["app", "sub", "bundle"]).has(type) || !/^\d+$/.test(id)) return null;
    return { type, id, key: `${type}.${id}` };
  }

  function storageKey(pageInfo) {
    const item = entity(pageInfo);
    return item ? `${STORAGE_PREFIX}${item.key}` : "";
  }

  function storage() {
    return globalThis.chrome?.storage?.local || null;
  }

  function storageGet(key) {
    return new Promise((resolve, reject) => {
      const box = storage();
      if (!box) {
        reject(new Error(i18n("store.aiForecast.storageUnavailable", "chrome.storage.local 不可用")));
        return;
      }
      box.get([key], (values) => {
        const error = globalThis.chrome?.runtime?.lastError;
        if (error) reject(new Error(error.message || i18n("store.aiForecast.sessionReadFailed", "读取 AI 预测会话失败")));
        else resolve(values?.[key] || null);
      });
    });
  }

  function storageSet(key, value) {
    return new Promise((resolve, reject) => {
      const box = storage();
      if (!box) {
        reject(new Error(i18n("store.aiForecast.storageUnavailable", "chrome.storage.local 不可用")));
        return;
      }
      box.set({ [key]: value }, () => {
        const error = globalThis.chrome?.runtime?.lastError;
        if (error) reject(new Error(error.message || i18n("store.aiForecast.sessionSaveFailed", "保存 AI 预测会话失败")));
        else resolve();
      });
    });
  }

  function storageRemove(key) {
    return new Promise((resolve, reject) => {
      const box = storage();
      if (!box) {
        reject(new Error(i18n("store.aiForecast.storageUnavailable", "chrome.storage.local 不可用")));
        return;
      }
      box.remove(key, () => {
        const error = globalThis.chrome?.runtime?.lastError;
        if (error) reject(new Error(error.message || i18n("store.aiForecast.sessionClearFailed", "清理 AI 预测会话失败")));
        else resolve();
      });
    });
  }

  function normalizeMessages(messages) {
    if (!Array.isArray(messages)) return [];
    return messages.map((message) => {
      const role = text(message?.role);
      const rawContent = typeof message?.content === "string" ? message.content : "";
      const content = role === "assistant" ? withoutLegacySummaryHeadingAtEnd(rawContent) : rawContent;
      return MESSAGE_ROLES.has(role) && content.trim() ? { role, content } : null;
    }).filter(Boolean);
  }

  function normalizeSession(raw, entityKey, now = Date.now()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const messages = normalizeMessages(raw.messages);
    const expiresAt = Number(raw.expiresAt) || 0;
    if (
      Number(raw.version) !== SESSION_VERSION
      || text(raw.entityKey) !== entityKey
      || expiresAt <= now
      || !text(raw.summary)
      || messages.length < 3
      || messages[messages.length - 1]?.role !== "assistant"
    ) {
      return null;
    }
    return {
      version: SESSION_VERSION,
      entityKey,
      createdAt: Number(raw.createdAt) || now,
      updatedAt: Number(raw.updatedAt) || now,
      expiresAt,
      summary: summaryText(raw.summary),
      messages,
    };
  }

  async function readSession(key, entityKey) {
    const raw = await storageGet(key);
    if (!raw) return null;
    const session = normalizeSession(raw, entityKey);
    if (session) return session;
    await storageRemove(key);
    return null;
  }

  function summaryText(value) {
    const chars = Array.from(text(value));
    if (chars.length <= CARD_SUMMARY_CHARS) return chars.join("");
    return `${chars.slice(0, CARD_SUMMARY_CHARS - 1).join("")}…`;
  }

  function summaryMarkerPrefixAtEnd(value) {
    const raw = String(value ?? "");
    const markerAt = raw.lastIndexOf("<");
    if (markerAt < 0) return -1;
    const suffix = raw.slice(markerAt).toUpperCase();
    return [CARD_SUMMARY_OPEN, CARD_SUMMARY_CLOSE].some(marker => marker.startsWith(suffix))
      ? markerAt
      : -1;
  }

  function withoutLegacySummaryHeadingAtEnd(value) {
    const raw = String(value ?? "").replace(/\r\n/g, "\n");
    const lines = raw.split("\n");
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (lines[lines.length - 1]?.trim() === "**卡片摘要：**") lines.pop();
    return lines.join("\n").trimEnd();
  }

  function withoutSummaryMarkers(value) {
    const raw = String(value ?? "").replace(/<\/?CARD_SUMMARY>/gi, "");
    const partialAt = summaryMarkerPrefixAtEnd(raw);
    return text(withoutLegacySummaryHeadingAtEnd(partialAt >= 0 ? raw.slice(0, partialAt) : raw));
  }

  function initialAnswer(value) {
    const raw = text(value);
    const upper = raw.toUpperCase();
    const openAt = upper.indexOf(CARD_SUMMARY_OPEN);
    if (openAt < 0) {
      const content = withoutSummaryMarkers(raw);
      return { content, summary: summaryText(content) };
    }
    const summaryStart = openAt + CARD_SUMMARY_OPEN.length;
    const closeAt = upper.indexOf(CARD_SUMMARY_CLOSE, summaryStart);
    const content = withoutSummaryMarkers(raw.slice(0, openAt));
    const summarySource = raw.slice(summaryStart, closeAt >= 0 ? closeAt : raw.length);
    const summary = summaryText(withoutSummaryMarkers(summarySource) || content || raw);
    return { content: content || summary, summary };
  }

  function streamingAnswer(value) {
    const raw = String(value ?? "");
    const upper = raw.toUpperCase();
    const markerIndexes = [CARD_SUMMARY_OPEN, CARD_SUMMARY_CLOSE]
      .map(marker => upper.indexOf(marker))
      .filter(index => index >= 0);
    if (markerIndexes.length) return withoutLegacySummaryHeadingAtEnd(raw.slice(0, Math.min(...markerIndexes)));
    const partialAt = summaryMarkerPrefixAtEnd(raw);
    if (partialAt >= 0) return withoutLegacySummaryHeadingAtEnd(raw.slice(0, partialAt));
    return withoutLegacySummaryHeadingAtEnd(raw);
  }

  function shiftBeijingYears(stamp, years) {
    const date = new Date(stamp + BEIJING_OFFSET_MS);
    date.setUTCFullYear(date.getUTCFullYear() + years);
    return date.getTime() - BEIJING_OFFSET_MS;
  }

  function eventTime(value) {
    const stamp = Date.parse(text(value));
    return Number.isFinite(stamp) ? stamp : 0;
  }

  function beijingTime(value) {
    const stamp = typeof value === "number" ? value : eventTime(value);
    if (!Number.isFinite(stamp) || stamp <= 0) return "";
    return new Date(stamp + BEIJING_OFFSET_MS).toISOString().slice(0, 19).replace("T", " ");
  }

  function roundedPrice(value) {
    if (value === null || value === undefined || value === "") return null;
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
  }

  function inferredRegularPrice(discountedAmount, cut) {
    if (discountedAmount === null || discountedAmount === undefined || discountedAmount === "") return null;
    const amount = Number(discountedAmount);
    const percent = Number(cut);
    if (!Number.isFinite(amount) || !Number.isFinite(percent) || percent <= 0 || percent >= 100) return null;
    return roundedPrice(amount / (1 - percent / 100));
  }

  function pageGameName(documentRef, itemType) {
    if (text(itemType) !== "app") return "";
    return text(documentRef?.querySelector?.("#appHubAppName_responsive")?.textContent);
  }

  function currentPriceSnapshot(pack = {}) {
    const current = pack.currentPrice && typeof pack.currentPrice === "object" ? pack.currentPrice : null;
    const cut = Math.max(0, Number(current?.cut) || 0);
    const currentAmount = roundedPrice(current?.price?.amount);
    const regularAmount = roundedPrice(
      current?.regular?.amount
      ?? (cut > 0 ? inferredRegularPrice(currentAmount, cut) : currentAmount)
    );
    const currency = text(current?.price?.currency || current?.regular?.currency || pack.currency);
    return {
      "当前折扣状态": current ? (cut > 0 ? "正在打折" : "当前未打折") : "价格数据不可用",
      "原价": regularAmount,
      "当前售价": currentAmount,
      "折扣比例": cut,
      "币种": currency,
    };
  }

  function discountSnapshot(event = {}, currency = "") {
    const saleAmount = roundedPrice(event.minAmount);
    return {
      "开始时间": beijingTime(event.start),
      "结束时间": event.endKnown ? beijingTime(event.end) : null,
      "原价": inferredRegularPrice(saleAmount, event.cut),
      "折后价": saleAmount,
      "折扣比例": Math.max(0, Number(event.cut) || 0),
      "币种": text(currency),
      "开始时间是否准确": event.startKnown === true,
    };
  }

  function festivalSnapshot(item = {}, historical = false) {
    const snapshot = {
      "节日名称": text(item.name),
      "节日类型": text(item.typeLabel || item.type),
      "开始时间": beijingTime(item.startsAt),
      "结束时间": beijingTime(item.endsAt),
    };
    if (historical) {
      snapshot["同期是否出现游戏折扣"] = item.coincidentDiscount === true;
      snapshot["同期最高折扣比例"] = item.maxCoincidentCut !== null
        && item.maxCoincidentCut !== undefined
        && Number.isFinite(Number(item.maxCoincidentCut))
        ? Number(item.maxCoincidentCut)
        : null;
    }
    return snapshot;
  }

  function predictionSnapshot(pack = {}, festivalData = {}, pageInfo = {}, documentRef = document, now = Date.now()) {
    const historyStart = shiftBeijingYears(now, -3);
    const futureEnd = shiftBeijingYears(now, 1);
    const evidenceBuilder = api.features?.dataDisplayForecastPack?.aiForecastEvidence;
    if (typeof evidenceBuilder !== "function") throw new Error("AI 预测证据构建器未就绪");
    const evidence = evidenceBuilder(pack.priceEvents, festivalData, {
      now,
      historyStart,
      futureEnd,
    });
    const item = entity(pageInfo) || { type: text(pack.itemType), id: text(pack.itemId || pack.appid) };
    return {
      game: {
        "APPID": text(pack.appid || item.id),
        "游戏名称": pageGameName(documentRef, item.type),
        "商品类型": item.type,
        "发行日期": text(pack.releaseDate),
        "预测生成时间": beijingTime(now),
      },
      currentPrice: currentPriceSnapshot(pack),
      historicalDiscounts: {
        "统计开始时间": beijingTime(historyStart),
        "统计结束时间": beijingTime(now),
        "折扣记录": evidence.historicalDiscounts.map(event => discountSnapshot(event, pack.currency)),
      },
      historicalFestivals: {
        "统计开始时间": beijingTime(historyStart),
        "统计结束时间": beijingTime(now),
        "节日记录": evidence.historicalFestivals.map(item => festivalSnapshot(item, true)),
      },
      futureFestivals: {
        "统计开始时间": beijingTime(now),
        "统计结束时间": beijingTime(futureEnd),
        "节日记录": evidence.futureFestivals.map(item => festivalSnapshot(item, false)),
      },
    };
  }

  function promptSection(title, value) {
    return `# ${title}\n${JSON.stringify(value, null, 2)}`;
  }

  function initialMessages(snapshot) {
    const contextContent = [
      "# 任务",
      "根据以下数据，预测距离当前日期最近、最有可能发生的下一次折扣。首先给出主要预测时间窗口和预计折扣比例范围，并明确建议现在购买、等待该窗口，或达到什么折扣再购买；只有数据确实支持时，才补充其他候选窗口。",
      promptSection("当前游戏", snapshot.game),
      promptSection("当前价格状态", snapshot.currentPrice),
      promptSection("过去三年打折情况", snapshot.historicalDiscounts),
      promptSection("过去三年节日信息", snapshot.historicalFestivals),
      promptSection("未来一年节日信息", snapshot.futureFestivals),
    ].join("\n\n");
    const summaryProtocol = [
      "# 机器输出协议",
      "完整预测正文结束后，必须额外生成一份独立的卡片摘要。",
      "卡片摘要仅供程序提取并显示在预测卡片中，不属于预测正文。正文必须保持完整，不得为了生成摘要而缩短正文，也不得在正文中提前输出、引用或解释这份摘要。",
      `正文结束后另起一行，直接输出 ${CARD_SUMMARY_OPEN} 开始标签。`,
      "下一行输出摘要内容。",
      `再下一行输出 ${CARD_SUMMARY_CLOSE} 结束标签。`,
      "要求：",
      `1. ${CARD_SUMMARY_OPEN} 必须是正文结束后的第一个非空内容。`,
      "2. 开始标签前不得添加“卡片摘要”“预测摘要”等标题、说明、冒号、过渡语或 Markdown 标记。",
      "3. 标签内只能压缩总结正文已有结论，不得补充新数据、新窗口或新判断。",
      i18n("store.aiForecast.summaryLanguageInstruction", "4. 摘要使用中文纯文本，不使用 Markdown、标题、列表或代码块。"),
      "5. 摘要需包含主要时间窗口、预计折扣范围、购买建议、核心依据和主要风险，不超过 300 个字符。",
      "6. 标签必须完整且各出现一次，不得放入代码块。",
      "7. 结束标签后不得输出其他内容。",
    ].join("\n");
    const contextMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: contextContent },
    ];
    return {
      contextMessages,
      requestMessages: [
        contextMessages[0],
        { role: "user", content: `${contextContent}\n\n${summaryProtocol}` },
      ],
    };
  }

  function requestId() {
    return `ai-forecast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function aiReady(conf = {}) {
    const next = window.STAI?.normalize?.(conf) || conf;
    return next.enabled === true && !!text(next.host) && !!text(next.model);
  }

  async function loadAiConfig() {
    const values = await window.STSettings?.storage?.getAi?.();
    return window.STAI?.normalize?.(values) || values || {};
  }

  function stateFor(root, result, pageInfo) {
    let state = states.get(root);
    if (!state) {
      const item = entity(pageInfo);
      state = {
        root,
        result,
        pageInfo,
        entityKey: item?.key || "",
        key: storageKey(pageInfo),
        session: null,
        sessionPromise: null,
        sessionLoaded: false,
        phase: "loading-session",
        errorText: "",
        persistenceError: "",
        streamText: "",
        streamJob: null,
        pendingMessages: null,
        renderedMessages: null,
        streamMessage: null,
        renderedStreamText: "",
        streamRenderTimer: 0,
        card: null,
        dialog: null,
        initialAttempted: false,
        disposed: false,
        previousFocus: null,
      };
      states.set(root, state);
    }
    state.result = result;
    state.pageInfo = pageInfo;
    return state;
  }

  function dataState(state) {
    if (state.result?.festivalData) return "ready";
    if (state.result?.festivalStatus === "error") return "error";
    return "loading";
  }

  function cardText(state) {
    if (state.session?.summary) return state.session.summary;
    if (!state.sessionLoaded) return i18n("store.aiForecast.readingSession", "正在读取 AI 预测记录...");
    if (state.phase === "preparing") return i18n("store.aiForecast.preparing", "正在准备预测数据...");
    if (state.phase === "generating") return i18n("store.aiForecast.analyzing", "AI 正在分析历史折扣与节日数据...");
    if (state.phase === "error") return state.errorText || i18n("store.aiForecast.failed", "AI 预测失败，请稍后重试。");
    if (dataState(state) === "error") return i18n("store.aiForecast.festivalUnavailable", "节日数据暂不可用，无法生成 AI 预测。");
    if (dataState(state) === "loading") return i18n("store.aiForecast.preparingHistory", "正在准备历史折扣与节日数据...");
    return i18n("store.aiForecast.openDetailsHint", "点击“对话详情”生成 AI 预测。");
  }

  function updateCard(state) {
    if (state.disposed) return;
    const card = state.card;
    if (!card) return;
    const body = card.querySelector(".st-data-display-ai-card__summary");
    const button = card.querySelector(".st-data-display-ai-card__detail-button");
    if (body) body.textContent = cardText(state);
    const blocked = !state.session
      && (!state.sessionLoaded || dataState(state) !== "ready");
    if (button) button.disabled = blocked;
    card.dataset.state = state.phase;
  }

  function setMessageContent(element, role, content) {
    if (role !== "assistant") {
      element.textContent = content;
      return;
    }
    const renderMarkdown = api.features?.dataDisplayMarkdown?.renderInto;
    if (typeof renderMarkdown === "function") {
      renderMarkdown(element, content);
      return;
    }
    element.textContent = content;
  }

  function displayMessage(message, index) {
    if (message.role === "system") return null;
    const item = el("div", `st-ai-forecast-message is-${message.role}`);
    const label = el("div", "st-ai-forecast-message__label", message.role === "assistant" ? "AI" : i18n("store.aiForecast.you", "你"));
    let content = message.content;
    if (
      message.role === "user"
      && index === 1
      && message.content.startsWith("# 任务\n")
      && message.content.includes("\n# 未来一年节日信息\n")
    ) {
      content = i18n("store.aiForecast.initialQuestion", "请基于当前页面的价格与节日数据预测未来折扣。");
    }
    const body = el("div", "st-ai-forecast-message__content");
    setMessageContent(body, message.role, content);
    item.append(label, body);
    return item;
  }

  function dialogStatus(state) {
    if (state.phase === "error") return state.errorText || i18n("store.aiForecast.failed", "AI 预测失败，请稍后重试。");
    if (state.persistenceError) return state.persistenceError;
    return "";
  }

  function renderCompletedMessages(state, messagesBox, messages) {
    if (!messagesBox || state.renderedMessages === messages) return;
    messagesBox.replaceChildren();
    messages.forEach((message, index) => {
      const node = displayMessage(message, index);
      if (node) messagesBox.appendChild(node);
    });
    state.renderedMessages = messages;
    state.streamMessage = null;
    state.renderedStreamText = "";
  }

  function renderStreamingMessage(state, messagesBox) {
    if (!messagesBox) return;
    if (state.phase !== "generating") {
      state.streamMessage?.remove?.();
      state.streamMessage = null;
      state.renderedStreamText = "";
      return;
    }
    const content = streamingAnswer(state.streamText) || i18n("store.aiForecast.thinking", "正在思考...");
    if (!state.streamMessage || state.streamMessage.parentNode !== messagesBox) {
      state.streamMessage = displayMessage({ role: "assistant", content }, 0);
      state.streamMessage?.classList.add("is-streaming");
      if (state.streamMessage) messagesBox.appendChild(state.streamMessage);
      state.renderedStreamText = content;
    } else if (state.renderedStreamText !== content) {
      const body = state.streamMessage.querySelector(".st-ai-forecast-message__content");
      if (body) setMessageContent(body, "assistant", content);
      state.renderedStreamText = content;
    }
    if (!state.dialog?.hidden) messagesBox.scrollTop = messagesBox.scrollHeight;
  }

  function renderDialog(state) {
    const dialog = state.dialog;
    if (!dialog) return;
    const messagesBox = dialog.querySelector(".st-ai-forecast-dialog__messages");
    const status = dialog.querySelector(".st-ai-forecast-dialog__status");
    const input = dialog.querySelector(".st-ai-forecast-dialog__input");
    const send = dialog.querySelector(".st-ai-forecast-dialog__send");
    const retry = dialog.querySelector(".st-ai-forecast-dialog__retry");
    const messages = state.pendingMessages || state.session?.messages || [];
    renderCompletedMessages(state, messagesBox, messages);
    renderStreamingMessage(state, messagesBox);
    const statusText = dialogStatus(state);
    if (status) status.textContent = statusText;
    const generating = state.phase === "preparing" || state.phase === "generating";
    const canAsk = !!state.session && !generating;
    if (input) {
      input.disabled = !canAsk;
      input.placeholder = generating
        ? i18n("store.aiForecast.replying", "AI 正在回复，请稍等...")
        : i18n("store.aiForecast.questionPlaceholder", "询问未来打折相关问题");
      input.classList.toggle("is-busy", generating);
    }
    if (send) send.disabled = !canAsk || !text(input?.value);
    if (retry) retry.hidden = !(state.phase === "error" && !state.session);
    const statusRow = dialog.querySelector(".st-ai-forecast-dialog__status-row");
    if (statusRow) statusRow.hidden = !statusText && retry?.hidden !== false;
    if (!dialog.hidden && messagesBox) messagesBox.scrollTop = messagesBox.scrollHeight;
  }

  function updateUi(state) {
    updateCard(state);
    renderDialog(state);
  }

  function clearStreamRenderTimer(state) {
    if (!state.streamRenderTimer) return;
    globalThis.clearTimeout(state.streamRenderTimer);
    state.streamRenderTimer = 0;
  }

  function scheduleStreamRender(state) {
    if (state.streamRenderTimer || state.disposed) return;
    state.streamRenderTimer = globalThis.setTimeout(() => {
      state.streamRenderTimer = 0;
      const messagesBox = state.dialog?.querySelector(".st-ai-forecast-dialog__messages");
      renderStreamingMessage(state, messagesBox);
    }, STREAM_RENDER_INTERVAL_MS);
  }

  function closeDialog(state) {
    if (!state.dialog) return;
    state.dialog.hidden = true;
    document.documentElement.classList.remove("st-ai-forecast-dialog-open");
    state.previousFocus?.focus?.();
  }

  function createDialog(state) {
    if (state.dialog) return state.dialog;
    const layer = el("div", "st-ai-forecast-dialog");
    layer.hidden = true;
    const panel = el("section", "st-ai-forecast-dialog__panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "st-ai-forecast-dialog-title");
    panel.tabIndex = -1;
    const header = el("header", "st-ai-forecast-dialog__header");
    const title = el("h2", "st-ai-forecast-dialog__title");
    title.id = "st-ai-forecast-dialog-title";
    title.appendChild(api.assets.createBrandMark({ suffix: i18n("store.aiForecast.title", "AI 预测") }));
    const close = el("button", "st-ai-forecast-dialog__close", "×");
    close.type = "button";
    close.setAttribute("aria-label", i18n("store.aiForecast.closeDialog", "关闭对话"));
    close.title = i18n("common.close", "关闭");
    header.append(title, close);
    const messages = el("div", "st-ai-forecast-dialog__messages");
    const statusRow = el("div", "st-ai-forecast-dialog__status-row");
    const status = el("div", "st-ai-forecast-dialog__status");
    const retry = el("button", "st-ai-forecast-dialog__retry", i18n("common.retry", "重试"));
    retry.type = "button";
    retry.hidden = true;
    statusRow.append(status, retry);
    const form = el("form", "st-ai-forecast-dialog__composer");
    const input = el("textarea", "st-ai-forecast-dialog__input");
    input.rows = 2;
    input.placeholder = i18n("store.aiForecast.questionPlaceholder", "询问未来打折相关问题");
    const send = el("button", "st-ai-forecast-dialog__send", i18n("common.send", "发送"));
    send.type = "submit";
    form.append(input, send);
    panel.append(header, messages, statusRow, form);
    layer.appendChild(panel);
    document.documentElement.appendChild(layer);

    close.addEventListener("click", () => closeDialog(state));
    layer.addEventListener("click", event => {
      if (event.target === layer) closeDialog(state);
    });
    layer.addEventListener("keydown", event => {
      if (event.key === "Escape") closeDialog(state);
    });
    input.addEventListener("input", () => renderDialog(state));
    input.addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit?.();
      }
    });
    retry.addEventListener("click", () => {
      void startInitialForecast(state);
    });
    form.addEventListener("submit", event => {
      event.preventDefault();
      const question = text(input.value);
      if (!question || !state.session || state.streamJob) return;
      input.value = "";
      void sendFollowup(state, question).then((sent) => {
        if (!sent) input.value = question;
        renderDialog(state);
      });
    });
    state.dialog = layer;
    return layer;
  }

  async function streamConversation(state, conf, messages, initial, contextMessages = messages) {
    const streamApi = window.STMessageBus?.stream;
    if (typeof streamApi !== "function") {
      state.phase = "error";
      state.errorText = i18n("store.aiForecast.streamUnavailable", "AI 流式通道未就绪。");
      updateUi(state);
      return false;
    }
    const id = requestId();
    const operationId = window.STLoggerFactory?.createOperationId?.() || "";
    const startedAt = Date.now();
    const model = text(window.STAI?.normalize?.(conf)?.model || conf.model);
    state.phase = "generating";
    state.errorText = "";
    state.persistenceError = "";
    state.streamText = "";
    state.pendingMessages = messages;
    updateUi(state);
    log?.info?.("ai-forecast-stream-start", "AI 未来打折预测流式请求开始", {
      operationId,
      requestId: id,
      appid: Number(state.pageInfo?.appId || state.pageInfo?.appid || state.pageInfo?.id) || 0,
      model,
      messageCount: messages.length,
      initial,
    });

    const job = streamApi({
      type: STREAM_TYPE,
      ai: conf,
      messages: normalizeMessages(messages),
      operationId,
      requestId: id,
      timeoutMs: AI_TIMEOUT_MS,
    }, {
      onDelta(chunk) {
        state.streamText += chunk;
        scheduleStreamRender(state);
      },
    }, {
      timeoutMs: AI_TIMEOUT_MS,
      logFailures: false,
    });
    state.streamJob = job;
    try {
      const response = await job.done;
      const rawAnswer = text(response?.text || state.streamText);
      if (!rawAnswer) throw new Error("AI 流式响应没有返回文本");
      clearStreamRenderTimer(state);
      const parsedAnswer = initial
        ? initialAnswer(rawAnswer)
        : { content: rawAnswer, summary: state.session?.summary || "" };
      const answer = parsedAnswer.content;
      const completedMessages = [
        ...normalizeMessages(contextMessages),
        { role: "assistant", content: answer },
      ];
      const now = Date.now();
      const session = {
        version: SESSION_VERSION,
        entityKey: state.entityKey,
        createdAt: state.session?.createdAt || now,
        updatedAt: now,
        expiresAt: now + SESSION_TTL_MS,
        summary: initial ? parsedAnswer.summary : state.session.summary,
        messages: completedMessages,
      };
      state.session = session;
      state.phase = "ready";
      state.streamText = "";
      state.pendingMessages = null;
      try {
        await storageSet(state.key, session);
      } catch (error) {
        state.persistenceError = i18n("store.aiForecast.replySaveFailed", "回复已完成，但本次对话未能保存。");
        log?.error?.("ai-forecast-session-save-failed", "AI 未来打折预测会话保存失败", {
          operationId,
          requestId: id,
          appid: Number(state.pageInfo?.appId || state.pageInfo?.appid || state.pageInfo?.id) || 0,
          error,
        });
      }
      log?.info?.("ai-forecast-stream-success", "AI 未来打折预测流式请求完成", {
        operationId,
        requestId: id,
        appid: Number(state.pageInfo?.appId || state.pageInfo?.appid || state.pageInfo?.id) || 0,
        model,
        messageCount: completedMessages.length,
        durationMs: Date.now() - startedAt,
        initial,
      });
      updateUi(state);
      return true;
    } catch (error) {
      if (state.disposed && error?.name === "AbortError") return false;
      state.phase = "error";
      state.errorText = text(error?.message) || i18n("store.aiForecast.failed", "AI 预测失败，请稍后重试。");
      clearStreamRenderTimer(state);
      state.streamText = "";
      state.pendingMessages = null;
      log?.error?.("ai-forecast-stream-failed", "AI 未来打折预测流式请求失败", {
        operationId,
        requestId: id,
        appid: Number(state.pageInfo?.appId || state.pageInfo?.appid || state.pageInfo?.id) || 0,
        model,
        durationMs: Date.now() - startedAt,
        errorCode: error?.code || error?.name || "AI_STREAM_FAILED",
        error,
      });
      updateUi(state);
      return false;
    } finally {
      state.streamJob = null;
    }
  }

  async function startInitialForecast(state) {
    if (state.streamJob || state.disposed) return false;
    state.initialAttempted = true;
    if (dataState(state) !== "ready") {
      state.phase = "error";
      state.errorText = dataState(state) === "error"
        ? i18n("store.aiForecast.festivalUnavailable", "节日数据暂不可用，无法生成 AI 预测。")
        : i18n("store.aiForecast.dataStillLoading", "预测数据仍在加载，请稍后重试。");
      updateUi(state);
      return false;
    }
    state.phase = "preparing";
    state.errorText = "";
    updateUi(state);
    try {
      const conf = await loadAiConfig();
      if (!aiReady(conf)) {
        state.phase = "error";
        state.errorText = i18n("store.aiForecast.configurationRequired", "预测需要先配置 AI 服务。");
        updateUi(state);
        return false;
      }
      const packStatus = await api.thirdPartyData?.buildDiscountForecastPack?.(state.pageInfo, {
        pricePack: state.result,
        pageCountry: api.ctx?.country?.(),
        document,
        festivalData: state.result.festivalData,
      });
      if (packStatus?.ok !== true) {
        state.phase = "error";
        state.errorText = packStatus?.userMessage || i18n("store.aiForecast.dataUnavailable", "AI 预测数据暂不可用。");
        updateUi(state);
        return false;
      }
      const snapshot = predictionSnapshot(packStatus.data, state.result.festivalData, state.pageInfo, document);
      const initial = initialMessages(snapshot);
      return streamConversation(state, conf, initial.requestMessages, true, initial.contextMessages);
    } catch (error) {
      state.phase = "error";
      state.errorText = text(error?.message) || i18n("store.aiForecast.prepareFailed", "AI 预测数据准备失败。");
      log?.error?.("ai-forecast-prepare-failed", "AI 未来打折预测数据准备失败", {
        appid: Number(state.pageInfo?.appId || state.pageInfo?.appid || state.pageInfo?.id) || 0,
        error,
      });
      updateUi(state);
      return false;
    }
  }

  async function sendFollowup(state, question) {
    if (!state.session || state.streamJob || !text(question)) return false;
    try {
      const conf = await loadAiConfig();
      if (!aiReady(conf)) {
        state.phase = "error";
        state.errorText = i18n("store.aiForecast.configurationRequired", "预测需要先配置 AI 服务。");
        updateUi(state);
        return false;
      }
      const messages = [
        ...normalizeMessages(state.session.messages),
        { role: "user", content: text(question) },
      ];
      return streamConversation(state, conf, messages, false);
    } catch (error) {
      state.phase = "error";
      state.errorText = text(error?.message) || i18n("store.aiForecast.followupFailed", "AI 追问失败，请稍后重试。");
      updateUi(state);
      return false;
    }
  }

  async function openDialog(state, trigger) {
    if (state.disposed) return;
    const dialog = createDialog(state);
    state.previousFocus = trigger || document.activeElement;
    dialog.hidden = false;
    document.documentElement.classList.add("st-ai-forecast-dialog-open");
    renderDialog(state);
    dialog.querySelector(".st-ai-forecast-dialog__panel")?.focus?.();
    await state.sessionPromise;
    if (!state.session && !state.initialAttempted && dataState(state) === "ready") {
      void startInitialForecast(state);
    }
  }

  function beginSessionLoad(state) {
    if (state.sessionPromise) return state.sessionPromise;
    state.sessionPromise = readSession(state.key, state.entityKey)
      .then((session) => {
        if (state.disposed) return null;
        state.session = session;
        state.sessionLoaded = true;
        state.phase = session ? "ready" : "idle";
        updateUi(state);
        return session;
      })
      .catch((error) => {
        if (state.disposed) return null;
        state.sessionLoaded = true;
        state.phase = "idle";
        state.persistenceError = i18n("store.aiForecast.sessionUnavailable", "AI 预测记录暂时无法读取。");
        log?.warn?.("ai-forecast-session-load-failed", "AI 未来打折预测会话读取失败", {
          appid: Number(state.pageInfo?.appId || state.pageInfo?.appid || state.pageInfo?.id) || 0,
          error,
        });
        updateUi(state);
        return null;
      });
    return state.sessionPromise;
  }

  function render(root, wrap, result = {}, pageInfo = {}) {
    if (!root || !wrap) return null;
    if (result?.ok !== true) {
      const current = states.get(root);
      current?.card?.remove?.();
      if (current) current.card = null;
      return null;
    }
    if (!root.parentNode) return null;
    const state = stateFor(root, result, pageInfo);
    state.card?.remove?.();
    const card = el("article", "st-data-display-ai-card");
    const header = el("div", "st-data-display-ai-card__header");
    const title = el("div", "st-data-display-ai-card__title", i18n("store.aiForecast.title", "AI 预测"));
    const button = el("button", "st-data-display-ai-card__detail-button", i18n("store.aiForecast.dialogDetails", "对话详情"));
    button.type = "button";
    button.addEventListener("click", () => {
      void openDialog(state, button);
    });
    header.append(title, button);
    card.append(header, el("div", "st-data-display-ai-card__summary"));
    root.parentNode.insertBefore(card, root.nextSibling);
    state.card = card;
    beginSessionLoad(state);
    updateCard(state);
    return card;
  }

  function dispose(root) {
    const state = states.get(root);
    if (!state) return;
    state.disposed = true;
    state.streamJob?.cancel?.();
    clearStreamRenderTimer(state);
    state.card?.remove?.();
    state.dialog?.remove?.();
    document.documentElement.classList.remove("st-ai-forecast-dialog-open");
    states.delete(root);
  }

  api.features = api.features || {};
  api.features.dataDisplayAiForecast = Object.freeze({
    render,
    dispose,
  });
})();
