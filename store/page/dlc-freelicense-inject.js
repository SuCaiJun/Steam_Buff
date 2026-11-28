/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : DLC 免费领取主上下文脚本
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */

(() => {
    'use strict';
    function diagnostic(error) {
        // Chromium 的 JSON 语法错误可能包含响应正文。保留错误类型、调用栈及对应操作。
        if (error.name === 'SyntaxError') {
            const message = 'Steam 数据格式错误';
            const frames = String(error.stack || '').split('\n').filter(line => /^\s+at /.test(line));
            return { name: error.name, message, stack: [error.name + ': ' + message, ...frames].join('\n') };
        }
        return { name: error.name, message: error.message, stack: error.stack };
    }

    // Steam 商店的 AddFreeLicense 对每个包提交一次；9 和 24 来自它的失败回调。
    async function submit(subid, sessionid, approval) {
        if (approval) {
            const key = Symbol.for("SteamBuff.free-license-preflight");
            const proof = window[key];
            if (!proof || proof.id !== approval.id || proof.subid !== subid || !proof.current() || Date.now() >= proof.expiresAt) {
                return { status: 'failed', labelId: 'stale', sent: false };
            }
            delete window[key];
            sessionid = window.g_sessionID;
        }
        const signal = AbortSignal.timeout(12_000);
        let response;
        try {
            // ⚠️ 例外：免费 DLC 领取必须在页面主上下文携带 Steam sessionid。
            response = await fetch('/freelicense/addfreelicense/' + subid, {
                method: 'POST', credentials: 'same-origin', redirect: 'manual', signal,
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                body: new URLSearchParams({ ajax: 'true', sessionid }),
            });
            if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
                return { status: 'unconfirmed', labelId: 'redirected', stop: true };
            }
            if (response.ok) return { status: 'unconfirmed', verify: true };
            if (response.status === 429) return { status: 'failed', labelId: 'rateLimit', stop: true };
            const body = await response.text();
            if (body.trimStart().startsWith('{')) {
                const data = JSON.parse(body);
                if (data.purchaseresultdetail === 9) return { status: 'owned' };
                if (data.purchaseresultdetail === 24) return { status: 'failed', labelId: 'baseRequired' };
            }
        } catch (error) {
            // Steam 的错误页可能是 HTML 或无效 JSON；HTTP 错误在下方照实返回。
            if (!(error instanceof SyntaxError && response && !response.ok)) {
                if (!(error instanceof TypeError) && !signal.aborted) throw error;
                return { status: 'unconfirmed', labelId: 'networkUnconfirmed', stop: true,
                    error: { name: error.name, message: error.message, stack: error.stack } };
            }
        }
        return { status: response.status >= 500 ? 'unconfirmed' : 'failed', labelId: 'http',
            http: response.status, stop: response.status >= 500 || response.status === 401 };
    }

    if (typeof document === 'undefined') {
        globalThis.STSteamFreeLicense = Object.freeze({ submit });
        return;
    }
    const script = document.currentScript;
    const batchId = script.dataset.batchId;
    const results = [];
    const timeoutMs = 12_000;

    function emit(type, data) {
        document.dispatchEvent(new CustomEvent('STStoreFreeDLCClaim', { detail: { type, batchId, ...data } }));
    }

    // 2xx 只说明提交已返回。批次结束时只读一次当前账户的包列表，按 subid 核对。
    async function ownedPackages(account) {
        const config = document.getElementById('application_config')?.dataset.config;
        const country = config && JSON.parse(config).COUNTRY;
        if (!account || window.g_AccountID !== account || !/^[A-Z]{2}$/.test(country)) {
            throw new Error('缺少核对 Steam 所有权所需的账号或商店地区');
        }
        const url = new URL(script.dataset.userdataBase);
        if (url.origin !== location.origin) throw new Error('Steam 所有权核对地址无效');
        url.searchParams.set('id', account);
        url.searchParams.set('cc', country);
        const version = window.WebStorage?.GetLocal('unUserdataVersion');
        if (version) url.searchParams.set('v', version);
        // ⚠️ 例外：读取当前登录用户的 Steam 动态商店包列表只用于本次领取结果核对。
        const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
        if (!response.ok || response.redirected) throw new Error('Steam 所有权核对失败，HTTP ' + response.status);
        const { rgOwnedPackages } = await response.json();
        if (!Array.isArray(rgOwnedPackages) || !rgOwnedPackages.every(id => Number.isSafeInteger(id) && id > 0)) {
            throw new Error('Steam 未返回有效的已拥有包 ID 列表');
        }
        return new Set(rgOwnedPackages);
    }

    async function run() {
        const items = JSON.parse(script.dataset.items);
        const ids = new Set();
        for (const item of items) {
            const subid = Number(item.subid);
            if (!Number.isSafeInteger(subid) || subid <= 0 || ids.has(subid)) throw new Error('免费 DLC 包 ID 无效或重复');
            ids.add(subid);
            results.push({ ...item, subid, status: 'unattempted' });
        }
        const account = window.g_AccountID;
        const sessionid = window.g_sessionID;
        if (!account || !sessionid) {
            emit('done', { results, labelId: 'sessionId' });
            return;
        }
        for (const [index, item] of results.entries()) {
            emit('progress', { index: index + 1, name: item.name });
            item.status = 'unconfirmed';
            Object.assign(item, await submit(item.subid, sessionid));
            if (item.stop) break;
            if (index + 1 < results.length) await new Promise(resolve => setTimeout(resolve, 900));
        }
        const pending = results.filter(item => item.verify);
        if (pending.length || results.some(item => item.status === 'owned')) {
            window.GDynamicStore?.InvalidateCache();
            window.StoreItemCache?.ResetCache?.();
        }
        if (pending.length) {
            emit('checking');
            const owned = await ownedPackages(account);
            for (const item of pending) {
                if (owned.has(item.subid)) item.status = 'confirmed';
            }
        }
        emit('done', { results });
    }

    // 跨主世界边界交回已处理项目和真实异常，操作界面负责显示结果和写诊断日志。
    function reportFailure(error) {
        emit('error', { results, error: diagnostic(error) });
    }
    run().catch(reportFailure);
})();
