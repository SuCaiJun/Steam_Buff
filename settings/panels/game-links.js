/*
 * @Author        : Ricky
 * @Url           : sucaijun.com
 * @Email         : Ricky@LiHai.La
 * @Project       : Steam Buff
 * @Description   : 游戏相关链接列表与添加编辑浮窗
 * @File          : 设置面板|游戏相关链接
 * @Read me       : 感谢使用Steam Buff，源码注释齐全，支持二次开发。
 * @Remind        : 二次开发请保留原版权信息，谢谢。
 */
(function panelModule(root){
  'use strict';
  const PREVIEW_CONTEXT=Object.freeze({appId:4115450,gameName:'影之刃零'});
  /**
   * 创建链接设置面板，使用 options.storage 保存完整配置并通过 onConfigChange 回传。
   * 指针拖动使用完整卡片浮层和占位动画；松手或方向键提交排序，取消不写存储。
   */
  function create(options){
    const model=root.STGameLinks,esc=options.esc,attr=options.escAttr;
    const log=root.STLoggerFactory.createLogger('settings','game-links');
    const tr=(key,fallback,params)=>root.STI18n.text(`gameLinks.${key}`,fallback,params);
    let conf=options.config?.unavailable===true?null:model.normalize(options.config),busy=false;
    let drag = null, publishingSavedConfig = false;
    const label=item=>{
      const entry=model.definition(item);
      return entry.builtin&&!Object.hasOwn(item,'name')?tr(`preset.${item.id}`,entry.name):entry.name;
    };
    const typeLabel=type=>tr(`type.${type}`,type==='qrcode'?'二维码':'网页');
    const scopeLabel=scope=>tr(`scope.${scope}`,{all:'全部',store:'网页商店',library:'客户端库'}[scope]);
    const panel=shadow=>shadow.querySelector('[data-game-links-panel]');
    const value=(host,key)=>host.querySelector(`[data-game-links-field="${key}"]`);
    function setConfig(next){
      if (!publishingSavedConfig) clearDrag();
      conf=next?.unavailable===true?null:model.normalize(next);
    }
    function button(action,text,id='',disabled=false,title=''){
      return `<button type="button" class="dialog-btn" data-game-links-action="${attr(action)}" data-game-link-id="${attr(id)}" ${disabled?'disabled':''}${title?` title="${attr(title)}"`:''}>${esc(text)}</button>`;
    }
    function field(key,text,initial){
      return `<label class="game-links-field"><span>${esc(text)}</span>${options.fieldInput({field:{key,label:text},value:initial,dataset:'data-game-links-field',className:'settings-control'})}</label>`;
    }
    function select(key,text,values,selected,name){
      return `<label class="game-links-field"><span>${esc(text)}</span><select class="settings-control" aria-label="${attr(text)}" data-game-links-field="${attr(key)}">${values.map(item=>`<option value="${attr(item)}" ${item===selected?'selected':''}>${esc(name(item))}</option>`).join('')}</select></label>`;
    }
    function icon(type) {
      const url = attr(root.STSettingsAssets.gameLinkIcon(type));
      return `<span class="game-links-icon" style="mask-image:url('${url}')" aria-hidden="true"></span>`;
    }
    function iconButton(action, text, item, type, pressed) {
      return `<button type="button" class="game-links-icon-button" data-game-links-action="${attr(action)}" data-game-link-id="${attr(item.id)}" aria-label="${attr(text)}" title="${attr(text)}" ${pressed === undefined ? '' : `aria-pressed="${pressed}"`}>${icon(type)}</button>`;
    }
    function rows(){
      return conf.items.map(item => {
        const name = label(item);
        const dragLabel = tr('dragLabel', '拖拽 $name$ 排序，也可使用上下方向键', { name });
        const toggleLabel = item.enabled ? tr('disableItem', '停用 $name$', { name }) : tr('enableItem', '启用 $name$', { name });
        const editLabel = tr('editItem', '编辑 $name$', { name });
        const deleteLabel = tr('deleteItem', '删除 $name$', { name });
        return `<div class="game-links-row" data-game-link-row="${attr(item.id)}" data-enabled="${item.enabled}" role="listitem"><button type="button" class="game-links-drag-handle" data-game-link-handle aria-label="${attr(dragLabel)}" title="${attr(dragLabel)}">${icon('drag')}</button><div class="game-links-copy"><strong>${esc(name)}</strong><small class="game-links-meta">${esc(typeLabel(item.type))} · ${esc(scopeLabel(item.scope))}</small></div><div class="game-links-row-actions">${iconButton('toggle', toggleLabel, item, item.enabled ? 'enabled' : 'disabled', item.enabled)}${iconButton('edit', editLabel, item, 'edit')}${iconButton('delete', deleteLabel, item, 'delete')}</div></div>`;
      }).join('');
    }
    function html(){
      if(!conf)return `<div data-game-links-panel><p class="settings-card-note" data-game-links-message role="alert">${esc(tr('configFailed','链接设置读取失败，请重试读取。原配置尚未覆盖。'))}</p>${button('reload',tr('retry','重试读取'))}</div>`;
      const layout = `<div class="game-links-layout" role="radiogroup" aria-label="${attr(tr('layout','排版'))}"><span aria-hidden="true">${esc(tr('layout','排版'))}</span><div class="setting-mode">${[1,2].map(columns=>`<label class="setting-mode-option${conf.columns===columns?' selected':''}"><input type="radio" name="game-links-columns" data-game-links-columns value="${columns}" ${conf.columns===columns?'checked':''}>${esc(tr(`columns.${columns}`,`1行${columns}个`))}</label>`).join('')}</div></div>`;
      return `<div class="settings-form game-links-form" data-game-links-panel><div class="game-links-list" data-game-links-list role="list" aria-label="${attr(tr('title','相关链接'))}">${rows()}</div><div class="game-links-actions game-links-footer">${button('add',tr('add','添加链接'))}${button('reset',tr('reset','恢复默认'))}${layout}<span class="game-links-status" data-game-links-message role="status" hidden></span></div></div>`;
    }
    function message(host,text,error=false){
      const node=host.querySelector('[data-game-links-message]');
      node.textContent=text;
      node.hidden=!error;
      node.setAttribute('role',error?'alert':'status');
    }
    function renderRows(host){
      clearDrag();
      root.STDomUtils.setTrustedHTML(host.querySelector('[data-game-links-list]'),root.STDomUtils.trustedHTML(rows(),'game-links-settings-list'));
      host.querySelectorAll('[data-game-links-columns]').forEach(input=>{
        input.checked=Number(input.value)===conf.columns;
        input.closest('.setting-mode-option').classList.toggle('selected',input.checked);
      });
    }
    function errorText(error) {
      const messages = {
        NAME_REQUIRED: ["nameRequired", "请填写链接名称"],
        URL_REQUIRED: ["urlRequired", "请填写网址"],
        TOKEN_UNKNOWN: ["tokenUnknown", "仅支持 {APPID}、{GAME_NAME} 和 {CUSTOM_NAME} 占位符，请检查花括号。"],
        TOKEN_LOCATION: ["tokenLocation", "占位符不能用于协议、域名或登录信息。"],
      };
      const [key, fallback] = messages[error.code] || ["invalidUrl", "请填写有效的 HTTP/HTTPS 地址，且不要包含登录信息。"];
      return tr(key, fallback);
    }
    function lockControls(host, orderOnly = false) {
      busy = true;
      host.setAttribute('aria-busy', 'true');
      if (orderOnly) host.setAttribute('data-order-saving', '');
      const controls = Array.from(host.querySelectorAll("input,button")).filter(node => !orderOnly || !node.matches('[data-game-link-handle]'));
      const disabled = controls.map(node => node.disabled);
      controls.forEach(node => { node.disabled = true; });
      return () => {
        busy = false;
        host.removeAttribute('aria-busy');
        host.removeAttribute('data-order-saving');
        controls.forEach((node, index) => { node.disabled = disabled[index]; });
      };
    }
    async function save(host, next, statusHost = host, finishOrder = null) {
      if (busy) return false;
      const unlock = lockControls(host, !!finishOrder);
      let success = false;
      const operationId = root.STLoggerFactory.createOperationId();
      try {
        const saved = await options.storage.setGameLinks(next, { operationId });
        if (saved === false) throw new Error("相关链接设置写入失败");
        conf = model.normalize(saved);
        publishingSavedConfig = !!finishOrder;
        try { options.onConfigChange(conf); }
        finally { publishingSavedConfig = false; }
        message(statusHost, '');
        log.info("settings-save-success", "相关链接设置已保存", {
          operationId,
          count: conf.items.length,
          customCount: conf.items.filter(item => !model.definition(item).builtin).length
        });
        success = true;
        return true;
      } catch (error) {
        message(statusHost, tr("saveFailed", "链接设置保存失败，已保留原配置，请重试。"), true);
        log.error("settings-save-failed", "相关链接设置保存失败", { operationId, error });
        return false;
      } finally {
        try { if (finishOrder) await finishOrder(success); }
        finally {
          unlock();
          if (!finishOrder && host.isConnected) renderRows(host);
        }
      }
    }
    function preview(host){
      const text=host.querySelector('[data-game-links-preview-text]'),link=host.querySelector('[data-game-links-preview-link]');
      link.hidden=true;
      link.removeAttribute('href');
      // 内置项的网址留空时使用默认模板
      if(!value(host,'url').required&&!value(host,'url').value.trim()){
        text.textContent=tr('builtinPreview','预览：使用内置地址');
        return;
      }
      try{
        const template=model.validateTemplate(value(host,'url').value);
        const url=model.expand(template,PREVIEW_CONTEXT);
        text.textContent=tr('previewPrefix','预览：');
        link.textContent=url;
        root.STConfig.externalNavigation.applyToLink(link,url);
        link.hidden=false;
      }
      catch(error){
        if(!model.isValidationError(error))throw error;
        text.textContent=errorText(error);
      }
    }
    function openEditor(shadow,id){
      const original=id?conf.items.find(item=>item.id===id):null;
      if(id&&!original)return;
      const entry=original?model.definition(original):null;
      const builtin=!!entry?.builtin;
      const defaultEntry=builtin?model.definition({id:original.id}):null;
      const defaultName=builtin?tr(`preset.${original.id}`,defaultEntry.name):'';
      const actions = [{id:'cancel',label:root.STI18n.text('common.cancel','取消')},{id:'save',label:original?tr('saveEdit','保存修改'):tr('add','添加链接'),primary:true}];
      return root.STSettingsDialogs.dialog(shadow,{
        title:original?tr('editTitle','编辑链接'):tr('add','添加链接'),
        className:'game-links-dialog',
        actions,
        render(host){
          root.STDomUtils.setTrustedHTML(host,root.STDomUtils.trustedHTML(`<div class="game-links-editor" data-game-links-editor>${field('name',tr('name','链接名称'),original?label(original):'')}<div class="game-links-selects">${select('type',tr('typeLabel','类型'),model.TYPES,original?.type||'web',typeLabel)}${select('scope',tr('scopeLabel','显示范围'),model.SCOPES,original?.scope||'all',scopeLabel)}</div>${field('url',tr('template','网址'),entry?.urlTemplate??root.STConfig.gameLinkTemplates.baidu)}<div class="game-links-actions">${model.TOKENS.map(token=>button(`token-${token}`,`{${token}}`,'',false,token==='CUSTOM_NAME'?tr('customNameHint','自定义游戏名称；没有时使用 Steam 游戏名称'):'' )).join('')}</div><p class="settings-card-note">${esc(tr('tokensHint','{APPID} 替换为游戏 APPID；{GAME_NAME} 替换为 Steam 游戏名称；{CUSTOM_NAME} 替换为自定义游戏名称，没有时使用 Steam 游戏名称；'))}</p><p class="game-links-preview" aria-live="polite"><span data-game-links-preview-text></span><a data-game-links-preview-link hidden></a></p><p data-game-links-message role="status" hidden></p></div>`,'game-links-settings-editor'));
          value(host,'name').required=true;
          value(host,'url').required=!builtin;
          if(builtin)value(host,'url').placeholder=tr('builtinUrlPlaceholder','留空使用内置地址');
          host.dataset.gameLinksTokenTarget='name';
          host.addEventListener('focusin',event=>{
            const field=event.target.dataset.gameLinksField;
            if(field==='name'||field==='url')host.dataset.gameLinksTokenTarget=field;
          });
          preview(host);
        },
        initial:host=>value(host,'name'),
        onAction(action,editor){
          if(action!=='save')return true;
          const next=model.normalize(conf),name=value(editor,'name'),url=value(editor,'url');
          if(!name.value.trim()){
            name.setCustomValidity(tr('nameRequired','请填写链接名称'));
            name.reportValidity();
            return false;
          }
          if(!builtin||url.value.trim()){
            try{
              model.validateTemplate(url.value);
            }catch(error){
              if(!model.isValidationError(error))throw error;
              url.setCustomValidity(errorText(error));
              url.reportValidity();
              return false;
            }
          }
          const item={
            id:original?.id||`custom-${root.crypto.randomUUID()}`,
            enabled:original?.enabled??true,
            type:value(editor,'type').value,
            scope:value(editor,'scope').value
          };
          if(!builtin||name.value.trim()!==defaultName)item.name=name.value.trim();
          if(!builtin||(url.value.trim()&&url.value.trim()!==defaultEntry.urlTemplate))item.urlTemplate=url.value.trim();
          const index=next.items.findIndex(row=>row.id===item.id);
          if(index>=0)next.items[index]=item;else next.items.push(item);
          return save(panel(shadow),next,editor);
        }
      });
    }
    async function act(action,id,shadow){
      if(busy)return;
      const host=panel(shadow);
      if(action==='reload'){
        conf=model.normalize(await options.storage.getGameLinks());
        options.onConfigChange(conf);
        const wrapper=root.document.createElement('div');
        root.STDomUtils.setTrustedHTML(wrapper,root.STDomUtils.trustedHTML(html(),'game-links-settings-reload'));
        host.replaceWith(wrapper.firstElementChild);
        return;
      }
      if(!conf)return;
      if(action==='add'||action==='edit')return openEditor(shadow,id);
      if(action.startsWith('token-')){
        const token=action.slice(6);
        if(!model.TOKENS.includes(token))return;
        const editor=shadow.querySelector('[data-game-links-editor]').parentElement,input=value(editor,editor.dataset.gameLinksTokenTarget);
        input.setRangeText(`{${token}}`,input.selectionStart,input.selectionEnd,'end');
        input.setCustomValidity('');
        input.focus();
        preview(editor);
        return;
      }
      let next=model.normalize(conf);
      if(action==='reset')next=model.resetBuiltins(conf);else{
        const index=next.items.findIndex(item=>item.id===id);
        if(index<0)return;
        if(action==='delete')next=model.remove(next,id);
        else if(action==='toggle')next.items[index].enabled=!next.items[index].enabled;else return;
      }
      await save(host,next);
    }
    function handleClick(event,shadow){
      const node=event.target.closest('[data-game-links-action]');
      if(!node)return false;
      event.preventDefault();
      void act(node.dataset.gameLinksAction,node.dataset.gameLinkId,shadow).catch(error=>{
        message(panel(shadow),tr('actionFailed','链接操作失败，请重试。'),true);
        log.error('settings-action-failed','相关链接操作失败',{error});
      });
      return true;
    }
    function handleChange(event,shadow){
      const layout=event.target.closest('[data-game-links-columns]');
      if(layout){
        if(busy||!conf||!layout.checked||Number(layout.value)===conf.columns)return true;
        const next=model.normalize(conf);
        next.columns=Number(layout.value);
        void save(panel(shadow),next);
        return true;
      }
      const editor=event.target.closest('[data-game-links-editor]');
      if(editor){
        preview(editor);
        return true;
      }
      return false;
    }
    function handleInput(event){
      const editor=event.target.closest('[data-game-links-editor]');
      if(!editor||!event.target.matches('[data-game-links-field]'))return;
      event.target.setCustomValidity('');
      preview(editor);
    }
    function clearDrag() {
      const previous = drag;
      drag = null;
      if (!previous) return;
      clearOrderMotion(previous);
      root.removeEventListener('blur', clearDrag);
      root.document.removeEventListener('visibilitychange', cancelHiddenDrag);
    }
    function clearOrderMotion(state) {
      root.cancelAnimationFrame(state.frame);
      for (const animation of state.animations || []) animation.cancel();
      state.animations = [];
      state.row.classList.remove('dragging');
      for (const item of state.items || []) item.node.style.removeProperty('transform');
      if (state.preview?.isConnected) {
        // 浮层仍遮住卡片时结算占位颜色，避免恢复普通过渡后从占位背景闪回。
        root.getComputedStyle(state.row).backgroundColor;
        state.preview.remove();
      }
      state.list.classList.remove('is-sorting', 'is-settling');
      if (state.row.hasPointerCapture(state.pointerId)) state.row.releasePointerCapture(state.pointerId);
    }
    // 在同一次提交内调整真实顺序，再从当前画面位置过渡；不显示旧顺序的中间帧。
    async function moveOrder(state, nodes, floating) {
      if (!state.list.isConnected) return;
      const before = nodes.map(node => node.getBoundingClientRect());
      const active = state.list.getRootNode().activeElement;
      const scrollTop = state.scroller.scrollTop;
      const previewTransform = floating?.style.transform || 'none';
      const next = nodes[nodes.indexOf(state.row) + 1] || null;
      state.list.classList.add('is-settling');
      if (state.row.nextElementSibling !== next) state.list.insertBefore(state.row, next);
      for (const node of nodes) node.style.removeProperty('transform');
      state.scroller.scrollTop = scrollTop;
      const after = nodes.map(node => node.getBoundingClientRect());
      if (active?.isConnected && state.list.contains(active)) active.focus({ preventScroll: true });
      const duration = root.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160;
      state.animations = [];
      if (duration) nodes.forEach((node, index) => {
        if (floating && node === state.row) return;
        const offset = before[index].top - after[index].top;
        if (Math.abs(offset) > .5) state.animations.push(node.animate([{ transform: `translateY(${offset}px)` }, { transform: 'translateY(0)' }], { duration, easing: 'cubic-bezier(.2,.8,.2,1)' }));
      });
      if (floating?.isConnected) {
        const destination = `translate3d(0,${after[nodes.indexOf(state.row)].top - state.rect.top}px,0)`;
        floating.style.transform = destination;
        if (duration) state.animations.push(floating.animate([{ transform: previewTransform }, { transform: destination }], { duration, easing: 'cubic-bezier(.2,.8,.2,1)' }));
      }
      await Promise.allSettled(state.animations.map(animation => animation.finished));
    }
    async function savePointerOrder(host, state, next, changed) {
      state.settling = true;
      root.cancelAnimationFrame(state.frame);
      const original = state.items.map(item => item.node), ordered = original.slice();
      ordered.splice(state.to, 0, ordered.splice(state.from, 1)[0]);
      const settled = moveOrder(state, ordered, state.preview);
      const finish = async success => {
        try {
          await settled;
          if (drag === state) clearDrag();
          if (!success && host.isConnected && host.querySelector('[data-game-links-list]') === state.list) await moveOrder(state, original, null);
        } finally { clearOrderMotion(state); }
      };
      if (changed) await save(host, next, host, finish);
      else {
        const unlock = lockControls(host, true);
        try { await finish(true); }
        finally { unlock(); }
      }
    }
    function cancelHiddenDrag() {
      if (root.document.hidden) clearDrag();
    }
    function beginDrag() {
      const state = drag, rect = state.row.getBoundingClientRect();
      state.items = Array.from(state.list.children, node => ({ node, rect: node.getBoundingClientRect() }));
      state.from = state.items.findIndex(item => item.node === state.row);
      state.to = state.from;
      state.rect = rect;
      state.step = rect.height + parseFloat(root.getComputedStyle(state.list).rowGap);
      state.scroller = state.row.closest('.body');
      state.scrollTop = state.scroller.scrollTop;
      state.viewport = state.scroller.getBoundingClientRect();
      const preview = state.row.cloneNode(true);
      preview.removeAttribute('data-game-link-row');
      preview.removeAttribute('role');
      preview.setAttribute('aria-hidden', 'true');
      preview.inert = true;
      preview.classList.add('game-links-drag-preview');
      Object.assign(preview.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, font: root.getComputedStyle(state.row).font });
      state.row.closest('.overlay').append(preview);
      state.preview = preview;
      state.started = true;
      state.row.classList.add('dragging');
      state.list.classList.add('is-sorting');
      root.addEventListener('blur', clearDrag);
      root.document.addEventListener('visibilitychange', cancelHiddenDrag);
    }
    // 指针事件仅记录坐标；每帧只移动浮层，越过项目中点才更新本列表的占位动画。
    function paintDrag(time) {
      const state = drag;
      if (!state?.started || state.settling) return;
      root.cancelAnimationFrame(state.frame);
      state.frame = 0;
      if (!state.row.isConnected) { clearDrag(); return; }
      const elapsed = Math.min(32, state.time ? time - state.time : 16);
      state.time = time;
      const direction = state.y < state.viewport.top + 32 ? -1 : state.y > state.viewport.bottom - 32 ? 1 : 0;
      const oldScroll = state.scroller.scrollTop;
      if (direction) state.scroller.scrollTop += direction * elapsed * .5;
      const scroll = state.scroller.scrollTop - state.scrollTop;
      const top = Math.max(0, Math.min(root.innerHeight - state.rect.height, state.rect.top + state.y - state.startY));
      state.preview.style.transform = `translate3d(0,${top - state.rect.top}px,0)`;
      const center = top + state.rect.height / 2 + scroll;
      let to = 0;
      for (const item of state.items) if (item.node !== state.row && center > item.rect.top + item.rect.height / 2) to += 1;
      if (to !== state.to) {
        state.to = to;
        state.items.forEach((item, index) => {
          let offset = 0;
          if (index === state.from) offset = to > index ? state.items[to].rect.bottom - state.rect.bottom : state.items[to].rect.top - state.rect.top;
          else if (index > state.from && index <= to) offset = -state.step;
          else if (index < state.from && index >= to) offset = state.step;
          item.node.style.transform = offset ? `translateY(${offset}px)` : '';
        });
      }
      if (state.scroller.scrollTop !== oldScroll) state.frame = root.requestAnimationFrame(paintDrag);
    }
    function handlePointer(event, shadow) {
      if (event.type === 'pointerdown') {
        const row = event.target.closest('[data-game-link-row]');
        if (!row || event.button !== 0 || !event.isPrimary || busy || !conf || event.target.closest('[data-game-links-action]')) return false;
        clearDrag();
        event.preventDefault();
        row.querySelector('[data-game-link-handle]').focus({ preventScroll: true });
        drag = { row, id: row.dataset.gameLinkRow, list: row.parentElement, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, y: event.clientY, frame: 0, started: false };
        row.setPointerCapture(event.pointerId);
        return true;
      }
      if (!drag) return false;
      if (event.pointerId !== drag.pointerId) return true;
      if (drag.settling) return false;
      if (event.type === 'pointercancel' || event.type === 'lostpointercapture') { clearDrag(); return false; }
      drag.y = event.clientY;
      if (event.type === 'pointermove') {
        if (!drag.started && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 4) beginDrag();
        if (drag.started && !drag.frame) drag.frame = root.requestAnimationFrame(paintDrag);
        return true;
      }
      if (event.type !== 'pointerup') return true;
      if (drag.started) paintDrag(root.performance.now());
      const state = drag, { id, to, from, started } = state;
      if (!started || busy) { clearDrag(); return false; }
      const next = model.normalize(conf);
      const index = next.items.findIndex(item => item.id === id);
      if (index >= 0) {
        next.items.splice(to, 0, next.items.splice(index, 1)[0]);
        void savePointerOrder(panel(shadow), state, next, to !== from).catch(error => {
          if (drag === state) clearDrag();
          message(panel(shadow), tr('actionFailed','链接操作失败，请重试。'), true);
          log.error('sort-finish-failed', '相关链接排序收尾失败', { error });
        });
      } else clearDrag();
      return false;
    }
    async function saveOrder(host, next, id) {
      await save(host, next);
      if (host.isConnected) host.querySelector(`[data-game-link-row="${id}"] [data-game-link-handle]`)?.focus();
    }
    function handleKeyDown(event, shadow) {
      if (drag && !drag.settling && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); clearDrag(); return true; }
      const handle = event.target.closest('[data-game-link-handle]');
      if (!handle || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return false;
      event.preventDefault();
      if (busy || event.repeat || !conf) return true;
      const id = handle.closest('[data-game-link-row]').dataset.gameLinkRow;
      const next = model.normalize(conf), from = next.items.findIndex(item => item.id === id);
      const to = from + (event.key === 'ArrowUp' ? -1 : 1);
      if (from >= 0 && to >= 0 && to < next.items.length) {
        next.items.splice(to, 0, next.items.splice(from, 1)[0]);
        void saveOrder(panel(shadow), next, id);
      }
      return true;
    }
    return Object.freeze({html,setConfig,handleClick,handleChange,handleInput,handlePointer,handleKeyDown});
  }
  root.STSettingsGameLinksPanel=Object.freeze({create});
})(globalThis);
