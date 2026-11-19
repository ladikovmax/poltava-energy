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
    function replace(i,r){const prev=output[i];byKey.set(identity(prev),byKey.get(identity(prev)).filter(j=>j!==i));byId.set(prev.uid,byId.get(prev.uid).filter(j=>j!==i));output[i]={...r,uid:prev.uid,_key:prev._key};index(output[i],i);}
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
    const needed=kind==='base'?fields:['date','meterNumber','type','quantity','unitName'];
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
        applyRules(r,s.rules);applyRegistry(r,state);
      }
      s[kind].push(r);added++;
    });
    return added;
  }
  const labels={error:'Виправити',conflict:'Збіг',skip:'Пропущено',same:'Без змін',base:'Опубліковано',changed:'Оновлено',new:'Додано'};
  const example={date:'2025-12-31',meterNumber:'DEMO-01',type:'Електроенергія',quantity:'125.4',unitName:'кіловат-година',organizationName:'Умовний заклад',organizationId:'00000001',providerName:'Умовний постачальник',providerId:'00000002',uid:'DEMO-reading-1'};
  window.PublicationData={parseCsv,asCsv,plan,importData,applyRules,applyRegistry,errors};
  window.renderPublication=(host,state,helpers)=>{
    const s=load();
    for(const r of s.journal)applyRegistry(r,state);
    let page=0,filter='needed',active='',review=false,stream='journal',feedback='';
    const save=msg=>{feedback=msg;try{localStorage.setItem(storeKey,JSON.stringify(s));}catch{feedback+=' Зміни збережено лише у цій вкладці: локальне сховище недоступне.';}};
    const btn=(id,label,attr='')=>'<button type="button" id="pub-'+id+'" '+attr+'>'+label+'</button>';
    const field=(id,l,type='text',v='')=>'<label>'+esc(l)+'<input type="'+type+'" id="pub-'+id+'" value="'+esc(v)+'"></label>';
    const el=id=>host.querySelector('#pub-'+id);
    const click=(id,fn)=>{const b=el(id);if(b)b.onclick=fn;};
    const fileBtn=(kind,name)=>'<label class="pb-file"><span>'+name+'</span><input type="file" aria-label="'+name+'" id="pub-'+kind+'" accept=".csv,text/csv"></label>';
    const section=(heading,html)=>'<section class="pb-box"><h3>'+heading+'</h3>'+html+'</section>';
    function editor(r,m){
      const opts=(m?.options||[]).map(o=>'<option value="'+esc(o._key)+'">'+esc([o.uid,o.date,o.type,o.tariff,o.quantity,o.unitName].filter(Boolean).join(' · '))+'</option>').join('');
      const form=(stream==='base'?fields:[...fields,...extras]).map(f=>field('f-'+f,title[f],f==='date'?'date':'text',r[f])).join('');
      const buildingId=stream==='journal'?state?.meterIndex?.[r.meterNumber]:undefined;
      const building=buildingId===undefined?null:state?.buildings?.find(b=>String(b.id)===String(buildingId));
      const buildingNote=building?'<p class="pb-note">Будівля за реєстром лічильників: '+esc(building.name)+'</p>':'';
      const rule=stream==='journal'?'<details><summary>Запам’ятати реквізити закладу й постачальника</summary><p>Реквізити застосовуються до порожніх полів для цього лічильника та послуги. Укажіть період дії договору.</p><div class="pb-row">'+field('start','Початок дії','date')+field('end','Кінець дії','date')+'</div><label class="pb-check"><input type="checkbox" id="pub-rule"> Зберегти ці реквізити в довіднику</label></details>':'';
      const conflict=opts?'<label>Запис для заміни<select id="pub-target">'+opts+'</select></label><div class="pb-row">'+btn('replace','Замінити вибраний')+btn('add','Зберегти як окреме зняття')+'</div>':'';
      return '<section id="pub-edit" class="pb-box"><h3>Редагування запису</h3>'+buildingNote+'<p id="pub-err" role="status">'+esc(m?.message)+'</p><div class="pb-in">'+form+'</div>'+rule+conflict+'<div class="pb-row">'+btn('save','Зберегти','class="pb-primary"')+(stream==='journal'?btn('skip','Пропустити запис'):'')+btn('close','Закрити')+'</div></section>';
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
      const draft={...r};
      for(const f of [...fields,...extras])if(el('f-'+f))draft[f]=el('f-'+f).value.trim();
      if(/^[-+]?\d+,\d+$/.test(draft.quantity))draft.quantity=draft.quantity.replace(',','.');
      try{if(el('rule')?.checked)addRule(draft);}catch(e){el('err').textContent=e.message;return;}
      Object.assign(r,draft,{_choice:choice,_target:choice==='replace'?el('target')?.value:''});
      active='';review=false;save('Рішення збережено.');draw();
    }
    function draw(){
      const p=plan(s),all=[...p.meta.values()], visible=s[stream].filter(r=>filter==='all'||['error','conflict'].includes(p.meta.get(r._key)?.status));
      page=Math.max(0,Math.min(page,Math.ceil(visible.length/12)-1));
      const editing=s[stream].find(r=>r._key===active);
      const display=visible.slice(12*page,12*page+12);
      const rows=display.map(r=>'<tr><td>'+esc(r.date)+'</td><td>'+esc(r.meterNumber)+'</td><td>'+esc(r.type)+'</td><td>'+esc(r.quantity)+' '+esc(r.unitName)+'</td><td>'+labels[p.meta.get(r._key).status]+'</td><td><button type="button" data-pk="'+esc(r._key)+'">Перевірити</button></td></tr>').join('');
      const table=rows?'<div class="pb-scroll"><table><thead><tr><th>Дата</th><th>Лічильник</th><th>Послуга</th><th>Показання</th><th>Стан</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p class="pb-note">Немає записів у вибраній групі.</p>';
      const pager=visible.length>12?'<div class="pb-row">'+btn('prev','Назад',page===0?'disabled':'')+' Сторінка '+(page+1)+' з '+Math.ceil(visible.length/12)+' '+btn('next','Далі',12*(page+1)>=visible.length?'disabled':'')+'</div>':'';
      host.innerHTML='<div class="pub-wrap"><style>'+css+'</style>'+
        section('Підготовка resources.csv','<p>Один запис журналу — одне зняття показання приладу. Річні підсумки використовуються для паспорта будівлі.</p><div class="pb-row">'+fileBtn('journal','Додати журнал CSV')+fileBtn('base','Додати попередній resources.csv')+'</div><details><summary>Формат журналу та шаблон</summary><p>CSV у UTF-8, роздільник — кома або крапка з комою. Обов’язкові заголовки: <code>date, meterNumber, type, quantity, unitName</code>. Можна додати реквізити закладу та постачальника, <code>uid</code>, <code>tariff</code>, <code>timestamp</code>. Для багатотарифного приладу кожна зона має власний запис. Для кількох знять за одну дату передавайте стабільний UID. Точний формат початкового журналу uMuni потрібно звірити зі зразком.</p><div class="pb-row">'+btn('template','Порожній шаблон')+btn('example','Умовний приклад CSV')+'</div></details><p class="pb-note">Журнал і реквізити зберігаються в цьому браузері.</p>')+
        section('Перевірка записів','<p>У журналі: <b>'+s.journal.length+'</b> · Попередніх: <b>'+s.base.length+'</b> · Потребують рішення: <b>'+p.blocked+'</b></p><div class="pb-row"><label>Джерело<select id="pub-stream"><option value="journal">Новий журнал</option><option value="base">Попередній ресурс</option></select></label><label>Показати<select id="pub-filter"><option value="needed">Потребують рішення</option><option value="all">Усі записи</option></select></label></div>'+table+pager+(editing?editor(editing,p.meta.get(editing._key)):''))+
        section('Вивантаження','<p>У кінцевій таблиці: <b>'+p.output.length+'</b>. Нових: '+all.filter(m=>m.status==='new').length+', оновлених: '+all.filter(m=>m.status==='changed').length+', без змін: '+all.filter(m=>m.status==='same').length+'.</p><label class="pb-check"><input type="checkbox" id="pub-review" '+(review?'checked ':'')+(p.blocked||!p.output.length?'disabled':'')+'> Я перевірив(-ла) записи та підтверджую формування CSV.</label><div class="pb-row">'+btn('export','Завантажити resources.csv','class="pb-primary" '+(!review||p.blocked||!p.output.length?'disabled':''))+(s.base.length||s.journal.length?btn('reset','Почати іншу публікацію'):'')+'</div><p class="pb-note">Подайте файл через кабінет розпорядника для оновлення наявного ресурсу. <a href="https://data.gov.ua/pages/835-recm-infrastructure-resources" target="_blank" rel="noopener">Рекомендації порталу</a></p>')+
        (s.rules.length?'<details class="pb-box"><summary>Збережені реквізити ('+s.rules.length+')</summary><p class="pb-note">Видалення правила діє для наступних імпортів; уже перевірені рядки зберігаються.</p>'+s.rules.map((r,i)=>'<div class="pb-row"><span>'+esc([r.meterNumber,r.type,r.providerName,(r.start||'без початкової дати')+' — '+(r.end||'без кінцевої дати')].join(' · '))+'</span><button type="button" data-rule-index="'+i+'">Вилучити правило</button></div>').join('')+'</details>':'')+
        '<p class="pb-msg" role="status">'+esc(feedback)+'</p></div>';
      el('stream').value=stream;el('filter').value=filter;
      el('stream').onchange=e=>{stream=e.target.value;active='';page=0;draw();};
      el('filter').onchange=e=>{filter=e.target.value;active='';page=0;draw();};
      for(const kind of ['base','journal'])el(kind).onchange=async e=>{
        const file=e.target.files?.[0];if(!file)return;
        try{const added=importData(s,await file.text(),kind,state);stream=kind;filter='all';page=0;active='';review=false;save('Додано записів: '+added+'.');}catch(err){feedback=err.message;}draw();
      };
      click('template',()=>helpers.download('journal-template.csv',asCsv([],[...fields,...extras])));
      click('example',()=>helpers.download('journal-example-demo.csv',asCsv([example],[...fields,...extras])));
      click('prev',()=>{page--;active='';draw();});click('next',()=>{page++;active='';draw();});
      for(const b of host.querySelectorAll('[data-pk]'))b.onclick=()=>{active=b.dataset.pk;draw();el('edit')?.scrollIntoView({block:'nearest'});};
      for(const b of host.querySelectorAll('[data-rule-index]'))b.onclick=()=>{if(window.confirm('Вилучити правило довідника?')){s.rules.splice(Number(b.dataset.ruleIndex),1);save('Правило вилучено.');draw();}};
      el('review').onchange=e=>{review=e.target.checked;el('export').disabled=!review;};
      click('export',()=>{if(review&&!p.blocked&&p.output.length){helpers.download('resources.csv',asCsv(p.output));helpers.notify?.('CSV сформовано');}});
      click('reset',()=>{if(window.confirm('Очистити всі записи цієї публікації? Збережені реквізити залишаться у браузері.')){s.journal=[];s.base=[];page=0;review=false;active='';save('Записи очищено.');draw();}});
      if(editing){for(const mode of ['replace','add','skip'])click(mode,()=>edit(editing,mode));click('save',()=>edit(editing,''));click('close',()=>{active='';draw();});}
    }
    draw();
  };
  const css='.pub-wrap{max-width:1200px}.pub-wrap *{box-sizing:border-box}.pub-wrap h3{margin:0 0 .65rem}.pub-wrap p{margin:.5rem 0;line-height:1.5}.pub-wrap .pb-box{padding:clamp(16px,2.2vw,26px);border:1px solid #dce4df;border-radius:14px;background:#fff;margin:0 0 16px}.pub-wrap .pb-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0}.pub-wrap .pb-in{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:13px;margin:14px 0}.pub-wrap button,.pub-wrap select,.pub-wrap input{font:inherit;max-width:100%}.pub-wrap button,.pub-wrap .pb-file{display:inline-flex;align-items:center;justify-content:center;border:1px solid #cad7ce;border-radius:8px;padding:8px 12px;background:#fff;color:#1d493a;cursor:pointer;font-weight:600}.pub-wrap button:disabled{opacity:.45;cursor:default}.pub-wrap button.pb-primary{background:#173e33;color:#fff}.pub-wrap label{display:grid;gap:4px;color:#294638}.pub-wrap input:not([type=checkbox]),.pub-wrap select{border:1px solid #b7c8bd;border-radius:7px;background:#fff;color:#16382b;padding:8px}.pub-wrap .pb-note{color:#52665c;font-size:.9rem}.pub-wrap .pb-file{padding:0;position:relative;overflow:hidden}.pub-wrap .pb-file span{padding:9px 14px}.pub-wrap .pb-file input{position:absolute;inset:0;opacity:0;width:100%;cursor:pointer}.pub-wrap .pb-file:focus-within{outline:2px solid #173e33}.pub-wrap .pb-scroll{overflow:auto}.pub-wrap table{border-collapse:collapse;width:100%;font-size:.9rem}.pub-wrap th,.pub-wrap td{text-align:left;padding:8px;border-bottom:1px solid #dce4df;white-space:nowrap}.pub-wrap th{background:#f4f7f4}.pub-wrap details{margin:12px 0}.pub-wrap summary{cursor:pointer}.pub-wrap .pb-check{display:flex;align-items:center;gap:8px;margin:12px 0}.pub-wrap .pb-msg:empty{display:none}.pub-wrap .pb-msg{padding:10px;background:#eef5f0;border-radius:8px}';
})();
