(function workspaceApp(){
'use strict';
const E=window.Energy, main=document.getElementById('main'), keys=window.EnergyStorage.keys, colors=['#1c5744','#71ab86','#c0df73'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function readStore(k){try{return JSON.parse(localStorage.getItem(k));}catch{return null;}}
let data=readStore(keys.workspace)||window.EnergyImport.empty(), gas=Number(readStore(keys.gas))||E.gasDefault;
let year=data.periods['2025']?'2025':Object.keys(data.periods).sort().at(-1)||'2025',cat='',query='',page=1,showInvalid=false,passportId='',importMsg=[],timer;
const fmt=(v,precision=1)=>E.finite(v)?new Intl.NumberFormat('uk-UA',{maximumFractionDigits:precision}).format(v):'—';
const date=s=>s?/^\d{4}-\d{2}-\d{2}$/.test(s)?s.split('-').reverse().join('.'):String(s):'—';
const displayYear=y=>data.periods[y]?.full?`${y} рік`:`${y} · до ${date(data.periods[y]?.asOf)}`;
const opt=(v,label,current)=>`<option value="${esc(v)}"${String(v)===String(current)?' selected':''}>${esc(label)}</option>`;
const ico=(name)=>{const p={bolt:'m14 2-9 12h6l-1 8 9-13h-6l1-7Z',build:'M4 21h16M6 20V4h12v16M9 8h1m4 0h1m-6 4h1m4 0h1m-4 8v-4h3v4',report:'M5 3h11l3 3v15H5z M9 10h6m-6 4h6',chart:'M4 20h16M7 16v-5m5 5V5m5 11V8',upload:'M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5',download:'M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4',search:'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',leaf:'M3 17C2 8 8 4 21 3c-1 12-6 16-14 14m-3 3L16 8'};return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${p[name]||p.chart}"/></svg>`;};
function notify(msg){const t=document.querySelector('#toast');t.textContent=msg;clearTimeout(timer);timer=setTimeout(()=>t.textContent='',4800);}
function save(){try{localStorage.setItem(keys.workspace,JSON.stringify(data));}catch{notify('Сховище браузера заповнене. Зміни доступні у відкритій вкладці.');}}
function download(name,text){const blob=new Blob([text],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function csv(name,rows){const cell=v=>`"${String(v??'').replaceAll('"','""')}"`;download(name,'\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n'));}
function header(title,desc,action=''){return `<div class="page-head"><div><div class="eyeline"><i></i>Полтавська міська громада</div><h1>${esc(title)}</h1>${desc?`<p class="subtitle">${esc(desc)}</p>`:''}</div><div class="actions no-print">${action}</div></div>`;}
function stat(label,value,unit,note,icon){return `<article class="stat"><div class="stat-head">${esc(label)}<span class="stat-mark">${ico(icon)}</span></div><strong>${value}<span class="suffix">${esc(unit)}</span></strong><div class="stat-note">${esc(note)}</div></article>`;}
function pane(title,sub,right=''){return `<div class="panel-head"><div><h2>${esc(title)}</h2>${sub?`<p>${esc(sub)}</p>`:''}</div>${right}</div>`;}
const table=(headers,body)=>`<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
const grade=g=>g?`<span class="grade ${g.toLowerCase()}">${g}</span>`:'—';
function grouped(rows,getKey){const g=new Map();for(const r of rows){const k=getKey(r);if(!g.has(k))g.set(k,[]);g.get(k).push(r);}return g;}
function periodSelect(){return `<select id="year" aria-label="Звітний рік">${Object.keys(data.periods).sort().reverse().map(y=>opt(y,displayYear(y),year)).join('')}</select>`;}
function methodology(){return `<details class="details panel method"><summary>Методика розрахунку</summary><p>Базовий рік — 2025. Тепло: Гкал × 1,163. Електроенергія: кВт·год ÷ 1000. Газ: м³ × ${fmt(gas,4)} кВт·год/м³ ÷ 1000. Тонни нафтового еквівалента: МВт·год × 0,086 за формою СЕнМ. Вода в м³ розглядається окремо.</p><p>Загальна сума включає наявні невід’ємні значення. Пропуски позначені тире. Покриття означає кількість будівель із принаймні одним енергетичним показником. Якщо бракує показника для наявного типу лічильника, питомі показники не обчислюються. Реєстр приладів відображає дату його вивантаження.</p><p>Рейтинг розраховується за повний рік, за опалюваною площею понад 1 м², у межах категорії. Клас — відношення кВт·год/м² будівлі до медіани групи з щонайменше 5 будівель: A ≤ 0,60; B ≤ 0,80; C ≤ 0,95; D ≤ 1,05; E ≤ 1,20; F ≤ 1,50; G &gt; 1,50. Це аналітична оцінка, а не енергетичний сертифікат.</p><p>Типове значення газу 9,7 кВт·год/м³ — приклад перерахунку за нижчою теплотою 34,92 МДж/м³ в одній із зон за другу декаду грудня 2025 року. Для розрахунку громади задайте погоджений показник у розділі «Імпорт». <a href="https://poltavagaz.com.ua/archives/23821" target="_blank" rel="noopener">Дані АТ «Полтавагаз»</a>.</p></details>`;}
function overview(){
 if(!data.buildings.length || !Object.keys(data.periods).length){
   const hasRegistry=data.buildings.length>0;
   main.innerHTML=header('Огляд енергоспоживання','')+`<section class="panel">${pane(hasRegistry?'Реєстр завантажено':'Даних ще немає',hasRegistry?'Додайте річний звіт про споживання, щоб побачити показники громади.':'Для першої перевірки завантажте реєстр будівель і звіт за 2025 рік.')}<a class="btn primary" href="#import">${ico('upload')}Перейти до імпорту</a></section>`;
   return;
 }
 const rows=E.analyze(data,year,gas),s=E.summary(rows),cats=grouped(rows,r=>r.b.category||''),full=!!data.periods[year]?.full;
 const groups=[...cats].map(([name,list])=>({name,...E.summary(list)})).sort((a,b)=>(b.total||0)-(a.total||0));
 if(!cats.has(cat))cat=groups.find(g=>E.category(g.name)==='Навчальні заклади')?.name||groups[0]?.name||'';
 const biggest=groups[0]?.total||1, shares=s.amounts.map(v=>s.total?v/s.total*100:0);let end=0;
 const gradient=shares.map((v,i)=>{const start=end;end+=v;return `${colors[i]} ${start}% ${end}%`;}).join(',');
 const leg=E.energyNames.map((v,i)=>`<span class="key-label"><i class="swatch" style="background:${colors[i]}"></i>${esc(v)}</span>`).join('');
 main.innerHTML=header('Огляд енергоспоживання','Споживання, базовий рівень та порівняння будівель громади.',periodSelect()+`<a class="btn primary" href="#import">${ico('upload')}Імпорт XLSX</a>`)
 +`<section class="stats">${stat('Енергоспоживання',fmt(s.total,0),'МВт·год',full?'За повний звітний рік':'За неповний звітний період','bolt')}${stat('Будівлі у реєстрі',fmt(rows.length,0),'',`${s.covered} з даними про енергію`,'build')}${stat('Еквівалент споживання',fmt(s.total===null?null:s.total*.086,1),'т н. е.',year==='2025'?'Базовий рівень СЕнМ':'За обраний період','leaf')}${stat('Доступні для рейтингу',String(rows.filter(r=>r.eligible).length),'',full?'Після перевірки повноти':'Рейтинг доступний за повний рік','chart')}</section>
 <section class="dashboard overview-charts"><article class="panel">${pane('Споживання за категоріями','Сумарний обсяг за видами будівель',`<span class="pill unit">МВт·год</span>`)}<div class="bars">${groups.map(g=>`<div class="bar-row"><span class="bar-label">${esc(E.category(g.name))}</span><div class="bar-track">${g.amounts.map((v,i)=>`<span class="bar-segment" style="background:${colors[i]};width:${v/biggest*100}%" title="${E.energyNames[i]}: ${fmt(v)} МВт·год"></span>`).join('')}</div><span class="bar-value">${fmt(g.total,0)}</span></div>`).join('')}</div><div class="legend chart-foot">${leg}</div></article>
 <article class="panel">${pane('Структура споживання','Частка кожного енергоносія')}<div class="share-body"><div class="ring" style="background:${s.total?`conic-gradient(${gradient})`:'#eaf0eb'}"><div class="ring-hole"><b>${s.total?'100%':'—'}</b><small>разом</small></div></div><div class="share-list">${E.energyNames.map((name,i)=>`<div><span class="key-label"><i class="swatch" style="background:${colors[i]}"></i>${name}</span><strong>${s.counts[i]?fmt(shares[i],1)+'%':'—'}</strong></div>`).join('')}</div></div></article></section>
 <section class="panel section-gap scroll-me" id="ranking">${pane('Рейтинг будівель',full?'За питомим споживанням у межах однієї категорії':'Дані неповного року доступні в паспортах будівель',`<button class="btn secondary" id="rankCSV">${ico('download')}CSV</button>`)}<div class="filterline"><select id="category" aria-label="Категорія будівель">${groups.map(g=>opt(g.name,E.category(g.name),cat)).join('')}</select><label class="search">${ico('search')}<input id="query" aria-label="Пошук будівлі" placeholder="Пошук за назвою або адресою" value="${esc(query)}"></label><label><input type="checkbox" id="invalid" ${showInvalid?'checked':''}> Поза рейтингом</label></div><div id="rankrows"></div></section>
 <details class="panel details"><summary>Базовий рівень СЕнМ за 2025 рік · зведення та експорт</summary><div class="extras" id="baseline"></div></details>${methodology()}`;
 const rank=()=>{const matches=rows.filter(r=>(r.b.category||'')===cat&&(showInvalid?!r.eligible:r.eligible)).sort((a,b)=>(b.intensity??-Infinity)-(a.intensity??-Infinity));const indexed=matches.map((r,i)=>({r,i:i+1})).filter(({r})=>`${r.b.name} ${r.b.address}`.toLocaleLowerCase('uk').includes(query.toLocaleLowerCase('uk')));const n=Math.max(1,Math.ceil(indexed.length/10));page=Math.max(1,Math.min(n,page)); const display=indexed.slice((page-1)*10,page*10);
 document.querySelector('#rankrows').innerHTML=(display.length?table(['Місце','Будівля',showInvalid?'Причина':'кВт·год/м²','Медіана групи','Клас'],display.map(({r,i})=>`<tr><td class="rank">${showInvalid?'—':i}</td><td class="row-name"><button data-pass="${esc(r.b.id)}">${esc(r.b.name)}</button></td><td>${showInvalid?esc(r.excludes.join(' · ')):fmt(r.intensity)}</td><td>${fmt(r.median)}</td><td>${grade(r.grade)}</td></tr>`).join('')):`<p class="empty">${full?'За цим фільтром будівель немає.':'Для рейтингу оберіть повний рік. Увімкніть «Поза рейтингом», щоб переглянути будівлі.'}</p>`)+`<div class="table-end"><span class="cell-meta">${indexed.length} будівель · сторінка ${page} із ${n}</span><div class="section-actions"><button class="btn" id="prev" ${page===1?'disabled':''}>Назад</button><button class="btn" id="next" ${page===n?'disabled':''}>Далі</button></div></div>`;
 document.querySelector('#prev').onclick=()=>{page--;rank();};document.querySelector('#next').onclick=()=>{page++;rank();};
 document.querySelector('#rankCSV').onclick=()=>csv(`Рейтинг-${year}.csv`,[['Місце','Будівля','Категорія','кВт·год/м²','Медіана','Клас','Причина виключення'],...indexed.map(({r,i})=>[showInvalid?'':i,r.b.name,r.b.category,r.intensity,r.median,r.grade,r.excludes.join(' · ')])]);};
 rank();document.querySelector('#year').onchange=e=>{year=e.target.value;page=1;render();};document.querySelector('#category').onchange=e=>{cat=e.target.value;page=1;rank();};document.querySelector('#query').oninput=e=>{query=e.target.value;page=1;rank();};document.querySelector('#invalid').onchange=e=>{showInvalid=e.target.checked;page=1;rank();};
 drawBase();
}
function drawBase(){
 const host=document.querySelector('#baseline'),rows=E.analyze(data,'2025',gas);
 if(!data.periods['2025']){host.innerHTML='<p class="empty">Завантажте річний звіт за 2025 рік.</p>';return;}
 const groups=grouped(rows,r=>data.links?.[r.b.id]||''); const lines=[['Громада',rows],...[...groups].map(([code,rs])=>[code?(data.subjects?.[code]||code)+' · '+code:'Суб’єкт не визначений',rs])];
 const values=lines.map(([group,rs])=>{const s=E.summary(rs);return [group,`${s.covered}/${rs.length}`,...s.amounts.map((v,i)=>s.counts[i]?v:null),s.total,s.total===null?null:s.total*.086];});
 const cols=['Рівень','Покриття','Тепло, МВт·год','Електрика, МВт·год','Газ, МВт·год','Усього, МВт·год','т н. е.'];
 host.innerHTML=table(cols,values.map(line=>`<tr>${line.map(v=>`<td>${typeof v==='string'?esc(v):fmt(v)}</td>`).join('')}</tr>`).join(''))+`<button class="btn secondary extras" id="baseCSV">${ico('download')}Завантажити зведення і будівлі</button>`;
 document.querySelector('#baseCSV').onclick=()=>csv('Базовий-рівень-2025.csv',[cols,...values,...rows.map(r=>[r.b.name,`${r.total!==null?1:0}/1`,...r.converted,r.total,r.total===null?null:r.total*.086])]);
}
function passport(){
 const sel=new URLSearchParams(location.hash.split('?')[1]||'').get('id')||passportId;
 const list=[...data.buildings].sort((a,b)=>a.name.localeCompare(b.name,'uk'));if(!list.length){main.innerHTML=header('Паспорт будівлі','Завантажте реєстр будівель.')+'<a class="btn primary" href="#import">Імпорт XLSX</a>';return;}
 const baseRows=E.analyze(data,'2025',gas),b=list.find(x=>x.id===sel)||baseRows.find(r=>r.eligible&&r.grade)?.b||list[0];passportId=b.id;
 const base=baseRows.find(r=>r.b.id===b.id),years=Object.keys(data.periods).sort();
 const facts=[['Категорія',b.category],['Адреса',b.address],['Рік забудови',b.year],['Поверховість',b.floors],['Опалювана площа',E.finite(b.area)?fmt(b.area)+' м²':''],['Опалюваний об’єм',E.finite(b.volume)?fmt(b.volume)+' м³':''],['Опалення',b.heating],['Суб’єкт СЕнМ',data.subjects?.[data.links?.[b.id]]]];
 main.innerHTML=header('Паспорт будівлі',b.name,`<button class="btn secondary" id="print">${ico('download')}Друк / PDF</button>`)+`<div class="toolbar no-print"><label class="field wide-select">Будівля<select id="pick">${list.map(x=>opt(x.id,x.name,b.id)).join('')}</select></label></div><section class="stats">${stat('Базовий рівень · 2025',fmt(base.total),'МВт·год',`${fmt(base.total===null?null:base.total*.086)} т н. е. за наявними значеннями`,'bolt')}${stat('Питоме споживання',fmt(base.intensity),'кВт·год/м²',`${fmt(base.byVolume)} кВт·год/м³ опалюваного об’єму`,'build')}${stat('Умовний клас',base.grade||'—','',`Медіана групи: ${fmt(base.median)} кВт·год/м²`,'leaf')}</section>
 <section class="panel">${pane('Характеристики будівлі','За реєстром uMuni')}<dl class="facts">${facts.map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v||'Немає даних')}</dd></div>`).join('')}</dl><p class="footnote">Лічильники: ${esc(Object.entries(b.meters||{}).map(([k,n])=>`${k} — ${n}`).join(' · ')||'даних немає')}.</p></section>
 <section class="panel">${pane('Показники споживання','Значення у вихідних одиницях. Тире означає пропуск.')} ${table(['Ресурс','Одиниця',...years.map(displayYear)],E.resources.map((n,i)=>`<tr><td>${n}</td><td>${E.units[i]}</td>${years.map(y=>`<td>${fmt(b.years[y]?.[i],2)}</td>`).join('')}</tr>`).join(''))}</section>
 <section class="panel">${pane('Порівняння з аналогами','Базовий 2025 рік')}<p>${base.eligible&&base.median>0?`Споживання будівлі — <strong>${fmt(base.intensity)} кВт·год/м²</strong>. Медіана категорії — <strong>${fmt(base.median)} кВт·год/м²</strong> (${base.peerCount} будівель). Відхилення — ${fmt((base.intensity/base.median-1)*100)}%.`:esc(base.excludes.join(' · ')||'Недостатньо даних для порівняння.')}</p><p class="footnote">Аналітична оцінка. Не є енергетичним сертифікатом.${!base.grade&&base.eligible?' Для класу потрібні щонайменше п’ять будівель та додатна медіана.':''}</p></section>${methodology()}`;
 document.querySelector('#pick').onchange=e=>location.hash='passport?id='+encodeURIComponent(e.target.value);document.querySelector('#print').onclick=()=>window.print();
}
function importPage(){
 const ids=Object.keys(data.subjects||{}), builds=[...data.buildings].sort((a,b)=>a.name.localeCompare(b.name,'uk'));const options=(current)=>builds.map(b=>opt(b.id,b.name,current)).join('');
 main.innerHTML=header('Імпорт даних','Оригінальні файли Excel обробляються у вашому браузері.')+`<div class="columns import-columns">
 <section class="panel import-guide"><h2>1. Завантажте файли з Google Диска</h2>
 <p>Відкрийте папку <a href="https://drive.google.com/drive/search?q=Трек%202%20Енергетиний%20менеджмент" target="_blank" rel="noopener noreferrer">«Трек 2 Енергетиний менеджмент»</a> через пошук у вашому Google Диску. Завантажте файли у форматі XLSX. Якщо Диск створить ZIP, спершу розпакуйте його.</p>
 <h3>Для першої перевірки — два файли</h3>
 <ul><li><b>Buildings_Info_Report (1).xlsx</b><span>Реєстр будівель. Додайте при першому імпорті.</span></li>
 <li><b>Річне_використання_ресурсів (49).xlsx</b><span>Повний 2025 рік. Дає базовий рівень і рейтинг.</span></li></ul>
 <h3>Для повної перевірки додайте ще три</h3>
 <ul><li><b>Річне_використання_ресурсів (50).xlsx</b><span>Споживання за 2026 рік станом на 11 листопада.</span></li>
 <li><b>Лічильники (3).xlsx</b><span>Прилади обліку та їхній зв’язок із будівлями.</span></li>
 <li><b>Інформація щодо впровадження СЕМ у Полтавській ТГ 13.07.2026.xlsx</b><span>Довідник суб’єктів СЕнМ для зведення за організаціями.</span></li></ul>
 <p class="footnote">Документ ТЗ у форматі DOCX пропустіть. Після імпорту відкрийте «Відкриті дані», щоб переглянути споживання за всі роки та реєстр лічильників. Показання можна ввести в таблиці або завантажити журнал нижче.</p></section>
 <div class="import-tools"><section class="panel"><h2>2. Імпортуйте XLSX</h2><p class="muted">Додавайте файли по одному або разом. Перевірте список і натисніть «Опрацювати файли».</p>
 <div class="file-zone">${ico('upload')}<label class="field">Файли Excel<input type="file" accept=".xlsx" multiple id="files"></label><div><button class="btn primary" id="importFiles">Опрацювати файли</button></div></div>
 <div id="fileQueue" role="status"></div>
 <div id="messages" role="status" class="import-result">${importMsg.map(m=>`<p>${esc(m)}</p>`).join('')}</div>
 ${Object.keys(data.periods).length?'<a class="btn secondary extras" href="#overview">Переглянути огляд</a>':''} ${Object.keys(data.meterIndex||{}).length||Object.keys(data.periods).length?'<a class="btn primary extras" href="#publication">Переглянути імпортовані дані</a>':''}</section>
 <section class="panel">${pane('Робочі дані','Збережено у цьому браузері.')}<dl class="facts"><div><dt>Будівлі</dt><dd>${builds.length}</dd></div><div><dt>Лічильники</dt><dd>${Object.keys(data.meterIndex||{}).length}</dd></div><div><dt>Звітні роки</dt><dd>${esc(Object.keys(data.periods).sort().join(', ')||'—')}</dd></div></dl>
 <p class="footnote">Після імпорту всіх п’яти файлів із цієї папки очікуйте 311 будівель, 1 097 лічильників і два звітні роки.</p>
 <button type="button" class="btn secondary extras" id="clear-data">Очистити дані сайту</button></section></div></div>
 <section class="panel section-gap">${pane('Журнал показань для resources.csv','Якщо маєте фактичні показання, додайте їх тут. Журнал одразу потрапить у «Відкриті дані». ')}<p class="footnote">CSV UTF-8: date (РРРР-ММ-ДД), meterNumber (номер лічильника або ID uMuni), quantity (показання). Інші колонки звіту можна додати до файлу або заповнити в таблиці.</p><div class="fields"><label class="field">Журнал CSV<input type="file" accept=".csv,text/csv" id="journalFile"></label><button id="importJournal" class="btn secondary">Додати показання</button><a href="#publication">Відкрити таблицю resources.csv</a></div><p id="journalMessage" role="status"></p></section>
 <section class="panel section-gap">${pane('Якість даних','Пропуски, непридатна площа та розбіжності між лічильниками й споживанням.')}<button class="btn secondary" id="defects">${ico('download')}Завантажити data-defects.csv</button></section>
 <section class="panel">${pane('Зв’язки із суб’єктами СЕнМ',ids.length?`${ids.length} суб’єктів у довіднику. Підтвердьте зв’язок для зведення.`:'Завантажте файл D2-05, щоб прив’язати будівлю до суб’єкта.')} ${ids.length?`<div class="form-grid"><label class="field">Будівля<select id="linkBuilding">${options('')}</select></label><label class="field">Суб’єкт<select id="linkSubject"></select></label><button class="btn primary" id="saveLink">Зберегти зв’язок</button></div>`:''}</section>
 ${(data.pending||[]).length?`<section class="panel">${pane('Зіставлення будівель',`${data.pending.length} рядків потребують рішення.`)}<label class="field">Рядок звіту<select id="pendingRow">${data.pending.map((v,i)=>opt(i,`${v.year} · ${v.name} · ${v.address}`,'')).join('')}</select></label><div class="form-grid extras"><label class="field">Будівля реєстру<select id="pendingBuilding"><option value="">Оберіть будівлю</option>${options('')}</select></label><button id="resolve" class="btn primary">Підтвердити збіг</button></div></section>`:''}
 <section class="panel">${pane('Теплота згоряння газу','Коефіцієнт застосовується до всіх завантажених років.')}<div class="fields"><label class="field">кВт·год/м³<input id="gas" type="number" min="0.01" max="25" step="any" value="${gas}"></label><button id="saveGas" class="btn secondary">Перерахувати</button></div></section>${methodology()}`;
 const queued=new Map(),filesInput=document.querySelector('#files'),queueBox=document.querySelector('#fileQueue');
 function showQueue(){
   queueBox.innerHTML=queued.size?'<p>Обрано файлів: '+queued.size+'</p><ul>'+Array.from(queued.keys(),name=>'<li>'+esc(name)+' <button type="button" data-remove-file="'+esc(name)+'" aria-label="Вилучити '+esc(name)+'">Вилучити</button></li>').join('')+'</ul>':'';
 }
 filesInput.onchange=()=>{for(const file of filesInput.files)queued.set(file.name,file);filesInput.value='';showQueue();};
 queueBox.onclick=e=>{const button=e.target.closest('[data-remove-file]');if(button){queued.delete(button.dataset.removeFile);showQueue();}};
 document.querySelector('#importFiles').onclick=async e=>{
   if(!queued.size){notify('Спершу оберіть XLSX-файли.');return;}
   const btn=e.currentTarget;btn.disabled=filesInput.disabled=true;queueBox.inert=true;btn.textContent='Обробка…';
   try{
     const result=await EnergyImport.readFiles([...queued.values()],data);data=result.state;importMsg=result.messages;save();
     if(!data.periods[year])year=Object.keys(data.periods).sort()[0]||'2025';
     query='';cat='';page=1;render();notify('Імпорт завершено');
   }catch(err){
     document.querySelector('#messages').textContent=err.message;btn.disabled=filesInput.disabled=false;queueBox.inert=false;btn.textContent='Опрацювати файли';
   }
 };
 document.querySelector('#importJournal').onclick=async e=>{
   const file=document.querySelector('#journalFile').files[0],message=document.querySelector('#journalMessage');
   if(!file){message.textContent='Оберіть журнал у форматі CSV.';return;}
   const button=e.currentTarget;button.disabled=true;
   try{
     const added=window.PublicationData.importJournal(await file.text(),data);
     message.textContent='Додано показань: '+added+'. Перегляньте таблицю у розділі «Відкриті дані».';
   }catch(err){message.textContent=err.message;}finally{button.disabled=false;}
 };
 const defects=[];
 for(const y of Object.keys(data.periods)) {
   for(const r of E.analyze(data,y,gas)) {
     for(const rule of r.issues) {
       const area=rule.includes('площа'),volume=rule.includes('об’єм'),source=(area||volume)?r.b.registrySource:r.b.yearSources?.[y];
       const value=area?r.b.area:volume?r.b.volume:r.raw.map(x=>x??'—').join(' / ');
       defects.push([y,r.b.id,r.b.name,rule,value,source?.file||'Знеособлений приклад',source?.row||'']);
     }
   }
 }
 for(const p of data.pending||[])defects.push([p.year,'',p.name,'Не підтверджено відповідність будівлі',p.address,p.source?.file,p.source?.row]);
 const defectButton=document.querySelector('#defects');
 defectButton.insertAdjacentHTML('beforebegin','<details class="details"><summary>Переглянути зауваження ('+defects.length+')</summary>'+table(['Рік','Будівля','Правило'],defects.slice(0,8).map(d=>'<tr><td>'+esc(d[0])+'</td><td>'+esc(d[2])+'</td><td>'+esc(d[3])+'</td></tr>').join(''))+'<p class="footnote">Перші '+Math.min(defects.length,8)+' записів. Повний перелік доступний у CSV.</p></details>');
 defectButton.onclick=()=>csv('data-defects.csv',[['Рік','ID будівлі','Будівля','Поле / правило','Вихідне значення','Файл','Рядок у XLSX'],...defects]);
 document.querySelector('#clear-data').onclick=()=>{
   if(!window.confirm('Очистити імпортовані звіти, показання, довідники та налаштування у цьому браузері?'))return;
   try{window.EnergyStorage.clear();}catch{notify('Сховище браузера недоступне. Оновіть сторінку, щоб завершити сеанс.');return;}
   location.reload();
 };
 document.querySelector('#saveGas').onclick=()=>{const el=document.querySelector('#gas'),v=el.valueAsNumber;if(!el.checkValidity()||!E.finite(v)||v<=0){el.reportValidity();return;}gas=v;try{localStorage.setItem(keys.gas,String(v));}catch{}render();notify('Коефіцієнт оновлено');};
 if(ids.length){const b=document.querySelector('#linkBuilding'),s=document.querySelector('#linkSubject');const refresh=()=>s.innerHTML=opt('','Не визначений',data.links?.[b.value])+ids.map(id=>opt(id,`${data.subjects[id]} · ${id}`,data.links?.[b.value])).join('');refresh();b.onchange=refresh;document.querySelector('#saveLink').onclick=()=>{data.links[b.value]=s.value;save();notify('Зв’язок оновлено');};}
 const resolve=document.querySelector('#resolve');if(resolve)resolve.onclick=()=>{const id=document.querySelector('#pendingBuilding').value;if(!id){notify('Оберіть будівлю');return;}try{data=EnergyImport.resolve(data,+document.querySelector('#pendingRow').value,id);save();render();notify('Зіставлення збережене');}catch(err){notify(err.message);}};
}
function render(){const pageName=(location.hash.slice(1).split('?')[0]||'overview');document.querySelectorAll('nav a').forEach(a=>{if(a.hash==='#'+pageName)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 if(pageName==='passport')passport();else if(pageName==='import')importPage();else if(pageName==='publication'){main.innerHTML=header('Відкриті дані','Перевірка показань для оновлення resources.csv на data.gov.ua.')+'<div id="publication"></div>';window.renderPublication(document.querySelector('#publication'),data,{esc,download,notify});}else overview();
}
main.addEventListener('click',e=>{const b=e.target.closest('[data-pass]');if(b)location.hash='passport?id='+encodeURIComponent(b.dataset.pass);});
window.addEventListener('hashchange',()=>{render();window.scrollTo(0,0);});render();
})();
