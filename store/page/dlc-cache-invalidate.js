/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : DLC 缓存失效脚本
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(function() {
    try {
        window.GDynamicStore?.InvalidateCache?.();
    } catch (error) {}

    try {
        window.StoreItemCache?.ResetCache?.();
    } catch (error) {}
})();
