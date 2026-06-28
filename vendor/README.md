# Vendor 第三方库

随扩展本地打包的第三方依赖。业务代码不要直接散落第三方调用细节，优先通过对应域的适配层使用。

## 目录

```text
vendor/
├── fflate/             ZIP 压缩，用于诊断包导出
├── pinyin-pro/         拼音转换，用于中文名、助记符、搜索
├── qrcode-generator/   二维码生成，用于账号或设备登录 UI
└── xnx3-translate/     translate.js 本地库，用于页面翻译
```

每个库目录应保留：

```text
LICENSE     原始许可证
version.md  版本和来源说明
*.js        本地打包代码
```

## 使用关系

```text
pinyin-pro          steam/library-custom-name、store/search-suggestions
fflate              settings/diagnostics-export.js、诊断包导出
qrcode-generator    extension/runtime/qrcode.js、账号相关页面
xnx3-translate      translate/vendor-wrapper.js、translate/runner.js
```

## 开发要点

- 不要直接改第三方源码塞业务逻辑；业务适配放在本项目代码里。
- 新库需要页面访问时，同步 `manifest.json.web_accessible_resources`。
