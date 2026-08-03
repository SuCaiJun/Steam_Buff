xnx3 translate.js 4.0.0.20260210

来源: https://github.com/xnx3/translate
包名: i18n-jsautotranslate@4.0.0
打包文件: package/index.js -> translate.js
许可证: MIT，见 LICENSE。

本地补丁:

- 删除 Steam Buff 未调用的远程调试 UI 与动态脚本加载入口。
- 删除 Steam Buff 未调用的离线配置导出面板、`msg.js` 远程加载器和同步脚本执行器。
- 保留 `translate.offline.append`、`fullExtract` 与正常翻译能力。

Steam Buff 在 translate/runner.js 运行时关闭上游 init.json 版本探测
