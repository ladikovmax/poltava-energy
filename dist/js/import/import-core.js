window.App = window.App || {};

(function (A) {
    'use strict';

    const STORE_KEY = 'poltava-energy-workspace-v2';
    const GAS_KWH_PER_M3 = 9.7; // Фіксований коефіцієнт теплоти згоряння природного газу (кВт·год/м³)

    // Допоміжні утиліти для очищення та порівняння тексту
    const tidy = v => String(v ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
    const norm = v => tidy(v).toLocaleLowerCase('uk').replace(/[’`ʼ]/g, "'");
    const joinKey = (name, address) => JSON.stringify([norm(name), norm(address)]);
    const copy = v => JSON.parse(JSON.stringify(v));

    // Порожня структура даних
    function emptyState() {
        return {
            buildings: [],      // Реєстр будівель
            subjects: {},       // Довідник суб'єктів СЕнМ (ЄДРПОУ -> Назва)
            links: {},          // Прив'язка (ID будівлі -> ЄДРПОУ)
            periods: {},        // Завантажені роки ({ '2025': { asOf: '2025-12-31', full: true } })
            pending: [],        // Незіставлені рядки зі звітів
            aliases: {},        // Збережені ручні зіставлення
            meterIndex: {},     // ID лічильника -> ID будівлі
            meterResources: {}, // ID лічильника -> Тип ресурсу
            meterDetails: {}    // ID лічильника -> { number, model, kind }
        };
    }

    // Завантаження та збереження у localStorage
    function loadState() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORE_KEY));
            return saved && Array.isArray(saved.buildings) ? Object.assign(emptyState(), saved) : emptyState();
        } catch {
            return emptyState();
        }
    }

    function saveState(state) {
        localStorage.setItem(STORE_KEY, JSON.stringify(state));
    }

    function clearAllData() {
        localStorage.removeItem(STORE_KEY);
        localStorage.removeItem('poltava-energy-gas-v2');
        localStorage.removeItem('poltava-energy-publication-v2');
    }

    // Парсинг чисел та валідація ID
    const idString = v => {
        const key = tidy(v);
        if (['constructor', '__proto__', 'prototype'].includes(key)) throw Error('Некоректний ID у файлі.');
        return key;
    };

    function parseNum(v) {
        if (v == null || tidy(v) === '') return null;
        const parsed = Number(tidy(v).replace(/\s+/g, '').replace(',', '.'));
        if (!Number.isFinite(parsed)) throw Error(`Нечислове значення «${tidy(v).slice(0, 30)}».`);
        return parsed;
    }

    const sheetRows = sheet => window.XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, blankrows: true, raw: true });

    // 1. Визначення типу звіту за заголовками колонок
    function identifyWorkbook(book, fileName) {
        const signatures = [
            ['registry', ['id', 'name', 'address', 'heated_area', 'heated_area_size']],
            ['annual', ['назва будівлі', 'адреса будівлі', 'категорія', 'опалення']],
            ['meters', ['id будівлі', 'id лічильника', 'ресурс']],
            ['subjects', ["назва суб'єкта", 'єдрпоу']]
        ];

        for (const sheetName of book.SheetNames) {
            const sheet = book.Sheets[sheetName];
            if (!sheet['!ref'] || norm(sheetName) === 'інформація') continue;

            const top = window.XLSX.utils.sheet_to_json(sheet, {
                header: 1, range: { s: { r: 0, c: 0 }, e: { r: 11, c: 50 } }, blankrows: true, raw: true
            });

            for (let r = 0; r < top.length; r++) {
                const header = top[r].map(norm);
                const found = signatures.find(([, req]) => req.every(col => header.includes(col)));
                if (found) {
                    const allRows = sheetRows(sheet);
                    return {
                        type: found[0],
                        header,
                        records: allRows.slice(r + 1),
                        firstRow: r + 2,
                        book,
                        fileName,
                        title: tidy(allRows[0]?.[0])
                    };
                }
            }
        }
        throw Error(`${fileName}: не розпізнано формат звіту uMuni або СЕнМ.`);
    }

    // 2. Обробка реєстру будівель
    function parseRegistry(state, doc, messages) {
        const existing = new Map(state.buildings.map(b => [b.id, b]));
        const seen = new Set();

        for (const [offset, row] of doc.records.entries()) {
            const get = col => row[doc.header.indexOf(col)];
            const id = idString(get('id'));
            if (!id) continue;

            const name = tidy(get('name'));
            if (!name || seen.has(id)) throw Error(`${doc.fileName}: відсутня назва або дублюється ID будівлі ${id}.`);
            seen.add(id);

            const b = existing.get(id) || { id, category: '', heating: '', years: {}, meters: {} };
            Object.assign(b, {
                name,
                address: tidy(get('address')),
                year: parseNum(get('year')),
                floors: parseNum(get('floor')),
                area: parseNum(get('heated_area')),
                volume: parseNum(get('heated_area_size')),
                registrySource: { file: doc.fileName, row: doc.firstRow + offset }
            });
            existing.set(id, b);
        }

        if (!seen.size) throw Error(`${doc.fileName}: реєстр будівель порожній.`);
        state.buildings = [...existing.values()];
        messages.push(`Реєстр будівель: завантажено ${seen.size} об'єктів.`);
    }

    // 3. Визначення періоду з аркуша «Інформація»
    function parsePeriod(doc) {
        const infoSheet = doc.book.SheetNames.find(n => norm(n) === 'інформація');
        const info = infoSheet ? sheetRows(doc.book.Sheets[infoSheet]) : [];
        const getInfo = key => info.find(r => norm(r[0]).replace(/:$/, '') === key)?.[1];

        const year = tidy(getInfo('рік запиту')) || doc.title.match(/(20\d{2})\s*рік/i)?.[1];
        if (!/^20\d{2}$/.test(year)) throw Error(`${doc.fileName}: не знайдено звітний рік.`);

        const rawDate = tidy(getInfo('дата створення'));
        const m = rawDate.match(/^(\d{1,2})\.(\d{1,2})\.(20\d{2})/) || [];
        const asOf = m.length
            ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
            : rawDate.match(/^20\d{2}-\d{2}-\d{2}/)?.[0];

        if (!asOf || asOf < `${year}-01-01`) throw Error(`${doc.fileName}: некоректна дата на аркуші «Інформація».`);
        const full = asOf >= `${year}-12-31`;
        return { year, asOf: full ? `${year}-12-31` : asOf, full };
    }

    function normalizeHeating(input) {
        const t = norm(input);
        if (!t) return '';
        if (t.includes('без опалення')) return 'Без опалення';
        if (t.includes('газ')) return 'Газове';
        if (t.includes('централ')) return 'Централізоване';
        if (t.includes('електр')) return 'Електричне';
        if (t.includes('тверд')) return 'Твердопаливне';
        return 'Інше';
    }

    function applyYearData(building, rec) {
        building.years[rec.year] = rec.values;
        building.yearSources ||= {};
        if (rec.source) building.yearSources[rec.year] = rec.source;
        if (rec.year >= (building.profileYear || '')) {
            building.category = rec.category;
            building.heating = rec.heating;
            building.profileYear = rec.year;
        }
    }

    // 4. Обробка річного споживання ресурсів
    function parseAnnual(state, doc, period, messages) {
        const { year, asOf, full } = period;
        const cols = ['теплова енергія, гкал', 'електроенергія, квт*год', 'газ, м3', 'холодна вода, м3', 'гаряча вода, м3']
            .map(c => doc.header.indexOf(c));
        if (cols.includes(-1)) throw Error(`${doc.fileName}: не знайдено очікуваних колонок ресурсів.`);

        const byId = new Map(state.buildings.map(b => [b.id, b]));
        const byNameAddr = new Map();
        for (const b of state.buildings) {
            const k = joinKey(b.name, b.address);
            if (!byNameAddr.has(k)) byNameAddr.set(k, []);
            byNameAddr.get(k).push(b);
            delete b.years[year];
        }

        state.pending = state.pending.filter(p => p.year !== year);
        const used = new Set(), seen = new Set();
        let total = 0;

        for (const [offset, row] of doc.records.entries()) {
            const get = col => row[doc.header.indexOf(col)];
            const name = tidy(get('назва будівлі')), address = tidy(get('адреса будівлі'));
            if (!name && !address) continue;
            total++;

            const key = joinKey(name, address);
            if (seen.has(key)) throw Error(`${doc.fileName}: дублікат рядка «${name}».`);
            seen.add(key);

            const group = byNameAddr.get(key) || [];
            const building = byId.get(state.aliases[key]) || (group.length === 1 ? group[0] : null);
            const record = {
                name, address,
                category: tidy(get('категорія')),
                heating: normalizeHeating(get('опалення')),
                year,
                values: cols.map(i => parseNum(row[i])),
                source: { file: doc.fileName, row: doc.firstRow + offset }
            };

            if (building && !used.has(building.id)) {
                applyYearData(building, record);
                used.add(building.id);
            } else {
                state.pending.push(record);
            }
        }

        state.periods[year] = { asOf, full };
        messages.push(`${year} рік: зіставлено ${used.size} із ${total} будівель.`);
    }

    // 5. Обробка лічильників
    function parseMeters(state, doc, messages) {
        const buildings = new Map(state.buildings.map(b => [b.id, b]));
        for (const b of buildings.values()) b.meters = {};
        const assignments = new Map();
        let unlinked = 0;

        for (const row of doc.records) {
            const get = col => row[doc.header.indexOf(col)];
            const meterId = idString(get('id лічильника'));
            if (!meterId) continue;

            const bId = idString(get('id будівлі'));
            const b = buildings.get(bId);
            if (!b) { unlinked++; continue; }

            const resource = tidy(get('ресурс')) || 'Не вказано';
            const details = {
                number: String(get('номер лічильника') ?? '').trim(),
                model: tidy(get('модель лічильника')),
                kind: tidy(get('тип'))
            };

            if (!assignments.has(meterId)) {
                assignments.set(meterId, { id: bId, resource, details });
                b.meters[resource] = (b.meters[resource] || 0) + 1;
            }
        }

        state.meterIndex = Object.fromEntries([...assignments].map(([m, v]) => [m, v.id]));
        state.meterResources = Object.fromEntries([...assignments].map(([m, v]) => [m, v.resource]));
        state.meterDetails = Object.fromEntries([...assignments].map(([m, v]) => [m, v.details]));
        messages.push(`Лічильники: прив'язано ${assignments.size}` + (unlinked ? ` (без будівлі в реєстрі: ${unlinked})` : '') + '.');
    }

    // 6. Обробка суб'єктів СЕнМ (ЄДРПОУ)
    function parseSubjects(state, doc, messages) {
        const byName = new Map();
        let count = 0;

        for (const row of doc.records) {
            const name = tidy(row[doc.header.indexOf("назва суб'єкта")]);
            const rawCode = row[doc.header.indexOf('єдрпоу')];
            if (!name) continue;
            const code = typeof rawCode === 'number' ? String(rawCode).padStart(8, '0') : tidy(rawCode);
            if (!/^\d{8}$/.test(code)) continue;

            count++;
            state.subjects[code] = name;
            const k = norm(name);
            if (!byName.has(k)) byName.set(k, new Set());
            byName.get(k).add(code);
        }

        for (const b of state.buildings) {
            const codes = byName.get(norm(b.name));
            if (!state.links[b.id] && codes?.size === 1) state.links[b.id] = [...codes][0];
        }
        messages.push(`Довідник СЕнМ: завантажено ${count} суб'єктів.`);
    }

    // Головний метод обробки пакету файлів
    async function processFiles(files, currentState) {
        if (!window.XLSX) throw Error('Бібліотека читання Excel (XLSX) не підключена.');
        const list = Array.from(files || []);
        if (!list.length) throw Error('Оберіть хоча б один файл .xlsx.');

        const next = copy(currentState || emptyState());
        const messages = [], docs = [];

        for (const file of list) {
            if (!/\.xlsx$/i.test(file.name)) throw Error(`Очікується формат .xlsx: ${file.name}`);
            const book = window.XLSX.read(await file.arrayBuffer(), { type: 'array' });
            docs.push(identifyWorkbook(book, file.name));
        }

        for (const doc of docs.filter(d => d.type === 'registry')) parseRegistry(next, doc, messages);
        if (!next.buildings.length) throw Error('Спершу завантажте реєстр будівель (Buildings_Info_Report.xlsx).');

        for (const doc of docs.filter(d => d.type === 'annual')) parseAnnual(next, doc, parsePeriod(doc), messages);
        for (const doc of docs.filter(d => d.type === 'meters')) parseMeters(next, doc, messages);
        for (const doc of docs.filter(d => d.type === 'subjects')) parseSubjects(next, doc, messages);

        saveState(next);
        return { state: next, messages };
    }

    // Ручне зіставлення будівлі
    function resolvePending(currentState, pendingIdx, buildingId) {
        const next = copy(currentState);
        const rec = next.pending[pendingIdx];
        const b = next.buildings.find(x => x.id === String(buildingId));
        if (!rec || !b) throw Error('Оберіть рядок звіту та будівлю.');

        const key = joinKey(rec.name, rec.address);
        const group = next.pending.filter(r => joinKey(r.name, r.address) === key);
        for (const row of group) applyYearData(b, row);

        next.aliases[key] = b.id;
        next.pending = next.pending.filter(r => joinKey(r.name, r.address) !== key);
        saveState(next);
        return next;
    }

    // Експортуємо публічний API бекенду імпорту
    A.importCore = {
        GAS_KWH_PER_M3,
        getState: loadState,
        saveState,
        clearAllData,
        processFiles,
        resolvePending,
        getGas: () => GAS_KWH_PER_M3
    };
})(window.App);