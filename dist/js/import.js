/* Read the original uMuni workbooks entirely in the browser. */
(() => {
    "use strict";

    // Очищення рядка від зайвих пробілів та нормалізація символів Unicode
    const tidy = value => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");

    // Нормалізація тексту до нижнього регістру з уніфікацією апострофів для порівняння
    const norm = value => tidy(value).toLocaleLowerCase("uk").replace(/[’`ʼ]/g, "'");

    // Формування єдиного ключа зіставлення на основі нормалізованої назви та адреси будівлі
    const joinKey = (name, address) => JSON.stringify([norm(name), norm(address)]);

    // Глибоке клонування об'єктів стану через JSON-серіалізацію
    const copy = value => JSON.parse(JSON.stringify(value));

    // Створення порожньої структури даних робочого простору
    const empty = () => ({
        buildings: [],
        subjects: {},
        links: {},
        periods: {},
        pending: [],
        aliases: {},
        meterIndex: {},
        meterResources: {},
        meterDetails: {},
        demo: false
    });

    // Валідація рядкового ідентифікатора із захистом від Prototype Pollution
    const idString = value => {
        const key = tidy(value);
        if (["constructor", "__proto__", "prototype"].includes(key)) throw Error("Некоректний ідентифікатор у файлі.");
        return key;
    };

    // Парсинг числових значень із клітинок Excel із підтримкою коми як десяткового роздільника
    function number(value) {
        if (value == null || tidy(value) === "") return null;
        const parsed = Number(tidy(value).replace(/\s+/g, "").replace(",", "."));
        if (!Number.isFinite(parsed)) throw Error("У числовому полі нечислове значення «" + tidy(value).slice(0, 40) + "».");
        return parsed;
    }

    // Конвертація аркуша Excel у двовимірний масив рядків
    function rows(sheet) {
        return window.XLSX.utils.sheet_to_json(sheet, { header: 1, range: 0, blankrows: true, raw: true });
    }

    // Визначення типу завантаженого звіту uMuni або СЕнМ за набором обов'язкових заголовків колонок
    function identify(book, fileName) {
        const types = [
            ["registry", ["id", "name", "address", "heated_area", "heated_area_size"]],
            ["annual", ["назва будівлі", "адреса будівлі", "категорія", "опалення"]],
            ["meters", ["id будівлі", "id лічильника", "ресурс"]],
            ["subjects", ["назва суб'єкта", "єдрпоу"]]
        ];
        for (const sheetName of book.SheetNames) {
            const sheet = book.Sheets[sheetName];
            if (!sheet["!ref"] || norm(sheetName) === "інформація") continue;
            const top = window.XLSX.utils.sheet_to_json(sheet, {
                header: 1,
                range: { s: { r: 0, c: 0 }, e: { r: 11, c: 50 } },
                blankrows: true,
                raw: true
            });
            for (let n = 0; n < top.length; n++) {
                const header = top[n].map(norm);
                const match = types.find(([, required]) => required.every(key => header.includes(key)));
                if (match) {
                    const dataRows = rows(sheet);
                    const records = dataRows.slice(n + 1);
                    return { type: match[0], header, records, firstRow: n + 2, book, fileName, title: tidy(dataRows[0]?.[0]) };
                }
            }
        }
        throw Error(fileName + ": не розпізнано звіт uMuni або СЕнМ.");
    }

    // Імпорт та оновлення реєстру будівель із перевіркою унікальності ID та наявності назв
    function register(state, doc, messages) {
        const existing = new Map(state.buildings.map(b => [b.id, b]));
        const seen = new Set();
        for (const [offset, row] of doc.records.entries()) {
            const get = key => row[doc.header.indexOf(key)];
            const id = idString(get("id"));
            if (!id) continue;
            const name = tidy(get("name"));
            if (!name || seen.has(id)) throw Error(doc.fileName + ": відсутня назва або повторюється ID будівлі " + id + ".");
            seen.add(id);
            const b = existing.get(id) || { id, category: "", heating: "", years: {}, meters: {} };
            Object.assign(b, {
                name,
                address: tidy(get("address")),
                year: number(get("year")),
                floors: number(get("floor")),
                area: number(get("heated_area")),
                volume: number(get("heated_area_size"))
            });
            b.registrySource = { file: doc.fileName, row: doc.firstRow + offset };
            existing.set(id, b);
        }
        if (!seen.size) throw Error(doc.fileName + ": реєстр будівель порожній.");
        state.buildings = [...existing.values()];
        messages.push("Реєстр будівель: " + seen.size + ".");
        if (existing.size > seen.size) messages.push("Збережено будівлі з попереднього реєстру: " + (existing.size - seen.size) + ".");
    }

    // Визначення звітного року, дати актуальності та ознаки повноти року з аркуша «Інформація»
    function period(doc) {
        const infoName = doc.book.SheetNames.find(name => norm(name) === "інформація");
        const info = infoName ? rows(doc.book.Sheets[infoName]) : [];
        const infoValue = key => info.find(row => norm(row[0]).replace(/:$/, "") === key)?.[1];
        const year = tidy(infoValue("рік запиту")) || doc.title.match(/(20\d{2})\s*рік/i)?.[1];
        if (!/^20\d{2}$/.test(year)) throw Error(doc.fileName + ": немає року звіту.");
        const raw = tidy(infoValue("дата створення"));
        const match = raw.match(/^(\d{1,2})\.(\d{1,2})\.(20\d{2})/) || [];
        const date = match.length ? match[3] + "-" + match[2].padStart(2, "0") + "-" + match[1].padStart(2, "0") : raw.match(/^20\d{2}-\d{2}-\d{2}/)?.[0];
        if (!date || date < year + "-01-01") throw Error(doc.fileName + ": перевірте дату створення на аркуші «Інформація».");
        const full = date >= year + "-12-31";
        return { year, asOf: full ? year + "-12-31" : date, full };
    }

    // Стандартизація текстового опису типу опалення будівлі
    function heatType(input) {
        const type = norm(input);
        if (!type) return "";
        if (type.includes("без опалення")) return "Без опалення";
        if (type.includes("газ")) return "Газове";
        if (type.includes("централ")) return "Централізоване";
        if (type.includes("електр")) return "Електричне";
        if (type.includes("тверд")) return "Твердопаливне";
        return "Інше";
    }

    // Запис показників споживання за конкретний рік у картку будівлі та оновлення її актуального профілю
    function applyRow(building, record) {
        building.years[record.year] = record.values;
        building.yearSources ||= {};
        if (record.source) building.yearSources[record.year] = record.source;
        if (record.year >= (building.profileYear || "")) {
            building.category = record.category;
            building.heating = record.heating;
            building.profileYear = record.year;
        }
    }

    // Обробка річного звіту споживання ресурсів та автоматичне зіставлення рядків із будівлями реєстру
    function annual(state, doc, current, messages) {
        const { year, asOf, full } = current;
        if (state.periods[year]?.asOf > asOf) throw Error(doc.fileName + ": є новіший звіт за цей рік. Старий файл не застосовано.");
        const indices = ["теплова енергія, гкал", "електроенергія, квт*год", "газ, м3", "холодна вода, м3", "гаряча вода, м3"]
            .map(key => doc.header.indexOf(key));
        if (indices.includes(-1)) throw Error(doc.fileName + ": непідтримувані назви колонок або одиниці виміру ресурсів.");
        const byId = new Map(state.buildings.map(b => [b.id, b]));
        const groups = new Map();
        for (const b of state.buildings) {
            const key = joinKey(b.name, b.address);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(b);
            delete b.years[year];
            if (b.yearSources) delete b.yearSources[year];
        }
        state.pending = state.pending.filter(item => item.year !== year);
        const used = new Set(), seen = new Set();
        let total = 0;
        for (const [offset, row] of doc.records.entries()) {
            const get = key => row[doc.header.indexOf(key)];
            const name = tidy(get("назва будівлі")), address = tidy(get("адреса будівлі"));
            if (!name && !address) continue;
            total++;
            const key = joinKey(name, address);
            if (seen.has(key)) throw Error(doc.fileName + ": кілька рядків мають однакові назву й адресу. Уточніть дублікати у звіті.");
            seen.add(key);
            const group = groups.get(key) || [];
            const b = byId.get(state.aliases[key]) || (group.length === 1 ? group[0] : null);
            const record = {
                name,
                address,
                category: tidy(get("категорія")),
                heating: heatType(get("опалення")),
                year,
                values: indices.map(i => number(row[i])),
                source: { file: doc.fileName, row: doc.firstRow + offset }
            };
            if (b && !used.has(b.id)) {
                applyRow(b, record);
                used.add(b.id);
            } else {
                state.pending.push(record);
            }
        }
        if (!total) throw Error(doc.fileName + ": річний звіт порожній.");
        state.periods[year] = { asOf, full };
        messages.push(year + ": зіставлено " + used.size + " із " + total + " рядків.");
        if (used.size < total) messages.push("Потрібно підтвердити відповідності за " + year + ": " + (total - used.size) + ".");
    }

    // Імпорт реєстру лічильників, перевірка суперечностей та прив'язка приладів до будівель
    function meterList(state, doc, messages) {
        const buildings = new Map(state.buildings.map(b => [b.id, b]));
        const assignments = new Map();
        for (const b of buildings.values()) b.meters = {};
        let missing = 0;
        for (const row of doc.records) {
            const get = key => row[doc.header.indexOf(key)];
            const meter = idString(get("id лічильника"));
            if (!meter) continue;
            const id = idString(get("id будівлі")), b = buildings.get(id);
            if (!b) {
                missing++;
                continue;
            }
            const resource = tidy(get("ресурс")) || "Ресурс не вказано";
            const details = { number: String(get("номер лічильника") ?? "").trim(), model: tidy(get("модель лічильника")), kind: tidy(get("тип")) };
            const existing = assignments.get(meter);
            if (existing && (existing.id !== id || existing.resource !== resource || JSON.stringify(existing.details) !== JSON.stringify(details))) throw Error(doc.fileName + ": суперечливі записи одного лічильника.");
            if (existing) continue;
            assignments.set(meter, { id, resource, details });
            Object.defineProperty(b.meters, resource, {
                value: (Object.hasOwn(b.meters, resource) ? b.meters[resource] : 0) + 1,
                configurable: true,
                enumerable: true,
                writable: true
            });
        }
        if (!assignments.size) throw Error(doc.fileName + ": немає лічильників, зіставлених із реєстром.");
        state.meterIndex = Object.fromEntries([...assignments].map(([meter, { id }]) => [meter, id]));
        state.meterResources = Object.fromEntries([...assignments].map(([meter, { resource }]) => [meter, resource]));
        state.meterDetails = Object.fromEntries([...assignments].map(([meter, { details }]) => [meter, details]));
        messages.push("Лічильників: " + assignments.size + (missing ? ". Без відповідної будівлі: " + missing : "") + ".");
    }

    // Імпорт довідника суб'єктів СЕнМ за кодами ЄДРПОУ та автоматична прив'язка будівель за точним збігом назви
    function subjects(state, doc, messages) {
        const byName = new Map(), validCodes = new Set();
        let skipped = 0;
        for (const row of doc.records) {
            const name = tidy(row[doc.header.indexOf("назва суб'єкта")]);
            const val = row[doc.header.indexOf("єдрпоу")];
            if (!name) continue;
            const code = typeof val === "number" ? String(val).padStart(8, "0") : tidy(val);
            if (!/^\d{8}$/.test(code)) {
                skipped++;
                continue;
            }
            validCodes.add(code);
            if (!state.subjects[code]) state.subjects[code] = name;
            const key = norm(name);
            if (!byName.has(key)) byName.set(key, new Set());
            byName.get(key).add(code);
        }
        for (const b of state.buildings) {
            const choices = byName.get(norm(b.name));
            if (!state.links[b.id] && choices?.size === 1) state.links[b.id] = [...choices][0];
        }
        messages.push("Суб’єктів з кодом ЄДРПОУ: " + validCodes.size + (skipped ? ". Рядків без коректного коду: " + skipped : "") + ".");
    }

    // Ручне підтвердження відповідності між незіставленим рядком звіту та будівлею з реєстру зі збереженням псевдоніма
    function resolve(input, index, id) {
        const state = copy(input);
        const record = state.pending[index], building = state.buildings.find(b => b.id === String(id));
        if (!record || !building) throw Error("Виберіть рядок та будівлю з реєстру.");
        const key = joinKey(record.name, record.address);
        const related = state.pending.filter(r => joinKey(r.name, r.address) === key);
        if (related.some(r => Object.hasOwn(building.years, r.year))) throw Error("Для цієї будівлі вже є рядок за вибраний рік.");
        for (const row of related) applyRow(building, row);
        state.aliases[key] = building.id;
        state.pending = state.pending.filter(r => joinKey(r.name, r.address) !== key);
        return state;
    }

    // Головний конвеєр читання, розпізнавання та послідовної обробки пакету обраних XLSX-файлів
    async function readFiles(files, previousData) {
        if (!window.XLSX) throw Error("Модуль читання XLSX не завантажився.");
        const selected = Array.from(files || []);
        if (!selected.length) throw Error("Оберіть файли XLSX.");
        const state = previousData && !previousData.demo ? Object.assign(empty(), copy(previousData)) : empty();
        const messages = [], docs = [];
        for (const file of selected) {
            if (!/\.xlsx$/i.test(file.name)) throw Error("Очікується файл XLSX: " + file.name);
            try {
                const book = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
                docs.push(identify(book, file.name));
            } catch (err) {
                throw Error("Не вдалося прочитати " + file.name + ". " + err.message);
            }
        }
        for (const type of ["registry", "meters", "subjects"]) {
            if (docs.filter(doc => doc.type === type).length > 1) throw Error("Оберіть одну версію кожного реєстру за один імпорт.");
        }
        for (const doc of docs.filter(d => d.type === "registry")) register(state, doc, messages);
        if (!state.buildings.length) throw Error("Для першого імпорту додайте файл «Характеристики будівель» (Buildings_Info_Report).");
        const periods = new Set();
        for (const doc of docs.filter(d => d.type === "annual")) {
            const current = period(doc);
            if (periods.has(current.year)) throw Error("Оберіть одну версію річного звіту за " + current.year + ".");
            periods.add(current.year);
            annual(state, doc, current, messages);
        }
        for (const doc of docs.filter(d => d.type === "meters")) meterList(state, doc, messages);
        for (const doc of docs.filter(d => d.type === "subjects")) subjects(state, doc, messages);
        return { state, messages };
    }

    window.EnergyImport = { empty, readFiles, resolve };
})();