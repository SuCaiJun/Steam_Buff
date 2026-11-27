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

  const MARK = "__steamBuffOnboardingBridgeV2";
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
  if (current.origin !== cfg.urls.onboardingOrigin || current.pathname !== cfg.urls.onboardingPath) return;

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

  const languageOptions = document.getElementById("wizard-language-options");
  let localeState = "";
  let confirmedLanguage = false;
  function publishBridgeState(state) {
    if (!languageOptions) return;
    progress.dataset.bridgeState = state;
    progress.dispatchEvent(new Event("wizard-bridge-state"));
  }

  function publishLocale(state, value = "") {
    localeState = state;
    if (state === "saved") confirmedLanguage = true;
    if (state === "choose" || state === "read-error") confirmedLanguage = false;
    languageOptions.dataset.sync = state;
    languageOptions.dataset.value = value;
    languageOptions.dispatchEvent(new Event("wizard-locale-state"));
  }

  function canOpenSettings() {
    return !languageOptions || (confirmedLanguage && localeState !== "reading" && localeState !== "saving");
  }

  function setupLanguage() {
    if (!languageOptions) return;
    const buttons = Array.from(languageOptions.querySelectorAll("button[value]"));
    // 捕获真实按钮操作并先标记写入中，网页收到保存回执后才可进入本地页
    let pending = false;
    async function sync(type, value) {
      if (pending) return;
      pending = true;
      const write = type === contract.MESSAGES.setLocale;
      publishLocale(write ? "saving" : "reading", value);
      try {
        const reply = await chrome.runtime.sendMessage(write ? { type, locale: value } : { type });
        if (!reply?.success || !buttons.some(button => button.value === reply.locale)
            || (write && reply.locale !== value)) throw new Error(reply?.error || "引导语言确认失败");
        if (!write) languageOptions.dataset.setupComplete = String(reply.setupComplete === true);
        publishLocale(!write && reply.confirmed === false ? "choose" : "saved", reply.locale);
      } catch (error) {
        globalThis.STLoggerFactory.reportError(error, { domain: "onboarding", feature: "bridge", event: "onboarding-locale-failed", message: "安装引导语言同步失败" });
        publishLocale(write ? "error" : "read-error", value);
      } finally {
        pending = false;
      }
    }
    const retry = document.getElementById("wizard-language-retry");
    languageOptions.addEventListener("click", event => {
      if (!event.isTrusted || pending || (retry && localeState === "read-error") || !buttons.includes(event.target)) return;
      void sync(contract.MESSAGES.setLocale, event.target.value);
    }, true);
    retry?.addEventListener("click", event => {
      if (event.isTrusted && localeState === "read-error") void sync(contract.MESSAGES.getLocale);
    });
    void sync(contract.MESSAGES.getLocale);
  }

  function reportFailure(error, focus) {
    globalThis.STLoggerFactory.reportError(error, { domain: "onboarding", feature: "bridge", event: "handoff-failed", message: "打开扩展本地引导页失败" });
    const heading = progress.dataset.openFailed;
    const message = heading || error.message;
    void globalThis.STOnboardingPrompt.show({
      message,
      title: progress.dataset.noticeTitle,
      closeLabel: progress.dataset.noticeClose,
      confirmLabel: progress.dataset.noticeConfirm,
      focus,
    });
    note.replaceChildren(...noteContent.map(node => node.cloneNode(true)));
    note.classList.remove("is-pending", "error");
    handoff.disabled = false;
    publishBridgeState("ready");
  }

  function sendLocal(page, index, focus) {
    try {
      chrome.runtime.sendMessage({
        type: contract.MESSAGES.openLocalPage,
        page,
        pageCount,
        localIndex: index,
      }, (response) => {
        const error = chrome.runtime.lastError;
        if (error || !response?.success) {
          reportFailure(new Error(error?.message || response?.error || progress.dataset.openFailed || "扩展本地引导页打开失败，请重试。"), focus);
        }
      });
    } catch (error) {
      reportFailure(error, focus);
    }
  }

  // 云端页使用固定官方 URL，本地页只发送经过 contract 验证的索引
  function routePage(page, focus = handoff) {
    if (page <= pageCount) {
      window.location.assign(cfg.urls.onboardingPage(page));
      return;
    }
    const index = contract.localIndexForPage(page, pageCount);
    if (index >= 0 && !canOpenSettings()
        && contract.readPage(current.href).page <= pageCount) return;
    if (index >= 0) sendLocal(page, index, focus);
  }

  function progressButton(page, activePage) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "progress-segment";
    button.dataset.progressSegment = "";
    button.dataset.page = String(page);
    const index = contract.localIndexForPage(page, pageCount);
    const title = index >= 0 ? contract.LOCAL_STEPS[index].title : "网页介绍";
    if (index >= 0) button.dataset.localStep = contract.LOCAL_STEPS[index].id;
    button.setAttribute("aria-label", `第 ${page} 步：${title}`);
    button.classList.toggle("is-complete", page <= activePage);
    if (page === activePage) button.setAttribute("aria-current", "step");
    button.addEventListener("click", (event) => {
      if (!event.isTrusted || page === activePage) return;
      routePage(page, button);
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
    publishBridgeState("invalid");
  }

  function setUnavailable() {
    handoff.disabled = false;
    handoff.textContent = "重试连接";
    note.textContent = "扩展导航暂不可用，点击“重试连接”重试。";
    note.classList.remove("is-pending");
    note.classList.add("error");
    publishBridgeState("unavailable");
  }

  // 注: 只有 flow.json 验证成功后才追加本地进度；失败时不能猜云端页数。
  async function loadFlow() {
    if (loading) return;
    loading = true;
    handoff.disabled = true;
    publishBridgeState("loading");
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
        renderProgress(0);
        showInvalid();
        return;
      }
      renderProgress(result.page);
      handoff.disabled = false;
      handoff.textContent = handoffLabel;
      note.replaceChildren(...noteContent.map(node => node.cloneNode(true)));
      note.classList.remove("error");
      publishBridgeState("ready");
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
    if (!canOpenSettings()) return;
    if (page) {
      handoff.disabled = true;
      note.textContent = "正在打开本地配置…";
      note.classList.remove("error", "is-pending");
      publishBridgeState("opening");
      routePage(page);
    }
  });

  setupLanguage();
  loadFlow();
})();
