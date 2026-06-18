/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : DLC 免费领取主上下文脚本
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */


(function() {
    const EVENT_NAME = 'STStoreFreeDLCClaim';
    const REQUEST_TIMEOUT_MS = 12 * 1000;
    const currentScript = document.currentScript;

    // 免费 DLC 领取必须在页面主上下文读取 g_sessionID 并复用 Steam 会话。
    function emit(detail) {
        document.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function getSessionId() {
        if (typeof window.g_sessionID === 'string' && window.g_sessionID) {
            return window.g_sessionID;
        }

        const match = document.cookie.match(/(?:^|;\s*)sessionid=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : '';
    }

    function parseResponseText(text) {
        if (!text) return null;

        try {
            return JSON.parse(text);
        } catch (error) {
            return null;
        }
    }

    function classifyResponse(response, bodyText) {
        const data = parseResponseText(bodyText);
        const lowerText = (bodyText || '').toLowerCase();

        if (!response.ok) {
            return {
                ok: false,
                retryable: response.status === 429 || response.status >= 500,
                message: `HTTP ${response.status}`
            };
        }

        if (lowerText.includes('add_free_content_success_area')) {
            return { ok: true, alreadyOwned: false, message: '领取成功' };
        }

        if (lowerText.includes('error_box')) {
            return { ok: false, retryable: false, message: 'Steam返回错误页面' };
        }

        if (Array.isArray(data)) {
            return { ok: true, alreadyOwned: false, message: '领取成功' };
        }

        const detail = Number(data?.purchaseresultdetail ?? data?.purchase_result_details ?? data?.result);
        if (detail === 0 || data?.success === true || data?.success === 1) {
            return { ok: true, alreadyOwned: false, message: '领取成功' };
        }

        if (detail === 9) {
            return { ok: true, alreadyOwned: true, message: '已拥有' };
        }

        if (detail === 53) {
            return { ok: false, retryable: true, message: '请求过于频繁' };
        }

        if (Number.isFinite(detail)) {
            return { ok: false, retryable: false, message: `Steam返回代码 ${detail}` };
        }

        return {
            ok: false,
            retryable: false,
            message: bodyText ? bodyText.slice(0, 120) : 'Steam未返回可识别结果'
        };
    }

    async function fetchWithTimeout(url, init) {
        if (typeof AbortController !== 'function') {
            return fetch(url, init);
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            // ⚠️ 例外：免费 DLC 领取必须在页面主上下文携带 Steam sessionid。
            return await fetch(url, { ...init, signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
    }

    async function postForm(url, params) {
        const response = await fetchWithTimeout(url, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: new URLSearchParams(params).toString()
        });

        const bodyText = await response.text();
        return classifyResponse(response, bodyText);
    }

    async function requestFreeLicense(subid, sessionid) {
        const endpoints = [
            {
                url: `/checkout/addfreelicense/${encodeURIComponent(subid)}`,
                params: { ajax: 'true', sessionid }
            },
            {
                url: '/checkout/addfreelicense',
                params: { action: 'add_to_cart', sessionid, subid }
            },
            {
                url: `/freelicense/addfreelicense/${encodeURIComponent(subid)}`,
                params: { ajax: 'true', sessionid }
            }
        ];

        let lastResult = null;
        for (const endpoint of endpoints) {
            try {
                const result = await postForm(endpoint.url, endpoint.params);
                if (result.ok || result.retryable) return result;
                lastResult = result;
            } catch (error) {
                lastResult = {
                    ok: false,
                    retryable: true,
                    message: error.message || '网络请求失败'
                };
            }
        }

        return lastResult || { ok: false, retryable: false, message: '领取请求失败' };
    }

    async function claimOne(item, sessionid, maxRetries) {
        let result = null;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            result = await requestFreeLicense(item.subid, sessionid);
            if (result.ok || !result.retryable) break;
            await sleep(800 + attempt * 700);
        }

        return {
            ...item,
            ok: !!result?.ok,
            alreadyOwned: !!result?.alreadyOwned,
            message: result?.message || '未知错误'
        };
    }

    async function run() {
        const batchId = currentScript?.dataset.batchId || '';
        let items = [];

        try {
            items = JSON.parse(currentScript?.dataset.items || '[]');
        } catch (error) {
            emit({ type: 'error', batchId, message: '领取参数解析失败' });
            return;
        }

        items = items
            .map(item => ({
                subid: parseInt(item.subid, 10),
                name: item.name || `Package ${item.subid}`
            }))
            .filter(item => Number.isFinite(item.subid) && item.subid > 0);

        const sessionid = getSessionId();
        if (!sessionid) {
            emit({ type: 'error', batchId, message: '无法读取 Steam sessionid' });
            return;
        }

        const delayMs = Math.max(300, parseInt(currentScript?.dataset.delayMs || '800', 10));
        const maxRetries = Math.max(0, parseInt(currentScript?.dataset.maxRetries || '2', 10));
        const results = [];

        emit({ type: 'start', batchId, total: items.length });

        for (let index = 0; index < items.length; index++) {
            const item = items[index];
            emit({ type: 'progress', batchId, index: index + 1, total: items.length, item });

            const result = await claimOne(item, sessionid, maxRetries);
            results.push(result);
            emit({ type: 'item', batchId, index: index + 1, total: items.length, result });

            if (index < items.length - 1) {
                await sleep(delayMs);
            }
        }

        try { window.GDynamicStore?.InvalidateCache?.(); } catch (error) { void error; }
        try { window.StoreItemCache?.ResetCache?.(); } catch (error) { void error; }
        emit({ type: 'done', batchId, total: items.length, results });
    }

    run().catch(error => {
        emit({
            type: 'error',
            batchId: currentScript?.dataset.batchId || '',
            message: error.message || '批量领取执行失败'
        });
    });
})();
