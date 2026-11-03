/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : Steam 客户端增强小工具
 * @File          : 两版名称文件与可编辑导入预览
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(() => {
  "use strict";
  const labels = {
    import:"导入名称",export:"导出名称",format:"格式",json:"JSON",xlsx:"Excel (.xlsx)",choose:"选择文件",template:"下载 Excel 模板",
    scope:"范围",all:"全部数据",selected:"已勾选数据",saved:"导出已保存内容；存在未保存草稿，请先保存需要导出的修改。",
    empty:"空值处理",skip:"跳过空值",clear:"清空对应字段",preview:"导入预览",sheet:"工作表",back:"重新选择文件",apply:"应用到主窗口草稿",
    validOnly:"仅导入有效行",working:"正在处理…",summary:"总 $total$ 行 · 修改 $changed$ 款 · 无变化 $same$ 款 · 无效 $invalid$ 行",
    applied:"已导入 $n$ 款到草稿并勾选，请点击保存修改。",line:"第 $n$ 行",before:"修改前",unavailable:"APPID 不在当前游戏库中",
    duplicate:"APPID 重复，请修改后再导入",updated:"目标内容或账号已更新，请重新选择文件预览。",failed:"文件操作失败，请重试。",
    exported:"已导出 $n$ 款",wrongFile:"请选择对应格式的文件。",generatePinyin:"重新生成拼音",generated:"已重新生成 $n$ 款",
    aliases:'别名格式："别名一","别名二"，每项使用英文双引号，中英文逗号均可。',
    includeSort:"同时导出 Steam 自定义排序名称",legacyMode:"旧 JSON 名称字段含义",independent:"自定义名称（捐赠版）","steam-sort":"Steam 排序名称（免费版）",
    freeHint:"首行包含 APPID、自定义排序名称或助记符；按标题识别，列顺序不限。",
    donorHint:"首行包含 APPID 和至少一个名称字段；自定义名称与 Steam 自定义排序名称是不同列，列顺序不限。",
    jsonHint:"JSON 顶层使用 items 数组。新版文件按明确字段识别；旧文件的 custom_name 含义由下方选项指定。",
    freeNameHint:"自定义排序名称与助记符共用 Steam 排序名称字段；助记符列优先，多个助记符用逗号分隔。",
    donorNameHint:"自定义名称变化时重置未指定的助记符和拼音；Steam 排序名称独立处理。缺失列不修改，空值按所选策略处理。",
  };

  /**
   * 创建一个归属批量窗口的文件编辑器。mode 只接受已声明的两种名称策略；root 为自有 dialog。
   * getRows/getSelected/getBase/getSaved 提供当前库、勾选、草稿与已保存值；capture 返回有效性检查函数。
   * commit(changedRows,valid,yieldUI) 必须先验证全部基线，再原子合并草稿，不得写入 Steam 或云端。
   * onState/onApplied 只同步拥有者的锁与展示。close 终止 Worker 和待处理帧，丢弃尚未应用的预览。
   */
  function create(options) {
    const {mode,root,esc,i18n,setHtml,log}=options;
    const free=mode==="steam-sort", doc=root.ownerDocument, win=doc.defaultView;
    const t=(key,params)=>i18n("steam.independentName.transfer."+key,labels[key],params);
    let active=null, disposed=false, libs=null;
    const setState=io=>{active=io;options.onState(io);};
    const valid=io=>{
      if(disposed||active!==io)return false;
      if(!io.valid())throw new Error(t("updated"));
      return true;
    };
    const copy=value=>({...value,...(Array.isArray(value.aliases)?{aliases:value.aliases.slice()}: {})});
    function same(left,right) { return options.same(left,right); }
    async function load() {
      if(typeof window.STNameTransfer?.forMode==="function"&&typeof window.SteamBuff.libraryCustomNameMnemonic?.replaceMnemonics==="function") return;
      if(!libs) libs=(async()=>{
        for(const path of ["shared/user-names-snapshot.js","steam/features/library-custom-name/mnemonic.js","steam/features/library-independent-name/transfer.js"]) {
          await new Promise((resolve,reject)=>{
            const script=document.createElement("script");script.src=options.url(path);
            script.onload=()=>{script.remove();resolve();};script.onerror=()=>{script.remove();reject(new Error("无法加载 "+path));};
            document.documentElement.appendChild(script);
          });
        }
      })();
      try {await libs;} finally {libs=null;}
    }
    function close(reason="cancel") {
      const io=active;if(!io)return;
      setState(null);io.worker?.close();
      if(io.frame){win.cancelAnimationFrame(io.frame.id);io.frame.resolve();io.frame=null;}
      if(root.open) root.close();
    }
    function reportError(error,io=active) {
      if(io && active!==io)return;
      if(io){io.working=false;io.error=error.message;refresh();}
      else options.onError(error);
      log.error("name-transfer-failed","名称文件操作失败",{error,operationId:io?.id,operation:io?.kind,phase:io?.phase,mode});
    }
    function yieldUI(io) {return new Promise(resolve=>{io.frame={resolve,id:win.requestAnimationFrame(()=>{io.frame=null;resolve();})};});}
    function worker(io) {if(!io.worker)io.worker=io.core.createSession(options.url);return io.worker;}
    function choice(key,values,current) {return `<label>${esc(t(key))}<select data-lin-io-${key}>${values.map(value=>`<option value="${value}" ${value===current?"selected":""}>${esc(t(value))}</option>`).join("")}</select></label>`;}
    async function open(kind) {
      if(disposed||active||options.locked())return;
      options.beforeOpen();
      const io={kind,format:"json",scope:options.getSelected().size?"selected":"all",phase:"format",legacyMode:mode,includeSort:false,
        records:[],rows:[],manual:new Map(),bases:new Map(),changed:0,invalid:0,clearEmpty:false,validOnly:false,working:true,ready:false,
        revision:0,error:"",message:"",valid:options.capture(),id:`transfer-${Date.now()}-${Math.random().toString(36).slice(2)}`,started:performance.now(),
        library:new Map(options.getRows().map(row=>[row.appid,row])),virtual:options.virtual.createVirtualWindow({rowHeight:112,viewportHeight:336,overscan:4})};
      setState(io);
      setHtml(root,`<div class="st-lin-transfer-dialog"><header class="st-lin-head"><h3 id="st-lin-transfer-title">Steam Buff · ${esc(t(kind))}</h3><button class="st-lin-btn" type="button" data-lin-io-close>${esc(i18n("common.close","关闭"))}</button></header><div class="st-lin-transfer-options" data-lin-io-options>${choice("format",["json","xlsx"],io.format)}${kind==="export"?choice("scope",["all","selected"],io.scope):""}<label data-lin-io-sort-box ${free||kind!=="export"?"hidden":""}><input type="checkbox" data-lin-io-include-sort>${esc(t("includeSort"))}</label><label data-lin-io-legacy-box ${kind!=="import"?"hidden":""}>${esc(t("legacyMode"))}<select data-lin-io-legacy>${["independent","steam-sort"].map(value=>`<option value="${value}" ${value===mode?"selected":""}>${esc(t(value))}</option>`).join("")}</select></label></div><p data-lin-io-hint></p><div data-lin-io-sheet-box hidden><label>${esc(t("sheet"))}<select data-lin-io-sheet></select></label></div><div data-lin-io-preview hidden><p data-lin-io-name-hint></p><p data-lin-io-alias-hint ${free?"hidden":""}>${esc(t("aliases"))}</p><div class="st-lin-transfer-options"><label>${esc(t("empty"))}<select data-lin-io-empty><option value="skip">${esc(t("skip"))}</option><option value="clear">${esc(t("clear"))}</option></select></label><button class="st-lin-btn" type="button" data-lin-io-generate ${free?"hidden":""}>${esc(t("generatePinyin"))}</button><label><input type="checkbox" data-lin-io-valid-only>${esc(t("validOnly"))}</label></div><div class="st-lin-transfer-scroll" data-lin-io-scroll tabindex="0"><div class="st-lin-transfer-columns" data-lin-io-columns></div><div data-lin-io-rows></div></div></div><p class="st-lin-msg" role="status" data-lin-io-status></p><footer class="st-lin-filter-actions"><button class="st-lin-btn" type="button" data-lin-io-template>${esc(t("template"))}</button><button class="st-lin-btn" type="button" data-lin-io-back hidden>${esc(t("back"))}</button><button class="st-lin-btn" type="button" data-lin-io-close>${esc(i18n("common.cancel","取消"))}</button><button class="st-lin-btn st-lin-primary" type="button" data-lin-io-primary>${esc(t(kind==="import"?"choose":"export"))}</button></footer><input type="file" data-lin-file hidden></div>`,"name-transfer-dialog");
      root.querySelector("[data-lin-io-scroll]").addEventListener("scroll",()=>{if(active===io&&!io.composing)renderRows();},{passive:true});
      root.showModal();refresh();
      log.info("name-transfer-start","已打开名称文件操作",{operationId:io.id,operation:kind,mode});
      try{
        await load();if(!valid(io))return;
        io.core=window.STNameTransfer.forMode(mode);io.ready=true;io.working=false;
        root.style.setProperty("--st-name-transfer-field-count",String(io.core.fields.length));
        root.style.setProperty("--st-name-transfer-columns",`100px repeat(${io.core.fields.length}, minmax(180px,1fr))`);
        setHtml(root.querySelector("[data-lin-io-columns]"),io.core.headers.map(header=>`<b>${esc(header)}</b>`).join(""),"name-transfer-headers");
        refresh();
      }catch(error){reportError(error,io);}
    }
    function refresh() {
      const io=active;if(!io)return;
      const locked=!io.ready||io.working;
      root.querySelector("[data-lin-io-status]").textContent=io.error||(io.working?t("working"):io.phase==="preview"?t("summary",{total:io.rows.length,changed:io.changed,same:io.rows.length-io.changed-io.invalid,invalid:io.invalid}):io.message);
      root.querySelector("#st-lin-transfer-title").textContent="Steam Buff · "+t(io.phase==="preview"?"preview":io.kind);
      root.querySelector("[data-lin-io-hint]").textContent=io.phase==="preview"?"":io.kind==="import"?t(io.format==="json"?"jsonHint":free?"freeHint":"donorHint"):options.hasDrafts()?t("saved"):"";
      root.querySelector("[data-lin-io-name-hint]").textContent=t(free?"freeNameHint":"donorNameHint");
      root.querySelector("[data-lin-io-options]").hidden=io.phase==="preview";
      root.querySelector("[data-lin-io-preview]").hidden=io.phase!=="preview";
      root.querySelector("[data-lin-io-back]").hidden=io.phase!=="preview";
      root.querySelector("[data-lin-io-template]").hidden=io.kind!=="import"||io.phase==="preview";
      root.querySelector("[data-lin-io-legacy-box]").hidden=io.kind!=="import"||io.format!=="json";
      const selectedOption=root.querySelector('[data-lin-io-scope] option[value="selected"]');
      if(selectedOption)selectedOption.disabled=options.getSelected().size===0;
      const primary=root.querySelector("[data-lin-io-primary]");primary.textContent=t(io.phase==="preview"?"apply":io.kind==="import"?"choose":"export");
      primary.disabled=locked||io.composing||!!io.error||(io.phase==="preview"&&(!io.changed||io.invalid>0&&!io.validOnly));
      for(const control of root.querySelectorAll("input,select,[data-lin-io-generate],[data-lin-io-template],[data-lin-io-back]"))control.disabled=locked;
      const focus=doc.activeElement;
      if(!root.contains(focus)||focus.disabled||focus.closest("[hidden]"))root.querySelector(locked?"[data-lin-io-close]":"[data-lin-io-primary]").focus({preventScroll:true});
    }
    async function readFile(file) {
      const io=active;if(!io||io.working)return;
      if(!file.name.toLowerCase().endsWith("."+io.format))throw new Error(t("wrongFile"));
      io.worker?.close();io.worker=null;io.working=true;io.error="";io.manual.clear();io.bases.clear();refresh();
      const result=await worker(io).request({type:"read",format:io.format,file,legacyMode:io.legacyMode});if(!valid(io))return;
      if(io.format==="xlsx"){
        const select=root.querySelector("[data-lin-io-sheet]");setHtml(select,result.sheets.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join(""),"name-transfer-sheets");
        root.querySelector("[data-lin-io-sheet-box]").hidden=result.sheets.length<2;
        await sheet(result.sheets[0]);
      }else{io.records=result.records;await rebuild(io);}
    }
    async function sheet(name) {
      const io=active;io.working=true;io.error="";refresh();
      const result=await worker(io).request({type:"sheet",name});if(!valid(io))return;
      io.records=result.records;io.manual.clear();io.bases.clear();await rebuild(io);
    }
    function compile(io,index) {
      const record=io.records[index],manual=io.manual.get(index)||{},id=Number(Object.hasOwn(manual,"appid")?manual.appid:record.values.appid);
      if(!io.bases.has(id))io.bases.set(id,copy(io.library.has(id)?options.getBase(id):options.emptyBase()));
      const base=io.bases.get(id),row={index,line:record.line,before:base,...io.core.compile(record,base,io.clearEmpty,manual)};
      if(!io.library.has(row.appid))row.errors.push(t("unavailable"));
      row.changed=!row.errors.length&&!same(row.next,base);return row;
    }
    async function rebuild(io) {
      const revision=++io.revision;io.working=true;io.phase="preview";io.error="";refresh();
      const rows=[],counts=new Map();
      for(let index=0;index<io.records.length;index++){
        if(!valid(io)||revision!==io.revision)return;
        const row=compile(io,index);rows.push(row);counts.set(row.appid,(counts.get(row.appid)||0)+1);
        if((index+1)%16===0)await yieldUI(io);
      }
      let changed=0,invalid=0;
      for(let index=0;index<rows.length;index++){
        const row=rows[index];if(counts.get(row.appid)>1)row.errors.push(t("duplicate"));
        row.changed=!row.errors.length&&row.changed;changed+=Number(row.changed);invalid+=Number(row.errors.length>0);
        if((index+1)%16===0)await yieldUI(io);
        if(!valid(io)||revision!==io.revision)return;
      }
      io.rows=rows;io.counts=counts;io.changed=changed;io.invalid=invalid;io.working=false;renderRows();refresh();
    }
    function renderRows() {
      const io=active;if(!io||io.phase!=="preview"||io.composing)return;
      const scroll=root.querySelector("[data-lin-io-scroll]"),range=io.virtual.update({scrollTop:Math.max(0,scroll.scrollTop-32),viewportHeight:scroll.clientHeight||336}).range(io.rows.length);
      const focus=doc.activeElement,selection=focus?.matches("[data-lin-io-field]")?{row:focus.dataset.linIoRow,field:focus.dataset.linIoField,start:focus.selectionStart,end:focus.selectionEnd}:null;
      const value=(row,field)=>field==="aliases"?io.core.quoteAliases(row.next.aliases):row.next[field]??"";
      setHtml(root.querySelector("[data-lin-io-rows]"),`<div style="height:${range.before}px"></div>${io.rows.slice(range.start,range.end).map(row=>`<div class="st-lin-transfer-row" data-lin-io-preview-row="${row.index}" data-changed="${row.changed}">${["appid",...io.core.fields].map((field,col)=>`<label><input type="text" data-lin-io-field="${field}" data-lin-io-row="${row.index}" value="${esc(field==="appid"?io.manual.get(row.index)?.appid??row.appid:io.manual.get(row.index)?.[field]??value(row,field))}" aria-label="${esc(t("line",{n:row.line}))} ${esc(io.core.headers[col])}"><small title="${esc(field==="appid"?options.official(io.library.get(row.appid)):field==="aliases"?io.core.quoteAliases(row.before.aliases):row.before[field]??"")}">${esc(field==="appid"?t("line",{n:row.line}):t("before")+"："+(field==="aliases"?io.core.quoteAliases(row.before.aliases):row.before[field]??""))}</small></label>`).join("")}<p class="st-lin-transfer-row-status">${esc(row.errors.join("；"))}</p></div>`).join("")}<div style="height:${range.after}px"></div>`,"name-transfer-preview");
      if(selection){const input=root.querySelector(`[data-lin-io-row="${selection.row}"][data-lin-io-field="${selection.field}"]`);input?.focus({preventScroll:true});input?.setSelectionRange(selection.start,selection.end);}
    }
    async function exportFile(template=false) {
      const io=active;io.working=true;io.error="";refresh();
      const selected=options.getSelected(),items=[];
      if(!template){const rows=options.getRows();for(let index=0;index<rows.length;index++){
        if(!valid(io))return;const row=rows[index];if(io.scope==="all"||selected.has(row.appid))items.push({appid:row.appid,name:options.official(row),...options.getSaved(row,io.includeSort)});
        if((index+1)%100===0)await yieldUI(io);
      }}
      const format=template?"xlsx":io.format,result=await worker(io).request({type:"export",format,items,includeSort:template||io.includeSort});if(!valid(io))return;
      const url=URL.createObjectURL(result.blob);try{const link=doc.createElement("a");link.href=url;link.download=template?"steam-buff-name-template.xlsx":`steam-buff-${mode}-names.${format}`;link.click();}finally{URL.revokeObjectURL(url);}
      io.working=false;io.message=template?"":t("exported",{n:items.length});refresh();
      log.info("name-transfer-exported","名称文件已导出",{operationId:io.id,mode,format,scope:template?"template":io.scope,count:items.length});
    }
    async function apply() {
      const io=active;if(!io||io.working||io.composing||!io.changed||io.invalid&&!io.validOnly)return;
      io.working=true;io.error="";refresh();const rows=io.rows.filter(row=>row.changed&&!row.errors.length);
      const current=()=>valid(io)&&rows.every(row=>same(options.getBase(row.appid),row.before));
      if(!current())throw new Error(t("updated"));
      await options.commit(rows,()=>valid(io),()=>yieldUI(io));if(!valid(io))return;
      const message=t("applied",{n:rows.length});
      log.info("name-transfer-imported","名称文件已应用到主窗口草稿",{operationId:io.id,mode,format:io.format,count:rows.length,invalid:io.invalid,durationMs:Math.round(performance.now()-io.started)});
      close("applied");options.onApplied(message);
    }
    async function generate() {
      const io=active;io.working=true;refresh();const edits=new Map(io.manual);let count=0;
      await options.loadReadings();
      for(let index=0;index<io.rows.length;index++){
        if(!valid(io))return;const row=io.rows[index];if(!row.errors.length&&row.next.custom_name){
          const pair=window.SteamBuff.libraryCustomNameMnemonic.readings(row.next.custom_name,{},window.pinyinPro);
          if(pair.pinyin.trim()){edits.set(index,{...edits.get(index),pinyin:pair.pinyin,mnemonic:pair.mnemonic});count++;}
        }if((index+1)%16===0)await yieldUI(io);
      }
      if(!valid(io))return;io.manual=edits;await rebuild(io);
      if(valid(io)){io.message=t("generated",{n:count});refresh();log.info("name-transfer-generated","导入预览读音已重新生成",{operationId:io.id,mode,count});}
    }
    function input(event) {
      const io=active,field=event.target;if(!io||io.working||!field.matches("[data-lin-io-field]"))return;
      const index=Number(field.dataset.linIoRow);io.manual.set(index,{...io.manual.get(index),[field.dataset.linIoField]:field.value});io.error="";io.composing=event.isComposing===true;
      if(io.composing){refresh();return;}
      if(field.dataset.linIoField==="appid"){void rebuild(io).catch(error=>reportError(error,io));return;}
      const previous=io.rows[index],row=compile(io,index);if(io.counts.get(row.appid)>1)row.errors.push(t("duplicate"));row.changed=!row.errors.length&&row.changed;
      io.rows[index]=row;io.changed+=Number(row.changed)-Number(previous.changed);io.invalid+=Number(row.errors.length>0)-Number(previous.errors.length>0);
      const element=field.closest("[data-lin-io-preview-row]");element.dataset.changed=String(row.changed);element.querySelector(".st-lin-transfer-row-status").textContent=row.errors.join("；");
      for(const control of element.querySelectorAll("[data-lin-io-field]")){
        const key=control.dataset.linIoField;if(control!==field&&!Object.hasOwn(io.manual.get(index),key)&&key!=="appid")control.value=key==="aliases"?io.core.quoteAliases(row.next.aliases):row.next[key]??"";
      }refresh();
    }
    function click(event) {
      const io=active,target=event.target;if(!io)return;
      if(target.closest("[data-lin-io-close]")){close();return;}if(io.working||io.composing)return;
      let task;if(target.closest("[data-lin-io-template]"))task=exportFile(true);
      else if(target.closest("[data-lin-io-back]")){io.worker?.close();io.worker=null;io.records=[];io.rows=[];io.bases.clear();io.manual.clear();io.phase="format";io.error="";root.querySelector("[data-lin-io-sheet-box]").hidden=true;refresh();}
      else if(target.closest("[data-lin-io-generate]"))task=generate();
      else if(target.closest("[data-lin-io-primary]")){
        if(io.phase==="preview")task=apply();else if(io.kind==="export")task=exportFile();else{const file=root.querySelector("[data-lin-file]");file.accept=io.format==="json"?".json,application/json":".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";file.click();}
      }if(task)void task.catch(error=>reportError(error,io));
    }
    function change(event) {
      const io=active,target=event.target;if(!io||io.working||io.composing)return;let task;
      if(target.matches("[data-lin-io-format]")){io.format=target.value;io.error="";io.worker?.close();io.worker=null;}
      else if(target.matches("[data-lin-io-scope]"))io.scope=target.value;
      else if(target.matches("[data-lin-io-legacy]"))io.legacyMode=target.value;
      else if(target.matches("[data-lin-io-include-sort]"))io.includeSort=target.checked;
      else if(target.matches("[data-lin-io-empty]")){io.clearEmpty=target.value==="clear";task=rebuild(io);}
      else if(target.matches("[data-lin-io-valid-only]"))io.validOnly=target.checked;
      else if(target.matches("[data-lin-io-sheet]"))task=sheet(target.value);
      else if(target.matches("[data-lin-file]")&&target.files?.[0]){const file=target.files[0];target.value="";task=readFile(file);}
      refresh();if(task)void task.catch(error=>reportError(error,io));
    }
    const handlers={click,input,change,compositionend:input,compositionstart:event=>{if(active&&event.target.matches("[data-lin-io-field]"))active.composing=true;}};
    for(const [type,handler]of Object.entries(handlers))root.addEventListener(type,handler);
    const cancel=event=>{event.preventDefault();close();};root.addEventListener("cancel",cancel);
    return Object.freeze({open,close,report:reportError,readFile,stop(){disposed=true;close("stop");for(const [type,handler]of Object.entries(handlers))root.removeEventListener(type,handler);root.removeEventListener("cancel",cancel);}});
  }
  window.SteamBuff.nameTransferUI=Object.freeze({create});
})();
