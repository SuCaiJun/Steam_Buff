/*
 * @Author        : 顾青离
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
    if (!currentScript || !currentScript.dataset.subids) {
        return;
    }

    try {
        const subids = JSON.parse(currentScript.dataset.subids);
        
        if (!Array.isArray(subids) || subids.length === 0) {
            return;
        }

        // AddItemToCart 是页面主上下文里的 Steam 函数，内容脚本不能直接调用。
        const subidToAdd = subids.length === 1 ? subids[0] : subids;
        
        if (typeof AddItemToCart !== 'function') {
            return;
        }

        AddItemToCart(subidToAdd, undefined, undefined);
    } catch (error) {
    }
})();
