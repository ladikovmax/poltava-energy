(() => {
    'use strict';

    const fields = ['uid', 'date', 'organizationName', 'organizationId', 'providerName', 'providerId', 'meterNumber', 'type', 'quantity', 'unitName'];
    const extras = ['tariff', 'timestamp'];
    const names = ['ID запису', 'Дата зняття', 'Заклад', 'ЄДРПОУ закладу', 'Постачальник', 'ЄДРПОУ постачальника', 'Номер лічильника', 'Послуга', 'Показання', 'Одиниця', 'Тарифна зона', 'Час зняття'];
    const title = Object.fromEntries([...fields, ...extras].map((f, i) => [f, names[i]]));
    const refFields = ['organizationName', 'organizationId', 'providerName', 'providerId'];
    const storeKey = window.EnergyStorage.keys.publication;

    // Екранування спеціальних HTML-символів для безпечного вставлення тексту в розмітку
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // Очищення значення клітинки та перетворення службових прочерків або null на порожній рядок
    const clean = v => /^(null|-|—)$/i.test(String(v ?? '').trim()) ? '' : String(v ?? '').trim();

    // Перевірка коректності дати у строгому календарному форматі РРРР-ММ-ДД
    const validDate = s => /^\d{4}-\d\d-\d\d$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;

    // Створення порожньої структури стану публікації (база, журнал, правила автозаповнення)
    const blank = () => ({ base: [], journal: [], rules: [] });
    let memory;

    // Завантаження збереженого стану публікації з кешу пам'яті або localStorage
    function load() {
        if (memory) return memory;
        try {
            const s = JSON.parse(localStorage.getItem(storeKey));
            if (s && ['base', 'journal', 'rules'].every(k => Array.isArray(s[k]))) return memory = s;
        } catch {
        }
        return memory = blank();
    }

    // Парсер тексту CSV із автоматичним визначенням роздільника (кома або крапка з комою) та обробкою лапок
    function parseCsv(source) {
        const text = String(source).replace(/^\uFEFF/, '');
        if (!text.trim()) throw Error('Файл порожній.');
        const head = text.split(/\r?\n/, 1)[0];
        const sep = (head.match(/;/g) || []).length > (head.match(/,/g) || []).length ? ';' : ',';
        let rows = [], row = [], cell = '', quoted = false, closed = false;

        // Завершення читання поточної комірки та додавання її до рядка
        function endCell() {
            row.push(cell);
            cell = '';
            closed = false;
        }

        // Завершення читання поточного рядка та додавання непорожнього рядка до загального масиву
        function endRow() {
            endCell();
            if (row.some(v => v.trim())) rows.push(row);
            row = [];
        }

        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            if (quoted) {
                if (c !== '"') cell += c;
                else if (text[i + 1] === '"') {
                    cell += '"';
                    i++;
                } else {
                    quoted = false;
                    closed = true;
                }
                continue;
            }
            if (c === sep) endCell();
            else if (c === '\r' || c === '\n') {
                if (c === '\r' && text[i + 1] === '\n') i++;
                endRow();
            } else if (c === '"' && !cell && !closed) quoted = true;
            else if (closed || c === '"') throw Error('Некоректні лапки у CSV.');
            else cell += c;
        }
        if (quoted) throw Error('У CSV є незакриті лапки.');
        endRow();
        const columns = (rows.shift() || []).map(c => c.trim());
        if (new Set(columns).size !== columns.length) throw Error('Є повторювані назви колонок.');
        const records = rows.map((values, i) => {
            if (values.length !== columns.length) throw Error('Кількість полів не збігається із заголовком у записі ' + (i + 2) + '.');
            return Object.fromEntries(columns.map((c, j) => [c, values[j]]));
        });
        return { columns, records };
    }

    // Серіалізація масиву об'єктів у валідний рядок формату CSV з екрануванням спецсимволів
    function asCsv(rows, cols = fields) {
        const quote = v => {
            const s = String(v ?? '');
            return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        return [cols.join(','), ...rows.map(r => cols.map(c => quote(r[c])).join(','))].join('\r\n') + '\r\n';
    }

    // Перевірка одного запису на заповненість обов'язкових полів, коректність дати, числа та кодів ЄДРПОУ
    function errors(r, requireId = true) {
        const out = [];
        for (const f of fields) if ((f !== 'uid' || requireId) && !clean(r[f])) out.push(title[f]);
        if (clean(r.date) && !validDate(r.date)) out.push('Дата має бути у форматі РРРР-ММ-ДД');
        if (clean(r.quantity) && !/^[-+]?\d+(\.\d+)?$/.test(r.quantity)) out.push('Показання має бути десятковим числом');
        for (const f of ['providerId', 'organizationId']) if (clean(r[f]) && !/^\d{8}$/.test(r[f])) out.push(title[f] + ' має містити 8 цифр');
        return out;
    }

    // Генерація компактного хеш-відбитка рядка (комбінація FNV-1a та DJB2) для створення стабільних UID
    function fingerprint(input) {
        let a = 2166136261, b = 5381;
        for (let i = 0; i < input.length; i++) {
            const c = input.charCodeAt(i);
            a = Math.imul(a ^ c, 16777619);
            b = Math.imul(b, 33) ^ c;
        }
        return (a >>> 0).toString(36) + '-' + (b >>> 0).toString(36);
    }

    const tuple = (r, keys) => JSON.stringify(keys.map(f => String(r[f] ?? '').trim()));
    const identity = r => tuple(r, ['organizationId', 'meterNumber', 'date', 'type']);
    const detail = r => tuple(r, extras);
    const sameValues = (a, b) => fields.slice(1).every(k => String(a[k] ?? '').trim() === String(b[k] ?? '').trim());

    // Побудова результуючого плану публікації: об'єднання базових записів із журналом, виявлення конфліктів та дублікатів
    function plan(s) {
        const output = [], byId = new Map(), byKey = new Map(), meta = new Map();

        // Індексація запису в мапах пошуку за унікальним ключем сутності та за UID
        function index(r, i) {
            if (!byKey.has(identity(r))) byKey.set(identity(r), []);
            byKey.get(identity(r)).push(i);
            if (!byId.has(r.uid)) byId.set(r.uid, []);
            byId.get(r.uid).push(i);
        }

        // Додавання нового запису до результуючого масиву та його індексація
        function insert(r) {
            output.push({ ...r });
            index(r, output.length - 1);
        }

        // Заміна існуючого запису в результуючому масиві зі збереженням його вихідного UID та переіндексацією
        function replace(i, r) {
            const prev = output[i];
            byKey.set(identity(prev), byKey.get(identity(prev)).filter(j => j !== i));
            byId.set(prev.uid, byId.get(prev.uid).filter(j => j !== i));
            output[i] = { ...r, uid: prev.uid, _key: prev._key, _editKey: r._key };
            index(output[i], i);
        }

        for (const r of s.base) insert(r);
        for (const r of s.base) {
            const e = errors(r);
            if ((byId.get(r.uid) || []).length > 1) e.push('Неунікальний ID запису');
            meta.set(r._key, { status: e.length ? 'error' : 'base', message: e.join(' · ') });
        }
        const seenJournal = new Set();
        for (const r of s.journal) {
            if (r._choice === 'skip') {
                meta.set(r._key, { status: 'skip', message: 'Пропущено за рішенням користувача' });
                continue;
            }
            const e = errors(r, false);
            if (e.length) {
                meta.set(r._key, { status: 'error', message: e.join(' · ') });
                continue;
            }
            const gen = 'P-' + fingerprint(identity(r) + detail(r));
            const idCandidates = byId.get(r.uid || gen) || [];
            const candidates = idCandidates.length ? idCandidates : (byKey.get(identity(r)) || []).filter(i => {
                const old = output[i];
                if (r.uid && old.uid && !old.uid.startsWith('P-')) return false;
                return !extras.some(k => r[k] && old[k] && r[k] !== old[k]);
            });
            if (candidates.length === 1 && sameValues(r, output[candidates[0]]) && !extras.some(k => r[k] && output[candidates[0]][k] && r[k] !== output[candidates[0]][k]) && (r.uid || gen === output[candidates[0]].uid || (!extras.some(k => r[k] || output[candidates[0]][k]))) && !(seenJournal.has(output[candidates[0]]._key) && !r.uid)) {
                meta.set(r._key, { status: 'same', message: 'Уже є в результаті' });
                continue;
            }
            if (candidates.length && r._choice !== 'add') {
                const selected = candidates.find(i => output[i]._key === r._target);
                if (selected !== undefined && r._choice === 'replace') {
                    replace(selected, r);
                    meta.set(r._key, { status: 'changed', message: 'Підтверджена заміна' });
                    continue;
                }
                meta.set(r._key, { status: 'conflict', message: 'Потрібно порівняти записи', options: candidates.map(i => ({ ...output[i] })) });
                continue;
            }
            let assigned = r.uid || gen;
            if (r._choice === 'add' && (byId.has(assigned) || !r.uid)) assigned = 'P-' + fingerprint(identity(r) + detail(r) + '/' + r._key);
            if ((byId.get(assigned) || []).length) {
                meta.set(r._key, { status: 'error', message: 'Такий ID вже існує. Введіть інший.' });
                continue;
            }
            insert({ ...r, uid: assigned });
            seenJournal.add(r._key);
            meta.set(r._key, { status: 'new', message: 'Новий запис' });
        }
        return { output, meta, blocked: [...meta.values()].filter(m => m.status === 'error' || m.status === 'conflict').length };
    }

    // Безпечне заповнення пари полів (код ЄДРПОУ та назва) за умови відсутності конфлікту з наявними даними
    function fillPair(r, idField, nameField, id, name) {
        id = clean(id);
        name = clean(name);
        if (!id || !name) return;
        const existingId = clean(r[idField]), existingName = clean(r[nameField]);
        const norm = v => v.normalize('NFKC').toLocaleLowerCase('uk').replace(/\s+/g, ' ').trim();
        if (existingId && existingId !== id || existingName && norm(existingName) !== norm(name)) return;
        if (!existingId) r[idField] = id;
        if (!existingName) r[nameField] = name;
    }

    const numberIndexes = new WeakMap();

    // Пошук внутрішнього ID лічильника за його заводським номером або ID uMuni з кешуванням індексу
    function findMeter(number, state) {
        if (!number || !state) return;
        if (Object.hasOwn(state.meterIndex || {}, number)) return number;
        if (!numberIndexes.has(state)) {
            const index = new Map();
            for (const [id, details] of Object.entries(state.meterDetails || {})) {
                if (details.number) index.set(details.number, index.has(details.number) ? null : id);
            }
            numberIndexes.set(state, index);
        }
        return numberIndexes.get(state).get(number);
    }

    // Автоматичне підставлення типу послуги, одиниці виміру та реквізитів закладу з реєстру лічильників та будівель
    function applyRegistry(r, state) {
        if (!state || !clean(r.meterNumber)) return;
        const meterId = findMeter(r.meterNumber, state);
        if (!meterId) return;
        const buildingId = state.meterIndex[meterId], code = state.links?.[buildingId];
        const resource = state.meterResources?.[meterId];
        if (typeof resource === 'string' && resource !== 'Ресурс не вказано') {
            const type = resource.replace(/\s*\([^)]*\)\s*$/, '').trim();
            if (!clean(r.type)) r.type = type;
            if (!clean(r.unitName) && clean(r.type) === type) {
                if (/Гкал/i.test(resource)) r.unitName = 'гігакалорія';
                else if (/м[³3]|^Холодна вода$|^Газ$/i.test(resource)) r.unitName = 'кубічний метр';
                else if (resource === 'Електроенергія') r.unitName = 'кіловат-година';
            }
        }
        if (buildingId === undefined || !code || !/^\d{8}$/.test(String(code))) return;
        const name = state.subjects?.[code];
        if (typeof name === 'string') fillPair(r, 'organizationId', 'organizationName', code, name);
    }

    // Застосування збережених користувачем правил автозаповнення реквізитів договору до запису журналу
    function applyRules(r, rules) {
        if (!validDate(r.date)) return;
        const matches = rules.filter(v => v.meterNumber === r.meterNumber && v.type === r.type && (!v.start || r.date >= v.start) && (!v.end || r.date <= v.end));
        if (matches.length === 1) {
            const v = matches[0];
            fillPair(r, 'organizationId', 'organizationName', v.organizationId, v.organizationName);
            fillPair(r, 'providerId', 'providerName', v.providerId, v.providerName);
        }
    }

    // Імпорт CSV-файлу до базового набору або журналу показань із запобіганням дублюванню пакетів
    function importData(s, source, kind, state) {
        const { columns, records } = parseCsv(source);
        const needed = kind === 'base' ? fields : ['date', 'meterNumber', 'quantity'];
        const absent = needed.filter(c => !columns.includes(c));
        if (absent.length) throw Error('Бракує колонок: ' + absent.join(', ') + '.');
        if (!records.length) throw Error('У файлі є заголовки, але немає записів.');
        const old = new Set(s[kind].map(r => r._key));
        const batch = fingerprint(source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'));
        let added = 0;
        records.forEach((raw, i) => {
            const key = kind + '-' + batch + '-' + i;
            if (old.has(key)) return;
            const r = Object.fromEntries([...fields, ...extras].map(f => [f, String(raw[f] ?? '')]));
            r._key = key;
            if (kind === 'journal') {
                for (const f of [...fields, ...extras]) r[f] = clean(r[f]);
                if (/^[-+]?\d+,\d+$/.test(r.quantity)) r.quantity = r.quantity.replace(',', '.');
                applyRegistry(r, state);
                applyRules(r, s.rules);
            }
            s[kind].push(r);
            added++;
        });
        return added;
    }

    const labels = { error: 'Виправити', conflict: 'Збіг', skip: 'Пропущено', same: 'Без змін', base: 'Опубліковано', changed: 'Оновлено', new: 'Додано' };
    const example = { date: '2025-12-31', meterNumber: 'DEMO-01', type: 'Електроенергія', quantity: '125.4', unitName: 'кіловат-година', organizationName: 'Умовний заклад', organizationId: '00000001', providerName: 'Умовний постачальник', providerId: '00000002', uid: 'DEMO-reading-1' };

    // Зовнішній метод для швидкого імпорту журналу показань зі сторінки «Імпорт» із негайним збереженням у сховище
    function importJournal(source, state) {
        const s = load();
        const next = { ...s, journal: [...s.journal] };
        const added = importData(next, source, 'journal', state);
        localStorage.setItem(storeKey, JSON.stringify(next));
        memory = next;
        return added;
    }

    window.PublicationData = { parseCsv, asCsv, plan, importData, importJournal, applyRules, applyRegistry, errors };

    // Головна функція рендерингу інтерактивного інтерфейсу розділу «Відкриті дані» (перегляд, редагування та аудит)
    window.renderPublication = (host, state, helpers) => {
        const s = load();
        for (const r of s.journal) {
            applyRegistry(r, state);
            applyRules(r, s.rules);
        }
        const buildings = new Map(state.buildings.map(b => [String(b.id), b]));
        const catalog = Object.entries(state.meterIndex || {}).map(([meterId, id]) => {
            const row = Object.fromEntries(fields.map(f => [f, '']));
            const details = state.meterDetails?.[meterId] || {};
            const number = clean(details.number);
            row.meterNumber = number && !/^б\s*\/\s*н(?:\s|$)/i.test(number) && findMeter(number, state) === meterId ? number : meterId;
            applyRegistry(row, state);
            const building = buildings.get(String(id));
            return { ...row, meterId, model: clean(details.model), kind: details.kind, sourceNumber: details.number, buildingName: building?.name || '', address: building?.address || '' };
        }).sort((a, b) => a.buildingName.localeCompare(b.buildingName, 'uk') || a.meterNumber.localeCompare(b.meterNumber, 'uk', { numeric: true }));
        const years = Object.keys(state.periods).sort();
        const annualRows = state.buildings.flatMap(b => Object.entries(b.years || {}).map(([year, values]) => ({ name: b.name, address: b.address, id: b.id, year, values })));
        for (const r of state.pending || []) annualRows.push({ name: r.name, address: r.address, id: '', year: r.year, values: r.values });
        annualRows.sort((a, b) => a.name.localeCompare(b.name, 'uk') || a.address.localeCompare(b.address, 'uk') || a.year.localeCompare(b.year));
        const annualCount = annualRows.reduce((n, r) => n + r.values.filter(Number.isFinite).length, 0);
        let annualYear = '', view = 'result', viewPage = 0, query = '', draft = null;
        let page = 0, filter = 'needed', active = '', review = false, stream = 'journal', feedback = '';

        // Збереження поточного стану публікації у localStorage та встановлення тексту зворотного зв'язку
        const save = msg => {
            feedback = msg;
            try {
                localStorage.setItem(storeKey, JSON.stringify(s));
            } catch {
                feedback += ' Зміни збережено лише у цій вкладці: локальне сховище недоступне.';
            }
        };

        const btn = (id, label, attr = '') => '<button type="button" id="pub-' + id + '" ' + attr + '>' + label + '</button>';
        const field = (id, l, type = 'text', v = '') => '<label>' + esc(l) + '<input type="' + type + '" id="pub-' + id + '" value="' + esc(v) + '"></label>';
        const el = id => host.querySelector('#pub-' + id);
        const click = (id, fn) => {
            const b = el(id);
            if (b) b.onclick = fn;
        };
        const fileBtn = (kind, name) => '<label class="pb-file"><span>' + name + '</span><input type="file" aria-label="' + name + '" id="pub-' + kind + '" accept=".csv,text/csv"></label>';
        const section = (heading, html) => '<section class="pb-box"><h3>' + heading + '</h3>' + html + '</section>';

        // Генерація HTML-форми редагування окремого запису показань лічильника та вирішення конфліктів
        function editor(r, m, kind = stream) {
            const opts = (m?.options || []).map(o => '<option value="' + esc(o._key) + '">' + esc([o.uid, o.date, o.type, o.tariff, o.quantity, o.unitName].filter(Boolean).join(' · ')) + '</option>').join('');
            const input = f => field('f-' + f, title[f], f === 'date' ? 'date' : 'text', r[f]);
            const form = kind === 'base' ? fields.map(input).join('') :
                ['date', 'quantity', 'unitName', 'meterNumber', 'type', ...refFields].map(input).join('') +
                '<details><summary>ID запису, тариф та час</summary><p class="pb-note">Порожній ID запису система створить під час формування звіту.</p>' + ['uid', ...extras].map(input).join('') + '</details>';
            const meterId = kind === 'journal' ? findMeter(r.meterNumber, state) : null;
            const buildingId = meterId ? state.meterIndex[meterId] : undefined;
            const building = buildingId === undefined ? null : state?.buildings?.find(b => String(b.id) === String(buildingId));
            const buildingNote = building ? '<p class="pb-note">Будівля за реєстром лічильників: ' + esc(building.name) + '</p>' : '';
            const rule = kind === 'journal' ? '<details><summary>Запам’ятати реквізити закладу й постачальника</summary><p>Реквізити застосовуються до порожніх полів для цього лічильника та послуги. Укажіть період дії договору.</p><div class="pb-row">' + field('start', 'Початок дії', 'date') + field('end', 'Кінець дії', 'date') + '</div><label class="pb-check"><input type="checkbox" id="pub-rule"> Зберегти ці реквізити в довіднику</label></details>' : '';
            const conflict = opts ? '<label>Запис для заміни<select id="pub-target">' + opts + '</select></label><div class="pb-row">' + btn('replace', 'Замінити вибраний') + btn('add', 'Зберегти як окреме зняття') + '</div>' : '';
            return '<section id="pub-edit" class="pb-box"><h3>Показання лічильника</h3>' + buildingNote + '<p id="pub-err" role="status">' + esc(m?.message) + '</p><div class="pb-in">' + form + '</div>' + rule + conflict + '<div class="pb-row">' + btn('save', 'Зберегти показання', 'class="pb-primary"') + (kind === 'journal' && !draft ? btn('skip', 'Пропустити запис') : '') + btn('close', 'Закрити') + '</div></section>';
        }

        // Валідація та додавання нового правила автозаповнення реквізитів у довідник із перевіркою перетину дат
        function addRule(r) {
            const v = Object.fromEntries(['meterNumber', 'type', ...refFields].map(f => [f, r[f]]));
            v.start = el('start').value;
            v.end = el('end').value;
            if (!v.meterNumber || !v.type || refFields.some(f => !clean(v[f])) || !/^\d{8}$/.test(v.organizationId) || !/^\d{8}$/.test(v.providerId) || v.start && v.end && v.start > v.end) throw Error('Перевірте реквізити, восьмизначні коди та період.');
            const same = (a, b) => a.meterNumber === b.meterNumber && a.type === b.type;
            const samePeriod = (a, b) => a.start === b.start && a.end === b.end;
            if (s.rules.some(a => same(a, v) && !samePeriod(a, v) && (!a.end || !v.start || a.end >= v.start) && (!v.end || !a.start || v.end >= a.start))) throw Error('Період перетинається з уже збереженим. Вкажіть окремий період або збережіть лише цей запис.');
            s.rules = s.rules.filter(a => !(same(a, v) && samePeriod(a, v)));
            s.rules.push(v);
            for (const item of s.journal) applyRules(item, s.rules);
        }

        // Збереження відредагованих полів запису, застосування довідників та перерахунок плану публікації
        function edit(r, choice) {
            const updated = { ...r };
            for (const f of [...fields, ...extras]) if (el('f-' + f)) updated[f] = el('f-' + f).value.trim();
            if (/^[-+]?\d+,\d+$/.test(updated.quantity)) updated.quantity = updated.quantity.replace(',', '.');
            if (draft || stream === 'journal') {
                applyRegistry(updated, state);
                applyRules(updated, s.rules);
            }
            try {
                if (el('rule')?.checked) addRule(updated);
            } catch (e) {
                el('err').textContent = e.message;
                return;
            }
            Object.assign(r, updated, { _choice: choice, _target: choice === 'replace' ? el('target')?.value : '' });
            if (draft) {
                if (!s.journal.some(item => item._key === r._key)) s.journal.push(r);
                draft = null;
            }
            active = '';
            review = false;
            const result = plan(s), status = result.meta.get(r._key);
            const needsWork = status?.status === 'error' || status?.status === 'conflict';
            if (!needsWork) {
                view = 'result';
                viewPage = 0;
                query = '';
            }
            save(needsWork ? 'Запис у чернетці. ' + status.message : 'Показання збережено. Таблицю resources.csv оновлено.');
            draw();
        }

        // Формування верхньої панелі вкладок, пошуку та елементів керування експортом звіту data.gov.ua
        function previewShell(p) {
            let emptyHint = '';
            if (view === 'result' && !p.output.length) {
                emptyHint = annualRows.length || catalog.length ? 'Для resources.csv потрібні дата та фактичне показання приладу. Додайте журнал CSV або введіть показання у вкладці «Лічильники з імпорту».' : 'Почніть із розділу «Імпорт» або додайте журнал показань нижче.';
            }
            return section('Звіт для data.gov.ua', `
     <div class="pb-row report-tabs" role="group" aria-label="Режим таблиці">
     <button id="pub-view-result" aria-pressed="${view === 'result'}">resources.csv (${p.output.length})</button>
     <button id="pub-view-annual" aria-pressed="${view === 'annual'}">Річне споживання (${annualRows.length})</button>
     <button id="pub-view-meters" aria-pressed="${view === 'meters'}">Лічильники з імпорту (${catalog.length})</button></div>
     <div class="pb-row"><label class="report-search">Пошук у таблиці<input id="pub-search" placeholder="${view === 'annual' ? 'Назва, адреса або ID будівлі' : 'Номер приладу, заклад або послуга'}" value="${esc(query)}"></label>
     ${view === 'annual' && years.length ? `<label>Звітний рік<select id="pub-year"><option value="">Усі роки</option>${years.map(y => `<option value="${esc(y)}" ${annualYear === y ? 'selected' : ''}>${esc(y)}</option>`).join('')}</select></label>` : ''}</div>
     <div id="pub-grid"></div><p class="pb-note" id="pub-feedback" aria-live="polite">${esc(feedback)}</p>
     ${view === 'meters' && catalog.length && !Object.keys(state.meterDetails || {}).length ? `<p class="notice">Щоб додати номери й моделі до раніше збереженого реєстру, повторно імпортуйте лише «Лічильники (3).xlsx».</p>` : ''}
     ${view === 'meters' && catalog.length ? btn('draftCSV', 'Завантажити заготовку лічильників') : ''}
     ${view === 'result' ? `<div class="report-download">${emptyHint ? `<p class="notice">${esc(emptyHint)} <a href="#import">Імпорт даних</a></p>` : ''}<label class="pb-check"><input type="checkbox" id="pub-review" ${review ? 'checked ' : ''}${p.blocked || !p.output.length ? 'disabled' : ''}> Підтверджую перевірку звіту</label>
     ${btn('export', 'Завантажити resources.csv', 'class="pb-primary" ' + (!review || p.blocked || !p.output.length ? 'disabled' : ''))}
     ${btn('report-template', 'Порожній шаблон resources.csv')}
     ${p.blocked ? `<span class="pb-note">Потребують перевірки: ${p.blocked}. <a href="#pub-audit" id="pub-seeProblems">Переглянути записи</a></span>` : ''}</div>` : ''}`);
        }

        // Універсальний хелпер пагінації таблиць попереднього перегляду (по 12 рядків на сторінку)
        function paginate(rows, p) {
            const pages = Math.max(1, Math.ceil(rows.length / 12));
            viewPage = Math.max(0, Math.min(viewPage, pages - 1));
            const controls = `<div class="pb-row"><span>Рядків: ${rows.length} · сторінка ${viewPage + 1} із ${pages}</span>${btn('grid-prev', 'Назад', viewPage === 0 ? 'disabled' : '')}${btn('grid-next', 'Далі', viewPage + 1 >= pages ? 'disabled' : '')}</div>`;
            const bind = () => {
                click('grid-prev', () => {
                    draft = null;
                    viewPage--;
                    drawPreview(p);
                });
                click('grid-next', () => {
                    draft = null;
                    viewPage++;
                    drawPreview(p);
                });
            };
            return { visible: rows.slice(viewPage * 12, (viewPage + 1) * 12), controls, bind };
        }

        // Відображення вкладки зведеного річного споживання ресурсів по будівлях з експортом у CSV
        function drawAnnual(p, term) {
            const filtered = annualRows.filter(r => (!annualYear || r.year === annualYear) && [r.name, r.address, r.id].some(v => String(v || '').toLocaleLowerCase('uk').includes(term)));
            const pager = paginate(filtered, p);
            const resourceHeaders = window.Energy.resources.map((name, i) => name + ' (' + window.Energy.units[i] + ')');
            const headers = ['Будівля', 'Адреса', 'ID будівлі', 'Рік', 'Станом на', ...resourceHeaders];
            const values = r => [r.name, r.address, r.id, r.year, state.periods[r.year]?.asOf, ...r.values];
            const num = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 16 });
            const rows = pager.visible.map(r => '<tr>' + values(r).map(v => '<td>' + esc(typeof v === 'number' ? num.format(v) : v == null || v === '' ? '—' : v) + '</td>').join('') + '</tr>').join('');
            const table = rows ? `<div class="pb-scroll" tabindex="0" aria-label="Споживання за будівлями"><table><thead><tr>${headers.map(h => '<th scope="col">' + esc(h) + '</th>').join('')}</tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="empty">' + (annualRows.length ? 'Нічого не знайдено.' : 'Імпортуйте файл «Річне_використання_ресурсів».') + '</p>';
            el('grid').innerHTML = `<p>Заповнених значень споживання у звітах: <b>${annualCount.toLocaleString('uk-UA')}</b>. Один рядок містить дані будівлі за звітний період. Прочерк означає порожню клітинку у файлі.</p>` + table + pager.controls + (filtered.length ? btn('annualCSV', 'Завантажити CSV споживання (' + filtered.length + ' ряд.)') : '');
            pager.bind();
            click('annualCSV', () => helpers.download('annual-consumption.csv', '\uFEFF' + asCsv(filtered.map(r => Object.fromEntries(values(r).map((v, i) => [headers[i], v]))), headers)));
        }

        // Відображення активної таблиці попереднього перегляду (результуючий resources.csv або каталог лічильників для введення показань)
        function drawPreview(p) {
            const term = query.trim().toLocaleLowerCase('uk');
            if (view === 'annual') {
                drawAnnual(p, term);
                return;
            }
            const isResult = view === 'result';
            const pending = new Map();
            for (const r of s.journal) {
                const id = findMeter(r.meterNumber, state);
                if (id && p.meta.get(r._key)?.status === 'error' && !pending.has(id)) pending.set(id, r);
            }
            const source = isResult ? p.output : catalog;
            const searchFields = isResult ? fields : ['buildingName', 'address', 'meterId', 'meterNumber', 'sourceNumber', 'model', 'organizationName', 'organizationId', 'type', 'unitName'];
            const filtered = source.filter(row => !term || searchFields.some(f => String(row[f] ?? '').toLocaleLowerCase('uk').includes(term)));
            const pager = paginate(filtered, p);
            const columns = isResult ? fields : ['sourceNumber', 'meterId', 'model', 'type', 'unitName', 'kind', 'organizationName', 'organizationId', 'address'];
            const catalogTitles = { sourceNumber: 'Номер у реєстрі', meterId: 'ID uMuni', model: 'Модель', kind: 'Тип обліку', address: 'Адреса' };
            const rs = pager.visible;
            const parts = rs.map(record => {
                const r = record;
                const first = isResult ? '' : `<td><button data-read-meter="${esc(record.meterId)}">${pending.has(record.meterId) ? 'Дозаповнити' : 'Ввести показання'}</button><small>${esc(record.buildingName)}</small></td>`;
                const cell = f => {
                    if (isResult && f === 'uid') return `<button type="button" title="Переглянути та змінити запис" data-result-key="${esc(r._editKey || r._key)}">${esc(r.uid || '—')}</button>`;
                    return isResult ? esc(r[f]) : esc(clean(r[f]) || '—');
                };
                let tr = `<tr>${first}${columns.map(f => `<td>${cell(f)}</td>`).join('')}</tr>`;
                if (!isResult && draft && findMeter(draft.meterNumber, state) === record.meterId) {
                    tr += `<tr><td colspan="${columns.length + 1}" class="report-editor">${editor(draft, p.meta.get(draft._key), 'journal')}</td></tr>`;
                }
                return tr;
            });
            const head = columns.map(f => isResult ? `<th scope="col" title="${esc(title[f])}">${esc(f)}</th>` : `<th scope="col">${esc(title[f] || catalogTitles[f])}</th>`).join('');
            const table = `<div class="pb-scroll" tabindex="0" aria-label="Таблиця звіту"><table class="report-table"><thead><tr>${isResult ? '' : '<th scope="col">Будівля та дія</th>'}${head}</tr></thead><tbody>${parts.join('')}</tbody></table></div>`;
            const empty = term ? 'Нічого не знайдено.' : isResult ? 'У звіті ще немає рядків.' : 'Імпортуйте реєстр лічильників.';
            el('grid').innerHTML = `<p class="pb-note">${isResult ? 'Один рядок — одне показання приладу на дату зняття. Файл для публікації містить усі рядки та ці 10 колонок.' : 'Оберіть прилад, щоб ввести дату й фактичне показання.'}</p>` +
                (isResult || rs.length ? table : '') + (rs.length ? pager.controls : `<p class="empty">${empty}</p>`);
            pager.bind();
            for (const button of el('grid').querySelectorAll('[data-result-key]')) button.onclick = () => {
                active = button.dataset.resultKey;
                stream = s.journal.some(r => r._key === active) ? 'journal' : 'base';
                filter = 'all';
                page = Math.floor(s[stream].findIndex(r => r._key === active) / 12);
                draft = null;
                review = false;
                draw();
                el('f-date')?.focus();
            };
            for (const b of el('grid').querySelectorAll('[data-read-meter]')) b.onclick = () => {
                const row = catalog.find(x => x.meterId === b.dataset.readMeter);
                draft = pending.get(row.meterId) || { ...Object.fromEntries([...fields, ...extras].map(f => [f, row[f] || ''])), _key: 'entry-' + crypto.randomUUID() };
                active = '';
                review = false;
                stream = 'journal';
                draw();
                el('f-date')?.focus();
            };
            if (draft) {
                click('save', () => edit(draft, ''));
                click('close', () => {
                    draft = null;
                    draw();
                });
                const dateInput = el('f-date');
                if (dateInput) dateInput.onchange = () => {
                    const copy = { ...draft, date: dateInput.value };
                    for (const f of refFields) copy[f] = el('f-' + f).value.trim();
                    applyRegistry(copy, state);
                    applyRules(copy, s.rules);
                    for (const f of refFields) if (!el('f-' + f).value) el('f-' + f).value = copy[f] || '';
                };
            }
        }

        // Повне перемальовування інтерфейсу розділу «Відкриті дані» та прив'язка обробників подій
        function draw() {
            const p = plan(s), visible = s[stream].filter(r => filter === 'all' || ['error', 'conflict'].includes(p.meta.get(r._key)?.status));
            page = Math.max(0, Math.min(page, Math.ceil(visible.length / 12) - 1));
            const editing = s[stream].find(r => r._key === active);
            const display = visible.slice(12 * page, 12 * page + 12);
            const rows = display.map(r => '<tr><td>' + esc(r.date) + '</td><td>' + esc(r.meterNumber) + '</td><td>' + esc(r.type) + '</td><td>' + esc(r.quantity) + ' ' + esc(r.unitName) + '</td><td>' + labels[p.meta.get(r._key).status] + '</td><td><button type="button" data-pk="' + esc(r._key) + '">Перевірити</button></td></tr>').join('');
            const table = rows ? '<div class="pb-scroll"><table><thead><tr><th>Дата</th><th>Лічильник</th><th>Послуга</th><th>Показання</th><th>Стан</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<p class="pb-note">Немає записів у вибраній групі.</p>';
            const pager = visible.length > 12 ? '<div class="pb-row">' + btn('prev', 'Назад', page === 0 ? 'disabled' : '') + ' Сторінка ' + (page + 1) + ' з ' + Math.ceil(visible.length / 12) + ' ' + btn('next', 'Далі', 12 * (page + 1) >= visible.length ? 'disabled' : '') + '</div>' : '';
            host.innerHTML = '<div class="pub-wrap">' +
                previewShell(p) +
                section('Додати журнал або попередню публікацію', '<p>Один запис журналу — одне зняття показання приладу. Річні підсумки використовуються для паспорта будівлі.</p><div class="pb-row">' + fileBtn('journal', 'Додати журнал CSV') + fileBtn('base', 'Додати попередній resources.csv') + '</div><details><summary>Формат журналу та шаблон</summary><p>CSV у UTF-8, роздільник — кома або крапка з комою. Обов’язкові заголовки: <code>date, meterNumber, quantity</code>. Для відомого лічильника сервіс підставляє <code>type</code> та <code>unitName</code> із реєстру. Їх можна також передати у файлі. Можна додати реквізити закладу та постачальника, <code>uid</code>, <code>tariff</code>, <code>timestamp</code>. Для багатотарифного приладу кожна зона має власний запис. Для кількох знять за одну дату передавайте стабільний UID. Точний формат початкового журналу uMuni потрібно звірити зі зразком.</p><div class="pb-row">' + btn('template', 'Порожній шаблон') + btn('example', 'Умовний приклад CSV') + '</div></details><p class="pb-note">Журнал і реквізити зберігаються в цьому браузері.</p>') +
                '<div id="pub-audit">' + section('Перевірка записів', '<p>У журналі: <b>' + s.journal.length + '</b> · Попередніх: <b>' + s.base.length + '</b> · Потребують рішення: <b>' + p.blocked + '</b></p><div class="pb-row"><label>Джерело<select id="pub-stream"><option value="journal">Новий журнал</option><option value="base">Попередній ресурс</option></select></label><label>Показати<select id="pub-filter"><option value="needed">Потребують рішення</option><option value="all">Усі записи</option></select></label></div>' + table + pager + (editing ? editor(editing, p.meta.get(editing._key)) : '')) + '</div>' +
                (s.base.length || s.journal.length ? '<p>' + btn('reset', 'Почати іншу публікацію') + '</p>' : '') +
                (s.rules.length ? '<details class="pb-box"><summary>Збережені реквізити (' + s.rules.length + ')</summary><p class="pb-note">Видалення правила діє для наступних імпортів; уже перевірені рядки зберігаються.</p>' + s.rules.map((r, i) => '<div class="pb-row"><span>' + esc([r.meterNumber, r.type, r.providerName, (r.start || 'без початкової дати') + ' — ' + (r.end || 'без кінцевої дати')].join(' · ')) + '</span><button type="button" data-rule-index="' + i + '">Вилучити правило</button></div>').join('') + '</details>' : '') +
                '</div>';
            drawPreview(p);
            for (const key of ['annual', 'meters', 'result']) click('view-' + key, () => {
                view = key;
                viewPage = 0;
                query = '';
                active = '';
                draft = null;
                draw();
            });
            if (el('year')) el('year').onchange = e => {
                annualYear = e.target.value;
                viewPage = 0;
                drawPreview(p);
            };
            el('search').oninput = e => {
                query = e.target.value;
                viewPage = 0;
                draft = null;
                drawPreview(p);
            };
            click('draftCSV', () => helpers.download('resources-draft.csv', asCsv(catalog)));
            click('seeProblems', e => {
                e.preventDefault();
                stream = s.journal.some(r => ['error', 'conflict'].includes(p.meta.get(r._key)?.status)) ? 'journal' : 'base';
                filter = 'needed';
                page = 0;
                draft = null;
                active = '';
                draw();
                el('audit').scrollIntoView({ block: 'start' });
            });
            el('stream').value = stream;
            el('filter').value = filter;
            el('stream').onchange = e => {
                stream = e.target.value;
                active = '';
                draft = null;
                page = 0;
                draw();
            };
            el('filter').onchange = e => {
                filter = e.target.value;
                active = '';
                draft = null;
                page = 0;
                draw();
            };
            for (const kind of ['base', 'journal']) el(kind).onchange = async e => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                    const added = importData(s, await file.text(), kind, state);
                    stream = kind;
                    filter = 'all';
                    page = viewPage = 0;
                    active = '';
                    draft = null;
                    view = 'result';
                    query = '';
                    review = false;
                    save('Додано записів: ' + added + '.');
                } catch (err) {
                    feedback = err.message;
                }
                draw();
            };
            click('template', () => helpers.download('journal-template.csv', asCsv([], [...fields, ...extras])));
            click('example', () => helpers.download('journal-example-demo.csv', asCsv([example], [...fields, ...extras])));
            click('prev', () => {
                page--;
                active = '';
                draw();
            });
            click('next', () => {
                page++;
                active = '';
                draw();
            });
            for (const b of host.querySelectorAll('[data-pk]')) b.onclick = () => {
                draft = null;
                active = b.dataset.pk;
                draw();
                el('edit')?.scrollIntoView({ block: 'nearest' });
            };
            for (const b of host.querySelectorAll('[data-rule-index]')) b.onclick = () => {
                if (window.confirm('Вилучити правило довідника?')) {
                    s.rules.splice(Number(b.dataset.ruleIndex), 1);
                    save('Правило вилучено.');
                    draw();
                }
            };
            if (el('review')) el('review').onchange = e => {
                review = e.target.checked;
                el('export').disabled = !review;
            };
            click('report-template', () => helpers.download('resources-template.csv', asCsv([])));
            click('export', () => {
                if (review && !p.blocked && p.output.length) {
                    helpers.download('resources.csv', asCsv(p.output));
                    helpers.notify?.('CSV сформовано');
                }
            });
            click('reset', () => {
                if (window.confirm('Очистити всі записи цієї публікації? Збережені реквізити залишаться у браузері.')) {
                    s.journal = [];
                    s.base = [];
                    page = viewPage = 0;
                    review = false;
                    active = '';
                    draft = null;
                    view = 'result';
                    query = '';
                    save('Записи очищено.');
                    draw();
                }
            });
            if (editing) {
                for (const mode of ['replace', 'add', 'skip']) click(mode, () => edit(editing, mode));
                click('save', () => edit(editing, ''));
                click('close', () => {
                    active = '';
                    draw();
                });
            }
        }

        draw();
    };
})();