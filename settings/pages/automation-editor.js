/*
 * @Author        : 顾青离
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 触发器管理与行式工作流编辑器
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
((root) => {
  "use strict";
  const model = root.STAutomation, flow = root.STWorkflow, instructions = root.STWorkflowInstructions, tools = root.STWorkflowTools, css = root.STComponents.css;
  let clipboard = null;
  const statuses = { queued: "排队中", held: "未启动", generating: "AI 调用中", "running-script": "脚本执行中", committing: "正在提交", "running-steam": "Steam 指令执行中",
    "preparing-notification": "消息投递中", "waiting-notification": "等待交互", "waiting-delay": "等待中",
    completed: "已完成", failed: "失败", cancelled: "已取消", expired: "已失效", uncertain: "结果待核实" };
  function runStatus(job) {
    if (job.status === "failed" && job.exception?.code === "WORKFLOW_RUN_TIMEOUT") return "超时结束";
    if (job.status === "running-script" && (job.currentAction || (job.workflow && job.flow && flow.currentNode(job.workflow, job.flow)?.action)) === "http-request") return "HTTP 请求中";
    return statuses[job.status] || job.status;
  }
  const calendar = root.STAutomationCalendar;
  const triggerModes = { manual: "手动触发", automatic: "自动触发", schedule: "定时触发" };
  const gameEvents = { added: "游戏入库", installed: "游戏安装" };
  const installStages = [["started", "开始下载"], ["completed", "安装完成"]];
  const frequencies = [["minute", "每分钟"], ["hour", "每小时"], ["day", "每天"], ["week", "每周"], ["month", "每月"], ["cron", "高级"]];
  const scheduleDefaults = {
    minute: { mode: "minute", every: 1 }, hour: { mode: "hour", minute: 0 }, day: { mode: "day", time: "09:00" },
    week: { mode: "week", weekdays: [1], time: "09:00" }, month: { mode: "month", day: 1, time: "09:00" },
    cron: { mode: "cron", expression: "" },
  };
  const weekdays = [[1, "周一"], [2, "周二"], [3, "周三"], [4, "周四"], [5, "周五"], [6, "周六"], [0, "周日"]];
  const tabs = [["workflows", "工作流"], ["prompts", "提示词"], ["triggers", "触发器"], ["history", "运行记录"]];
  const variableTypes = { any: "任意数据", text: "文本", number: "数字", boolean: "布尔值", list: "列表", object: "字典", result: "指令结果" };
  const style = css.compose(
    css.button(".aw button:where(:not([data-st-combo-toggle])):where(:not([data-st-combo-option]))", { density: "compact" }), css.button(".aw button.aw-primary", { variant: "primary", density: "compact" }),
    css.button(".aw button.aw-icon", { variant: "ghost", density: "compact" }),
    css.field([".aw input:not([type=checkbox]):not([type=radio]):where(:not([data-st-combo-input]))", ".aw select", ".aw textarea"], { density: "compact" }),
    root.STWorkflowValues.style,
    `.aw{color:var(--st-color-text-primary);font-size:var(--st-font-size-body-small);min-width:0}.aw [hidden]{display:none!important}
    .aw button,.aw input,.aw select,.aw textarea{box-sizing:border-box;max-width:100%}.aw button{cursor:pointer}.aw button:disabled{cursor:default}
    .aw label{display:grid;gap:6px;min-width:0}.aw input:not([type=checkbox]):not([type=radio]),.aw select,.aw textarea{width:100%;min-width:0}.aw textarea{min-height:84px;resize:vertical;font:inherit;padding:8px}
    .aw-toolbar,.aw-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.aw-toolbar{justify-content:space-between;margin-bottom:16px}
    .aw-page-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}.aw-page-heading .page-title{margin:0}.aw-tabs{display:flex;gap:8px;flex-wrap:nowrap;overflow-x:auto;border-bottom:1px solid var(--st-dialog-divider);margin-bottom:16px;scrollbar-width:thin}
    .aw .aw-tabs [role=tab]{position:relative;flex:none;padding:8px 12px;min-height:40px;border:0;border-radius:0;background:transparent;box-shadow:none;color:var(--st-color-text-secondary);font-size:var(--st-font-size-body-small);font-weight:var(--st-font-weight-medium);white-space:nowrap;transition:color var(--st-motion-fast)}
    .aw .aw-tabs [role=tab]:hover{background:transparent;color:var(--st-color-text-primary)}.aw .aw-tabs [role=tab]:focus-visible{outline:2px solid var(--st-color-steam-blue);outline-offset:-4px;box-shadow:none}.aw .aw-tabs [role=tab][aria-selected=true]{color:var(--st-color-steam-blue)}.aw-tabs [aria-selected=true]::after{content:"";position:absolute;inset:auto 12px 0;border-block-end:2px solid currentColor}
    .aw-list{display:grid;gap:8px}.aw-card{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--st-dialog-border);border-radius:var(--st-radius-md);background:var(--st-color-surface-subtle)}.aw-card>div:first-child{flex:1;min-width:0}.aw-card strong,.aw-card small{display:block;overflow-wrap:anywhere}.aw-card small{margin-top:4px;color:var(--st-color-text-secondary)}.aw-icon{display:inline-grid;place-items:center;width:28px;height:28px;padding:0!important;flex:none}.aw-icon[data-aw]>.aw-command-icon{width:16px;height:16px}.aw-icon[aria-pressed=true]{color:var(--st-color-success)}
    .aw-empty{padding:32px 16px;text-align:center;color:var(--st-color-text-secondary);border:1px dashed var(--st-dialog-border);border-radius:var(--st-radius-md)}.aw-error{color:var(--st-color-danger-text);white-space:pre-wrap;overflow-wrap:anywhere;margin-top:8px}.aw-error:empty{display:none}.aw-note{color:var(--st-color-text-secondary);font-size:var(--st-font-size-caption)}
    .aw-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.aw-wide{grid-column:1/-1}.aw-form{display:grid;gap:16px}.aw-section{display:grid;gap:10px;padding-top:12px;border-top:1px solid var(--st-dialog-divider)}.aw-section h4{margin:0;font-size:var(--st-font-size-body-small);font-weight:var(--st-font-weight-medium)}
    .aw-value{display:grid;gap:6px;min-width:0}.aw-condition-group{display:grid;gap:8px;padding-inline-start:12px;border-inline-start:1px solid var(--st-dialog-divider)}.aw-condition{display:grid;grid-template-columns:minmax(0,1fr) 108px minmax(0,1fr) 28px;gap:8px;align-items:start}.aw-button-row{display:grid;grid-template-columns:minmax(0,1fr) 108px 28px;gap:8px;align-items:end}
    .settings-dialog.aw-workflow-dialog{width:min(1180px,calc(100vw - 32px));max-width:none;padding:0;display:flex;flex-direction:column;max-height:calc(100vh - 32px)}.aw-workflow-dialog .settings-dialog-message{padding:0;flex:1;min-height:0;overflow:hidden;white-space:normal}.aw-workflow-dialog .settings-dialog-actions{align-items:center;padding:12px 16px;border-top:1px solid var(--st-dialog-divider);margin:0}.aw-workflow-dialog .settings-dialog-header{padding-inline:16px}
    .aw-editor{height:min(720px,calc(100vh - 156px));min-height:300px;display:grid;grid-template-rows:auto minmax(0,1fr) auto}.aw-editor-top{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--st-dialog-divider)}.aw-editor-top{padding:8px 16px;min-height:52px}.aw-editor-top>.aw-workflow-name{display:flex;align-items:center;gap:10px;flex:1;min-width:0;max-width:440px}.aw-workflow-name>.aw-command-icon{color:var(--st-color-steam-blue)}.aw .aw-workflow-name input{border-color:transparent;background:transparent;font-size:14px;font-weight:var(--st-font-weight-medium)}.aw .aw-workflow-name input:hover{border-color:var(--st-dialog-border)}.aw-editor-toolbar{display:flex;align-items:center;gap:4px}.aw-editor-toolbar .aw-command-icon{width:18px;height:18px}.aw-editor-toolbar .aw-icon{width:32px;height:32px}.aw-editor-toolbar .aw-icon[aria-disabled=true]{opacity:.4;cursor:default}.aw-tool-separator{height:20px;border-inline-start:1px solid var(--st-dialog-divider);margin-inline:6px}.aw-editor-main{display:grid;grid-template-columns:210px minmax(0,1fr);min-height:0}
    .aw-palette{overflow:auto;padding:12px 8px;border-inline-end:1px solid var(--st-dialog-divider);scrollbar-width:thin}.aw-palette>input{margin-bottom:12px}.aw-palette details{margin:4px 0}.aw-palette summary{display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 6px;font-weight:var(--st-font-weight-medium);border-radius:var(--st-radius-sm);list-style:none}.aw-palette summary::-webkit-details-marker{display:none}.aw-command-icon.aw-category-caret{width:12px;height:12px;color:var(--st-color-text-muted)}.aw-palette details[open]>summary>.aw-category-caret{transform:rotate(90deg)}.aw-palette summary:hover{background:var(--st-color-surface-subtle-hover)}
    .aw .aw-palette [data-instruction]{display:flex;align-items:center;justify-content:flex-start;gap:8px;width:100%;height:auto;min-height:34px;padding:6px 8px 6px 30px;text-align:start;background:transparent;border-color:transparent;white-space:normal;line-height:1.5}.aw-palette [data-instruction]:hover{background:var(--st-color-surface-subtle-hover)}.aw-command-icon{display:block;flex:none;width:20px;height:20px;background:currentColor;mask:var(--aw-command-icon) center/contain no-repeat;pointer-events:none;forced-color-adjust:none}.aw-category-icon{width:18px;height:18px;color:var(--st-color-text-muted)}.aw-palette [data-instruction] .aw-command-icon{width:16px;height:16px}
    .aw summary:has(>.aw-disclosure){display:flex;align-items:center;gap:6px;list-style:none}
    .aw summary:has(>.aw-disclosure)::-webkit-details-marker{display:none}
    .aw-command-icon.aw-disclosure{width:14px;height:14px;color:var(--st-color-text-secondary)}
    .aw details[open]>summary>.aw-disclosure{transform:rotate(90deg)}
    .settings-dialog:is(.aw-automation-dialog,.aw-workflow-dialog,.aw-param-dialog,.aw-collection-dialog,.wf-editor-dialog) .settings-dialog-close::before{width:16px;height:16px;transform:translate(-50%,-50%);mask:url('${instructions.iconAsset("x")}') center/contain no-repeat;forced-color-adjust:none}
    .settings-dialog:is(.aw-automation-dialog,.aw-workflow-dialog,.aw-param-dialog,.aw-collection-dialog,.wf-editor-dialog) .settings-dialog-close::after{content:none}
    .aw .st-search-combo__toggle::before{inset:50% auto auto 50%;width:16px;height:16px;border:0;background:var(--st-color-text-muted);mask:url('${instructions.iconAsset("chevron-down")}') center/contain no-repeat;transform:translate(-50%,-50%);forced-color-adjust:none}
    .aw .st-search-combo.is-open .st-search-combo__toggle::before{top:50%;transform:translate(-50%,-50%) rotate(180deg)}
    .aw .st-search-combo__toggle:is(:hover,:focus-visible)::before{background:var(--st-color-text-primary)}
    .aw-icon-instruction{--aw-icon-color:color-mix(in srgb,var(--st-color-steam-blue) 72%,var(--st-color-text-secondary))}
    .aw-icon-note{--aw-icon-color:var(--st-color-success-bright)}
    .aw-command-icon:where(.aw-icon-instruction,.aw-icon-note){color:var(--aw-icon-color)}
    .aw-param-dialog .settings-dialog-title-icon{background:var(--aw-icon-color,var(--st-color-text-secondary))}
    .aw button:has(>.aw-button-label){display:inline-flex;align-items:center;justify-content:center;gap:6px}
    .aw button:has(>.aw-button-label)>.aw-command-icon,.aw-insert-control>.aw-command-icon{width:14px;height:14px}
    .aw-canvas{overflow:auto;min-height:0;padding:8px;scrollbar-width:thin;position:relative;--aw-gutter:64px;--aw-indent:28px}.aw-line{display:grid;grid-template-columns:36px 28px minmax(0,1fr) 32px;align-items:center;min-height:64px;padding:10px 0;border:1px solid transparent;border-radius:var(--st-radius-sm);position:relative;outline:none;transition:background-color var(--st-motion-fast),border-color var(--st-motion-fast)}.aw-line:hover{background:var(--st-color-surface-subtle)}.aw-line[aria-selected=true]{background:var(--st-color-primary-surface);border-color:var(--st-color-border-hover)}.aw-line:focus-visible,.aw-line:has(.aw-handle:focus-visible){outline:2px solid var(--st-color-steam-blue);outline-offset:-2px}
    .aw-number{color:var(--st-color-text-muted);font-variant-numeric:tabular-nums;text-align:center;font-size:var(--st-font-size-caption)}.aw-fold{display:grid;place-items:center}.aw-fold .aw-icon{width:24px;height:24px}.aw-content{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:8px;min-width:0;padding-inline:12px 8px;padding-inline-start:calc(12px + var(--aw-depth,0)*var(--aw-indent))}.aw .aw-node-icon{width:28px;height:28px;border:0;background:transparent;box-shadow:none;color:var(--st-color-text-secondary);display:grid;place-items:center;padding:0}.aw-line-copy{min-width:0}.aw-line-copy strong{display:block;font-size:var(--st-font-size-body-small);line-height:1.5;font-weight:var(--st-font-weight-medium)}.aw-line-copy small{display:block;color:var(--st-color-text-secondary);font-size:var(--st-font-size-caption);overflow-wrap:anywhere;white-space:normal;line-height:1.65;margin-top:3px}.aw-summary-value{color:var(--st-color-steam-blue);overflow-wrap:anywhere}.aw-indent{position:absolute;inset-block:-1px;left:calc(var(--aw-gutter) + var(--aw-level,0)*var(--aw-indent));border-inline-start:1px solid var(--st-dialog-divider);pointer-events:none}.aw-row-delete{opacity:0}.aw-line:hover .aw-row-delete,.aw-line[aria-selected=true] .aw-row-delete,.aw-line:focus-within .aw-row-delete{opacity:1}
    .aw .aw-insert-control{position:absolute;left:calc(var(--aw-gutter) - 10px);bottom:-10px;z-index:var(--st-z-index-dropdown);display:grid;place-items:center;width:20px;height:20px;min-height:20px;padding:0;border:1px solid var(--st-color-border-hover);border-radius:50%;background:var(--st-dialog-surface);color:var(--st-color-steam-blue);font-size:16px;opacity:0;pointer-events:none}.aw .aw-insert-control[data-position=before]{top:-10px;bottom:auto}.aw-line:hover>.aw-insert-control,.aw-insert-control:focus-visible{opacity:1;pointer-events:auto}.aw .aw-insert-control:hover,.aw .aw-insert-control:focus-visible{background:var(--st-color-primary);color:var(--st-color-white)}.aw-line:has(>.aw-insert-control:hover)::after,.aw-line[data-drop]::after,.aw-gap[data-drop]::after{content:"";position:absolute;left:var(--aw-gutter);right:0;bottom:-1px;height:1px;background:var(--st-color-steam-blue);pointer-events:none}.aw-line:has(>[data-position=before]:hover)::after,.aw-line[data-drop=before]::after,.aw-gap[data-drop=before]::after{top:-1px;bottom:auto}
    .aw-gap{position:relative;min-height:40px;padding:4px 8px 4px calc(var(--aw-gutter) + 12px + var(--aw-depth,0)*var(--aw-indent))}.aw-gap button{border:0;background:transparent;color:var(--st-color-text-muted);padding-inline:0}.aw-gap button:hover{color:var(--st-color-steam-blue)}.aw-end-gap>button{display:flex;align-items:center;gap:8px;min-height:40px}.aw-end-plus{display:grid;place-items:center;width:28px;flex:none;font-size:18px}.aw-insert-row{display:flex;gap:8px;align-items:center;min-height:48px;position:relative;padding:6px 8px 6px calc(var(--aw-gutter) + 12px + var(--aw-depth,0)*var(--aw-indent));border-block:1px solid var(--st-color-border-primary)}.aw-insert-row>input{flex:1}.aw-handle{cursor:grab!important;touch-action:none;user-select:none;-webkit-user-select:none}.aw-line.aw-dragging{opacity:.6}.aw-canvas.aw-grabbing,.aw-canvas.aw-grabbing *{cursor:grabbing!important}
    .aw.aw-command-picker{position:fixed;inset:auto;left:var(--aw-picker-left);top:var(--aw-picker-top);margin:0;width:var(--aw-picker-width);max-height:var(--aw-picker-height);padding:4px;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;background:var(--st-dialog-surface-raised);color:var(--st-dialog-text-color);border:1px solid var(--st-dialog-border-hover);border-radius:var(--st-radius-sm);box-shadow:var(--st-shadow-tooltip)}.aw-command-picker:not(:popover-open){display:none}.aw .aw-candidate{display:flex;align-items:center;justify-content:flex-start;gap:10px;width:100%;height:auto;min-height:48px;padding:8px;text-align:start;background:transparent;border-color:transparent;color:var(--st-dialog-text-color);white-space:normal}.aw-candidate[aria-selected=true],.aw-candidate:hover{background:var(--st-color-primary-surface);border-color:var(--st-color-border-primary)}.aw-candidate>span:last-child{display:grid;gap:3px;min-width:0}.aw-candidate small{font-size:var(--st-font-size-caption);color:var(--st-color-text-muted)}.aw-picker-empty{padding:16px;color:var(--st-color-text-secondary)}
    .aw-inspector{border-top:1px solid var(--st-dialog-divider);min-height:0}.aw-inspector-head{display:flex;align-items:center;gap:12px;padding:0 12px}.aw-inspector-head .aw-tabs{margin:0;border:0;gap:0}.aw-inspector-head>[data-count]{margin-inline-start:auto;color:var(--st-color-text-muted);font-size:var(--st-font-size-caption)}.aw-inspector-panel{height:min(192px,25vh);box-sizing:border-box;overflow:auto;border-top:1px solid var(--st-dialog-divider);scrollbar-width:thin;padding:0 12px}.aw-inspector table{width:100%;border-collapse:collapse;text-align:start;font-size:var(--st-font-size-caption)}.aw-inspector th{font-weight:400;color:var(--st-color-text-muted);position:sticky;top:0;background:var(--st-dialog-surface);z-index:1}.aw-inspector th,.aw-inspector td{padding:7px 8px;border-bottom:1px solid var(--st-dialog-divider);text-align:start}.aw-inspector .aw-table-link{border:0;background:transparent;text-align:start;color:var(--st-color-danger-text);padding:0;min-height:24px;white-space:normal}.aw-inspector .aw-tools{justify-content:flex-end}.aw-inspector .aw-variable-name{color:var(--st-color-steam-blue);background:transparent;border:0;padding:0;min-height:24px}.aw-inspector .aw-error{margin:6px 8px}.aw-line .aw-content{grid-column:3}.aw-context-menu{position:fixed;inset:auto;margin:0;padding:5px;min-width:238px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:auto;border:1px solid var(--st-dialog-border);border-radius:var(--st-radius-md);background:var(--st-dialog-surface);box-shadow:var(--st-shadow-lg)}.aw .aw-context-item{display:flex;align-items:center;gap:10px;width:100%;height:34px;padding:6px 10px;border:0;border-radius:var(--st-radius-sm);background:transparent;text-align:start}.aw-context-item .aw-command-icon{width:17px;height:17px}.aw-instruction-disabled .aw-line-copy,.aw-instruction-disabled .aw-node-icon{opacity:.45}.aw-instruction-disabled .aw-line-copy strong{text-decoration:line-through}.aw-context-item kbd{margin-inline-start:auto;color:var(--st-color-text-muted);font:inherit;font-size:var(--st-font-size-caption)}.aw .aw-context-item:hover,.aw .aw-context-item:focus-visible{background:var(--st-color-surface-subtle-hover)}.aw .aw-context-item.aw-context-danger{color:var(--st-color-danger-text)}.aw-context-menu hr{border:0;border-top:1px solid var(--st-dialog-divider);margin:4px 6px}.aw-editor-status{min-width:0;margin-inline-end:auto;overflow-wrap:anywhere;font-size:var(--st-font-size-caption);color:var(--st-color-text-secondary)}
    .aw-param-dialog .aw-section:first-child{border-top:0;padding-top:0}.aw-param-dialog .aw input:not([type=checkbox]),.aw-param-dialog .aw select{height:var(--st-control-height-regular);font-size:var(--st-font-size-body-small)}.aw-param-dialog .aw textarea{font-size:var(--st-font-size-body-small)}.aw-param-dialog .aw-value{grid-template-columns:112px minmax(0,1fr);align-items:start}.aw-param-dialog .aw-value>span{padding-top:8px}.aw-param-dialog .aw-condition{grid-template-columns:minmax(0,1fr) 28px;gap:12px;padding:12px 0;border-bottom:1px solid var(--st-dialog-divider)}.aw-condition-fields{display:grid;gap:12px;min-width:0}.aw-param-dialog .aw-condition-fields>label{grid-template-columns:112px minmax(0,1fr);align-items:center;gap:16px}.aw-param-dialog .aw-condition-fields>label select{max-width:200px}.aw-param-dialog .aw-condition-group{padding-inline-start:0;border:0;gap:12px}.aw-param-dialog .aw-condition-group .aw-condition-group{padding-inline-start:16px;border-inline-start:1px solid var(--st-dialog-divider)}
    .aw-pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:45vh;overflow:auto;font-family:monospace}.aw-hint{color:var(--st-color-text-secondary);font-size:var(--st-font-size-caption)}
    .aw-inspector-panel:not([hidden]):has(>.aw-inspector-empty:not([hidden])){display:flex;flex-direction:column}
    .aw-inspector-panel>table{flex:none}
    .aw-inspector-empty{display:grid;place-items:center;flex:1;min-height:0;color:var(--st-color-text-muted);font-size:var(--st-font-size-caption)}
    .aw-inspector-panel[hidden],.aw-inspector-empty[hidden],.aw-variable-search[hidden]{display:none}
    .aw-inspector th.aw-variable-actions{width:1%;padding:2px 0 2px 8px;white-space:nowrap}
    .aw-variable-tools{display:flex;align-items:center;justify-content:flex-end;gap:4px}
    .aw .aw-variable-tools .aw-variable-search{width:clamp(96px,18vw,176px);height:28px;min-width:0}
    @media(max-width:760px){.aw-editor-main{grid-template-columns:160px minmax(0,1fr)}.aw-editor-top{flex-wrap:wrap}.aw-editor-top>.aw-workflow-name{max-width:none;flex-basis:60%}.aw-inspector-head>[data-count]{display:none}.aw-canvas{--aw-indent:20px}.aw-grid{grid-template-columns:1fr}.aw-param-dialog .aw-value,.aw-param-dialog .aw-condition-fields>label{grid-template-columns:1fr;gap:6px}.aw-param-dialog .aw-value>span{padding-top:0}}
    .aw-palette details[data-group]{margin-inline-start:8px}.aw-palette details[data-group]>summary{font-weight:var(--st-font-weight-regular);font-size:var(--st-font-size-caption)}.aw-palette details[data-group] [data-instruction]{padding-inline-start:30px}
    .aw-param-dialog{width:min(680px,calc(100vw - 32px))!important}.aw-param-dialog .settings-dialog-header{min-height:88px;height:auto;padding-block:16px!important}.aw-param-dialog .settings-dialog-message{padding:0 20px 20px!important;max-height:calc(100dvh - 200px);overflow:auto;white-space:normal}.aw-param-dialog .aw-form{gap:0}.aw-param-dialog .aw-param-tabs{margin:0 0 20px;gap:16px;flex-shrink:0}.aw-param-dialog .aw-param-tabs [role=tab]{padding-inline:0}.aw-param-dialog .aw-param-tabs [aria-selected=true]::after{inset-inline:0}.aw-param-dialog [role=tabpanel]{display:grid;gap:24px}.aw-param-dialog .aw-section{gap:16px}.aw-param-dialog .aw-section+.aw-section{border-top:1px solid var(--st-dialog-divider);padding-top:20px}.aw-param-dialog .aw-grid{grid-template-columns:minmax(0,1fr);gap:16px}.aw-param-dialog .aw-section>label,.aw-param-dialog .aw-grid>label,.aw-param-dialog .aw-output-field{display:grid;grid-template-columns:112px minmax(0,1fr);gap:16px;align-items:center}.aw-param-dialog .aw-value{gap:16px}.aw-param-dialog .aw-section h4{font-size:var(--st-font-size-body-small);margin:0 0 4px}.aw-param-dialog [data-dialog-action=test]{margin-inline-end:auto}
    .aw-param-dialog .aw-single-condition{grid-template-columns:minmax(0,1fr);border:0;padding:0}.aw-param-dialog .aw-condition-fields>label select{max-width:none}.aw-code-section{display:grid;gap:8px}.aw-code-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.aw-code-toolbar>span{margin-inline-end:auto}.aw-code-editor{height:280px;min-width:0;border:1px solid var(--st-dialog-border);border-radius:var(--st-control-radius);overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr) auto}.aw-code-editor>[data-code]{min-width:0;min-height:0}.aw .aw-code-editor>[data-script-reference]{align-self:start;height:32px;border-radius:var(--st-control-radius)}.aw-code-editor:focus-within{border-color:var(--st-color-steam-blue);box-shadow:var(--st-control-focus-shadow)}.aw-code-expanded{width:calc(100vw - 32px)!important}.aw-code-expanded .aw-code-editor{height:48vh}.aw-test-result{margin-top:16px;padding-top:16px;border-top:1px solid var(--st-dialog-divider);white-space:pre-wrap;overflow-wrap:anywhere;font-family:monospace;max-height:200px;overflow:auto}.aw-param-dialog [hidden]{display:none!important}
    .aw-http-permission{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--st-dialog-muted-color);font-size:var(--st-font-size-body-small)}.aw-http-permission:has([data-http-status]:empty){display:none}.aw-http-permission>span{overflow-wrap:anywhere}
    .aw-inspector .aw-table-link:has(.aw-diagnostic-warning){color:var(--st-dialog-text-color)}.aw-diagnostic-warning{color:var(--st-color-warning);margin-inline-end:4px}
    @media(max-width:600px){.aw-param-dialog .aw-section>label,.aw-param-dialog .aw-grid>label,.aw-param-dialog .aw-output-field,.aw-param-dialog .aw-value{grid-template-columns:minmax(0,1fr);gap:8px}}
    .aw-param-dialog:has(.aw-trigger-form) .settings-dialog-header{min-height:0}
    .aw-trigger-form{display:grid;gap:16px;padding-top:20px}
    .aw-trigger-more{border-top:1px solid var(--st-dialog-divider)}
    .aw-trigger-more>summary{padding:12px 0 0;cursor:pointer}
    .aw-trigger-more[open]>summary{margin-bottom:16px}
    .aw-trigger-more>summary:focus-visible{outline:2px solid var(--st-color-steam-blue);outline-offset:3px}
    .aw-trigger-options{position:relative;display:flex;flex-wrap:wrap;gap:12px 16px;min-width:0;margin:0;padding:0 0 0 128px;border:0}
    .aw-trigger-options legend{position:absolute;inset:1px auto auto 0;padding:0}
    .aw .aw-trigger-options label,.aw-trigger-enabled{display:inline-flex;align-items:center;gap:6px;cursor:pointer}
    .aw-param-dialog .aw-trigger-options input[type=radio],.aw-trigger-enabled input{width:16px;height:16px;margin:0;accent-color:var(--st-color-steam-blue)}
    .aw-trigger-form .aw-note{margin:0;padding-inline-start:128px}
    .aw-trigger-enabled{margin-inline-end:auto;color:var(--st-color-text-primary);font-size:var(--st-font-size-body-small)}
    .aw-trigger-form .aw-trigger-row{display:grid;grid-template-columns:112px minmax(0,1fr);gap:16px;align-items:center;min-width:0}
    .aw-trigger-form input:is([type=date],[type=time],[type=datetime-local]){color-scheme:dark}
    .aw-param-dialog .aw-trigger-form .aw-trigger-check{display:flex;align-items:center;gap:8px;cursor:pointer}
    .aw-trigger-check input{width:16px;height:16px;margin:0;accent-color:var(--st-color-steam-blue)}
    .aw-trigger-form .aw-trigger-summary{display:flex;gap:8px 12px;flex-wrap:wrap;align-items:center}
    .aw-trigger-summary>span{flex:1;min-width:0;overflow-wrap:anywhere}
    .aw-trigger-summary>h4{margin:0;flex:1}
    .aw-trigger-list{display:grid;gap:4px;margin-top:6px}
    .aw-trigger-list .aw-trigger-summary{flex-wrap:nowrap;gap:8px}
    .aw .aw-trigger-summary-edit{flex:1;min-width:0;text-align:start;border-color:transparent;background:transparent;overflow-wrap:anywhere;white-space:normal;height:auto;padding-inline-start:0}
    .aw .aw-trigger-summary-edit:hover{color:var(--st-color-steam-blue);background:transparent}
    .aw-trigger-child .aw-grid select,.aw-trigger-child .aw-fixed-type select{color-scheme:dark}
    .aw-trigger-fields{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .aw-trigger-form .aw-trigger-fields>.aw-trigger-row{display:flex;flex:1;min-width:132px;gap:8px;white-space:nowrap}
    .aw-trigger-preview{color:var(--st-color-text-secondary);margin:0;overflow-wrap:anywhere}
    .aw-trigger-dates{display:flex;align-items:center;flex-wrap:wrap;gap:6px}
    .aw-trigger-dates input{width:auto!important}.aw-trigger-setting{display:grid;gap:10px}
    .aw-param-dialog .aw-trigger-form .aw-trigger-limit{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.aw-trigger-limit input{width:78px!important}
    .aw-trigger-child .aw-grid{margin-block:8px}
    .aw-line-copy small{white-space:pre-wrap}
    .aw-summary-reference{display:inline;border:1px solid var(--st-color-border-hover);border-radius:var(--st-radius-sm);background:var(--st-color-primary-surface);padding-inline:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
    .aw-note-card{display:flex;align-items:center;gap:8px;min-width:0;padding:6px 8px;border-radius:var(--st-radius-sm);background:color-mix(in srgb,var(--st-color-success) 12%,transparent);color:var(--st-color-success-bright);font-size:var(--st-font-size-caption)}
    .aw-note-card .aw-command-icon{width:16px;height:16px}
    .aw-node-note{max-width:min(240px,20vw)}.aw-node-note .aw-note-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .aw-line.aw-comment-line{min-height:44px;padding-block:0;border:0;background:color-mix(in srgb,var(--st-color-success) 10%,transparent)}
    .aw-line.aw-comment-line:hover,.aw-line.aw-comment-line[aria-selected=true]{background:color-mix(in srgb,var(--st-color-success) 17%,transparent)}
    .aw-comment-line:focus-visible,.aw-comment-line:has(.aw-handle:focus-visible){outline:none}
    .aw-comment-line:focus-visible .aw-number,.aw-comment-line .aw-handle:focus-visible{outline:2px solid var(--st-color-steam-blue);outline-offset:-2px;border-radius:var(--st-radius-sm)}
    .aw-standalone-note{grid-column:1/3;align-items:flex-start;padding:4px 0;background:transparent}.aw-standalone-note .aw-note-text{align-self:center;min-width:0;white-space:pre-wrap;overflow-wrap:anywhere}
    .aw .aw-standalone-note .aw-node-icon{color:inherit}
    .aw-param-dialog .aw-donation-info{color:var(--st-color-steam-blue)}
    .aw-param-dialog .aw-donation-link{display:inline-flex;align-items:center;margin-inline-start:8px;padding:2px 8px;border-radius:var(--st-radius-sm);background:var(--st-color-primary-surface);color:var(--st-color-steam-blue);text-decoration:none}
    .aw-param-dialog .aw-donation-link:hover,.aw-param-dialog .aw-donation-link:focus-visible{text-decoration:underline}
    .aw .aw-standalone-note .aw-node-icon{flex:none;width:24px;height:24px;color:inherit}
    .aw-instruction-disabled .aw-standalone-note{opacity:.45}.aw-instruction-disabled .aw-standalone-note .aw-node-icon{opacity:1}
    .aw-name-badge{display:inline-block;margin-inline-start:6px;padding-inline:4px;border:1px solid var(--st-dialog-divider);border-radius:var(--st-radius-sm);font-size:var(--st-font-size-caption);color:var(--st-color-text-secondary);white-space:nowrap}
    @media(max-width:600px){.aw-trigger-form .aw-trigger-row{grid-template-columns:1fr;gap:8px}.aw-param-dialog .aw-trigger-form .aw-grid{gap:12px}}
    @media(max-width:600px){.aw-trigger-options{padding:0}.aw-trigger-options legend{position:static;margin-bottom:8px}.aw-trigger-form .aw-note{padding-inline-start:0}}
    @media(min-width:481px) and (max-width:600px){
      .aw-param-dialog .aw-trigger-form .aw-grid>label:not(.aw-trigger-check),
      .aw-param-dialog .aw-trigger-form .aw-trigger-row{grid-template-columns:104px minmax(0,1fr);gap:12px}
      .aw-trigger-form .aw-trigger-options,.aw-trigger-form .aw-note{padding-inline-start:116px}
      .aw-trigger-form .aw-trigger-options legend{position:absolute;margin-bottom:0}
    }
    @media(prefers-reduced-motion:reduce){.aw-line,.aw .aw-tabs [role=tab],.aw .st-search-combo__toggle::before{transition:none}}`,
  );
  const view = () => root.STWorkflowView;
  const esc = value => view().esc(value);
  const html = (node, value) => view().html(node, value);
  function formHtml(node, markup) {
    const active = node.getRootNode().activeElement;
    let selector = null;
    if (node.contains(active)) {
      if (active.dataset.prop) selector = `[data-prop="${CSS.escape(active.dataset.prop)}"]`;
      else if (active.closest("[data-value]")) {
        const field = active.closest("[data-value]"), attribute = ["data-value-mode", "data-value-type", "data-value-variable", "data-value-path", "data-value-text", "data-value-choice", "data-path-preset", "data-insert-variable"].find(name => active.hasAttribute(name));
        if (attribute) selector = `[data-value="${CSS.escape(field.dataset.value)}"] [${attribute}]`;
      } else if (active.hasAttribute("data-branch")) selector = "[data-branch]";
    }
    html(node, markup); root.STWorkflowValues.refresh(node); if (selector) node.querySelector(selector)?.focus({ preventScroll: true });
  }
  const { icon, commandIcon } = instructions;
  const button = (action, label, attrs = "", iconName = "") => `<button type="button" data-aw="${action}" ${attrs}>${iconName ? icon(iconName) + `<span class="aw-button-label">${esc(label)}</span>` : esc(label)}</button>`;
  const iconButton = (action, label, name, attrs = "") => `<button type="button" class="aw-icon" data-aw="${action}" aria-label="${esc(label)}" title="${esc(label)}" ${attrs}>${icon(name)}</button>`;
  const options = (rows, value) => rows.map(([id, label, disabled]) => `<option value="${esc(id)}" ${String(id) === String(value) ? "selected" : ""} ${disabled ? "disabled" : ""}>${esc(label)}</option>`).join("");
  const prop = (label, path, value, rows = null, kind = "text") => `<label>${esc(label)}${rows ? `<select data-prop="${path}">${options(rows, value)}</select>` : `<input data-prop="${path}" type="${kind}" value="${esc(value)}">`}</label>`;
  const parameterProp = (label, path, value, rows, kind) => rows
    ? `<label><span>${esc(label)}</span>${root.STSettingsFields.fixedComboHtml(label, "data-prop", path, rows, value)}</label>`
    : prop(label, path, value, null, kind);
  const get = (object, path) => flow.pathGet(object, path.split("."));
  function set(object, path, value) { const keys = path.split("."), key = keys.pop(); flow.pathGet(object, keys)[key] = value; }
  const paths = value => String(value).trim().split(".").filter(Boolean);
  const valueText = (...args) => root.STWorkflowValues.text(...args);
  const valueField = (...args) => root.STWorkflowValues.field(...args);
  const collect = (...args) => root.STWorkflowValues.collect(...args);
  const outputField = (...args) => root.STWorkflowValues.output(...args);
  function conditionHtml(value, path, workflow, removable = false) {
    if (value.children) return `<div class="aw-condition-group">${parameterProp("匹配方式", path + ".op", value.op, [["all", "全部满足"], ["any", "任一满足"]])}
      ${value.children.map((child, index) => conditionHtml(child, path + ".children." + index, workflow, true)).join("")}
      <div class="aw-tools">${button("condition-add", "添加条件", `data-path="${path}"`, "plus")}</div></div>`;
    return `<div class="aw-condition${removable ? "" : " aw-single-condition"}"><div class="aw-condition-fields">${valueField("对象1", value.left, path + ".left", workflow)}${parameterProp("关系", path + ".op", value.op, Object.entries(flow.operations))}
      ${flow.unary.has(value.op) ? "" : valueField("对象2", value.right || flow.literal(""), path + ".right", workflow, [], "any", false, instructions.choices(workflow, value.left))}</div>${removable ? iconButton("condition-delete", "删除条件", "trash", `data-path="${path}"`) : ""}</div>`;
  }
  async function confirm(state, title, message) {
    return await state.ctx.dialog(state.shadow, { title, className: "aw-automation-dialog", form: true, message, actions: [{ id: "cancel", label: "取消" }, { id: "confirm", label: "删除", primary: true, danger: true }] }) === "confirm";
  }
  function reportFailure(error, element, editor = null) {
    if (editor) { locateError(editor, error); element = editor.root.querySelector("[data-editor-error]"); }
    view().reportFailure(error, element);
  }
  async function save(state, bundle) {
    let steamPending = false;
    state.bundle = await state.ctx.storage.setWorkflow(bundle, { onSteamPending: () => { steamPending = true; } });
    state.steamPending = steamPending;
    renderPage(state);
  }
  function exportFlow(workflow) {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ schemaVersion: 1, workflow }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = workflow.name.replace(/[<>:"/\\|?*]/g, "_") + ".workflow.json"; link.click(); root.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function editVariable(state, workflow, selected = null) {
    const lifetime = new AbortController();
    const draft = selected ? { ...selected } : { id: flow.numericId("var-", workflow.variables), name: "", type: "any" };
    return state.ctx.dialog(state.shadow, { title: selected ? "编辑变量" : "新建变量", className: "aw-automation-dialog", form: true,
      render: node => {
        html(node, `<div class="aw aw-form">${prop("变量名称", "name", draft.name)}${parameterProp("类型", "type", draft.type, [["any", "任意数据"], ["text", "文本"], ["number", "数字"], ["boolean", "布尔值"], ["list", "列表"], ["object", "字典"], ["result", "指令结果"]])}<div class="aw-error" role="alert"></div></div>`);
        root.STSettingsFields.bindSearchCombos(node, lifetime.signal);
      },
      actions: [{ id: "cancel", label: "取消" }, { id: "save", label: "确定", primary: true }],
      onAction: (action, node) => {
        if (action !== "save") return true;
        try {
          collect(node, draft, workflow);
          if (!draft.name.trim() || workflow.variables.some(item => item.id !== draft.id && item.name === draft.name)) throw new Error("请填写不重复的变量名称");
          if (selected) Object.assign(selected, draft); else workflow.variables.push(draft);
          return true;
        } catch (error) { reportFailure(error, node.querySelector(".aw-error")); return false; }
      },
    }).then(answer => answer === "save" ? draft.id : null).finally(() => lifetime.abort());
  }
  const description = (row, workflow, editor) => instructions.describe(row, workflow, editor).map(part => typeof part === "string" ? esc(part) : `<span class="aw-summary-value${part.reference ? " aw-summary-reference" : ""}">${esc(part.value)}</span>`).join("");
  const permissionLabel = "权益";
  const nameBadge = id => {
    const permission = flow.instructionPermission(id);
    return permission ? `<span class="aw-name-badge" title="${esc(flow.permissionNotice(permission))}">${permissionLabel}</span>` : "";
  };
  function nodeName(node) { return node.action === "notify" && node.messageType === "interactive" ? "发送交互消息并等待" : flow.names[flow.type(node)]; }
  const isFold = row => row?.node?.kind === "fold";
  const canFold = row => row?.marker === "fold-start" ? row.partner !== undefined : !!row?.node && !row.marker && row.node.kind !== "action";
  const containsFold = (row, target) => row.marker === "fold-start" && row.partner !== undefined && target.path &&
    row.listPath.every((key, index) => target.path[index] === key) &&
    target.path[row.listPath.length] > row.index && target.path[row.listPath.length] < row.partner;
  function cursorFor(row, workflow) {
    if (row.marker === "insert") return { path: row.listPath, index: row.index };
    if (isFold(row)) return { path: row.listPath, index: row.index + 1 };
    if (row.marker === "else-if") return { path: [...row.path, "branches", row.branch, "steps"], index: 0 };
    if (row.marker === "else") return { path: [...row.path, "otherwise"], index: 0 };
    if (row.marker === "catch" || row.marker === "finally") return { path: [...row.path, row.marker], index: 0 };
    if (row.marker?.startsWith("end-")) return { path: row.path.slice(0, -1), index: Number(row.path.at(-1)) + 1 };
    if (row.node.kind === "if") return { path: [...row.path, "branches", 0, "steps"], index: 0 };
    if (row.node.kind !== "action") return { path: [...row.path, "body"], index: 0 };
    return { path: row.listPath, index: row.index + 1 };
  }
  function ancestor(editor, kind) {
    const row = editor.rows.find(row => row.key === editor.selected);
    const path = editor.cursor?.path || row?.path;
    if (!path) return null;
    for (let end = path.length; end > 0; end--) {
      const candidate = flow.pathGet(editor.draft, path.slice(0, end));
      if (candidate && typeof candidate === "object" && kind(candidate)) return candidate;
    }
    return null;
  }
  function snapshot(editor) { editor.undo.push(flow.clone(editor.draft)); editor.redo.length = 0; editor.diagnostics = null; }
  async function removeNode(state, editor, row) {
    if (isFold(row)) {
      snapshot(editor);
      const list = flow.pathGet(editor.draft, row.listPath);
      const indices = row.partner === undefined ? [row.index] : [Math.max(row.index, row.partner), Math.min(row.index, row.partner)];
      for (const index of indices) { editor.collapsed.delete(list[index].id); list.splice(index, 1); }
      paintEditor(editor); focusSelection(editor); return;
    }
    if (["else-if", "else", "catch", "finally"].includes(row.marker)) {
      const title = flow.names[instructions.key(row)];
      if (!await confirm(state, "删除分支", `将删除“${title}”分支及其内部全部步骤，可在保存前撤销。`)) return;
      snapshot(editor);
      if (row.marker === "else-if") row.node.branches.splice(row.branch, 1);
      else row.node[row.marker === "else" ? "otherwise" : row.marker] = null;
      editor.selected = row.node.id; paintEditor(editor); focusSelection(editor); return;
    }
    if (!await confirm(state, "删除指令", `将删除“${nodeName(row.node)}”${row.node.kind !== "action" ? "及其内部全部步骤" : ""}，可在保存前撤销。`)) return;
    snapshot(editor); flow.pathGet(editor.draft, row.path.slice(0, -1)).splice(row.path.at(-1), 1); paintEditor(editor); focusSelection(editor);
  }
  function moveNode(editor, source, destination) {
    if (!source?.path || !destination) return;
    if (destination.path.slice(0, source.path.length).join(".") === source.path.join(".")) throw new Error("不能把流程块移入自身");
    const from = flow.pathGet(editor.draft, source.path.slice(0, -1)), to = flow.pathGet(editor.draft, destination.path), index = Number(source.path.at(-1));
    const target = destination.index - (from === to && index < destination.index ? 1 : 0);
    if (from === to && target === index) return;
    snapshot(editor); const [node] = from.splice(index, 1); to.splice(target, 0, node);
    revealNode(editor, node.id);
  }
  function focusSelection(editor) {
    const index = editor.rows.findIndex(row => row.key === editor.selected);
    (editor.root.querySelector(`[data-key="${CSS.escape(editor.selected)}"]`) || editor.root.querySelector(`.aw-gap[data-row="${index}"] button`))?.focus({ preventScroll: true });
  }
  function closeInsertion(editor, repaint = true) {
    const picker = editor.root.querySelector(".aw-command-picker");
    if (picker?.matches(":popover-open")) picker.hidePopover();
    editor.insertion = null; editor.cursor = null;
    if (repaint) {
      paintEditor(editor);
      focusSelection(editor);
    }
  }
  function openInsertion(editor, row, before = false) {
    const cursor = before ? { path: row.listPath, index: row.index } : cursorFor(row, editor.draft);
    editor.cursor = cursor; editor.selected = row.key;
    const inside = !before && (row.marker === "else-if" || row.marker === "else" || row.marker === "catch" || row.marker === "finally" || canFold(row));
    if (inside) editor.collapsed.delete(row.node.id);
    editor.insertion = { key: row.key, before, depth: row.depth + (inside ? 1 : 0), query: "", active: 0 };
    paintEditor(editor);
    editor.root.querySelector("[data-insert-search]").focus({ preventScroll: true });
    editor.root.querySelector(".aw-insert-row").scrollIntoView({ block: "nearest" });
    renderPicker(editor);
  }
  function positionPicker(editor) {
    const input = editor.root.querySelector("[data-insert-search]"), picker = editor.root.querySelector(".aw-command-picker");
    if (!input || !picker?.matches(":popover-open")) return;
    const rect = input.getBoundingClientRect(), doc = input.ownerDocument.documentElement;
    const width = Math.min(440, Math.max(rect.width, 300), doc.clientWidth - 32), below = doc.clientHeight - rect.bottom - 12, above = rect.top - 12;
    const height = Math.min(320, Math.max(below, above)), top = below >= Math.min(240, height) ? rect.bottom + 4 : Math.max(8, rect.top - Math.min(picker.scrollHeight, height) - 4);
    picker.style.setProperty("--aw-picker-left", Math.max(8, Math.min(rect.left, doc.clientWidth - width - 8)) + "px");
    picker.style.setProperty("--aw-picker-top", top + "px");
    picker.style.setProperty("--aw-picker-width", width + "px");
    picker.style.setProperty("--aw-picker-height", Math.max(80, height) + "px");
  }
  function renderPicker(editor) {
    const insertion = editor.insertion; if (!insertion) return;
    const input = editor.root.querySelector("[data-insert-search]"), picker = editor.root.querySelector(".aw-command-picker");
    const query = insertion.query.trim().toLocaleLowerCase();
    insertion.candidates = instructions.catalog.filter(item => (item.name + " " + item.category + " " + instructions.hints[item.id]).toLocaleLowerCase().includes(query));
    insertion.active = Math.min(insertion.active, Math.max(0, insertion.candidates.length - 1));
    html(picker, insertion.candidates.map((item, index) => `<button type="button" class="aw-candidate" id="aw-candidate-${item.id}" role="option" tabindex="-1" aria-selected="${index === insertion.active}" data-instruction="${item.id}">${commandIcon(item.id)}<span><span>${esc(item.name)}${nameBadge(item.id)}</span><small>${esc(item.category)} · ${esc(instructions.hints[item.id])}</small></span></button>`).join("") || '<div class="aw-picker-empty" role="status">没有匹配的指令</div>');
    if (insertion.candidates.length) input.setAttribute("aria-activedescendant", "aw-candidate-" + insertion.candidates[insertion.active].id);
    else input.removeAttribute("aria-activedescendant");
    if (!picker.matches(":popover-open")) picker.showPopover();
    positionPicker(editor);
    picker.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }
  function paintEditor(editor) {
    const { root: node, draft } = editor, canvas = node.querySelector(".aw-canvas"), scroll = canvas.scrollTop;
    const focused = node.getRootNode().activeElement, activeRow = focused?.closest?.("[data-key]"), activeAction = focused?.dataset.aw;
    const oldPicker = node.querySelector(".aw-command-picker");
    if (oldPicker?.matches(":popover-open")) oldPicker.hidePopover();
    const previousIndex = editor.rows.findIndex(row => row.key === editor.selected);
    editor.rows = flow.rows(draft, editor.collapsed);
    if (!editor.rows.some(row => row.key === editor.selected)) {
      const visible = editor.rows.filter(row => row.marker !== "insert");
      editor.selected = (visible[Math.min(Math.max(previousIndex, 0), visible.length - 1)] || editor.rows.at(-1)).key;
    }
    // 行号来自完整结构，折叠只改变可见行；插入输入行不进入工作流草稿
    const numbers = new Map(); let number = 0, canExpand = false, canCollapse = false;
    for (const row of flow.rows(draft)) {
      if (row.marker === "insert") continue;
      numbers.set(row.key, ++number);
      if (canFold(row)) {
        if (editor.collapsed.has(row.key)) canExpand = true;
        else canCollapse = true;
      }
    }
    const insertRow = () => `<div class="aw-insert-row" style="--aw-depth:${editor.insertion.depth}"><input type="search" data-insert-search role="combobox" aria-label="插入指令" aria-autocomplete="list" aria-controls="aw-command-options" aria-expanded="true" autocomplete="off" placeholder="输入或选择指令" value="${esc(editor.insertion.query)}">${iconButton("insert-cancel", "取消插入", "x")}<div class="aw aw-command-picker" id="aw-command-options" role="listbox" aria-label="可插入的指令" popover="manual"></div></div>`;
    html(canvas, editor.rows.map((row, index) => {
      const inserting = editor.insertion?.key === row.key;
      if (row.marker === "insert") {
        if (inserting) return insertRow();
        if (row.key !== "root-gap") return "";
        return `<div class="aw-gap aw-end-gap" data-row="${index}" style="--aw-depth:${row.depth}"><button type="button" data-aw="select-gap"><span class="aw-end-plus">${icon("plus")}</span>点击添加指令</button></div>`;
      }
      const key = instructions.key(row), title = row.marker === "fold-start" ? "折叠开始" : row.marker === "fold-end" ? "折叠结束" : flow.names[key];
      const guides = Array.from({ length: row.depth + 1 }, (_, level) => `<span class="aw-indent" style="--aw-level:${level}"></span>`).join("");
      const collapsed = editor.collapsed.has(row.node.id);
      const fold = canFold(row) ? iconButton("collapse", collapsed ? "展开流程块" : "折叠流程块", collapsed ? "chevron-right" : "chevron-down", `aria-expanded="${!collapsed}"`) : "";
      const nodeIcon = row.marker ? `<span class="aw-node-icon">${commandIcon(key)}</span>` : `<button type="button" class="aw-node-icon aw-handle" data-aw="node-drag" aria-label="移动 ${esc(title)}，Alt 加方向键移动或调整层级" title="拖动 ${esc(title)}">${commandIcon(key)}</button>`;
      const disabled = row.marker === "end-if" ? row.node.endDisabled : row.node.disabled;
      const summary = isFold(row) ? esc(row.node.name || (row.marker === "fold-start" ? "未命名折叠区域" : "")) : description(row, draft, editor);
      const content = key === "comment"
        ? `<div class="aw-note-card aw-standalone-note">${nodeIcon}<span class="aw-note-text">${summary}</span></div>`
        : `${nodeIcon}<div class="aw-line-copy"><strong>${esc(title)}${nameBadge(key)}</strong>${summary ? `<small>${summary}</small>` : ""}</div>`;
      const attachment = !row.marker && row.node.note
        ? `<span class="aw-note-card aw-node-note" title="${esc(row.node.note)}">${icon("message")}<span class="aw-note-text">${esc(row.node.note)}</span></span>` : "";
      return (inserting && editor.insertion.before ? insertRow() : "") + `<div class="aw-line ${row.marker ? "aw-marker" : ""}${disabled ? " aw-instruction-disabled" : ""}${key === "comment" ? " aw-comment-line" : ""}" data-row="${index}" data-key="${esc(row.key)}" role="option" tabindex="0" aria-selected="${editor.selected === row.key}" style="--aw-depth:${row.depth}">
        ${guides}<span class="aw-number">${numbers.get(row.key)}</span><span class="aw-fold">${fold}</span>
        <div class="aw-content">${content}${attachment}</div>
        ${!row.marker || isFold(row) ? `<span class="aw-row-delete">${iconButton("node-delete", isFold(row) ? "移除折叠标记" : "删除 " + title, "trash")}</span>` : "<span></span>"}
        ${index === 0 ? '<button type="button" class="aw-insert-control" data-aw="insert" data-position="before" aria-label="在上方插入指令" title="在上方插入指令">' + icon("plus") + '</button>' : ""}
        <button type="button" class="aw-insert-control" data-aw="insert" aria-label="在下方插入指令" title="在下方插入指令">${icon("plus")}</button></div>` + (inserting && !editor.insertion.before ? insertRow() : "");
    }).join(""));
    canvas.scrollTop = scroll;
    if (activeRow && !editor.insertion) {
      const row = canvas.querySelector(`[data-key="${CSS.escape(editor.selected)}"]`) || canvas.querySelector(`[data-key="${CSS.escape(activeRow.dataset.key)}"]`);
      (activeAction ? row?.querySelector(`[data-aw="${activeAction}"]`) : row)?.focus({ preventScroll: true });
    }
    if (editor.reveal) { canvas.querySelector(`[data-key="${CSS.escape(editor.selected)}"]`)?.scrollIntoView({ block: "nearest" }); editor.reveal = false; }
    const toolbar = { undo: !!editor.undo.length, redo: !!editor.redo.length, "expand-all": canExpand, "collapse-all": canCollapse };
    for (const [action, enabled] of Object.entries(toolbar)) node.querySelector(`[data-aw="${action}"]`).setAttribute("aria-disabled", String(!enabled));
    paintInspector(editor);
  }
  async function editFoldName(state, name = "") {
    let input;
    const result = await state.ctx.dialog(state.shadow, {
      title: "折叠开始", subtitle: instructions.hints["fold-start"], icon: instructions.iconUrl("fold-start"), iconClass: instructions.iconTone("fold-start"), className: "aw-param-dialog", form: true,
      isDirty: () => !!input && input.value.trim() !== name,
      render: node => {
        html(node, `<div class="aw aw-form aw-grid">${prop("折叠区域名称", "name", name)}</div>`);
        input = node.querySelector("input");
      },
      actions: [{ id: "cancel", label: "取消" }, { id: "save", label: "确定", primary: true }],
    });
    return result === "save" ? input.value.trim() : null;
  }
  async function addFold(state, editor, key, cursor) {
    const edge = key === "fold-start" ? "start" : "end";
    const node = { id: flow.numericId("fold-", [...flow.walk(editor.draft.steps)]), kind: "fold", edge };
    const list = flow.pathGet(editor.draft, cursor.path);
    closeInsertion(editor, false);
    try {
      if (edge === "start") {
        node.name = await editFoldName(state);
        if (node.name === null) return;
      } else {
        const trial = list.slice(); trial.splice(cursor.index, 0, node);
        const pairs = flow.foldPairs(trial);
        if (!pairs.has(cursor.index) || pairs.size <= flow.foldPairs(list).size) throw new Error("请在同一分支先插入尚未结束的折叠开始");
      }
      snapshot(editor); list.splice(cursor.index, 0, node);
      editor.collapsed.delete(node.id);
      editor.selected = node.id;
    } finally {
      if (editor.selected === node.id) revealNode(editor, node.id);
      else { paintEditor(editor); focusSelection(editor); }
    }
  }
  async function addInstruction(state, editor, key) {
    const selected = editor.rows.find(row => row.key === editor.selected) || editor.rows.at(-1);
    if (flow.markers.has(key)) {
      const block = ancestor(editor, node => key.includes("if") || key === "else" ? node.kind === "if" : key === "end-loop" ? flow.loops.has(node.kind) : node.kind === "try");
      if (!block) throw new Error("请先选择对应的 IF、循环或 Try 块");
      if (["else-if", "else-if-many"].includes(key)) {
        const draft = flow.clone(editor.draft), target = [...flow.walk(draft.steps)].find(node => node.id === block.id);
        const branch = target.branches.length;
        target.branches.push({ condition: key === "else-if-many" ? { op: "all", children: [flow.comparison()] } : flow.comparison(), steps: [] });
        const pending = { ...editor, draft, rows: flow.rows(draft) };
        closeInsertion(editor, false);
        if (await editNode(state, pending, pending.rows.find(row => row.key === block.id + ":else-if:" + branch)) === "save") {
          snapshot(editor); Object.assign(editor.draft, pending.draft); editor.selected = block.id + ":else-if:" + branch; editor.collapsed.delete(block.id);
        }
        paintEditor(editor); return;
      }
      if (!key.startsWith("end-")) snapshot(editor);
      if (key === "else") block.otherwise ??= [];
      else if (key === "catch") { block.catch ??= []; block.error ||= flow.variable(editor.draft, "异常", "object"); }
      else if (key === "finally") block.finally ??= [];
      else editor.selected = block.id + ":end";
      closeInsertion(editor, false); editor.collapsed.delete(block.id); paintEditor(editor); return;
    }
    const cursor = editor.cursor || cursorFor(selected, editor.draft);
    if (key === "fold-start" || key === "fold-end") return addFold(state, editor, key, cursor);
    // 新指令及自动创建的输出变量只进入临时草稿，确认参数后一起提交
    const draft = flow.clone(editor.draft), node = flow.createNode(key, draft);
    flow.pathGet(draft, cursor.path).splice(cursor.index, 0, node);
    const pending = { ...editor, draft, rows: flow.rows(draft), undo: [], redo: [], originalVariableIds: new Set(editor.draft.variables.map(item => item.id)) };
    closeInsertion(editor, false);
    try {
      if (!(node.kind === "action" && ["break", "continue", "stop"].includes(node.action)) &&
          await editNode(state, pending, pending.rows.find(row => row.key === node.id)) !== "save") return;
      snapshot(editor); Object.assign(editor.draft, pending.draft);
      editor.selected = node.id;
    } finally {
      if (editor.selected === node.id) revealNode(editor, node.id);
      else { paintEditor(editor); focusSelection(editor); }
    }
  }
  function palette() {
    const commands = rows => rows.map(item => `<button type="button" data-instruction="${item.id}" draggable="true" title="${esc(instructions.hints[item.id])}">${commandIcon(item.id)}<span>${esc(item.name)}${nameBadge(item.id)}</span></button>`).join("");
    const section = (name, symbol, content, type = "group") => `<details data-${type}="${esc(name)}"><summary>${icon("chevron-right", "aw-category-caret")}${icon(symbol, "aw-category-icon")}${esc(name)}</summary>${content}</details>`;
    const categoryContent = category => {
      const items = instructions.catalog.filter(item => item.category === category);
      const groups = Object.keys(instructions.groups).filter(group => items.some(item => item.group === group));
      return groups.length
        ? groups.map(group => section(group, instructions.groups[group], commands(items.filter(item => item.group === group)))).join("")
        : commands(items);
    };
    return Object.entries(instructions.categories).map(([category, symbol]) => {
      const content = category === "其他"
        ? Object.entries(instructions.otherCategories).map(([name, groupIcon]) => section(name, groupIcon, categoryContent(name))).join("")
        : categoryContent(category);
      return section(category, symbol, content, "category");
    }).join("");
  }
  function filterVariables(editor) {
    const panel = editor.root.querySelector(".aw-inspector-panel"), query = (editor.variableQuery || "").trim().toLocaleLowerCase();
    let matches = 0;
    for (const row of panel.querySelectorAll("[data-variable-id]")) {
      row.hidden = !row.querySelector(".aw-variable-name").textContent.toLocaleLowerCase().includes(query);
      if (!row.hidden) matches++;
    }
    const empty = panel.querySelector("[data-inspector-empty]");
    empty.textContent = editor.draft.variables.length ? "没有匹配的变量" : "暂无变量";
    empty.hidden = matches > 0;
  }
  function diagnosticSummary(entries) {
    const warnings = entries.filter(entry => entry.severity === "warning").length, errors = entries.length - warnings;
    return [errors && `${errors} 个错误`, warnings && `${warnings} 个警告`].filter(Boolean).join(" · ");
  }
  function paintInspector(editor) {
    const { root: node, draft } = editor;
    const lines = tools.lines(draft), variable = editor.panel === "variables", references = variable ? tools.index(draft) : null;
    editor.diagnostics ??= [...tools.diagnostics(draft), ...tools.permissionWarnings(lines, editor.membership)];
    const entries = editor.diagnostics, summary = diagnosticSummary(entries);
    node.querySelector("[data-count]").textContent = `${[...flow.walk(draft.steps)].filter(step => step.kind !== "fold").length} 条指令 · ${draft.variables.length} 个变量`;
    for (const tab of node.querySelectorAll("[data-inspector-tab]")) {
      const selected = tab.dataset.inspectorTab === editor.panel; tab.setAttribute("aria-selected", String(selected)); tab.tabIndex = selected ? 0 : -1;
      tab.textContent = tab.dataset.inspectorTab === "errors" ? `错误列表${summary ? " · " + summary : ""}` : `变量列表 · ${draft.variables.length}`;
    }
    const panel = node.querySelector(".aw-inspector-panel"); panel.hidden = editor.panelClosed;
    panel.setAttribute("aria-labelledby", "aw-inspector-" + editor.panel);
    node.querySelector('[data-aw="panel-toggle"]').setAttribute("aria-expanded", String(!editor.panelClosed));
    const empty = label => `<div class="aw-inspector-empty" data-inspector-empty>${label}</div>`;
    html(panel, variable ? `<table><thead><tr><th scope="col">变量名称</th><th scope="col">类型</th><th scope="col">使用位置</th><th class="aw-variable-actions"><div class="aw-variable-tools" role="group" aria-label="变量工具">
      <input type="search" class="aw-variable-search" id="aw-variable-search" data-variable-search aria-label="搜索变量" placeholder="搜索变量" value="${esc(editor.variableQuery || "")}" ${editor.variableSearchOpen ? "" : "hidden"}>
      ${iconButton("variable-search", "搜索变量", "search", `aria-expanded="${!!editor.variableSearchOpen}" aria-controls="aw-variable-search"`)}
      ${iconButton("variable-new", "新增变量", "variable-plus")}</div></th></tr></thead><tbody>${draft.variables.map(item => {
      const uses = [...new Set((references.get(item.id) || []).map(use => lines.get(use.nodeId)?.number))].filter(number => number !== undefined);
      return `<tr data-variable-id="${esc(item.id)}"><td><button type="button" class="aw-variable-name" data-aw="variable-edit">${esc(item.name)}</button></td><td>${esc(tools.typeNames[item.type])}</td><td>${uses.length ? uses.map(number => `<button type="button" class="aw-variable-name" data-aw="variable-locate" data-line="${number}" aria-label="定位第 ${number} 行">${number}</button>`).join("、") : "—"}</td><td>${iconButton("variable-delete", "删除变量 " + item.name, "trash")}</td></tr>`;
    }).join("")}</tbody></table>${empty("暂无变量")}`
      : `<table><thead><tr><th scope="col">错误与警告</th><th scope="col">工作流</th><th scope="col">行号</th></tr></thead><tbody>${entries.map((entry, index) => `<tr><td><button type="button" class="aw-table-link" data-aw="error-locate" data-error="${index}">${entry.severity === "warning" ? '<span class="aw-diagnostic-warning">警告</span> ' : ""}${esc(entry.message)}</button></td><td>${esc(draft.name)}</td><td>${lines.get(entry.nodeId)?.number || "—"}</td></tr>`).join("")}</tbody></table>${entries.length ? "" : empty("暂无错误")}<div class="aw-error" data-editor-error role="alert"></div>`);
    if (variable) filterVariables(editor);
  }
  function revealNode(editor, id) {
    const lines = tools.lines(editor.draft), target = lines.get(id)?.row;
    if (target) {
      for (const { row } of lines.values()) if (containsFold(row, target) ||
        row.path.length < target.path.length && row.path.every((key, index) => target.path[index] === key)) editor.collapsed.delete(row.node.id);
      editor.selected = target.key; editor.reveal = true;
    }
    paintEditor(editor); focusSelection(editor);
  }
  async function editNote(state, editor, row) {
    let input;
    const answer = await state.ctx.dialog(state.shadow, { title: "指令备注", className: "aw-automation-dialog", form: true,
      render: node => { html(node, `<div class="aw aw-form"><label>备注<textarea data-note aria-label="备注" rows="4">${esc(row.node.note || "")}</textarea></label></div>`); input = node.querySelector("[data-note]"); },
      actions: [{ id: "cancel", label: "取消" }, { id: "save", label: "确定", primary: true }],
    });
    if (answer === "save" && input.value !== (row.node.note || "")) { snapshot(editor); if (input.value) row.node.note = input.value; else delete row.node.note; paintEditor(editor); }
  }
  function available(editor, action, row) {
    if (action === "undo" || action === "redo") return !!editor[action].length;
    if (action === "paste") return !!clipboard;
    if (action === "note") return !!row?.node && !row.marker && row.node.action !== "comment";
    if (action === "clear-note") return !!row?.node && !row.marker && row.node.action === "comment" && !!row.node.note;
    if (action === "disable") return !!row?.node && (!row.marker || row.marker === "end-if");
    if (action === "node-delete") return !!row?.node && (!row.marker || isFold(row) || ["else-if", "else", "catch", "finally"].includes(row.marker));
    if (["fold", "unfold"].includes(action)) return canFold(row) || !!row?.node && !isFold(row) && row.node.kind !== "action";
    return !!row?.node && !row.marker;
  }
  async function editorCommand(state, editor, action, row = editor.rows.find(row => row.key === editor.selected)) {
    if (action === "save-workflow") { editor.root.closest("dialog").querySelector('[data-dialog-action="save"]').click(); return; }
    if (!available(editor, action, row)) return;
    if (action === "copy" || action === "cut") {
      clipboard = tools.capture(editor.draft, row.node, action === "cut");
      if (action === "cut") { snapshot(editor); flow.pathGet(editor.draft, row.listPath).splice(row.index, 1); paintEditor(editor); focusSelection(editor); }
      editor.status.textContent = action === "cut" ? "指令已剪切" : "指令已复制";
    } else if (action === "paste") {
      const cursor = row ? cursorFor(row, editor.draft) : { path: ["steps"], index: editor.draft.steps.length };
      snapshot(editor); const node = tools.paste(editor.draft, clipboard);
      flow.pathGet(editor.draft, cursor.path).splice(cursor.index, 0, node);
      if (row?.node) editor.collapsed.delete(row.node.id);
      editor.selected = node.id; editor.reveal = true; paintEditor(editor); focusSelection(editor);
    } else if (action === "undo" || action === "redo") {
      const from = editor[action], to = editor[action === "undo" ? "redo" : "undo"];
      to.push(flow.clone(editor.draft)); Object.assign(editor.draft, from.pop()); editor.diagnostics = null; editor.cursor = null;
      editor.root.querySelector("[data-name]").value = editor.draft.name; paintEditor(editor); focusSelection(editor);
    } else if (action === "fold" || action === "unfold") {
      action === "fold" ? editor.collapsed.add(row.node.id) : editor.collapsed.delete(row.node.id); paintEditor(editor); focusSelection(editor);
    } else if (action === "disable") {
      const key = row.marker === "end-if" ? "endDisabled" : "disabled";
      snapshot(editor); if (row.node[key]) delete row.node[key]; else row.node[key] = true;
      paintEditor(editor); focusSelection(editor);
    } else if (action === "note") await editNote(state, editor, row);
    else if (action === "clear-note") { snapshot(editor); delete row.node.note; paintEditor(editor); focusSelection(editor); }
    else if (action === "node-delete") await removeNode(state, editor, row);
  }
  function openContextMenu(state, editor, row, point) {
    editor.closeMenu?.(); editor.selected = row.key; paintEditor(editor);
    const menu = document.createElement("div"); menu.className = "aw aw-context-menu"; menu.popover = "manual"; menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", "指令菜单");
    const disabled = row.marker === "end-if" ? row.node.endDisabled : row.node.disabled;
    const entries = [["copy", "复制", "Ctrl+C", "copy"], ["cut", "剪切", "Ctrl+X", "scissors"], ["paste", "粘贴", "Ctrl+V", "clipboard"],
      ["disable", disabled ? "启用此指令" : "禁用此指令", "Ctrl+/", disabled ? "circle-check" : "circle-off"], null,
      ...(row.node.action === "comment" ? (row.node.note ? [["clear-note", "移除附加备注", "", "eraser"]] : []) : [["note", "指令备注", "Ctrl+Alt+/", "message"]]),
      ["redo", "重做", "Ctrl+Y", "arrow-forward-up"], ["undo", "撤销", "Ctrl+Z", "arrow-back-up"], null,
      ["fold", "收起", "Ctrl+[", "chevron-right"], ["unfold", "展开", "Ctrl+]", "chevron-down"], null,
      ["node-delete", isFold(row) ? "移除折叠标记" : "删除", "Delete", "trash"]];
    html(menu, entries.map(item => {
      if (!item) return "<hr role=separator>";
      const [action, label, shortcut, iconName] = item;
      return `<button type="button" role="menuitem" tabindex="-1" class="aw-context-item${action === "node-delete" ? " aw-context-danger" : ""}" data-command="${action}" ${available(editor, action, row) ? "" : "disabled"}>${icon(iconName)}<span>${label}</span><kbd aria-hidden="true">${shortcut}</kbd></button>`;
    }).join(""));
    editor.root.append(menu); const lifetime = new AbortController();
    const close = (restore = false) => { lifetime.abort(); if (menu.isConnected) { if (menu.matches(":popover-open")) menu.hidePopover(); menu.remove(); } editor.closeMenu = null; if (restore) focusSelection(editor); };
    editor.closeMenu = close; menu.showPopover();
    const bounds = menu.getBoundingClientRect(), doc = menu.ownerDocument.documentElement;
    menu.style.left = Math.max(12, Math.min(point.x, doc.clientWidth - bounds.width - 12)) + "px";
    menu.style.top = Math.max(12, Math.min(point.y, doc.clientHeight - bounds.height - 12)) + "px";
    menu.querySelector("button:not(:disabled)")?.focus();
    menu.addEventListener("click", event => { const button = event.target.closest("[data-command]"); if (!button || button.disabled) return; event.stopPropagation(); close(true); void editorCommand(state, editor, button.dataset.command, row).catch(error => reportFailure(error, null, editor)); });
    menu.addEventListener("keydown", event => {
      if (event.key === "Escape" || event.key === "Tab") { event.stopPropagation(); if (event.key === "Escape") event.preventDefault(); close(event.key === "Escape"); return; }
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation(); const items = [...menu.querySelectorAll("button:not(:disabled)")], index = items.indexOf(menu.getRootNode().activeElement);
      items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length]?.focus();
    });
    editor.root.closest("dialog").addEventListener("pointerdown", event => { if (!event.composedPath().includes(menu)) close(); }, { signal: lifetime.signal, capture: true });
    editor.root.querySelector(".aw-canvas").addEventListener("scroll", () => close(), { signal: lifetime.signal, passive: true });
    root.addEventListener("resize", () => close(), { signal: lifetime.signal });
  }
  async function editWorkflow(state, original = null) {
    const draft = original ? tools.openDraft(original) : model.newWorkflow(flow.numericId("wf-", state.bundle.workflows));
    const initial = JSON.stringify(draft), controller = new AbortController(); let editor;
    const [registry, membership] = await Promise.all([state.ctx.storage.getAi(), state.ctx.storage.getMembership()]);
    try {
      await state.ctx.dialog(state.shadow, { title: original ? "编辑工作流" : "新建工作流", className: "aw-workflow-dialog", form: true, isDirty: () => JSON.stringify(draft) !== initial,
        renderFooter(actions) {
          const status = actions.ownerDocument.createElement("span");
          status.className = "aw-editor-status";
          status.dataset.live = "";
          status.setAttribute("role", "status");
          actions.prepend(status);
          editor.status = status;
        },
        initial: node => node.querySelector("[data-name]"),
        render: node => {
          html(node, `<div class="aw aw-editor"><div class="aw-editor-top"><label class="aw-workflow-name">${icon("binary-tree")}<input data-name aria-label="工作流名称" placeholder="工作流名称" value="${esc(draft.name)}"></label>
            <div class="aw-editor-toolbar" role="toolbar" aria-label="工作流工具" focusgroup="toolbar wrap">${iconButton("expand-all", "全部展开", "chevrons-down")}${iconButton("collapse-all", "全部折叠", "chevrons-up")}<span class="aw-tool-separator" role="separator" aria-orientation="vertical"></span>${iconButton("undo", "撤销", "arrow-back-up")}${iconButton("redo", "重做", "arrow-forward-up")}<span class="aw-tool-separator" role="separator" aria-orientation="vertical"></span>${iconButton("variables", "变量列表", "variable")}${iconButton("validate", "重新校验", "list-check", 'aria-controls="aw-inspector-panel"')}</div>
            </div><div class="aw-editor-main"><aside class="aw-palette" aria-label="指令库"><input type="search" data-search aria-label="搜索指令" placeholder="搜索指令">
            ${palette()}
            </aside><div class="aw-canvas" role="listbox" aria-label="工作流指令" aria-multiselectable="false"></div></div>
            <section class="aw-inspector" aria-label="工作流检查"><div class="aw-inspector-head"><div class="aw-tabs" role="tablist" aria-label="工作流检查面板"><button type="button" role="tab" id="aw-inspector-errors" data-inspector-tab="errors" aria-controls="aw-inspector-panel">错误列表</button><button type="button" role="tab" id="aw-inspector-variables" data-inspector-tab="variables" aria-controls="aw-inspector-panel">变量列表</button></div><span data-count></span>${iconButton("panel-toggle", "折叠或展开检查面板", "layout-bottombar", 'aria-expanded="true" aria-controls="aw-inspector-panel"')}</div><div class="aw-inspector-panel" id="aw-inspector-panel" role="tabpanel"></div></section></div>`);
          editor = { draft, root: node, registry, membership, plans: state.bundle.prompts, undo: [], redo: [], selected: "root-gap", rows: [], collapsed: new Set(), cursor: null, insertion: null, panel: "errors", panelClosed: false, diagnostics: null };
          paintEditor(editor); bindEditor(state, editor, controller.signal);
        },
        actions: [{ id: "cancel", label: "取消" }, { id: "save", label: "保存", primary: true }],
        onAction: async (action, node) => {
          if (action !== "save") return true;
          try {
            const workflow = tools.forStorage(draft);
            flow.validate(workflow);
            const next = flow.clone(state.bundle), index = next.workflows.findIndex(item => item.id === workflow.id);
            if (index < 0) next.workflows.push(workflow); else next.workflows[index] = workflow;
            await save(state, next); return true;
          } catch (error) { reportFailure(error, null, editor); return false; }
        },
      });
    } finally { editor?.closeMenu?.(); controller.abort(); }
  }
  function locateError(editor, error) {
    editor.panel = "errors"; editor.panelClosed = false;
    if (error.nodeId) revealNode(editor, error.nodeId); else paintInspector(editor);
    editor.root.querySelector("[data-editor-error]").textContent = editor.diagnostics.some(item => item.nodeId === error.nodeId && item.message === error.message) ? "" : error.message;
  }
  function bindEditor(state, editor, signal) {
    const node = editor.root, canvas = node.querySelector(".aw-canvas");
    const toolbar = node.querySelector(".aw-editor-toolbar");
    if (!("focusGroup" in HTMLElement.prototype)) {
      const buttons = [...toolbar.querySelectorAll("button")]; buttons.forEach((button, index) => { button.tabIndex = index ? -1 : 0; });
      toolbar.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); const current = buttons.indexOf(event.target);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowLeft" ? -1 : 1) + buttons.length) % buttons.length;
        buttons.forEach((button, index) => { button.tabIndex = index === next ? 0 : -1; }); buttons[next].focus();
      }, { signal });
    }
    node.addEventListener("click", event => {
      const tab = event.target.closest("[data-inspector-tab]"); if (!tab) return;
      editor.panel = tab.dataset.inspectorTab; editor.panelClosed = false; paintInspector(editor);
    }, { signal });
    node.addEventListener("keydown", event => {
      if (!event.defaultPrevented && !event.isComposing && event.target.hasAttribute("data-variable-search") && event.key === "Escape") {
        event.preventDefault(); event.stopPropagation();
        editor.variableSearchOpen = false; editor.variableQuery = "";
        paintInspector(editor); node.querySelector('[data-aw="variable-search"]').focus();
        return;
      }
      const tab = event.target.closest("[data-inspector-tab]");
      if (tab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault(); const target = node.querySelector(`[data-inspector-tab="${event.key === "Home" ? "errors" : event.key === "End" ? "variables" : editor.panel === "errors" ? "variables" : "errors"}"]`); target.click(); target.focus(); return;
      }
      if (event.defaultPrevented || event.isComposing || event.target.closest("input,textarea,select,[contenteditable=true]")) return;
      const key = event.key.toLowerCase(), modifier = event.ctrlKey || event.metaKey;
      let action = modifier && !event.altKey ? ({ c: "copy", x: "cut", v: "paste", z: event.shiftKey ? "redo" : "undo", y: "redo", s: "save-workflow", "[": "fold", "]": "unfold", "/": "disable" })[key] : modifier && event.altKey && event.code === "Slash" ? "note" : event.key === "Delete" ? "node-delete" : null;
      if (event.key === "F10" && event.shiftKey) {
        event.preventDefault(); event.stopPropagation(); const row = editor.rows.find(row => row.key === editor.selected), element = canvas.querySelector(`[data-key="${CSS.escape(editor.selected)}"]`);
        if (row && element) { const rect = element.getBoundingClientRect(); openContextMenu(state, editor, row, { x: rect.left + 70, y: rect.bottom }); } return;
      }
      if (!action || event.target.closest(".aw-context-menu")) return;
      event.preventDefault(); event.stopPropagation(); void editorCommand(state, editor, action).catch(error => reportFailure(error, null, editor));
    }, { signal });
    canvas.addEventListener("contextmenu", event => {
      const row = editor.rows[Number(event.target.closest("[data-row]")?.dataset.row)]; if (!row || row.marker === "insert") return;
      event.preventDefault(); event.stopPropagation(); openContextMenu(state, editor, row, { x: event.clientX, y: event.clientY });
    }, { signal });
    node.addEventListener("input", event => {
      if (event.target.hasAttribute("data-variable-search")) {
        editor.variableQuery = event.target.value; filterVariables(editor);
      }
      if (event.target.hasAttribute("data-name")) { editor.draft.name = event.target.value; editor.diagnostics = null; paintInspector(editor); }
      if (event.target.hasAttribute("data-search")) {
        const query = event.target.value.trim().toLocaleLowerCase(), palette = event.target.closest(".aw-palette");
        const groups = [...palette.querySelectorAll("details")];
        if (query && !editor.paletteOpen) editor.paletteOpen = new Set(groups.filter(group => group.open));
        for (const control of palette.querySelectorAll("[data-instruction]")) {
          control.hidden = !!query && !(control.textContent + " " + control.title).toLocaleLowerCase().includes(query);
        }
        for (const group of groups) {
          if (query) {
            group.open = !!group.querySelector("[data-instruction]:not([hidden])");
            group.hidden = !group.open;
          } else {
            group.hidden = false;
            if (editor.paletteOpen) group.open = editor.paletteOpen.has(group);
          }
        }
        if (!query) editor.paletteOpen = null;
      }
      if (event.target.hasAttribute("data-insert-search")) { editor.insertion.query = event.target.value; editor.insertion.active = 0; renderPicker(editor); }
    }, { signal });
    node.addEventListener("pointerdown", event => { if (event.target.closest(".aw-candidate")) event.preventDefault(); }, { signal });
    node.addEventListener("keydown", event => {
      if (!event.target.hasAttribute("data-insert-search") || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
      if (!["ArrowUp", "ArrowDown", "Home", "End", "Enter", "Escape"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const insertion = editor.insertion, count = insertion.candidates.length;
      if (event.key === "Escape") {
        closeInsertion(editor); return;
      }
      if (event.key === "Enter") {
        const item = insertion.candidates[insertion.active];
        if (item) void addInstruction(state, editor, item.id).catch(error => reportFailure(error, null, editor));
      } else if (count) {
        insertion.active = event.key === "Home" ? 0 : event.key === "End" ? count - 1 : (insertion.active + (event.key === "ArrowUp" ? -1 : 1) + count) % count;
        renderPicker(editor);
      }
    }, { signal });
    canvas.addEventListener("scroll", () => positionPicker(editor), { passive: true, signal });
    root.addEventListener("resize", () => positionPicker(editor), { signal });
    node.addEventListener("click", event => {
      const row = editor.rows[Number(event.target.closest("[data-row]")?.dataset.row)], control = event.target.closest("[data-aw]");
      if (row && !event.target.closest(".aw-insert-row")) {
        const inserting = !!editor.insertion;
        if (inserting) closeInsertion(editor, false);
        editor.selected = row.key; editor.cursor = row.marker === "insert" ? cursorFor(row, editor.draft) : null;
        for (const element of canvas.querySelectorAll("[data-key]")) element.setAttribute("aria-selected", String(element.dataset.key === row.key));
        if (inserting) paintEditor(editor);
      }
      if (control?.getAttribute("aria-disabled") === "true" || (!control && !event.target.closest("[data-instruction]"))) return;
      if (editor.insertion && control && !["insert", "select-gap", "insert-cancel"].includes(control.dataset.aw)) closeInsertion(editor);
      event.stopPropagation();
      void (async () => {
        if (event.target.closest("[data-instruction]")) return addInstruction(state, editor, event.target.closest("[data-instruction]").dataset.instruction);
        const action = control.dataset.aw;
        if (action === "collapse") { editor.collapsed.has(row.node.id) ? editor.collapsed.delete(row.node.id) : editor.collapsed.add(row.node.id); paintEditor(editor); }
        else if (action === "expand-all" || action === "collapse-all") {
          editor.collapsed.clear();
          if (action === "collapse-all") {
            const selected = editor.rows.find(item => item.key === editor.selected);
            const rows = flow.rows(editor.draft), path = selected?.path || selected?.listPath;
            const owner = selected && rows.find(row => canFold(row) && (containsFold(row, selected) ||
              (row.path.length < path.length && row.path.every((key, index) => path[index] === key)) ||
              row.node === selected.node && ["else-if", "else", "catch", "finally"].includes(selected.marker)));
            if (owner) {
              editor.selected = owner.key;
              editor.cursor = null;
              editor.reveal = true;
            }
            for (const row of rows) if (canFold(row)) editor.collapsed.add(row.key);
          }
          paintEditor(editor);
        }
        else if (["node-delete", "copy", "cut", "paste", "undo", "redo", "note"].includes(action)) await editorCommand(state, editor, action, row);
        else if (action === "validate") {
          editor.membership = await state.ctx.storage.getMembership();
          if (signal.aborted) return;
          editor.diagnostics = null; editor.panel = "errors"; editor.panelClosed = false; paintInspector(editor);
          if (editor.diagnostics.length) revealNode(editor, editor.diagnostics[0].nodeId);
          editor.status.textContent = diagnosticSummary(editor.diagnostics) || "校验通过";
        }
        else if (action === "variables") { editor.panel = "variables"; editor.panelClosed = false; paintInspector(editor); }
        else if (action === "variable-search") {
          editor.variableSearchOpen = !editor.variableSearchOpen; editor.variableQuery = "";
          paintInspector(editor);
          node.querySelector(editor.variableSearchOpen ? "[data-variable-search]" : '[data-aw="variable-search"]').focus();
        }
        else if (action === "panel-toggle") { editor.panelClosed = !editor.panelClosed; paintInspector(editor); }
        else if (action === "error-locate") revealNode(editor, editor.diagnostics[Number(control.dataset.error)].nodeId);
        else if (action === "variable-locate") revealNode(editor, [...tools.lines(editor.draft)].find(([, item]) => item.number === Number(control.dataset.line))[0]);
        else if (["variable-new", "variable-edit", "variable-delete"].includes(action)) await variableAction(state, editor, action, control.closest("[data-variable-id]")?.dataset.variableId);
        else if (action === "select-gap" || action === "insert") openInsertion(editor, row, control.dataset.position === "before");
        else if (action === "insert-cancel") closeInsertion(editor);
      })().catch(error => reportFailure(error, null, editor));
    }, { signal });
    const edit = event => {
      if (event.target.closest(".aw-insert-control")) return;
      const row = editor.rows[Number(event.target.closest("[data-row]")?.dataset.row)];
      if (row?.marker === "fold-start") {
        void editFoldName(state, row.node.name).then(name => {
          if (name !== null && name !== row.node.name) { snapshot(editor); row.node.name = name; paintEditor(editor); focusSelection(editor); }
        }).catch(error => reportFailure(error, null, editor));
        return;
      }
      if (isFold(row)) return;
      if (row?.node && !row.marker?.startsWith("end-") && !["insert", "else", "finally"].includes(row.marker)) void editNode(state, editor, row).then(() => paintEditor(editor)).catch(error => reportFailure(error, null, editor));
    };
    canvas.addEventListener("dblclick", edit, { signal });
    canvas.addEventListener("keydown", event => {
      const row = editor.rows[Number(event.target.closest("[data-row]")?.dataset.row)];
      if (!row || event.defaultPrevented || event.target.closest("input,textarea,select,[contenteditable=true]")) return;
      if (event.key === "Enter" && !event.target.closest("button")) { event.preventDefault(); edit(event); }
      if (!event.altKey && ["ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        const rows = [...canvas.querySelectorAll("[data-key]")], index = rows.indexOf(event.target.closest("[data-key]"));
        const next = rows[index + (event.key === "ArrowUp" ? -1 : 1)];
        if (next) { editor.selected = next.dataset.key; editor.cursor = null; paintEditor(editor); canvas.querySelector(`[data-key="${CSS.escape(editor.selected)}"]`)?.focus(); }
      }
      if (event.altKey && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key) && row.path && !row.marker) {
        event.preventDefault(); const index = Number(row.path.at(-1)), listPath = row.path.slice(0, -1), list = flow.pathGet(editor.draft, listPath);
        let destination;
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          const position = event.key === "ArrowUp" ? index - 1 : index + 2;
          if (position >= 0 && position <= list.length) destination = { path: listPath, index: position };
        } else if (event.key === "ArrowRight" && index > 0 && !["action", "fold"].includes(list[index - 1].kind)) {
          const preceding = list[index - 1], path = [...listPath, index - 1, ...(preceding.kind === "if" ? ["branches", 0, "steps"] : ["body"])];
          editor.collapsed.delete(preceding.id); destination = { path, index: flow.pathGet(editor.draft, path).length };
        } else if (event.key === "ArrowLeft" && listPath.length > 1) {
          const parent = editor.rows.filter(item => !item.marker && item.node.kind !== "action" && item.path.length < row.path.length && item.path.every((key, index) => row.path[index] === key)).at(-1);
          if (parent) destination = { path: parent.listPath, index: parent.index + 1 };
        }
        if (destination) { moveNode(editor, row, destination); editor.root.querySelector(`[data-key="${CSS.escape(row.node.id)}"] .aw-handle`)?.focus(); }
      }
    }, { signal });
    bindDrag(editor, signal);
    let instruction = null;
    node.addEventListener("dragstart", event => { const button = event.target.closest("[data-instruction]"); if (button) { instruction = button.dataset.instruction; event.dataTransfer.setData("text/plain", instruction); event.dataTransfer.effectAllowed = "copy"; } }, { signal });
    canvas.addEventListener("dragover", event => { if (instruction) { event.preventDefault(); markDrop(editor, dropTarget(editor, event.clientY)); } }, { signal });
    canvas.addEventListener("drop", event => {
      if (!instruction) return; event.preventDefault();
      const target = dropTarget(editor, event.clientY); markDrop(editor, null);
      if (!target) return;
      editor.cursor = target.cursor; const key = instruction; instruction = null;
      void addInstruction(state, editor, key).catch(error => reportFailure(error, null, editor));
    }, { signal });
    node.addEventListener("dragend", () => { instruction = null; markDrop(editor, null); }, { signal });
  }
  function dropTarget(editor, y) {
    const canvas = editor.root.querySelector(".aw-canvas"), elements = [...canvas.querySelectorAll("[data-row]")];
    const element = elements.find(element => y <= element.getBoundingClientRect().bottom) || elements.at(-1);
    if (!element) return null;
    const index = Number(element.dataset.row), row = editor.rows[index], box = element.getBoundingClientRect();
    let before = y < box.top + box.height / 2, cursor;
    if (row.marker === "insert") cursor = cursorFor(row, editor.draft);
    else if (!before) cursor = cursorFor(row, editor.draft);
    else if (row.listPath) cursor = { path: row.listPath, index: row.index };
    else if (editor.rows[index - 1]?.marker === "insert") {
      // 分支末尾的插入位置仍保留在结构投影中，不依赖常驻的添加按钮
      cursor = cursorFor(editor.rows[index - 1], editor.draft);
    } else { before = false; cursor = cursorFor(row, editor.draft); }
    return { element, before, cursor };
  }
  function markDrop(editor, target) {
    for (const element of editor.root.querySelectorAll("[data-drop]")) delete element.dataset.drop;
    if (target) target.element.dataset.drop = target.before ? "before" : "after";
  }
  function bindDrag(editor, signal) {
    const canvas = editor.root.querySelector(".aw-canvas"); let drag = null;
    const clear = () => {
      if (!drag) return;
      const current = drag; drag = null; root.cancelAnimationFrame(current.frame);
      current.element.classList.remove("aw-dragging"); canvas.classList.remove("aw-grabbing");
      for (const node of canvas.querySelectorAll("[data-drop]")) delete node.dataset.drop;
      if (current.handle.hasPointerCapture(current.pointer)) current.handle.releasePointerCapture(current.pointer);
    };
    const paint = () => {
      if (!drag) return;
      drag.frame = 0; const bounds = canvas.getBoundingClientRect(), before = canvas.scrollTop;
      if (drag.y < bounds.top + 40) canvas.scrollTop -= 8;
      else if (drag.y > bounds.bottom - 40) canvas.scrollTop += 8;
      const target = dropTarget(editor, drag.y);
      markDrop(editor, target); drag.target = target?.cursor || null;
      if (canvas.scrollTop !== before) drag.frame = root.requestAnimationFrame(paint);
    };
    canvas.addEventListener("pointerdown", event => {
      const handle = event.target.closest(".aw-handle");
      if (!handle || !event.isPrimary || event.button !== 0 || drag) return;
      const element = handle.closest("[data-row]"), row = editor.rows[Number(element.dataset.row)];
      handle.setPointerCapture(event.pointerId); drag = { handle, element, row, pointer: event.pointerId, start: event.clientY, y: event.clientY, active: false, target: null, frame: 0 };
    }, { signal });
    document.addEventListener("pointermove", event => {
      if (!drag || drag.pointer !== event.pointerId) return;
      drag.y = event.clientY;
      if (!drag.active && Math.abs(drag.y - drag.start) > 4) { drag.active = true; drag.element.classList.add("aw-dragging"); canvas.classList.add("aw-grabbing"); }
      if (drag.active && !drag.frame) drag.frame = root.requestAnimationFrame(paint);
    }, { signal });
    document.addEventListener("pointerup", event => {
      if (!drag || drag.pointer !== event.pointerId) return;
      if (drag.active) { drag.y = event.clientY; root.cancelAnimationFrame(drag.frame); paint(); }
      const current = drag; clear();
      if (current.active && current.target) {
        try { moveNode(editor, current.row, current.target); editor.root.querySelector(`[data-key="${CSS.escape(current.row.node.id)}"] .aw-handle`)?.focus({ preventScroll: true }); }
        catch (error) { reportFailure(error, null, editor); }
      }
    }, { signal });
    for (const type of ["pointercancel", "lostpointercapture"]) canvas.addEventListener(type, event => { if (drag?.pointer === event.pointerId) clear(); }, { signal });
    document.addEventListener("keydown", event => { if (drag && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); clear(); } }, { signal, capture: true });
    signal.addEventListener("abort", clear, { once: true });
  }
  async function variableAction(state, editor, action, id) {
    const next = flow.clone(editor.draft), selected = next.variables.find(item => item.id === id);
    if (action === "variable-delete") {
      if (!await confirm(state, "删除变量", `将删除“${selected.name}”。引用该变量的指令需要重新选择变量，修正前不能保存工作流。`)) return;
      next.variables.splice(next.variables.indexOf(selected), 1);
    } else if (!await editVariable(state, next, selected)) return;
    if (JSON.stringify(next) !== JSON.stringify(editor.draft)) { snapshot(editor); Object.assign(editor.draft, next); paintEditor(editor); }
  }
  async function resolveOutputNames(state, container, workspace, working) {
    const clean = flow.clone(workspace), resolved = {}, entries = root.STWorkflowValues.outputEntries(container, workspace);
    for (const [path, entry] of Object.entries(entries)) {
      const name = entry.name.trim(), old = workspace.variables.find(item => item.id === entry.id);
      if (!name || !old || name === old.name) continue;
      const uses = tools.uses(workspace, old.id).filter(use => use.nodeId !== working.id || use.role !== "write" || use.key !== path);
      let global = true;
      if (uses.length) {
        const answer = await state.ctx.dialog(state.shadow, { title: "修改共享变量", className: "aw-automation-dialog", form: true,
          message: `“${old.name}”还在其他 ${uses.length} 个位置使用。是否在当前工作流中统一改为“${name}”？`,
          actions: [{ id: "cancel", label: "取消" }, { id: "current", label: "仅当前指令" }, { id: "global", label: "全局修改", primary: true }],
        });
        if (answer === "cancel") return null;
        global = answer === "global";
      }
      if (global) {
        const existing = clean.variables.find(item => item.name === name);
        if (existing && existing.id !== old.id) { tools.replace(clean, old.id, existing.id); resolved[path] = existing.id; }
        else { clean.variables.find(item => item.id === old.id).name = name; resolved[path] = old.id; }
        for (const [other, output] of Object.entries(entries)) if (output.id === old.id && output.name.trim() === old.name) resolved[other] = resolved[path];
      }
    }
    return { clean, resolved };
  }
  async function testValues(state, workflow, node) {
    const ids = new Set(); let needsInput = false, needsTrigger = false;
    function visit(value) {
      value = flow.activeValue(value);
      if (!value || typeof value !== "object") return;
      if (value.source === "variable") ids.add(value.id);
      if (value.source === "input") needsInput = true;
      if (value.source === "meta" && value.path[0] !== "workflowName") needsTrigger = true;
      if (value.template) value.template.forEach(visit);
      if (value.expression) value.expression.forEach(visit);
    }
    for (const [, value] of flow.inputs(node)) visit(value);
    for (const value of flow.conditionInputs(node)) visit(value);
    if (!ids.size && !needsInput && !needsTrigger) return { input: {}, variables: {} };
    const sample = { input: flow.literal({}), meta: { triggerName: "指令试运行", triggerType: "manual" }, values: [...ids].map(id => {
      const variable = workflow.variables.find(item => item.id === id), type = variable.type;
      return { id, name: variable.name, type, value: flow.literal(({ number: 0, boolean: false, list: [], object: {}, result: {} })[type] ?? "") };
    }) }, scope = { variables: [], literalOnly: true };
    let container, result = null;
    const triggerTypes = [["manual", triggerModes.manual], ...Object.entries(gameEvents), ["schedule", triggerModes.schedule]];
    const render = () => formHtml(container, `<div class="aw aw-form"><div class="aw-grid">
      ${needsTrigger ? parameterProp("触发器名称样例", "meta.triggerName", sample.meta.triggerName) +
        parameterProp("触发类型样例", "meta.triggerType", sample.meta.triggerType, triggerTypes) : ""}
      ${needsInput ? valueField("触发器输入样例", sample.input, "input", scope, [], "object") : ""}
      ${sample.values.map((item, index) => valueField(item.name + "样例", item.value, `values.${index}.value`, scope, [], item.type === "result" ? "object" : item.type)).join("")}
      </div><div class="aw-error" role="alert"></div></div>`);
    const answer = await state.ctx.dialog(state.shadow, { title: "试运行输入", className: "aw-param-dialog", form: true,
      render: node => { container = node; render(); root.STWorkflowValues.bind(node, sample, scope, { dialog: state.ctx.dialog, shadow: state.shadow, render }); },
      actions: [{ id: "cancel", label: "取消" }, { id: "run", label: "运行", primary: true }],
      onAction: action => {
        if (action !== "run") return true;
        try {
          collect(container, sample, scope);
          if (needsTrigger && !sample.meta.triggerName.trim()) throw new Error("请填写触发器名称样例");
          result = { input: needsInput ? flow.read(sample.input, flow.state()) : {}, variables: Object.fromEntries(sample.values.map(item => [item.id, flow.read(item.value, flow.state())])),
            ...(needsTrigger ? { meta: sample.meta } : {}) };
          const checked = flow.state({}, {}, workflow);
          for (const [id, value] of Object.entries(result.variables)) flow.write(checked, id, value);
          return true;
        } catch (error) { reportFailure(error, container.querySelector(".aw-error")); return false; }
      },
    });
    return answer === "run" ? result : null;
  }
  async function editNode(state, editor, row) {
    const prop = parameterProp;
    const workspace = flow.clone(editor.draft), working = flow.pathGet(workspace, row.path);
    const values = root.STWorkflowValues, emptyInput = JSON.stringify(values.comparable(flow.literal("")));
    if (working.action === "ai-call") {
      working.mapping = Object.entries(working.inputs || {}).map(([key, value]) => ({ key, value }));
      working.context ??= flow.literal("");
    }
    working._timeout = working.timeout ? "true" : "false"; working._timeoutSeconds = working.timeout?.seconds || 60;
    let initial, promptParameters = null;
    let container, branch = row.branch || 0, parameterTab = "general", codeEditor = null, renderEpoch = 0, previewId = null, previewText = "";
    let preparingPreview = false;
    const lifetime = new AbortController(), dataDefinition = flow.definitions[working.action];
    const http = working.action === "http-request", permissions = new Map();
    let authorizing = "", permissionTimer = 0;
    working.onError ||= "throw";
    const initialValue = flow.activeValue(working.value);
    if (working.action === "set") working.valueType ||= Object.hasOwn(initialValue, "literal") ? ({ string: "text", number: "number", boolean: "boolean", list: "list", object: "object" }[Array.isArray(initialValue.literal) ? "list" : typeof initialValue.literal] || "any") : "any";
    const selectedPrompt = node => editor.plans.find(item => item.id === node.promptId);
    function promptFields(node) {
      const plan = selectedPrompt(node);
      const service = root.STAI.boundService(editor.registry, node.serviceId);
      return plan && service ? root.STPromptPlans.parameters(plan, service.protocol) : [];
    }
    function promptMapping(node) {
      const keys = new Set(promptFields(node));
      return node.mapping.filter(item => keys.has(item.key));
    }
    function validatePromptInputs() {
      const chosen = selectedPrompt(working);
      const missing = promptFields(working).find(name => {
        const item = working.mapping.find(row => row.key === name);
        return !item || flow.activeValue(item.value).literal === "";
      });
      if (chosen && missing === undefined) return true;
      if (parameterTab !== "general") { parameterTab = "general"; render(); }
      const index = working.mapping.findIndex(item => item.key === missing);
      const field = container.querySelector('[data-value="mapping.' + index + '.value"]');
      const control = field?.querySelector("[data-value-text]") || container.querySelector('[data-prop="promptId"]');
      container.querySelector(".aw-error").textContent = !chosen ? "请选择提示词模板"
        : missing === root.STPromptPlans.userParameter(chosen) ? "请填写用户提示词" : "请为占位符「" + missing + "」提供数据";
      control?.setAttribute("aria-invalid", "true");
      control?.focus();
      return false;
    }
    function promptInputs() {
      const userParameter = root.STPromptPlans.userParameter(selectedPrompt(working));
      promptParameters = promptFields(working);
      return promptParameters.map(name => {
        let index = working.mapping.findIndex(item => item.key === name);
        if (index < 0) {
          index = working.mapping.length;
          working.mapping.push({ key: name, value: flow.literal("") });
        }
        return valueField(name === userParameter ? "用户提示词" : name, working.mapping[index].value, "mapping." + index + ".value", workspace);
      }).join("");
    }
    function requestSite(node) {
      const inferred = flow.staticHttpOrigin(node.url);
      if (inferred) return inferred;
      if (Object.hasOwn(flow.activeValue(node.url), "literal")) return "";
      const explicit = flow.httpUrl(node.origin);
      return explicit && explicit.href === explicit.origin + "/" ? explicit.origin : "";
    }
    function permissionMessage(action, fields) {
      return root.STMessageBus.request({ type: "AI_GATEWAY_PERMISSION_" + action, purpose: "workflow-http", ...fields }, { timeoutMs: 10000, logFailures: false }).then(result => {
        if (result?.success !== true) throw new Error(result?.error || "站点授权操作失败");
        return result;
      });
    }
    function paintHttpSite() {
      const status = container.querySelector("[data-http-status]");
      if (!status || lifetime.signal.aborted) return;
      const field = container.querySelector('[data-prop="origin"]');
      field.closest("[data-http-site]").hidden = !!flow.staticHttpOrigin(working.url) || Object.hasOwn(flow.activeValue(working.url), "literal");
      const origin = requestSite({ url: working.url, origin: field.value });
      const button = container.querySelector("[data-http-authorize]");
      const permission = permissions.get(origin);
      button.hidden = !origin || permission === true;
      button.disabled = !!authorizing || permission === "checking";
      status.textContent = !origin ? "" : origin + " · " + (permission === true ? "已授权" : permission === false ? "待授权" : "检查授权中…");
      root.clearTimeout(permissionTimer);
      if (!origin || permissions.has(origin)) return;
      button.disabled = true;
      permissionTimer = root.setTimeout(() => {
        permissions.set(origin, "checking");
        void permissionMessage("CHECK", { host: origin }).then(result => {
          permissions.set(origin, result.granted === true);
          paintHttpSite();
        }).catch(error => {
          permissions.set(origin, false);
          if (!lifetime.signal.aborted) { paintHttpSite(); reportFailure(error, container.querySelector(".aw-error")); }
        });
      }, 300);
    }
    async function authorizeHttpSite(origin) {
      if (!origin || authorizing) return;
      authorizing = origin; paintHttpSite();
      if (root.location.protocol === "chrome-extension:" && root.chrome.permissions?.request) {
        try {
          const granted = await root.chrome.permissions.request({ origins: [root.STAI.hostPermissionPattern(origin)] });
          permissions.set(origin, granted === true);
          if (!granted) throw new Error("站点未授权");
        } finally { authorizing = ""; paintHttpSite(); }
        return;
      }
      const requestId = root.STLoggerFactory.createRequestId();
      const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(300000)]);
      let settle, opened = false;
      const result = new Promise(resolve => { settle = resolve; });
      const stop = () => settle(null);
      const subscription = root.STMessageBus.listen("AI_GATEWAY_PERMISSION_RESULT", (message, _sender, respond) => {
        if (message.requestId !== requestId) return false;
        respond({ success: true, received: true });
        settle(message);
        return false;
      }, { owner: "settings-workflow", key: requestId });
      try {
        if (!subscription) throw new Error("当前页面无法接收站点授权结果");
        signal.addEventListener("abort", stop, { once: true });
        const operation = await permissionMessage("OPEN", { host: origin, requestId });
        opened = operation.opened === true;
        if (!opened) throw new Error("无法打开站点授权页");
        const outcome = await result;
        if (lifetime.signal.aborted) return;
        if (!outcome) throw new Error("等待站点授权超时，请重新操作");
        permissions.set(origin, outcome.granted === true);
        if (!outcome.granted) throw new Error(outcome.error || "站点未授权");
      } finally {
        signal.removeEventListener("abort", stop);
        subscription?.dispose();
        authorizing = "";
        paintHttpSite();
        if (opened && signal.aborted) await permissionMessage("CANCEL", { requestId });
      }
    }
    function render() {
      codeEditor?.destroy(); codeEditor = null;
      const epoch = ++renderEpoch;
      let content = "", output = "", promptError;
      if (working.kind === "if") {
        content = conditionHtml(working.branches[branch].condition, `branches.${branch}.condition`, workspace);
      } else if (flow.loops.has(working.kind)) {
        if (working.kind === "for") content = valueField("循环次数", working.count, "count", workspace);
        if (working.kind === "while") content = conditionHtml(working.condition, "condition", workspace);
        if (working.kind === "forever") content = valueField("每轮间隔（秒）", working.seconds, "seconds", workspace);
        if (["foreach", "entries"].includes(working.kind)) content = valueField("循环数据", working.value, "value", workspace) +
          outputField(working.kind === "entries" ? "当前值保存至" : "当前项目保存至", working.item, "item", workspace) +
          outputField(working.kind === "entries" ? "当前键保存至" : "当前序号保存至", working.index, "index", workspace);
      } else if (working.kind === "try") {
        content = outputField("Catch 异常保存至", working.error, "error", workspace) + `<div class="aw-tools">${button("catch-toggle", working.catch === null ? "添加 Catch" : "删除 Catch")}${button("finally-toggle", working.finally === null ? "添加 Finally" : "删除 Finally")}</div>`;
      } else {
        const key = working.action;
        if (http) {
          content += prop("方法", "method", working.method, flow.httpMethods.map(method => [method, method]));
          content += valueField("URL", working.url, "url", workspace, [], "text");
          content += `<div data-http-site>${prop("请求站点", "origin", working.origin)}</div><div class="aw-http-permission"><span role="status" data-http-status></span><button type="button" data-http-authorize hidden>授权站点</button></div>`;
          content += valueField("请求头", working.headers, "headers", workspace, [], "object");
          if (flow.hasHttpBody(working.method)) content += valueField("请求体", working.body ?? flow.literal(""), "body", workspace, [], "any", true);
        } else if (dataDefinition) {
          if (key === "set") content += prop("变量类型", "valueType", working.valueType, Object.entries(variableTypes).filter(([id]) => id !== "result"));
          content += dataDefinition.fields.map(field => valueField(field.label, working[field.key], field.key, workspace,
            field.choices || [], key === "set" ? working.valueType : field.type, false, [], field.selectLiteralType)).join("");
        }
        if (["raise", "log"].includes(key)) content += valueField(key === "log" ? "日志内容" : "异常消息或异常变量", working.value, "value", workspace, [], "any", true);
        if (key === "wait") content += valueField("等待秒数", working.seconds, "seconds", workspace, [], "number");
        if (key === "script") {
          content += `
            <div class="aw-code-section">
              <div class="aw-code-toolbar">
                <span>JavaScript 代码</span>
                <button type="button" data-code-size>展开编辑器</button>
              </div>
              <div class="aw-code-editor"><div data-code><span class="aw-hint">正在加载编辑器…</span></div>
                <button type="button" class="aw-fx" data-variable-toggle data-script-reference aria-label="插入变量" title="插入变量" disabled>${icon("math-function")}</button>
              </div>
            </div>`;
        }
        if (key === "log") content += prop("日志级别", "level", working.level, Object.entries(model.NOTICE_TYPES));
        if (key === "comment") content += `<label>备注<textarea data-prop="text">${esc(working.text)}</textarea></label>`;
        if (key === "ai-call") {
          const services = view().serviceChoices(editor.registry, working.serviceId);
          const prompts = view().promptChoices(editor.plans, working.promptId);
          if (!working.promptId) prompts.unshift(["", prompts.length ? "请选择提示词模板" : "请先新建提示词", true]);
          content += `<div class="aw-grid">${prop("AI 服务", "serviceId", working.serviceId, services)}${prop("提示词模板", "promptId", working.promptId, prompts)}</div>`;
          const note = services.find(([id]) => id === working.serviceId)?.[3];
          if (note) content += `<span class="aw-note">${esc(note)}</span>`;
          promptParameters = null;
          try { content += promptInputs(); }
          catch (error) { promptError = error; }
        }
        if (key === "notify") {
          content += `<div class="aw-grid">${prop("级别", "level", working.level, Object.entries(model.NOTICE_TYPES))}${prop("投递方式", "delivery", working.delivery, [["center", "消息中心"], ["popup", "消息中心并弹出"]])}${prop("范围", "scope", working.scope, working.messageType === "interactive" ? [["account", "当前账号"]] : [["account", "当前账号"], ["device", "本机"]])}</div>` + valueField("消息正文", working.body, "body", workspace, [], "text", true);
          if (working.messageType === "interactive") content += `<div class="aw-section"><h4>操作按钮</h4>${working.buttons.map((item, index) => `<div class="aw-button-row">${prop("名称", `buttons.${index}.label`, item.label)}${prop("图标", `buttons.${index}.icon`, item.icon, [["view", "查看"], ["mute", "取消"], ["retry", "重试"], ["read", "完成"], ["upgrade", "继续"]])}${iconButton("button-delete", "删除按钮", "trash", `data-index="${index}"`)}</div>`).join("")}${button("button-add", "添加按钮", "", "plus")}</div><div class="aw-grid">${prop("消息超时", "_timeout", working._timeout, [["false", "不设置"], ["true", "设置超时"]])}${working._timeout === "true" ? prop("超时秒数", "_timeoutSeconds", working._timeoutSeconds, null, "number") : ""}</div>`;
        }
        if (dataDefinition || ["script", "notify", "ai-call"].includes(key)) output = outputField(http ? "保存响应至" : key === "ai-call" ? "保存回复至" : key === "set" ? "变量名" : "保存结果至", working.output, "output", workspace, working.action === "set" ? working.valueType : dataDefinition?.outputType || (key === "ai-call" ? "text" : "any"));
      }
      const advanced = http || ["script", "ai-call", "family-refresh"].includes(working.action);
      if (parameterTab === "advanced") {
        content = working.action === "script" ? prop("执行超时（秒）", "seconds", working.seconds, null, "number")
          : prop(http ? `请求超时（1–${flow.httpMaxTimeout} 秒）` : "请求超时（秒）", "requestTimeoutSeconds", working.requestTimeoutSeconds, null, "number");
        output = "";
        if (working.action === "ai-call") {
          content += valueField("传入对话历史", working.context, "context", workspace, [], "list");
          output = outputField("保存更新后的对话历史至", working.contextOutput, "contextOutput", workspace, "list");
        }
      } else if (parameterTab === "error") {
        content = flow.failable(working) ? prop("处理方式", "onError", working.onError, [["throw", "交给 Try/Catch，未捕获则结束失败"], ["continue", "保存失败结果并继续"]]) + outputField("执行结果保存至", working.errorOutput, "errorOutput", workspace, "result")
          : '<p class="aw-hint">异常交给流程中的 Try/Catch；未捕获时结束本次运行。</p>';
        output = "";
      }
      const paramTabs = [["general", "常规"], ...(advanced ? [["advanced", "高级"]] : []), ...(flow.failable(working) ? [["error", "错误处理"]] : [])];
      formHtml(container, `<div class="aw aw-form"><div class="aw-tabs aw-param-tabs" role="tablist" aria-label="指令参数">${paramTabs.map(([id, label]) => `<button type="button" role="tab" data-parameter-tab="${id}" aria-selected="${id === parameterTab}" tabindex="${id === parameterTab ? 0 : -1}">${label}</button>`).join("")}</div><div role="tabpanel" aria-label="${paramTabs.find(([id]) => id === parameterTab)?.[1]}">${content ? `<div class="aw-section">${parameterTab === "general" ? "<h4>指令输入</h4>" : ""}${content}</div>` : ""}${output ? `<div class="aw-section"><h4>指令输出</h4>${output}</div>` : ""}</div><div class="aw-test-result" data-test-result role="status" hidden></div><div class="aw-error" role="alert"></div></div>`);
      if (promptError) reportFailure(promptError, container.querySelector(".aw-error"));
      if (previewText) { const result = container.querySelector("[data-test-result]"); result.hidden = false; result.textContent = previewText; }
      if (http && parameterTab === "general") paintHttpSite();
      if (parameterTab === "general" && working.action === "script") {
        const target = container.querySelector("[data-code]");
        void import(root.chrome.runtime.getURL("settings/pages/workflow-code.js")).then(module => {
          if (lifetime.signal.aborted || epoch !== renderEpoch || !target.isConnected) return;
          target.textContent = "";
          const source = working.code.map(part => typeof part === "string" ? part : module.scriptReference(part, workspace)).join("");
          codeEditor = module.mount(target, { value: source, workflow: workspace, change: value => { working.code = [value]; if (previewId) void stopPreview().catch(error => reportFailure(error, container.querySelector(".aw-error"))); } });
          container.querySelector("[data-script-reference]").disabled = false;
        }).catch(error => reportFailure(error, container.querySelector(".aw-error")));
      }
    }
    function collectAll() {
      collect(container, working, workspace);
      if (working.action === "notify") {
        if (working.messageType === "notification") { delete working.buttons; delete working.timeout; }
        else {
          working.buttons ??= [{ id: flow.numericId("button-", []), label: "继续", icon: "view" }];
          working.timeout = working._timeout === "true" ? { seconds: Number(working._timeoutSeconds) } : null;
          working.scope = "account";
        }
      }
    }
    function comparableCondition(condition) {
      if (condition.children) return { ...condition, children: condition.children.map(comparableCondition) };
      const result = { ...condition, left: values.comparable(condition.left) };
      if (condition.right) result.right = values.comparable(condition.right);
      return result;
    }
    function draftSignature() {
      const { mapping, inputs, ...config } = working;
      delete config._timeout; delete config._timeoutSeconds;
      for (const [key, value] of flow.inputs(working)) {
        if (!key.startsWith("inputs.")) config[key] = values.comparable(value);
      }
      if (mapping) {
        config.inputs = Object.fromEntries(mapping.filter(item => !promptParameters || promptParameters.includes(item.key))
          .map(({ key, value }) => [key, values.comparable(value)])
          .filter(([, value]) => JSON.stringify(value) !== emptyInput));
      } else if (inputs) config.inputs = Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, values.comparable(value)]));
      if (working.condition) config.condition = comparableCondition(working.condition);
      if (working.kind === "if") config.branches = working.branches.map(branch => ({ ...branch, condition: comparableCondition(branch.condition) }));
      const outputNames = Object.entries(values.outputEntries(container, workspace)).flatMap(([slot, entry]) => {
        const original = workspace.variables.find(item => item.id === entry.id)?.name || entry.id || "";
        const name = entry.name.trim();
        return name === original ? [] : [[slot, name]];
      }).sort(([left], [right]) => left.localeCompare(right));
      return JSON.stringify([config, workspace.variables, outputNames]);
    }
    function hasUnsavedChanges() {
      try { collectAll(); }
      catch (error) {
        if (error.code === "WORKFLOW_FORM_INVALID_NUMBER") return true;
        throw error;
      }
      return draftSignature() !== initial;
    }
    async function prepared(named = null) {
      collectAll();
      const clean = named?.clean || flow.clone(workspace), target = flow.pathGet(clean, row.path);
      root.STWorkflowValues.commitOutputs(container, target, clean, workspace, named?.resolved || {});
      if (editor.originalVariableIds) for (const [path, entry] of Object.entries(root.STWorkflowValues.outputEntries(container, workspace))) {
        const variable = clean.variables.find(item => item.id === get(target, path));
        if (variable && !editor.originalVariableIds.has(variable.id)) variable.type = entry.type;
      }
      if (target.action === "ai-call") {
        target.inputs = Object.fromEntries(promptMapping(target).map(item => [item.key, item.value]));
        if (JSON.stringify(values.comparable(target.context)) === emptyInput) delete target.context;
        if (!target.contextOutput) delete target.contextOutput;
      }
      if (http) {
        target.origin = requestSite(target);
        if (!flow.hasHttpBody(target.method)) delete target.body;
      }
      delete target.mapping; delete target._timeout; delete target._timeoutSeconds;
      if (target.onError === "throw") delete target.onError;
      await root.STWorkflowValues.compile(target, clean);
      if (target.action === "script") {
        const module = await import(root.chrome.runtime.getURL("settings/pages/workflow-code.js"));
        const source = target.code.map(part => typeof part === "string" ? part : module.scriptReference(part, clean)).join("");
        target.code = module.scriptParts(source, clean);
      }
      if (editor.originalVariableIds) { const used = JSON.stringify(clean.steps); clean.variables = clean.variables.filter(item => editor.originalVariableIds.has(item.id) || used.includes('"' + item.id + '"')); }
      const loopDepth = editor.rows.filter(parent => !parent.marker && flow.loops.has(parent.node.kind) && parent.path.length < row.path.length && parent.path.every((key, index) => key === row.path[index])).length;
      flow.validate(clean, { target, loopDepth });
      return { clean, target };
    }
    function showPreview(text) {
      previewText = text;
      const result = container.querySelector("[data-test-result]");
      if (result) { result.hidden = false; result.textContent = text; }
      const button = container.closest("dialog")?.querySelector('[data-dialog-action="test"]');
      if (button) button.textContent = previewId ? "停止试运行" : testLabel;
    }
    async function stopPreview() {
      const id = previewId; if (!id) return;
      previewId = null; showPreview("试运行已停止");
      await view().rpc("cancel-instruction-test", { id });
    }
    async function runPreview() {
      if (previewId) return stopPreview();
      if (preparingPreview) return;
      let clean, trial, samples;
      preparingPreview = true;
      try {
        const permission = flow.instructionPermission(working.action);
        if (permission) {
          const membership = await state.ctx.storage.getMembership();
          if (lifetime.signal.aborted) return;
          if (!root.STSettingsMembership.permission(permission, membership)) {
            showPreview(flow.permissionDenial(permission, membership));
            return;
          }
        }
        if (working.action === "ai-call") { collectAll(); if (!validatePromptInputs()) return; }
        const preparedFlow = await prepared();
        clean = preparedFlow.clean;
        const target = preparedFlow.target;
        trial = target.kind === "if" ? { ...target, branches: [{ condition: target.branches[branch].condition, steps: [] }], otherwise: null } : target;
        samples = await testValues(state, clean, trial);
        if (samples && http) {
          const answer = await state.ctx.dialog(state.shadow, { title: "发送测试请求", className: "aw-automation-dialog",
            message: `${trial.method} ${trial.origin}\n本次操作会向该站点发送真实请求。`,
            actions: [{ id: "cancel", label: "取消" }, { id: "send", label: "发送请求", primary: true }],
          });
          if (answer !== "send") samples = null;
        }
      } finally { preparingPreview = false; }
      if (!samples || lifetime.signal.aborted) return;
      const id = root.crypto.randomUUID(); previewId = id; showPreview("正在运行…");
      try {
        const result = await view().rpc("test-instruction", { id, workflow: { ...clean, steps: [trial] }, ...samples });
        if (previewId !== id || lifetime.signal.aborted) return;
        previewId = null;
        if (result.cancelled) { showPreview("试运行已停止"); return; }
        if (http && result.failures.some(failure => failure.code === "WORKFLOW_HTTP_PERMISSION_REQUIRED")) {
          permissions.delete(trial.origin); paintHttpSite();
        }
        const status = result.failures.length ? "失败，已按配置继续" : trial.action === "ai-call" ? "请求预览 · 未发送" : "运行完成";
        showPreview(`${status} · ${Math.round(result.milliseconds)} ms\n${JSON.stringify(result.failures.length ? result.failures : result.value, null, 2)}`);
      } catch (error) {
        if (previewId !== id || lifetime.signal.aborted) return;
        previewId = null;
        if (http) { permissions.delete(trial.origin); paintHttpSite(); }
        showPreview("运行失败\n" + error.message);
      }
    }
    const instructionKey = instructions.key({ ...row, node: working });
    const permission = flow.instructionPermission(instructionKey);
    const titleBadge = permission ? document.createElement("span") : null;
    const hint = instructions.hints[instructionKey];
    let subtitle = hint;
    if (titleBadge) {
      titleBadge.className = "aw-name-badge";
      titleBadge.textContent = permissionLabel;
      titleBadge.setAttribute("aria-hidden", "true");
      const note = document.createElement("span");
      note.className = "aw-donation-info";
      note.textContent = flow.permissionNotice(permission);
      subtitle = document.createDocumentFragment();
      subtitle.append(hint + "。", note);
      if (permission === "customNames") {
        const link = document.createElement("a");
        link.className = "aw-donation-link";
        link.textContent = "我要赞助开发者";
        root.STConfig.externalNavigation.applyToLink(link, "https://www.sucaijun.com/donate");
        subtitle.append(link);
      }
    }
    const testLabel = working.action === "ai-call" ? "预览请求" : "运行指令";
    try { return await state.ctx.dialog(state.shadow, { title: flow.names[instructionKey], titleBadge, subtitle, icon: instructions.iconUrl(instructionKey), iconClass: instructions.iconTone(instructionKey), className: "aw-param-dialog", form: true,
      isDirty: hasUnsavedChanges,
      render: node => {
        container = node; render(); initial = draftSignature();
        root.STWorkflowValues.bind(node, working, workspace, { dialog: state.ctx.dialog, shadow: state.shadow, render, scriptEditor: () => codeEditor, signal: lifetime.signal });
        node.addEventListener("input", () => {
          if (http) paintHttpSite();
          if (working.action === "ai-call") {
            const invalid = node.querySelector('[aria-invalid="true"]');
            if (invalid) {
              invalid.removeAttribute("aria-invalid");
              node.querySelector(".aw-error").textContent = "";
            }
          }
          if (previewId) void stopPreview().catch(error => reportFailure(error, node.querySelector(".aw-error")));
        }, { signal: lifetime.signal });
        node.addEventListener("keydown", event => {
          const tab = event.target.closest("[data-parameter-tab]");
          if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault(); const tabs = [...node.querySelectorAll("[data-parameter-tab]")], index = tabs.indexOf(tab);
          const next = tabs[event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length]; next.click();
          node.querySelector(`[data-parameter-tab="${parameterTab}"]`).focus();
        }, { signal: lifetime.signal });
        node.addEventListener("change", event => {
          try {
            if (previewId) void stopPreview().catch(error => reportFailure(error, node.querySelector(".aw-error")));
            collectAll();
            if (http && event.target.matches('[data-prop="method"]')) { render(); return; }
            if (http) paintHttpSite();
            if (event.target.matches('[data-prop="valueType"]') && Object.hasOwn(flow.activeValue(working.value), "literal")) {
              const type = working.valueType, old = flow.activeValue(working.value).literal;
              if (type !== "any" && !(type === "text" && typeof old === "string" || type === "number" && typeof old === "number" || type === "boolean" && typeof old === "boolean" || type === "list" && Array.isArray(old) || type === "object" && old && typeof old === "object" && !Array.isArray(old))) {
                const value = flow.literal(({ text: "", number: 0, boolean: false, list: [], object: {} })[type]);
                if (working.value.mode) working.value[working.value.mode === "text" ? "text" : "code"] = value;
                else working.value = value;
              }
              render(); return;
            }
            if (working.action === "ai-call" && ["serviceId", "promptId"].includes(event.target.dataset.prop)) {
              const field = event.target.dataset.prop;
              render();
              node.querySelector('[data-prop="' + field + '"]')?.focus({ preventScroll: true });
              return;
            }
            if (event.target.matches('[data-prop="onError"]')) { render(); return; }
            if (event.target.matches('[data-prop="_timeout"],[data-prop$=".op"]') || event.target.closest('[data-value$=".left"]')) render();
          } catch (error) { reportFailure(error, node.querySelector(".aw-error")); }
        });
        node.addEventListener("click", event => {
          const tab = event.target.closest("[data-parameter-tab]");
          if (tab) {
            try {
              if (parameterTab !== tab.dataset.parameterTab) {
                collectAll(); parameterTab = tab.dataset.parameterTab; render();
                node.querySelector(`[data-parameter-tab="${parameterTab}"]`).focus({ preventScroll: true });
              }
            } catch (error) { reportFailure(error, node.querySelector(".aw-error")); }
            return;
          }
          if (event.target.closest("[data-http-authorize]")) {
            const origin = requestSite({ url: working.url, origin: node.querySelector('[data-prop="origin"]').value });
            void authorizeHttpSite(origin).catch(error => { if (!lifetime.signal.aborted) reportFailure(error, node.querySelector(".aw-error")); });
            return;
          }
          if (event.target.closest("[data-code-size]")) { container.closest(".aw-param-dialog").classList.toggle("aw-code-expanded"); return; }
          const control = event.target.closest("[data-aw]"); if (!control) return;
          event.stopPropagation();
          void (async () => {
            collectAll(); const action = control.dataset.aw;
            if (action === "variable-new") { const id = await editVariable(state, workspace); if (id) set(working, control.dataset.target, id); }
            else if (action === "condition-add") get(working, control.dataset.path).children.push(flow.comparison());
            else if (action === "condition-delete") { const path = control.dataset.path.split("."), index = Number(path.pop()); flow.pathGet(working, path).splice(index, 1); }
            else if (action === "button-add") working.buttons.push({ id: flow.numericId("button-", working.buttons), label: "", icon: "view" });
            else if (action === "button-delete") {
              const answer = await confirm(state, "删除交互按钮", "将删除这个按钮，保留流程中的判断分支。请同时检查引用该按钮的条件。");
              if (answer) working.buttons.splice(Number(control.dataset.index), 1);
            }
            else if (action === "catch-toggle" || action === "finally-toggle") {
              const key = action === "catch-toggle" ? "catch" : "finally";
              if (working[key] === null) working[key] = [];
              else if (await confirm(state, "删除 " + key, "将删除该分支及其全部步骤。")) working[key] = null;
            }
            render();
          })().catch(error => reportFailure(error, node.querySelector(".aw-error")));
        });
      }, actions: [...(flow.previewable(working) ? [{ id: "test", label: testLabel }] : []), { id: "cancel", label: "取消" }, { id: "save", label: "确定", primary: true }],
      onAction: async (action, node) => {
        if (action === "test") { void runPreview().catch(error => reportFailure(error, node.querySelector(".aw-error"))); return false; }
        if (action !== "save") return true;
        try {
          collectAll();
          if (working.action === "ai-call" && !validatePromptInputs()) return false;
          const current = working.action === "ai-call" ? { ...working, mapping: promptMapping(working) } : working;
          await root.STWorkflowValues.compile(current, workspace);
          const named = await resolveOutputNames(state, container, workspace, working); if (!named) return false;
          const { clean } = await prepared(named); snapshot(editor); Object.assign(editor.draft, clean); return true;
        }
        catch (error) { reportFailure(error, node.querySelector(".aw-error")); return false; }
      },
    }); } finally { lifetime.abort(); root.clearTimeout(permissionTimer); codeEditor?.destroy(); await stopPreview(); }
  }
  const triggerFieldName = field => root.STWorkflowFields.labels[field] || root.STWorkflowFields.task[field] || field;
  const gameEvent = type => Object.hasOwn(gameEvents, type);
  const triggerMode = type => gameEvent(type) ? "automatic" : type;

  function triggerConditionFields(type) {
    if (type === "schedule") return ["logged_in", "has_family"];
    return [...Object.keys(root.STWorkflowFields.labels), "target_name", "achievement_language", "untranslated_count", "achievement_count"];
  }

  function triggerEventFields(type) {
    const common = [[["id"], "事件 ID"], [["type"], "事件类型"]];
    if (gameEvent(type)) return [
      ...common, [["game"], "本次游戏"], [["game", "official"], "Steam 原名"], [["game", "appid"], "AppID"], [["appid"], "事件 AppID"],
      ...(type === "installed" ? [[["phase"], "安装阶段"]] : []),
    ];
    if (type === "schedule") return [...common, [["scheduledAt"], "计划时间"], [["at"], "实际触发时间"], [["unconfirmed"], "账号未确认"]];
    return [];
  }

  const filterLeaves = condition => condition.children || [condition];
  const nestedFilter = condition => filterLeaves(condition).some(child => child.children);
  const filterWithoutValue = op => ["empty", "notEmpty", "unknown"].includes(op);
  const filterChoices = (field, op) => ["equals", "notEquals", "contains", "notContains"].includes(op)
    ? root.STWorkflowFields.filterChoices[field] || [] : [];
  const setCompare = ({ field, op }) => root.STWorkflowFields.kind(field) === "set" && ["equals", "notEquals"].includes(op);
  const terms = value => String(value ?? "").split(/[,，]/).map(term => term.trim()).filter(Boolean);

  function filterValueLabel(condition) {
    const choices = filterChoices(condition.field, condition.op);
    const labels = new Map(choices);
    const label = value => labels.get(String(value)) || value;
    if (setCompare(condition)) return (condition.values?.length ? condition.values : terms(condition.value)).map(label).join("，");
    return label(condition.value ?? "");
  }

  function filterBoolean({ value, values, op }) {
    const operand = values?.length ? values[0] : value;
    return op === "equals" ? operand === true : operand !== true;
  }

  function filterSummary(condition) {
    if (condition.children) return (condition.op === "all" ? "全部满足" : "任一满足") +
      "（" + condition.children.map(filterSummary).join("，") + "）";
    const name = triggerFieldName(condition.field);
    if (root.STWorkflowFields.kind(condition.field) === "boolean") return name + (filterBoolean(condition) ? " · 为真" : " · 为假");
    let target = "";
    if (!filterWithoutValue(condition.op)) {
      if (condition.preset) target = model.RANGES.find(([id]) => id === condition.preset)?.[1] || condition.preset;
      else if (condition.op === "between") target = condition.min + "–" + condition.max;
      else target = filterValueLabel(condition);
    }
    return [name, model.OPS[condition.op], target].filter(item => item !== "").join(" · ");
  }

  async function editTriggerFilter(state, type, original, replaced = null) {
    const { searchComboHtml, handleSearchCombo } = root.STSettingsFields;
    const comboLife = new AbortController();
    const fields = triggerConditionFields(type);
    if (original && !fields.includes(original.field)) fields.unshift(original.field);
    const start = field => ({ field, op: model.operators(field)[0], value: root.STWorkflowFields.kind(field) === "boolean" ? true : "" });
    let current = original ? flow.clone(original) : start(fields[0]);
    current.value = filterValueLabel(current);
    let container, result;
    const read = node => {
      for (const control of node.querySelectorAll("[data-prop]")) current[control.dataset.prop] = control.value;
      const comparison = node.querySelector("#aw-filter-value");
      if (comparison) current.value = comparison.value;
    };
    function render() {
      const { field, op } = current, kind = root.STWorkflowFields.kind(field), choices = filterChoices(field, op);
      let value = "";
      if (!filterWithoutValue(op) && kind !== "boolean") {
        if (kind === "date") value = prop("比较值", "preset", current.preset || "24h", model.RANGES.filter(([id]) => field === "date_release" || !id.startsWith("next")));
        else if (op === "between") value = prop("最小值", "min", current.min, null, "number") + prop("最大值", "max", current.max, null, "number");
        else if (choices.length) {
          const combo = searchComboHtml(choices.map(([value, label]) => ({ value, label })), {
            id: "aw-filter-value", label: "比较值", text: current.value,
            value: choices.find(([, label]) => label === current.value)?.[0],
            placeholder: "输入或搜索", expandLabel: "展开比较值列表", emptyLabel: "没有匹配项", modal: true,
          });
          value = `<div class="aw-trigger-row"><label for="aw-filter-value">比较值</label>${combo}</div>`;
        }
        else value = prop("比较值", "value", current.value, null, kind === "number" ? "number" : "text");
      }
      formHtml(container, `<div class="aw aw-trigger-form aw-trigger-child">
        ${replaced ? `<div class="aw-note">当前筛选 · ${esc(filterSummary(replaced))}</div>` : ""}
        <div class="aw-grid">${prop("筛选字段", "field", field, fields.map(id => [id, triggerFieldName(id)]))}
        ${kind === "boolean" ? `<label>关系<select data-filter-boolean>${options([["true", "为真"], ["false", "为假"]], filterBoolean(current))}</select></label>`
          : prop("关系", "op", op, model.operators(field).map(id => [id, model.OPS[id]]))}
        ${value}</div><div class="aw-error" role="alert"></div></div>`);
    }
    const answer = await state.ctx.dialog(state.shadow, {
      title: replaced ? "替换筛选" : original ? "编辑筛选" : "添加筛选",
      className: "aw-param-dialog", form: true,
      initial: node => node.querySelector('[data-prop="field"]'),
      render(node) {
        container = node; render();
        const handleCombo = event => handleSearchCombo(event, node);
        for (const name of ["click", "input", "keydown", "focusout", "scroll"]) node.addEventListener(name, handleCombo);
        node.ownerDocument.defaultView.addEventListener("resize", handleCombo, { signal: comboLife.signal });
        node.addEventListener("change", event => {
          const control = event.target;
          if (control.dataset.prop === "field") { current = start(control.value); render(); }
          else if (control.dataset.prop === "op") { read(node); render(); }
        });
      },
      actions: [{ id: "cancel", label: "取消" }, { id: "save", label: replaced ? "替换" : "确定", primary: true }],
      onAction(action, node) {
        if (action !== "save") return true;
        read(node);
        const { field, op, value } = current, kind = root.STWorkflowFields.kind(field);
        const choices = filterChoices(field, op);
        const canonical = text => choices.find(([, label]) => label === text)?.[0] || text;
        result = { field, op };
        try {
          if (kind === "boolean") result = { field, op: "equals", value: node.querySelector("[data-filter-boolean]").value === "true" };
          else if (!filterWithoutValue(op)) {
            if (kind === "date") result.preset = current.preset;
            else if (kind === "number") {
              const read = key => node.querySelector('[data-prop="' + key + '"]').valueAsNumber;
              if (op === "between") { result.min = read("min"); result.max = read("max"); }
              else result.value = read("value");
            } else if (setCompare(result)) result.values = terms(value).map(canonical);
            else result.value = canonical(value?.trim() || "");
          }
          if (!triggerConditionFields(type).includes(result.field)) throw new TypeError("该字段不适用于当前触发方式");
          model.validateCondition(result);
          return true;
        } catch (error) {
          if (!(error instanceof TypeError)) throw error;
          node.querySelector(".aw-error").textContent = error.message;
          return false;
        }
      },
    }).finally(() => comboLife.abort());
    return answer === "save" ? result : null;
  }

  function checkTriggerInput(item, type, keys, savedManual = false) {
    const { key, value } = item;
    if (!key || ["__proto__", "constructor", "prototype"].includes(key)) return "请填写有效的工作流输入名。";
    const fields = triggerEventFields(type);
    for (const ref of flow.references(value)) {
      const available = type === "manual"
        ? savedManual && (!ref.path.length || keys.has(ref.path[0]))
        : !ref.path.length || fields.some(([path]) => path.length === ref.path.length && path.every((name, index) => name === ref.path[index]));
      if (ref.source !== "input" || !available)
        return `输入「${key}」的来源「本次事件.${ref.path.join(".")}」在当前触发方式中不可用。`;
    }
    return "";
  }

  async function editTriggerInput(state, trigger, index) {
    const original = trigger.mapping[index], item = original ? flow.clone(original) : { key: "", value: flow.literal("") };
    const fields = triggerEventFields(trigger.event.type);
    const workspace = { variables: [], triggerInput: true, compactTypes: true, eventFields: fields };
    const workflow = state.bundle.workflows.find(row => row.id === trigger.workflowId);
    const names = workflow ? root.STWorkflowValues.inputNames(workflow) : [];
    const otherKeys = new Set(trigger.mapping.filter((_, row) => row !== index).map(entry => entry.key));
    const lifetime = new AbortController();
    let container;
    function render() {
      formHtml(container, `<div class="aw aw-trigger-form aw-trigger-child"><div class="aw-grid">
        <label>工作流输入名<input data-prop="key" value="${esc(item.key)}"${names.length ? ' list="aw-trigger-input-names"' : ""}></label>
        ${names.length ? `<datalist id="aw-trigger-input-names">${names.map(name => `<option value="${esc(name)}"></option>`).join("")}</datalist>` : ""}
        ${valueField("传入的数据", item.value, "value", workspace)}
        </div><div class="aw-error" role="alert"></div></div>`);
    }
    const answer = await state.ctx.dialog(state.shadow, {
      title: original ? "编辑输入" : "添加输入", className: "aw-param-dialog", form: true,
      initial: node => node.querySelector('[data-prop="key"]'),
      render(node) {
        container = node; render();
        root.STWorkflowValues.bind(node, item, workspace, { dialog: state.ctx.dialog, shadow: state.shadow, render, signal: lifetime.signal });
      },
      actions: [{ id: "cancel", label: "取消" }, { id: "save", label: "确定", primary: true }],
      onAction(action, node) {
        if (action !== "save") return true;
        try {
          collect(node, item, workspace); item.key = item.key.trim();
          const error = otherKeys.has(item.key) ? "工作流输入名已存在。" :
            checkTriggerInput(item, trigger.event.type, new Set([...otherKeys, item.key]), !!original);
          if (error) { node.querySelector(".aw-error").textContent = error; return false; }
          flow.validateValue(item.value, new Set(), false);
          return true;
        } catch (error) { reportFailure(error, node.querySelector(".aw-error")); return false; }
      },
    }).finally(() => lifetime.abort());
    return answer === "save" ? item : null;
  }
  function localDateTime(at) {
    const value = new Date(at), pad = n => String(n).padStart(2, "0");
    return calendar.dateKey(value) + "T" + pad(value.getHours()) + ":" + pad(value.getMinutes());
  }
  function scheduleInput(label, path, value, type, attributes = "") {
    return `<label class="aw-trigger-row">${label}<input data-schedule-value="${path}" type="${type}" value="${esc(value ?? "")}" ${attributes}></label>`;
  }
  function triggerCheck(label, name, checked) {
    return `<label class="aw-trigger-check"><input type="checkbox" ${name}${checked ? " checked" : ""}>${label}</label>`;
  }
  const scheduleLimitsAvailable = ({ timing }) => timing.mode === "minute" || timing.mode === "hour";
  function scheduleForm(event) {
    const { timing } = event;
    const radios = frequencies.map(([id, label]) => `<label><input type="radio" name="trigger-frequency" value="${id}" data-trigger-frequency${timing.mode === id ? " checked" : ""}>${label}</label>`).join("");
    let fields = "";
    if (timing.mode === "minute") fields = scheduleInput("间隔分钟", "timing.every", timing.every, "number", 'min="1" step="1"');
    else if (timing.mode === "hour") fields = scheduleInput("每小时第几分", "timing.minute", timing.minute, "number", 'min="0" max="59" step="1"');
    else if (timing.mode === "cron") fields = scheduleInput("时间表达式", "timing.expression", timing.expression, "text",
      'placeholder="0 9 * * 1-5" spellcheck="false" aria-describedby="st-trigger-cron-format"') +
      '<p class="aw-note" id="st-trigger-cron-format">分、时、日、月、星期</p>';
    else {
      if (timing.mode === "week") fields += `<fieldset class="aw-trigger-options"><legend>星期</legend>
        ${weekdays.map(([id, label]) => triggerCheck(label, `data-trigger-weekday value="${id}"`, timing.weekdays.includes(id))).join("")}</fieldset>`;
      if (timing.mode === "month") fields += scheduleInput("日期", "timing.day", timing.day, "number", 'min="1" max="31" step="1"');
      fields += scheduleInput("时间", "timing.time", timing.time, "time");
    }
    return `<fieldset class="aw-trigger-options"><legend>执行频率</legend>${radios}</fieldset>${fields}
      <div class="aw-trigger-row"><span>下次触发</span><output class="aw-trigger-preview" data-trigger-preview></output></div>
      ${triggerCheck("定时结束", 'data-schedule-toggle="endLocal"', event.endLocal !== undefined)}
      ${event.endLocal !== undefined ? scheduleInput("结束时间", "endLocal", event.endLocal, "datetime-local") : ""}`;
  }
  function scheduleSettings(event) {
    return `<div class="aw-trigger-setting">
      ${triggerCheck("每天起止时间", 'data-schedule-toggle="window"', !!event.window)}
      ${event.window ? `<div class="aw-trigger-fields">
        ${scheduleInput("开始时间", "window.start", event.window.start, "time")}
        ${scheduleInput("结束时间", "window.end", event.window.end, "time")}</div>` : ""}
      ${triggerCheck("按指定日历触发", 'data-schedule-toggle="dates"', !!event.dates)}
      ${event.dates ? `<div class="aw-trigger-dates">
        <input type="date" aria-label="选择日历日期" data-trigger-date>
        ${button("trigger-date-add", "添加日期")}
        ${event.dates.map((date, index) => button("trigger-date-delete", date, `data-index="${index}" aria-label="移除 ${esc(date)}"`, "x")).join("")}
      </div>` : ""}
    </div>`;
  }
  function scheduleEvent(event) {
    const { endLocal, ...value } = event;
    if (!scheduleLimitsAvailable(event)) {
      delete value.window;
      delete value.dates;
    }
    if (endLocal !== undefined) value.endsAt = calendar.endTime(endLocal);
    return value;
  }
  function validateSchedule(event, enabled, now = Date.now()) {
    const plan = calendar.compile(event);
    if (enabled && calendar.next(plan, now) === null)
      throw new TypeError("当前设置没有可执行时间，请调整日程或定时结束时间");
  }
  function scheduleLabel(event) {
    if (event.endsAt !== undefined && event.endsAt <= Date.now()) return "已结束";
    const { timing } = event;
    if (timing.mode === "minute") return "每隔 " + timing.every + " 分钟";
    if (timing.mode === "hour") return "每小时 " + String(timing.minute).padStart(2, "0") + " 分";
    if (timing.mode === "day") return "每天 " + timing.time;
    if (timing.mode === "week") return weekdays.filter(([id]) => timing.weekdays.includes(id)).map(([, label]) => label).join("、") + " " + timing.time;
    if (timing.mode === "month") return "每月 " + timing.day + " 日 " + timing.time;
    const workday = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+1-5$/.exec(timing.expression.trim());
    return workday ? "周一至周五 " + workday[2].padStart(2, "0") + ":" + workday[1].padStart(2, "0") : "高级日程";
  }
  function needsGame(workflow) {
    // 首条无条件读取决定是否必须绑定游戏，其余读取仍由流程分支决定。
    const first = workflow.steps.find(node => !node.disabled && node.action !== "comment");
    return first?.action === "receive" && [...flow.references(first.value)].some(ref => ref.source === "input" && ref.path[0] === "game");
  }

  async function editTrigger(state, original = null) {
    const clock = original?.enabled && original.event.type === "schedule" && original.event.timing.mode === "minute"
      ? await view().rpc("schedule-clock", { triggerId: original.id, revision: original.revision }) : null;
    const draft = original ? flow.clone(original) : model.newTrigger(flow.numericId("trigger-", state.bundle.triggers));
    if (!original) draft.enabled = true;
    draft.mapping = Object.entries(draft.inputs).map(([key, value]) => ({ key, value }));
    if (draft.event.type === "schedule" && draft.event.endsAt !== undefined) {
      draft.event.endLocal = localDateTime(draft.event.endsAt);
      delete draft.event.endsAt;
    }
    const eventDrafts = new Map(), timingDrafts = new Map(), hiddenScheduleOptions = new Map();
    const workflowChoices = state.bundle.workflows.map(item => [item.id, item.name]);
    let container, enabled, saveButton, initial, editingChild = false;
    let lastGameEvent = gameEvent(draft.event.type) ? draft.event.type : "added";

    function updateSave() {
      if (!saveButton) return;
      const name = container.querySelector('[data-prop="name"]').value.trim();
      const id = container.querySelector('[data-prop="workflowId"]').value;
      saveButton.disabled = !name || !workflowChoices.some(([key]) => key === id);
    }

    function showError(message, advanced = false) {
      if (advanced) container.querySelector(".aw-trigger-more").open = true;
      const target = container.querySelector(".aw-error");
      target.textContent = message;
      target.scrollIntoView({ block: "nearest" });
    }

    function readSchedule() {
      for (const input of container.querySelectorAll("[data-schedule-value]"))
        set(draft.event, input.dataset.scheduleValue, input.type === "number" ? (Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : null) : input.value);
      if (draft.event.timing.mode === "week")
        draft.event.timing.weekdays = [...container.querySelectorAll("[data-trigger-weekday]:checked")].map(input => Number(input.value));
    }

    function readDraft() {
      collect(container, draft, {});
      draft.enabled = enabled?.checked ?? draft.enabled;
      draft.busy = container.querySelector("[data-trigger-queue]").checked ? "queue" : "ignore";
      const limit = container.querySelector("[data-trigger-limit]").valueAsNumber;
      if (!Number.isSafeInteger(limit) || limit < 0 || !Number.isSafeInteger(limit * calendar.MINUTE + Date.now()))
        throw Object.assign(new Error("请输入有效的运行时限分钟数"), { code: "WORKFLOW_FORM_INVALID_NUMBER" });
      if (limit > 0) draft.maxRunMinutes = limit;
      else delete draft.maxRunMinutes;
      if (draft.event.type === "installed") draft.event.phase = container.querySelector("[data-trigger-phase]:checked").value;
      if (draft.event.type === "schedule") readSchedule();
    }

    function signature() {
      return JSON.stringify({ ...draft, name: draft.name.trim(), mapping: draft.mapping.map(({ key, value }) =>
        ({ key, value: root.STWorkflowValues.comparable(value) })) });
    }

    function isDirty() {
      try { readDraft(); return signature() !== initial; }
      catch (error) { if (error.code === "WORKFLOW_FORM_INVALID_NUMBER") return true; throw error; }
    }

    function previewSchedule() {
      const output = container.querySelector("[data-trigger-preview]");
      if (!output) return;
      readSchedule();
      try {
        const event = scheduleEvent(draft.event), now = Date.now();
        const fromSaved = clock && (initial === undefined || !isDirty());
        const next = calendar.next(calendar.compile(event), now, fromSaved ? clock.anchorAt : now);
        output.value = next === null ? (event.endsAt <= now ? "已结束" : "当前设置没有可执行时间")
          : new Date(next).toLocaleString("zh-CN", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
        if (next !== null && event.timing.mode === "cron") output.value += " · " + scheduleLabel(event);
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        output.value = error.message;
      }
    }

    function switchEvent(type) {
      if (type === draft.event.type) return;
      const saved = { event: draft.event, conditions: draft.conditions, mapping: draft.mapping };
      eventDrafts.set(draft.event.type, saved);
      let next = eventDrafts.get(type);
      if (!next) {
        const event = { type };
        if (type === "installed") event.phase = "completed";
        if (type === "schedule") event.timing = flow.clone(scheduleDefaults.minute);
        const peer = gameEvent(type) ? eventDrafts.get(type === "added" ? "installed" : "added") : null;
        const mapping = peer ? flow.clone(peer.mapping) : gameEvent(type) ? [{ key: "game", value: flow.reference("input", "", ["game"]) }] : [];
        next = { event, conditions: peer ? flow.clone(peer.conditions) : model.group(), mapping };
      }
      Object.assign(draft, next);
      if (gameEvent(type)) lastGameEvent = type;
    }

    function filterSection() {
      const nested = nestedFilter(draft.conditions), items = filterLeaves(draft.conditions);
      const filters = nested
        ? `<div class="aw-trigger-summary"><span>${esc(filterSummary(draft.conditions))}</span>${iconButton("conditions-clear", "移除筛选", "trash")}</div>`
        : items.map((item, index) => {
          const summary = filterSummary(item), attrs = `data-index="${index}"`;
          return `<div class="aw-trigger-summary">${button("condition-edit", summary, `class="aw-trigger-summary-edit" ${attrs} aria-label="编辑筛选 ${esc(summary)}"`)}
            ${iconButton("condition-delete", "移除筛选 " + summary, "trash", attrs)}</div>`;
        }).join("");
      return `<section class="aw-section"><div class="aw-trigger-summary"><h4>筛选条件</h4>
        ${nested ? button("condition-replace", "替换筛选") : button("condition-add", "添加筛选", "", "plus")}</div>
        ${!nested && items.length > 1 ? `<div class="aw-grid">${prop("匹配方式", "conditions.op", draft.conditions.op, [["all", "全部满足"], ["any", "任一满足"]])}</div>` : ""}
        ${filters ? `<div class="aw-trigger-list">${filters}</div>` : ""}</section>`;
    }

    function inputSection() {
      const workspace = { variables: [], triggerInput: true, eventFields: triggerEventFields(draft.event.type) };
      const keys = new Set(draft.mapping.map(item => item.key));
      const rows = draft.mapping.map((item, index) => {
        const unavailable = checkTriggerInput(item, draft.event.type, keys, original?.event.type === "manual");
        const label = item.key === "game" ? "游戏（game）" : item.key;
        const summary = label + " ← " + valueText(item.value, workspace) + (unavailable ? "（来源需调整）" : "");
        const attrs = `data-index="${index}"`;
        return `<div class="aw-trigger-summary">${button("mapping-edit", summary, `class="aw-trigger-summary-edit" ${attrs} aria-label="编辑输入 ${esc(label)}"`)}
          ${iconButton("mapping-delete", "移除输入 " + label, "trash", attrs)}</div>`;
      }).join("");
      return `<section class="aw-section"><div class="aw-trigger-summary"><h4>传入工作流</h4>${button("mapping-add", "添加输入", "", "plus")}</div>
        ${rows ? `<div class="aw-trigger-list">${rows}</div>` : ""}</section>`;
    }

    function render() {
      const { event } = draft, mode = triggerMode(event.type), moreOpen = container.querySelector(".aw-trigger-more")?.open;
      const choices = [["", workflowChoices.length ? "请选择工作流" : "请先新建工作流", true], ...workflowChoices];
      if (draft.workflowId && !workflowChoices.some(([key]) => key === draft.workflowId)) choices.splice(1, 0, [draft.workflowId, "已删除：" + draft.workflowId]);
      const radios = (name, legend, entries, selected) => `<fieldset class="aw-trigger-options"><legend>${legend}</legend>
        ${entries.map(([id, label]) => `<label><input type="radio" name="${name}" data-${name} value="${id}"${selected === id ? " checked" : ""}>${label}</label>`).join("")}</fieldset>`;
      const game = mode === "automatic" ? `<label>什么情况下触发<select data-trigger-event>${options(Object.entries(gameEvents), event.type)}</select></label>` : "";
      const stages = event.type === "installed" ? radios("trigger-phase", "安装阶段", installStages, event.phase) : "";
      const local = event.type === "schedule" ? scheduleForm(event) : "";
      const interval = event.type === "schedule" && scheduleLimitsAvailable(event) ? scheduleSettings(event) : "";
      formHtml(container, `<div class="aw aw-trigger-form"><div class="aw-grid">
        ${prop("触发器名称", "name", draft.name)}
        ${prop("工作流名称", "workflowId", draft.workflowId, choices)}
        ${radios("trigger-mode", "触发方式", Object.entries(triggerModes), mode)}${game}${stages}${local}</div>
        <div class="aw-error" role="alert"></div>
        ${mode === "automatic" ? filterSection() : ""}${inputSection()}
        <details class="aw-trigger-more"${moreOpen ? " open" : ""}><summary>${icon("chevron-right", "aw-disclosure")}更多设置</summary>
          ${interval ? `<div class="aw-section">${interval}</div>` : ""}
          <div class="aw-section">${triggerCheck("排队执行", "data-trigger-queue", draft.busy === "queue")}
            <label class="aw-trigger-limit">运行超过<input type="number" min="0" step="1" title="0 表示不限" aria-label="运行时限（分钟，0 不限）" data-trigger-limit value="${draft.maxRunMinutes ?? 0}">分钟后强制结束</label>
          </div>${mode !== "automatic" ? filterSection() : ""}</details></div>`);
      updateSave();
      previewSchedule();
    }

    function showFailure(error) {
      if (error.code === "WORKFLOW_FORM_INVALID_NUMBER") showError(error.message, true);
      else reportFailure(error, container.querySelector(".aw-error"));
    }

    await state.ctx.dialog(state.shadow, {
      title: original ? "编辑触发器" : "新建触发器", className: "aw-param-dialog", form: true, isDirty,
      renderFooter(actions) {
        const label = document.createElement("label");
        label.className = "aw-trigger-enabled";
        enabled = document.createElement("input"); enabled.type = "checkbox"; enabled.checked = draft.enabled;
        enabled.addEventListener("change", previewSchedule);
        label.append(enabled, "启用"); actions.prepend(label);
        saveButton = actions.querySelector('[data-dialog-action="save"]');
        updateSave();
      },
      render(node) {
        container = node; render(); readDraft(); initial = signature();
        node.addEventListener("input", event => {
          updateSave();
          if (clock || event.target.hasAttribute("data-schedule-value")) previewSchedule();
        });
        node.addEventListener("change", event => {
          const control = event.target;
          const mode = control.hasAttribute("data-trigger-mode"), game = control.hasAttribute("data-trigger-event");
          const frequency = control.hasAttribute("data-trigger-frequency"), toggle = control.dataset.scheduleToggle;
          if (!mode && !game && !frequency && !toggle) {
            if (control.hasAttribute("data-trigger-weekday") || control.hasAttribute("data-trigger-queue")) previewSchedule();
            return;
          }
          let focus;
          try {
            readDraft();
            if (mode) {
              switchEvent(control.value === "automatic" ? lastGameEvent : control.value);
              focus = "[data-trigger-mode]:checked";
            } else if (game) {
              switchEvent(control.value);
              focus = "[data-trigger-event]";
            } else if (frequency) {
              timingDrafts.set(draft.event.timing.mode, draft.event.timing);
              draft.event.timing = timingDrafts.get(control.value) || flow.clone(scheduleDefaults[control.value]);
              focus = "[data-trigger-frequency]:checked";
            } else {
              const defaults = { endLocal: "", window: { start: "09:00", end: "18:00" }, dates: [] };
              if (control.checked) draft.event[toggle] = hiddenScheduleOptions.get(toggle) ?? defaults[toggle];
              else { hiddenScheduleOptions.set(toggle, draft.event[toggle]); delete draft.event[toggle]; }
              focus = `[data-schedule-toggle="${toggle}"]`;
            }
            render(); node.querySelector(focus)?.focus({ preventScroll: true });
          } catch (error) {
            if (mode) node.querySelector(`[data-trigger-mode][value="${triggerMode(draft.event.type)}"]`).checked = true;
            if (game) control.value = draft.event.type;
            if (frequency) node.querySelector(`[data-trigger-frequency][value="${draft.event.timing.mode}"]`).checked = true;
            if (toggle) control.checked = Object.hasOwn(draft.event, toggle);
            showFailure(error);
          }
        });
        node.addEventListener("click", event => {
          const control = event.target.closest("[data-aw]");
          if (!control || editingChild) return;
          const action = control.dataset.aw, index = Number(control.dataset.index);
          void (async () => {
            readDraft();
            let focus = '[data-aw="' + action + '"]';
            if (["mapping-add", "mapping-edit"].includes(action)) {
              editingChild = true;
              const item = await editTriggerInput(state, draft, index);
              if (!item) return;
              if (action === "mapping-edit") { draft.mapping[index] = item; focus += `[data-index="${index}"]`; }
              else draft.mapping.push(item);
            } else if (action === "mapping-delete") {
              draft.mapping.splice(index, 1); focus = '[data-aw="mapping-add"]';
            } else if (["condition-add", "condition-edit", "condition-replace"].includes(action)) {
              editingChild = true;
              const items = filterLeaves(draft.conditions);
              const item = await editTriggerFilter(state, draft.event.type, items[index], action === "condition-replace" ? draft.conditions : null);
              if (!item) return;
              if (action === "condition-replace") { draft.conditions = { op: "all", children: [item] }; focus = '[data-aw="condition-add"]'; }
              else {
                const children = [...items];
                if (action === "condition-edit") { children[index] = item; focus += `[data-index="${index}"]`; }
                else children.push(item);
                draft.conditions = { op: draft.conditions.children ? draft.conditions.op : "all", children };
              }
            } else if (action === "condition-delete" || action === "conditions-clear") {
              const children = action === "conditions-clear" ? [] : filterLeaves(draft.conditions).filter((_, row) => row !== index);
              draft.conditions = children.length ? { op: draft.conditions.children ? draft.conditions.op : "all", children } : model.group();
              focus = '[data-aw="condition-add"]';
            } else if (action === "trigger-date-add") {
              const date = node.querySelector("[data-trigger-date]").value;
              if (!date) { showError("请选择日历日期。", true); return; }
              if (!draft.event.dates.includes(date)) draft.event.dates = [...draft.event.dates, date].sort();
            } else if (action === "trigger-date-delete") {
              draft.event.dates.splice(index, 1); focus = "[data-trigger-date]";
            } else return;
            render(); node.querySelector(focus)?.focus({ preventScroll: true });
          })().catch(showFailure).finally(() => { editingChild = false; });
        });
      },
      actions: [{ id: "cancel", label: "取消" }, { id: "save", label: "保存", primary: true }],
      async onAction(action) {
        if (action !== "save") return true;
        try {
          readDraft();
          const { mapping, ...trigger } = flow.clone(draft);
          trigger.name = trigger.name.trim();
          const workflow = state.bundle.workflows.find(item => item.id === trigger.workflowId);
          if (!trigger.name || !workflow) { showError("请填写触发器名称并选择工作流。"); return false; }
          const keys = new Set(mapping.map(item => item.key));
          const inputError = keys.size !== mapping.length ? "工作流输入名不能重复。" :
            mapping.map(item => checkTriggerInput(item, trigger.event.type, keys, original?.event.type === "manual")).find(Boolean);
          if (inputError) { showError(inputError); return false; }
          const fields = triggerConditionFields(trigger.event.type);
          const unavailable = [...model.conditionFields(trigger.conditions)].find(field => !fields.includes(field));
          if (unavailable) { showError("筛选「" + triggerFieldName(unavailable) + "」不适用于当前触发方式。", triggerMode(trigger.event.type) !== "automatic"); return false; }
          model.validateCondition(trigger.conditions, { allowBlank: !trigger.enabled });
          if (original && signature() === initial) return true;
          trigger.inputs = Object.fromEntries(mapping.map(item => [item.key, item.value]));
          if (trigger.event.type === "schedule") {
            trigger.event = scheduleEvent(trigger.event);
            const changed = !original?.enabled || JSON.stringify(trigger.event) !== JSON.stringify(original.event);
            validateSchedule(trigger.event, trigger.enabled && changed);
            if (!keys.has("game") && needsGame(workflow)) {
              showError("所选工作流需要「游戏」输入，请添加游戏数据或选择另一个工作流。"); return false;
            }
          }
          const next = flow.clone(state.bundle), index = next.triggers.findIndex(item => item.id === trigger.id);
          if (index < 0) next.triggers.push(trigger); else next.triggers[index] = trigger;
          await save(state, next); return true;
        } catch (error) {
          if (error instanceof TypeError) showError(error.message);
          else showFailure(error);
          return false;
        }
      },
    });
  }
  async function runManual(state, trigger) {
    if (!trigger.enabled) throw new Error("请先启用手动触发器");
    const workspace = { variables: [], literalOnly: true, compactTypes: true };
    const values = Object.entries(trigger.inputs).map(([key, value]) => ({ key, value: Object.hasOwn(value, "literal") ? flow.clone(value) : flow.literal("") }));
    const lifetime = new AbortController();
    let container;
    const render = () => html(container, `<div class="aw aw-form">${values.length ? values.map((item, index) => valueField(item.key, item.value, "values." + index + ".value", workspace)).join("") : '<span class="aw-note">此触发器未配置输入</span>'}<div class="aw-error" role="alert"></div></div>`);
    const object = { values };
    await state.ctx.dialog(state.shadow, { title: "运行 · " + trigger.name, className: "aw-param-dialog", form: true,
      render: node => { container = node; render(); root.STWorkflowValues.bind(node, object, workspace, { dialog: state.ctx.dialog, shadow: state.shadow, render, signal: lifetime.signal }); node.addEventListener("change", event => {
        try { collect(node, object, workspace); }
        catch (error) { reportFailure(error, node.querySelector(".aw-error")); }
      }); }, actions: [{ id: "cancel", label: "取消" }, { id: "run", label: "运行", primary: true }],
      onAction: async (action, node) => {
        if (action !== "run") return true;
        try {
          collect(node, object, workspace);
          const inputs = Object.fromEntries(values.map(item => [item.key, flow.read(item.value, flow.state())]));
          const result = await view().rpc("manual-run", { triggerId: trigger.id, inputs });
          if (!result.matched) throw new Error("未满足触发条件，未启动工作流");
          state.tab = "history"; await history(state); return true;
        } catch (error) { reportFailure(error, node.querySelector(".aw-error")); return false; }
      },
    }).finally(() => lifetime.abort());
  }
  async function history(state, append = false) {
    const request = ++state.historyRequest;
    state.historyLoading = true; renderPage(state);
    try {
      const result = await view().rpc("list", append ? { before: state.next } : {});
      if (state.historyRequest !== request || !state.node.isConnected) return;
      state.jobs = append ? [...state.jobs, ...result.rows] : result.rows; state.next = result.next;
    } finally {
      if (state.historyRequest === request) { state.historyLoading = false; if (state.tab === "history") renderPage(state); }
    }
  }
  async function showJob(state, id) {
    let job = await view().rpc("get", { id }), container;
    function render() {
      const workflow = job.workflow, node = workflow && job.flow ? job.exception?.nodeId ? [...flow.walk(workflow.steps)].find(node => node.id === job.exception.nodeId) : flow.currentNode(workflow, job.flow) : null;
      html(container, `<div class="aw aw-form"><div><strong>${esc(runStatus(job))}</strong><p>${esc(job.error || job.summary || "")}</p><span class="aw-note">${esc(job.trigger?.name || "旧版方案")}${node ? " · 当前指令：" + esc(nodeName(node)) : ""}</span></div>
        <details open><summary>${icon("chevron-right", "aw-disclosure")}输入与变量</summary><pre class="aw-pre" data-variables></pre></details><details open><summary>${icon("chevron-right", "aw-disclosure")}运行日志</summary><div data-run-log></div></details><div class="aw-tools">${button("job-refresh", "刷新")}${!job.finalized ? button("job-stop", "停止运行") : ""}</div><div class="aw-error" role="alert"></div></div>`);
      container.querySelector("[data-variables]").textContent = JSON.stringify(job.flow ? { 输入: job.flow.input, 变量: Object.fromEntries(Object.entries(job.flow.vars).map(([id, value]) => [workflow.variables.find(item => item.id === id)?.name || id, value])) } : {}, null, 2);
      const log = container.querySelector("[data-run-log]");
      for (const entry of [...(job.entries || []), ...(job.flow?.failures || []).map(item => ({ at: item.at, level: "error", text: `${item.nodeId} · ${item.reason}` }))].sort((a, b) => a.at - b.at)) { const line = document.createElement("p"); line.textContent = `${new Date(entry.at).toLocaleTimeString()} · ${entry.level} · ${entry.text}`; log.appendChild(line); }
      if (!log.childElementCount) log.textContent = "暂无打印日志";
    }
    await state.ctx.dialog(state.shadow, { title: job.workflow.name, className: "aw-param-dialog", form: true,
      render: node => { container = node; render(); node.addEventListener("click", event => {
        const control = event.target.closest("[data-aw]"); if (!control) return;
        void (async () => {
          if (control.dataset.aw === "job-stop") await view().rpc("stop-run", { id });
          job = await view().rpc("get", { id }); render();
        })().catch(error => reportFailure(error, node.querySelector(".aw-error")));
      }); }, actions: [{ id: "close", label: "关闭" }],
    });
  }
  function renderPage(state) {
    const { node, bundle, tab } = state;
    if (!node.isConnected) return;
    if (!node.querySelector("[data-aw-panel]")) html(node, `<div class="aw"><div class="aw-page-heading"><h2 class="page-title">${esc(root.STI18n.text("settings.page.automation.name", "自动化"))}</h2>${button("reset", "恢复初始化")}</div>
      <div class="aw-tabs" role="tablist" aria-label="自动化页面">${tabs.map(([id, name]) => button("tab", name, `id="aw-tab-${id}" data-tab="${id}" role="tab" aria-selected="${tab === id}" tabindex="${tab === id ? 0 : -1}"`)).join("")}</div>
      <div data-aw-panel role="tabpanel"></div><input type="file" accept=".json,application/json" data-import hidden> <div class="aw-error" data-page-error role="alert"></div><div class="aw-note" role="status">${state.steamPending ? "配置已保存，Steam 重新连接后生效。" : ""}</div></div>`);
    for (const control of node.querySelectorAll('[role="tab"]')) { control.setAttribute("aria-selected", String(control.dataset.tab === tab)); control.tabIndex = control.dataset.tab === tab ? 0 : -1; }
    const panel = node.querySelector("[data-aw-panel]"); panel.setAttribute("aria-labelledby", "aw-tab-" + tab);
    let content;
    if (tab === "triggers") content = `<div class="aw-toolbar"><span>${bundle.triggers.length} 个触发器</span>${button("trigger-new", "新建触发器", 'class="aw-primary"', "plus")}</div>` +
      (bundle.triggers.length ? `<div class="aw-list">${bundle.triggers.map(trigger => {
        const workflow = bundle.workflows.find(item => item.id === trigger.workflowId), { event } = trigger;
        const detail = event.type === "schedule" ? scheduleLabel(event) :
          event.type === "installed" ? installStages.find(([id]) => id === event.phase)?.[1] : gameEvents[event.type];
        const label = [triggerModes[triggerMode(event.type)], detail].filter(Boolean).join(" · ");
        return `<div class="aw-card" data-id="${esc(trigger.id)}"><div><strong>${esc(trigger.name)}</strong><small>${esc(label)} → ${esc(workflow?.name || "引用已失效：" + trigger.workflowId)}</small></div><div class="aw-tools">${trigger.event.type === "manual" ? iconButton("trigger-run", "运行 " + trigger.name, "player-play", trigger.enabled ? "" : "disabled") : ""}${iconButton("trigger-toggle", (trigger.enabled ? "停用 " : "启用 ") + trigger.name, trigger.enabled ? "circle-check" : "circle-off", `aria-pressed="${trigger.enabled}"`)}${iconButton("trigger-edit", "编辑 " + trigger.name, "pencil")}${iconButton("trigger-delete", "删除 " + trigger.name, "trash")}</div></div>`;
      }).join("")}</div>` : '<div class="aw-empty">暂无触发器</div>');
    else if (tab === "workflows") content = `<div class="aw-toolbar"><span>${bundle.workflows.length} 个工作流</span><div class="aw-tools">${button("workflow-import", "导入工作流")}${button("workflow-new", "新建工作流", 'class="aw-primary"', "plus")}</div></div>` +
      (bundle.workflows.length ? `<div class="aw-list">${bundle.workflows.map(workflow => `<div class="aw-card" data-id="${esc(workflow.id)}"><div><strong>${esc(workflow.name)}</strong><small>${[...flow.walk(workflow.steps)].length} 条指令 · ${bundle.triggers.filter(item => item.workflowId === workflow.id).length} 个触发器引用</small></div><div class="aw-tools">${iconButton("workflow-edit", "编辑 " + workflow.name, "pencil")}${iconButton("workflow-copy", "复制 " + workflow.name, "copy")}${iconButton("workflow-export", "导出 " + workflow.name, "download")}${iconButton("workflow-delete", "删除 " + workflow.name, "trash")}</div></div>`).join("")}</div>` : '<div class="aw-empty">暂无工作流</div>');
    else if (tab === "prompts") content = view().promptsHtml(bundle);
    else content = `<div class="aw-toolbar"><span>运行记录</span>${button("history-refresh", "刷新", state.historyLoading ? "disabled" : "")}</div>` + (state.historyLoading ? '<div class="aw-empty" role="status">正在读取运行记录…</div>' :
      `<div class="aw-list">${state.jobs.map(job => `<div class="aw-card" data-id="${esc(job.id)}"><div><strong>${esc(job.workflowName)}</strong><small>${esc(job.triggerName)} · ${esc(new Date(job.createdAt).toLocaleString())} · ${esc(runStatus(job))}</small></div>${button("job", "查看")}</div>`).join("")}</div>${state.next ? button("history-more", "加载更多") : !state.jobs.length ? '<div class="aw-empty">暂无运行记录</div>' : ""}`);
    html(panel, content); panel.tabIndex = panel.querySelector("button,input,select,textarea") ? -1 : 0;
  }
  async function pageAction(state, control) {
    const action = control.dataset.aw, id = control.closest("[data-id]")?.dataset.id;
    if (action === "tab") { if (state.tab === control.dataset.tab) return; state.tab = control.dataset.tab; if (state.tab === "history") await history(state); else renderPage(state); return; }
    if (action === "reset") {
      const answer = await state.ctx.dialog(state.shadow, { title: "恢复提示词与自动化初始化", className: "aw-automation-dialog", form: true,
        message: "将替换全部提示词、触发器和工作流，并结束未完成运行。AI 连接、历史消息及已写入的结果会保留。",
        actions: [{ id: "cancel", label: "取消" }, { id: "reset", label: "恢复初始化", primary: true, danger: true }] });
      if (answer === "reset") {
        const result = await view().rpc("reset");
        state.bundle = result.workflow;
        state.steamPending = result.steamPending;
        if (state.tab === "history") await history(state); else renderPage(state);
      }
      return;
    }
    if (action === "workflow-new" || action === "workflow-edit") return editWorkflow(state, state.bundle.workflows.find(item => item.id === id));
    if (action === "trigger-new" || action === "trigger-edit") return editTrigger(state, state.bundle.triggers.find(item => item.id === id));
    if (action === "workflow-import") { state.node.querySelector("[data-import]").click(); return; }
    if (action === "workflow-export") { exportFlow(state.bundle.workflows.find(item => item.id === id)); return; }
    if (action === "trigger-run") return runManual(state, state.bundle.triggers.find(item => item.id === id));
    if (action === "history-refresh" || action === "history-more") return history(state, action === "history-more");
    if (action === "job") return showJob(state, id);
    const next = flow.clone(state.bundle), section = action.startsWith("workflow-") ? "workflows" : "triggers", index = next[section].findIndex(item => item.id === id), item = next[section][index];
    if (!item) return;
    if (action === "workflow-copy") { const copied = flow.clone(item); copied.id = flow.numericId("wf-", next.workflows); copied.name += "副本"; copied.revision = 1; next.workflows.push(copied); }
    else if (action === "trigger-toggle") {
      if (!item.enabled) {
        const workflow = next.workflows.find(row => row.id === item.workflowId);
        if (!workflow) throw new Error("引用的工作流已删除，请重新选择工作流");
        if (item.event.type === "schedule") {
          validateSchedule(item.event, true);
          if (!Object.hasOwn(item.inputs, "game") && needsGame(workflow)) throw new Error("所选工作流需要「游戏」输入，请先配置触发器");
        }
      }
      item.enabled = !item.enabled;
    }
    else if (action.endsWith("-delete")) {
      const refs = section === "workflows" ? next.triggers.filter(trigger => trigger.workflowId === id) : [];
      if (!await confirm(state, "删除" + (section === "workflows" ? "工作流" : "触发器"), `将删除“${item.name}”并结束相关未完成运行。该操作无法撤销。${refs.length ? "\n以下触发器会失去工作流引用：" + refs.map(item => item.name).join("、") : ""}`)) return;
      next[section].splice(index, 1);
    } else return;
    await save(state, next);
  }
  async function mount(node, shadow, ctx) {
    const state = { node, shadow, ctx, tab: "workflows", bundle: await ctx.storage.getWorkflow(), jobs: [], next: null, historyRequest: 0, historyLoading: false };
    if (!node.isConnected) return;
    state.render = () => renderPage(state);
    renderPage(state);
    node.addEventListener("click", event => {
      const control = event.target.closest("[data-aw],[data-wf]"); if (!control || control.disabled) return;
      const isTab = control.dataset.aw === "tab", operationTab = isTab ? control.dataset.tab : state.tab;
      event.stopPropagation(); if (!isTab) control.disabled = true;
      const action = control.hasAttribute("data-wf") ? view().promptAction(state, control) : pageAction(state, control);
      void action.catch(error => reportFailure(error, operationTab === state.tab ? node.querySelector("[data-page-error]") : null)).finally(() => { control.disabled = false; });
    });
    // 运行记录需要异步读取；方向键移动焦点，Enter/空格激活，离开后仍从选中页签进入
    node.addEventListener("keydown", event => {
      const control = event.target.closest('[role="tab"]');
      if (!control || event.altKey || event.ctrlKey || event.metaKey || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); const controls = [...node.querySelectorAll('[role="tab"]')], index = controls.indexOf(control);
      const next = event.key === "Home" ? 0 : event.key === "End" ? controls.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + controls.length) % controls.length;
      for (const item of controls) item.tabIndex = item === controls[next] ? 0 : -1;
      controls[next].focus();
    });
    node.addEventListener("focusout", event => {
      if (!event.target.matches('[role="tab"]') || event.relatedTarget?.closest?.('[role="tablist"]') === event.target.closest('[role="tablist"]')) return;
      for (const control of node.querySelectorAll('[role="tab"]')) control.tabIndex = control.dataset.tab === state.tab ? 0 : -1;
    });
    node.addEventListener("change", event => {
      if (!event.target.matches("[data-import]")) return;
      const file = event.target.files[0]; event.target.value = ""; if (!file) return;
      void (async () => {
        const data = JSON.parse(await file.text());
        if (data.schemaVersion !== 1) throw new Error("工作流文件版本无效");
        const workflow = flow.clone(data.workflow); flow.validate(workflow);
        workflow.id = flow.numericId("wf-", state.bundle.workflows); workflow.revision = 1;
        const next = flow.clone(state.bundle); next.workflows.push(workflow); await save(state, next);
      })().catch(error => reportFailure(error, node.querySelector(".aw-error")));
    });
  }
  root.STAutomationEditor = Object.freeze({ mount, style });
})(globalThis);
