/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 消息数据库第五版的一次性历史转换
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  // 冻结升级快照；历史记录统一成为只读通知，不注册旧来源或恢复旧按钮
  function version5(value) {
    const automation = value.source === "Steam Buff" && value.type.startsWith("automation-");
    const update = value.source === "Steam Buff" && value.type.startsWith("extension-update-");
    const family = value.source === "Steam Buff" && value.type.startsWith("family-library-");
    const moduleId = automation ? "automation" : update ? "update" : "history";
    const moduleTitle = automation ? "自动化" : update ? "更新提醒" : family ? "家庭库自动更新" : value.source;
    const content = value.format === 2 ? value.body
      : [value.title, value.summary, value.body].filter((item, index, all) => item && all.indexOf(item) === index).join("\n");
    const oldLevel = value.result ?? (value.type === "extension-update-installed" ? "success"
      : value.type === "family-library-login" || value.actions?.some(item => item.id === "retry") ? "error" : "info");
    return {
      version: 3, id: value.id, moduleId, moduleTitle,
      icon: update ? "images/icon.png" : "images/ui/message-center.svg", brand: update,
      title: value.title, body: content,
      kind: "notification", level: ["info", "success", "warning", "error"].includes(oldLevel) ? oldLevel : "info",
      scope: value.scope ?? "device", ...(value.scope === "steam-account" ? { steamAccountId: value.steamAccountId } : {}),
      context: {}, details: [{ label: "原来源", value: value.source }], createdAt: value.createdAt, unread: value.unread, readAt: value.readAt,
      ...(value.group === undefined ? {} : { group: value.group }),
    };
  }
  root.STMessageMigration = Object.freeze({ version5 });
})(globalThis);
