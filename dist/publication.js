(() => {
  'use strict';
  const fields = ['uid','date','organizationName','organizationId','providerName','providerId','meterNumber','type','quantity','unitName'];
  const extras = ['tariff','timestamp'];
  const names = ['ID запису','Дата зняття','Заклад','ЄДРПОУ закладу','Постачальник','ЄДРПОУ постачальника','ID лічильника','Послуга','Показання','Одиниця','Тарифна зона','Час зняття'];
  const title = Object.fromEntries([...fields,...extras].map((f,i)=>[f,names[i]]));
  const refFields = ['organizationName','organizationId','providerName','providerId'];
  const storeKey = window.EnergyStorage.keys.publication;
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean = v => /^(null|-|—)$/i.test(String(v ?? '').trim()) ? '' : String(v ?? '').trim();
  const validDate = s => /^\d{4}-\d\d-\d\d$/.test(s) && !Number.isNaN(Date.parse(s+'T00:00:00Z')) && new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
  const blank = () => ({base:[],journal:[],rules:[]});
  let memory;
  function load() {
    if(memory) return memory;
    try {const s=JSON.parse(localStorage.getItem(storeKey));if(s&&['base','journal','rules'].every(k=>Array.isArray(s[k])))return memory=s;}catch{}
    return memory=blank();
  }
  function parseCsv(source) {
    const text=String(source).replace(/^\uFEFF/,'');
    if(!text.trim())throw Error('Файл порожній.');
    const head=text.split(/\r?\n/,1)[0];
    const sep=(head.match(/;/g)||[]).length>(head.match(/,/g)||[]).length?';':',';
    let rows=[],row=[],cell='',quoted=false,closed=false;
    function endCell(){row.push(cell);cell='';closed=false;}
    function endRow(){endCell();if(row.some(v=>v.trim()))rows.push(row);row=[];}
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(quoted){if(c!=='"')cell+=c;else if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}continue;}
      if(c===sep)endCell();
      else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;endRow();}
      else if(c==='"'&&!cell&&!closed)quoted=true;
      else if(closed||c==='"')throw Error('Некоректні лапки у CSV.');
      else cell+=c;
    }
    if(quoted)throw Error('У CSV є незакриті лапки.');
    endRow();
    const columns=(rows.shift()||[]).map(c=>c.trim());
    if(new Set(columns).size!==columns.length)throw Error('Є повторювані назви колонок.');
    const records=rows.map((values,i)=>{
      if(values.length!==columns.length)throw Error('Кількість полів не збігається із заголовком у записі '+(i+2)+'.');
      return Object.fromEntries(columns.map((c,j)=>[c,values[j]]));
    });
    return {columns,records};
  }
  function asCsv(rows,cols=fields){
    const quote=v=>{const s=String(v??'');return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
    return [cols.join(','),...rows.map(r=>cols.map(c=>quote(r[c])).join(','))].join('\r\n')+'\r\n';
  }
  function errors(r,requireId=true){
    const out=[];
    for(const f of fields)if((f!=='uid'||requireId)&&!clean(r[f]))out.push(title[f]);
    if(clean(r.date)&&!validDate(r.date))out.push('Дата має бути у форматі РРРР-ММ-ДД');
    if(clean(r.quantity)&&!/^[-+]?\d+(\.\d+)?$/.test(r.quantity))out.push('Показання має бути десятковим числом');
    for(const f of ['providerId','organizationId'])if(clean(r[f])&&!/^\d{8}$/.test(r[f]))out.push(title[f]+' має містити 8 цифр');
    return out;
  }
  function fingerprint(input){
    let a=2166136261,b=5381;
    for(let i=0;i<input.length;i++){const c=input.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b,33)^c;}
    return (a>>>0).toString(36)+'-'+(b>>>0).toString(36);
  }
  const tuple=(r,keys)=>JSON.stringify(keys.map(f=>String(r[f]??'').trim()));
  const identity=r=>tuple(r,['organizationId','meterNumber','date','type']);
  const detail=r=>tuple(r,extras);
  const sameValues=(a,b)=>fields.slice(1).every(k=>String(a[k]??'').trim()===String(b[k]??'').trim());
  function plan(s){
    const output=[],byId=new Map(),byKey=new Map(),meta=new Map();
    function index(r,i){if(!byKey.has(identity(r)))byKey.set(identity(r),[]);byKey.get(identity(r)).push(i);if(!byId.has(r.uid))byId.set(r.uid,[]);byId.get(r.uid).push(i);}
    function insert(r){output.push({...r});index(r,output.length-1);}
    function replace(i,r){const prev=output[i];byKey.set(identity(prev),byKey.get(identity(prev)).filter(j=>j!==i));byId.set(prev.uid,byId.get(prev.uid).filter(j=>j!==i));output[i]={...r,uid:prev.uid,_key:prev._key,_editKey:r._key};index(output[i],i);}
    for(const r of s.base)insert(r);
    for(const r of s.base){const e=errors(r);if((byId.get(r.uid)||[]).length>1)e.push('Неунікальний ID запису');meta.set(r._key,{status:e.length?'error':'base',message:e.join(' · ')});}
    const seenJournal=new Set();
    for(const r of s.journal){
      if(r._choice==='skip'){meta.set(r._key,{status:'skip',message:'Пропущено за рішенням користувача'});continue;}
      const e=errors(r,false);
      if(e.length){meta.set(r._key,{status:'error',message:e.join(' · ')});continue;}
      const gen='P-'+fingerprint(identity(r)+detail(r));
      const idCandidates=byId.get(r.uid||gen)||[];
      const candidates=idCandidates.length?idCandidates:(byKey.get(identity(r))||[]).filter(i=>{
        const old=output[i];
        if(r.uid&&old.uid&&!old.uid.startsWith('P-'))return false;
        return !extras.some(k=>r[k]&&old[k]&&r[k]!==old[k]);
      });
      if(candidates.length===1&&sameValues(r,output[candidates[0]])&&!extras.some(k=>r[k]&&output[candidates[0]][k]&&r[k]!==output[candidates[0]][k])&&(r.uid||gen===output[candidates[0]].uid||(!extras.some(k=>r[k]||output[candidates[0]][k])))&&!(seenJournal.has(output[candidates[0]]._key)&&!r.uid)){
        meta.set(r._key,{status:'same',message:'Уже є в результаті'});continue;
      }
      if(candidates.length&&r._choice!=='add'){
        const selected=candidates.find(i=>output[i]._key===r._target);
        if(selected!==undefined&&r._choice==='replace'){replace(selected,r);meta.set(r._key,{status:'changed',message:'Підтверджена заміна'});continue;}
        meta.set(r._key,{status:'conflict',message:'Потрібно порівняти записи',options:candidates.map(i=>({...output[i]}))});continue;
      }
      let assigned=r.uid||gen;
      if(r._choice==='add'&&(byId.has(assigned)||!r.uid))assigned='P-'+fingerprint(identity(r)+detail(r)+'/'+r._key);
      if((byId.get(assigned)||[]).length){meta.set(r._key,{status:'error',message:'Такий ID вже існує. Введіть інший.'});continue;}
      insert({...r,uid:assigned});seenJournal.add(r._key);meta.set(r._key,{status:'new',message:'Новий запис'});
    }
    return {output,meta,blocked:[...meta.values()].filter(m=>m.status==='error'||m.status==='conflict').length};
  }
  function fillPair(r,idField,nameField,id,name){
    id=clean(id);name=clean(name);
    if(!id||!name)return;
    const existingId=clean(r[idField]),existingName=clean(r[nameField]);
    const norm=v=>v.normalize('NFKC').toLocaleLowerCase('uk').replace(/\s+/g,' ').trim();
    if(existingId&&existingId!==id||existingName&&norm(existingName)!==norm(name))return;
    if(!existingId)r[idField]=id;
    if(!existingName)r[nameField]=name;
  }
  function applyRegistry(r,state){
    if(!state||!clean(r.meterNumber))return;
    const buildingId=state.meterIndex?.[r.meterNumber], code=state.links?.[buildingId];
    const resource=state.meterResources?.[r.meterNumber];
    if(typeof resource==='string'&&resource!=='Ресурс не вказано'){
      const type=resource.replace(/\s*\([^)]*\)\s*$/,'').trim();
      if(!clean(r.type))r.type=type;
      if(!clean(r.unitName)&&clean(r.type)===type){
        if(/Гкал/i.test(resource))r.unitName='гігакалорія';
        else if(/м[³3]|^Холодна вода$|^Газ$/i.test(resource))r.unitName='кубічний метр';
        else if(resource==='Електроенергія')r.unitName='кіловат-година';
      }
    }
    if(buildingId===undefined||!code||!/^\d{8}$/.test(String(code)))return;
    const name=state.subjects?.[code];
    if(typeof name==='string')fillPair(r,'organizationId','organizationName',code,name);
  }
  function applyRules(r,rules){
    if(!validDate(r.date))return;
    const matches=rules.filter(v=>v.meterNumber===r.meterNumber&&v.type===r.type&&(!v.start||r.date>=v.start)&&(!v.end||r.date<=v.end));
    if(matches.length===1){
      const v=matches[0];fillPair(r,'organizationId','organizationName',v.organizationId,v.organizationName);
      fillPair(r,'providerId','providerName',v.providerId,v.providerName);
    }
  }
  function importData(s,source,kind,state){
    const {columns,records}=parseCsv(source);
    const needed=kind==='base'?fields:['date','meterNumber','quantity'];
    const absent=needed.filter(c=>!columns.includes(c));
    if(absent.length)throw Error('Бракує колонок: '+absent.join(', ')+'.');
    if(!records.length)throw Error('У файлі є заголовки, але немає записів.');
    const old=new Set(s[kind].map(r=>r._key));
    const batch=fingerprint(source.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n'));
    let added=0;
    records.forEach((raw,i)=>{
      const key=kind+'-'+batch+'-'+i;
      if(old.has(key))return;
      const r=Object.fromEntries([...fields,...extras].map(f=>[f,String(raw[f]??'').trim()]));
      r._key=key;
      if(kind==='journal'){
        for(const f of fields)r[f]=clean(r[f]);
        if(/^[-+]?\d+,\d+$/.test(r.quantity))r.quantity=r.quantity.replace(',','.');
        applyRegistry(r,state);applyRules(r,s.rules);
      }
      s[kind].push(r);added++;
    });
    return added;
  }
  const labels={error:'Виправити',conflict:'Збіг',skip:'Пропущено',same:'Без змін',base:'Опубліковано',changed:'Оновлено',new:'Додано'};
  const example={date:'2025-12-31',meterNumber:'DEMO-01',type:'Електроенергія',quantity:'125.4',unitName:'кіловат-година',organizationName:'Умовний заклад',organizationId:'00000001',providerName:'Умовний постачальник',providerId:'00000002',uid:'DEMO-reading-1'};
  function importJournal(source,state){
    const s=load();
    const next={...s,journal:[...s.journal]};
    const added=importData(next,source,'journal',state);
    localStorage.setItem(storeKey,JSON.stringify(next));
    memory=next;
    return added;
  }
  window.PublicationData={parseCsv,asCsv,plan,importData,importJournal,applyRules,applyRegistry,errors};
  window.renderPublication=(host,state,helpers)=>{
    const s=load();
    for(const r of s.journal){applyRegistry(r,state);applyRules(r,s.rules);}
    const buildings=new Map(state.buildings.map(b=>[String(b.id),b]));
    const catalog=Object.entries(state.meterIndex||{}).map(([meterNumber,id])=>{
      const row=Object.fromEntries(fields.map(f=>[f,'']));
      row.meterNumber=meterNumber;
      applyRegistry(row,state);
      return {...row,buildingName:buildings.get(String(id))?.name||''};
    }).sort((a,b)=>a.buildingName.localeCompare(b.buildingName,'uk')||a.meterNumber.localeCompare(b.meterNumber,'uk',{numeric:true}));
    let view=plan(s).output.length?'result':'meters',viewPage=0,query='',draft=null;
    let page=0,filter='needed',active='',review=false,stream='journal',feedback='';
    const save=msg=>{feedback=msg;try{localStorage.setItem(storeKey,JSON.stringify(s));}catch{feedback+=' Зміни збережено лише у цій вкладці: локальне сховище недоступне.';}};
    const btn=(id,label,attr='')=>'<button type="button" id="pub-'+id+'" '+attr+'>'+label+'</button>';
    const field=(id,l,type='text',v='')=>'<label>'+esc(l)+'<input type="'+type+'" id="pub-'+id+'" value="'+esc(v)+'"></label>';
    const el=id=>host.querySelector('#pub-'+id);
    const click=(id,fn)=>{const b=el(id);if(b)b.onclick=fn;};
    const fileBtn=(kind,name)=>'<label class="pb-file"><span>'+name+'</span><input type="file" aria-label="'+name+'" id="pub-'+kind+'" accept=".csv,text/csv"></label>';
    const section=(heading,html)=>'<section class="pb-box"><h3>'+heading+'</h3>'+html+'</section>';
    function editor(r,m,kind=stream){
      const opts=(m?.options||[]).map(o=>'<option value="'+esc(o._key)+'">'+esc([o.uid,o.date,o.type,o.tariff,o.quantity,o.unitName].filter(Boolean).join(' · '))+'</option>').join('');
      const input=f=>field('f-'+f,title[f],f==='date'?'date':'text',r[f]);
      const form=kind==='base'?fields.map(input).join(''):
        ['date','quantity','unitName','meterNumber','type',...refFields].map(input).join('')+
        '<details><summary>ID запису, тариф та час</summary><p class="pb-note">Порожній ID запису система створить під час формування звіту.</p>'+['uid',...extras].map(input).join('')+'</details>';
      const buildingId=kind==='journal'?state?.meterIndex?.[r.meterNumber]:undefined;
      const building=buildingId===undefined?null:state?.buildings?.find(b=>String(b.id)===String(buildingId));
      const buildingNote=building?'<p class="pb-note">Будівля за реєстром лічильників: '+esc(building.name)+'</p>':'';
      const rule=kind==='journal'?'<details><summary>Запам’ятати реквізити закладу й постачальника</summary><p>Реквізити застосовуються до порожніх полів для цього лічильника та послуги. Укажіть період дії договору.</p><div class="pb-row">'+field('start','Початок дії','date')+field('end','Кінець дії','date')+'</div><label class="pb-check"><input type="checkbox" id="pub-rule"> Зберегти ці реквізити в довіднику</label></details>':'';
      const conflict=opts?'<label>Запис для заміни<select id="pub-target">'+opts+'</select></label><div class="pb-row">'+btn('replace','Замінити вибраний')+btn('add','Зберегти як окреме зняття')+'</div>':'';
      return '<section id="pub-edit" class="pb-box"><h3>Показання лічильника</h3>'+buildingNote+'<p id="pub-err" role="status">'+esc(m?.message)+'</p><div class="pb-in">'+form+'</div>'+rule+conflict+'<div class="pb-row">'+btn('save','Зберегти показання','class="pb-primary"')+(kind==='journal'&&!draft?btn('skip','Пропустити запис'):'')+btn('close','Закрити')+'</div></section>';
    }
    function addRule(r){
      const v=Object.fromEntries(['meterNumber','type',...refFields].map(f=>[f,r[f]]));
      v.start=el('start').value;v.end=el('end').value;
      if(!v.meterNumber||!v.type||refFields.some(f=>!clean(v[f]))||!/^\d{8}$/.test(v.organizationId)||!/^\d{8}$/.test(v.providerId)||v.start&&v.end&&v.start>v.end)throw Error('Перевірте реквізити, восьмизначні коди та період.');
      const same=(a,b)=>a.meterNumber===b.meterNumber&&a.type===b.type;
      const samePeriod=(a,b)=>a.start===b.start&&a.end===b.end;
      if(s.rules.some(a=>same(a,v)&&!samePeriod(a,v)&&(!a.end||!v.start||a.end>=v.start)&&(!v.end||!a.start||v.end>=a.start)))throw Error('Період перетинається з уже збереженим. Вкажіть окремий період або збережіть лише цей запис.');
      s.rules=s.rules.filter(a=>!(same(a,v)&&samePeriod(a,v)));s.rules.push(v);
      for(const item of s.journal)applyRules(item,s.rules);
    }
    function edit(r,choice){
      const updated={...r};
      for(const f of [...fields,...extras])if(el('f-'+f))updated[f]=el('f-'+f).value.trim();
      if(/^[-+]?\d+,\d+$/.test(updated.quantity))updated.quantity=updated.quantity.replace(',','.');
      if(draft||stream==='journal'){applyRegistry(updated,state);applyRules(updated,s.rules);}
      try{if(el('rule')?.checked)addRule(updated);}catch(e){el('err').textContent=e.message;return;}
      Object.assign(r,updated,{_choice:choice,_target:choice==='replace'?el('target')?.value:''});
      if(draft){
        if(!s.journal.some(item=>item._key===r._key))s.journal.push(r);
        draft=null;
      }
      active='';review=false;
      const result=plan(s), status=result.meta.get(r._key);
      const needsWork=status?.status==='error'||status?.status==='conflict';
      if(!needsWork){view='result';viewPage=0;query='';}
      save(needsWork?'Запис у чернетці. '+status.message:'Показання збережено. Таблицю resources.csv оновлено.');
      draw();
    }
    function previewShell(p){
     const count=Object.keys(state.periods).length;
     const periods=Object.keys(state.periods).sort();
     let emptyHint='';
     if(!catalog.length&&!s.journal.length&&!s.base.length){
       emptyHint=count?`Імпортовано річні звіти за ${periods.join(', ')}. Додайте «Лічильники (3).xlsx» для підготовки рядків за приладами або журнал із фактичними показаннями.`:'Завантажте реєстр будівель і «Лічильники (3).xlsx» у розділі «Імпорт» або додайте журнал показань.';
     }
     return section('Звіт resources.csv',`<p>Дані надходять із розділу <a href="#import">«Імпорт»</a>. Одне зняття показання — один рядок звіту.</p>
     ${emptyHint?`<p class="notice">${esc(emptyHint)}</p>`:''}
     <div class="pb-row report-tabs" role="group" aria-label="Режим таблиці">
     <button id="pub-view-meters" aria-pressed="${view==='meters'}">Лічильники з імпорту (${catalog.length})</button>
     <button id="pub-view-result" aria-pressed="${view==='result'}">Результат CSV (${p.output.length})</button></div>
     <label class="report-search">Пошук у таблиці<input id="pub-search" placeholder="ID лічильника, заклад або послуга" value="${esc(query)}"></label>
     <div id="pub-grid"></div><p class="pb-note" id="pub-feedback" aria-live="polite">${esc(feedback)}</p>
     ${catalog.length&&!Object.keys(state.meterResources||{}).length?`<p class="pb-note">Для раніше збережених даних повторно завантажте «Лічильники (3).xlsx», щоб автоматично підставити послугу й одиницю.</p>`:''}
     ${catalog.length?btn('draftCSV','Завантажити заготовку лічильників') : ''}
     <div class="report-download"><label class="pb-check"><input type="checkbox" id="pub-review" ${review?'checked ':''}${p.blocked||!p.output.length?'disabled':''}> Підтверджую перевірку звіту</label>
     ${btn('export','Завантажити resources.csv','class="pb-primary" '+(!review||p.blocked||!p.output.length?'disabled':''))}
     ${p.blocked?`<span class="pb-note">Потребують перевірки: ${p.blocked}. <a href="#pub-audit" id="pub-seeProblems">Переглянути записи</a></span>`:''}</div>`);
    }
    function annualSample(){
      const years=Object.keys(state.periods).sort();
      if(catalog.length||!years.length)return '';
      const rows=[];
      for(const b of state.buildings){
        for(const year of years){
          const values=b.years?.[year];
          if(!values?.some(v=>v!==null&&v!==undefined))continue;
          const cells=values.map(v=>'<td>'+esc(v==null?'—':new Intl.NumberFormat('uk-UA',{maximumFractionDigits:3}).format(v))+'</td>').join('');
          rows.push('<tr><td>'+esc(b.name)+'</td><td>'+esc(year)+'</td>'+cells+'</tr>');
          if(rows.length===6)break;
        }
        if(rows.length===6)break;
      }
      if(!rows.length)return '';
      return section('Річні дані з імпорту','<p>Перші '+rows.length+' заповнених рядків. Ці значення показують споживання будівлі за період. Для resources.csv потрібні показання окремого приладу на дату зняття.</p><div class="pb-scroll"><table><thead><tr>'+['Будівля','Рік','Тепло, Гкал','Електроенергія, кВт·год','Газ, м³','Холодна вода, м³','Гаряча вода, м³'].map(h=>'<th scope="col">'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>');
    }
    function drawPreview(p){
     const isResult=view==='result';
     const pending=new Map();
     for(const r of s.journal){
       if(p.meta.get(r._key)?.status==='error'&&!pending.has(r.meterNumber))pending.set(r.meterNumber,r);
     }
     const source=isResult?p.output:catalog;
     const term=query.trim().toLocaleLowerCase('uk');
     const searchFields=isResult?fields:['buildingName','meterNumber','organizationName','organizationId','type','unitName'];
     const filtered=source.filter(row=>!term||searchFields.some(f=>String(row[f]??'').toLocaleLowerCase('uk').includes(term)));
     const pages=Math.max(1,Math.ceil(filtered.length/12));viewPage=Math.max(0,Math.min(viewPage,pages-1));
     const columns=isResult?fields:['meterNumber','type','unitName','date','quantity','organizationName','organizationId','providerName','providerId','uid'];
     const rs=filtered.slice(viewPage*12,viewPage*12+12);
     const parts=rs.map(record=>{
       const r=isResult?record:pending.get(record.meterNumber)||record;
       const first=isResult?'':`<td><button data-read-meter="${esc(record.meterNumber)}">${pending.has(record.meterNumber)?'Дозаповнити':'Ввести показання'}</button><small>${esc(record.buildingName)}</small></td>`;
       const cell=f=>isResult&&f==='uid'?`<button type="button" title="Переглянути та змінити запис" data-result-key="${esc(r._editKey||r._key)}">${esc(r.uid||'—')}</button>`:esc(clean(r[f])||'—');
       let tr=`<tr>${first}${columns.map(f=>`<td>${cell(f)}</td>`).join('')}</tr>`;
       if(!isResult&&draft&&draft.meterNumber===record.meterNumber){
         tr+=`<tr><td colspan="${columns.length+1}" class="report-editor">${editor(draft,p.meta.get(draft._key),'journal')}</td></tr>`;
       }
       return tr;
     });
     const head=columns.map(f=>`<th scope="col">${esc(title[f])}<small>${esc(f)}</small></th>`).join('');
     const hint=isResult?'Збережені показання з’являться тут після заповнення обов’язкових полів.':'Дані про лічильники з’являться після імпорту їхнього реєстру.';
     el('grid').innerHTML=`<p class="pb-note">${isResult?'Попередній перегляд усіх 10 колонок у порядку експорту.':'Заготовки за реєстром. Введіть фактичну дату й показання для потрібного приладу. Незаповнені заготовки не входять до resources.csv.'}</p>`+
     (rs.length?`<div class="pb-scroll" tabindex="0" aria-label="Таблиця звіту"><table class="report-table"><thead><tr>${isResult?'':'<th scope="col">Будівля та дія</th>'}${head}</tr></thead><tbody>${parts.join('')}</tbody></table></div>`:`<p class="empty">${term?'Нічого не знайдено.':hint}</p>`)
     +`<div class="pb-row"><span>Рядків: ${filtered.length} · сторінка ${viewPage+1} із ${pages}</span>${btn('grid-prev','Назад',viewPage===0?'disabled':'')}${btn('grid-next','Далі',viewPage+1>=pages?'disabled':'')}</div>`;
     click('grid-prev',()=>{draft=null;viewPage--;drawPreview(p);});click('grid-next',()=>{draft=null;viewPage++;drawPreview(p);});
     for(const button of el('grid').querySelectorAll('[data-result-key]'))button.onclick=()=>{
       active=button.dataset.resultKey;
       stream=s.journal.some(r=>r._key===active)?'journal':'base';
       filter='all';page=Math.floor(s[stream].findIndex(r=>r._key===active)/12);
       draft=null;review=false;draw();el('f-date')?.focus();
     };
     for(const b of el('grid').querySelectorAll('[data-read-meter]'))b.onclick=()=>{
       const row=catalog.find(x=>x.meterNumber===b.dataset.readMeter);
       draft=pending.get(row.meterNumber)||{...Object.fromEntries([...fields,...extras].map(f=>[f,row[f]||''])),_key:'entry-'+crypto.randomUUID()};
       active='';review=false;stream='journal';draw();el('f-date')?.focus();
     };
     if(draft){
       click('save',()=>edit(draft,''));click('close',()=>{draft=null;draw();});
       const dateInput=el('f-date');
       if(dateInput)dateInput.onchange=()=>{
         const copy={...draft,date:dateInput.value};
         for(const f of refFields)copy[f]=el('f-'+f).value.trim();
         applyRegistry(copy,state);applyRules(copy,s.rules);
         for(const f of refFields)if(!el('f-'+f).value)el('f-'+f).value=copy[f]||'';
       };
     }
    }
    function draw(){
      const p=plan(s), visible=s[stream].filter(r=>filter==='all'||['error','conflict'].includes(p.meta.get(r._key)?.status));
      page=Math.max(0,Math.min(page,Math.ceil(visible.length/12)-1));
      const editing=s[stream].find(r=>r._key===active);
      const display=visible.slice(12*page,12*page+12);
      const rows=display.map(r=>'<tr><td>'+esc(r.date)+'</td><td>'+esc(r.meterNumber)+'</td><td>'+esc(r.type)+'</td><td>'+esc(r.quantity)+' '+esc(r.unitName)+'</td><td>'+labels[p.meta.get(r._key).status]+'</td><td><button type="button" data-pk="'+esc(r._key)+'">Перевірити</button></td></tr>').join('');
      const table=rows?'<div class="pb-scroll"><table><thead><tr><th>Дата</th><th>Лічильник</th><th>Послуга</th><th>Показання</th><th>Стан</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p class="pb-note">Немає записів у вибраній групі.</p>';
      const pager=visible.length>12?'<div class="pb-row">'+btn('prev','Назад',page===0?'disabled':'')+' Сторінка '+(page+1)+' з '+Math.ceil(visible.length/12)+' '+btn('next','Далі',12*(page+1)>=visible.length?'disabled':'')+'</div>':'';
      host.innerHTML='<div class="pub-wrap"><style>'+css+'</style>'+
        previewShell(p)+
        annualSample()+
        section('Додати журнал або попередню публікацію','<p>Один запис журналу — одне зняття показання приладу. Річні підсумки використовуються для паспорта будівлі.</p><div class="pb-row">'+fileBtn('journal','Додати журнал CSV')+fileBtn('base','Додати попередній resources.csv')+'</div><details><summary>Формат журналу та шаблон</summary><p>CSV у UTF-8, роздільник — кома або крапка з комою. Обов’язкові заголовки: <code>date, meterNumber, quantity</code>. Для відомого лічильника сервіс підставляє <code>type</code> та <code>unitName</code> із реєстру. Їх можна також передати у файлі. Можна додати реквізити закладу та постачальника, <code>uid</code>, <code>tariff</code>, <code>timestamp</code>. Для багатотарифного приладу кожна зона має власний запис. Для кількох знять за одну дату передавайте стабільний UID. Точний формат початкового журналу uMuni потрібно звірити зі зразком.</p><div class="pb-row">'+btn('template','Порожній шаблон')+btn('example','Умовний приклад CSV')+'</div></details><p class="pb-note">Журнал і реквізити зберігаються в цьому браузері.</p>')+
        '<div id="pub-audit">'+section('Перевірка записів','<p>У журналі: <b>'+s.journal.length+'</b> · Попередніх: <b>'+s.base.length+'</b> · Потребують рішення: <b>'+p.blocked+'</b></p><div class="pb-row"><label>Джерело<select id="pub-stream"><option value="journal">Новий журнал</option><option value="base">Попередній ресурс</option></select></label><label>Показати<select id="pub-filter"><option value="needed">Потребують рішення</option><option value="all">Усі записи</option></select></label></div>'+table+pager+(editing?editor(editing,p.meta.get(editing._key)):''))+'</div>'+
        (s.base.length||s.journal.length?'<p>'+btn('reset','Почати іншу публікацію')+'</p>':'')+
        (s.rules.length?'<details class="pb-box"><summary>Збережені реквізити ('+s.rules.length+')</summary><p class="pb-note">Видалення правила діє для наступних імпортів; уже перевірені рядки зберігаються.</p>'+s.rules.map((r,i)=>'<div class="pb-row"><span>'+esc([r.meterNumber,r.type,r.providerName,(r.start||'без початкової дати')+' — '+(r.end||'без кінцевої дати')].join(' · '))+'</span><button type="button" data-rule-index="'+i+'">Вилучити правило</button></div>').join('')+'</details>':'')+
        '</div>';
      drawPreview(p);
      for(const key of ['meters','result'])click('view-'+key,()=>{view=key;viewPage=0;query='';active='';draft=null;draw();});
      el('search').oninput=e=>{query=e.target.value;viewPage=0;draft=null;drawPreview(p);};
      click('draftCSV',()=>helpers.download('resources-draft.csv',asCsv(catalog)));
      click('seeProblems',e=>{e.preventDefault();stream=s.journal.some(r=>['error','conflict'].includes(p.meta.get(r._key)?.status))?'journal':'base';filter='needed';page=0;draft=null;active='';draw();el('audit').scrollIntoView({block:'start'});});
      el('stream').value=stream;el('filter').value=filter;
      el('stream').onchange=e=>{stream=e.target.value;active='';draft=null;page=0;draw();};
      el('filter').onchange=e=>{filter=e.target.value;active='';draft=null;page=0;draw();};
      for(const kind of ['base','journal'])el(kind).onchange=async e=>{
        const file=e.target.files?.[0];if(!file)return;
        try{const added=importData(s,await file.text(),kind,state);stream=kind;filter='all';page=viewPage=0;active='';draft=null;view=plan(s).output.length?'result':'meters';query='';review=false;save('Додано записів: '+added+'.');}catch(err){feedback=err.message;}draw();
      };
      click('template',()=>helpers.download('journal-template.csv',asCsv([],[...fields,...extras])));
      click('example',()=>helpers.download('journal-example-demo.csv',asCsv([example],[...fields,...extras])));
      click('prev',()=>{page--;active='';draw();});click('next',()=>{page++;active='';draw();});
      for(const b of host.querySelectorAll('[data-pk]'))b.onclick=()=>{draft=null;active=b.dataset.pk;draw();el('edit')?.scrollIntoView({block:'nearest'});};
      for(const b of host.querySelectorAll('[data-rule-index]'))b.onclick=()=>{if(window.confirm('Вилучити правило довідника?')){s.rules.splice(Number(b.dataset.ruleIndex),1);save('Правило вилучено.');draw();}};
      el('review').onchange=e=>{review=e.target.checked;el('export').disabled=!review;};
      click('export',()=>{if(review&&!p.blocked&&p.output.length){helpers.download('resources.csv',asCsv(p.output));helpers.notify?.('CSV сформовано');}});
      click('reset',()=>{if(window.confirm('Очистити всі записи цієї публікації? Збережені реквізити залишаться у браузері.')){s.journal=[];s.base=[];page=viewPage=0;review=false;active='';draft=null;view='meters';query='';save('Записи очищено.');draw();}});
      if(editing){for(const mode of ['replace','add','skip'])click(mode,()=>edit(editing,mode));click('save',()=>edit(editing,''));click('close',()=>{active='';draw();});}
    }
    draw();
  };
  const css='.pub-wrap{max-width:1200px}.pub-wrap *{box-sizing:border-box}.pub-wrap h3{margin:0 0 .65rem}.pub-wrap p{margin:.5rem 0;line-height:1.5}.pub-wrap .pb-box{padding:clamp(16px,2.2vw,26px);border:1px solid #dce4df;border-radius:14px;background:#fff;margin:0 0 16px}.pub-wrap .pb-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0}.pub-wrap .pb-in{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:13px;margin:14px 0}.pub-wrap button,.pub-wrap select,.pub-wrap input{font:inherit;max-width:100%}.pub-wrap button,.pub-wrap .pb-file{display:inline-flex;align-items:center;justify-content:center;border:1px solid #cad7ce;border-radius:8px;padding:8px 12px;background:#fff;color:#1d493a;cursor:pointer;font-weight:600}.pub-wrap button:disabled{opacity:.45;cursor:default}.pub-wrap button.pb-primary{background:#173e33;color:#fff}.pub-wrap label{display:grid;gap:4px;color:#294638}.pub-wrap input:not([type=checkbox]),.pub-wrap select{border:1px solid #b7c8bd;border-radius:7px;background:#fff;color:#16382b;padding:8px}.pub-wrap .pb-note{color:#52665c;font-size:.9rem}.pub-wrap .pb-file{padding:0;position:relative;overflow:hidden}.pub-wrap .pb-file span{padding:9px 14px}.pub-wrap .pb-file input{position:absolute;inset:0;opacity:0;width:100%;cursor:pointer}.pub-wrap .pb-file:focus-within{outline:2px solid #173e33}.pub-wrap .pb-scroll{overflow:auto}.pub-wrap table{border-collapse:collapse;width:100%;font-size:.9rem}.pub-wrap th,.pub-wrap td{text-align:left;padding:8px;border-bottom:1px solid #dce4df;white-space:nowrap}.pub-wrap th{background:#f4f7f4}.pub-wrap details{margin:12px 0}.pub-wrap summary{cursor:pointer}.pub-wrap .pb-check{display:flex;align-items:center;gap:8px;margin:12px 0}.pub-wrap .pb-msg:empty{display:none}.pub-wrap .pb-msg{padding:10px;background:#eef5f0;border-radius:8px}';
})();
