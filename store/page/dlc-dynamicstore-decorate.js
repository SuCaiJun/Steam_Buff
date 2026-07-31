/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : DLC 动态商店数据标记脚本
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(function() {
    const script = document.currentScript;
    const eventName = script?.dataset.event || 'STStoreDLCDecorateDone';
    const id = script?.dataset.id || '';
    const userdataBase = script?.dataset.userdataBase || '';
    const FETCH_TIMEOUT_MS = 12 * 1000;

    function done(ok) {
        window.dispatchEvent(new CustomEvent(eventName, {
            detail: { id, ok: !!ok }
        }));
    }

    function mapData(items) {
        const out = {};
        if (!items || !items.length) return out;
        for (let i = 0; i < items.length; i++) {
            out[items[i]] = true;
        }
        return out;
    }

    function countryCode() {
        const scripts = Array.from(document.scripts).map(item => item.textContent || '');
        const init = scripts.find(text => text.includes('GDynamicStore.Init(')) || '';
        const match = init.match(/GDynamicStore\.Init\(\s*[^,]+,\s*[^,]+,\s*["'][^"']*["']\s*,[\s\S]*?,\s*['"]([A-Z]{2})['"]/);
        if (match) return match[1];

        const cookie = document.cookie.match(/(?:^|;\s*)steamCountry=([^;]+)/);
        if (!cookie) return 'CN';
        return decodeURIComponent(cookie[1]).slice(0, 2).toUpperCase() || 'CN';
    }

    function versionParam() {
        try {
            return window.WebStorage?.GetLocal?.('unUserdataVersion') || '';
        } catch (error) {
            return '';
        }
    }

    async function fetchWithTimeout(url, init) {
        if (typeof AbortController !== 'function') {
            return fetch(url, init);
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            // ⚠️ 例外：该脚本运行在 Steam 主世界，必须复用页面 GDynamicStore 会话状态。
            return await fetch(url, { ...init, signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
    }

    async function refreshUserData() {
        const account = window.g_AccountID || 0;
        if (!account || !window.GDynamicStore) return;

        const base = String(userdataBase || '').trim();
        if (!base) return;
        let url = `${base}?id=${encodeURIComponent(String(account))}&cc=${encodeURIComponent(countryCode())}`;
        const version = parseInt(versionParam(), 10);
        if (Number.isFinite(version) && version > 0) {
            url += `&v=${encodeURIComponent(String(version))}`;
        }

        const response = await fetchWithTimeout(url, {
            credentials: 'include',
            cache: 'no-store'
        });
        if (!response.ok) return;

        const data = await response.json();
        window.GDynamicStore.s_rgWishlist = mapData(data.rgWishlist);
        window.GDynamicStore.s_rgOwnedPackages = mapData(data.rgOwnedPackages);
        window.GDynamicStore.s_rgOwnedApps = mapData(data.rgOwnedApps);
        window.GDynamicStore.s_rgMasterSubApps = mapData(data.rgMasterSubApps);
        window.GDynamicStore.s_rgAutoGrantApps = mapData(data.rgAutoGrantApps);
        window.GDynamicStore.s_rgPackagesInCart = mapData(data.rgPackagesInCart);
        window.GDynamicStore.s_rgAppsInCart = mapData(data.rgAppsInCart);
        window.GDynamicStore.s_rgIgnoredApps = data.rgIgnoredApps || {};
        window.GDynamicStore.s_rgIgnoredPackages = data.rgIgnoredPackages || {};
    }

    async function run() {
        const section = document.querySelector('.game_area_dlc_section');
        if (!section || !window.GDynamicStore?.DecorateDynamicItems || !window.$J) {
            done(false);
            return;
        }

        try {
            await refreshUserData();
        } catch (error) {
          void error;
        }

        // Steam 的 DLC 在库/愿望单角标由主上下文的 GDynamicStore 异步补齐。
        window.GDynamicStore.DecorateDynamicItems(window.$J(section), true);
        done(true);
    }

    try {
        run().catch(() => {
            try {
                const section = document.querySelector('.game_area_dlc_section');
                window.GDynamicStore?.DecorateDynamicItems?.(window.$J(section), true);
            } catch (error) {
              void error;
            }
            done(false);
        });
    } catch (error) {
        done(false);
    }
})();
