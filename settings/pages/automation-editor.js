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
  const tr = (key, fallback, params) => globalThis.STI18n?.text(key, fallback, params) ?? fallback;
  const model = root.STAutomation, flow = root.STWorkflow, instructions = root.STWorkflowInstructions, tools = root.STWorkflowTools, css = root.STComponents.css;
  let clipboard = null;
  const pageStates = new WeakMap();
  const statuses = { get queued() { return tr("workflow_ui_queued", "排队中"); }, get held() { return tr("workflow_ui_not_started", "未启动"); }, get generating() { return tr("workflow_ui_waiting_for_ai", "AI 调用中"); }, get "running-script"() { return tr("workflow_ui_running_script", "脚本执行中"); }, get committing() { return tr("workflow_ui_committing", "正在提交"); }, get "running-steam"() { return tr("workflow_ui_running_steam_action", "Steam 指令执行中"); },
    get "preparing-notification"() { return tr("workflow_ui_delivering_message", "消息投递中"); }, get "waiting-notification"() { return tr("workflow_ui_waiting_for_input", "等待交互"); }, get "waiting-delay"() { return tr("workflow_ui_waiting", "等待中"); },
    get completed() { return tr("messageCenter_business_completed", "已完成"); }, get failed() { return tr("workflow_ui_failed", "失败"); }, get cancelled() { return tr("messageCenter_business_cancelled", "已取消"); }, get expired() { return tr("messageCenter_business_expired", "已失效"); }, get uncertain() { return tr("workflow_ui_outcome_unconfirmed", "结果待核实"); } };
  function runStatus(job) {
    if (job.status === "failed" && job.exception?.code === "WORKFLOW_RUN_TIMEOUT") return tr("workflow_ui_timed_out", "超时结束");
    if (job.status === "running-script" && (job.currentAction || (job.workflow && job.flow && flow.currentNode(job.workflow, job.flow)?.action)) === "http-request") return tr("workflow_ui_sending_http_request", "HTTP 请求中");
    return statuses[job.status] || job.status;
  }
  const calendar = root.STAutomationCalendar;
  const triggerModes = { get manual() { return tr("workflow_ui_manual", "手动触发"); }, get automatic() { return tr("workflow_ui_automatic", "自动触发"); }, get schedule() { return tr("workflow_ui_scheduled", "定时触发"); } };
  const gameEvents = { get added() { return tr("workflow_ui_game_added_to_library", "游戏入库"); }, get installed() { return tr("workflow_ui_game_installation", "游戏安装"); } };
  const installStages = () => [["started", tr("workflow_ui_download_started", "开始下载")], ["completed", tr("workflow_ui_installation_completed", "安装完成")]];
  const frequencies = () => [["minute", tr("workflow_ui_every_minute", "每分钟")], ["hour", tr("workflow_ui_hourly", "每小时")], ["day", tr("workflow_ui_daily", "每天")], ["week", tr("workflow_ui_weekly", "每周")], ["month", tr("workflow_ui_monthly", "每月")], ["cron", tr("workflow_ui_advanced", "高级")]];
  const scheduleDefaults = {
    minute: { mode: "minute", every: 1 }, hour: { mode: "hour", minute: 0 }, day: { mode: "day", time: "09:00" },
    week: { mode: "week", weekdays: [1], time: "09:00" }, month: { mode: "month", day: 1, time: "09:00" },
    cron: { mode: "cron", expression: "" },
  };
  const weekdays = () => [[1, tr("workflow_ui_mon", "周一")], [2, tr("workflow_ui_tue", "周二")], [3, tr("workflow_ui_wed", "周三")], [4, tr("workflow_ui_thu", "周四")], [5, tr("workflow_ui_fri", "周五")], [6, tr("workflow_ui_sat", "周六")], [0, tr("workflow_ui_sun", "周日")]];
  const tabs = () => [["workflows", tr("workflow_ui_workflows", "工作流")], ["prompts", tr("workflow_ui_prompts", "提示词")], ["tools", tr("workflow_ai_tools_tab", "AI 工具")], ["libraries", tr("workflow_libraries_tab", "自定义库")], ["triggers", tr("workflow_ui_triggers", "触发器")], ["site-permissions", tr("workflow_site_permissions", "域名授权")], ["history", tr("workflow_ui_run_history", "运行记录")]];
  const variableTypes = { get any() { return tr("workflow_ui_any_type", "任意数据"); }, get text() { return tr("steam_independentName_bulk_text", "文本"); }, get number() { return tr("steam_independentName_bulk_number", "数字"); }, get boolean() { return tr("workflow_ui_boolean", "布尔值"); }, get list() { return tr("seed_variable_list", "列表"); }, get object() { return tr("seed_variable_record", "字典"); }, get result() { return tr("workflow_ui_action_result", "指令结果"); } };
  const style = css.compose(
    css.button(".aw button:where(:not([data-st-combo-toggle])):where(:not([data-st-combo-option]))", { density: "compact" }), css.button(".aw button.aw-primary", { variant: "primary", density: "compact" }),
    css.button(".aw button.aw-icon", { variant: "ghost", density: "compact" }),
    css.field([".aw input:not([type=checkbox]):not([type=radio]):where(:not([data-st-combo-input]))", ".aw select", ".aw textarea"], { density: "compact" }),
    root.STWorkflowValues.style,
    `.aw{color:var(--st-color-text-primary);font-size:var(--st-font-size-body-small);min-width:0}.aw [hidden]{display:none!important}
    .aw button,.aw input,.aw select,.aw textarea{box-sizing:border-box;max-width:100%}.aw button{cursor:pointer}.aw button:disabled{cursor:default}
    .aw label{display:grid;gap:6px;min-width:0}.aw input:not([type=checkbox]):not([type=radio]),.aw select,.aw textarea{width:100%;min-width:0}.aw textarea{min-height:84px;resize:vertical;font:inherit;padding:8px}
    .aw-tool-options{display:flex;gap:8px 16px;flex-wrap:wrap;margin:0;padding:8px 12px 12px;border:1px solid var(--st-dialog-border);border-radius:var(--st-control-radius)}.aw-tool-options legend{padding-inline:4px}.aw .aw-tool-options label{display:flex;align-items:center}
    .aw-tool-options [data-tool-search]{flex-basis:100%}.aw .aw-tool-options label[hidden]{display:none}
    .aw-toolbar,.aw-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.aw-toolbar{justify-content:space-between;margin-bottom:16px}
    .aw-page-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}.aw-page-heading .page-title{margin:0}.aw-tabs{display:flex;gap:8px;flex-wrap:nowrap;overflow-x:auto;border-bottom:1px solid var(--st-dialog-divider);margin-bottom:16px;scrollbar-width:thin}
    .aw .aw-tabs [role=tab]{position:relative;flex:none;padding:8px 12px;min-height:40px;border:0;border-radius:0;background:transparent;box-shadow:none;color:var(--st-color-text-secondary);font-size:var(--st-font-size-body-small);font-weight:var(--st-font-weight-medium);white-space:nowrap;transition:color var(--st-motion-fast)}
    .aw .aw-tabs [role=tab]:hover{background:transparent;color:var(--st-color-text-primary)}.aw .aw-tabs [role=tab]:focus-visible{outline:2px solid var(--st-color-steam-blue);outline-offset:-4px;box-shadow:none}.aw .aw-tabs [role=tab][aria-selected=true]{color:var(--st-color-steam-blue)}.aw-tabs [aria-selected=true]::after{content:"";position:absolute;inset:auto 12px 0;border-block-end:2px solid currentColor}
    .aw-list{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}.aw-card{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--st-dialog-border);border-radius:var(--st-radius-md);background:var(--st-color-surface-subtle)}.aw-card>div:first-child{flex:1;min-width:0}.aw-card>.aw-tools{flex:none;max-inline-size:50%;justify-content:flex-end}.aw-card strong,.aw-card small{display:block;overflow-wrap:anywhere}.aw-card small{margin-top:4px;color:var(--st-color-text-secondary)}.aw-icon{display:inline-grid;place-items:center;width:28px;height:28px;padding:0!important;flex:none}.aw-icon>.aw-command-icon{width:16px;height:16px}.aw-icon[aria-pressed=true]{color:var(--st-color-success)}
    .aw-card .aw-item-summary{display:flex;gap:4px;align-items:baseline}.aw-item-summary>span{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .aw-item-summary>span[aria-hidden],.aw-item-meta{flex:none}.aw-item-meta{max-inline-size:100%}.aw-item-meta:has(~.aw-item-note){max-inline-size:calc(100% - 3em)}
    .aw-item-note{flex:0 1 auto}.aw-item-note:focus-visible{outline:1px solid var(--st-color-steam-blue);outline-offset:1px}
    .aw-item-note-tip{position:fixed;inset:auto;margin:0;box-sizing:border-box;inline-size:max-content;max-inline-size:min(400px,calc(100vw - 16px));max-block-size:min(280px,var(--aw-note-space,calc(100vh - 16px)));padding:8px 12px;border:1px solid var(--st-dialog-border);border-radius:var(--st-radius-md);background:var(--st-dialog-surface);color:var(--st-color-text-primary);box-shadow:var(--st-shadow-lg);font:inherit;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;overflow:auto;overscroll-behavior:contain}
    .aw-icon[data-has-note]{color:var(--st-color-steam-blue)}
    .aw-trigger-name{display:flex;align-items:center;gap:8px;min-width:0}.aw-param-dialog .aw-trigger-name>label{flex:1;grid-template-columns:112px minmax(0,1fr);gap:16px;align-items:center}
    @media(max-width:480px){.aw-trigger-name{align-items:end}.aw-param-dialog .aw-trigger-name>label{grid-template-columns:minmax(0,1fr);gap:8px}}
    .aw-empty{padding:32px 16px;text-align:center;color:var(--st-color-text-secondary);border:1px dashed var(--st-dialog-border);border-radius:var(--st-radius-md)}.aw-error{color:var(--st-color-danger-text);white-space:pre-wrap;overflow-wrap:anywhere;margin-top:8px}.aw-error:empty{display:none}.aw-note{color:var(--st-color-text-secondary);font-size:var(--st-font-size-caption)}
    .aw-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.aw-wide{grid-column:1/-1}.aw-form{display:grid;gap:16px}.aw-section{display:grid;gap:10px;padding-top:12px;border-top:1px solid var(--st-dialog-divider)}.aw-section h4{margin:0;font-size:var(--st-font-size-body-small);font-weight:var(--st-font-weight-medium)}
    .aw-value{display:grid;gap:6px;min-width:0}.aw-condition-group{display:grid;gap:8px;padding-inline-start:12px;border-inline-start:1px solid var(--st-dialog-divider)}.aw-condition{display:grid;grid-template-columns:minmax(0,1fr) 108px minmax(0,1fr) 28px;gap:8px;align-items:start}.aw-button-row{display:grid;grid-template-columns:minmax(0,1fr) 108px 28px;gap:8px;align-items:end}
    .settings-dialog.aw-workflow-dialog{width:min(1180px,calc(100vw - 32px));max-width:none;padding:0;display:flex;flex-direction:column;max-height:calc(100vh - 32px)}.aw-workflow-dialog .settings-dialog-message{padding:0;flex:1;min-height:0;overflow:hidden;white-space:normal}.aw-workflow-dialog .settings-dialog-actions{align-items:center;padding:12px 16px;border-top:1px solid var(--st-dialog-divider);margin:0}.aw-workflow-dialog .settings-dialog-header{padding-inline:16px}
    .aw-editor{height:min(720px,calc(100vh - 156px));min-height:300px;display:grid;grid-template-rows:auto minmax(0,1fr) auto}.aw-editor-top{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--st-dialog-divider)}.aw-editor-top{padding:8px 16px;min-height:52px}.aw-editor-top>.aw-workflow-name{display:flex;align-items:center;gap:10px;flex:1;min-width:0;max-width:440px}.aw-workflow-name>.aw-command-icon{color:var(--st-color-steam-blue)}.aw .aw-workflow-name input{border-color:transparent;background:transparent;font-size:14px;font-weight:var(--st-font-weight-medium)}.aw .aw-workflow-name input:hover{border-color:var(--st-dialog-border)}.aw-editor-toolbar{display:flex;align-items:center;gap:4px}.aw-editor-toolbar .aw-command-icon{width:18px;height:18px}.aw-editor-toolbar .aw-icon{width:32px;height:32px}.aw-editor-toolbar .aw-icon[aria-disabled=true]{opacity:.4;cursor:default}.aw-tool-separator{height:20px;border-inline-start:1px solid var(--st-dialog-divider);margin-inline:6px}.aw-editor-main{display:grid;grid-template-columns:210px minmax(0,1fr);min-height:0}
    .aw-palette{overflow:auto;padding:12px 8px;border-inline-end:1px solid var(--st-dialog-divider);scrollbar-width:thin}.aw-palette>input{margin-bottom:12px}.aw-palette details{margin:4px 0}.aw-palette summary{display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 6px;font-weight:var(--st-font-weight-medium);border-radius:var(--st-radius-sm);list-style:none}.aw-palette summary::-webkit-details-marker{display:none}.aw-command-icon.aw-category-caret{width:12px;height:12px;color:var(--st-color-text-muted)}.aw-palette details[open]>summary>.aw-category-caret{transform:rotate(90deg)}.aw-palette summary:hover{background:var(--st-color-surface-subtle-hover)}
    .aw .aw-palette-entry{display:flex;align-items:center;justify-content:flex-start;gap:8px;width:100%;height:auto;min-height:34px;padding:6px 8px 6px 30px;text-align:start;background:transparent;border-color:transparent;white-space:normal;line-height:1.5;cursor:grab;touch-action:none;user-select:none}
    .aw button.aw-palette-entry:is(:hover,.aw-drag-preview){border-color:var(--st-color-border-hover);background:color-mix(in srgb,var(--st-dialog-surface),var(--st-color-white) 10%)}
    .aw-command-icon{display:block;flex:none;width:20px;height:20px;background:currentColor;mask:var(--aw-command-icon) center/contain no-repeat;pointer-events:none;forced-color-adjust:none}.aw-category-icon{width:18px;height:18px;color:var(--st-color-text-muted)}.aw-palette-entry .aw-command-icon{width:16px;height:16px}
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
    .aw-editor-main{--aw-gutter:64px;--aw-indent:28px}.aw-canvas{overflow:auto;min-height:0;padding:8px;scrollbar-width:thin;position:relative}.aw-line{display:grid;grid-template-columns:36px 28px minmax(0,1fr) 32px;align-items:center;min-height:64px;padding:10px 0;border:1px solid transparent;border-radius:var(--st-radius-sm);position:relative;outline:none;transition:background-color var(--st-motion-fast),border-color var(--st-motion-fast)}.aw-line:hover{background:var(--st-color-surface-subtle)}.aw-line[aria-selected=true]{background:var(--st-color-primary-surface);border-color:var(--st-color-border-hover)}.aw-line:focus-visible,.aw-line:has(.aw-handle:focus-visible){outline:2px solid var(--st-color-steam-blue);outline-offset:-2px}
    .aw-number{color:var(--st-color-text-muted);font-variant-numeric:tabular-nums;text-align:center;font-size:var(--st-font-size-caption)}.aw-fold{display:grid;place-items:center}.aw-fold .aw-icon{width:24px;height:24px}.aw-content{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:8px;min-width:0;padding-inline:12px 8px;padding-inline-start:calc(12px + var(--aw-depth,0)*var(--aw-indent))}.aw .aw-node-icon{width:28px;height:28px;border:0;background:transparent;box-shadow:none;color:var(--st-color-text-secondary);display:grid;place-items:center;padding:0}.aw-line-copy{min-width:0}.aw-line-copy strong{display:block;font-size:var(--st-font-size-body-small);line-height:1.5;font-weight:var(--st-font-weight-medium)}.aw-line-copy small{display:block;color:var(--st-color-text-secondary);font-size:var(--st-font-size-caption);overflow-wrap:anywhere;white-space:normal;line-height:1.65;margin-top:3px}.aw-summary-value{color:var(--st-color-steam-blue);overflow-wrap:anywhere}.aw-indent{position:absolute;inset-block:-1px;left:calc(var(--aw-gutter) + var(--aw-level,0)*var(--aw-indent));border-inline-start:1px solid var(--st-dialog-divider);pointer-events:none}.aw-row-delete{opacity:0}.aw-line:hover .aw-row-delete,.aw-line[aria-selected=true] .aw-row-delete,.aw-line:focus-within .aw-row-delete{opacity:1}
    .aw .aw-insert-control{position:absolute;left:calc(var(--aw-gutter) - 10px);bottom:-10px;z-index:var(--st-z-index-dropdown);display:grid;place-items:center;width:20px;height:20px;min-height:20px;padding:0;border:1px solid var(--st-color-border-hover);border-radius:50%;background:var(--st-dialog-surface);color:var(--st-color-steam-blue);font-size:16px;opacity:0;pointer-events:none}.aw .aw-insert-control[data-position=before]{top:-10px;bottom:auto}.aw-line:hover>.aw-insert-control,.aw-insert-control:focus-visible{opacity:1;pointer-events:auto}.aw .aw-insert-control:hover,.aw .aw-insert-control:focus-visible{background:var(--st-color-primary);color:var(--st-color-white)}
    .aw-line:has(>.aw-insert-control:hover)::after,.aw-canvas [data-drop]::after{content:"";position:absolute;inset-inline:var(--aw-gutter) 0;inset-block-end:-1px;height:1px;background:var(--st-color-steam-blue);pointer-events:none}.aw-line:has(>[data-position=before]:hover)::after,.aw-canvas [data-drop=before]::after{inset-block: -1px auto}
    .aw-gap{position:relative}
    .aw-insert-row{display:flex;gap:8px;align-items:center;min-height:48px;position:relative;padding:6px 8px 6px calc(var(--aw-gutter) + 12px + var(--aw-depth,0)*var(--aw-indent));border-block:1px solid var(--st-color-border-primary)}.aw-insert-row>.st-search-combo{flex:1}.aw-handle{cursor:grab!important;touch-action:none;user-select:none;-webkit-user-select:none}.aw-canvas.aw-grabbing,.aw-canvas.aw-grabbing *{cursor:grabbing!important}
    .aw .aw-candidate{display:flex;align-items:center;justify-content:flex-start;gap:10px;min-height:48px;padding:8px;white-space:normal}.aw-candidate>span:last-child{display:grid;gap:3px;min-width:0}.aw-candidate small{font-size:var(--st-font-size-caption);color:var(--st-color-text-muted)}
    .aw-inspector{border-top:1px solid var(--st-dialog-divider);min-height:0}.aw-inspector-head{display:flex;align-items:center;gap:12px;padding:0 12px}.aw-inspector-head .aw-tabs{margin:0;border:0;gap:0}.aw-inspector-head>[data-count]{margin-inline-start:auto;color:var(--st-color-text-muted);font-size:var(--st-font-size-caption)}.aw-inspector-panel{height:min(192px,25vh);box-sizing:border-box;overflow:auto;border-top:1px solid var(--st-dialog-divider);scrollbar-width:thin;padding:0 12px}.aw-inspector table{width:100%;border-collapse:collapse;text-align:start;font-size:var(--st-font-size-caption)}.aw-inspector th{font-weight:400;color:var(--st-color-text-muted);position:sticky;top:0;background:var(--st-dialog-surface);z-index:1}.aw-inspector th,.aw-inspector td{padding:7px 8px;border-bottom:1px solid var(--st-dialog-divider);text-align:start}.aw-inspector .aw-table-link{border:0;background:transparent;text-align:start;color:var(--st-color-danger-text);padding:0;min-height:24px;white-space:normal}.aw-inspector .aw-tools{justify-content:flex-end}.aw-inspector .aw-variable-name{color:var(--st-color-steam-blue);background:transparent;border:0;padding:0;min-height:24px}.aw-inspector .aw-error{margin:6px 8px}.aw-line .aw-content{grid-column:3}.aw-context-menu{position:fixed;inset:auto;margin:0;padding:5px;min-width:238px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:auto;border:1px solid var(--st-dialog-border);border-radius:var(--st-radius-md);background:var(--st-dialog-surface);box-shadow:var(--st-shadow-lg)}.aw .aw-context-item{display:flex;align-items:center;gap:10px;width:100%;height:34px;padding:6px 10px;border:0;border-radius:var(--st-radius-sm);background:transparent;text-align:start}.aw-context-item .aw-command-icon{width:17px;height:17px}.aw-instruction-disabled .aw-line-copy,.aw-instruction-disabled .aw-node-icon{opacity:.45}.aw-instruction-disabled .aw-line-copy strong{text-decoration:line-through}.aw-context-item kbd{margin-inline-start:auto;color:var(--st-color-text-muted);font:inherit;font-size:var(--st-font-size-caption)}.aw .aw-context-item:hover,.aw .aw-context-item:focus-visible{background:var(--st-color-surface-subtle-hover)}.aw .aw-context-item.aw-context-danger{color:var(--st-color-danger-text)}.aw-context-menu hr{border:0;border-top:1px solid var(--st-dialog-divider);margin:4px 6px}.aw-editor-status{min-width:0;margin-inline-end:auto;overflow-wrap:anywhere;font-size:var(--st-font-size-caption);color:var(--st-color-text-secondary)}
    .aw-param-dialog .aw-section:first-child{border-top:0;padding-top:0}.aw-param-dialog .aw input:not([type=checkbox]),.aw-param-dialog .aw select{height:var(--st-control-height-regular);font-size:var(--st-font-size-body-small)}.aw-param-dialog .aw textarea{font-size:var(--st-font-size-body-small)}.aw-param-dialog .aw-value{grid-template-columns:112px minmax(0,1fr);align-items:start}.aw-param-dialog .aw-value>span{padding-top:8px}.aw-param-dialog .aw-condition{grid-template-columns:minmax(0,1fr) 28px;gap:12px;padding:12px 0;border-bottom:1px solid var(--st-dialog-divider)}.aw-condition-fields{display:grid;gap:12px;min-width:0}.aw-param-dialog .aw-condition-fields>label{grid-template-columns:112px minmax(0,1fr);align-items:center;gap:16px}.aw-param-dialog .aw-condition-fields>label select{max-width:200px}.aw-param-dialog .aw-condition-group{padding-inline-start:0;border:0;gap:12px}.aw-param-dialog .aw-condition-group .aw-condition-group{padding-inline-start:16px;border-inline-start:1px solid var(--st-dialog-divider)}
    .aw-pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:45vh;overflow:auto;font-family:monospace}.aw-hint{color:var(--st-color-text-secondary);font-size:var(--st-font-size-caption)}
    .aw-inspector-panel:not([hidden]):has(>.aw-inspector-empty:not([hidden])){display:flex;flex-direction:column}
    .aw-inspector-panel>table{flex:none}
    .aw-inspector-empty{display:grid;place-items:center;flex:1;min-height:0;color:var(--st-color-text-muted);font-size:var(--st-font-size-caption)}
    .aw-param-dialog .aw-form.aw-entry-form{gap:16px;padding-top:16px}
    .aw-entry-list{display:grid;gap:8px;--aw-entry-columns:minmax(0,1.25fr) minmax(0,1fr) 28px}
    .aw-entry-list[data-tool-entry]{--aw-entry-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1.3fr) max-content 28px}
    .aw-entry-list[data-library-output]{--aw-entry-columns:repeat(4,minmax(0,1fr)) 28px}
    .aw-module-tabs{flex-wrap:wrap}
    .aw-entry-fields{display:grid;grid-template-columns:var(--aw-entry-columns);align-items:center;gap:8px;min-width:0}
    .aw-entry-fields>*{min-width:0}.aw-entry-fields .aw-trigger-check{display:grid;justify-items:center}
    .aw-entry-head{color:var(--st-color-text-muted);font-size:var(--st-font-size-caption);overflow-wrap:anywhere}
    .aw-entry-description-field textarea{resize:vertical}
    .aw-entry-description{margin:0;color:var(--st-color-text-secondary);white-space:pre-wrap;overflow-wrap:anywhere}
    .aw-trigger-parameter{display:grid;grid-template-columns:minmax(0,1fr) 28px;align-items:center;gap:8px}
    .aw-param-dialog .aw-trigger-parameter>.aw-value{grid-template-columns:minmax(72px,27%) minmax(0,1fr);align-items:center}
    .aw-trigger-parameter:has(>[data-aw=binding-add]){grid-template-columns:minmax(72px,27%) minmax(0,1fr) 28px}
    .aw-record-columns,.aw-record-entry{display:grid;grid-template-columns:minmax(90px,1fr) minmax(0,2fr) minmax(98px,.8fr) 28px;align-items:center;gap:8px}
    .aw-record-columns{color:var(--st-color-text-muted);font-size:var(--st-font-size-caption)}
    .aw-record-entry{padding-block:5px;border-block-end:1px solid var(--st-dialog-divider)}
    .aw-record-entry>.aw-icon{grid-column:4}
    .aw-record-fields[data-all-required] :is(.aw-record-columns,.aw-record-entry){grid-template-columns:minmax(90px,1fr) minmax(0,2fr) 28px}
    .aw-record-fields[data-all-required] .aw-record-entry>.aw-icon{grid-column:3}
    .aw-param-dialog .aw-record-entry>.aw-value{display:block;min-width:0}
    .aw-record-entry .aw-value-label{position:absolute;inline-size:1px;block-size:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
    @media(max-width:590px){.aw-record-columns{display:none}.aw-record-entry{grid-template-columns:minmax(0,1fr) minmax(0,1fr) 28px}.aw-record-entry>[data-prop$=".omitIfUnset"]{grid-column:2;grid-row:1}.aw-record-entry>.aw-value{grid-column:1/3;grid-row:2}.aw-record-entry>.aw-icon{grid-column:3;grid-row:1/3}}
    .aw-module-tabs[hidden]{display:none}
    .aw-trigger-parameter>small{grid-column:1/-1}
    .aw-inspector-panel[hidden],.aw-inspector-empty[hidden]{display:none}
    .aw-inspector th.aw-inspector-actions{width:1%;padding:2px 0 2px 8px;white-space:nowrap}
    .aw-inspector-controls{display:flex;align-items:center;justify-content:flex-end;gap:4px}
    .aw-inspector .aw-variable-table td:last-child{text-align:end;padding-inline-end:calc(var(--st-control-height-compact) + var(--st-spacing-xs))}
    .aw-inspector-find{--aw-search-width:clamp(112px,calc(30vw - 32px),280px);display:grid;grid-template-areas:"search";flex:none;inline-size:var(--aw-search-width);block-size:var(--st-control-height-compact)}
    .aw .aw-inspector-find>input.aw-inspector-search{grid-area:search;padding-inline:calc(var(--st-control-height-compact) + var(--st-spacing-xs)) 0;opacity:1;clip-path:inset(-4px round var(--st-control-radius))}
    .aw-inspector-search::-webkit-search-cancel-button{appearance:none;flex:none;inline-size:var(--st-spacing-xl);block-size:var(--st-spacing-xl);margin:0;cursor:pointer;background:currentColor;mask:url('${instructions.iconAsset("x")}') center/12px no-repeat;forced-color-adjust:none}
    .aw .aw-inspector-find>input.aw-inspector-search[inert]{visibility:hidden;opacity:0;clip-path:inset(-4px -4px -4px calc(100% - var(--st-control-height-compact)) round var(--st-control-radius))}
    .aw .aw-inspector-find>button{grid-area:search;justify-self:end;order:1}
    .aw .aw-inspector-find>button[aria-expanded=true]{transform:translateX(calc(var(--st-control-height-compact) - var(--aw-search-width)));color:var(--st-color-steam-blue)}
    @media(prefers-reduced-motion:no-preference){
      .aw .aw-inspector-find>input.aw-inspector-search{transition:clip-path var(--st-motion-normal),opacity var(--st-motion-fast),border-color var(--st-motion-fast),box-shadow var(--st-motion-fast),var(--aw-search-visibility,visibility 0s)}
      .aw .aw-inspector-find>input.aw-inspector-search[inert]{--aw-search-visibility:visibility var(--st-motion-normal)}
      .aw .aw-inspector-find>button{transition:transform var(--st-motion-normal),color var(--st-motion-fast),background-color var(--st-motion-fast),border-color var(--st-motion-fast),box-shadow var(--st-motion-fast)}
    }
    @media(max-width:760px){.aw-editor-main{grid-template-columns:160px minmax(0,1fr);--aw-indent:20px}.aw-editor-top{flex-wrap:wrap}.aw-editor-top>.aw-workflow-name{max-width:none;flex-basis:60%}.aw-inspector-head>[data-count]{display:none}.aw-grid{grid-template-columns:1fr}.aw-param-dialog .aw-value,.aw-param-dialog .aw-condition-fields>label{grid-template-columns:1fr;gap:6px}.aw-param-dialog .aw-value>span{padding-top:0}}
    .aw-palette details[data-group]{margin-inline-start:8px}.aw-palette details[data-group]>summary{font-weight:var(--st-font-weight-regular);font-size:var(--st-font-size-caption)}
    .aw-param-dialog{width:min(680px,calc(100vw - 32px))!important}.aw-param-dialog .settings-dialog-header{min-height:88px;height:auto;padding-block:16px!important}.aw-param-dialog .settings-dialog-message{padding:0 20px 20px!important;max-height:calc(100dvh - 200px);overflow:auto;white-space:normal}.aw-param-dialog .aw-form{gap:0}.aw-param-dialog .aw-param-tabs{margin:0 0 20px;gap:16px;flex-shrink:0}.aw-param-dialog .aw-param-tabs [role=tab]{padding-inline:0}.aw-param-dialog .aw-param-tabs [aria-selected=true]::after{inset-inline:0}.aw-param-dialog [role=tabpanel]{display:grid;gap:24px}.aw-param-dialog .aw-section{gap:16px}.aw-param-dialog .aw-section+.aw-section{border-top:1px solid var(--st-dialog-divider);padding-top:20px}.aw-param-dialog .aw-grid{grid-template-columns:minmax(0,1fr);gap:16px}.aw-param-dialog .aw-section>label,.aw-param-dialog .aw-grid>label,.aw-param-dialog .aw-output-field{display:grid;grid-template-columns:112px minmax(0,1fr);gap:16px;align-items:center}.aw-param-dialog .aw-value{gap:16px}.aw-param-dialog .aw-section h4{font-size:var(--st-font-size-body-small);margin:0 0 4px}.aw-param-dialog [data-dialog-action=test]{margin-inline-end:auto}
    .aw-param-dialog .aw-single-condition{grid-template-columns:minmax(0,1fr);border:0;padding:0}.aw-param-dialog .aw-condition-fields>label select{max-width:none}.aw-code-section{display:grid;gap:8px}.aw-code-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.aw-code-toolbar>span{margin-inline-end:auto}.aw-code-editor{height:280px;min-width:0;border:1px solid var(--st-dialog-border);border-radius:var(--st-control-radius);overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr) auto}.aw-code-editor>[data-code]{min-width:0;min-height:0}.aw .aw-code-editor>[data-script-reference]{align-self:start;height:32px;border-radius:var(--st-control-radius)}.aw-code-editor:focus-within{border-color:var(--st-color-steam-blue);box-shadow:var(--st-control-focus-shadow)}.aw-code-expanded{width:calc(100vw - 32px)!important}.aw-code-expanded .aw-code-editor{height:48vh}.aw-test-result{margin-top:16px;padding-top:16px;border-top:1px solid var(--st-dialog-divider);white-space:pre-wrap;overflow-wrap:anywhere;font-family:monospace;max-height:200px;overflow:auto}.aw-param-dialog [hidden]{display:none!important}
    .aw-inspector .aw-table-link:has(.aw-diagnostic-warning){color:var(--st-dialog-text-color)}.aw-diagnostic-warning{color:var(--st-color-warning);margin-inline-end:4px}
    .aw-diagnostic-error{color:var(--st-color-danger-text);overflow-wrap:anywhere}
    .aw-inspector [data-diagnostics] th:first-child{width:18%}
    .aw-inspector [data-diagnostics] td{overflow-wrap:anywhere}
    .aw-diagnostic-lines .aw-inspector-controls{justify-content:space-between;gap:var(--st-spacing-sm)}
    .aw-inspector [data-diagnostics] tbody tr:is(:hover,:has(:focus-visible)){background-color:var(--st-color-surface-subtle-hover)}
    .aw-inspector [data-diagnostics] tbody button,.aw-inspector [data-diagnostics] tbody button:is(:hover,:focus-visible){border:0;border-radius:0;background:transparent;box-shadow:none}
    .aw-inspector [data-diagnostics] tbody button:focus-visible{text-decoration:underline;text-underline-offset:.2em}
    .aw-debug-status{min-width:0;margin:0;padding-inline:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--st-color-text-secondary);font-size:var(--st-font-size-caption)}
    .aw-debug-head,.aw-debug-pages{display:flex;align-items:center;justify-content:space-between;gap:4px}.aw-debug-pages{font-variant-numeric:tabular-nums;color:var(--st-color-text-muted);font-size:var(--st-font-size-caption)}
    .aw-debug-head{position:sticky;inset-block-start:0;z-index:var(--st-z-index-base);box-sizing:border-box;block-size:var(--st-control-height-regular);background:var(--st-dialog-surface);border-block-end:1px solid var(--st-dialog-divider);flex:none}
    .aw-debug-pages [data-aw=log-prev]>.aw-command-icon{transform:rotate(180deg)}
    .aw .aw-editor-run{margin-inline-start:auto;flex:none}.aw .aw-editor-run[aria-disabled=true]{opacity:.65;cursor:default}
    .aw-debug-head:not([hidden])+.aw-debug-log th{top:var(--st-control-height-regular)}
    .aw-debug-log th:first-child{width:clamp(52px,6vw,88px);white-space:nowrap}
    .aw-debug-log th:nth-child(2){width:clamp(80px,11vw,144px);white-space:nowrap}
    .aw-debug-log .aw-inspector-controls>span{margin-inline-end:var(--st-spacing-sm)}
    .aw-debug-log .aw-inspector-find{--aw-search-width:clamp(76px,21vw,156px)}
    .aw-debug-log td{vertical-align:middle}
    .aw-debug-log td:nth-child(2){font-variant-numeric:tabular-nums;color:var(--st-color-text-muted);white-space:nowrap}
    .aw-inspector td.aw-debug-message{padding-block:2px}
    .aw-debug-content{display:grid;grid-template:"field" / minmax(0,1fr);align-items:center}
    .aw .aw-debug-content>textarea{grid-area:field;display:block;min-height:0;height:var(--st-control-height-compact);padding:4px 6px;padding-inline-end:calc(var(--st-control-height-compact) + var(--st-spacing-xs));margin:0;resize:none;overflow:hidden;background:transparent;border-color:transparent;line-height:calc(var(--st-control-height-compact) - 10px);color:inherit;cursor:text}
    .aw .aw-debug-content:hover>textarea,.aw .aw-debug-content:focus-within>textarea{border-color:var(--st-dialog-border)}
    .aw .aw-debug-content>textarea:focus{border-color:var(--st-dialog-border-hover)}
    .aw .aw-debug-content>button{grid-area:field;justify-self:end;inline-size:calc(var(--st-control-height-compact) - 2px);block-size:calc(var(--st-control-height-compact) - 2px);margin-inline-end:1px}
    @media(hover:hover){
      .aw-debug-content>button{opacity:0}
      .aw-debug-log tr:hover .aw-debug-content>button,.aw-debug-content:focus-within>button{opacity:1}
    }
    @media(prefers-reduced-motion:no-preference){.aw-debug-content>button{transition:opacity var(--st-motion-fast)}}
    .settings-native-layer .settings-form-dialog.aw-log-view-dialog{width:min(820px,100%)}
    .aw-log-view-dialog .settings-dialog-actions:empty{display:none}
    .aw-log-view{display:grid;gap:var(--st-spacing-sm);white-space:normal}
    .aw-log-view-toolbar{display:flex;justify-content:flex-end;align-items:center;gap:var(--st-spacing-md);flex-wrap:wrap}
    .aw-log-view-toolbar [role=status]{margin-inline-end:auto;color:var(--st-color-text-secondary);font-size:var(--st-font-size-caption)}
    .aw .aw-log-view-toolbar>label{display:flex;align-items:center;gap:var(--st-spacing-xs)}
    .aw-log-view-editor{height:min(52vh,480px);min-width:0;overflow:hidden;border:1px solid var(--st-dialog-border);border-radius:var(--st-control-radius)}
    .aw-log-view-editor:focus-within{border-color:var(--st-dialog-border-hover)}
    .aw-debug-log [data-level=warning]>td:first-child{color:var(--st-color-warning)}
    .aw-debug-log [data-level=error]>td:first-child{color:var(--st-color-danger-text)}
    .aw-debug-log [data-level=success]>td:first-child{color:var(--st-color-success)}
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
    .aw-error-marker{display:inline-flex;vertical-align:middle;margin-inline-start:6px;color:var(--st-color-danger-text)}.aw-error-marker .aw-command-icon{width:16px;height:16px}
    .aw-import-issues .settings-dialog-message{white-space:pre-line;overflow-wrap:anywhere}
    .aw-automation-dialog:not(.settings-form-dialog) .settings-dialog-message{white-space:pre-line;overflow-wrap:anywhere}
    .aw-automation-dialog .settings-dialog-danger{color:var(--st-color-danger-text)}
    .aw-summary-reference,.aw-summary-fragment{display:inline;border:1px solid var(--st-color-border-hover);border-radius:var(--st-radius-sm);background:var(--st-color-primary-surface);padding-inline:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
    .aw-note-card{display:flex;align-items:center;gap:8px;min-width:0;padding:6px 8px;border-radius:var(--st-radius-sm);background:color-mix(in srgb,var(--st-color-success) 12%,transparent);color:var(--st-color-success-bright);font-size:var(--st-font-size-caption)}
    .aw-note-card .aw-command-icon{width:16px;height:16px}
    .aw-node-note{max-width:min(240px,20vw)}.aw-node-note .aw-note-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .aw-line.aw-comment-line{min-height:44px;padding-block:0;border:0;background:color-mix(in srgb,var(--st-color-success) 10%,transparent)}
    .aw-line.aw-comment-line:hover,.aw-line.aw-comment-line[aria-selected=true]{background:color-mix(in srgb,var(--st-color-success) 17%,transparent)}
    .aw-line[aria-invalid=true]{background-color:var(--st-color-danger-surface)}
    .aw-line[aria-invalid=true]:is(:hover,[aria-selected=true]){background-color:color-mix(in srgb,var(--st-color-danger-text) 17%,transparent)}
    .aw-line[aria-invalid=true][aria-selected=true]{border-color:color-mix(in srgb,var(--st-color-danger-text) 32%,transparent)}
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
      .aw-param-dialog .aw-trigger-form :is(.aw-grid,.aw-trigger-name)>label:not(.aw-trigger-check),
      .aw-param-dialog .aw-trigger-form .aw-trigger-row{grid-template-columns:104px minmax(0,1fr);gap:12px}
      .aw-trigger-form .aw-trigger-options,.aw-trigger-form .aw-note{padding-inline-start:116px}
      .aw-trigger-form .aw-trigger-options legend{position:absolute;margin-bottom:0}
    }
    .aw .aw-end-gap>button{display:flex;align-items:center;justify-content:flex-start;gap:8px;width:100%;height:auto;min-height:52px;padding:8px;border:1px solid transparent;padding-inline-start:calc(var(--aw-gutter) + 12px);border-radius:var(--st-radius-sm);background:transparent;color:var(--st-color-text-muted);text-align:start;white-space:normal}
    .aw .aw-end-gap>button:is(:hover,:focus-visible){border-color:transparent;background:var(--st-color-surface-subtle-hover);color:var(--st-color-text-primary)}
    .aw .aw-end-gap>button:focus-visible{outline:2px solid var(--st-color-steam-blue);outline-offset:-2px;box-shadow:none}
    .aw .aw-end-gap[data-drop]>button{color:var(--st-color-steam-blue);background:var(--st-color-primary-surface)}
    .aw-end-gap::before{content:"";position:absolute;inset-block:0;inset-inline-start:var(--aw-gutter);border-inline-start:1px solid var(--st-dialog-divider);pointer-events:none}
    .aw-end-plus{display:grid;place-items:center;width:28px;flex:none}.aw-end-plus .aw-command-icon{width:16px;height:16px}
    .aw-canvas [data-drop]::after{inset-inline-start:calc(var(--aw-gutter) + var(--aw-drop-depth,0)*var(--aw-indent));z-index:calc(var(--st-z-index-dropdown) + 1)}
    .aw-composition-form>.aw-section:first-child{padding-top:0;border-top:0}
    .aw-composition-form .aw-composition-preview ol{margin:0;padding-inline-start:24px;display:grid;gap:4px;color:var(--st-color-text-secondary)}
    .aw-composition-form .aw-composition-preview ol ol{margin-block-start:4px}
    .aw-composition-form fieldset{min-width:0}.aw-composition-form .aw-http-mapping{display:grid;gap:8px;margin-block:8px}
    .aw-composition-form .aw-http-mappings>div{width:100%}.aw-composition-form .aw-tool-options .aw-http-mapping label{display:grid}
    .aw-canvas .aw-line:not(.aw-marker){cursor:grab;user-select:none}
    .aw-line:not(.aw-marker) :is(.aw-number,.aw-line-copy strong){touch-action:none}
    .aw-selectable-text{cursor:text;user-select:text}
    .aw button.aw-palette-entry.aw-dragging{cursor:grabbing}
    .aw-canvas .aw-line.aw-dragging{border-color:transparent;background:var(--st-color-surface-subtle);outline:1px dashed var(--st-color-border-hover);outline-offset:-1px}
    .aw-canvas .aw-line.aw-dragging>*,.aw-canvas.aw-grabbing .aw-insert-control{opacity:0;pointer-events:none}
    .aw-canvas.aw-grabbing .aw-command-picker{visibility:hidden}
    .aw .aw-drag-preview{position:fixed;inset:0 auto auto 0;z-index:var(--st-z-index-dropdown);box-sizing:border-box;pointer-events:none;box-shadow:var(--st-shadow-dialog);transition:none}
    .aw-line.aw-drag-preview{border-color:var(--st-color-border-hover);background-color:var(--st-dialog-surface-raised)}
    .aw-line.aw-comment-line.aw-drag-preview{background-color:color-mix(in srgb,var(--st-dialog-surface-raised),var(--st-color-success) 12%);outline:1px solid var(--st-color-border-hover);outline-offset:-1px}
    .aw-line.aw-drag-preview[aria-invalid=true]{border-color:color-mix(in srgb,var(--st-color-danger-text) 32%,transparent);background-color:color-mix(in srgb,var(--st-dialog-surface-raised),var(--st-color-danger-text) 17%)}
    .aw-param-dialog .aw-permission-line{display:flex;flex-wrap:wrap;align-items:center;gap:var(--st-spacing-xs)}
    .aw-param-dialog .aw-permission-line .aw-donation-link{margin-inline-start:auto;border:1px solid var(--st-dialog-border)}
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
    ? `<label><span>${esc(label)}</span>${root.STSearchCombo.fixedComboHtml(label, "data-prop", path, rows, value)}</label>`
    : prop(label, path, value, null, kind);
  const get = (object, path) => flow.pathGet(object, path.split("."));
  function set(object, path, value) { const keys = path.split("."), key = keys.pop(); flow.pathGet(object, keys)[key] = value; }
  const valueField = (...args) => root.STWorkflowValues.field(...args);
  const collect = (...args) => root.STWorkflowValues.collect(...args);
  const outputField = (...args) => root.STWorkflowValues.output(...args);
  function conditionHtml(value, path, workflow, removable = false) {
    if (value.children) return `<div class="aw-condition-group">${parameterProp(tr("workflow_ui_match_mode", "匹配方式"), path + ".op", value.op, [["all", tr("workflow_ui_match_all", "全部满足")], ["any", tr("workflow_ui_match_any", "任一满足")]])}
      ${value.children.map((child, index) => conditionHtml(child, path + ".children." + index, workflow, true)).join("")}
      <div class="aw-tools">${button("condition-add", tr("workflow_ui_add_condition", "添加条件"), `data-path="${path}"`, "plus")}</div></div>`;
    return `<div class="aw-condition${removable ? "" : " aw-single-condition"}"><div class="aw-condition-fields">${valueField(tr("workflow_ui_first_operand", "对象1"), value.left, path + ".left", workflow)}${parameterProp(tr("workflow_ui_operator", "关系"), path + ".op", value.op, instructions.schemaChoices(Object.entries(flow.operations)))}
      ${flow.unary.has(value.op) ? "" : valueField(tr("workflow_ui_second_operand", "对象2"), value.right || flow.literal(""), path + ".right", workflow, [], "any", false, instructions.choices(workflow, value.left))}</div>${removable ? iconButton("condition-delete", tr("workflow_ui_remove_condition", "删除条件"), "trash", `data-path="${path}"`) : ""}</div>`;
  }
  async function confirm(state, title, message, { references = [], kind, countdownSeconds } = {}) {
    const messageParts = [{ text: message }];
    if (references.length) {
      const token = "$names$";
      const warning = tr("workflow_delete_reference_warning", "$names$ 正在使用此$kind$。删除后可能导致相关功能无法使用，确定要删除吗？", { names: token, kind });
      const [before, after] = warning.split(token);
      messageParts.push({ text: "\n\n" + before }, { text: [...new Set(references)].join(tr("workflow_reference_name_separator", "、")), danger: true }, { text: after });
    }
    return await state.ctx.dialog(state.shadow, {
      title, className: "aw-automation-dialog", native: true, messageParts,
      actions: [{ id: "cancel", label: tr("common_cancel", "取消") },
        { id: "confirm", label: tr("common_delete", "删除"), primary: true, danger: true, countdownSeconds }],
    }) === "confirm";
  }
  function confirmDelete(state, title, message, kind, references) {
    return confirm(state, title, message, { kind, references, countdownSeconds: 5 });
  }
  function reportFailure(error, element, editor = null) {
    if (editor) { locateError(editor, error); element = editor.root.querySelector("[data-editor-error]"); }
    view().reportFailure(error, element);
  }
  async function save(state, bundle, creation) {
    let steamPending = false;
    const saved = await state.ctx.storage.setWorkflow(bundle, { creation, onSteamPending: () => { steamPending = true; } });
    if (state.bundle.epoch === saved.epoch && state.bundle.revision > saved.revision) return;
    state.bundle = saved;
    state.steamPending = steamPending;
    state.resetStatus = "";
    renderPage(state);
  }
  function downloadJson(value, name, suffix) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = name.replace(/[<>:"/\\|?*]/g, "_") + suffix;
    link.click(); root.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportFlow(workflow) {
    downloadJson({ schemaVersion: 1, workflow }, workflow.name, ".workflow.json");
  }
  function toolReferences(bundle, id) {
    return [...bundle.workflows, ...bundle.tools, ...bundle.libraries].flatMap(workflow => [...flow.walk(workflow.steps)].filter(node =>
      flow.toolIds(node).includes(id)).map(node => ({ workflow, node })));
  }
  function toolIssues(workflow, library) {
    const issues = [];
    for (const node of flow.walk(workflow.steps)) {
      for (const id of flow.toolIds(node)) if (flow.isToolId(id) && !library.some(tool => tool.id === id))
        issues.push(Object.assign(new Error(tr("workflow_tool_missing", "找不到工具 $id$，请导入或重新选择。", { id })),
          { nodeId: node.id, field: node.action === "ai-call" ? "toolIds" : "toolId" }));
    }
    return issues;
  }
  function availableTools(state, selected = []) {
    const library = state.bundle.tools || [];
    return [...library, ...selected.filter(id => !library.some(tool => tool.id === id)).map(id => ({ id, name: id, enabled: false }))];
  }
  function toolChoices(state, selected = []) {
    const library = availableTools(state, selected), search = tr("workflow_tool_search", "搜索工具");
    return `<fieldset class="aw-tool-options"><legend>${esc(tr("workflow_ui_available_tools", "可用工具"))}</legend>
      ${library.length > 3 ? `<input type="search" data-tool-search placeholder="${esc(search)}" aria-label="${esc(search)}">` : ""}
      ${library.map(tool => {
        const checked = selected.includes(tool.id);
        return `<label data-tool-choice><input type="checkbox" data-allowed-tool="${esc(tool.id)}" ${checked ? "checked" : !tool.enabled ? "disabled" : ""}>${esc(tool.name)}${tool.enabled ? "" : " · " + esc(tr("workflow_tool_unavailable", "不可用"))}</label>`;
      }).join("")}</fieldset>`;
  }
  const chosenTools = container => [...container.querySelectorAll("[data-allowed-tool]:checked")].map(input => input.dataset.allowedTool);
  function searchToolChoices(container, value) {
    const query = value.trim().toLocaleLowerCase();
    for (const label of container.querySelectorAll("[data-tool-choice]")) label.hidden = !label.textContent.toLocaleLowerCase().includes(query);
  }
  function aiServiceAndPrompt(editor, node) {
    const services = view().serviceChoices(editor.registry, node.serviceId);
    const prompts = view().promptChoices(editor.plans, node.promptId);
    if (!node.promptId) prompts.unshift(["", prompts.length ? tr("workflow_ui_select_a_prompt_template", "请选择提示词模板") : tr("workflow_ui_create_a_prompt_first", "请先新建提示词"), true]);
    return `<div class="aw-grid">${parameterProp(tr("onboarding_aiServices", "AI 服务"), "serviceId", node.serviceId, services)}${parameterProp(tr("workflow_ui_prompt_template", "提示词模板"), "promptId", node.promptId, prompts)}</div>`;
  }
  function promptIssues(workflow, plans, registry) {
    const errors = [];
    for (const node of flow.walk(workflow.steps)) {
      if (node.action === "ai-call") errors.push(...tools.promptDiagnostics(node, plans, registry));
    }
    return errors;
  }
  function importReferenceIssues(workflow) {
    // 有效的指令树可以带入编辑器重绑变量。损坏的文件格式仍由原校验器拒绝。
    const editable = error => error.code === "WORKFLOW_CONFIG_INVALID" && error.nodeId &&
      ["workflow_error_unassigned", "workflow_error_deleted_variable", "workflow_error_output", "workflow_parameter_replace_receive", "workflow_parameter_legacy_reference"].includes(error.messageKey);
    try { flow.validate(workflow); return []; }
    catch (error) {
      if (!editable(error)) throw error;
      const issues = tools.diagnostics(tools.openDraft(workflow));
      if (!issues.length) throw error;
      const invalid = issues.find(issue => !editable(issue));
      if (invalid) throw invalid;
      return issues;
    }
  }
  async function importFlow(state, file) {
    const data = JSON.parse(await file.text());
    if (data?.schemaVersion !== 1 || !/^wf-\d+$/.test(data.workflow?.id))
      throw new Error(tr("workflow_ui_invalid_workflow_file_version", "工作流文件版本无效"));
    const workflow = data.workflow, referenceIssues = importReferenceIssues(workflow);
    if (!referenceIssues.length && !workflow.inputParameters) {
      openWorkflowParameters(workflow);
      referenceIssues.push(...importReferenceIssues(workflow));
    }
    const issues = [...referenceIssues, ...toolIssues(workflow, state.bundle.tools || []), ...libraryIssues(workflow, state.bundle.libraries)];
    const calls = [...flow.walk(workflow.steps)].filter(node => node.action === "ai-call");
    if (calls.length) {
      const registry = await state.ctx.storage.getAi();
      for (const node of calls) issues.push(...tools.promptDiagnostics(node, state.bundle.prompts, registry));
    }
    if (issues.length) {
      const lines = tools.lines(tools.openDraft(workflow));
      issues.sort((left, right) => lines.get(left.nodeId).number - lines.get(right.nodeId).number);
      const details = issues.map(issue => {
        const { number, row } = lines.get(issue.nodeId);
        return [tr("workflow_format_line", "第 $count$ 行", { count: number }), instructions.name(instructions.key(row)), view().errorCaption(issue)].join(" · ");
      });
      const answer = await state.ctx.dialog(state.shadow, {
        title: tr("workflow_import_issues_title", "工作流有错误，是否修改？"), className: "aw-import-issues", form: true,
        message: details.join("\n"), actions: [
          { id: "cancel", label: tr("workflow_cancel_import", "取消导入") },
          { id: "edit", label: tr("workflow_edit_issues", "去修改"), primary: true },
        ],
      });
      if (answer === "edit") await editWorkflow(state, workflow, issues[0]);
      return;
    }
    const next = flow.clone(state.bundle);
    workflow.id = flow.numericId("wf-", next.workflows); workflow.revision = 1;
    next.workflows.push(workflow);
    await save(state, next, { section: "workflows", id: workflow.id });
  }
  async function editVariable(state, workflow, selected = null) {
    const lifetime = new AbortController();
    const draft = selected ? { ...selected } : { id: flow.numericId("var-", workflow.variables), name: "", type: "any" };
    return state.ctx.dialog(state.shadow, { title: selected ? tr("workflow_ui_edit_variable", "编辑变量") : tr("workflow_ui_new_variable", "新建变量"), className: "aw-automation-dialog", form: true,
      render: node => {
        html(node, `<div class="aw aw-form">${prop(tr("workflow_ui_variable_name", "变量名称"), "name", draft.name)}${parameterProp(tr("common_type", "类型"), "type", draft.type, [["any", tr("workflow_ui_any_type", "任意数据")], ["text", tr("steam_independentName_bulk_text", "文本")], ["number", tr("steam_independentName_bulk_number", "数字")], ["boolean", tr("workflow_ui_boolean", "布尔值")], ["list", tr("seed_variable_list", "列表")], ["object", tr("seed_variable_record", "字典")], ["result", tr("workflow_ui_action_result", "指令结果")]])}<div class="aw-error" role="alert"></div></div>`);
        root.STSearchCombo.bindSearchCombos(node, lifetime.signal);
      },
      actions: [{ id: "cancel", label: tr("common_cancel", "取消") }, { id: "save", label: tr("common_confirm", "确定"), primary: true }],
      onAction: (action, node) => {
        if (action !== "save") return true;
        try {
          collect(node, draft, workflow);
          if (!draft.name.trim() || workflow.variables.some(item => item.id !== draft.id && item.name === draft.name)) throw new Error(tr("workflow_ui_enter_a_unique_variable_name", "请填写不重复的变量名称"));
          if (selected) Object.assign(selected, draft); else workflow.variables.push(draft);
          return true;
        } catch (error) { reportFailure(error, node.querySelector(".aw-error")); return false; }
      },
    }).then(answer => answer === "save" ? draft.id : null).finally(() => lifetime.abort());
  }
  const description = (row, workflow, editor) => tools.isEntryRow(row.node)
    ? esc(flow.entryParameters(workflow).map(item => item.name).join("、"))
    : instructions.describe(row, workflow, editor).map(part => typeof part === "string" ? esc(part) : `<span class="aw-summary-value${part.reference ? " aw-summary-reference" : part.fragment ? " aw-summary-fragment" : ""}">${esc(part.value)}</span>`).join("");
  const permissionLabel = () => tr("settings_account_profileEntitlement", "权益");
  const nameBadge = id => {
    const permission = flow.instructionPermission(id);
    return permission ? `<span class="aw-name-badge" title="${esc(flow.permissionNotice(permission, root.STI18n.text))}">${permissionLabel()}</span>` : "";
  };
  function nodeName(node) { return node.action === "notify" && node.messageType === "interactive" ? instructions.name("interactive") : instructions.name(flow.type(node)); }
  const isFold = row => row?.node?.kind === "fold";
  const isEnd = row => !!row?.marker?.startsWith("end-");
  const isBlockBoundary = row => !!row?.node && !["action", "fold"].includes(row.node.kind) && (!row.marker || isEnd(row));
  const owningBlockPath = listPath => listPath.slice(0, listPath.at(-3) === "branches" ? -3 : -1);
  const canFold = row => row?.marker === "fold-start" ? row.partner !== undefined : !!row?.node && !row.marker && row.node.kind !== "action";
  const containsFold = (row, target) => row.marker === "fold-start" && row.partner !== undefined && target.path &&
    row.listPath.every((key, index) => target.path[index] === key) &&
    target.path[row.listPath.length] > row.index && target.path[row.listPath.length] < row.partner;
  function cursorFor(row, workflow) {
    const after = (path, index) => ({ path, index: Math.min(index + 1, flow.insertionIndex(workflow, flow.pathGet(workflow, path))) });
    if (row.marker === "insert") return { path: row.listPath, index: row.index };
    if (isFold(row)) return after(row.listPath, row.index);
    if (row.marker === "else-if") return { path: [...row.path, "branches", row.branch, "steps"], index: 0 };
    if (row.marker === "else") return { path: [...row.path, "otherwise"], index: 0 };
    if (row.marker === "catch" || row.marker === "finally") return { path: [...row.path, row.marker], index: 0 };
    if (row.marker?.startsWith("end-")) return after(row.path.slice(0, -1), Number(row.path.at(-1)));
    if (row.node.kind === "if") return { path: [...row.path, "branches", 0, "steps"], index: 0 };
    if (row.node.kind !== "action") return { path: [...row.path, "body"], index: 0 };
    return after(row.listPath, row.index);
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
  function snapshot(editor) {
    editor.undo.push(flow.clone(editor.draft)); editor.redo.length = 0; editor.diagnostics = null;
    editor.insertionIssue = null; editor.saveIssue = null;
  }
  function showPairIssue(editor, selection) {
    openInspectorErrors(editor);
    if (selection) editor.selected = selection;
  }
  function restoreBoundary(editor, node, field, selection = node.id) {
    snapshot(editor);
    delete node[field];
    editor.collapsed.delete(node.id);
    editor.selected = selection; editor.reveal = true;
    closeInsertion(editor, false);
    paintEditor(editor); focusSelection(editor);
  }
  function hasBlockContents(node) {
    if (node.kind === "if") return node.branches[0].steps.length > 0 || node.branches.length > 1 || node.otherwise !== null;
    return node.body.length > 0 || node.kind === "try" && (node.catch !== null || node.finally !== null);
  }
  function enclosingIncompleteBlocks(draft, listPath) {
    const blocks = [];
    while (listPath.length > 1) {
      const path = owningBlockPath(listPath), node = flow.pathGet(draft, path);
      if (!node.draftMissingStart || !node.draftMissingEnd) break;
      listPath = path.slice(0, -1);
      blocks.push({ node, list: flow.pathGet(draft, listPath) });
    }
    return blocks;
  }
  function pruneEmptyBlocks(blocks) {
    for (const { node, list } of blocks) {
      if (!node.draftMissingStart || !node.draftMissingEnd || hasBlockContents(node)) break;
      const index = list.indexOf(node);
      if (index >= 0) list.splice(index, 1);
    }
  }
  function removeDraftStep(draft, path) {
    const listPath = path.slice(0, -1), blocks = enclosingIncompleteBlocks(draft, listPath);
    flow.pathGet(draft, listPath).splice(path.at(-1), 1);
    pruneEmptyBlocks(blocks);
  }
  const foldPartner = (list, index) => flow.foldPairs(list).get(index);
  function removeBoundary(editor, row) {
    snapshot(editor);
    if (isFold(row)) {
      const list = flow.pathGet(editor.draft, row.listPath);
      const index = foldPartner(list, row.index), partner = list[index];
      editor.collapsed.delete(row.node.id);
      if (partner) editor.collapsed.delete(partner.id);
      if (index === undefined) removeDraftStep(editor.draft, row.path);
      else if (partner.draftRemoved) {
        const blocks = enclosingIncompleteBlocks(editor.draft, row.listPath);
        list.splice(Math.max(row.index, index), 1);
        list.splice(Math.min(row.index, index), 1);
        pruneEmptyBlocks(blocks);
      } else {
        row.node.draftRemoved = true;
        showPairIssue(editor, partner.id);
      }
    } else {
      const { node, path } = row;
      node[isEnd(row) ? "draftMissingEnd" : "draftMissingStart"] = true;
      editor.collapsed.delete(node.id);
      if (node.draftMissingStart && node.draftMissingEnd && !hasBlockContents(node)) removeDraftStep(editor.draft, path);
      else showPairIssue(editor, node.draftMissingStart && !node.draftMissingEnd ? node.id + ":end" : node.id);
    }
    paintEditor(editor); focusSelection(editor);
  }
  async function removeNode(state, editor, row, entireBlock = false) {
    if (!entireBlock && (isFold(row) || isBlockBoundary(row))) return removeBoundary(editor, row);
    if (["else-if", "else", "catch", "finally"].includes(row.marker)) {
      const title = instructions.name(instructions.key(row));
      if (!await confirm(state, tr("workflow_ui_delete_branch", "删除分支"), tr("workflow_format_delete_branch", "将删除“$name$”分支及其内部全部步骤，可在保存前撤销。", { name: title }))) return;
      snapshot(editor);
      if (row.marker === "else-if") row.node.branches.splice(row.branch, 1);
      else row.node[row.marker === "else" ? "otherwise" : row.marker] = null;
      const listPath = row.path.slice(0, -1);
      pruneEmptyBlocks([{ node: row.node, list: flow.pathGet(editor.draft, listPath) }, ...enclosingIncompleteBlocks(editor.draft, listPath)]);
      tools.clearEntryData(editor.draft);
      editor.selected = row.node.id; paintEditor(editor); focusSelection(editor); return;
    }
    const title = entireBlock ? tr("workflow_ui_delete_whole_block", "删除整个流程块") : tr("workflow_ui_delete_action", "删除指令");
    if (!await confirm(state, title, row.node.kind === "action" ? tr("workflow_format_delete_action", "将删除“$name$”，可在保存前撤销。", { name: nodeName(row.node) }) : tr("workflow_format_delete_block", "将删除“$name$”及其内部全部步骤，可在保存前撤销。", { name: nodeName(row.node) }))) return;
    snapshot(editor); removeDraftStep(editor.draft, row.path); tools.clearEntryData(editor.draft); paintEditor(editor); focusSelection(editor);
  }
  function moveNode(editor, source, destination) {
    if (!source?.path || !destination) return;
    if (destination.path.slice(0, source.path.length).join(".") === source.path.join(".")) throw new Error(tr("workflow_ui_a_block_cannot_be_moved_into_itself", "不能把流程块移入自身"));
    const listPath = source.path.slice(0, -1), from = flow.pathGet(editor.draft, listPath), to = flow.pathGet(editor.draft, destination.path), index = Number(source.path.at(-1));
    const target = destination.index - (from === to && index < destination.index ? 1 : 0);
    if (from === to && target === index) return;
    const blocks = enclosingIncompleteBlocks(editor.draft, listPath);
    snapshot(editor); const [node] = from.splice(index, 1); to.splice(target, 0, node);
    pruneEmptyBlocks(blocks);
    revealNode(editor, node.id);
  }
  function focusSelection(editor) {
    const index = editor.rows.findIndex(row => row.key === editor.selected);
    (editor.root.querySelector(`[data-key="${CSS.escape(editor.selected)}"]`) || editor.root.querySelector(`.aw-gap[data-row="${index}"] button`))?.focus({ preventScroll: true });
  }
  function closeInsertion(editor, repaint = true) {
    root.STSearchCombo.closeSearchCombo(editor.root);
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
    editor.insertion = { key: row.key, before, depth: row.depth + (inside ? 1 : 0), query: "" };
    paintEditor(editor);
    const insertionRow = editor.root.querySelector(".aw-insert-row");
    insertionRow.querySelector("#aw-command-search").focus({ preventScroll: true });
    insertionRow.scrollIntoView({ block: "nearest" });
    root.STSearchCombo.openSearchCombo(insertionRow);
  }
  function pickerCatalog(context) {
    const catalog = editorCatalog(context), quick = new Set(["log", "comment"]);
    const commands = catalog.filter(item => !quick.has(item.id));
    const index = commands.findIndex(item => item.id === "get");
    commands.splice(index < 0 ? 0 : index, 0, ...catalog.filter(item => quick.has(item.id)));
    return commands;
  }
  function commandComboHtml(editor) {
    const items = pickerCatalog(editor.context).map(item => {
      const label = instructions.name(item.id), category = instructions.schemaLabel(item.category), hint = instructions.hint(item.id);
      return { value: item.id, label, category, hint, search: [label, category, instructions.schemaLabel(item.group), hint, item.id].join(" ") };
    });
    return root.STSearchCombo.searchComboHtml(items, {
      id: "aw-command-search", label: tr("workflow_ui_insert_action", "插入指令"), listLabel: tr("workflow_ui_available_actions", "可插入的指令"),
      text: editor.insertion.query, placeholder: tr("workflow_ui_type_or_select_an_action", "输入或选择指令"),
      emptyLabel: tr("workflow_ui_no_matching_actions", "没有匹配的指令"), modal: true, action: true,
      listClass: "aw aw-command-picker", optionClass: "aw-candidate",
      renderOption: item => root.STDomUtils.trustedHTML(`${commandIcon(item.value)}<span><span>${esc(item.label)}${nameBadge(item.value)}</span><small>${esc(item.category)} · ${esc(item.hint)}</small></span>`, "workflow-command-option"),
    });
  }
  function paintEditor(editor) {
    editor.cancelDrag?.();
    checkEditorSites(editor);
    const { root: node, draft } = editor, canvas = node.querySelector(".aw-canvas"), scroll = canvas.scrollTop;
    const focused = node.getRootNode().activeElement, activeRow = focused?.closest?.("[data-key]"), activeAction = focused?.dataset.aw;
    root.STSearchCombo.closeSearchCombo(node);
    const previousIndex = editor.rows.findIndex(row => row.key === editor.selected);
    const rowErrors = new Map();
    for (const error of editorDiagnostics(editor)) {
      const rowKey = error.rowKey || error.nodeId;
      if (rowKey && error.severity !== "warning" && !rowErrors.has(rowKey)) rowErrors.set(rowKey, error);
    }
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
    const insertRow = () => `<div class="aw-insert-row" data-insert-row style="--aw-depth:${editor.insertion.depth}">${commandComboHtml(editor)}${iconButton("insert-cancel", tr("workflow_ui_cancel_insertion", "取消插入"), "x")}</div>`;
    html(canvas, editor.rows.map((row, index) => {
      const inserting = editor.insertion?.key === row.key;
      if (row.marker === "insert") {
        if (inserting) return insertRow();
        if (row.key !== "root-gap") return "";
        return `<div class="aw-gap aw-end-gap" data-row="${index}"><button type="button" data-aw="select-gap"><span class="aw-end-plus">${icon("plus")}</span>${esc(tr("workflow_ui_add_an_action", "点击添加指令"))}</button></div>`;
      }
      const key = instructions.key(row), title = row.placeholder ? tr("workflow_draft_missing_both", "流程块缺少开始和结束指令") :
        row.marker === "fold-start" ? tr("workflow_ui_start_fold", "折叠开始") : row.marker === "fold-end" ? tr("workflow_ui_end_fold", "折叠结束") : instructions.name(key);
      const guides = Array.from({ length: row.depth + 1 }, (_, level) => `<span class="aw-indent" style="--aw-level:${level}"></span>`).join("");
      const collapsed = editor.collapsed.has(row.node.id);
      const fold = canFold(row) ? iconButton("collapse", collapsed ? tr("workflow_ui_expand_block", "展开流程块") : tr("workflow_ui_collapse_block", "折叠流程块"), collapsed ? "chevron-right" : "chevron-down", `aria-expanded="${!collapsed}"`) : "";
      const nodeIcon = row.marker ? `<span class="aw-node-icon">${commandIcon(key)}</span>` : `<button type="button" class="aw-node-icon aw-handle" data-aw="node-drag" aria-label="${esc(tr("workflow_format_move", "移动 $name$，Alt 加方向键移动或调整层级", { name: title }))}" title="${esc(tr("workflow_format_drag", "拖动 $name$", { name: title }))}">${commandIcon(key)}</button>`;
      const disabled = row.marker === "end-if" ? row.node.endDisabled : row.node.disabled;
      const error = rowErrors.get(row.key);
      const errorMarker = error ? `<span class="aw-error-marker" role="img" aria-label="${esc(tr("common_error", "错误"))}" title="${esc(view().errorCaption(error))}">${icon("alert-triangle")}</span>` : "";
      const summary = row.placeholder ? esc(instructions.name(key)) : isFold(row) ? esc(row.node.name || (row.marker === "fold-start" ? tr("workflow_ui_untitled_fold", "未命名折叠区域") : "")) : description(row, draft, editor);
      const content = key === "comment"
        ? `<div class="aw-note-card aw-standalone-note">${nodeIcon}<span class="aw-note-text aw-selectable-text">${summary}${errorMarker}</span></div>`
        : `${nodeIcon}<div class="aw-line-copy"><strong>${esc(title)}${nameBadge(key)}${errorMarker}</strong>${summary ? `<small><span class="aw-selectable-text">${summary}</span></small>` : ""}</div>`;
      const attachment = !row.marker && row.node.note
        ? `<span class="aw-note-card aw-node-note" title="${esc(row.node.note)}">${icon("message")}<span class="aw-note-text aw-selectable-text">${esc(row.node.note)}</span></span>` : "";
      return (inserting && editor.insertion.before ? insertRow() : "") + `<div class="aw-line ${row.marker ? "aw-marker" : ""}${disabled ? " aw-instruction-disabled" : ""}${key === "comment" ? " aw-comment-line" : ""}" data-row="${index}" data-key="${esc(row.key)}" role="option" tabindex="0" aria-selected="${editor.selected === row.key}" ${error ? 'aria-invalid="true"' : ""} style="--aw-depth:${row.depth}">
        ${guides}<span class="aw-number">${numbers.get(row.key)}</span><span class="aw-fold">${fold}</span>
        <div class="aw-content">${content}${attachment}</div>
        ${!row.placeholder && (!row.marker || isEnd(row) || isFold(row)) ? `<span class="aw-row-delete">${iconButton("node-delete", isFold(row) ? tr("workflow_ui_remove_fold_marker", "移除折叠标记") : tr("common_delete", "删除") + " " + title, "trash")}</span>` : "<span></span>"}
        ${index === 0 ? `<button type="button" class="aw-insert-control" data-aw="insert" data-position="before" aria-label="${esc(tr("workflow_ui_insert_action_above", "在上方插入指令"))}" title="${esc(tr("workflow_ui_insert_action_above", "在上方插入指令"))}">` + icon("plus") + '</button>' : ""}
        <button type="button" class="aw-insert-control" data-aw="insert" aria-label="${esc(tr("workflow_ui_insert_action_below", "在下方插入指令"))}" title="${esc(tr("workflow_ui_insert_action_below", "在下方插入指令"))}">${icon("plus")}</button></div>` + (inserting && !editor.insertion.before ? insertRow() : "");
    }).join(""));
    canvas.scrollTop = scroll;
    if (activeRow && !editor.insertion) {
      const row = canvas.querySelector(`[data-key="${CSS.escape(editor.selected)}"]`) || canvas.querySelector(`[data-key="${CSS.escape(activeRow.dataset.key)}"]`);
      (activeAction ? row?.querySelector(`[data-aw="${activeAction}"]`) : row)?.focus({ preventScroll: true });
    }
    if (editor.reveal) { canvas.querySelector(`[data-key="${CSS.escape(editor.selected)}"]`)?.scrollIntoView({ block: "nearest" }); editor.reveal = false; }
    const toolbar = { undo: !!editor.undo.length, redo: !!editor.redo.length, "expand-all": canExpand, "collapse-all": canCollapse };
    for (const [action, enabled] of Object.entries(toolbar)) node.querySelector(`[data-aw="${action}"]`).setAttribute("aria-disabled", String(!enabled));
    node.querySelector('[data-aw="item-note"]').toggleAttribute("data-has-note", !!editor.draft.note?.trim());
    paintInspector(editor);
  }
  async function editFoldName(state, name = "") {
    let input;
    const result = await state.ctx.dialog(state.shadow, {
      title: tr("workflow_ui_start_fold", "折叠开始"), subtitle: instructions.hint("fold-start"), icon: instructions.iconUrl("fold-start"), iconClass: instructions.iconTone("fold-start"), className: "aw-param-dialog", form: true,
      isDirty: () => !!input && input.value.trim() !== name,
      render: node => {
        html(node, `<div class="aw aw-form aw-grid">${prop(tr("workflow_ui_fold_name", "折叠区域名称"), "name", name)}</div>`);
        input = node.querySelector("input");
      },
      actions: [{ id: "cancel", label: tr("common_cancel", "取消") }, { id: "save", label: tr("common_confirm", "确定"), primary: true }],
    });
    return result === "save" ? input.value.trim() : null;
  }
  async function addFold(state, editor, key, cursor, selected) {
    const edge = key === "fold-start" ? "start" : "end", list = flow.pathGet(editor.draft, cursor.path);
    if (isFold(selected) && selected.node.edge !== edge) {
      const selectedList = flow.pathGet(editor.draft, selected.listPath), partner = selectedList[foldPartner(selectedList, selected.index)];
      if (partner?.draftRemoved) return restoreBoundary(editor, partner, "draftRemoved");
    }
    const adjacent = [list[cursor.index], list[cursor.index - 1]].find(item => item?.draftRemoved && item.edge === edge);
    if (adjacent) return restoreBoundary(editor, adjacent, "draftRemoved");
    const node = { id: flow.numericId("fold-", [...flow.walk(editor.draft.steps)]), kind: "fold", edge };
    let startIndex = -1;
    closeInsertion(editor, false);
    try {
      if (edge === "start") {
        node.name = await editFoldName(state);
        if (node.name === null) return;
        // 已有结束标记保留原配对，新的开始行等自己的结束标记。
        node.draftUnpaired = true;
      } else {
        const existing = flow.foldPairs(list);
        startIndex = list.findLastIndex((item, index) => index < cursor.index && item.kind === "fold" && item.edge === "start" && !item.draftRemoved && !existing.has(index));
        if (startIndex < 0) throw insertionError(tr("workflow_ui_insert_an_unmatched_fold_start_in_this_branch_first", "请在同一分支先插入尚未结束的折叠开始"));
        const trial = list.slice();
        trial[startIndex] = { ...trial[startIndex] }; delete trial[startIndex].draftUnpaired;
        trial.splice(cursor.index, 0, node);
        const pairs = flow.foldPairs(trial), shifted = index => index < cursor.index ? index : index + 1;
        if (pairs.get(cursor.index) !== startIndex || [...existing].some(([from, to]) => pairs.get(shifted(from)) !== shifted(to)))
          throw insertionError(tr("workflow_draft_fold_crossed", "折叠区域的起止位置不能交叉"));
      }
      snapshot(editor);
      if (startIndex >= 0) delete list[startIndex].draftUnpaired;
      list.splice(cursor.index, 0, node);
      editor.collapsed.delete(node.id);
      editor.selected = node.id;
    } finally {
      if (editor.selected === node.id) revealNode(editor, node.id);
      else { paintEditor(editor); focusSelection(editor); }
    }
  }
  function appendAiToolTemplate(draft, cursor, first, localize) {
    const steps = flow.pathGet(draft, cursor.path);
    const add = (key, list) => {
      const node = flow.createNode(key, draft, localize);
      list.push(node);
      return node;
    };
    const loop = flow.createNode("while", draft, localize);
    steps.splice(cursor.index + 1, 0, loop);
    const ref = id => flow.reference("variable", id);
    loop.condition = { op: "notEmpty", left: ref(first.toolRequestsOutput) };
    const results = add("list", loop.body);
    const each = add("foreach", loop.body);
    each.value = ref(first.toolRequestsOutput);
    const tool = add("tool-call", each.body);
    tool.toolRequest = ref(each.item);
    const append = add("append", each.body);
    const oldAppendOutput = append.output;
    append.value = ref(results.output);
    append.item = ref(tool.output);
    append.output = results.output;
    const next = add("ai-call", loop.body);
    const oldAiOutput = next.output, nextId = next.id;
    Object.assign(next, flow.clone(first), { id: nextId, context: ref(first.contextOutput), toolResults: ref(results.output) });
    draft.variables = draft.variables.filter(item => item.id !== oldAppendOutput && item.id !== oldAiOutput);
  }
  const insertionError = message => Object.assign(new Error(message), { code: "WORKFLOW_INSERT_INVALID" });
  function noteInsertionIssue(editor, error, instruction) {
    editor.insertionIssue = { message: view().validationCaption(error), instruction };
    openInspectorErrors(editor);
  }
  async function insertInstruction(state, editor, key, drop = null) {
    if (editor.insertionIssue) { editor.insertionIssue = null; paintInspector(editor); }
    try {
      return await addInstruction(state, editor, key, drop);
    } catch (error) {
      if (error.code !== "WORKFLOW_INSERT_INVALID") view().reportFailure(error, null);
      if (editor.signal.aborted) return;
      noteInsertionIssue(editor, error, key);
      closeInsertion(editor, false);
      paintEditor(editor);
      editor.root.querySelector('[data-inspector-tab="errors"]').focus({ preventScroll: true });
    }
  }
  async function addInstruction(state, editor, key, drop) {
    const entry = key === tools.entryKey(editor.draft);
    if (!flow.instructionAvailable(key, editor.context)) throw insertionError(tr("workflow_error_tool_instruction", "此处不能使用该指令"));
    const selected = editor.rows.find(row => row.key === editor.selected) || editor.rows.at(-1);
    const repairRow = drop ? editor.rows.find(row => row.key === drop.rowKey) : selected;
    if (isBlockBoundary(repairRow) && repairRow.node.draftMissingStart &&
        key === instructions.key({ node: repairRow.node, marker: "" }))
      return restoreBoundary(editor, repairRow.node, "draftMissingStart");
    if (flow.markers.has(key)) {
      const matches = node => key.includes("if") || key === "else" ? node.kind === "if" : key === "end-loop" ? flow.loops.has(node.kind) : node.kind === "try";
      const block = key.startsWith("end-") && isBlockBoundary(repairRow) && matches(repairRow.node) && repairRow.node.draftMissingEnd
        ? repairRow.node : ancestor(drop ? { ...editor, cursor: drop } : editor, matches);
      if (!block) throw insertionError(tr("workflow_ui_select_the_corresponding_if_loop_or_try_block_first", "请先选择对应的 IF、循环或 Try 块"));
      if (key.startsWith("end-") && block.draftMissingEnd) return restoreBoundary(editor, block, "draftMissingEnd", block.id + ":end");
      if (["else-if", "else-if-many"].includes(key)) {
        const draft = flow.clone(editor.draft), target = [...flow.walk(draft.steps)].find(node => node.id === block.id);
        const branch = target.branches.length;
        target.branches.push({ condition: key === "else-if-many" ? { op: "all", children: [flow.comparison()] } : flow.comparison(), steps: [] });
        const pending = { ...editor, draft, rows: flow.rows(draft) };
        closeInsertion(editor, false);
        if (await editNode(state, pending, pending.rows.find(row => row.key === block.id + ":else-if:" + branch), null, editor) === "save") {
          snapshot(editor); Object.assign(editor.draft, pending.draft); editor.selected = block.id + ":else-if:" + branch; editor.collapsed.delete(block.id);
        }
        paintEditor(editor); return;
      }
      if (!key.startsWith("end-")) snapshot(editor);
      if (key === "else") block.otherwise ??= [];
      else if (key === "catch") { block.catch ??= []; block.error ||= flow.variable(editor.draft, tr("workflow_ui_exception", "异常"), "object"); }
      else if (key === "finally") block.finally ??= [];
      else editor.selected = block.id + ":end";
      closeInsertion(editor, false); editor.collapsed.delete(block.id); paintEditor(editor); return;
    }
    const cursor = drop || editor.cursor || cursorFor(selected, editor.draft);
    if (key === "fold-start" || key === "fold-end") return addFold(state, editor, key, cursor, repairRow);
    // 新指令及自动创建的输出变量只进入临时草稿，确认参数后一起提交
    const localize = root.STI18n.forLocale(root.STI18n.locale());
    const draft = flow.clone(editor.draft), node = entry ? tools.createEntryRow(draft) : flow.createNode(key, draft, localize);
    const duplicate = entry && [...flow.walk(draft.steps)].some(item => item.action === key);
    if (duplicate) node.draftDuplicateEntry = true;
    flow.pathGet(draft, cursor.path).splice(cursor.index, 0, node);
    const pending = { ...editor, draft, rows: flow.rows(draft), undo: [], redo: [], originalVariableIds: new Set(editor.draft.variables.map(item => item.id)) };
    closeInsertion(editor, false);
    try {
      if (!drop && !duplicate && !(node.kind === "action" && ["break", "continue", "stop"].includes(node.action)) &&
          await editNode(state, pending, pending.rows.find(row => row.key === node.id), null, editor) !== "save") return;
      snapshot(editor); Object.assign(editor.draft, pending.draft);
      editor.selected = node.id;
      if (duplicate) openInspectorErrors(editor);
    } finally {
      if (editor.selected === node.id) revealNode(editor, node.id);
      else { paintEditor(editor); focusSelection(editor); }
    }
  }
  function editorCatalog(context) {
    return instructions.catalog.filter(({ id }) => flow.instructionAvailable(id, context));
  }
  function palette(context) {
    const catalog = editorCatalog(context);
    const commands = rows => rows.map(item => `<button type="button" class="aw-palette-entry" data-instruction="${item.id}" title="${esc(instructions.hint(item.id))}">${commandIcon(item.id)}<span>${esc(instructions.name(item.id))}${nameBadge(item.id)}</span></button>`).join("");
    const section = (name, symbol, content, type = "group") => `<details data-${type}="${esc(name)}"><summary>${icon("chevron-right", "aw-category-caret")}${icon(symbol, "aw-category-icon")}${esc(instructions.schemaLabel(name))}</summary>${content}</details>`;
    const categoryContent = category => {
      const items = catalog.filter(item => item.category === category);
      const groups = Object.keys(instructions.groups).filter(group => items.some(item => item.group === group));
      return commands(items.filter(item => !item.group)) + groups.map(group =>
        section(group, instructions.groups[group], commands(items.filter(item => item.group === group)))).join("");
    };
    const composition = `<details data-compositions><summary>${icon("chevron-right", "aw-category-caret")}${icon("layout-list", "aw-category-icon")}${esc(tr("workflow_composition_group", "组合指令"))}</summary>
      ${[false, true].map(http => `<button type="button" class="aw-palette-entry" data-aw="composition" data-composition="${http ? "http" : "ai"}" title="${esc(tr("workflow_composition_group", "组合指令"))}">${icon("layout-list", "aw-icon-instruction")}<span>${esc(compositionTitle(http))}</span></button>`).join("")}</details>`;
    return composition + Object.entries(instructions.categories).map(([category, symbol]) => {
      const content = category === "其他"
        ? Object.entries(instructions.otherCategories).filter(([name]) => catalog.some(item => item.category === name))
          .map(([name, groupIcon]) => section(name, groupIcon, categoryContent(name))).join("")
        : categoryContent(category);
      return content ? section(category, symbol, content, "category") : "";
    }).join("");
  }
  const searchTerm = value => value.trim().toLocaleLowerCase();
  function openInspectorErrors(editor) {
    editor.panel = "errors"; editor.panelClosed = false;
    editor.searches.errors.query = "";
  }
  function inspectorSearch(editor, pane, label) {
    const { open, query } = editor.searches[pane];
    const id = pane === "variables" ? "aw-variable-search" : "aw-" + pane + "-search";
    return `<div class="aw-inspector-find" data-inspector-search="${pane}">
      ${iconButton("inspector-search", label, "search", `aria-expanded="${open}" aria-controls="${id}"`)}
      <input type="search" class="aw-inspector-search" id="${id}" aria-label="${esc(label)}" placeholder="${esc(label)}" value="${esc(query)}" ${pane === "variables" ? "data-variable-search" : ""} ${open ? "" : "inert"}>
    </div>`;
  }
  function filterInspector(editor, pane) {
    if (pane === "debug") {
      const list = editor.root.querySelector("[data-debug-log]");
      if (list) delete list.dataset.offset;
      if (editor.run) editor.run.logPage = undefined;
      debugEntries(editor);
      return;
    }
    const panel = editor.root.querySelector(".aw-inspector-panel"), query = searchTerm(editor.searches[pane].query);
    const variable = pane === "variables", rows = panel.querySelectorAll("tbody tr");
    let matches = 0;
    for (const row of rows) {
      const text = variable ? row.querySelector(".aw-variable-name").textContent : [...row.cells].map(cell => cell.textContent).join(" ");
      row.hidden = !searchTerm(text).includes(query);
      if (!row.hidden) matches++;
    }
    const empty = panel.querySelector("[data-inspector-empty]");
    empty.hidden = matches > 0;
    if (!matches) empty.textContent = variable
      ? rows.length ? tr("workflow_ui_no_matching_variables", "没有匹配的变量") : tr("workflow_ui_no_variables_yet", "暂无变量")
      : rows.length ? tr("workflow_ui_no_matching_errors", "没有匹配的错误或警告") : tr("workflow_ui_no_errors", "暂无错误");
  }
  function setInspectorSearch(editor, search, open) {
    const pane = search.dataset.inspectorSearch, state = editor.searches[pane];
    const input = search.querySelector("input"), toggle = search.querySelector("button");
    state.open = open;
    state.query = input.value = "";
    toggle.setAttribute("aria-expanded", String(open));
    if (!open) toggle.focus({ preventScroll: true });
    input.inert = !open;
    if (open) input.focus({ preventScroll: true });
    filterInspector(editor, pane);
  }
  function permissionMessage(action, fields) {
    return root.STMessageBus.request({ type: "AI_GATEWAY_PERMISSION_" + action, purpose: "workflow-http", ...fields }, { timeoutMs: 10000, logFailures: false }).then(result => {
      if (result?.success !== true) throw new Error(result?.error || tr("workflow_ui_site_authorization_failed", "站点授权操作失败"));
      return result;
    });
  }
  const usesNativePermissionRequest = () => root.location.protocol === "chrome-extension:" && typeof root.chrome.permissions?.request === "function";
  async function authorizeSite(origin, closeSignal) {
    if (usesNativePermissionRequest()) {
      return root.chrome.permissions.request({ origins: [root.STAI.hostPermissionPattern(origin)] });
    }
    const requestId = root.STLoggerFactory.createRequestId();
    const signal = AbortSignal.any([...(closeSignal ? [closeSignal] : []), AbortSignal.timeout(300000)]);
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
      if (!subscription) throw new Error(tr("workflow_ui_this_page_cannot_receive_the_authorization_result", "当前页面无法接收站点授权结果"));
      signal.addEventListener("abort", stop, { once: true });
      const operation = await permissionMessage("OPEN", { host: origin, requestId });
      opened = operation.opened === true;
      if (!opened) throw new Error(tr("workflow_ui_could_not_open_the_authorization_page", "无法打开站点授权页"));
      const outcome = await result;
      if (closeSignal?.aborted) return false;
      if (!outcome) throw new Error(tr("workflow_ui_authorization_timed_out_try_again", "等待站点授权超时，请重新操作"));
      return outcome.granted === true;
    } finally {
      signal.removeEventListener("abort", stop);
      subscription?.dispose();
      if (opened && signal.aborted) await permissionMessage("CANCEL", { requestId });
    }
  }

  function diagnosticSummary(entries) {
    const warnings = entries.filter(entry => entry.severity === "warning").length, errors = entries.length - warnings;
    return [errors && tr("workflow_format_errors", "$count$ 个错误", { count: errors }), warnings && tr("workflow_format_warnings", "$count$ 个警告", { count: warnings })].filter(Boolean).join(" · ");
  }
  function instructionPositions(locations) {
    return locations.sort((a, b) => a.number - b.number).map(({ row, number }) =>
      `<button type="button" class="aw-variable-name" data-aw="instruction-locate" data-node-id="${esc(row.node.id)}" aria-label="${esc(tr("workflow_format_locate", "定位第 $count$ 行", { count: number }))}">${number}</button>`
    ).join("、") || "—";
  }
  function diagnosticRow(entry, index, lines) {
    const related = [...new Set(entry.nodeIds || [entry.nodeId])].map(id => lines.get(id)).filter(Boolean);
    const names = [...new Set(related.map(({ row }) => instructions.name(instructions.key(row))))];
    const instruction = names.join(" / ") || (entry.instruction ? instructions.name(entry.instruction) : "—");
    let content;
    if (entry.origin && entry.nodeIds) {
      content = `${esc(entry.origin)} ${esc(tr("workflow_site_not_granted", "未授权"))}${button("site-authorize",
        "[" + tr("workflow_click_authorize", "点我授权") + "]", `class="aw-variable-name" data-origin="${esc(entry.origin)}"`)}`;
    } else {
      const message = esc(view().errorCaption(entry));
      const caption = entry.severity === "warning" ? `<span class="aw-diagnostic-warning">${esc(tr("messageCenter_level_warning", "警告"))}</span> ${message}` : message;
      content = related.length ? `<button type="button" class="aw-table-link" data-aw="error-locate" data-error="${index}">${caption}</button>` :
        `<span class="aw-diagnostic-error">${caption}</span>`;
    }
    return `<tr><td>${esc(instruction)}</td><td>${content}</td><td>${instructionPositions(related)}</td></tr>`;
  }
  const executesTool = node => node.action === "tool-call" && (node.toolMode === "registered" || node.toolMode === "request");
  const requestFingerprint = (node, library) => JSON.stringify([node.action, node.url, node.code, node.serviceId,
    node.toolMode, node.toolId, node.toolArgs, node.toolRequest, node.libraryId, node.libraryInputs, library?.revision, library?.executionId]);
  function rememberSiteIssue(editor, node, error, libraryVersion) {
    if (error.code !== "WORKFLOW_HTTP_PERMISSION_REQUIRED" && error.code !== "AI_HOST_PERMISSION_REQUIRED") return;
    const url = flow.httpUrl(error.origin);
    if (!url) return;
    const key = JSON.stringify([node.id, url.origin]);
    editor.runtimeSites.set(key, { nodeId: node.id, origin: url.origin, fingerprint: requestFingerprint(node, libraryVersion) });
    openInspectorErrors(editor);
    checkEditorSites(editor, true);
  }
  function checkEditorSites(editor, refresh = false) {
    const nodes = [...flow.walk(editor.draft.steps, true)].filter(node =>
      ["http-request", "script", "ai-call", "library-call"].includes(node.action) || executesTool(node));
    const libraries = new Map();
    if (nodes.some(node => node.action === "library-call"))
      for (const library of editor.customLibraries) libraries.set(library.id, library);
    if (editor.runtimeSites.size) {
      const byId = new Map(nodes.map(node => [node.id, node]));
      for (const [id, site] of editor.runtimeSites) {
        const node = byId.get(site.nodeId);
        if (!node || requestFingerprint(node, libraries.get(node.libraryId)) !== site.fingerprint) editor.runtimeSites.delete(id);
      }
    }
    const inputs = nodes.map(node => {
      if (node.action === "script") return editor.context === "tool" ? [] : [node.id, "script", node.code];
      if (node.action === "http-request") return [node.id, "http", flow.activeValue(node.url), editor.inTool ? node.origin : null];
      if (node.action === "library-call" || node.action === "tool-call") {
        const { steps, libraryVersions, toolVersions } = previewPlan({ id: editor.draft.id, steps: [node] },
          { libraries: editor.customLibraries, tools: editor.toolLibrary });
        const origins = steps.filter(step => step.action === "http-request").map(previewHttpOrigin);
        return [node.id, "call", origins, libraryVersions, toolVersions];
      }
      return [node.id, "ai", root.STAI.findService(editor.registry, node.serviceId)?.host];
    });
    const key = JSON.stringify([inputs, [...editor.runtimeSites]]);
    if (!refresh && key === editor.siteKey) return;
    editor.siteKey = key;
    const sequence = (editor.siteSequence || 0) + 1;
    editor.siteSequence = sequence;
    const definitions = editor.definitionSequence;
    return (async () => {
      const groups = new Map();
      const add = (nodeId, origin) => {
        if (!origin) return;
        const site = root.STAI.hostPermissionPattern(origin).slice(0, -2);
        if (!site) return;
        if (!groups.has(site)) groups.set(site, new Set());
        groups.get(site).add(nodeId);
      };
      const needsCode = inputs.some(([, kind, value]) => kind === "script" || kind === "http" && value?.expression);
      const code = needsCode ? await import(root.chrome.runtime.getURL("settings/pages/workflow-code.js")) : null;
      for (const [nodeId, kind, value, toolOrigin] of inputs) {
        if (kind === "script") for (const origin of code.scriptNetwork(value).origins) add(nodeId, origin);
        if (kind === "http") add(nodeId, flow.staticHttpOrigin(value) || toolOrigin || (value?.expression && code.requestSite(value.expression)));
        if (kind === "ai") add(nodeId, flow.httpUrl(value)?.origin);
        if (kind === "call") for (const origin of value) add(nodeId, origin);
      }
      for (const { nodeId, origin } of editor.runtimeSites.values()) add(nodeId, origin);
      const unchanged = nodes.filter(node => editor.savedRequests?.get(node.id) === requestFingerprint(node)).map(node => node.id);
      const workflow = !editor.inTool && editor.originalId && unchanged.length ?
        { id: editor.originalId, epoch: editor.epoch, revision: editor.draft.revision, nodes: unchanged } : null;
      const { checked, recent } = groups.size || workflow ? await view().rpc("site-permissions", { hosts: [...groups.keys()], workflow }) : { checked: [], recent: [] };
      for (const [nodeId, origin] of recent) add(nodeId, origin);
      if (sequence !== editor.siteSequence || definitions !== editor.definitionSequence || editor.signal.aborted || !editor.root.isConnected) return false;
      editor.siteIssues = checked.filter(([, granted]) => !granted).map(([origin]) => {
        const nodeIds = [...groups.get(origin)];
        return { origin, nodeIds, nodeId: nodeIds[0], severity: "warning", message: origin + " " + tr("workflow_site_not_granted", "未授权") };
      });
      editor.diagnostics = null;
      paintInspector(editor, { issuesOnly: true });
      return true;
    })().catch(error => {
      if (!editor.signal.aborted && editor.root.isConnected && sequence === editor.siteSequence && definitions === editor.definitionSequence) {
        editor.siteKey = null;
        reportFailure(error, null, editor);
      }
      return false;
    });
  }
  function editorDiagnostics(editor) {
    return editor.diagnostics ??= [...tools.diagnostics(editor.draft), ...(editor.context === "tool" ? model.toolDiagnostics(editor.draft) : []),
      ...libraryIssues(editor.draft, editor.customLibraries),
      ...promptIssues(editor.draft, editor.plans, editor.registry),
      ...toolIssues(editor.draft, editor.toolLibrary), ...tools.permissionWarnings(tools.lines(editor.draft), editor.membership), ...editor.siteIssues];
  }
  function libraryIssues(workflow, libraries = []) {
    const byId = new Map(libraries.map(library => [library.id, library]));
    return [...flow.walk(workflow.steps)].flatMap(node => {
      if (node.action !== "library-call") return [];
      const issue = model.libraryBindingIssue(byId.get(node.libraryId), node, workflow);
      return issue ? [Object.assign(issue, { nodeId: node.id })] : [];
    });
  }
  function inspectorIssues(editor) {
    return [...[editor.insertionIssue, editor.saveIssue].filter(Boolean), ...editorDiagnostics(editor)];
  }
  const debugPageSize = 100;
  const debugLogContent = new WeakMap();

  function isStructuredLog(text) {
    if (!/^[ \t\r\n]*[\[{]/.test(text)) return false;
    try { JSON.parse(text); }
    catch (error) { if (error instanceof SyntaxError) return false; throw error; }
    return true;
  }

  function formatStructuredLog(text) {
    // Adjust whitespace between JSON tokens without rewriting numbers, keys or strings.
    const output = [];
    let depth = 0, previous = "";
    for (const [token] of text.matchAll(/"[^"\\]*(?:\\[\s\S][^"\\]*)*"|[{}\[\],:]|[^ \t\r\n{}\[\],:"]+/g)) {
      const opens = token === "{" || token === "[";
      const closes = token === "}" || token === "]";
      const afterOpen = previous === "{" || previous === "[";
      if (closes) depth--;
      if (closes ? !afterOpen : afterOpen || previous === ",") {
        // Bound indentation in very deeply nested input; every token is still shown.
        output.push("\n", "  ".repeat(Math.min(depth, 64)));
      }
      output.push(token === ":" ? ": " : token);
      if (opens) depth++;
      previous = token;
    }
    return output.join("");
  }

  async function showDebugLog(state, editor, control) {
    const text = debugLogContent.get(control);
    if (text === undefined || editor.viewingDebugLog) return;
    editor.viewingDebugLog = true;
    let viewer;
    try {
      const { mountLogViewer } = await import(root.chrome.runtime.getURL("settings/pages/workflow-code.js"));
      if (editor.signal.aborted || !editor.root.isConnected) return;
      const title = tr("workflow_ui_log_message", "日志内容");
      const formatLabel = tr("workflow_ui_log_format_view", "格式化查看");
      let displayedText = text, formattedText;
      await state.ctx.dialog(state.shadow, {
        title, form: true, className: "aw-log-view-dialog", actions: [],
        initial: () => viewer.contentDOM,
        render(body) {
          const toggle = isStructuredLog(text) ? '<label><input type="checkbox" data-log-format>' + esc(formatLabel) + '</label>' : "";
          html(body, '<div class="aw aw-log-view"><div class="aw-log-view-toolbar"><span role="status"></span>' +
            toggle + button("log-copy", tr("common_copy", "复制"), "", "copy") +
            '</div><div class="aw-log-view-editor"></div></div>');
          viewer = mountLogViewer(body.querySelector(".aw-log-view-editor"), {
            value: displayedText, label: title, root: state.shadow,
          });
          const status = body.querySelector("[role=status]");
          body.querySelector("[data-log-format]")?.addEventListener("change", event => {
            displayedText = event.target.checked ? (formattedText ??= formatStructuredLog(text)) : text;
            viewer.setValue(displayedText);
            status.textContent = "";
          });
          body.querySelector('[data-aw="log-copy"]').addEventListener("click", async () => {
            const copyText = displayedText;
            try {
              await root.navigator.clipboard.writeText(copyText);
              if (status.isConnected && copyText === displayedText)
                status.textContent = tr("workflow_ui_log_copied", "已复制日志内容");
            } catch (error) {
              reportFailure(error, null);
              if (status.isConnected && copyText === displayedText) {
                viewer.selectAll();
                status.textContent = tr("common_copyFailedManual", "复制失败，请手动复制");
              }
            }
          });
        },
      });
    } finally {
      viewer?.destroy();
      editor.viewingDebugLog = false;
      if (!editor.signal.aborted)
        (control.isConnected ? control : editor.root.querySelector('[data-inspector-tab="debug"]'))?.focus({ preventScroll: true });
    }
  }

  function matchesDebugEntry(entry, query, positions) {
    const number = positions.get(entry.nodeId)?.number;
    const line = number === undefined ? "" : tr("workflow_format_line", "第 $count$ 行", { count: number }) + " · ";
    return searchTerm(entry.label + " " + line + entry.text).includes(query);
  }
  function debugResults(editor) {
    const run = editor.run;
    if (!run) return [];
    const query = searchTerm(editor.searches.debug.query);
    if (run.query !== query) {
      run.query = query;
      run.matches = query ? run.entries.filter(entry => matchesDebugEntry(entry, query, run.positions)) : null;
    }
    return run.matches ?? run.entries;
  }
  function debugEntries(editor) {
    const list = editor.root.querySelector("[data-debug-log]");
    if (!list) return;
    const run = editor.run, panel = list.closest(".aw-inspector-panel"), doc = list.ownerDocument;
    const results = debugResults(editor);
    const pages = Math.max(1, Math.ceil(results.length / debugPageSize));
    const previousOffset = Number(list.dataset.offset);
    const focusedLog = list.contains(list.getRootNode().activeElement);
    if (run && run.logPage === undefined && previousOffset < (pages - 1) * debugPageSize && focusedLog)
      run.logPage = previousOffset / debugPageSize;
    if (run && run.logPage >= pages) run.logPage = undefined;
    const page = run?.logPage ?? pages - 1;
    const navigation = panel.querySelector(".aw-debug-pages");
    navigation.hidden = pages < 2;
    navigation.querySelector("[data-debug-page]").textContent = (page + 1) + " / " + pages;
    navigation.querySelector('[data-aw="log-prev"]').disabled = page === 0;
    navigation.querySelector('[data-aw="log-next"]').disabled = page === pages - 1;
    panel.querySelector('[data-aw="log-clear"]').disabled = !run?.entries.length;
    const empty = panel.querySelector("[data-inspector-empty]");
    empty.hidden = results.length > 0;
    if (!results.length) {
      const message = run?.entries.length ? tr("workflow_ui_no_matching_logs", "没有匹配的日志") : tr("workflow_ui_no_debug_log", "暂无调试日志");
      if (empty.textContent !== message) empty.textContent = message;
    }
    const atEnd = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 12;
    const start = page * debugPageSize;
    const changedPage = previousOffset !== start;
    if (changedPage) { list.replaceChildren(); list.dataset.offset = start; }
    const entries = results.slice(start + list.childElementCount, start + debugPageSize);
    const fragment = doc.createDocumentFragment();
    const content = entries.length && doc.createElement("template");
    if (content) html(content, '<div class="aw-debug-content"><textarea readonly rows="1" wrap="off" aria-label="' +
      esc(tr("workflow_ui_log_message", "日志内容")) + '"></textarea>' +
      iconButton("log-expand", tr("workflow_ui_expand_log", "展开日志内容"), "arrows-diagonal") + '</div>');
    for (const entry of entries) {
      const row = doc.createElement("tr");
      const level = doc.createElement("td"), timestamp = doc.createElement("td");
      const message = doc.createElement("td"), position = doc.createElement("td");
      if (entry.at) {
        const time = doc.createElement("time");
        const date = new Date(entry.at);
        time.dateTime = date.toISOString(); time.textContent = date.toLocaleTimeString(root.STI18n.intlLocale());
        timestamp.append(time);
      } else timestamp.textContent = "—";
      row.dataset.level = entry.level;
      level.textContent = entry.label;
      message.className = "aw-debug-message";
      message.append(content.content.cloneNode(true));
      message.querySelector("textarea").defaultValue = entry.text;
      debugLogContent.set(message.querySelector('[data-aw="log-expand"]'), entry.text);
      const location = run.positions.get(entry.nodeId);
      if (location) html(position, instructionPositions([location]));
      else position.textContent = "—";
      row.append(level, timestamp, message, position); fragment.append(row);
    }
    list.append(fragment);
    if (!focusedLog && run?.logPage === undefined && (changedPage || atEnd)) panel.scrollTop = panel.scrollHeight;
    else if (changedPage) panel.scrollTop = 0;
  }
  function paintDebugLog(editor, panel) {
    if (!panel.querySelector("[data-debug-log]")) {
      const positionLabel = esc(tr("workflow_ui_used_at", "使用位置"));
      html(panel, `<div class="aw-debug-head" hidden><p class="aw-debug-status" role="status"></p>
      <div class="aw-debug-pages" hidden>${iconButton("log-prev", tr("common_previousPage", "上一页"), "chevron-right")}<span data-debug-page></span>${iconButton("log-next", tr("common_nextPage", "下一页"), "chevron-right")}</div></div>
      <table class="aw-debug-log"><thead><tr>
        <th scope="col">${esc(tr("common_type", "类型"))}</th>
        <th scope="col">${esc(tr("common_time", "时间"))}</th>
        <th scope="col">${esc(tr("common_content", "内容"))}</th>
        <th scope="col" class="aw-inspector-actions" aria-label="${positionLabel}"><div class="aw-inspector-controls">
          <span>${positionLabel}</span>
          ${inspectorSearch(editor, "debug", tr("workflow_ui_search_debug_log", "搜索调试日志"))}
          ${iconButton("log-clear", tr("workflow_ui_clear_debug_log", "清空调试日志"), "trash")}
        </div></th>
      </tr></thead><tbody data-debug-log></tbody></table><div class="aw-inspector-empty" data-inspector-empty role="status"></div>`);
    }
    const run = editor.run, list = panel.querySelector("[data-debug-log]"), id = run?.id ?? "";
    if (list.dataset.debugLog !== id) {
      list.dataset.debugLog = id;
      delete list.dataset.offset;
    }
    if (run) {
      const positions = tools.lines(editor.draft);
      if (positions.size !== run.positions.size || [...positions].some(([key, { number }]) => run.positions.get(key)?.number !== number)) {
        run.positions = positions;
        delete run.query;
        delete list.dataset.offset;
      }
    }
    panel.querySelector(".aw-debug-head").hidden = !run;
    panel.querySelector(".aw-debug-status").textContent = run?.status ?? "";
    debugEntries(editor);
  }
  function paintInspector(editor, { issuesOnly = false } = {}) {
    const { root: node, draft } = editor;
    const entries = inspectorIssues(editor);
    node.querySelector("[data-count]").textContent = tr("workflow_format_action_variables", "$actions$ 条指令 · $count$ 个变量", { actions: [...flow.walk(draft.steps)].filter(step => step.kind !== "fold").length, count: draft.variables.length });
    for (const tab of node.querySelectorAll("[data-inspector-tab]")) {
      const selected = tab.dataset.inspectorTab === editor.panel; tab.setAttribute("aria-selected", String(selected)); tab.tabIndex = selected ? 0 : -1;
      if (tab.dataset.inspectorTab === "errors") tab.textContent = tr("workflow_ui_errors", "错误列表") + (entries.length ? "·" + entries.length : "");
      else if (tab.dataset.inspectorTab === "variables") tab.textContent = tr("workflow_ui_variables", "变量列表") + "·" + draft.variables.length;
    }
    if (issuesOnly && editor.panel !== "errors") return;
    const panel = node.querySelector(".aw-inspector-panel"); panel.hidden = editor.panelClosed;
    panel.setAttribute("aria-labelledby", "aw-inspector-" + editor.panel);
    node.querySelector('[data-aw="panel-toggle"]').setAttribute("aria-expanded", String(!editor.panelClosed));
    if (editor.panel === "debug") { paintDebugLog(editor, panel); return; }
    const lines = tools.lines(draft), variable = editor.panel === "variables", references = variable ? tools.index(draft) : null;
    const empty = '<div class="aw-inspector-empty" data-inspector-empty role="status"></div>';
    if (variable && !panel.querySelector(".aw-variable-table")) html(panel, `<table class="aw-variable-table"><thead><tr><th scope="col">${esc(tr("workflow_ui_variable_name", "变量名称"))}</th><th scope="col">${esc(tr("common_type", "类型"))}</th><th scope="col">${esc(tr("workflow_ui_used_at", "使用位置"))}</th><th class="aw-inspector-actions"><div class="aw-inspector-controls" role="group" aria-label="${esc(tr("workflow_ui_variable_tools", "变量工具"))}">
      ${inspectorSearch(editor, "variables", tr("workflow_ui_search_variables", "搜索变量"))}
      ${iconButton("variable-new", tr("workflow_ui_add_variable", "新增变量"), "variable-plus")}</div></th></tr></thead><tbody></tbody></table>${empty}`);
    const positionLabel = esc(tr("workflow_ui_used_at", "使用位置"));
    if (!variable && !panel.querySelector("[data-diagnostics]")) html(panel, `<table data-diagnostics><thead><tr><th scope="col">${esc(tr("messageCenter_detail_instruction", "指令"))}</th><th scope="col">${esc(tr("workflow_ui_errors_and_warnings", "错误与警告"))}</th><th scope="col" class="aw-inspector-actions aw-diagnostic-lines" aria-label="${positionLabel}"><div class="aw-inspector-controls">
      <span>${positionLabel}</span>${inspectorSearch(editor, "errors", tr("workflow_ui_search_errors", "搜索错误和警告"))}
      </div></th></tr></thead><tbody></tbody></table>${empty}<div class="aw-error" data-editor-error role="alert"></div>`);
    html(panel.querySelector("tbody"), variable ? draft.variables.map(item => {
      const uses = [...new Set((references.get(item.id) || []).map(use => use.nodeId))].map(id => lines.get(id)).filter(Boolean);
      return `<tr data-variable-id="${esc(item.id)}"><td><button type="button" class="aw-variable-name" data-aw="variable-edit">${esc(item.name)}</button></td><td>${esc(tools.typeNames[item.type])}</td><td>${instructionPositions(uses)}</td><td>${iconButton("variable-delete", tr("workflow_ui_delete_variable", "删除变量") + " " + item.name, "trash")}</td></tr>`;
    }).join("") : entries.map((entry, index) => diagnosticRow(entry, index, lines)).join(""));
    const input = panel.querySelector(".aw-inspector-search"), query = editor.searches[editor.panel].query;
    if (input.value !== query) input.value = query;
    if (!variable) panel.querySelector("[data-editor-error]").textContent = "";
    filterInspector(editor, editor.panel);
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
  async function noteDialog(state, value, title) {
    const label = tr("store_titleCustomName_noteTab", "备注");
    let input;
    const answer = await state.ctx.dialog(state.shadow, { title, className: "aw-automation-dialog", form: true,
      initial: node => node.querySelector("[data-note]"),
      render: node => {
        html(node, `<div class="aw aw-form"><textarea data-note rows="4" aria-label="${esc(label)}"></textarea></div>`);
        input = node.querySelector("[data-note]");
        input.value = value;
      },
      actions: [{ id: "cancel", label: tr("common_cancel", "取消") }, { id: "save", label: tr("common_confirm", "确定"), primary: true }],
    });
    return answer === "save" ? input.value : null;
  }
  function itemNoteButton(note) {
    return iconButton("item-note", tr("store_titleCustomName_noteTab", "备注"), "notebook", note?.trim() ? 'data-has-note="true"' : "");
  }
  async function editNote(state, editor, row) {
    const value = row.node.note ?? "";
    const note = await noteDialog(state, value, tr("workflow_ui_action_comment", "指令备注"));
    if (note === null || note === value) return;
    snapshot(editor);
    if (note) row.node.note = note;
    else delete row.node.note;
    paintEditor(editor);
  }
  function available(editor, action, row) {
    if (action === "undo" || action === "redo") return !!editor[action].length;
    if (action === "paste") return !!clipboard;
    if (action === "note") return !!row?.node && !row.marker && !row.placeholder && row.node.action !== "comment";
    if (action === "clear-note") return !!row?.node && !row.marker && row.node.action === "comment" && !!row.node.note;
    if (action === "disable") return !!row?.node && !tools.isEntryRow(row.node) && !row.placeholder && (!row.marker || row.marker === "end-if");
    if (action === "node-delete-block") return isBlockBoundary(row);
    if (action === "node-delete") return !!row?.node && !row.placeholder && (!row.marker || isEnd(row) || isFold(row) || ["else-if", "else", "catch", "finally"].includes(row.marker));
    if (["fold", "unfold"].includes(action)) return canFold(row) || !!row?.node && !isFold(row) && row.node.kind !== "action";
    return !!row?.node && !row.marker && !row.placeholder;
  }
  async function editorCommand(state, editor, action, row = editor.rows.find(row => row.key === editor.selected)) {
    if (action === "save-workflow") { editor.root.closest("dialog").querySelector('[data-dialog-action="save"]').click(); return; }
    if (!available(editor, action, row)) return;
    if (action === "copy" || action === "cut") {
      clipboard = tools.capture(editor.draft, row.node, action === "cut");
      if (action === "cut") { snapshot(editor); removeDraftStep(editor.draft, row.path); tools.clearEntryData(editor.draft); paintEditor(editor); focusSelection(editor); }
      editor.status.textContent = action === "cut" ? tr("workflow_ui_action_cut", "指令已剪切") : tr("workflow_ui_action_copied", "指令已复制");
    } else if (action === "paste") {
      const cursor = row ? cursorFor(row, editor.draft) : { path: ["steps"], index: flow.insertionIndex(editor.draft) };
      const draft = flow.clone(editor.draft), node = tools.paste(draft, clipboard);
      flow.pathGet(draft, cursor.path).splice(cursor.index, 0, node);
      snapshot(editor); Object.assign(editor.draft, draft);
      if ([...flow.walk([node])].some(item => item.draftDuplicateEntry)) openInspectorErrors(editor);
      if (row?.node) editor.collapsed.delete(row.node.id);
      editor.selected = node.id; editor.reveal = true; paintEditor(editor); focusSelection(editor);
    } else if (action === "undo" || action === "redo") {
      const from = editor[action], to = editor[action === "undo" ? "redo" : "undo"];
      const previous = from.pop();
      to.push(flow.clone(editor.draft));
      if (!Object.hasOwn(previous, "note")) delete editor.draft.note;
      Object.assign(editor.draft, previous); editor.diagnostics = null; editor.cursor = null;
      editor.insertionIssue = null; editor.saveIssue = null;
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
    else if (action === "node-delete-block") await removeNode(state, editor, row, true);
  }
  function openContextMenu(state, editor, row, point) {
    editor.closeMenu?.(); editor.selected = row.key; paintEditor(editor);
    const menu = document.createElement("div"); menu.className = "aw aw-context-menu"; menu.popover = "manual"; menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", tr("workflow_ui_action_menu", "指令菜单"));
    const disabled = row.marker === "end-if" ? row.node.endDisabled : row.node.disabled;
    const entries = [["copy", tr("common_copy", "复制"), "Ctrl+C", "copy"], ["cut", tr("workflow_ui_cut", "剪切"), "Ctrl+X", "scissors"], ["paste", tr("workflow_ui_paste", "粘贴"), "Ctrl+V", "clipboard"],
      ["disable", disabled ? tr("workflow_ui_enable_action", "启用此指令") : tr("workflow_ui_disable_action", "禁用此指令"), "Ctrl+/", disabled ? "circle-check" : "circle-off"], null,
      ...(row.node.action === "comment" ? (row.node.note ? [["clear-note", tr("workflow_ui_remove_attached_comment", "移除附加备注"), "", "eraser"]] : []) : [["note", tr("workflow_ui_action_comment", "指令备注"), "Ctrl+Alt+/", "message"]]),
      ["redo", tr("workflow_ui_redo", "重做"), "Ctrl+Y", "arrow-forward-up"], ["undo", tr("workflow_ui_undo", "撤销"), "Ctrl+Z", "arrow-back-up"], null,
      ["fold", tr("settings_drawer_collapse", "收起"), "Ctrl+[", "chevron-right"], ["unfold", tr("settings_drawer_expand", "展开"), "Ctrl+]", "chevron-down"], null,
      ...(!row.placeholder ? [["node-delete", isFold(row) ? tr("workflow_ui_remove_fold_marker", "移除折叠标记") : tr("common_delete", "删除"), "Delete", "trash"]] : []),
      ...(isBlockBoundary(row) ? [["node-delete-block", tr("workflow_ui_delete_whole_block", "删除整个流程块"), "", "trash"]] : [])];
    html(menu, entries.map(item => {
      if (!item) return "<hr role=separator>";
      const [action, label, shortcut, iconName] = item;
      return `<button type="button" role="menuitem" tabindex="-1" class="aw-context-item${action.startsWith("node-delete") ? " aw-context-danger" : ""}" data-command="${action}" ${available(editor, action, row) ? "" : "disabled"}>${icon(iconName)}<span>${label}</span><kbd aria-hidden="true">${shortcut}</kbd></button>`;
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
  const toolTitle = () => tr("workflow_tool_title", "工具");
  const toolNameLabel = () => tr("workflow_tool_name", "工具名称");
  const toolDescriptionLabel = () => tr("workflow_tool_description", "工具描述");
  const toolTypeLabel = type => ({ string: tools.typeNames.text, integer: tr("workflow_tool_integer", "整数"), number: tools.typeNames.number,
    boolean: tools.typeNames.boolean, array: tools.typeNames.list, object: tools.typeNames.object })[type];
  const compositionTitle = inTool => inTool ? tr("workflow_composition_http", "HTTP 查询") : tr("workflow_composition_ai", "AI 查资料后回复");
  function compositionPreview(steps) {
    const render = items => `<ol>${items.map(({ label, children }) => `<li>${esc(label)}${children ? render(children) : ""}</li>`).join("")}</ol>`;
    return `<section class="aw-section aw-composition-preview"><h4>${esc(tr("workflow_composition_steps", "将生成的步骤"))}</h4>${render(steps)}</section>`;
  }
  const compositionStep = (key, children) => ({ label: instructions.name(key), children });
  function compositionDialog(state, inTool, options) {
    return state.ctx.dialog(state.shadow, { title: compositionTitle(inTool), className: "aw-automation-dialog", form: true,
      actions: [{ id: "cancel", label: tr("common_cancel", "取消") }, { id: "generate", label: tr("workflow_composition_generate", "生成指令"), primary: true }],
      initial: node => node.querySelector(inTool ? '[data-prop="url"]' : '[data-prop="serviceId"]'),
      ...options,
    });
  }
  async function editComposition(state, editor, insertionCursor, composition) {
    const selected = editor.rows.find(row => row.key === editor.selected) || editor.rows.at(-1);
    const cursor = insertionCursor || cursorFor(selected, editor.draft);
    if (editor.insertion) {
      closeInsertion(editor, false);
      paintEditor(editor);
    }
    const generated = composition === "http" ? await httpComposition(state, editor.draft, cursor) : await aiComposition(state, editor, cursor);
    if (generated) {
      snapshot(editor);
      Object.assign(editor.draft, generated.draft);
      revealNode(editor, generated.id);
    }
  }
  async function aiComposition(state, editor, cursor) {
    const values = root.STWorkflowValues, workspace = flow.clone(editor.draft), localize = root.STI18n.forLocale(root.STI18n.locale());
    const first = flow.createNode("ai-call", workspace, localize), initialReply = first.output;
    flow.pathGet(workspace, cursor.path).splice(cursor.index, 0, first);
    first.mapping = [];
    const mappings = new Map(), lifetime = new AbortController();
    let result, container, plan;
    function collectForm() {
      values.collect(container, first, workspace);
      first.toolIds = chosenTools(container);
    }
    function updatePrompt() {
      for (const item of first.mapping) mappings.set(item.key, item.value);
      const resolved = tools.resolvePrompt(first, editor.plans, editor.registry);
      plan = resolved.plan;
      first.mapping = resolved.fields.map(key => ({ key, value: mappings.get(key) || flow.literal("") }));
    }
    function render() {
      const userParameter = root.STPromptPlans.userParameter(plan);
      const fields = first.mapping.map(({ key, value }, index) => valueField(
        key === userParameter ? tr("workflow_ui_user_prompt", "用户提示词") : key, value, `mapping.${index}.value`, workspace)).join("");
      formHtml(container, `<div class="aw aw-form aw-composition-form"><section class="aw-section">
        ${aiServiceAndPrompt(editor, first)}${fields}${toolChoices(state, first.toolIds)}
        ${outputField(tr("workflow_ui_save_reply_to", "保存回复至"), first.output, "output", workspace, "text")}</section>
        ${compositionPreview([
          compositionStep("ai-call"),
          compositionStep("while", [
            compositionStep("list"),
            compositionStep("foreach", [compositionStep("tool-call"), compositionStep("append")]),
            compositionStep("ai-call"),
          ]),
        ])}
        <div class="aw-error" role="alert"></div></div>`);
    }
    try {
      const action = await compositionDialog(state, false, {
        render(node) {
          container = node;
          updatePrompt();
          render();
          values.bind(node, first, workspace, { dialog: state.ctx.dialog, shadow: state.shadow, render, signal: lifetime.signal });
          node.addEventListener("change", event => {
            if (event.target.hasAttribute("data-allowed-tool")) first.toolIds = chosenTools(node);
            if (!["serviceId", "promptId"].includes(event.target.dataset.prop)) return;
            try {
              collectForm();
              updatePrompt();
              render();
            } catch (error) { reportFailure(error, node.querySelector(".aw-error")); }
          }, { signal: lifetime.signal });
          node.addEventListener("input", event => {
            if (event.target.matches("[data-tool-search]")) searchToolChoices(node, event.target.value);
          }, { signal: lifetime.signal });
        },
        async onAction(action, node) {
          if (action !== "generate") return true;
          try {
            collectForm();
            await values.compile(first, workspace);
            const inputs = Object.fromEntries(first.mapping.map(({ key, value }) => [key, value]));
            const [issue] = tools.promptDiagnostics({ ...first, inputs }, editor.plans, editor.registry);
            if (issue) throw issue;
            if (!first.toolIds.length) throw new Error(tr("workflow_composition_select_tools", "请至少选择一个可用工具。"));
            const draft = flow.clone(workspace), target = flow.pathGet(draft, [...cursor.path, cursor.index]);
            values.commitOutputs(node, target, draft, workspace);
            if (!target.output) throw new Error(tr("workflow_composition_reply_required", "请选择保存回复的变量。"));
            if (!["text", "any"].includes(draft.variables.find(item => item.id === target.output)?.type))
              throw new Error(tr("workflow_composition_reply_type", "请选择文本或任意数据类型的变量。"));
            if (target.output !== initialReply) draft.variables = draft.variables.filter(item => item.id !== initialReply);
            target.inputs = inputs;
            delete target.mapping;
            target.contextOutput = flow.variable(draft, localize("workflow_seed_chat_history", "对话历史"), "list");
            target.toolRequestsOutput = flow.variable(draft, localize("workflow_seed_tool_requests", "工具请求"), "list");
            appendAiToolTemplate(draft, cursor, target, localize);
            result = { draft, id: target.id };
            return true;
          } catch (error) { reportFailure(error, node.querySelector(".aw-error")); return false; }
        },
      });
      return action === "generate" ? result : null;
    } finally { lifetime.abort(); }
  }
  async function httpComposition(state, workflow, cursor) {
    const source = flow.pathGet(workflow, cursor.path);
    const inTool = flow.isToolId(workflow.id), inLibrary = flow.isLibraryId(workflow.id);
    const entry = tools.entryKey(workflow), parameterKey = inTool || inLibrary ? "parameters" : "inputParameters";
    const returnKey = inTool ? "tool-return" : "library-return";
    const existingReturn = source.findIndex(node => node.action === returnKey && !node.disabled);
    const position = existingReturn < 0 ? cursor.index : Math.min(cursor.index, existingReturn);
    const parameters = (workflow[parameterKey] ?? []).filter(item => !["array", "object", "list"].includes(item.type));
    const choices = [["", tr("workflow_composition_new_input", "新建工具入参")], ...parameters.map(item => [item.name, item.name])];
    const inputTypes = model.toolTypes.filter(type => !["array", "object"].includes(type)).map(type => [type, toolTypeLabel(type)]);
    const form = { url: "", mappings: [], outputMode: "" };
    let result;
    function render(node) {
      const mappingFields = form.mappings.map((item, index) => {
        const path = `mappings.${index}`;
        return `<div class="aw-http-mapping"><div class="aw-grid">
          ${prop(tr("workflow_composition_query_key", "查询参数名"), path + ".key", item.key)}
          ${prop(tr("workflow_composition_input_binding", "绑定工具入参"), path + ".input", item.input, choices)}</div>
          <div class="aw-grid" data-new-input ${item.input ? "hidden" : ""}>
            ${prop(tr("workflow_tool_parameter_name", "参数名"), path + ".name", item.name)}
            ${prop(tr("common_type", "类型"), path + ".type", item.type, inputTypes)}</div>
          <div class="aw-tools">${button("http-mapping-remove", tr("common_delete", "删除"), `data-index="${index}"`, "trash")}</div></div>`;
      }).join("");
      formHtml(node, `<div class="aw aw-form aw-composition-form"><section class="aw-section">
        ${prop(tr("workflow_composition_request_url", "请求 URL"), "url", form.url, null, "url")}
        <fieldset class="aw-tool-options aw-http-mappings"><legend>${esc(tr("workflow_composition_query_mappings", "查询参数映射"))}</legend>
          <div>${mappingFields}${button("http-mapping-add", tr("workflow_tool_add_parameter", "添加参数"), "", "plus")}</div></fieldset>
        ${!inTool || existingReturn < 0 ? "" : prop(tr("workflow_composition_output_mode", "查询结果去向"), "outputMode", form.outputMode, [
          ["", tr("common_select", "请选择"), true],
          ["variable", tr("workflow_composition_keep_return", "保存到变量，保留现有返回")],
          ["return", tr("workflow_composition_use_return", "交给现有返回指令")],
        ])}
        ${existingReturn >= 0 && position !== cursor.index ? `<p class="aw-hint">${esc(tr("workflow_composition_before_return", "新指令将插在现有返回之前。"))}</p>` : ""}</section>
        ${compositionPreview([...(form.mappings.length ? [compositionStep(entry)] : []), compositionStep("http-request"), compositionStep("json"),
          ...(inTool && existingReturn < 0 ? [compositionStep("tool-return")] : form.outputMode === "return" ? [{ label: tr("workflow_composition_use_return", "交给现有返回指令") }] : [])])}
        <div class="aw-error" role="alert"></div></div>`);
    }
    const action = await compositionDialog(state, true, {
      render(node) {
        render(node);
        node.addEventListener("input", event => {
          if (!event.target.dataset.prop) return;
          collect(node, form, workflow);
          if (event.target.dataset.prop.endsWith(".input") || event.target.dataset.prop === "outputMode") render(node);
        });
        node.addEventListener("click", event => {
          const control = event.target.closest("[data-aw]");
          if (control?.dataset.aw === "http-mapping-add") form.mappings.push({ key: "", input: "", name: "", type: "string" });
          else if (control?.dataset.aw === "http-mapping-remove") form.mappings.splice(Number(control.dataset.index), 1);
          else return;
          render(node);
        });
      },
      onAction(action, node) {
        if (action !== "generate") return true;
        try {
          collect(node, form, workflow);
          const url = flow.httpUrl(form.url.trim());
          if (!url) throw new Error(tr("workflow_error_http_url", "请输入有效的 HTTP 或 HTTPS URL"));
          if (inTool && existingReturn >= 0 && !form.outputMode) throw new Error(tr("workflow_composition_output_required", "请选择查询结果的去向。"));
          const mappings = form.mappings.map(item => ({ ...item, key: item.key.trim(), name: item.name.trim() }));
          if (mappings.some(item => !item.key)) throw new Error(tr("workflow_composition_query_required", "请填写查询参数名。"));
          const draft = flow.clone(workflow), localize = root.STI18n.forLocale(root.STI18n.locale());
          const updated = [...(draft[parameterKey] ?? []), ...mappings.filter(item => !item.input).map(item => {
            const type = item.type === "string" && !inTool && !inLibrary ? "text" : item.type;
            return { name: item.name, type, ...(inTool || inLibrary ? { required: true, description: "" } : {}),
              variableId: flow.variable(draft, item.name, flow.parameterVariableType(type)) };
          })];
          draft[parameterKey] = inTool || inLibrary ? model.toolParameters(updated) : updated;
          const variables = new Map(draft[parameterKey].map(item => [item.name, item.variableId]));
          const steps = flow.pathGet(draft, cursor.path), returnNode = steps[existingReturn];
          let index = position;
          const add = key => {
            const step = flow.createNode(key, draft, localize);
            steps.splice(index++, 0, step);
            return step;
          };
          const hash = url.hash; url.hash = "";
          const parts = [url.href], separator = url.search ? "&" : url.href.endsWith("?") ? "" : "?";
          for (const [i, item] of mappings.entries()) {
            const key = new URLSearchParams([[item.key, ""]]).toString();
            parts.push((i ? "&" : separator) + key, flow.reference("variable", variables.get(item.input || item.name)));
          }
          const http = add("http-request"), parse = add("json");
          http.url = mappings.length ? { template: [...parts, hash] } : flow.literal(url.href + hash);
          http.origin = url.origin;
          parse.value = flow.reference("variable", http.output, ["body"]);
          if (inTool && (existingReturn < 0 || form.outputMode === "return"))
            (returnNode || add("tool-return")).value = flow.reference("variable", parse.output);
          tools.ensureEntryRow(draft);
          result = { draft, id: http.id };
          return true;
        } catch (error) { reportFailure(error, node.querySelector(".aw-error")); return false; }
      },
    });
    return action === "generate" ? result : null;
  }
  async function editEntryParameters(state, editor, { inserting = false } = {}) {
    const inTool = editor.inTool, key = tools.entryKey(editor.draft);
    const original = flow.entryParameters(editor.draft);
    const draft = { description: editor.draft.description ?? "", parameters: flow.clone(original) };
    const types = inTool ? model.toolTypes.map(type => [type, toolTypeLabel(type)]) :
      ["any", "text", "integer", "number", "boolean", "list", "object"]
        .map(type => [type, type === "integer" ? toolTypeLabel(type) : variableTypes[type]]);
    const nameLabel = tr("workflow_tool_parameter_name", "参数名"), typeLabel = tr("common_type", "类型");
    const detailLabel = tr("workflow_tool_parameter_description", "参数说明"), requiredLabel = tr("workflow_tool_required", "必填");
    let container, next;
    const collect = () => {
      draft.description = container.querySelector("[data-entry-description]").value;
      draft.parameters = [...container.querySelectorAll("[data-tool-parameter]")].map(row => ({
        ...(row.dataset.variableId && { variableId: row.dataset.variableId }),
        name: row.querySelector("[data-parameter-name]").value.trim(), type: row.querySelector("[data-parameter-type]").value,
        ...(inTool && { description: row.querySelector("[data-parameter-description]").value, required: row.querySelector("[data-parameter-required]").checked }),
      }));
    };
    const render = () => formHtml(container, `<div class="aw aw-form aw-entry-form">
      <label class="aw-entry-description-field">${esc(editor.context === "library" ? tr("workflow_library_description", "描述") : inTool ? toolDescriptionLabel() : tr("workflow_parameter_description", "工作流描述"))}<textarea data-entry-description rows="3">${esc(draft.description)}</textarea></label>
      <div class="aw-entry-list"${inTool ? " data-tool-entry" : ""}>
        <div class="aw-toolbar">${button("parameter-add", tr("workflow_tool_add_parameter", "添加参数"), "", "plus")}</div>
        ${draft.parameters.length ? `<div class="aw-entry-fields aw-entry-head" aria-hidden="true"><span>${esc(nameLabel)}</span><span>${esc(typeLabel)}</span>${inTool ? `<span>${esc(detailLabel)}</span><span>${esc(requiredLabel)}</span>` : ""}</div>` : ""}
        ${draft.parameters.map((parameter, index) => `<div class="aw-entry-fields" data-tool-parameter="${index}" data-variable-id="${esc(parameter.variableId || "")}">
          <input data-parameter-name aria-label="${esc(nameLabel)}" value="${esc(parameter.name)}">
          <select data-parameter-type aria-label="${esc(typeLabel)}">${options(types, parameter.type)}</select>
          ${inTool ? `<input data-parameter-description aria-label="${esc(detailLabel)}" value="${esc(parameter.description)}">
          <label class="aw-trigger-check"><input data-parameter-required type="checkbox" aria-label="${esc(requiredLabel)}" ${parameter.required ? "checked" : ""}></label>` : ""}
          ${iconButton("parameter-delete", [tr("common_delete", "删除"), parameter.name || nameLabel].join(" "), "trash")}</div>`).join("")}
      </div><div class="aw-error" role="alert"></div></div>`);
    const answer = await state.ctx.dialog(state.shadow, {
      title: instructions.name(key), className: "aw-param-dialog", form: true,
      render(node) {
        container = node; render();
        node.addEventListener("click", event => {
          const target = event.target.closest("[data-aw]");
          if (!target) return;
          collect();
          if (target.dataset.aw === "parameter-add") draft.parameters.push(inTool
            ? { name: "", description: "", type: "string", required: true } : { name: "", type: "text" });
          else if (target.dataset.aw === "parameter-delete") draft.parameters.splice(Number(target.closest("[data-tool-parameter]").dataset.toolParameter), 1);
          render();
          if (target.dataset.aw === "parameter-add") [...node.querySelectorAll("[data-parameter-name]")].at(-1)?.focus();
        });
      },
      actions: [{ id: "cancel", label: tr("common_cancel", "取消") }, { id: "save", label: tr("common_confirm", "确定"), primary: true }],
      onAction(action) {
        if (action !== "save") return true;
        try {
          collect();
          const parameters = inTool ? model.toolParameters(draft.parameters) : draft.parameters;
          const previous = new Map(original.map(parameter => [parameter.variableId, parameter]));
          next = flow.clone(editor.draft);
          next.variables = next.variables.filter(variable => !previous.has(variable.id));
          for (const parameter of parameters) {
            const type = flow.parameterVariableType(parameter.type);
            const existing = editor.draft.variables.find(variable => variable.id === parameter.variableId);
            const name = inTool && parameter.name === previous.get(parameter.variableId)?.name && existing ? existing.name : parameter.name;
            const variable = next.variables.find(variable => variable.name === name);
            if (variable && (parameter.variableId || variable.type !== type) || !name)
              throw Object.assign(new TypeError(tr("workflow_parameter_invalid", "参数名称、类型或变量定义不一致")), { code: "WORKFLOW_CONFIG_INVALID" });
            if (!parameter.variableId) parameter.variableId = variable?.id || flow.variable(next, name, type);
            else next.variables.push({ id: parameter.variableId, name, type });
          }
          next.description = draft.description;
          next[inTool ? "parameters" : "inputParameters"] = parameters;
          flow.validate({ ...next, steps: [], folds: undefined });
          return true;
        } catch (error) {
          if (error.code !== "WORKFLOW_CONFIG_INVALID") reportFailure(error, container.querySelector(".aw-error"));
          else container.querySelector(".aw-error").textContent = view().errorCaption(error);
          return false;
        }
      },
    });
    if (answer === "save") {
      if (!inserting) snapshot(editor);
      Object.assign(editor.draft, next);
      if (!inserting) { paintEditor(editor); focusSelection(editor); }
    }
    return answer;
  }
  async function editLibraryOutputs(state, editor, row) {
    let fields = flow.clone(editor.draft.outputs), panel;
    const available = flow.scopes(editor.draft).get(row.node.id) ?? new Map();
    const labels = [tr("workflow_library_output_name", "输出名"), tr("common_type", "类型"),
      tr("workflow_library_description", "描述"), tr("workflow_library_source_variable", "来源变量"), tr("common_delete", "删除")];
    const fieldTypes = [...model.toolTypes, "any"].map(type => [type, type === "any" ? variableTypes.any : toolTypeLabel(type)]);
    const render = () => formHtml(panel, `<div class="aw aw-form"><div class="aw-entry-list" data-library-output>
      <div class="aw-toolbar">${button("output-add", tr("workflow_library_output_add", "添加输出"), "", "plus")}</div>
      ${fields.length ? '<div class="aw-entry-fields aw-entry-head" aria-hidden="true">' + labels.map(label => "<span>" + esc(label) + "</span>").join("") + "</div>" : ""}
      ${fields.map((field, index) => `<div class="aw-entry-fields" data-output-row="${index}">
        <input data-name aria-label="${esc(labels[0])}" value="${esc(field.name)}">
        <select data-type aria-label="${esc(labels[1])}">${options(fieldTypes, field.type)}</select>
        <input data-description aria-label="${esc(labels[2])}" value="${esc(field.description)}">
        <select data-source aria-label="${esc(labels[3])}">${options([["", tr("common_select", "请选择")], ...editor.draft.variables.filter(variable => available.has(variable.id) || variable.id === field.variableId)
          .map(variable => [variable.id, variable.name, !available.has(variable.id)])], field.variableId)}</select>
        ${iconButton("output-delete", labels[4] + " " + field.name, "trash")}</div>`).join("")}
      </div><div class="aw-error" role="alert"></div></div>`);
    function collectFields() {
      fields = [...panel.querySelectorAll("[data-output-row]")].map((row, index) => ({
        id: fields[index].id, name: row.querySelector("[data-name]").value.trim(), type: row.querySelector("[data-type]").value,
        description: row.querySelector("[data-description]").value, variableId: row.querySelector("[data-source]").value,
      }));
    }
    const result = await state.ctx.dialog(state.shadow, {
      title: instructions.name("library-return"), form: true, className: "aw-param-dialog",
      render(node) {
        panel = node; render();
        node.addEventListener("click", event => {
          const control = event.target.closest("[data-aw]");
          if (!control) return;
          collectFields();
          if (control.dataset.aw === "output-add") fields.push({ id: flow.numericId("out-", fields), name: "", type: "string", description: "", variableId: "" });
          else if (control.dataset.aw === "output-delete") fields.splice(Number(control.closest("[data-output-row]").dataset.outputRow), 1);
          render();
          if (control.dataset.aw === "output-add") [...node.querySelectorAll("[data-name]")].at(-1)?.focus();
        });
      },
      actions: [{ id: "cancel", label: tr("common_cancel", "取消") }, { id: "save", label: tr("common_confirm", "确定"), primary: true }],
      onAction(action) {
        if (action !== "save") return true;
        collectFields();
        try {
          model.libraryOutputs({ outputs: fields, variables: editor.draft.variables });
          return true;
        } catch (error) {
          if (error.code !== "WORKFLOW_CONFIG_INVALID") throw error;
          panel.querySelector(".aw-error").textContent = view().errorCaption(error);
          return false;
        }
      },
    });
    if (result === "save") { snapshot(editor); editor.draft.outputs = fields; paintEditor(editor); focusSelection(editor); }
    return result;
  }
  function previewPlan(definition, { libraries = [], tools = [] } = {}) {
    const libraryVersions = {}, toolVersions = {}, steps = new Set(), scripts = new Set(), visited = new Set();
    const definitions = new Map([...libraries, ...tools.filter(tool => tool.enabled)].map(item => [item.id, item]));
    // 确认提示与发送给后台的版本取自同一份定义
    function collect(owner, scriptNetworkAllowed) {
      const key = owner.id + ":" + scriptNetworkAllowed;
      if (visited.has(key)) return;
      visited.add(key);
      for (const node of flow.walk(owner.steps, true)) {
        steps.add(node);
        if (scriptNetworkAllowed && node.action === "script") scripts.add(node);
        const library = node.action === "library-call";
        const childId = library ? node.libraryId : node.action === "tool-call" && node.toolMode === "registered" ? node.toolId : null;
        const child = definitions.get(childId);
        if (!child) continue;
        const versions = library ? libraryVersions : toolVersions;
        versions[child.id] = { revision: child.revision, executionId: child.executionId };
        collect(child, scriptNetworkAllowed && library);
      }
    }
    collect(definition, !flow.isToolId(definition.id));
    return { steps: [...steps], scripts: [...scripts], libraryVersions, toolVersions };
  }
  async function previewScriptNetwork(scripts) {
    if (!scripts.length) return { used: false, origins: [] };
    const { scriptNetwork } = await import(root.chrome.runtime.getURL("settings/pages/workflow-code.js"));
    const sites = scripts.map(node => scriptNetwork(node.code));
    return { used: sites.some(site => site.used), origins: sites.flatMap(site => site.origins) };
  }
  const previewHttpOrigin = node => node.origin || flow.staticHttpOrigin(node.url);
  async function toolPreview(tool, bundle) {
    const { steps, scripts, libraryVersions, toolVersions } = previewPlan(tool, bundle);
    const network = await previewScriptNetwork(scripts);
    const requests = steps.filter(node => node.action === "http-request");
    const sites = [...new Set([...requests.map(previewHttpOrigin).filter(Boolean), ...network.origins])];
    const providers = [...new Set(steps.filter(node => Object.hasOwn(flow.providerQueries, node.action)).map(node => instructions.name(node.action)))];
    return { sites, providers, scriptNetwork: network.used,
      request: { libraryVersions, toolVersions, confirmNetwork: requests.length > 0 || network.used } };
  }
  function toolSampleFields(tool) {
    return tool.parameters.map(({ name, type, required }) => `<label>${esc(name)} · ${esc(toolTypeLabel(type))}${required ? " *" : ""}
      ${type === "boolean" ? `<select data-tool-sample>${options([["", ""], ["true", tr("common_yes", "是")], ["false", tr("common_no", "否")]], "")}</select>`
        : type === "object" || type === "array" ? '<textarea data-tool-sample></textarea>'
          : `<input data-tool-sample type="${["number", "integer"].includes(type) ? "number" : "text"}" step="${type === "number" ? "any" : "1"}">`}</label>`).join("");
  }
  function readToolSamples(container, tool) {
    const inputs = Object.fromEntries([...container.querySelectorAll("[data-tool-sample]")].flatMap((control, index) => {
      const { name, type, required } = tool.parameters[index];
      if (!control.value && (type !== "string" || !required)) return [];
      return [[name, type === "string" ? control.value : JSON.parse(control.value)]];
    }));
    model.toolArguments(tool, inputs);
    return inputs;
  }
  function toolSampleNotice({ sites, providers, scriptNetwork }) {
    return `${sites.length ? `<p>${esc(tr("workflow_tool_test_sites", "运行会访问以下站点"))} · ${esc(sites.join("、"))}</p>` : ""}
      ${scriptNetwork ? `<p>${esc(tr("workflow_script_network_preview", "脚本可能发送真实 HTTP 请求并修改目标站点的数据。"))}</p>` : ""}
      ${providers.length ? `<p>${esc(providers.join("、"))}</p>` : ""}`;
  }
  function previewEntryText(entry) {
    const text = entry.text ?? view().errorCaption(entry);
    return entry.libraryNodeId ? `${entry.libraryNodeId} · ${text}` : text;
  }
  async function editorToolSamples(state, tool, plan) {
    if (!tool.parameters.length && !plan.request.confirmNetwork && !plan.providers.length) return {};
    let inputs;
    const title = flow.isLibraryId(tool.id) ? tr("workflow_library_test", "试运行自定义库") : tr("workflow_tool_test", "测试工具");
    const answer = await state.ctx.dialog(state.shadow, { title, className: "aw-param-dialog", form: true,
      render: node => formHtml(node, `<div class="aw aw-form">${toolSampleNotice(plan)}${toolSampleFields(tool)}<div class="aw-error" role="alert"></div></div>`),
      actions: [{ id: "cancel", label: tr("common_cancel", "取消") }, { id: "run", label: tr("workflow_ui_run", "运行"), primary: true }],
      onAction(action, node) {
        if (action !== "run") return true;
        try { inputs = readToolSamples(node, tool); return true; }
        catch (error) { reportFailure(error, node.querySelector(".aw-error")); return false; }
      },
    });
    return answer === "run" ? inputs : null;
  }
  function runControl(editor) {
    const control = editor.root.querySelector('[data-aw="editor-run"]');
    const running = editor.run?.running, busy = editor.preparingRun || editor.run?.stopping;
    control.setAttribute("aria-disabled", String(!!busy));
    const label = running ? tr("workflow_ui_stop_test", "停止试运行") : tr("workflow_ui_run", "运行");
    html(control, icon(running ? "player-stop" : "player-play") + `<span class="aw-button-label">${esc(label)}</span>`);
  }
  function refreshEditorLibraries(editor, libraries, recheck = false) {
    const previous = new Map(editor.customLibraries.map(library => [library.id, library]));
    const current = new Map(libraries.map(library => [library.id, library]));
    const changed = new Set();
    for (const node of flow.walk(editor.draft.steps, true)) {
      // 实际执行的工具还会调用库，由后台重新核对其正式运行诊断
      if (executesTool(node)) changed.add(node.id);
      if (node.action !== "library-call") continue;
      const before = previous.get(node.libraryId), after = current.get(node.libraryId);
      if (before?.revision !== after?.revision || before?.executionId !== after?.executionId)
        changed.add(node.id);
    }
    editor.customLibraries = libraries;
    editor.diagnostics = null;
    if (changed.size) {
      // 先移除旧版本的授权按钮，等后台权限检查完成再展示新版
      editor.siteIssues = editor.siteIssues.flatMap(issue => {
        const nodeIds = issue.nodeIds.filter(id => !changed.has(id));
        return nodeIds.length ? [{ ...issue, nodeIds, nodeId: nodeIds[0] }] : [];
      });
      paintInspector(editor, { issuesOnly: true });
    }
    return checkEditorSites(editor, recheck || changed.size > 0);
  }
  async function loadEditorDefinitions(state, editor, { validate = false, signal = editor.signal } = {}) {
    const sequence = (editor.definitionSequence || 0) + 1;
    editor.definitionSequence = sequence;
    const current = () => !signal.aborted && sequence === editor.definitionSequence;
    const storage = state.ctx.storage;
    const [bundle, registry, membership] = await Promise.all([
      storage.getWorkflow(), storage.getAi(), validate ? storage.getMembership() : undefined,
    ]);
    if (!current()) return null;
    editor.registry = registry;
    editor.plans = bundle.prompts;
    editor.toolLibrary = bundle.tools;
    if (validate) {
      editor.membership = membership;
      editor.insertionIssue = null;
      editor.saveIssue = null;
    }
    return { bundle, current, checked: refreshEditorLibraries(editor, bundle.libraries ?? [], true) };
  }
  async function authorizeCheckedSite(state, origin, signal) {
    if (!usesNativePermissionRequest()) return authorizeSite(origin, signal);
    let granted = false;
    let cancel;
    const close = () => cancel?.click();
    signal.addEventListener("abort", close, { once: true });
    try {
      await state.ctx.dialog(state.shadow, {
        title: tr("workflow_site_permissions", "域名授权"), message: origin,
        actions: [{ id: "cancel", label: tr("common_cancel", "取消") },
          { id: "authorize", label: tr("workflow_click_authorize", "点我授权"), primary: true }],
        renderFooter: footer => { cancel = footer.querySelector('[data-dialog-action="cancel"]'); },
        async onAction(action) {
          // Chrome 要求在确认按钮的点击回调中直接发起权限请求
          if (action === "authorize" && !signal.aborted) granted = await authorizeSite(origin, signal);
          return true;
        },
      });
    } finally { signal.removeEventListener("abort", close); }
    return granted;
  }
  async function authorizeEditorSite(state, editor, origin) {
    const changed = new AbortController();
    const signal = AbortSignal.any([editor.signal, changed.signal]);
    // 从首次读配置起跟踪当前确认，设置变更时结束旧确认并刷新错误列表
    const subscription = root.STSettingsBus.subscribe(() => changed.abort(),
      { owner: "settings-workflow", key: "site-authorization", keys: [model.KEY, root.STAI.SERVICES_KEY] });
    let granted;
    try {
      const config = await loadEditorDefinitions(state, editor, { signal });
      if (config && await config.checked && config.current() && editor.siteIssues.some(issue => issue.origin === origin))
        granted = await authorizeCheckedSite(state, origin, signal);
    } finally { subscription.dispose(); }
    if (editor.signal.aborted) return;
    if (changed.signal.aborted) await loadEditorDefinitions(state, editor);
    else if (granted) await checkEditorSites(editor, true);
  }
  async function runEditorDraft(state, editor) {
    if (editor.run?.running) {
      editor.run.stopping = true; runControl(editor);
      try { await view().rpc("cancel-instruction-test", { id: editor.run.id }); }
      finally { if (editor.run.running) { editor.run.stopping = false; if (!editor.signal.aborted) runControl(editor); } }
      return;
    }
    if (editor.preparingRun) return;
    let draft;
    try { draft = tools.forStorage(editor.draft); }
    catch (error) {
      if (!error.pairing) throw error;
      locateError(editor, error);
      focusSelection(editor);
      return;
    }
    const inTool = editor.inTool;
    let samples, previewRequest;
    editor.preparingRun = true; runControl(editor);
    try {
      const config = await loadEditorDefinitions(state, editor);
      if (!config) return;
      if (inTool) {
        const tool = editor.context === "library" ? model.validateLibrary(draft) : model.validateTool(draft);
        const plan = await toolPreview(tool, config.bundle);
        if (!config.current()) return;
        previewRequest = plan.request;
        samples = await editorToolSamples(state, tool, plan);
      } else {
        flow.validate(draft);
        const steps = [...flow.walk(draft.steps, true)];
        const { steps: effects, scripts, libraryVersions, toolVersions } = previewPlan(draft, config.bundle);
        previewRequest = { libraryVersions, toolVersions };
        const confirmNetwork = effects.some(node => node.action === "http-request") || (await previewScriptNetwork(scripts)).used;
        if (!config.current()) return;
        samples = await testValues(state, draft, steps, { includeVariables: false, confirmNetwork });
      }
    } finally { editor.preparingRun = false; if (!editor.signal.aborted) runControl(editor); }
    if (!samples || editor.signal.aborted) return;
    const lines = tools.lines(editor.draft);
    const run = { id: crypto.randomUUID(), status: tr("workflow_ui_running", "正在运行…"), running: true, entries: [], sites: new Set(), lines, positions: lines };
    editor.run = run; editor.panel = "debug"; editor.panelClosed = false;
    paintInspector(editor); runControl(editor);
    const append = entries => {
      if (editor.signal.aborted || editor.run !== run || !entries.length) return;
      const formatted = entries.map(entry => {
        const node = run.lines.get(entry.nodeId)?.row.node;
        if (node && entry.origin) {
          const site = entry.nodeId + " " + entry.origin;
          if (!run.sites.has(site)) {
            run.sites.add(site);
            rememberSiteIssue(editor, node, entry, previewRequest.libraryVersions[node.libraryId]);
          }
        }
        const text = previewEntryText(entry);
        const label = instructions.schemaLabel(model.NOTICE_TYPES[entry.level]);
        return { ...entry, label, text };
      });
      run.entries.push(...formatted);
      if (run.matches) run.matches.push(...formatted.filter(entry => matchesDebugEntry(entry, run.query, run.positions)));
      debugEntries(editor);
    };
    const abort = () => void view().rpc("cancel-instruction-test", { id: run.id }).catch(error => reportFailure(error, null));
    editor.signal.addEventListener("abort", abort, { once: true });
    try {
      const result = await (inTool ? view().rpc(editor.context === "library" ? "test-library" : "test-tool", { id: run.id, tool: draft, inputs: samples, ...previewRequest })
        : view().rpc("test-workflow", { id: run.id, workflow: draft, ...samples, ...previewRequest }, append));
      if (editor.signal.aborted) return;
      if (result.entries?.length) append(result.entries);
      const steps = (result.steps || []).map(step => ({ nodeId: step.nodeId, level: step.status === "success" ? "info" : "error",
        text: instructions.name(step.action) + " · " + (step.status === "success" ? tr("workflow_ui_run_completed", "运行完成") : tr("workflow_ui_run_failed", "运行失败")) + " ×" + step.count }));
      if (steps.length) append(steps);
      if (result.error) {
        const entry = { ...result.error, at: Date.now(), level: "error" };
        if (entry.code === "WORKFLOW_PREVIEW_UNSUPPORTED") entry.message = tr("workflow_ui_preview_unsupported", "草稿试运行已停在此指令。此指令需要正式运行。");
        append([entry]);
      } else if (inTool && !result.cancelled) append([{ level: "success", text: JSON.stringify(result.value, null, 2) }]);
      run.status = result.uncertain ? tr("workflow_script_preview_uncertain", "试运行已停止，已发送的写请求结果待核实")
        : result.cancelled ? tr("workflow_ui_test_stopped", "试运行已停止")
          : result.error ? tr("workflow_ui_run_failed", "运行失败")
            : result.steps?.some(step => step.status === "failed") ? tr("workflow_ui_failed_continued_as_configured", "失败，已按配置继续")
              : tr("workflow_ui_run_completed", "运行完成");
    } catch (error) {
      if (!editor.signal.aborted) {
        reportFailure(error, null);
        append([{ at: Date.now(), level: "error", text: view().errorCaption(error) }]);
        run.status = tr("workflow_ui_run_failed", "运行失败");
      }
    } finally {
      editor.signal.removeEventListener("abort", abort);
      run.running = false; run.stopping = false;
      if (!editor.signal.aborted) {
        runControl(editor);
        const status = editor.root.querySelector(".aw-debug-status");
        if (status) status.textContent = run.status;
      }
    }
  }
  function openWorkflowParameters(draft) {
    const legacy = new Map();
    if (draft.inputParameters) return legacy;
    draft.inputParameters = [];
    while (draft.steps.length && !draft.folds?.length) {
      const node = draft.steps[0], input = flow.activeValue(node.value);
      if (node.action !== "receive" || node.disabled || node.note || node.errorOutput || node.onError && node.onError !== "throw" ||
          input?.source !== "input" || input.path.length !== 1 || legacy.has(input.path[0])) break;
      const variable = draft.variables.find(item => item.id === node.output);
      if (!variable || variable.type === "result" || [...legacy.values()].includes(variable.id)) break;
      legacy.set(input.path[0], variable.id);
      draft.inputParameters.push({ name: variable.name, type: variable.type, variableId: variable.id });
      draft.steps.shift();
    }
    return legacy;
  }
  async function reconcileTriggerParameters(state, bundle, workflow, legacy) {
    const paused = [];
    for (const trigger of bundle.triggers) {
      if (trigger.workflowId !== workflow.id) continue;
      const bindings = { ...trigger.inputs };
      for (const [old, id] of legacy) if (Object.hasOwn(bindings, old) && !Object.hasOwn(bindings, id)) bindings[id] = bindings[old];
      trigger.inputs = Object.fromEntries(workflow.inputParameters.filter(parameter => Object.hasOwn(bindings, parameter.variableId))
        .map(parameter => [parameter.variableId, bindings[parameter.variableId]]));
      if (!trigger.enabled || !model.inputBindingIssue(workflow, trigger.inputs, trigger.event.type)) continue;
      trigger.enabled = false;
      paused.push(trigger.name);
    }
    if (!paused.length) return true;
    const title = tr("workflow_parameter_pause_triggers", "更新触发传参");
    return await state.ctx.dialog(state.shadow, { title,
      message: [tr("workflow_parameter_pause_notice", "以下触发器需要重新绑定参数。保存后将暂停，修正后可重新启用。"), ...paused].join("\n"),
      actions: [{ id: "cancel", label: tr("common_cancel", "取消") }, { id: "save", label: tr("common_save", "保存"), primary: true }],
    }) === "save";
  }
  async function editWorkflow(state, original = null, importIssue = null, newTool = false) {
    const inLibrary = flow.isLibraryId(original?.id) || newTool === "library";
    const context = inLibrary ? "library" : newTool || flow.isToolId(original?.id) ? "tool" : "workflow";
    const inTool = context !== "workflow";
    const draft = original ? tools.openDraft(original)
      : inLibrary ? model.newLibrary(tr("workflow_library_untitled", "未命名自定义库"))
        : inTool ? model.newTool(tr("workflow_tool_untitled", "未命名工具"))
          : model.newWorkflow(flow.numericId("wf-", state.bundle.workflows), tr("workflow_ui_untitled_workflow", "未命名工作流"));
    const legacy = inTool ? null : openWorkflowParameters(draft);
    tools.ensureEntryRow(draft, inLibrary && !draft.steps.some(tools.isEntryRow) ? { list: draft.steps, index: 0 } : undefined);
    const initial = JSON.stringify(draft), controller = new AbortController(), nameLabel = inLibrary ? tr("workflow_library_name", "自定义库名称") : inTool ? toolNameLabel() : tr("workflow_ui_workflow_name", "工作流名称");
    let editor;
    const [registry, membership] = await Promise.all([state.ctx.storage.getAi(), state.ctx.storage.getMembership()]);
    try {
      const title = inLibrary ? original ? tr("workflow_library_edit", "编辑自定义库") : tr("workflow_library_new", "新建自定义库")
        : inTool ? original ? tr("workflow_tool_edit", "编辑 AI 工具") : tr("workflow_tool_new", "新建 AI 工具")
        : original ? tr("workflow_ui_edit_workflow", "编辑工作流") : tr("workflow_ui_new_workflow", "新建工作流");
      const closed = state.ctx.dialog(state.shadow, { title, className: "aw-workflow-dialog", form: true, isDirty: () => JSON.stringify(draft) !== initial,
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
          html(node, `<div class="aw aw-editor"><div class="aw-editor-top"><label class="aw-workflow-name">${icon("binary-tree")}<input data-name aria-label="${esc(nameLabel)}" placeholder="${esc(nameLabel)}" value="${esc(draft.name)}"></label>
            <div class="aw-editor-toolbar" role="toolbar" aria-label="${esc(tr("workflow_ui_workflow_tools", "工作流工具"))}" focusgroup="toolbar wrap">${itemNoteButton(draft.note)}${iconButton("expand-all", tr("workflow_ui_expand_all", "全部展开"), "chevrons-down")}${iconButton("collapse-all", tr("workflow_ui_collapse_all", "全部折叠"), "chevrons-up")}<span class="aw-tool-separator" role="separator" aria-orientation="vertical"></span>${iconButton("undo", tr("workflow_ui_undo", "撤销"), "arrow-back-up")}${iconButton("redo", tr("workflow_ui_redo", "重做"), "arrow-forward-up")}<span class="aw-tool-separator" role="separator" aria-orientation="vertical"></span>${iconButton("variables", tr("workflow_ui_variables", "变量列表"), "variable")}${iconButton("validate", tr("workflow_ui_validate_again", "重新校验"), "list-check", 'aria-controls="aw-inspector-panel"')}</div>
            ${button("editor-run", tr("workflow_ui_run", "运行"), 'class="aw-primary aw-editor-run"', "player-play")}
            </div><div class="aw-editor-main"><aside class="aw-palette" aria-label="${esc(tr("workflow_ui_action_library", "指令库"))}"><input type="search" data-search aria-label="${esc(tr("workflow_ui_search_actions", "搜索指令"))}" placeholder="${esc(tr("workflow_ui_search_actions", "搜索指令"))}">
            ${palette(context)}
            </aside><div class="aw-canvas" role="listbox" aria-label="${esc(tr("workflow_ui_workflow_actions", "工作流指令"))}" aria-multiselectable="false"></div></div>
            <section class="aw-inspector" aria-label="${esc(tr("workflow_ui_workflow_checks", "工作流检查"))}"><div class="aw-inspector-head"><div class="aw-tabs" role="tablist" aria-label="${esc(tr("workflow_ui_workflow_checks_panel", "工作流检查面板"))}">
              <button type="button" role="tab" id="aw-inspector-debug" data-inspector-tab="debug" aria-controls="aw-inspector-panel">${esc(tr("workflow_ui_debug_log", "调试日志"))}</button>
              <button type="button" role="tab" id="aw-inspector-errors" data-inspector-tab="errors" aria-controls="aw-inspector-panel">${esc(tr("workflow_ui_errors", "错误列表"))}</button>
              <button type="button" role="tab" id="aw-inspector-variables" data-inspector-tab="variables" aria-controls="aw-inspector-panel">${esc(tr("workflow_ui_variables", "变量列表"))}</button>
            </div><span data-count></span>${iconButton("panel-toggle", tr("workflow_ui_toggle_inspector", "折叠或展开检查面板"), "layout-bottombar", 'aria-expanded="true" aria-controls="aw-inspector-panel"')}</div><div class="aw-inspector-panel" id="aw-inspector-panel" role="tabpanel" tabindex="-1"></div></section></div>`);
          editor = { draft, root: node, registry, membership, plans: state.bundle.prompts, inTool, context, customLibraries: state.bundle.libraries ?? [], toolLibrary: state.bundle.tools || [], importing: !!importIssue && importIssue.importing !== false, undo: [], redo: [], selected: "root-gap", rows: [], collapsed: new Set(), cursor: null, insertion: null, panel: "errors", panelClosed: false, diagnostics: null, signal: controller.signal, siteIssues: [], runtimeSites: new Map(), originalId: !importIssue && original?.id, epoch: state.bundle.epoch,
            searches: { debug: { open: false, query: "" }, errors: { open: false, query: "" }, variables: { open: false, query: "" } },
            savedRequests: original && !importIssue ? new Map([...flow.walk(original.steps)].map(item => [item.id, requestFingerprint(item)])) : null };
          paintEditor(editor); bindEditor(state, editor, controller.signal);
        },
        actions: [{ id: "cancel", label: tr("common_cancel", "取消") }, { id: "save", label: tr("common_save", "保存"), primary: true }],
        onAction: async (action, node) => {
          if (action !== "save") return true;
          editor.saveIssue = null;
          try {
            if (!inTool && [...flow.walk(draft.steps)].some(node => node.action === "ai-call")) {
              editor.registry = await state.ctx.storage.getAi();
              if (controller.signal.aborted) return false;
            }
            editor.diagnostics = null;
            const errors = editorDiagnostics(editor).filter(issue => issue.severity !== "warning");
            if (errors.length) { await showSaveIssues(state, editor, errors); return false; }
            const workflow = tools.forStorage(draft);
            if (inLibrary) return await saveLibraryDefinition(state, model.validateLibrary(workflow));
            if (inTool) {
              const current = original && !importIssue ? state.bundle.tools.find(tool => tool.id === original.id) : null;
              if (original && !importIssue && JSON.stringify(current) !== JSON.stringify(original))
                throw Object.assign(new Error("AI 工具已在另一窗口修改，请重新打开后保存"), { code: "WORKFLOW_REVISION_CONFLICT" });
              return await saveToolDefinition(state, model.validateTool(workflow));
            }
            flow.validate(workflow);
            const next = flow.clone(state.bundle), index = next.workflows.findIndex(item => item.id === workflow.id);
            if (editor.importing) {
              workflow.id = flow.numericId("wf-", next.workflows); workflow.revision = 1;
              next.workflows.push(workflow);
            } else if (index < 0) next.workflows.push(workflow); else next.workflows[index] = workflow;
            if (!await reconcileTriggerParameters(state, next, workflow, legacy)) return false;
            await save(state, next, editor.importing || index < 0 ? { section: "workflows", id: workflow.id } : undefined);
            return true;
          } catch (error) {
            if (error.code !== "WORKFLOW_CONFIG_INVALID") view().reportFailure(error, null);
            if (!controller.signal.aborted) {
              editor.saveIssue = error;
              await showSaveIssues(state, editor, [error]);
            }
            return false;
          }
        },
      });
      if (importIssue && editor?.root.isConnected) {
        void editIssue(state, editor, importIssue, true).catch(error => reportFailure(error, null, editor));
      }
      await closed;
    } finally { editor?.closeMenu?.(); controller.abort(); }
  }
  function locateError(editor, error) {
    openInspectorErrors(editor);
    if (error.nodeId) revealNode(editor, error.nodeId); else paintInspector(editor);
    editor.root.querySelector("[data-editor-error]").textContent = inspectorIssues(editor).some(item => item.nodeId === error.nodeId && item.message === error.message) ? "" : view().errorCaption(error);
  }
  async function showSaveIssues(state, editor, errors) {
    openInspectorErrors(editor);
    const lines = tools.lines(editor.draft);
    if (lines.has(errors[0].nodeId)) revealNode(editor, errors[0].nodeId);
    else paintInspector(editor);
    const messages = errors.map(error => {
      const line = lines.get(error.nodeId)?.number, message = view().validationCaption(error);
      return line ? tr("workflow_format_line", "第 $count$ 行", { count: line }) + " · " + message : message;
    });
    await view().saveFailureNotice(state.shadow, messages);
    if (!editor.signal.aborted && editor.root.isConnected)
      editor.root.querySelector(".aw-inspector-panel").focus({ preventScroll: true });
  }
  async function editIssue(state, editor, issue, openConfig = false) {
    revealNode(editor, issue.nodeId);
    if (issue.pairing) { focusSelection(editor); return; }
    const row = editor.rows.find(row => row.key === issue.nodeId);
    if (row && (openConfig || row.node.action === "ai-call" && issue.field)) {
      await editNode(state, editor, row, issue);
      if (editor.root.isConnected) paintEditor(editor);
    }
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
      if (!event.defaultPrevented && !event.isComposing && event.key === "Escape") {
        const search = event.target.closest("[data-inspector-search]");
        if (search && editor.searches[search.dataset.inspectorSearch].open) {
          event.preventDefault(); event.stopPropagation();
          setInspectorSearch(editor, search, false);
          return;
        }
      }
      const tab = event.target.closest("[data-inspector-tab]");
      if (tab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const tabs = [...node.querySelectorAll("[data-inspector-tab]")], index = tabs.indexOf(tab);
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 :
          (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        tabs[next].click(); tabs[next].focus(); return;
      }
      if (event.defaultPrevented || event.isComposing || event.target.closest("input,textarea,select,[contenteditable=true]")) return;
      const key = event.key.toLowerCase(), modifier = event.ctrlKey || event.metaKey;
      let action = modifier && !event.altKey ? ({ c: "copy", x: "cut", v: "paste", z: event.shiftKey ? "redo" : "undo", y: "redo", s: "save-workflow", "[": "fold", "]": "unfold", "/": "disable" })[key] : modifier && event.altKey && event.code === "Slash" ? "note" : event.key === "Delete" ? "node-delete" : null;
      if (event.key === "F10" && event.shiftKey) {
        event.preventDefault(); event.stopPropagation(); const row = editor.rows.find(row => row.key === editor.selected), element = canvas.querySelector(`[data-key="${CSS.escape(editor.selected)}"]`);
        if (row && element) { const rect = element.getBoundingClientRect(); openContextMenu(state, editor, row, { x: rect.left + 70, y: rect.bottom }); } return;
      }
      if (!action || event.target.closest(".aw-context-menu")) return;
      const focusedRow = action === "node-delete" ? editor.rows[Number(event.target.closest(".aw-line")?.dataset.row)] : undefined;
      event.preventDefault(); event.stopPropagation(); void editorCommand(state, editor, action, focusedRow).catch(error => reportFailure(error, null, editor));
    }, { signal });
    canvas.addEventListener("contextmenu", event => {
      const row = editor.rows[Number(event.target.closest("[data-row]")?.dataset.row)]; if (!row || row.marker === "insert") return;
      event.preventDefault(); event.stopPropagation(); openContextMenu(state, editor, row, { x: event.clientX, y: event.clientY });
    }, { signal });
    function handleCommandSearch(event) {
      const row = event.target.closest("[data-insert-row]");
      return row && root.STSearchCombo.handleSearchCombo(event, row, (_input, id) => {
        void insertInstruction(state, editor, id).catch(error => reportFailure(error, null, editor));
      }, () => closeInsertion(editor));
    }
    node.addEventListener("input", event => {
      if (event.target.matches(".aw-inspector-search")) {
        const pane = event.target.closest("[data-inspector-search]").dataset.inspectorSearch;
        editor.searches[pane].query = event.target.value;
        filterInspector(editor, pane);
      }
      if (event.target.hasAttribute("data-name")) {
        const name = event.target.value, validityChanged = !!name.trim() !== !!editor.draft.name.trim();
        editor.draft.name = name;
        editor.saveIssue = null;
        if (validityChanged) { editor.diagnostics = null; paintEditor(editor); }
        else paintInspector(editor);
      }
      if (event.target.hasAttribute("data-search")) {
        const query = event.target.value.trim().toLocaleLowerCase(), palette = event.target.closest(".aw-palette");
        const groups = [...palette.querySelectorAll("details")];
        if (query && !editor.paletteOpen) editor.paletteOpen = new Set(groups.filter(group => group.open));
        for (const control of palette.querySelectorAll(".aw-palette-entry")) {
          control.hidden = !!query && ![control.textContent, control.title, control.dataset.instruction].join(" ").toLocaleLowerCase().includes(query);
        }
        for (const group of groups) {
          if (query) {
            group.open = !!group.querySelector(".aw-palette-entry:not([hidden])");
            group.hidden = !group.open;
          } else {
            group.hidden = false;
            if (editor.paletteOpen) group.open = editor.paletteOpen.has(group);
          }
        }
        if (!query) editor.paletteOpen = null;
      }
      if (event.target.id === "aw-command-search") {
        editor.insertion.query = event.target.value;
        handleCommandSearch(event);
      }
    }, { signal });
    node.addEventListener("pointerdown", handleCommandSearch, { signal });
    node.addEventListener("keydown", event => {
      if (handleCommandSearch(event)) event.stopPropagation();
    }, { signal });
    const repositionCommandSearch = event => root.STSearchCombo.repositionSearchCombo(canvas, event);
    canvas.addEventListener("scroll", repositionCommandSearch, { passive: true, signal });
    root.addEventListener("resize", repositionCommandSearch, { signal });
    node.addEventListener("click", event => {
      if (handleCommandSearch(event)) { event.stopPropagation(); return; }
      const row = editor.rows[Number(event.target.closest("[data-row]")?.dataset.row)], control = event.target.closest("[data-aw]");
      if (row && !event.target.closest(".aw-insert-row")) {
        const inserting = !!editor.insertion;
        if (inserting) closeInsertion(editor, false);
        editor.selected = row.key; editor.cursor = row.marker === "insert" ? cursorFor(row, editor.draft) : null;
        for (const element of canvas.querySelectorAll("[data-key]")) element.setAttribute("aria-selected", String(element.dataset.key === row.key));
        if (inserting) paintEditor(editor);
      }
      if (control?.getAttribute("aria-disabled") === "true" || (!control && !event.target.closest("[data-instruction]"))) return;
      const insertionCursor = editor.cursor;
      if (editor.insertion && control && !["insert", "select-gap", "insert-cancel", "composition"].includes(control.dataset.aw)) closeInsertion(editor);
      event.stopPropagation();
      void (async () => {
        if (event.target.closest("[data-instruction]")) return insertInstruction(state, editor, event.target.closest("[data-instruction]").dataset.instruction);
        const action = control.dataset.aw;
        if (action === "item-note") {
          const value = editor.draft.note ?? "";
          const note = await noteDialog(state, value, tr("store_titleCustomName_noteTab", "备注"));
          if (note === null || note === value || signal.aborted) return;
          snapshot(editor);
          editor.draft.note = note;
          control.toggleAttribute("data-has-note", !!note.trim());
          node.querySelector('[data-aw="undo"]').setAttribute("aria-disabled", "false");
          node.querySelector('[data-aw="redo"]').setAttribute("aria-disabled", "true");
          return;
        }
        if (action === "editor-run") return runEditorDraft(state, editor);
        if (action === "log-expand") return showDebugLog(state, editor, control);
        if (action === "log-clear") {
          const run = editor.run;
          const search = control.parentElement.querySelector("[data-inspector-search]");
          search.querySelector(editor.searches.debug.open ? "input" : "button").focus({ preventScroll: true });
          run.entries.length = 0;
          if (run.matches) run.matches.length = 0;
          filterInspector(editor, "debug");
          return;
        }
        if (action === "log-prev" || action === "log-next") {
          const run = editor.run, last = Math.ceil(debugResults(editor).length / debugPageSize) - 1;
          const next = (run.logPage ?? last) + (action === "log-prev" ? -1 : 1);
          run.logPage = next === last ? undefined : next;
          debugEntries(editor);
          return;
        }
        if (action === "composition") return editComposition(state, editor, insertionCursor, control.dataset.composition);
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
          editor.status.textContent = "";
          const config = await loadEditorDefinitions(state, editor, { validate: true });
          if (!config || !await config.checked || !config.current()) return;
          openInspectorErrors(editor);
          const [firstIssue] = editorDiagnostics(editor);
          if (firstIssue) revealNode(editor, firstIssue.nodeId); else paintEditor(editor);
          editor.status.textContent = diagnosticSummary(editor.diagnostics) || tr("workflow_ui_validation_passed", "校验通过");
        }
        else if (action === "variables") { editor.panel = "variables"; editor.panelClosed = false; paintInspector(editor); }
        else if (action === "inspector-search") {
          const search = control.closest("[data-inspector-search]");
          setInspectorSearch(editor, search, !editor.searches[search.dataset.inspectorSearch].open);
        }
        else if (action === "panel-toggle") { editor.panelClosed = !editor.panelClosed; paintInspector(editor); }
        else if (action === "site-authorize") {
          if (editor.authorizingSite) return;
          editor.authorizingSite = true;
          control.disabled = true;
          try {
            await authorizeEditorSite(state, editor, control.dataset.origin);
          } finally {
            editor.authorizingSite = false;
            control.disabled = false;
            if (!signal.aborted && !control.isConnected) node.querySelector('[data-inspector-tab="errors"]').focus();
          }
        }
        else if (action === "error-locate") await editIssue(state, editor, inspectorIssues(editor)[Number(control.dataset.error)]);
        else if (action === "instruction-locate") revealNode(editor, control.dataset.nodeId);
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
      if (row?.node && !row.placeholder && !isEnd(row) && !["insert", "else", "finally"].includes(row.marker)) void editNode(state, editor, row).then(() => paintEditor(editor)).catch(error => reportFailure(error, null, editor));
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
          const parentPath = owningBlockPath(listPath);
          destination = { path: parentPath.slice(0, -1), index: Number(parentPath.at(-1)) + 1 };
        }
        if (destination) { moveNode(editor, row, destination); editor.root.querySelector(`[data-key="${CSS.escape(row.node.id)}"] .aw-handle`)?.focus(); }
      }
    }, { signal });
    bindDrag(state, editor, signal);
  }
  function dropTarget(editor, elements, y) {
    // 画布行按垂直位置排列，拖动期间用二分定位，避免逐帧扫描和读取全部行的布局
    let low = 0, high = elements.length - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (y <= elements[middle].getBoundingClientRect().bottom) high = middle;
      else low = middle + 1;
    }
    const element = elements[low];
    if (!element) return null;
    if (element.hasAttribute("data-insert-row"))
      return { element, before: true, cursor: editor.cursor, depth: editor.insertion.depth };
    const index = Number(element.dataset.row), row = editor.rows[index], box = element.getBoundingClientRect();
    if (row.marker === "insert") return { element, before: true, cursor: cursorFor(row, editor.draft), depth: row.depth };
    let before = y < box.top + box.height / 2, cursor, depth = row.depth;
    if (!before) {
      if (row.marker === "fold-start" && editor.collapsed.has(row.key) && row.partner !== undefined)
        cursor = { path: row.listPath, index: row.partner + 1 };
      else if (!row.marker && canFold(row) && editor.collapsed.has(row.key))
        cursor = { path: row.listPath, index: row.index + 1 };
      else {
        cursor = cursorFor(row, editor.draft);
        if ((!row.marker && canFold(row)) || ["else-if", "else", "catch", "finally", "fold-start"].includes(row.marker)) depth++;
      }
    }
    else if (row.listPath) cursor = { path: row.listPath, index: row.index };
    else if (editor.rows[index - 1]?.marker === "insert") {
      // 分支末尾的插入位置仍保留在结构投影中，不依赖常驻的添加按钮
      cursor = cursorFor(editor.rows[index - 1], editor.draft);
      depth = editor.rows[index - 1].depth;
    } else { before = false; cursor = cursorFor(row, editor.draft); }
    return { element, before, cursor, depth };
  }
  function bindDrag(state, editor, signal) {
    const node = editor.root, canvas = node.querySelector(".aw-canvas");
    const workArea = canvas.parentElement;
    let drag = null, suppressClick = false;
    function markDrop(target) {
      const previous = drag.target;
      if (previous?.element === target?.element && previous?.before === target?.before && previous?.depth === target?.depth) return;
      if (previous) {
        delete previous.element.dataset.drop;
        previous.element.style.removeProperty("--aw-drop-depth");
      }
      if (target) {
        target.element.dataset.drop = target.before ? "before" : "after";
        target.element.style.setProperty("--aw-drop-depth", target.depth);
      }
      drag.target = target;
    }
    function beginDrag() {
      drag.active = true; suppressClick = true;
      drag.rows = [...canvas.querySelectorAll("[data-row],[data-insert-row]")];
      const { element, startX, startY } = drag, bounds = element.getBoundingClientRect();
      // 原行保留原尺寸供落点二分使用，只有非交互浮层跟随指针
      const preview = element.cloneNode(true);
      for (const attr of ["data-row", "data-key", "data-aw", "data-instruction"]) preview.removeAttribute(attr);
      preview.classList.add("aw-drag-preview");
      preview.setAttribute("aria-hidden", "true");
      preview.inert = true;
      preview.style.width = bounds.width + "px";
      preview.style.height = bounds.height + "px";
      drag.preview = preview;
      drag.left = bounds.left;
      drag.offsetX = startX - bounds.left;
      drag.offsetY = startY - bounds.top;
      workArea.append(preview);
      element.classList.add("aw-dragging");
      canvas.classList.add("aw-grabbing");
    }
    const clear = () => {
      if (!drag) return;
      markDrop(null);
      const current = drag; drag = null; root.cancelAnimationFrame(current.frame);
      current.preview?.remove();
      current.element.classList.remove("aw-dragging"); canvas.classList.remove("aw-grabbing");
      if (current.handle.hasPointerCapture(current.pointer)) current.handle.releasePointerCapture(current.pointer);
    };
    editor.cancelDrag = clear;
    const updateTarget = (scroll = false) => {
      if (!drag) return;
      const bounds = canvas.getBoundingClientRect(), { x, y } = drag;
      if (x < bounds.left || x >= bounds.right || y < bounds.top || y >= bounds.bottom) { markDrop(null); return; }
      const before = canvas.scrollTop;
      if (scroll && y < bounds.top + 32) canvas.scrollTop -= 8;
      else if (scroll && y > bounds.bottom - 32) canvas.scrollTop += 8;
      const target = dropTarget(editor, drag.rows, y);
      const path = drag.row?.path;
      markDrop(path && target && path.every((part, index) => part === target.cursor.path[index]) ? null : target);
      if (canvas.scrollTop !== before) drag.frame = root.requestAnimationFrame(paint);
    };
    function paint() {
      drag.frame = 0;
      const left = drag.palette ? drag.x - drag.offsetX : drag.left;
      drag.preview.style.transform = `translate(${left}px, ${drag.y - drag.offsetY}px)`;
      updateTarget(true);
    }
    node.addEventListener("pointerdown", event => {
      if (!event.isPrimary || event.button !== 0 || drag) return;
      suppressClick = false;
      const palette = event.target.closest(".aw-palette-entry");
      const element = palette || event.target.closest(".aw-canvas .aw-line");
      if (!element) return;
      const row = palette ? null : editor.rows[Number(element.dataset.row)];
      if (!palette && (!row || row.marker ||
          event.target.closest("button:not(.aw-handle),a,input,textarea,select,[contenteditable],.aw-selectable-text"))) return;
      // 触屏仍从原有把手起拖，行内空白可用于原生滚动
      const hotspot = palette || event.target.closest(".aw-handle,.aw-number,.aw-line-copy strong");
      const handle = hotspot || (event.pointerType === "mouse" ? element : null);
      if (!handle) return;
      handle.setPointerCapture(event.pointerId);
      drag = { handle, element, row, palette, pointer: event.pointerId,
        startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false, target: null, frame: 0 };
    }, { signal });
    node.addEventListener("pointermove", event => {
      if (!drag || drag.pointer !== event.pointerId) return;
      drag.x = event.clientX; drag.y = event.clientY;
      if (!drag.active && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= 4) beginDrag();
      if (drag.active && !drag.frame) drag.frame = root.requestAnimationFrame(paint);
    }, { signal });
    node.addEventListener("pointerup", event => {
      if (!drag || drag.pointer !== event.pointerId) return;
      if (drag.active) { drag.x = event.clientX; drag.y = event.clientY; updateTarget(); }
      const current = drag, cursor = drag.target?.cursor, rowKey = drag.target?.element.dataset.key;
      clear();
      if (!cursor) return;
      if (current.palette) {
        const key = current.palette.dataset.instruction;
        if (key) void insertInstruction(state, editor, key, { ...cursor, rowKey }).catch(error => reportFailure(error, null));
        else void editComposition(state, editor, cursor, current.palette.dataset.composition).catch(error => reportFailure(error, null, editor));
        return;
      }
      try { moveNode(editor, current.row, cursor); editor.root.querySelector(`[data-key="${CSS.escape(current.row.node.id)}"] .aw-handle`)?.focus({ preventScroll: true }); }
      catch (error) { reportFailure(error, null, editor); }
    }, { signal });
    node.addEventListener("click", event => {
      if (suppressClick && event.detail) { suppressClick = false; event.preventDefault(); event.stopImmediatePropagation(); }
    }, { capture: true, signal });
    for (const type of ["pointercancel", "lostpointercapture"]) node.addEventListener(type, event => { if (drag?.pointer === event.pointerId) clear(); }, { signal });
    document.addEventListener("keydown", event => { if (drag && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); clear(); } }, { signal, capture: true });
    root.addEventListener("blur", clear, { signal });
    signal.addEventListener("abort", clear, { once: true });
  }
  async function variableAction(state, editor, action, id) {
    if (flow.entryParameters(editor.draft).some(parameter => parameter.variableId === id)) return editEntryParameters(state, editor);
    const next = flow.clone(editor.draft), selected = next.variables.find(item => item.id === id);
    if (action === "variable-delete") {
      if (!await confirm(state, tr("workflow_ui_delete_variable", "删除变量"), tr("workflow_format_delete_var", "将删除“$name$”。引用该变量的指令需要重新选择变量，修正前不能保存工作流。", { name: selected.name }))) return;
      next.variables.splice(next.variables.indexOf(selected), 1);
    } else if (!await editVariable(state, next, selected)) return;
    if (JSON.stringify(next) !== JSON.stringify(editor.draft)) { snapshot(editor); Object.assign(editor.draft, next); paintEditor(editor); }
  }
  async function resolveOutputNames(state, container, workspace, working) {
    const clean = flow.clone(workspace), resolved = {}, entries = root.STWorkflowValues.outputEntries(container, workspace);
    for (const [path, entry] of Object.entries(entries)) {
      const name = entry.name, old = workspace.variables.find(item => item.id === entry.id);
      if (!name || !old || name === old.name) continue;
      if (flow.entryParameters(workspace).some(parameter => parameter.variableId === old.id)) continue;
      const uses = tools.uses(workspace, old.id).filter(use => use.nodeId !== working.id || use.role !== "write" || use.key !== path);
      let global = true;
      if (uses.length) {
        const answer = await state.ctx.dialog(state.shadow, { title: tr("workflow_ui_edit_shared_variable", "修改共享变量"), className: "aw-automation-dialog", form: true,
          message: tr("workflow_format_rename_var", "“$old$”还在其他 $count$ 个位置使用。是否在当前工作流中统一改为“$name$”？", { old: old.name, count: uses.length, name }),
          actions: [{ id: "cancel", label: tr("common_cancel", "取消") }, { id: "current", label: tr("workflow_ui_this_action_only", "仅当前指令") }, { id: "global", label: tr("workflow_ui_change_all_references", "全局修改"), primary: true }],
        });
        if (answer === "cancel") return null;
        global = answer === "global";
      }
      if (global) {
        const existing = clean.variables.find(item => item.name === name);
        if (existing && existing.id !== old.id) { tools.replace(clean, old.id, existing.id); resolved[path] = existing.id; }
        else { clean.variables.find(item => item.id === old.id).name = name; resolved[path] = old.id; }
        for (const [other, output] of Object.entries(entries)) if (output.id === old.id && output.name === old.name) resolved[other] = resolved[path];
      }
    }
    return { clean, resolved };
  }
  const parameterSample = type => flow.literal(({ integer: 0, number: 0, boolean: false, list: [], object: {}, result: {} })[type] ?? "");
  async function testValues(state, workflow, nodes, { includeVariables = true, confirmNetwork = false } = {}) {
    const ids = new Set(); let needsInput = false, needsTrigger = false;
    for (const node of nodes) for (const value of flow.nodeReferences(node)) {
      if (includeVariables && value.source === "variable") ids.add(value.id);
      if (value.source === "input") needsInput = true;
      if (value.source === "meta" && (!value.path.length || ["triggerName", "triggerType"].includes(value.path[0]))) needsTrigger = true;
    }
    const optionalIds = includeVariables && nodes.length === 1 ? flow.optionalRecordVariables(nodes[0]) : new Set();
    const parameters = includeVariables ? [] : workflow.inputParameters ?? [];
    if (!ids.size && !needsInput && !needsTrigger && !confirmNetwork && !parameters.length) return { input: {}, variables: {} };
    const sample = { input: flow.literal({}), meta: { triggerName: tr("workflow_ui_test_action", "指令试运行"), triggerType: "manual" }, values: [...ids].map(id => {
      const variable = workflow.variables.find(item => item.id === id), type = variable.type;
      const optional = optionalIds.has(id);
      return { id, name: variable.name, type, optional, include: !optional, value: parameterSample(type) };
    }), parameters: parameters.map(item => ({ ...item, value: parameterSample(item.type) })) }, scope = { variables: [], literalOnly: true };
    let container, result = null;
    const triggerTypes = [["manual", triggerModes.manual], ...Object.entries(gameEvents), ["schedule", triggerModes.schedule]];
    const render = () => formHtml(container, `<div class="aw aw-form">
      ${confirmNetwork ? `<p>${esc(tr("workflow_script_network_preview", "脚本可能发送真实 HTTP 请求并修改目标站点的数据。"))}</p>` : ""}<div class="aw-grid">
      ${needsTrigger ? parameterProp(tr("workflow_ui_sample_trigger_name", "触发器名称样例"), "meta.triggerName", sample.meta.triggerName) +
        parameterProp(tr("workflow_ui_sample_trigger_type", "触发类型样例"), "meta.triggerType", sample.meta.triggerType, triggerTypes) : ""}
      ${needsInput ? valueField(tr("workflow_ui_sample_trigger_input", "触发器输入样例"), sample.input, "input", scope, [], "object") : ""}
      ${sample.parameters.map((item, index) => valueField(item.name, item.value, `parameters.${index}.value`, scope, [], item.type)).join("")}
      ${sample.values.map((item, index) => {
        const field = () => valueField(item.name + tr("workflow_ui_sample", "样例"), item.value, `values.${index}.value`, scope, [], item.type === "result" ? "object" : item.type);
        if (!item.optional) return field();
        const caption = tr("workflow_record_sample_include", "提供 $name$ 的样例", { name: item.name });
        return `<div><label><input type="checkbox" data-sample-include="${index}"${item.include ? " checked" : ""}>${esc(caption)}</label>${item.include ? field() : ""}</div>`;
      }).join("")}
      </div><div class="aw-error" role="alert"></div></div>`);
    const answer = await state.ctx.dialog(state.shadow, { title: tr("workflow_ui_test_input", "试运行输入"), className: "aw-param-dialog", form: true,
      render: node => {
        container = node; render();
        root.STWorkflowValues.bind(node, sample, scope, { dialog: state.ctx.dialog, shadow: state.shadow, render });
        node.addEventListener("change", event => {
          const index = event.target.dataset.sampleInclude;
          if (index === undefined) return;
          try {
            collect(container, sample, scope);
            sample.values[index].include = event.target.checked;
            render();
            node.querySelector(`[data-sample-include="${index}"]`).focus();
          } catch (error) {
            event.target.checked = sample.values[index].include;
            reportFailure(error, node.querySelector(".aw-error"));
          }
        });
      },
      actions: [{ id: "cancel", label: tr("common_cancel", "取消") }, { id: "run", label: tr("workflow_ui_run", "运行"), primary: true }],
      onAction: action => {
        if (action !== "run") return true;
        try {
          collect(container, sample, scope);
          if (needsTrigger && !sample.meta.triggerName.trim()) throw new Error(tr("workflow_ui_enter_a_sample_trigger_name", "请填写触发器名称样例"));
          const input = needsInput ? flow.read(sample.input, flow.state()) : Object.fromEntries(sample.parameters.map(item => [item.variableId, flow.read(item.value, flow.state())]));
          if (!includeVariables) model.workflowArguments(workflow, input);
          result = { input, variables: Object.fromEntries(sample.values.filter(item => item.include).map(item => [item.id, flow.read(item.value, flow.state())])),
            ...(needsTrigger ? { meta: sample.meta } : {}), ...(confirmNetwork ? { confirmNetwork: true } : {}) };
          const checked = flow.state({}, {}, workflow);
          for (const [id, value] of Object.entries(result.variables)) flow.write(checked, id, value);
          return true;
        } catch (error) { reportFailure(error, container.querySelector(".aw-error")); return false; }
      },
    });
    return answer === "run" ? result : null;
  }
  function unboundLibraryInput(type) {
    const value = { text: "", number: 0, boolean: false, list: [], object: {} }[flow.parameterVariableType(type)];
    return { ...flow.inputValue(flow.literal(value)), unset: true };
  }
  async function editNode(state, editor, row, issue = null, insertionOwner = null) {
    if (tools.isEntryRow(row.node)) return editEntryParameters(state, editor, { inserting: !!insertionOwner });
    if (row.node.action === "library-return") return editLibraryOutputs(state, editor, row);
    const prop = parameterProp;
    const workspace = flow.clone(editor.draft), working = flow.pathGet(workspace, row.path);
    const values = root.STWorkflowValues, emptyInput = JSON.stringify(values.comparable(flow.literal("")));
    if (working.action === "ai-call") {
      working.mapping = Object.entries(working.inputs || {}).map(([key, value]) => ({ key, originalKey: key, value }));
      working.context ??= flow.literal("");
      working.toolResults ??= flow.literal("");
      if (!working.toolIds?.length) delete working.toolIds;
    }
    working._timeout = working.timeout ? "true" : "false"; working._timeoutSeconds = working.timeout?.seconds || 60;
    let initial, promptParameters = null;
    let selectedLibrary = working.libraryId;
    let container, branch = row.branch || 0, parameterTab = issue?.field === "toolIds" ? "advanced" : "general", codeEditor = null, renderEpoch = 0, previewId = null, previewText = "";
    let preparingPreview = false;
    const lifetime = new AbortController(), dataDefinition = flow.definitions[working.action];
    const http = working.action === "http-request";
    let recordValue = working.value, recordEntries = working.entries, recordExpanded = false;
    const toolParameters = editor.context === "tool" && working.action === "record" ? workspace.parameters : [];
    const requiredInputs = new Set(toolParameters.filter(item => item.required).map(item => item.variableId));
    const recordParameters = () => toolParameters.filter(item => item.variableId && !working.entries.some(entry => entry.key === item.name));
    const requiredBinding = ({ value, omitIfUnset }) => {
      const ref = flow.activeValue(value);
      return omitIfUnset === false && ref?.source === "variable" && ref.path?.length === 0 && requiredInputs.has(ref.id);
    };
    const requiredDictionary = () => !!working.entries?.length && working.entries.every(requiredBinding);
    function useWholeDictionaryValue() {
      recordEntries = working.entries;
      delete working.entries;
      working.value = recordValue ?? flow.literal({});
    }
    working.onError ||= "throw";
    const initialValue = flow.activeValue(working.value);
    if (working.action === "set") working.valueType ||= Object.hasOwn(initialValue, "literal") ? ({ string: "text", number: "number", boolean: "boolean", list: "list", object: "object" }[Array.isArray(initialValue.literal) ? "list" : typeof initialValue.literal] || "any") : "any";
    const selectedPrompt = node => editor.plans.find(item => item.id === node.promptId);
    function promptMapping(node) {
      return node.mapping.filter(item => item.originalKey !== undefined || promptParameters?.includes(item.key));
    }
    function isOriginalInput(item) {
      return item.originalKey !== undefined && JSON.stringify(flow.inputValue(item.value)) === JSON.stringify(flow.inputValue(working.inputs[item.originalKey]));
    }
    function promptErrorControl(error) {
      if (error.field !== "inputs") return container.querySelector('[data-prop="' + CSS.escape(error.field) + '"]');
      const index = working.mapping.findIndex(item => item.key === error.parameter);
      const field = container.querySelector('[data-value="mapping.' + index + '.value"]');
      return container.querySelector('[data-prompt-rebind="' + CSS.escape(error.parameter) + '"]') ||
        field?.querySelector("[data-value-text]") || field?.querySelector("[data-variable-toggle]");
    }
    function markParameterInsertionError(error) {
      if (!insertionOwner || insertionOwner.signal.aborted) return;
      noteInsertionIssue(insertionOwner, error, instructions.key(row));
      paintInspector(insertionOwner);
    }
    function validatePromptInputs(saving = false) {
      const inputs = Object.fromEntries(promptMapping(working).map(item => [item.key, item.value]));
      const [error] = tools.promptDiagnostics({ ...working, inputs }, editor.plans, editor.registry);
      if (!error) return true;
      if (parameterTab !== "general") { parameterTab = "general"; render(); }
      const control = promptErrorControl(error);
      const userParameter = root.STPromptPlans.userParameter(selectedPrompt(working));
      const message = !working.promptId && error.field === "promptId" ? tr("workflow_ui_select_a_prompt_template", "请选择提示词模板")
        : !editor.importing && error.field === "inputs" && error.parameter === userParameter ? tr("workflow_ui_enter_a_user_prompt", "请填写用户提示词") : view().errorCaption(error);
      container.querySelector(".aw-error").textContent = message;
      if (saving) markParameterInsertionError({ message });
      control?.setAttribute("aria-invalid", "true");
      control?.focus();
      return false;
    }
    function promptInputs(plan) {
      const userParameter = root.STPromptPlans.userParameter(plan);
      const extra = [...working.mapping.entries()].filter(([, item]) => item.originalKey !== undefined && !promptParameters.includes(item.key));
      let fields = promptParameters.map(name => {
        let index = working.mapping.findIndex(item => item.key === name);
        if (index < 0) {
          index = working.mapping.length;
          working.mapping.push({ key: name, value: flow.literal("") });
        }
        const value = working.mapping[index].value;
        const label = name === userParameter && !editor.importing && !extra.length ? tr("workflow_ui_user_prompt", "用户提示词") : name;
        const field = valueField(label, value, "mapping." + index + ".value", workspace);
        if (!extra.length || flow.activeValue(value).literal !== "") return field;
        const caption = tr("workflow_prompt_use_existing", "将已有输入用于「$name$」", { name });
        const options = [["", tr("common_select", "请选择"), true], ...extra.map(([, item]) => [item.key, item.key])];
        return field + '<label><span>' + esc(caption) + '</span>' + root.STSearchCombo.fixedComboHtml(caption, "data-prompt-rebind", name, options, "") + '</label>';
      }).join("");
      if (extra.length) fields += '<section class="aw-section"><h4>' + esc(tr("workflow_prompt_unmatched_inputs", "保留的原输入")) + '</h4>' +
        extra.map(([index, item]) => '<div data-prompt-extra>' + valueField(item.key, item.value, "mapping." + index + ".value", workspace) + '</div>').join("") + '</section>';
      return fields;
    }
    function recordInputs() {
      const rows = Array.isArray(working.entries);
      // 完整字典只折叠必填变量绑定的表单，仍使用原有字典字段参与执行和变量候选
      const mapped = !recordExpanded && requiredDictionary();
      const mode = tr("workflow_record_mode", "字典输入方式");
      const fields = tr("workflow_record_fields", "逐项填写");
      const whole = tr("workflow_record_whole", "完整字典");
      let content = `<label>${esc(mode)}<select data-record-mode>${options([["fields", fields], ["whole", whole]], rows && !mapped ? "fields" : "whole")}</select></label>`;
      if (!rows) return content + valueField(whole, working.value, "value", workspace, [], "object");
      if (mapped) {
        const pickerLabel = esc(tr("workflow_ui_show_variables", "显示变量"));
        return content + `<div class="aw-value"><span class="aw-value-label">${esc(whole)}</span><div class="aw-value-body"><div class="aw-input-shell">
          ${values.collectionButton("object", working.entries.length, 'data-aw="record-edit-bindings" data-variable-target="value"')}
          <button type="button" class="aw-fx" data-variable-toggle aria-label="${pickerLabel}" title="${pickerLabel}">${icon("math-function")}</button>
          </div></div></div>`;
      }
      const policy = tr("workflow_record_missing_policy", "未赋值时");
      const name = tr("workflow_ui_field_name", "字段名称"), source = tr("workflow_record_source", "值来源");
      const rowsHtml = working.entries.map((entry, index) => {
        const path = `entries.${index}`;
        const remove = entry.key ? tr("workflow_format_remove_item", "移除 $name$", { name: entry.key }) : tr("common_delete", "删除");
        return `<div class="aw-record-entry" role="group" aria-label="${esc(entry.key || name)}">
          <input type="text" data-prop="${path}.key" aria-label="${esc(name)}" value="${esc(entry.key)}">
          ${valueField(source, entry.value, path + ".value", workspace, [], "any", false, [], true)}
          <select data-prop="${path}.omitIfUnset" data-record-policy="${index}" aria-label="${esc(policy)}"${requiredBinding(entry) ? " hidden" : ""}>${options([["true", tr("workflow_record_omit", "省略")],
            ["false", tr("workflow_record_fail", "报错")]], entry.omitIfUnset)}</select>
          ${iconButton("record-remove", remove, "trash", `data-index="${index}"`)}</div>`;
      }).join("");
      const allRequired = requiredDictionary();
      if (rowsHtml) content += `<div class="aw-record-fields"${allRequired ? " data-all-required" : ""}><div class="aw-record-columns" aria-hidden="true"><span>${esc(name)}</span><span>${esc(source)}</span><span data-record-policy-heading${allRequired ? " hidden" : ""}>${esc(policy)}</span></div>${rowsHtml}</div>`;
      return content + `<div class="aw-tools">${button("record-add", tr("workflow_record_add", "添加字段"), "", "plus")}${recordParameters().length
        ? button("record-fill", tr("workflow_record_from_ai", "从 AI 传参带入")) : ""}</div>`;
    }
    function syncRecordPolicies() {
      const fields = requiredInputs.size && container.querySelector(".aw-record-fields");
      if (!fields) return;
      for (const policy of fields.querySelectorAll("[data-record-policy]")) policy.hidden = requiredBinding(working.entries[Number(policy.dataset.recordPolicy)]);
      const allRequired = requiredDictionary();
      fields.toggleAttribute("data-all-required", allRequired);
      fields.querySelector("[data-record-policy-heading]").hidden = allRequired;
    }
    function render() {
      codeEditor?.destroy(); codeEditor = null;
      const epoch = ++renderEpoch;
      let content = "", output = "", promptError;
      if (working.kind === "if") {
        content = conditionHtml(working.branches[branch].condition, `branches.${branch}.condition`, workspace);
      } else if (flow.loops.has(working.kind)) {
        if (working.kind === "for") content = valueField(tr("workflow_ui_repeat_count", "循环次数"), working.count, "count", workspace);
        if (working.kind === "while") content = conditionHtml(working.condition, "condition", workspace);
        if (working.kind === "forever") content = valueField(tr("workflow_ui_interval_per_iteration_seconds", "每轮间隔（秒）"), working.seconds, "seconds", workspace);
        if (["foreach", "entries"].includes(working.kind)) content = valueField(tr("workflow_ui_items_to_iterate", "循环数据"), working.value, "value", workspace) +
          outputField(working.kind === "entries" ? tr("workflow_ui_save_current_value_to", "当前值保存至") : tr("workflow_ui_save_current_item_to", "当前项目保存至"), working.item, "item", workspace) +
          outputField(working.kind === "entries" ? tr("workflow_ui_save_current_key_to", "当前键保存至") : tr("workflow_ui_save_current_index_to", "当前序号保存至"), working.index, "index", workspace);
      } else if (working.kind === "try") {
        content = outputField(tr("workflow_ui_save_caught_exception_to", "Catch 异常保存至"), working.error, "error", workspace) + `<div class="aw-tools">${button("catch-toggle", working.catch === null ? tr("workflow_ui_add_catch", "添加 Catch") : tr("workflow_ui_remove_catch", "删除 Catch"))}${button("finally-toggle", working.finally === null ? tr("workflow_ui_add_finally", "添加 Finally") : tr("workflow_ui_remove_finally", "删除 Finally"))}</div>`;
      } else {
        const key = working.action;
        if (http) {
          content += prop(tr("workflow_ui_method", "方法"), "method", working.method, (editor.inTool ? ["GET"] : flow.httpMethods).map(method => [method, method]));
          content += valueField("URL", working.url, "url", workspace, [], "text");
          if (editor.context === "tool") content += prop(tr("workflow_tool_key_header", "密钥请求头"), "keyHeader", working.keyHeader);
          else if (!editor.inTool) content += valueField(tr("workflow_ui_request_headers", "请求头"), working.headers, "headers", workspace, [], "object");
          if (flow.hasHttpBody(working.method)) content += valueField(tr("workflow_ui_request_body", "请求体"), working.body ?? flow.literal(""), "body", workspace, [], "any", true);
        } else if (key === "record") {
          content = recordInputs();
        } else if (dataDefinition) {
          if (key === "set") content += prop(tr("workflow_ui_variable_type", "变量类型"), "valueType", working.valueType, Object.entries(variableTypes).filter(([id]) => id !== "result"));
          if (key === "tool-call") {
            content += prop(tr("workflow_ui_tool_mode", "执行方式"), "toolMode", working.toolMode, [
              ["request", tr("workflow_ui_tool_run_request", "执行 AI 的工具请求")], ["registered", tr("workflow_ui_tool_run_selected", "执行指定工具")],
              ["result", tr("workflow_ui_tool_use_result", "传入已有结果")], ["skipped", tr("workflow_ui_tool_skip_request", "跳过 AI 的工具请求")],
              ["failed", tr("workflow_ui_tool_record_failure", "记录工具失败")],
            ]);
            if (working.toolMode === "registered") content += prop(tr("ai_chat_tools", "工具"), "toolId", working.toolId || "", [
              ["", tr("workflow_ui_select_tool", "请选择工具"), true], ...availableTools(state, working.toolId ? [working.toolId] : [])
                .map(tool => [tool.id, tool.name, !tool.enabled && tool.id !== working.toolId]),
            ]);
          }
          const toolLabels = { toolRequest: "workflow_seed_tool_requests", toolArgs: "workflow_ui_tool_arguments", toolData: "workflow_output_tool_call", toolReason: "workflow_ui_tool_reason" };
          content += flow.actionFields(working).map(field => valueField(toolLabels[field.key] ? tr(toolLabels[field.key], field.label) : instructions.schemaLabel(field.label), working[field.key], field.key, workspace,
            instructions.schemaChoices(field.choices || []), key === "set" ? working.valueType : field.type, false, [], field.selectLiteralType)).join("");
        }
        if (key === "log") content += prop(tr("workflow_ui_log_level", "日志级别"), "level", working.level, instructions.schemaChoices(Object.entries(model.NOTICE_TYPES)));
        if (["raise", "log"].includes(key)) content += valueField(key === "log" ? tr("workflow_ui_log_message", "日志内容") : tr("workflow_ui_error_message_or_variable", "异常消息或异常变量"), working.value, "value", workspace, [], "any", true);
        if (key === "tool-return") content += valueField(tr("workflow_output_tool_call", "工具结果"), working.value, "value", workspace, [], "any", true);
        if (key === "library-call") {
          const libraries = editor.customLibraries, library = libraries.find(item => item.id === working.libraryId);
          content += prop(tr("workflow_libraries_tab", "自定义库"), "libraryId", working.libraryId,
            [["", tr("common_select", "请选择")], ...libraries.map(item => [item.id, item.name])]);
          for (const field of library?.parameters ?? []) {
            const fieldId = field.variableId, path = "libraryInputs." + fieldId;
            if (!field.required) content += `<label class="aw-trigger-check"><input type="checkbox" data-library-input="${esc(fieldId)}" ${Object.hasOwn(working.libraryInputs, fieldId) ? "checked" : ""}>${esc(field.name)}</label>`;
            if (field.required || Object.hasOwn(working.libraryInputs, fieldId)) {
              const type = flow.parameterVariableType(field.type);
              content += valueField(field.name + (field.required ? " *" : ""), working.libraryInputs[fieldId] ?? unboundLibraryInput(field.type),
                path, workspace, [], type, false, [], false, true);
              if (field.description) content += `<small title="${esc(field.description)}">${esc(field.description)}</small>`;
            }
          }
          output = (library?.outputs ?? []).map(field => outputField(field.name, working.libraryOutputs[field.id],
            "libraryOutputs." + field.id, workspace, flow.parameterVariableType(field.type))).join("");
        }
        if (key === "wait") content += valueField(tr("workflow_ui_wait_duration_seconds", "等待秒数"), working.seconds, "seconds", workspace, [], "number");
        if (key === "script") {
          content += `
            <div class="aw-code-section">
              <div class="aw-code-toolbar">
                <span>${esc(tr("workflow_ui_javascript_code", "JavaScript 代码"))}</span>
                <button type="button" data-code-size>${esc(tr("workflow_ui_expand_editor", "展开编辑器"))}</button>
              </div>
              <div class="aw-code-editor"><div data-code><span class="aw-hint">${esc(tr("workflow_ui_loading_editor", "正在加载编辑器…"))}</span></div>
                <button type="button" class="aw-fx" data-variable-toggle data-script-reference aria-label="${esc(tr("workflow_ui_insert_variable", "插入变量"))}" title="${esc(tr("workflow_ui_insert_variable", "插入变量"))}" disabled>${icon("math-function")}</button>
              </div>
            </div>`;
        }
        if (key === "comment") content += `<label>${esc(tr("store_titleCustomName_noteTab", "备注"))}<textarea data-prop="text">${esc(working.text)}</textarea></label>`;
        if (key === "ai-call") {
          content += aiServiceAndPrompt(editor, working);
          const binding = tools.resolvePrompt(working, editor.plans, editor.registry);
          promptParameters = binding.fields;
          if (!binding.service || working.promptId || editor.importing) promptError = binding.errors[0]?.message;
          content += promptInputs(binding.plan);
        }
        if (key === "notify") {
          content += `<div class="aw-grid">${prop(tr("messageCenter_levels", "级别"), "level", working.level, instructions.schemaChoices(Object.entries(model.NOTICE_TYPES)))}${prop(tr("workflow_ui_delivery_method", "投递方式"), "delivery", working.delivery, [["center", tr("messageCenter_navigationLabel", "消息中心")], ["popup", tr("workflow_ui_message_center_and_popup", "消息中心并弹出")]])}${prop(tr("steam_independentName_transfer_scope", "范围"), "scope", working.scope, working.messageType === "interactive" ? [["account", tr("workflow_ui_current_account", "当前账号")]] : [["account", tr("workflow_ui_current_account", "当前账号")], ["device", tr("workflow_ui_this_device", "本机")]])}</div>` + valueField(tr("workflow_ui_message_body", "消息正文"), working.body, "body", workspace, [], "text", true);
          if (working.messageType === "interactive") content += `<div class="aw-section"><h4>${esc(tr("workflow_ui_action_buttons", "操作按钮"))}</h4>${working.buttons.map((item, index) => `<div class="aw-button-row">${prop(tr("workflow_ui_name", "名称"), `buttons.${index}.label`, item.label)}${prop(tr("workflow_ui_icon", "图标"), `buttons.${index}.icon`, item.icon, [["view", tr("messageCenter_view", "查看")], ["mute", tr("common_cancel", "取消")], ["retry", tr("common_retry", "重试")], ["read", tr("workflow_ui_done", "完成")], ["upgrade", tr("common_continue", "继续")]])}${iconButton("button-delete", tr("workflow_ui_delete_button", "删除按钮"), "trash", `data-index="${index}"`)}</div>`).join("")}${button("button-add", tr("workflow_ui_add_button", "添加按钮"), "", "plus")}</div><div class="aw-grid">${prop(tr("workflow_ui_message_timeout", "消息超时"), "_timeout", working._timeout, [["false", tr("workflow_ui_none", "不设置")], ["true", tr("workflow_ui_set_timeout", "设置超时")]])}${working._timeout === "true" ? prop(tr("workflow_ui_timeout_seconds", "超时秒数"), "_timeoutSeconds", working._timeoutSeconds, null, "number") : ""}</div>`;
        }
        if (dataDefinition || ["script", "notify", "ai-call"].includes(key)) output = outputField(http ? tr("workflow_ui_save_response_to", "保存响应至") : key === "ai-call" ? tr("workflow_ui_save_reply_to", "保存回复至") : key === "set" ? tr("workflow_ui_variable_name_label", "变量名") : tr("workflow_ui_save_result_to", "保存结果至"), working.output, "output", workspace, working.action === "set" ? working.valueType : dataDefinition?.outputType || (key === "ai-call" ? "text" : "any"));
      }
      const advanced = http || ["script", "ai-call", "family-refresh"].includes(working.action);
      if (parameterTab === "advanced") {
        content = working.action === "script" ? prop(tr("workflow_ui_execution_timeout_seconds", "执行超时（秒）"), "seconds", working.seconds, null, "number")
          : prop(http ? tr("workflow_format_timeout", "请求超时（1–$max$ 秒）", { max: flow.httpMaxTimeout }) : tr("workflow_ui_request_timeout_seconds", "请求超时（秒）"), "requestTimeoutSeconds", working.requestTimeoutSeconds, null, "number");
        output = "";
        if (working.action === "ai-call") {
          content += valueField(tr("workflow_ui_conversation_history_input", "传入对话历史"), working.context, "context", workspace, [], "list");
          content += valueField(tr("workflow_ui_tool_results_input", "传入工具结果"), working.toolResults, "toolResults", workspace, [], "list");
          content += toolChoices(state, working.toolIds);
          output = outputField(tr("workflow_ui_save_updated_conversation_history_to", "保存对话历史至"), working.contextOutput, "contextOutput", workspace, "list") +
            outputField(tr("workflow_ui_save_tool_requests_to", "保存工具请求至"), working.toolRequestsOutput, "toolRequestsOutput", workspace, "list");
        }
      } else if (parameterTab === "error") {
        content = flow.failable(working) ? prop(tr("workflow_ui_error_policy", "处理方式"), "onError", working.onError, [["throw", tr("workflow_ui_pass_to_try_catch_fail_if_uncaught", "交给 Try/Catch，未捕获则结束失败")], ["continue", tr("workflow_ui_save_failure_and_continue", "保存失败结果并继续")]]) + outputField(tr("workflow_ui_save_execution_result_to", "执行结果保存至"), working.errorOutput, "errorOutput", workspace, "result")
          : `<p class="aw-hint">${esc(tr("workflow_ui_try_catch_handles_errors_an_uncaught_error_ends_the_run", "异常交给流程中的 Try/Catch；未捕获时结束本次运行。"))}</p>`;
        output = "";
      }
      const paramTabs = [["general", tr("workflow_ui_general", "常规")], ...(advanced ? [["advanced", tr("workflow_ui_advanced", "高级")]] : []), ...(flow.failable(working) ? [["error", tr("workflow_ui_error_handling", "错误处理")]] : [])];
      formHtml(container, `<div class="aw aw-form"><div class="aw-tabs aw-param-tabs" role="tablist" aria-label="${esc(tr("workflow_ui_action_parameters", "指令参数"))}">${paramTabs.map(([id, label]) => `<button type="button" role="tab" data-parameter-tab="${id}" aria-selected="${id === parameterTab}" tabindex="${id === parameterTab ? 0 : -1}">${label}</button>`).join("")}</div><div role="tabpanel" aria-label="${paramTabs.find(([id]) => id === parameterTab)?.[1]}">${content ? `<div class="aw-section">${parameterTab === "general" ? `<h4>${esc(tr("workflow_ui_action_inputs", "指令输入"))}</h4>` : ""}${content}</div>` : ""}${output ? `<div class="aw-section"><h4>${esc(tr("workflow_ui_action_outputs", "指令输出"))}</h4>${output}</div>` : ""}</div><div class="aw-test-result" data-test-result role="status" hidden></div><div class="aw-error" role="alert"></div></div>`);
      if (promptError) container.querySelector(".aw-error").textContent = promptError;
      if (previewText) { const result = container.querySelector("[data-test-result]"); result.hidden = false; result.textContent = previewText; }
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
      if (working.action === "record" && working.entries) for (const entry of working.entries) {
        entry.key = entry.key.trim();
        if (typeof entry.omitIfUnset === "string") entry.omitIfUnset = entry.omitIfUnset === "true";
      }
      if (container.querySelector("[data-allowed-tool]")) {
        const selected = chosenTools(container);
        if (selected.length) working.toolIds = selected;
        else delete working.toolIds;
      }
      if (working.action === "notify") {
        if (working.messageType === "notification") { delete working.buttons; delete working.timeout; }
        else {
          working.buttons ??= [{ id: flow.numericId("button-", []), label: tr("common_continue", "继续"), icon: "view" }];
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
      if (working.action === "record") { delete config.value; delete config.entries; }
      for (const [key, value] of flow.inputs(working)) {
        if (!key.startsWith("inputs.") && !key.startsWith("libraryInputs.") && !key.startsWith("entries.")) config[key] = values.comparable(value);
      }
      if (working.action === "record" && working.entries) config.entries = working.entries.map(entry => ({ ...entry, value: values.comparable(entry.value) }));
      if (working.action === "library-call") config.libraryInputs = Object.fromEntries(Object.entries(working.libraryInputs)
        .filter(([, value]) => !value.unset).map(([id, value]) => [id, values.comparable(value)]));
      if (mapping) {
        config.inputs = Object.fromEntries(promptMapping(working)
          .map(({ key, value }) => [key, values.comparable(value)])
          .filter(([, value]) => JSON.stringify(value) !== emptyInput));
      } else if (inputs) config.inputs = Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, values.comparable(value)]));
      if (working.condition) config.condition = comparableCondition(working.condition);
      if (working.kind === "if") config.branches = working.branches.map(branch => ({ ...branch, condition: comparableCondition(branch.condition) }));
      const outputNames = Object.entries(values.outputEntries(container, workspace)).flatMap(([slot, entry]) => {
        const original = workspace.variables.find(item => item.id === entry.id)?.name || entry.id || "";
        return entry.name === original ? [] : [[slot, entry.name]];
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
      if (target.action === "library-call") {
        for (const [id, value] of Object.entries(target.libraryInputs)) if (value.unset) delete target.libraryInputs[id];
        for (const [id, value] of Object.entries(target.libraryOutputs)) if (!value) delete target.libraryOutputs[id];
        const library = editor.customLibraries.find(item => item.id === target.libraryId);
        const issue = model.libraryBindingIssue(library, target, clean);
        if (issue) throw issue;
      }
      if (editor.originalVariableIds) for (const [path, entry] of Object.entries(root.STWorkflowValues.outputEntries(container, workspace))) {
        const variable = clean.variables.find(item => item.id === get(target, path));
        if (variable && !editor.originalVariableIds.has(variable.id)) variable.type = entry.type;
      }
      if (target.action === "ai-call") {
        const rows = promptMapping(target);
        await root.STWorkflowValues.compile({ ...target, mapping: rows.filter(item => !isOriginalInput(item)) }, clean);
        target.inputs = Object.fromEntries(rows.map(item => [item.key, isOriginalInput(item) ? target.inputs[item.originalKey] : item.value]));
        if (JSON.stringify(values.comparable(target.context)) === emptyInput) delete target.context;
        if (JSON.stringify(values.comparable(target.toolResults)) === emptyInput) delete target.toolResults;
        if (!target.contextOutput) delete target.contextOutput;
        if (!target.toolRequestsOutput) delete target.toolRequestsOutput;
      }
      if (target.action === "tool-call" && target.toolMode !== "registered") delete target.toolId;
      if (http) {
        if (editor.inTool) target.origin = flow.staticHttpOrigin(target.url) || target.origin || "";
        else delete target.origin;
        if (!flow.hasHttpBody(target.method)) delete target.body;
        if (editor.inTool) {
          target.keyHeader = target.keyHeader?.trim();
          if (!target.keyHeader) delete target.keyHeader;
        }
      }
      delete target.mapping; delete target._timeout; delete target._timeoutSeconds;
      if (target.onError === "throw") delete target.onError;
      if (target.action !== "ai-call") await root.STWorkflowValues.compile(target, clean);
      if (target.action === "script") {
        const module = await import(root.chrome.runtime.getURL("settings/pages/workflow-code.js"));
        const source = target.code.map(part => typeof part === "string" ? part : module.scriptReference(part, clean)).join("");
        target.code = module.scriptParts(source, clean);
      }
      if (editor.originalVariableIds) { const used = JSON.stringify(clean.steps); clean.variables = clean.variables.filter(item => editor.originalVariableIds.has(item.id) || used.includes('"' + item.id + '"')); }
      const loopDepth = tools.loopDepth(clean, row.path);
      flow.validate(clean, { target, loopDepth });
      return { clean, target };
    }
    function showPreview(text) {
      previewText = text;
      const result = container.querySelector("[data-test-result]");
      if (result) { result.hidden = false; result.textContent = text; }
      const button = container.closest("dialog")?.querySelector('[data-dialog-action="test"]');
      if (button) button.textContent = previewId ? tr("workflow_ui_stop_test", "停止试运行") : testLabel;
    }
    async function stopPreview() {
      const id = previewId; if (!id) return;
      previewId = null;
      const result = await view().rpc("cancel-instruction-test", { id });
      if (!previewId && !lifetime.signal.aborted) showPreview(result?.uncertain ?
        tr("workflow_script_preview_uncertain", "试运行已停止，已发送的写请求结果待核实") : tr("workflow_ui_test_stopped", "试运行已停止"));
    }
    async function runPreview() {
      if (previewId) return stopPreview();
      if (preparingPreview) return;
      let clean, trial, samples, confirmNetwork = false;
      preparingPreview = true;
      try {
        const permission = flow.instructionPermission(working.action);
        if (permission) {
          const membership = await state.ctx.storage.getMembership();
          if (lifetime.signal.aborted) return;
          if (!root.STSettingsMembership.permission(permission, membership)) {
            showPreview(flow.permissionDenial(permission, membership, root.STI18n.text));
            return;
          }
        }
        if (working.action === "ai-call") { collectAll(); if (!validatePromptInputs()) return; }
        const preparedFlow = await prepared();
        clean = preparedFlow.clean;
        const target = preparedFlow.target;
        trial = target.kind === "if" ? { ...target, branches: [{ condition: target.branches[branch].condition, steps: [] }], otherwise: null } : target;
        if (trial.action === "ai-call" && trial.toolResults) {
          const labels = [
            [tr("workflow_ui_conversation_history_input", "传入对话历史"), trial.context ?? null],
            [tr("workflow_ui_tool_results_input", "传入工具结果"), trial.toolResults],
          ];
          showPreview([
            tr("workflow_ui_tool_binding_preview", "工具结果绑定预览 · 请求在运行时生成"),
            tr("workflow_ui_tool_results_help", "待处理工具结果会沿用原请求的消息和模型参数。常规页的提示词用于发起新的提问。"),
            JSON.stringify(Object.fromEntries(labels), null, 2),
          ].join("\n"));
          return;
        }
        samples = await testValues(state, clean, [trial]);
        const networkScript = samples && trial.action === "script" && editor.context !== "tool" &&
          (await import(root.chrome.runtime.getURL("settings/pages/workflow-code.js"))).scriptNetwork(trial.code).used;
        if (samples && (http || networkScript)) {
          const answer = await state.ctx.dialog(state.shadow, { title: tr("workflow_ui_send_test_request", "发送测试请求"), className: "aw-automation-dialog",
            message: networkScript ? tr("workflow_script_network_preview", "脚本可能发送真实 HTTP 请求并修改目标站点的数据。") :
              [trial.method + " " + (flow.staticHttpOrigin(trial.url) || ""), tr("workflow_ui_this_sends_a_real_request_to_this_site", "本次操作会向该站点发送真实请求。")].join("\n"),
            actions: [{ id: "cancel", label: tr("common_cancel", "取消") }, { id: "send", label: tr("workflow_ui_send_request", "发送请求"), primary: true }],
          });
          if (answer !== "send") samples = null;
          else confirmNetwork = true;
        }
      } finally { preparingPreview = false; }
      if (!samples || lifetime.signal.aborted) return;
      const id = root.crypto.randomUUID(); previewId = id; showPreview(tr("workflow_ui_running", "正在运行…"));
      try {
        const result = await view().rpc("test-instruction", { id, workflow: { ...clean, steps: [trial] }, confirmNetwork, ...samples });
        if (previewId !== id || lifetime.signal.aborted) return;
        previewId = null;
        if (result.cancelled) { showPreview(tr("workflow_ui_test_stopped", "试运行已停止")); return; }
        for (const failure of result.failures) rememberSiteIssue(editor, trial, failure.error || failure);
        const status = result.failures.length ? tr("workflow_ui_failed_continued_as_configured", "失败，已按配置继续") : trial.action === "ai-call" ? tr("workflow_ui_request_preview_not_sent", "请求预览 · 未发送") : tr("workflow_ui_run_completed", "运行完成");
        showPreview(`${status} · ${Math.round(result.milliseconds)} ms\n${JSON.stringify(result.failures.length ? result.failures : result.value, null, 2)}`);
      } catch (error) {
        if (previewId !== id || lifetime.signal.aborted) return;
        previewId = null;
        rememberSiteIssue(editor, trial, error);
        showPreview(tr("workflow_ui_run_failed", "运行失败") + "\n" + view().errorCaption(error));
      }
    }
    const instructionKey = instructions.key({ ...row, node: working });
    const permission = flow.instructionPermission(instructionKey);
    const titleBadge = permission ? document.createElement("span") : null;
    const hint = instructions.hint(instructionKey);
    let subtitle = hint;
    if (titleBadge) {
      titleBadge.className = "aw-name-badge";
      titleBadge.textContent = permissionLabel();
      titleBadge.setAttribute("aria-hidden", "true");
      const note = document.createElement("span");
      note.className = "aw-donation-info";
      note.textContent = flow.permissionNotice(permission, root.STI18n.text);
      subtitle = document.createDocumentFragment();
      const line = document.createElement("span");
      line.className = "aw-permission-line";
      const link = document.createElement("a");
      link.className = "aw-donation-link";
      link.textContent = tr("onboarding_supportTheDeveloper", "我要赞助开发者");
      root.STConfig.externalNavigation.applyToLink(link, root.STConfig.urls.donate);
      line.append(note, link);
      subtitle.append(hint, line);
    }
    const testLabel = working.action === "ai-call" ? tr("workflow_ui_preview_request", "预览请求") : tr("workflow_ui_run_action", "运行指令");
    try { return await state.ctx.dialog(state.shadow, { title: instructions.name(instructionKey), titleBadge, subtitle, icon: instructions.iconUrl(instructionKey), iconClass: instructions.iconTone(instructionKey), className: "aw-param-dialog", form: true,
      isDirty: hasUnsavedChanges,
      initial: () => issue?.field && working.action === "ai-call" ? promptErrorControl(issue) : null,
      render: node => {
        container = node; render(); initial = draftSignature();
        if (issue?.field && working.action === "ai-call") {
          node.querySelector(".aw-error").textContent = view().errorCaption(issue);
          promptErrorControl(issue)?.setAttribute("aria-invalid", "true");
        }
        values.bind(node, working, workspace, { dialog: state.ctx.dialog, shadow: state.shadow, render, scriptEditor: () => codeEditor,
          selectValue(value) { useWholeDictionaryValue(); working.value = flow.inputValue(value); }, signal: lifetime.signal });
        node.addEventListener("input", event => {
          if (event.target.matches("[data-tool-search]")) {
            searchToolChoices(node, event.target.value);
            return;
          }
          syncRecordPolicies();
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
            if (working.action === "library-call" && event.target.matches('[data-prop="libraryId"]') && selectedLibrary !== working.libraryId) {
              selectedLibrary = working.libraryId;
              working.libraryInputs = {}; working.libraryOutputs = {};
              values.clearOutputs(workspace, "libraryOutputs.");
              render();
              node.querySelector('[data-prop="libraryId"]')?.focus({ preventScroll: true });
              return;
            }
            if (event.target.hasAttribute("data-library-input")) {
              const key = event.target.dataset.libraryInput;
              if (event.target.checked) {
                const field = editor.customLibraries.find(item => item.id === working.libraryId).parameters.find(item => item.variableId === key);
                working.libraryInputs[key] = unboundLibraryInput(field.type);
              } else delete working.libraryInputs[key];
              render();
              node.querySelector('[data-library-input="' + CSS.escape(key) + '"]')?.focus({ preventScroll: true });
              return;
            }
            if (event.target.matches("[data-record-mode]")) {
              if (event.target.value === "fields") {
                recordExpanded = true;
                if (!working.entries) {
                  recordValue = working.value; delete working.value;
                  working.entries = recordEntries ?? [];
                }
              } else if (requiredDictionary() && recordValue === undefined) recordExpanded = false;
              else if (working.entries) useWholeDictionaryValue();
              render(); node.querySelector("[data-record-mode]").focus(); return;
            }
            if (event.target.matches("[data-record-policy]")) syncRecordPolicies();
            if (http && event.target.matches('[data-prop="method"]') || event.target.matches('[data-prop="toolMode"]')) { render(); return; }
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
            if (event.target.hasAttribute("data-prompt-rebind")) {
              const targetName = event.target.dataset.promptRebind;
              const sourceName = root.STSearchCombo.controlValue(event.target);
              const original = working.mapping.find(item => item.key === sourceName);
              const target = working.mapping.find(item => item.key === targetName);
              target.value = original.value;
              target.originalKey = original.originalKey;
              working.mapping.splice(working.mapping.indexOf(original), 1);
              render();
              promptErrorControl({ field: "inputs", parameter: targetName })?.focus();
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
          if (event.target.closest("[data-code-size]")) { container.closest(".aw-param-dialog").classList.toggle("aw-code-expanded"); return; }
          const control = event.target.closest("[data-aw]"); if (!control) return;
          event.stopPropagation();
          void (async () => {
            collectAll(); const action = control.dataset.aw;
            if (action === "record-edit-bindings") {
              recordExpanded = true;
              render(); node.querySelector('[data-prop="entries.0.key"]').focus();
              return;
            }
            if (action === "record-add" || action === "record-fill" || action === "record-remove") {
              const entries = working.entries;
              let index = entries.length;
              if (action === "record-add") entries.push({ key: "", value: flow.literal(""), omitIfUnset: false });
              else if (action === "record-fill") {
                entries.push(...recordParameters().map(item => ({
                  key: item.name, value: flow.reference("variable", item.variableId), omitIfUnset: !item.required,
                })));
                if (requiredDictionary() && recordValue === undefined) recordExpanded = false;
              }
              else { index = Number(control.dataset.index); entries.splice(index, 1); }
              render();
              (node.querySelector(`[data-prop="entries.${Math.min(index, entries.length - 1)}.key"]`) ??
                node.querySelector('[data-aw="record-add"],[data-aw="record-edit-bindings"]')).focus();
              return;
            }
            if (action === "variable-new") { const id = await editVariable(state, workspace); if (id) set(working, control.dataset.target, id); }
            else if (action === "condition-add") get(working, control.dataset.path).children.push(flow.comparison());
            else if (action === "condition-delete") { const path = control.dataset.path.split("."), index = Number(path.pop()); flow.pathGet(working, path).splice(index, 1); }
            else if (action === "button-add") working.buttons.push({ id: flow.numericId("button-", working.buttons), label: "", icon: "view" });
            else if (action === "button-delete") {
              const answer = await confirm(state, tr("workflow_ui_delete_interactive_button", "删除交互按钮"), tr("workflow_ui_this_button_will_be_removed_check_any_remaining_branches_tha", "将删除这个按钮，保留流程中的判断分支。请同时检查引用该按钮的条件。"));
              if (answer) working.buttons.splice(Number(control.dataset.index), 1);
            }
            else if (action === "catch-toggle" || action === "finally-toggle") {
              const key = action === "catch-toggle" ? "catch" : "finally";
              if (working[key] === null) working[key] = [];
              else if (await confirm(state, tr("common_delete", "删除") + " " + key, tr("workflow_ui_this_branch_and_all_its_steps_will_be_deleted", "将删除该分支及其全部步骤。"))) working[key] = null;
            }
            render();
          })().catch(error => reportFailure(error, node.querySelector(".aw-error")));
        });
      }, actions: [...(flow.previewable(working) ? [{ id: "test", label: testLabel }] : []), { id: "cancel", label: tr("common_cancel", "取消") }, { id: "save", label: tr("common_confirm", "确定"), primary: true }],
      onAction: async (action, node) => {
        if (action === "test") { void runPreview().catch(error => reportFailure(error, node.querySelector(".aw-error"))); return false; }
        if (action !== "save") return true;
        try {
          collectAll();
          if (working.action === "ai-call" && !validatePromptInputs(true)) return false;
          const current = working.action === "ai-call" ? { ...working, mapping: promptMapping(working).filter(item => !isOriginalInput(item)) } : working;
          await root.STWorkflowValues.compile(current, workspace);
          const named = await resolveOutputNames(state, container, workspace, working); if (!named) return false;
          const { clean } = await prepared(named);
          snapshot(editor); Object.assign(editor.draft, clean); return true;
        }
        catch (error) {
          const target = node.querySelector(".aw-error");
          if (insertionOwner) {
            if (error.code !== "WORKFLOW_CONFIG_INVALID") view().reportFailure(error, null);
            target.textContent = view().validationCaption(error);
            markParameterInsertionError(error);
          } else reportFailure(error, target);
          return false;
        }
      },
    }); } finally { lifetime.abort(); codeEditor?.destroy(); await stopPreview(); }
  }
  const triggerFieldName = field => instructions.schemaLabel(root.STWorkflowFields.labels[field] || root.STWorkflowFields.task[field] || field);
  const gameEvent = type => Object.hasOwn(gameEvents, type);
  const triggerMode = type => gameEvent(type) ? "automatic" : type;

  function triggerConditionFields(type) {
    if (type === "schedule") return ["logged_in", "has_family"];
    return [...Object.keys(root.STWorkflowFields.labels), "target_name", "achievement_language", "untranslated_count", "achievement_count"];
  }

  function triggerEventFields(type) {
    const labels = {
      id: tr("workflow_ui_event_id", "事件 ID"), type: tr("workflow_ui_event_type", "事件类型"),
      game: tr("workflow_ui_current_game", "本次游戏"), "game.official": instructions.schemaLabel("Steam 原名"), "game.appid": "AppID",
      appid: tr("workflow_ui_event_appid", "事件 AppID"), phase: tr("workflow_ui_installation_stage", "安装阶段"),
      scheduledAt: tr("workflow_ui_scheduled_time", "计划时间"), at: tr("workflow_ui_actual_trigger_time", "实际触发时间"),
      unconfirmed: tr("workflow_ui_account_not_confirmed", "账号未确认"),
    };
    return model.triggerEventPaths(type).map(path => [path, labels[path.join(".")]]);
  }

  const rangeChoices = () => instructions.schemaChoices(model.RANGES);
  const filterLeaves = condition => condition.children || [condition];
  const nestedFilter = condition => filterLeaves(condition).some(child => child.children);
  const filterWithoutValue = op => ["empty", "notEmpty", "unknown"].includes(op);
  const filterChoices = (field, op) => ["equals", "notEquals", "contains", "notContains"].includes(op)
    ? instructions.schemaChoices(root.STWorkflowFields.filterChoices[field] || []) : [];
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
    if (condition.children) return (condition.op === "all" ? tr("workflow_ui_match_all", "全部满足") : tr("workflow_ui_match_any", "任一满足")) +
      "（" + condition.children.map(filterSummary).join("，") + "）";
    const name = triggerFieldName(condition.field);
    if (root.STWorkflowFields.kind(condition.field) === "boolean") return name + (" · " + (filterBoolean(condition) ? tr("workflow_ui_is_true", "为真") : tr("workflow_ui_is_false", "为假")));
    let target = "";
    if (!filterWithoutValue(condition.op)) {
      if (condition.preset) target = rangeChoices().find(([id]) => id === condition.preset)?.[1] || condition.preset;
      else if (condition.op === "between") target = condition.min + "–" + condition.max;
      else target = filterValueLabel(condition);
    }
    return [name, instructions.schemaLabel(model.OPS[condition.op]), target].filter(item => item !== "").join(" · ");
  }

  async function editTriggerFilter(state, type, original, replaced = null) {
    const { searchComboHtml, bindSearchCombos } = root.STSearchCombo;
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
        if (kind === "date") value = prop(tr("workflow_ui_comparison_value", "比较值"), "preset", current.preset || "24h", rangeChoices().filter(([id]) => field === "date_release" || !id.startsWith("next")));
        else if (op === "between") value = prop(tr("workflow_ui_minimum", "最小值"), "min", current.min, null, "number") + prop(tr("workflow_ui_maximum", "最大值"), "max", current.max, null, "number");
        else if (choices.length) {
          const combo = searchComboHtml(choices.map(([value, label]) => ({ value, label })), {
            id: "aw-filter-value", label: tr("workflow_ui_comparison_value", "比较值"), text: current.value,
            value: choices.find(([, label]) => label === current.value)?.[0],
            placeholder: tr("workflow_ui_type_or_search", "输入或搜索"), expandLabel: tr("workflow_ui_show_comparison_values", "展开比较值列表"), emptyLabel: tr("settings_storePriceChart_combo_empty", "没有匹配项"), modal: true,
          });
          value = `<div class="aw-trigger-row"><label for="aw-filter-value">${esc(tr("workflow_ui_comparison_value", "比较值"))}</label>${combo}</div>`;
        }
        else value = prop(tr("workflow_ui_comparison_value", "比较值"), "value", current.value, null, kind === "number" ? "number" : "text");
      }
      formHtml(container, `<div class="aw aw-trigger-form aw-trigger-child">
        ${replaced ? `<div class="aw-note">${esc(tr("workflow_ui_current_filter", "当前筛选"))} · ${esc(filterSummary(replaced))}</div>` : ""}
        <div class="aw-grid">${prop(tr("workflow_ui_filter_field", "筛选字段"), "field", field, fields.map(id => [id, triggerFieldName(id)]))}
        ${kind === "boolean" ? `<label>${esc(tr("workflow_ui_operator", "关系"))}<select data-filter-boolean>${options([["true", tr("workflow_ui_is_true", "为真")], ["false", tr("workflow_ui_is_false", "为假")]], filterBoolean(current))}</select></label>`
          : prop(tr("workflow_ui_operator", "关系"), "op", op, model.operators(field).map(id => [id, instructions.schemaLabel(model.OPS[id])]))}
        ${value}</div><div class="aw-error" role="alert"></div></div>`);
    }
    const answer = await state.ctx.dialog(state.shadow, {
      title: replaced ? tr("workflow_ui_replace_filter", "替换筛选") : original ? tr("workflow_ui_edit_filter", "编辑筛选") : tr("workflow_ui_add_filter", "添加筛选"),
      className: "aw-param-dialog", form: true,
      initial: node => node.querySelector('[data-prop="field"]'),
      render(node) {
        container = node; render();
        bindSearchCombos(node, comboLife.signal, undefined, node, { closeOnMove: true });
        node.addEventListener("change", event => {
          const control = event.target;
          if (control.dataset.prop === "field") { current = start(control.value); render(); }
          else if (control.dataset.prop === "op") { read(node); render(); }
        });
      },
      actions: [{ id: "cancel", label: tr("common_cancel", "取消") }, { id: "save", label: replaced ? tr("workflow_ui_replace", "替换") : tr("common_confirm", "确定"), primary: true }],
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
          if (!triggerConditionFields(type).includes(result.field)) throw new TypeError(tr("workflow_ui_this_field_is_unavailable_for_this_trigger_type", "该字段不适用于当前触发方式"));
          model.validateCondition(result);
          return true;
        } catch (error) {
          if (!(error instanceof TypeError)) throw error;
          node.querySelector(".aw-error").textContent = view().errorCaption(error);
          return false;
        }
      },
    }).finally(() => comboLife.abort());
    return answer === "save" ? result : null;
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
    const radios = frequencies().map(([id, label]) => `<label><input type="radio" name="trigger-frequency" value="${id}" data-trigger-frequency${timing.mode === id ? " checked" : ""}>${label}</label>`).join("");
    let fields = "";
    if (timing.mode === "minute") fields = scheduleInput(tr("workflow_ui_interval_in_minutes", "间隔分钟"), "timing.every", timing.every, "number", 'min="1" step="1"');
    else if (timing.mode === "hour") fields = scheduleInput(tr("workflow_ui_minute_of_each_hour", "每小时第几分"), "timing.minute", timing.minute, "number", 'min="0" max="59" step="1"');
    else if (timing.mode === "cron") fields = scheduleInput(tr("workflow_ui_cron_expression", "时间表达式"), "timing.expression", timing.expression, "text",
      'placeholder="0 9 * * 1-5" spellcheck="false" aria-describedby="st-trigger-cron-format"') +
      `<p class="aw-note" id="st-trigger-cron-format">${esc(tr("workflow_ui_minute_hour_day_month_weekday", "分、时、日、月、星期"))}</p>`;
    else {
      if (timing.mode === "week") fields += `<fieldset class="aw-trigger-options"><legend>${esc(tr("workflow_ui_weekday", "星期"))}</legend>
        ${weekdays().map(([id, label]) => triggerCheck(label, `data-trigger-weekday value="${id}"`, timing.weekdays.includes(id))).join("")}</fieldset>`;
      if (timing.mode === "month") fields += scheduleInput(tr("workflow_ui_date", "日期"), "timing.day", timing.day, "number", 'min="1" max="31" step="1"');
      fields += scheduleInput(tr("settings_account_profileUsageTime", "时间"), "timing.time", timing.time, "time");
    }
    return `<fieldset class="aw-trigger-options"><legend>${esc(tr("workflow_ui_frequency", "执行频率"))}</legend>${radios}</fieldset>${fields}
      <div class="aw-trigger-row"><span>${esc(tr("workflow_ui_next_run", "下次触发"))}</span><output class="aw-trigger-preview" data-trigger-preview></output></div>
      ${triggerCheck(tr("workflow_ui_end_schedule", "定时结束"), 'data-schedule-toggle="endLocal"', event.endLocal !== undefined)}
      ${event.endLocal !== undefined ? scheduleInput(tr("workflow_ui_end_time", "结束时间"), "endLocal", event.endLocal, "datetime-local") : ""}`;
  }
  function scheduleSettings(event) {
    return `<div class="aw-trigger-setting">
      ${triggerCheck(tr("workflow_ui_daily_time_range", "每天起止时间"), 'data-schedule-toggle="window"', !!event.window)}
      ${event.window ? `<div class="aw-trigger-fields">
        ${scheduleInput(tr("workflow_ui_start_time", "开始时间"), "window.start", event.window.start, "time")}
        ${scheduleInput(tr("workflow_ui_end_time", "结束时间"), "window.end", event.window.end, "time")}</div>` : ""}
      ${triggerCheck(tr("workflow_ui_run_on_selected_dates", "按指定日历触发"), 'data-schedule-toggle="dates"', !!event.dates)}
      ${event.dates ? `<div class="aw-trigger-dates">
        <input type="date" aria-label="${esc(tr("workflow_ui_select_calendar_dates", "选择日历日期"))}" data-trigger-date>
        ${button("trigger-date-add", tr("workflow_ui_add_date", "添加日期"))}
        ${event.dates.map((date, index) => button("trigger-date-delete", date, `data-index="${index}" aria-label="${esc(tr("workflow_format_remove_item", "移除 $name$", { name: date }))}"`, "x")).join("")}
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
      throw new TypeError(tr("workflow_ui_no_run_is_scheduled_adjust_the_schedule_or_end_time", "当前设置没有可执行时间，请调整日程或定时结束时间"));
  }
  function scheduleLabel(event) {
    if (event.endsAt !== undefined && event.endsAt <= Date.now()) return tr("workflow_ui_ended", "已结束");
    const { timing } = event;
    if (timing.mode === "minute") return tr("workflow_format_every_minutes", "每隔 $count$ 分钟", { count: timing.every });
    if (timing.mode === "hour") return tr("workflow_format_every_hour", "每小时 $minute$ 分", { minute: String(timing.minute).padStart(2, "0") });
    if (timing.mode === "day") return tr("workflow_ui_daily", "每天") + " " + timing.time;
    if (timing.mode === "week") return weekdays().filter(([id]) => timing.weekdays.includes(id)).map(([, label]) => label).join("、") + " " + timing.time;
    if (timing.mode === "month") return tr("workflow_format_every_month", "每月 $day$ 日 $time$", { day: timing.day, time: timing.time });
    const workday = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+1-5$/.exec(timing.expression.trim());
    return workday ? tr("workflow_format_workdays", "周一至周五 $time$", { time: workday[2].padStart(2, "0") + ":" + workday[1].padStart(2, "0") }) : tr("workflow_ui_advanced_schedule", "高级日程");
  }
  async function editTrigger(state, original = null) {
    const clock = original?.enabled && original.event.type === "schedule" && original.event.timing.mode === "minute"
      ? await view().rpc("schedule-clock", { triggerId: original.id, revision: original.revision }) : null;
    const draft = original ? flow.clone(original) : model.newTrigger(flow.numericId("trigger-", state.bundle.triggers), "", tr("workflow_ui_untitled_trigger", "未命名触发器"));
    if (!original) draft.enabled = true;
    draft.mapping = Object.entries(draft.inputs).map(([key, value]) => ({ key, value }));
    if (draft.event.type === "schedule" && draft.event.endsAt !== undefined) {
      draft.event.endLocal = localDateTime(draft.event.endsAt);
      delete draft.event.endsAt;
    }
    const eventDrafts = new Map(), timingDrafts = new Map(), hiddenScheduleOptions = new Map(), workflowMappings = new Map();
    const workspace = { variables: [], triggerInput: true, compactTypes: true, eventFields: [] }, lifetime = new AbortController();
    const currentWorkflow = () => state.bundle.workflows.find(item => item.id === draft.workflowId);
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
      collect(container, draft, workspace);
      draft.enabled = enabled?.checked ?? draft.enabled;
      draft.busy = container.querySelector("[data-trigger-queue]").checked ? "queue" : "ignore";
      const limit = container.querySelector("[data-trigger-limit]").valueAsNumber;
      if (!Number.isSafeInteger(limit) || limit < 0 || !Number.isSafeInteger(limit * calendar.MINUTE + Date.now()))
        throw Object.assign(new Error(tr("workflow_ui_enter_a_valid_time_limit_in_minutes", "请输入有效的运行时限分钟数")), { code: "WORKFLOW_FORM_INVALID_NUMBER" });
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
        output.value = next === null ? (event.endsAt <= now ? tr("workflow_ui_ended", "已结束") : tr("workflow_ui_no_run_is_scheduled", "当前设置没有可执行时间"))
          : new Date(next).toLocaleString(root.STI18n.intlLocale(), { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
        if (next !== null && event.timing.mode === "cron") output.value += " · " + scheduleLabel(event);
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        output.value = view().errorCaption(error);
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
        const mapping = peer ? flow.clone(peer.mapping) : [];
        next = { event, conditions: peer ? flow.clone(peer.conditions) : model.group(), mapping };
      }
      Object.assign(draft, next);
      if (gameEvent(type)) lastGameEvent = type;
    }

    function filterSection() {
      const nested = nestedFilter(draft.conditions), items = filterLeaves(draft.conditions);
      const filters = nested
        ? `<div class="aw-trigger-summary"><span>${esc(filterSummary(draft.conditions))}</span>${iconButton("conditions-clear", tr("steam_independentName_removeFilter", "移除筛选"), "trash")}</div>`
        : items.map((item, index) => {
          const summary = filterSummary(item), attrs = `data-index="${index}"`;
          return `<div class="aw-trigger-summary">${button("condition-edit", summary, `class="aw-trigger-summary-edit" ${attrs} aria-label="${esc(tr("workflow_format_filter_edit", "编辑筛选 $name$", { name: summary }))}"`)}
            ${iconButton("condition-delete", tr("steam_independentName_removeFilter", "移除筛选") + " " + summary, "trash", attrs)}</div>`;
        }).join("");
      return `<section class="aw-section"><div class="aw-trigger-summary"><h4>${esc(tr("workflow_ui_filter_conditions", "筛选条件"))}</h4>
        ${nested ? button("condition-replace", tr("workflow_ui_replace_filter", "替换筛选")) : button("condition-add", tr("workflow_ui_add_filter", "添加筛选"), "", "plus")}</div>
        ${!nested && items.length > 1 ? `<div class="aw-grid">${prop(tr("workflow_ui_match_mode", "匹配方式"), "conditions.op", draft.conditions.op, [["all", tr("workflow_ui_match_all", "全部满足")], ["any", tr("workflow_ui_match_any", "任一满足")]])}</div>` : ""}
        ${filters ? `<div class="aw-trigger-list">${filters}</div>` : ""}</section>`;
    }

    function inputSection() {
      const workflow = currentWorkflow();
      if (!workflow) return "";
      const description = workflow.description ? `<p class="aw-entry-description">${esc(workflow.description)}</p>` : "";
      if (!workflow.inputParameters) return description + `<p class="aw-note">${esc(tr("workflow_parameter_upgrade_required", "请先在工作流中更新「触发器传参」。"))}</p>`;
      if (!workflow.inputParameters.length && !description) return "";
      const rows = workflow.inputParameters.map(({ name, type, variableId }) => {
        const index = draft.mapping.findIndex(item => item.key === variableId), item = draft.mapping[index];
        const attrs = `data-key="${esc(variableId)}"`;
        if (!item) return `<div class="aw-trigger-parameter"><span>${esc(name)}</span>
          ${button("binding-add", tr("workflow_parameter_bind_source", "设置来源"), attrs)}<span></span></div>`;
        const issue = model.triggerParameterIssue({ name, type }, item.value, draft.event.type, false);
        return `<div class="aw-trigger-parameter">${valueField(name, item.value, `mapping.${index}.value`, workspace, [], type, false, [], type === "any")}
          ${iconButton("binding-remove", tr("workflow_format_input_remove", "移除输入 $name$", { name }), "x", attrs)}
          ${issue ? `<small class="aw-error">${esc(view().errorCaption(issue))}</small>` : ""}</div>`;
      }).join("");
      return `<section class="aw-section"><h4>${esc(tr("workflow_parameter_binding", "触发传参"))}</h4>${description}${rows}</section>`;
    }

    function render() {
      const { event } = draft, mode = triggerMode(event.type), moreOpen = container.querySelector(".aw-trigger-more")?.open;
      workspace.eventFields = triggerEventFields(event.type);
      const choices = [["", workflowChoices.length ? tr("workflow_ui_select_a_workflow", "请选择工作流") : tr("workflow_ui_create_a_workflow_first", "请先新建工作流"), true], ...workflowChoices];
      if (draft.workflowId && !workflowChoices.some(([key]) => key === draft.workflowId)) choices.splice(1, 0, [draft.workflowId, tr("workflow_ui_deleted", "已删除：") + draft.workflowId]);
      const radios = (name, legend, entries, selected) => `<fieldset class="aw-trigger-options"><legend>${legend}</legend>
        ${entries.map(([id, label]) => `<label><input type="radio" name="${name}" data-${name} value="${id}"${selected === id ? " checked" : ""}>${label}</label>`).join("")}</fieldset>`;
      const game = mode === "automatic" ? `<label>${esc(tr("workflow_ui_trigger_event", "什么情况下触发"))}<select data-trigger-event>${options(Object.entries(gameEvents), event.type)}</select></label>` : "";
      const stages = event.type === "installed" ? radios("trigger-phase", tr("workflow_ui_installation_stage", "安装阶段"), installStages(), event.phase) : "";
      const local = event.type === "schedule" ? scheduleForm(event) : "";
      const interval = event.type === "schedule" && scheduleLimitsAvailable(event) ? scheduleSettings(event) : "";
      formHtml(container, `<div class="aw aw-trigger-form"><div class="aw-grid">
        <div class="aw-trigger-name">${prop(tr("workflow_ui_trigger_name", "触发器名称"), "name", draft.name)}${itemNoteButton(draft.note)}</div>
        ${prop(tr("workflow_ui_workflow_name", "工作流名称"), "workflowId", draft.workflowId, choices)}
        ${radios("trigger-mode", tr("workflow_ui_trigger_type", "触发方式"), Object.entries(triggerModes), mode)}${game}${stages}${local}</div>
        <div class="aw-error" role="alert"></div>
        ${mode === "automatic" ? filterSection() : ""}${inputSection()}
        <details class="aw-trigger-more"${moreOpen ? " open" : ""}><summary>${icon("chevron-right", "aw-disclosure")}${esc(tr("workflow_ui_more_settings", "更多设置"))}</summary>
          ${interval ? `<div class="aw-section">${interval}</div>` : ""}
          <div class="aw-section">${triggerCheck(tr("workflow_ui_queue_run", "排队执行"), "data-trigger-queue", draft.busy === "queue")}
            <label class="aw-trigger-limit">${esc(tr("workflow_ui_stop_runs_longer_than", "运行超过"))}<input type="number" min="0" step="1" title="${esc(tr("workflow_ui_0_for_unlimited", "0 表示不限"))}" aria-label="${esc(tr("workflow_ui_time_limit_in_minutes_0_for_unlimited", "运行时限（分钟，0 不限）"))}" data-trigger-limit value="${draft.maxRunMinutes ?? 0}">${esc(tr("workflow_ui_minutes", "分钟后强制结束"))}</label>
          </div>${mode !== "automatic" ? filterSection() : ""}</details></div>`);
      updateSave();
      previewSchedule();
    }

    function showFailure(error) {
      if (error.code === "WORKFLOW_FORM_INVALID_NUMBER") showError(view().errorCaption(error), true);
      else reportFailure(error, container.querySelector(".aw-error"));
    }

    await state.ctx.dialog(state.shadow, {
      title: original ? tr("workflow_ui_edit_trigger", "编辑触发器") : tr("workflow_ui_new_trigger", "新建触发器"), className: "aw-param-dialog", form: true, isDirty,
      renderFooter(actions) {
        const label = document.createElement("label");
        label.className = "aw-trigger-enabled";
        enabled = document.createElement("input"); enabled.type = "checkbox"; enabled.checked = draft.enabled;
        enabled.addEventListener("change", previewSchedule);
        label.append(enabled, tr("common_enable", "启用")); actions.prepend(label);
        saveButton = actions.querySelector('[data-dialog-action="save"]');
        updateSave();
      },
      render(node) {
        container = node; render();
        root.STWorkflowValues.bind(node, draft, workspace, { dialog: state.ctx.dialog, shadow: state.shadow, render, signal: lifetime.signal });
        readDraft(); initial = signature();
        node.addEventListener("input", event => {
          updateSave();
          if (clock || event.target.hasAttribute("data-schedule-value")) previewSchedule();
        });
        node.addEventListener("change", event => {
          const control = event.target;
          if (control.dataset.prop === "workflowId") {
            try {
              const previous = draft.workflowId;
              readDraft();
              workflowMappings.set(previous, draft.mapping);
              draft.mapping = workflowMappings.get(draft.workflowId) || [];
              eventDrafts.clear();
              render();
            } catch (error) { showFailure(error); }
            return;
          }
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
            if (action === "item-note") {
              editingChild = true;
              const value = draft.note ?? "";
              const note = await noteDialog(state, value, tr("store_titleCustomName_noteTab", "备注"));
              if (note !== null && note !== value && !lifetime.signal.aborted) {
                draft.note = note;
                control.toggleAttribute("data-has-note", !!note.trim());
              }
              return;
            }
            readDraft();
            let focus = '[data-aw="' + action + '"]';
            if (action === "binding-add" || action === "binding-remove") {
              const { key } = control.dataset;
              const parameter = currentWorkflow()?.inputParameters?.find(item => item.variableId === key);
              if (!parameter) return;
              if (action === "binding-add") {
                focus = `[data-value="mapping.${draft.mapping.length}.value"] :is([data-value-text],[data-variable-toggle],[data-field-action])`;
                draft.mapping.push({ key, value: parameterSample(parameter.type) });
              } else {
                draft.mapping = draft.mapping.filter(item => item.key !== key);
                focus = `[data-aw="binding-add"][data-key="${CSS.escape(key)}"]`;
              }
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
              if (!date) { showError(tr("workflow_ui_select_a_date", "请选择日历日期。"), true); return; }
              if (!draft.event.dates.includes(date)) draft.event.dates = [...draft.event.dates, date].sort();
            } else if (action === "trigger-date-delete") {
              draft.event.dates.splice(index, 1); focus = "[data-trigger-date]";
            } else return;
            render(); node.querySelector(focus)?.focus({ preventScroll: true });
          })().catch(showFailure).finally(() => { editingChild = false; });
        });
      },
      actions: [{ id: "cancel", label: tr("common_cancel", "取消") }, { id: "save", label: tr("common_save", "保存"), primary: true }],
      async onAction(action) {
        if (action !== "save") return true;
        try {
          readDraft();
          const { mapping, ...trigger } = flow.clone(draft);
          trigger.name = trigger.name.trim();
          const workflow = state.bundle.workflows.find(item => item.id === trigger.workflowId);
          if (!trigger.name || !workflow) { showError(tr("workflow_ui_enter_a_trigger_name_and_choose_a_workflow", "请填写触发器名称并选择工作流。")); return false; }
          if (!workflow.inputParameters) {
            showError(tr("workflow_parameter_upgrade_required", "请先在工作流中更新「触发器传参」。")); return false;
          }
          trigger.inputs = Object.fromEntries(mapping.map(item => [item.key, item.value]));
          const issue = model.inputBindingIssue(workflow, trigger.inputs, trigger.event.type, { allowMissing: !trigger.enabled });
          if (issue) { showError(view().errorCaption(issue)); return false; }
          const fields = triggerConditionFields(trigger.event.type);
          const unavailable = [...model.conditionFields(trigger.conditions)].find(field => !fields.includes(field));
          if (unavailable) { showError(tr("workflow_format_filter_unavailable", "筛选「$name$」不适用于当前触发方式。", { name: triggerFieldName(unavailable) }), triggerMode(trigger.event.type) !== "automatic"); return false; }
          model.validateCondition(trigger.conditions, { allowBlank: !trigger.enabled });
          if (original && signature() === initial) return true;
          if (trigger.event.type === "schedule") {
            trigger.event = scheduleEvent(trigger.event);
            const changed = !original?.enabled || JSON.stringify(trigger.event) !== JSON.stringify(original.event);
            validateSchedule(trigger.event, trigger.enabled && changed);
          }
          const next = flow.clone(state.bundle), index = next.triggers.findIndex(item => item.id === trigger.id);
          if (index < 0) next.triggers.push(trigger); else next.triggers[index] = trigger;
          await save(state, next, index < 0 ? { section: "triggers", id: trigger.id } : undefined);
          return true;
        } catch (error) {
          if (error instanceof TypeError) showError(view().errorCaption(error));
          else showFailure(error);
          return false;
        }
      },
    }).finally(() => lifetime.abort());
  }
  async function runManual(state, trigger) {
    if (!trigger.enabled) throw new Error(tr("workflow_ui_enable_the_manual_trigger_first", "请先启用手动触发器"));
    const workspace = { variables: [], literalOnly: true, compactTypes: true };
    const workflow = state.bundle.workflows.find(item => item.id === trigger.workflowId);
    const parameters = workflow?.inputParameters;
    const values = parameters ? parameters.map(({ name, type, variableId: key }) => {
      const binding = flow.activeValue(trigger.inputs[key]);
      return { key, name, type, value: binding && Object.hasOwn(binding, "literal") ? flow.clone(binding) : parameterSample(type) };
    }) : Object.entries(trigger.inputs).map(([key, value]) => ({ key, name: key, type: "any", value: Object.hasOwn(value, "literal") ? flow.clone(value) : flow.literal("") }));
    const gameFilter = parameters && [...model.conditionFields(trigger.conditions)].some(field => !["logged_in", "has_family"].includes(field));
    const lifetime = new AbortController();
    let container, filterAppIdText = "";
    const render = () => {
      filterAppIdText = container.querySelector("[data-filter-app-id]")?.value ?? filterAppIdText;
      formHtml(container, `<div class="aw aw-form">
        ${values.length ? values.map((item, index) => valueField(item.name, item.value, "values." + index + ".value", workspace, [], item.type)).join("") :
          gameFilter ? "" : `<span class="aw-note">${esc(tr("workflow_ui_no_inputs_configured_for_this_trigger", "此触发器未配置输入"))}</span>`}
        ${gameFilter ? `<label>${esc(tr("workflow_parameter_filter_app_id", "用于筛选的 AppID"))}<input type="number" min="1" step="1" data-filter-app-id value="${esc(filterAppIdText)}"></label>` : ""}
        <div class="aw-error" role="alert"></div></div>`);
    };
    const object = { values };
    await state.ctx.dialog(state.shadow, { title: tr("workflow_ui_run", "运行") + " · " + trigger.name, className: "aw-param-dialog", form: true,
      render: node => { container = node; render(); root.STWorkflowValues.bind(node, object, workspace, { dialog: state.ctx.dialog, shadow: state.shadow, render, signal: lifetime.signal }); node.addEventListener("change", event => {
        try { collect(node, object, workspace); }
        catch (error) { reportFailure(error, node.querySelector(".aw-error")); }
      }); }, actions: [{ id: "cancel", label: tr("common_cancel", "取消") }, { id: "run", label: tr("workflow_ui_run", "运行"), primary: true }],
      onAction: async (action, node) => {
        if (action !== "run") return true;
        try {
          collect(node, object, workspace);
          const inputs = Object.fromEntries(values.map(item => [item.key, flow.read(item.value, flow.state())]));
          const filterAppId = gameFilter ? node.querySelector("[data-filter-app-id]").valueAsNumber : undefined;
          if (gameFilter && !root.STAI.isToolAppId(filterAppId)) throw new TypeError(tr("workflow_parameter_filter_app_id_invalid", "请填写有效的筛选 AppID。"));
          if (workflow) model.workflowArguments(workflow, inputs);
          const result = await view().rpc("manual-run", { triggerId: trigger.id, inputs, ...(gameFilter && { filterAppId }) });
          if (!result.matched) throw new Error(tr("workflow_ui_trigger_conditions_were_not_met_the_workflow_did_not_start", "未满足触发条件，未启动工作流"));
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
      html(container, `<div class="aw aw-form"><div><strong>${esc(runStatus(job))}</strong><p>${esc(job.error || job.summary || "")}</p><span class="aw-note">${esc(job.trigger?.name || tr("workflow_ui_legacy_plan", "旧版方案"))}${node ? " · " + tr("workflow_ui_current_action", "当前指令") + " · " + esc(nodeName(node)) : ""}</span></div>
        <details open><summary>${icon("chevron-right", "aw-disclosure")}${esc(tr("workflow_ui_input_and_variables", "输入与变量"))}</summary><pre class="aw-pre" data-variables></pre></details><details open><summary>${icon("chevron-right", "aw-disclosure")}${esc(tr("workflow_ui_run_log", "运行日志"))}</summary><div data-run-log></div></details><div class="aw-tools">${button("job-refresh", tr("common_refresh", "刷新"))}${!job.finalized ? button("job-stop", tr("workflow_ui_stop_run", "停止运行")) : ""}</div><div class="aw-error" role="alert"></div></div>`);
      container.querySelector("[data-variables]").textContent = JSON.stringify(job.flow ? { [tr("seed_variable_input", "输入数据")]: job.flow.input, [tr("workflow_ui_variables", "变量列表")]: Object.fromEntries(Object.entries(job.flow.vars).map(([id, value]) => [workflow.variables.find(item => item.id === id)?.name || id, value])) } : {}, null, 2);
      const log = container.querySelector("[data-run-log]");
      const failures = (job.flow?.failures ?? []).map(item => ({ at: item.at, level: "error",
        text: [item.nodeId, item.toolNodeId, item.libraryNodeId, item.reason].filter(Boolean).join(" · ") }));
      for (const entry of [...(job.entries || []), ...failures].sort((a, b) => a.at - b.at)) { const line = document.createElement("p"); line.textContent = `${new Date(entry.at).toLocaleTimeString(root.STI18n.intlLocale())} · ${entry.level} · ${entry.text}`; log.appendChild(line); }
      if (!log.childElementCount) log.textContent = tr("workflow_ui_no_log_entries", "暂无打印日志");
    }
    await state.ctx.dialog(state.shadow, { title: job.workflow.name, className: "aw-param-dialog", form: true,
      render: node => { container = node; render(); node.addEventListener("click", event => {
        const control = event.target.closest("[data-aw]"); if (!control) return;
        void (async () => {
          if (control.dataset.aw === "job-stop") await view().rpc("stop-run", { id });
          job = await view().rpc("get", { id }); render();
        })().catch(error => reportFailure(error, node.querySelector(".aw-error")));
      }); }, actions: [{ id: "close", label: tr("settings_shell_close", "关闭") }],
    });
  }
  function referencesText(references) {
    return references.map(({ workflow, node }) => {
      const line = tools.lines(tools.openDraft(workflow)).get(node.id)?.number;
      return workflow.name + " · " + tr("workflow_format_line", "第 $count$ 行", { count: line });
    });
  }
  async function saveToolDefinition(state, tool, { confirmed = false, imported = false, bundle = state.bundle } = {}) {
    const next = flow.clone(bundle);
    next.tools ??= [];
    const index = next.tools.findIndex(item => item.id === tool.id);
    const current = next.tools[index];
    const refs = current && model.workflowDefinitionKey(current) !== model.workflowDefinitionKey(tool) ? toolReferences(next, tool.id) : [];
    if (!confirmed && refs.length) {
      const choice = await state.ctx.dialog(state.shadow, {
        title: tr("workflow_tool_update", "更新工具"),
        message: [tr("workflow_tool_affected", "以下指令引用了此工具，请检查与新定义的兼容性。"), ...referencesText(refs)].join("\n"),
        actions: [{ id: "cancel", label: tr("common_cancel", "取消") }, { id: "update", label: tr("workflow_tool_update", "更新工具"), primary: true }],
      });
      if (choice !== "update") return false;
    }
    if (index < 0) next.tools.push(tool);
    else next.tools[index] = tool;
    await save(state, next, index < 0 ? { section: "tools", id: tool.id, retainId: imported } : undefined);
    return true;
  }
  async function importTool(state, file) {
    const data = JSON.parse(await file.text());
    if (data?.type !== "steam-buff-tool" || data.schemaVersion !== 1)
      throw new Error(tr("workflow_tool_invalid_file", "工具文件类型或版本无效"));
    const tool = model.validateTool(data.tool);
    const bundle = state.bundle;
    const libraries = bundle.libraries ?? [];
    const issues = libraryIssues(tool, libraries);
    const lines = tools.lines(tools.openDraft(tool));
    const dependencyDetails = issues.map(issue => {
      const { row, number } = lines.get(issue.nodeId);
      const name = libraries.find(library => library.id === row.node.libraryId)?.name ?? row.node.libraryId;
      return [tr("workflow_format_line", "第 $count$ 行", { count: number }), name, view().errorCaption(issue)].join(" · ");
    });
    const importLabel = tr("workflow_tool_import", "导入 AI 工具");
    if (issues.length) {
      await state.ctx.dialog(state.shadow, {
        title: importLabel,
        message: [tool.name, ...dependencyDetails, tr("workflow_library_import_dependency", "请先导入所需的自定义库，核对字段后再导入 AI 工具。")].join("\n"),
        actions: [{ id: "close", label: tr("common_close", "关闭") }],
      });
      return;
    }
    const existing = (bundle.tools || []).find(item => item.id === tool.id);
    const refs = toolReferences(bundle, tool.id);
    const { sites, providers } = await toolPreview(tool, bundle);
    const details = [tool.name, tool.description, ...dependencyDetails, ...sites,
      ...providers,
      ...tool.parameters.map(item => item.name + " · " + toolTypeLabel(item.type) + (item.required ? " · " + tr("workflow_tool_required", "必填") : "")),
      ...[...flow.walk(tool.steps)].filter(node => node.action === "tool-return")
        .map(node => instructions.name("tool-return") + " · " + root.STWorkflowValues.text(node.value, tool))];
    if (refs.length) details.push("", tr("workflow_tool_affected", "以下指令引用了此工具，请检查与新定义的兼容性。"), ...referencesText(refs));
    const answer = await state.ctx.dialog(state.shadow, {
      title: importLabel, message: details.join("\n"),
      actions: [{ id: "cancel", label: tr("common_cancel", "取消") },
        ...(existing ? [{ id: "update", label: tr("workflow_tool_update", "更新工具") },
          { id: "copy", label: tr("workflow_tool_import_copy", "另存副本"), primary: true }] :
          [{ id: "import", label: importLabel, primary: true }])],
    });
    if (!["update", "copy", "import"].includes(answer)) return;
    if (answer === "copy") {
      tool.id = model.newTool(tool.name).id;
      tool.name = tools.copyName(tool.name);
    }
    tool.enabled = false;
    await saveToolDefinition(state, tool, { confirmed: true, imported: answer !== "copy", bundle });
  }
  async function editToolCredential(state, tool) {
    const nodes = [...flow.walk(tool.steps, true)].filter(node => node.action === "http-request" && node.keyHeader);
    if (!nodes.length) return;
    const epoch = state.bundle.epoch;
    let container;
    await state.ctx.dialog(state.shadow, {
      title: tr("workflow_tool_credentials", "本机密钥"), className: "aw-param-dialog", form: true,
      render(node) {
        container = node;
        formHtml(node, `<div class="aw aw-form"><label>${esc(tr("workflow_tool_credential_node", "HTTP 指令"))}
          <select data-credential-node>${options(nodes.map(item => [item.id, item.origin + " · " + item.keyHeader + " · " + item.id]), nodes[0].id)}</select></label>
          <label>${esc(tr("workflow_tool_key_value", "密钥值（含所需前缀）"))}<input type="password" autocomplete="off" data-key-value></label>
          <div class="aw-error" role="alert"></div></div>`);
      },
      actions: [{ id: "cancel", label: tr("common_cancel", "取消") }, { id: "clear", label: tr("workflow_tool_clear_key", "清除密钥") },
        { id: "save", label: tr("common_save", "保存"), primary: true }],
      async onAction(action) {
        if (!["save", "clear"].includes(action)) return true;
        const value = action === "clear" ? "" : container.querySelector("[data-key-value]").value;
        try {
          if (action === "clear" && !await confirm(state, tr("workflow_tool_clear_key", "清除密钥"),
            tr("workflow_tool_clear_key_confirm", "清除后，此 HTTP 指令需重新填写密钥才能运行。"))) return false;
          if (action === "save" && !value) throw new Error(tr("workflow_tool_key_required", "请输入密钥值"));
          const node = nodes.find(item => item.id === container.querySelector("[data-credential-node]").value);
          await view().rpc("tool-credential", { toolId: tool.id, nodeId: node.id, revision: tool.revision, executionId: tool.executionId,
            epoch, origin: node.origin, header: node.keyHeader, value });
          return true;
        } catch (error) { reportFailure(error, container.querySelector(".aw-error")); return false; }
      },
    });
  }
  function toolList(bundle, inLibrary = false) {
    const library = (inLibrary ? bundle.libraries : bundle.tools) ?? [];
    const prefix = inLibrary ? "library-" : "tool-";
    const importLabel = inLibrary ? tr("workflow_library_import", "导入自定义库") : tr("workflow_tool_import", "导入 AI 工具");
    const newLabel = inLibrary ? tr("workflow_library_new", "新建自定义库") : tr("workflow_tool_new", "新建 AI 工具");
    const editLabel = inLibrary ? tr("workflow_library_edit", "编辑自定义库") : tr("workflow_tool_edit", "编辑 AI 工具");
    const count = inLibrary ? tr("workflow_library_count", "$count$ 个库项", { count: library.length }) : tr("workflow_tool_count", "$count$ 个 AI 工具", { count: library.length });
    return `<div class="aw-toolbar"><span>${esc(count)}</span>
      <div class="aw-tools">${button(prefix + "import", importLabel)}${button(prefix + "new", newLabel, 'class="aw-primary"', "plus")}</div></div><div class="aw-list">
      ${library.map(tool => `<div class="aw-card" data-id="${esc(tool.id)}"><div><strong>${esc(tool.name)}</strong>
        ${view().itemSummary(inLibrary ? "" : [flow.isProviderToolId(tool.id) && tr("workflow_tool_builtin", "内置"),
          tool.enabled ? tr("common_enable", "启用") : tr("common_disable", "停用")].filter(Boolean).join(" · "), tool.note)}</div>
        <div class="aw-tools">
          ${iconButton(prefix + "edit", editLabel + " " + tool.name, "pencil")}
          ${!inLibrary && [...flow.walk(tool.steps, true)].some(node => node.keyHeader) ? iconButton("tool-key", tr("workflow_tool_credentials", "本机密钥") + " " + tool.name, "key") : ""}
          ${inLibrary ? "" : iconButton("tool-toggle", (tool.enabled ? tr("common_disable", "停用") : tr("common_enable", "启用")) + " " + tool.name, tool.enabled ? "circle-check" : "circle-off", `aria-pressed="${tool.enabled}"`)}
          ${iconButton(prefix + "copy", tr("common_copy", "复制") + " " + tool.name, "copy")}
          ${iconButton(prefix + "export", tr("common_export", "导出") + " " + tool.name, "download")}
          ${iconButton(prefix + "delete", tr("common_delete", "删除") + " " + tool.name, "trash")}
        </div></div>`).join("")}</div>`;
  }
  async function toolPageAction(state, action, id) {
    if (action === "tool-new") return editWorkflow(state, null, null, true);
    if (action === "tool-import") return state.node.querySelector("[data-import-tool]").click();
    const next = flow.clone(state.bundle), index = next.tools?.findIndex(tool => tool.id === id) ?? -1;
    if (index < 0) return;
    const tool = next.tools[index];
    if (action === "tool-edit") return editWorkflow(state, tool);
    if (action === "tool-key") return editToolCredential(state, tool);
    if (action === "tool-export") return downloadJson({ type: "steam-buff-tool", schemaVersion: 1, tool }, tool.name, ".tool.json");
    if (action === "tool-copy") {
      tool.id = model.newTool(tool.name).id;
      tool.name = tools.copyName(tool.name); tool.enabled = false; tool.revision = 1;
      return saveToolDefinition(state, tool);
    }
    if (action === "tool-toggle") tool.enabled = !tool.enabled;
    else if (action === "tool-delete") {
      const references = toolReferences(next, id).map(({ workflow }) => workflow.name);
      let message = tr("workflow_tool_delete_confirm", "将删除「$name$」。", { name: tool.name });
      if ([...flow.walk(tool.steps)].some(node => node.action === "http-request" && node.keyHeader))
        message += "\n" + tr("workflow_tool_delete_credentials", "此工具的 HTTP 指令若有单独保存在本机的密钥，也会一并删除。");
      if (!await confirmDelete(state, tr("workflow_tool_delete", "删除 AI 工具"), message, toolTitle(), references)) return;
      next.tools.splice(index, 1);
    } else return;
    await save(state, next);
  }
  function libraryReferences(bundle, id) {
    return [...bundle.workflows, ...bundle.tools, ...bundle.libraries].flatMap(workflow => [...flow.walk(workflow.steps)]
      .filter(node => node.action === "library-call" && node.libraryId === id).map(node => ({ workflow, node })));
  }
  async function saveLibraryDefinition(state, library, { imported = false } = {}) {
    const next = flow.clone(state.bundle);
    const affected = libraryReferences(next, library.id)
      .filter(({ workflow, node }) => model.libraryBindingIssue(library, node, workflow));
    if (affected.length) {
      await state.ctx.dialog(state.shadow, {
        title: tr("workflow_library_reference_invalid", "以下调用与新的库参数不兼容"),
        message: referencesText(affected).join("\n"),
        actions: [{ id: "close", label: tr("common_close", "关闭") }],
      });
      return false;
    }
    const libraries = next.libraries ??= [];
    const index = libraries.findIndex(item => item.id === library.id);
    if (index < 0) libraries.push(library);
    else libraries[index] = library;
    await save(state, next, index < 0 ? { section: "libraries", id: library.id, retainId: imported } : undefined);
    return true;
  }
  async function importLibrary(state, file) {
    const data = JSON.parse(await file.text());
    if (data?.type !== "steam-buff-library" || data.schemaVersion !== 1)
      throw new TypeError(tr("workflow_library_invalid_file", "自定义库文件类型或版本无效"));
    const library = model.validateLibrary(data.library);
    const existing = state.bundle.libraries?.some(item => item.id === library.id);
    const { sites } = await toolPreview(library, state.bundle);
    const choice = await state.ctx.dialog(state.shadow, {
      title: tr("workflow_library_import", "导入自定义库"),
      message: [library.name, library.description, ...sites,
        ...(existing ? referencesText(libraryReferences(state.bundle, library.id)) : [])].filter(Boolean).join("\n"),
      actions: [{ id: "cancel", label: tr("common_cancel", "取消") },
        ...(existing ? [{ id: "update", label: tr("workflow_library_update", "更新自定义库") },
          { id: "copy", label: tr("workflow_tool_import_copy", "另存副本"), primary: true }] :
          [{ id: "import", label: tr("workflow_library_import", "导入自定义库"), primary: true }])],
    });
    if (!["import", "update", "copy"].includes(choice)) return;
    if (choice === "copy") {
      library.id = model.newLibrary(library.name).id;
      library.name = tools.copyName(library.name);
    }
    return saveLibraryDefinition(state, library, { imported: choice !== "copy" });
  }
  async function libraryPageAction(state, action, id) {
    if (action === "library-new") return editWorkflow(state, null, null, "library");
    if (action === "library-import") return state.node.querySelector("[data-import-library]").click();
    const next = flow.clone(state.bundle), index = next.libraries?.findIndex(item => item.id === id) ?? -1;
    if (index < 0) return;
    const library = next.libraries[index];
    if (action === "library-edit") return editWorkflow(state, library);
    if (action === "library-export") return downloadJson({ type: "steam-buff-library", schemaVersion: 1, library }, library.name, ".library.json");
    if (action === "library-copy") {
      library.id = model.newLibrary(library.name).id; library.name = tools.copyName(library.name);
      library.revision = 1;
      return saveLibraryDefinition(state, library);
    }
    if (action !== "library-delete") return;
    const refs = libraryReferences(next, id);
    if (refs.length) {
      return state.ctx.dialog(state.shadow, { title: tr("workflow_library_in_use", "自定义库正在使用"),
        message: referencesText(refs).join("\n"), actions: [{ id: "close", label: tr("common_close", "关闭") }] });
    }
    if (!await confirmDelete(state, tr("workflow_library_delete", "删除自定义库"),
      tr("workflow_tool_delete_confirm", "将删除「$name$」。", { name: library.name }))) return;
    next.libraries.splice(index, 1);
    await save(state, next);
  }
  function bindItemNoteTips(node) {
    let anchor, tip, lifetime;
    const close = () => {
      lifetime?.abort();
      tip?.remove();
      anchor = tip = lifetime = null;
    };
    const open = event => {
      const note = event.target.closest(".aw-item-note");
      if (!note || note === anchor || note.scrollWidth <= note.clientWidth) return;
      close();
      anchor = note;
      tip = node.ownerDocument.createElement("div");
      tip.className = "aw-item-note-tip";
      tip.popover = "auto";
      tip.tabIndex = -1;
      tip.setAttribute("aria-hidden", "true");
      tip.textContent = note.textContent;
      note.closest("[data-aw-panel]").append(tip);
      tip.showPopover();
      const { left, top, bottom } = note.getBoundingClientRect();
      const { clientWidth, clientHeight } = node.ownerDocument.documentElement;
      const above = top - 8, below = clientHeight - bottom - 8;
      const placeAbove = tip.offsetHeight > below && above > below;
      tip.style.setProperty("--aw-note-space", Math.max(0, placeAbove ? above : below) + "px");
      tip.style.left = Math.max(8, Math.min(left, clientWidth - tip.offsetWidth - 8)) + "px";
      tip.style.top = (placeAbove ? top - tip.offsetHeight : bottom) + "px";
      lifetime = new AbortController();
      const signal = lifetime.signal, popup = tip;
      popup.addEventListener("toggle", event => {
        if (event.newState === "closed" && tip === popup) close();
      }, { signal });
      const observer = new ResizeObserver(() => {
        if (tip === popup && (!note.isConnected || !note.clientWidth)) close();
      });
      observer.observe(note);
      signal.addEventListener("abort", () => observer.disconnect(), { once: true });
      root.addEventListener("resize", close, { signal });
      node.closest(".body")?.addEventListener("scroll", close, { passive: true, signal });
    };
    node.addEventListener("pointerover", open);
    node.addEventListener("focusin", open);
    node.addEventListener("pointerout", event => {
      if (!tip || event.target !== anchor && !tip.contains(event.target)) return;
      if (event.relatedTarget !== anchor && !tip.contains(event.relatedTarget) && node.getRootNode().activeElement !== anchor) close();
    });
    node.addEventListener("focusout", event => {
      if (event.target === anchor && !anchor.matches(":hover") && !tip.matches(":hover")) close();
    });
    node.addEventListener("keydown", event => {
      if (!tip || event.target !== anchor || tip.scrollHeight <= tip.clientHeight || event.altKey || event.ctrlKey || event.metaKey) return;
      const offset = { ArrowUp: -40, ArrowDown: 40, PageUp: -tip.clientHeight, PageDown: tip.clientHeight, Home: -tip.scrollHeight, End: tip.scrollHeight };
      if (Object.hasOwn(offset, event.key)) { event.preventDefault(); tip.scrollTop += offset[event.key]; }
    });
    return close;
  }
  function renderPage(state) {
    const { node, bundle, tab } = state;
    state.closeNoteTip?.();
    if (!node.isConnected) return;
    if (!node.querySelector("[data-aw-panel]")) html(node, `<div class="aw"><div class="aw-page-heading"><h2 class="page-title">${esc(root.STI18n.text("settings.page.automation.name", "自动化"))}</h2>${button("reset", tr("workflow_ui_restore_defaults", "恢复初始化"))}</div>
      <div class="aw-tabs aw-module-tabs" role="tablist" aria-label="${esc(tr("workflow_ui_automation_pages", "自动化页面"))}">${tabs().map(([id, name]) => button("tab", name, `id="aw-tab-${id}" data-tab="${id}" role="tab" aria-selected="${tab === id}" tabindex="${tab === id ? 0 : -1}"`)).join("")}</div>
      <div data-aw-panel role="tabpanel"></div><input type="file" accept=".json,application/json" data-import hidden><input type="file" accept=".json,application/json" data-import-tool hidden><input type="file" accept=".json,application/json" data-import-library hidden><div class="aw-error" data-page-error role="alert"></div><div class="aw-note" data-steam-pending role="status"></div></div>`);
    const status = node.querySelector("[data-steam-pending]");
    const notice = state.resetStatus || (state.steamPending ? tr("workflow_ui_saved_changes_take_effect_when_steam_reconnects", "配置已保存，Steam 重新连接后生效。") : "");
    if (status.textContent !== notice) status.textContent = notice;
    node.querySelector(".aw-module-tabs").hidden = !bundle;
    const panel = node.querySelector("[data-aw-panel]"); panel.hidden = !bundle;
    if (!bundle) return;
    for (const control of node.querySelectorAll('[role="tab"]')) { control.setAttribute("aria-selected", String(control.dataset.tab === tab)); control.tabIndex = control.dataset.tab === tab ? 0 : -1; }
    panel.setAttribute("aria-labelledby", "aw-tab-" + tab);
    let content;
    if (tab === "triggers") content = `<div class="aw-toolbar"><span>${esc(tr("workflow_format_triggers", "$count$ 个触发器", { count: bundle.triggers.length }))}</span>${button("trigger-new", tr("workflow_ui_new_trigger", "新建触发器"), 'class="aw-primary"', "plus")}</div>` +
      (bundle.triggers.length ? `<div class="aw-list">${bundle.triggers.map(trigger => {
        const workflow = bundle.workflows.find(item => item.id === trigger.workflowId), { event } = trigger;
        const detail = event.type === "schedule" ? scheduleLabel(event) :
          event.type === "installed" ? installStages().find(([id]) => id === event.phase)?.[1] : gameEvents[event.type];
        const label = [triggerModes[triggerMode(event.type)], detail].filter(Boolean).join(" · ");
        return `<div class="aw-card" data-id="${esc(trigger.id)}"><div><strong>${esc(trigger.name)}</strong>${view().itemSummary(label + " → " + (workflow?.name || tr("workflow_ui_missing_reference", "引用已失效：") + trigger.workflowId), trigger.note)}</div><div class="aw-tools">${trigger.event.type === "manual" ? iconButton("trigger-run", tr("workflow_ui_run", "运行") + " " + trigger.name, "player-play", trigger.enabled ? "" : "disabled") : ""}${iconButton("trigger-toggle", (trigger.enabled ? tr("common_disable", "停用") + " " : tr("common_enable", "启用") + " ") + trigger.name, trigger.enabled ? "circle-check" : "circle-off", `aria-pressed="${trigger.enabled}"`)}${iconButton("trigger-edit", tr("store_titleCustomName_edit", "编辑") + " " + trigger.name, "pencil")}${iconButton("trigger-delete", tr("common_delete", "删除") + " " + trigger.name, "trash")}</div></div>`;
      }).join("")}</div>` : `<div class="aw-empty">${esc(tr("workflow_ui_no_triggers_yet", "暂无触发器"))}</div>`);
    else if (tab === "workflows") content = `<div class="aw-toolbar"><span>${esc(tr("workflow_format_workflows", "$count$ 个工作流", { count: bundle.workflows.length }))}</span><div class="aw-tools">${button("workflow-import", tr("workflow_ui_import_workflow", "导入工作流"))}${button("workflow-new", tr("workflow_ui_new_workflow", "新建工作流"), 'class="aw-primary"', "plus")}</div></div>` +
      (bundle.workflows.length ? `<div class="aw-list">${bundle.workflows.map(workflow => `<div class="aw-card" data-id="${esc(workflow.id)}"><div><strong>${esc(workflow.name)}</strong>${view().itemSummary(tr("workflow_format_action_triggers", "$actions$ 条指令 · $count$ 个触发器引用", { actions: [...flow.walk(workflow.steps)].length, count: bundle.triggers.filter(item => item.workflowId === workflow.id).length }), workflow.note)}</div><div class="aw-tools">${iconButton("workflow-edit", tr("store_titleCustomName_edit", "编辑") + " " + workflow.name, "pencil")}${iconButton("workflow-copy", tr("common_copy", "复制") + " " + workflow.name, "copy")}${iconButton("workflow-export", tr("common_export", "导出") + " " + workflow.name, "download")}${iconButton("workflow-delete", tr("common_delete", "删除") + " " + workflow.name, "trash")}</div></div>`).join("")}</div>` : `<div class="aw-empty">${esc(tr("workflow_ui_no_workflows_yet", "暂无工作流"))}</div>`);
    else if (tab === "prompts") content = view().promptsHtml(bundle);
    else if (tab === "tools") content = toolList(bundle);
    else if (tab === "libraries") content = toolList(bundle, true);
    else if (tab === "site-permissions") {
      content = `<div class="aw-toolbar"><span>${esc(tr("workflow_site_grants", "已授权站点"))}</span>${button("site-add", tr("workflow_site_add", "新增域名"), 'class="aw-primary"', "plus")}</div>` +
        (state.sites ? state.sites.length ? `<div class="aw-list">${state.sites.map(pattern =>
          `<div class="aw-card" data-id="${esc(pattern)}"><div><strong>${esc(pattern.replace(/\/\*$/, ""))}</strong></div>${button("site-remove", tr("workflow_site_remove", "移除授权"))}</div>`).join("")}</div>` :
          `<div class="aw-empty">${esc(tr("workflow_site_empty", "暂无已授权站点"))}</div>` :
          `<div class="aw-empty" role="status">${esc(tr("workflow_site_loading", "正在读取站点权限…"))}</div>`);
    }
    else content = `<div class="aw-toolbar"><span>${esc(tr("workflow_ui_run_history", "运行记录"))}</span>${button("history-refresh", tr("common_refresh", "刷新"), state.historyLoading ? "disabled" : "")}</div>` + (state.historyLoading ? `<div class="aw-empty" role="status">${esc(tr("workflow_ui_loading_run_history", "正在读取运行记录…"))}</div>` :
      `<div class="aw-list">${state.jobs.map(job => `<div class="aw-card" data-id="${esc(job.id)}"><div><strong>${esc(job.workflowName)}</strong><small>${esc(job.triggerName)} · ${esc(new Date(job.createdAt).toLocaleString(root.STI18n.intlLocale()))} · ${esc(runStatus(job))}</small></div>${button("job", tr("messageCenter_view", "查看"))}</div>`).join("")}</div>${state.next ? button("history-more", tr("workflow_ui_load_more", "加载更多")) : !state.jobs.length ? `<div class="aw-empty">${esc(tr("workflow_ui_no_runs_yet", "暂无运行记录"))}</div>` : ""}`);
    html(panel, content); panel.tabIndex = panel.querySelector("button,input,select,textarea") ? -1 : 0;
  }
  async function loadSites(state) {
    const { removable } = await view().rpc("site-permissions");
    state.sites = removable;
    if (state.tab === "site-permissions") renderPage(state);
  }
  async function addSite(state) {
    const lifetime = new AbortController();
    try {
      await state.ctx.dialog(state.shadow, {
        title: tr("workflow_site_add", "新增域名"), form: true, native: true,
        render: node => formHtml(node, `<div class="aw aw-form"><label>${esc(tr("workflow_site_domain", "域名"))}<input data-domain type="text" autocapitalize="off" spellcheck="false"></label><div class="aw-error" role="alert"></div></div>`),
        actions: [{ id: "cancel", label: tr("common_cancel", "取消") }, { id: "authorize", label: tr("workflow_click_authorize", "点我授权"), primary: true }],
        async onAction(action, node) {
          if (action !== "authorize") return true;
          const value = node.querySelector("[data-domain]").value.trim();
          const address = value && /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : "https://" + value;
          const url = flow.httpUrl(address);
          if (!url) {
            node.querySelector(".aw-error").textContent = tr("workflow_error_http_url", "请输入有效的 HTTP 或 HTTPS URL");
            return false;
          }
          try {
            if (!await authorizeSite(url.origin, lifetime.signal)) {
              node.querySelector(".aw-error").textContent = tr("workflow_site_not_granted", "未授权");
              return false;
            }
            await loadSites(state);
            return true;
          } catch (error) { reportFailure(error, node.querySelector(".aw-error")); return false; }
        },
      });
    } finally { lifetime.abort(); }
  }
  async function pageAction(state, control) {
    const action = control.dataset.aw, id = control.closest("[data-id]")?.dataset.id;
    if (action === "tab") {
      const tab = control.dataset.tab, request = ++state.tabRequest;
      if (state.tab === tab) return;
      if (tab === "tools") {
        const latest = await state.ctx.storage.getWorkflow();
        if (request !== state.tabRequest || !state.node.isConnected) return;
        if (latest.epoch !== state.bundle.epoch || latest.revision >= state.bundle.revision) state.bundle = latest;
      }
      state.tab = tab;
      if (state.tab === "history") await history(state);
      else {
        renderPage(state);
        if (state.tab === "site-permissions") await loadSites(state);
      }
      return;
    }
    if (action === "site-add") return addSite(state);
    if (action === "site-remove") {
      const answer = await state.ctx.dialog(state.shadow, { title: tr("workflow_site_remove", "移除授权"), native: true,
        message: tr("workflow_site_remove_prompt", "移除 $site$ 的授权后，使用它的 AI 服务和工作流需要重新授权。", { site: id.replace(/\/\*$/, "") }),
        actions: [{ id: "cancel", label: tr("common_cancel", "取消") },
          { id: "remove", label: tr("workflow_site_remove", "移除授权"), primary: true, danger: true }] });
      if (answer === "remove") {
        const result = await view().rpc("remove-site-permission", { pattern: id });
        state.sites = result.removable;
        if (state.tab === "site-permissions") renderPage(state);
      }
      return;
    }
    if (action.startsWith("tool-")) return toolPageAction(state, action, id);
    if (action.startsWith("library-")) return libraryPageAction(state, action, id);
    if (action === "reset") {
      const answer = await state.ctx.dialog(state.shadow, { title: tr("workflow_ui_restore_automation_defaults_title", "恢复自动化出厂设置"), className: "aw-automation-dialog", native: true,
        message: tr("workflow_ui_restore_automation_defaults_warning", "将停止未完成的任务、试运行和相关工具审批，清除工作流、触发器、提示词、AI 工具、自定义库及工具专属 HTTP 密钥，再按当前语言导入出厂设置。失效的提示词绑定会恢复默认。运行记录和 AI 服务会保留。此操作无法撤销。"),
        actions: [{ id: "cancel", label: tr("common_cancel", "取消") }, { id: "reset", label: tr("workflow_ui_restore_defaults", "恢复初始化"), primary: true, danger: true }] });
      if (answer === "reset") {
        const status = state.node.querySelector("[data-steam-pending]");
        state.resetStatus = tr("workflow_ui_restoring_defaults", "正在停止旧任务并恢复出厂设置…");
        status.textContent = state.resetStatus;
        let result;
        try { result = await view().rpc("reset"); }
        finally {
          state.resetStatus = !result ? "" : result.steamPending
            ? tr("workflow_ui_restored_defaults_steam_pending", "本地已恢复出厂设置，等待 Steam 重新连接。")
            : tr("workflow_ui_restored_defaults", "自动化已恢复出厂设置。");
          status.textContent = state.resetStatus;
        }
        state.bundle = result.workflow;
        state.steamPending = result.steamPending;
        state.node.querySelector("[data-page-error]").textContent = "";
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
    if (action === "workflow-copy") {
      const copied = flow.clone(item);
      copied.id = flow.numericId("wf-", next.workflows);
      copied.name = tools.copyName(item.name);
      copied.revision = 1;
      next.workflows.push(copied);
      return save(state, next, { section, id: copied.id });
    }
    else if (action === "trigger-toggle") {
      if (!item.enabled) {
        const workflow = next.workflows.find(row => row.id === item.workflowId);
        if (!workflow) throw new Error(tr("workflow_ui_the_referenced_workflow_was_deleted_select_another_workflow", "引用的工作流已删除，请重新选择工作流"));
        if (item.event.type === "schedule") validateSchedule(item.event, true);
        const issue = model.inputBindingIssue(workflow, item.inputs, item.event.type);
        if (issue) throw issue;
        if (!workflow.inputParameters && item.event.type === "schedule" && !Object.hasOwn(item.inputs, "game")) {
          const first = workflow.steps.find(node => !node.disabled && node.action !== "comment");
          if (first?.action === "receive" && [...flow.references(first.value)].some(ref => ref.source === "input" && ref.path[0] === "game"))
            throw new Error(tr("workflow_ui_this_workflow_requires_game_input_configure_the_trigger_firs", "所选工作流需要「游戏」输入，请先配置触发器"));
        }
      }
      item.enabled = !item.enabled;
    }
    else if (action.endsWith("-delete")) {
      const workflow = section === "workflows";
      const title = workflow ? tr("workflow_ui_delete_workflow", "删除工作流") : tr("workflow_ui_delete_trigger", "删除触发器");
      const references = workflow ? next.triggers.filter(trigger => trigger.workflowId === id).map(trigger => trigger.name) : [];
      if (!await confirmDelete(state, title,
        tr("workflow_format_delete_record", "将删除“$name$”并结束相关未完成运行。该操作无法撤销。", { name: item.name }),
        tr("workflow_reference_kind_workflow", "工作流"), references)) return;
      next[section].splice(index, 1);
    } else return;
    await save(state, next);
  }
  async function mount(node, shadow, ctx) {
    let bundle, configError;
    try { bundle = await ctx.storage.getWorkflow(); }
    catch (error) {
      if (error.code !== "WORKFLOW_CONFIG_INVALID") throw error;
      configError = error;
    }
    const state = { node, shadow, ctx, tab: "workflows", tabRequest: 0, bundle, jobs: [], next: null, historyRequest: 0, historyLoading: false };
    if (!node.isConnected) return;
    pageStates.set(node, state);
    state.render = () => renderPage(state);
    renderPage(state);
    state.closeNoteTip = bindItemNoteTips(node);
    if (configError) node.querySelector("[data-page-error]").textContent = view().validationCaption(configError);
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
      if (!event.target.matches("[data-import],[data-import-tool],[data-import-library]")) return;
      const file = event.target.files[0]; event.target.value = ""; if (!file) return;
      if (event.target.matches("[data-import-library]")) {
        void importLibrary(state, file).catch(error => reportFailure(error, node.querySelector("[data-page-error]")));
      } else if (event.target.matches("[data-import-tool]")) {
        void importTool(state, file).catch(error => state.ctx.dialog(state.shadow, {
          title: tr("workflow_tool_import", "导入工具"), message: view().errorCaption(error),
          actions: [{ id: "close", label: tr("common_close", "关闭") }],
        }));
      } else void importFlow(state, file).catch(error => reportFailure(error, node.querySelector(".aw-error")));
    });
  }

  function syncToolPage(shadow, bundle) {
    const state = pageStates.get(shadow.querySelector('[data-workflow="automation"]'));
    if (state?.tab !== "tools" || !state.bundle || !bundle || state.bundle.epoch === bundle.epoch && state.bundle.revision >= bundle.revision) return;
    const before = state.bundle.tools || [], after = bundle.tools || [];
    if (before.length === after.length && before.every((tool, i) =>
      tool.id === after[i].id && tool.revision === after[i].revision && tool.executionId === after[i].executionId &&
      tool.name === after[i].name && tool.enabled === after[i].enabled && tool.note === after[i].note &&
      JSON.stringify(tool.entryRow) === JSON.stringify(after[i].entryRow))) return;
    state.bundle = model.normalize(bundle, { structureOnly: true });
    const focused = shadow.activeElement;
    const id = focused?.closest("[data-id]")?.dataset.id;
    const action = focused?.dataset.aw;
    renderPage(state);
    if (action && id) {
      const row = [...state.node.querySelectorAll("[data-id]")].find(card => card.dataset.id === id);
      [...(row?.querySelectorAll("[data-aw]") || [])].find(button => button.dataset.aw === action)?.focus({ preventScroll: true });
    }
  }

  root.STAutomationEditor = Object.freeze({ mount, style, confirmDelete, syncToolPage });
})(globalThis);
