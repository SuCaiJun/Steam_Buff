# Images 资源

扩展随包图片。这里不放业务逻辑，只保存被 `manifest.json`、设置中心、翻译模块和页面功能引用的静态资源。

## 目录

```text
images/
├── icon.png             扩展图标
├── Settings.svg         设置入口
├── TOP.svg              回到顶部
├── commentFilter.svg    评论过滤入口
├── tip.svg              提示图标
├── trans.svg            划词翻译入口
├── translate.svg        翻译图标
├── close.svg            关闭按钮
├── search.png           搜索相关图片
├── itad.png             第三方来源标识
└── mc_logo_no_text.png  第三方来源标识
```

## 使用方式

图片通常通过 `chrome.runtime.getURL()` 或 `manifest.json` 的 `icons` / `web_accessible_resources` 引用。设置中心资源封装在 `settings/ui/assets.js`，翻译入口图标在 `translate/runner.js` 中使用。

## 开发要点

- 新图片先确认是否已有资源可复用。
- 页面脚本需要访问的新资源，要同步 `manifest.json.web_accessible_resources`。
- 第三方图片要在工作区 `docs/third-party-licenses/` 记录来源和许可。
- 删除图片前先 `rg` 检查引用。
