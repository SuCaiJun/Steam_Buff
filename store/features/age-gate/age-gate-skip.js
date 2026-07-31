/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 商店年龄验证跳过
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";

  window.STStore = window.STStore || {};
  if (window.STStore.ageGateSkipStarted) return;
  window.STStore.ageGateSkipStarted = true;

    const AGE_CHECK_PATH_RE = /^\/agecheck\/(app|sub|bundle)\/\d+\/?/;
    const AGE_TRY_KEY = "shp_age_cookie_attempt:";
    const AGE_TRY_TTL = 15000;
    const ADULT_BIRTH_YEAR = 1996;
    const ADULT_BIRTH_MONTH = 7;
    const ADULT_BIRTH_DAY = 1;

    function isAgeCheckPage() {
        return AGE_CHECK_PATH_RE.test(location.pathname);
    }

    function setAdultContentCookies() {
        const birthTime = Math.floor(new Date(ADULT_BIRTH_YEAR, ADULT_BIRTH_MONTH - 1, ADULT_BIRTH_DAY).getTime() / 1000);
        const expiry = new Date();
        expiry.setFullYear(expiry.getFullYear() + 1);

        const cookieSuffix = `expires=${expiry.toUTCString()}; path=/; SameSite=Lax; Secure`;
        document.cookie = `birthtime=${birthTime}; ${cookieSuffix}`;
        document.cookie = `wants_mature_content=1; ${cookieSuffix}`;
    }

    function getAgeCheckRedirectUrl() {
        const url = new URL(location.href);
        url.pathname = url.pathname.replace(/^\/agecheck(?=\/)/, "");
        return url.toString();
    }

    function recentTry() {
        try {
            const value = Number(sessionStorage.getItem(getAgeCookieAttemptKey()) || 0);
            return value > 0 && Date.now() - value < AGE_TRY_TTL;
        } catch (error) {
            return false;
        }
    }

    function getAgeCookieAttemptKey() {
        const url = new URL(getAgeCheckRedirectUrl());
        return `${AGE_TRY_KEY}${url.pathname}${url.search}`;
    }

    function markAgeCookieAttempt() {
        try {
            sessionStorage.setItem(getAgeCookieAttemptKey(), String(Date.now()));
        } catch (error) {
        }
    }

    function clearAgeCookieAttempt() {
        try {
            sessionStorage.removeItem(getAgeCookieAttemptKey());
        } catch (error) {
        }
    }

    function redirectAgeCheckPage(markAttempt = false) {
        const redirectUrl = new URL(getAgeCheckRedirectUrl());
        if (markAttempt) {
            markAgeCookieAttempt();
        }

        const targetUrl = redirectUrl.toString();
        if (targetUrl !== location.href) {
            location.replace(targetUrl);
        }
    }

    function setSelectOption(select, candidates) {
        if (!select) return false;

        const normalizedCandidates = candidates.map(candidate => String(candidate).trim().toLowerCase());
        const option = Array.from(select.options || []).find(item => {
            const value = String(item.value || "").trim().toLowerCase();
            const text = String(item.textContent || "").trim().toLowerCase();
            return normalizedCandidates.includes(value) || normalizedCandidates.includes(text);
        });

        if (!option) return false;

        select.value = option.value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
    }

    function fillAgeCheckForm() {
        const daySelect = document.querySelector("#ageDay, select[name='ageDay']");
        const monthSelect = document.querySelector("#ageMonth, select[name='ageMonth']");
        const yearSelect = document.querySelector("#ageYear, select[name='ageYear']");

        const dayReady = setSelectOption(daySelect, [ADULT_BIRTH_DAY, `0${ADULT_BIRTH_DAY}`]);
        const monthReady = setSelectOption(monthSelect, [
            ADULT_BIRTH_MONTH,
            `0${ADULT_BIRTH_MONTH}`,
            "July",
            "Jul",
            "7月",
            "七月"
        ]);
        const yearReady = setSelectOption(yearSelect, [ADULT_BIRTH_YEAR]);

        return dayReady && monthReady && yearReady;
    }

    function clickSubmit() {
        const button = document.querySelector(
            "#view_product_page_btn, " +
            "#agecheck_form button[type='submit'], " +
            "#agecheck_form a[onclick*='ViewProductPage'], " +
            "button[onclick*='ViewProductPage'], " +
            "a[onclick*='ViewProductPage']"
        );
        if (!button) return false;

        button.click();
        return true;
    }

    function submitAgeCheckForm() {
        if (!fillAgeCheckForm()) return false;
        if (clickSubmit()) return true;

        const form = document.querySelector("#agecheck_form, form[action*='agecheck']");
        if (form && typeof form.requestSubmit === "function") {
            form.requestSubmit();
            return true;
        }

        return false;
    }

    function ageCheckObserverTarget() {
        return document.querySelector("#agecheck_form")
            || document.querySelector(".agegate_birthday_selector")
            || document.getElementById("responsive_page_template_content")
            || document.querySelector(".page_content")
            || null;
    }

    function contentWarningObserverTarget() {
        return document.querySelector(".contentcheck_desc_ctn")
            || document.getElementById("responsive_page_template_content")
            || document.querySelector(".page_content")
            || null;
    }

    function skipAgeCheckPage() {
        if (!isAgeCheckPage()) return false;

        setAdultContentCookies();

        if (!recentTry()) {
            redirectAgeCheckPage(true);
            return true;
        }

        clearAgeCookieAttempt();

        let handled = false;
        let observer = null;

        function stop() {
            handled = true;
            if (observer) observer.disconnect();
        }

        function trySubmit() {
            if (handled) return;
            if (!submitAgeCheckForm()) return;

            clearAgeCookieAttempt();
            stop();
            setTimeout(() => {
                if (isAgeCheckPage()) {
                    redirectAgeCheckPage();
                }
            }, 800);
        }

        function startObserver() {
            if (handled || observer) return;
            const target = ageCheckObserverTarget();
            if (!target) return;
            observer = window.STObserverUtils?.createDebouncedObserver?.(trySubmit, 80)
                || new MutationObserver(trySubmit);
            // 只监听年龄验证表单或商店主内容区域，等待下拉框/提交按钮挂载。
            observer.observe(target, {
                childList: true,
                subtree: true
            });
        }

        trySubmit();

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => {
                trySubmit();
                startObserver();
            }, { once: true });
        } else {
            startObserver();
        }

        setTimeout(() => {
            if (!handled) {
                stop();
                redirectAgeCheckPage();
            }
        }, 1000);

        return true;
    }

    function clickProceed() {
        const container = document.querySelector(".contentcheck_desc_ctn");
        if (!container) return false;

        const proceedButton = container.querySelector(
            'button[onclick^="Proceed"], a[onclick^="Proceed"], .btnv6_blue_hoverfade[onclick^="Proceed"]'
        );
        if (!proceedButton) return false;

        setAdultContentCookies();
        proceedButton.click();
        return true;
    }

    function observeContentWarning() {
        let observer = null;
        let stopped = false;
        const stopAt = Date.now() + 10000;

        function stop() {
            stopped = true;
            if (observer) observer.disconnect();
        }

        function tryClick() {
            if (stopped) return;
            if (clickProceed() || Date.now() > stopAt) {
                stop();
            }
        }

        function startObserver() {
            if (stopped || observer) return;
            const target = contentWarningObserverTarget();
            if (!target) return;
            observer = window.STObserverUtils?.createDebouncedObserver?.(tryClick, 80)
                || new MutationObserver(tryClick);
            // 只监听内容警告区域或商店主内容区域，等待继续按钮挂载。
            observer.observe(target, {
                childList: true,
                subtree: true
            });
        }

        tryClick();
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", startObserver, { once: true });
        } else {
            startObserver();
        }
        setTimeout(stop, 10000);
    }

    if (skipAgeCheckPage()) return;

    clearAgeCookieAttempt();

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", observeContentWarning, { once: true });
    } else {
        observeContentWarning();
    }
})();
