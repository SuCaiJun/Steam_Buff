/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 正式云端引导页与扩展本地步骤之间的固定桥接
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  const MARK = "__steamBuffOnboardingBridgeV1";
  if (globalThis[MARK]) return;
  globalThis[MARK] = true;

  const cfg = globalThis.STConfig;
  const contract = globalThis.STOnboardingContract;
  if (!cfg?.urls || !contract || window.top !== window) return;

  let current;
  try {
    current = new URL(window.location.href);
  } catch {
    return;
  }
  if (current.origin !== cfg.urls.onboardingOrigin || current.pathname !== "/wizard/v1/") return;

  const progress = document.getElementById("wizard-progress");
  const label = document.getElementById("step-label");
  const handoff = document.getElementById("steam-buff-start-settings");
  const note = document.getElementById("footer-note");
  if (!progress || !label || !handoff || !note) return;

  const FLOW_TIMEOUT_MS = 10_000;
  const INVALID_TITLE = "当前地址无效";
  const INVALID_COPY = "当前页面可能已失效或不存在，请点击刷新页面或返回首页。";
  const INVALID_NOTE = "当前页面已失效";
  const handoffLabel = handoff.textContent;
  const noteContent = Array.from(note.childNodes, node => node.cloneNode(true));
  let pageCount = 0;
  let loading = false;

  function showHandoffError(message) {
    note.textContent = message;
    note.classList.remove("is-pending");
    note.classList.add("error");
    handoff.disabled = false;
  }

  function sendLocal(page, index) {
    try {
      chrome.runtime.sendMessage({
        type: contract.MESSAGES.openLocalPage,
        page,
        pageCount,
        localIndex: index,
      }, (response) => {
        const error = chrome.runtime.lastError;
        if (error || !response?.success) {
          showHandoffError(error?.message || response?.error || "扩展本地引导页打开失败，请重试。");
        }
      });
    } catch (error) {
      showHandoffError(error.message || "扩展连接已失效，请刷新页面重试。");
    }
  }

  // 云端页使用固定官方 URL，本地页只发送经过 contract 验证的索引
  function routePage(page) {
    if (page <= pageCount) {
      window.location.assign(cfg.urls.onboardingPage(page));
      return;
    }
    const index = contract.localIndexForPage(page, pageCount);
    if (index >= 0) sendLocal(page, index);
  }

  function progressButton(page, activePage) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "progress-segment";
    button.dataset.progressSegment = "";
    button.dataset.page = String(page);
    const index = contract.localIndexForPage(page, pageCount);
    const title = index >= 0 ? contract.LOCAL_STEPS[index].title : "网页介绍";
    button.setAttribute("aria-label", `第 ${page} 步：${title}`);
    button.classList.toggle("is-complete", page <= activePage);
    if (page === activePage) button.setAttribute("aria-current", "step");
    button.addEventListener("click", (event) => {
      if (!event.isTrusted || page === activePage) return;
      routePage(page);
    });
    return button;
  }

  function renderProgress(activePage) {
    const total = contract.totalPageCount(pageCount);
    const fragment = document.createDocumentFragment();
    for (let page = 1; page <= total; page += 1) {
      fragment.append(progressButton(page, activePage));
    }
    progress.replaceChildren(fragment);
    progress.style.setProperty("--wizard-progress-columns", String(total));
    progress.setAttribute("aria-label", `共 ${total} 个引导步骤`);
    progress.setAttribute("aria-busy", "false");
    label.textContent = `步骤 ${activePage} / ${total}`;
  }

  function showInvalid() {
    const title = document.getElementById("rail-title");
    const copy = document.getElementById("rail-copy");
    const statusTitle = document.getElementById("wizard-status-title");
    const statusCopy = document.getElementById("wizard-status-copy");
    label.textContent = "地址无效";
    if (title) title.textContent = INVALID_TITLE;
    if (copy) copy.textContent = INVALID_COPY;
    if (statusTitle) statusTitle.textContent = INVALID_TITLE;
    if (statusCopy) statusCopy.textContent = INVALID_COPY;
    note.textContent = INVALID_NOTE;
    note.classList.remove("is-pending");
    note.classList.add("error");
  }

  function setUnavailable() {
    handoff.disabled = false;
    handoff.textContent = "重试连接";
    note.textContent = "扩展导航暂不可用，点击“重试连接”重试。";
    note.classList.remove("is-pending");
    note.classList.add("error");
  }

  // 注: 只有 flow.json 验证成功后才追加本地进度；失败时不能猜云端页数。
  async function loadFlow() {
    if (loading) return;
    loading = true;
    handoff.disabled = true;
    const abort = new AbortController();
    const timeout = window.setTimeout(() => abort.abort(), FLOW_TIMEOUT_MS);
    const requestId = globalThis.STLoggerFactory?.createRequestId?.();
    let phase = "network";
    let responseFacts;
    try {
      const response = await fetch(cfg.urls.onboardingFlow, {
        headers: { Accept: "application/json" },
        signal: abort.signal,
      });
      responseFacts = globalThis.STLoggerSchema?.httpFacts?.(response);
      phase = "http";
      if (!response.ok || !String(response.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
        throw new Error("引导配置响应无效");
      }
      phase = "parse";
      const flow = await response.json();
      responseFacts = { ...responseFacts, ...globalThis.STLoggerSchema?.resultFacts?.(flow) };
      phase = "validate";
      const value = contract.cloudPageCount(flow);
      if (!value) throw new Error("引导配置内容无效");
      pageCount = value;
      const result = contract.readPage(window.location.href);
      if (!result.ok) {
        showInvalid();
        return;
      }
      const total = contract.totalPageCount(pageCount);
      if (result.page > total) {
        showInvalid();
        renderProgress(0);
        return;
      }
      renderProgress(result.page);
      handoff.disabled = false;
      handoff.textContent = handoffLabel;
      note.replaceChildren(...noteContent.map(node => node.cloneNode(true)));
      note.classList.remove("error");
      if (result.page > pageCount) routePage(result.page);
    } catch (error) {
      if (phase === "parse" && error?.name === "SyntaxError") globalThis.STLoggerSchema?.markJsonError?.(error);
      globalThis.STLoggerFactory?.createLogger?.("onboarding", "bridge").error("onboarding-flow-load-failed", "云端引导配置加载失败", {
        requestId, phase, request: { method: "GET", endpointKey: "onboarding-flow", url: cfg.urls.onboardingFlow, timeoutMs: FLOW_TIMEOUT_MS }, response: responseFacts, error,
      });
      setUnavailable();
    } finally {
      window.clearTimeout(timeout);
      loading = false;
    }
  }

  handoff.addEventListener("click", (event) => {
    if (!event.isTrusted || handoff.disabled) return;
    if (!pageCount) {
      loadFlow();
      return;
    }
    const page = contract.pageForLocalIndex(0, pageCount);
    if (page) {
      handoff.disabled = true;
      note.textContent = "正在打开本地配置…";
      note.classList.remove("error", "is-pending");
      routePage(page);
    }
  });

  loadFlow();
})();
