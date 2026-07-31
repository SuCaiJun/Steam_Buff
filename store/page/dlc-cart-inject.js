/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : DLC 购物车主上下文脚本
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */


(function() {
    const currentScript = document.currentScript;
    const eventName = currentScript?.dataset.event || 'STStoreDLCCartDone';
    const id = currentScript?.dataset.id || '';

    function done(ok, error) {
        window.dispatchEvent(new CustomEvent(eventName, {
            detail: {
                id,
                ok: ok === true,
                error: error ? {
                    name: error?.name || 'Error',
                    message: error?.message || String(error),
                    stack: error?.stack || '',
                } : null,
            },
        }));
    }

    if (!currentScript || !currentScript.dataset.subids) {
        done(false, new Error('DLC 购物车请求参数缺失'));
        return;
    }

    try {
        const subids = JSON.parse(currentScript.dataset.subids);
        
        if (!Array.isArray(subids) || subids.length === 0) {
            throw new TypeError('DLC 购物车请求项目为空');
        }

        // AddItemToCart 是页面主上下文里的 Steam 函数，内容脚本不能直接调用。
        const subidToAdd = subids.length === 1 ? subids[0] : subids;
        
        if (typeof AddItemToCart !== 'function') {
            throw new Error('Steam AddItemToCart 接口不可用');
        }

        AddItemToCart(subidToAdd, undefined, undefined);
        done(true);
    } catch (error) {
        done(false, error);
    }
})();
