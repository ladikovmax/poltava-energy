window.App = window.App || {};

(function (A) {
    'use strict';

    const CSV_FIELDS = [
        'uid', 'date', 'organizationName', 'organizationId',
        'providerName', 'providerId', 'meterNumber', 'type', 'quantity', 'unitName'
    ];

    const FIELD_LABELS = {
        uid: 'ID запису',
        date: 'Дата зняття',
        organizationName: 'Заклад',
        organizationId: 'ЄДРПОУ закладу',
        providerName: 'Постачальник',
        providerId: 'ЄДРПОУ постачальника',
        meterNumber: 'Номер лічильника',
        type: 'Послуга',
        quantity: 'Показання',
        unitName: 'Одиниця'
    };

    const RESOURCE_MAP = [
        { idx: 0, type: 'Теплова енергія', unitName: 'гігакалорія', regex: /тепл/i },
        { idx: 1, type: 'Електроенергія', unitName: 'кіловат-година', regex: /електр/i },
        { idx: 2, type: 'Природний газ', unitName: 'кубічний метр', regex: /газ/i },
        { idx: 3, type: 'Холодна вода', unitName: 'кубічний метр', regex: /холодн/i },
        { idx: 4, type: 'Гаряча вода', unitName: 'кубічний метр', regex: /гаряч/i }
    ];

    const clean = v => /^(null|-|—)$/i.test(String(v ?? '').trim()) ? '' : String(v ?? '').trim();

    function fingerprint(str) {
        let a = 2166136261, b = 5381;
        for (let i = 0; i < str.length; i++) {
            const c = str.charCodeAt(i);
            a = Math.imul(a ^ c, 16777619);
            b = Math.imul(b, 33) ^ c;
        }
        return (a >>> 0).toString(36) + '-' + (b >>> 0).toString(36);
    }

    function toCsv(rows) {
        const quote = v => {
            const s = String(v ?? '');
            return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
        };
        return '\uFEFF' + [
            CSV_FIELDS.join(','),
            ...rows.map(r => CSV_FIELDS.map(col => quote(r[col])).join(','))
        ].join('\r\n') + '\r\n';
    }

    /**
     * Аналізує стан імпортованих даних і готує звіт для Data.gov.ua
     */
    function buildDataGovReport() {
        const state = A.importCore.getState();
        const missing = [];
        const warnings = [];
        const rows = [];

        const years = Object.keys(state.periods || {}).sort();
        const hasBuildings = state.buildings.length > 0;
        const hasMeters = Object.keys(state.meterIndex || {}).length > 0;
        const hasSubjects = Object.keys(state.subjects || {}).length > 0;

        if (!hasBuildings) {
            missing.push('Не завантажено реєстр будівель (файл Buildings_Info_Report.xlsx).');
        }
        if (!years.length) {
            missing.push('Не завантажено річне споживання ресурсів (файл Річне_використання_ресурсів.xlsx).');
        }
        if (!hasMeters) {
            missing.push('Не завантажено реєстр лічильників (файл Лічильники.xlsx) — без них неможливо визначити номери приладів обліку.');
        }
        if (!hasSubjects) {
            missing.push('Не завантажено довідник суб’єктів СЕнМ — без нього відсутні коди ЄДРПОУ закладів.');
        }

        if (missing.length) {
            return { ready: false, rows: [], missing, warnings, stats: { totalRows: 0, years } };
        }

        const buildingMeters = new Map();
        for (const [mId, bId] of Object.entries(state.meterIndex)) {
            const key = String(bId);
            if (!buildingMeters.has(key)) buildingMeters.set(key, []);
            const det = state.meterDetails?.[mId] || {};
            const num = clean(det.number);
            buildingMeters.get(key).push({
                meterNumber: num && !/^б\s*\/\s*н(?:\s|$)/i.test(num) ? num : mId,
                resource: state.meterResources?.[mId] || ''
            });
        }

        let buildingsWithoutEdrpou = 0;
        let buildingsWithoutMeters = 0;

        for (const b of state.buildings) {
            const orgCode = String(state.links?.[b.id] || '').trim();
            const orgName = orgCode ? (state.subjects?.[orgCode] || b.name) : b.name;
            const meters = buildingMeters.get(String(b.id)) || [];

            const hasValidEdrpou = /^\d{8}$/.test(orgCode);
            if (!hasValidEdrpou) buildingsWithoutEdrpou++;

            for (const [yr, values] of Object.entries(b.years || {})) {
                const reportDate = state.periods[yr]?.asOf || `${yr}-12-31`;

                for (const res of RESOURCE_MAP) {
                    const qty = values[res.idx];
                    if (qty == null || !Number.isFinite(qty) || qty < 0) continue;

                    const matchedMeter = meters.find(m => res.regex.test(m.resource));
                    if (!matchedMeter) {
                        buildingsWithoutMeters++;
                        continue;
                    }

                    if (!hasValidEdrpou) continue;

                    rows.push({
                        uid: 'UM-' + fingerprint(`${b.id}|${orgCode}|${matchedMeter.meterNumber}|${yr}|${res.type}`),
                        date: reportDate,
                        organizationName: clean(orgName),
                        organizationId: orgCode,
                        providerName: clean(orgName),
                        providerId: orgCode,
                        meterNumber: clean(matchedMeter.meterNumber),
                        type: res.type,
                        quantity: String(qty),
                        unitName: res.unitName
                    });
                }
            }
        }

        if (!rows.length) {
            missing.push('Не вдалося сформувати жодного валідного запису. Перевірте, чи прив’язані будівлі до суб’єктів СЕнМ (ЄДРПОУ) та чи є у них лічильники.');
        }
        if (buildingsWithoutEdrpou > 0) {
            warnings.push(`У ${buildingsWithoutEdrpou} будівель не вказано код ЄДРПОУ суб’єкта СЕнМ (вони пропущені у звіті; прив’язати можна на сторінці «Імпорт»).`);
        }
        if (buildingsWithoutMeters > 0) {
            warnings.push(`Для ${buildingsWithoutMeters} записів споживання не знайдено відповідного лічильника у файлі Лічильники.xlsx.`);
        }
        if ((state.pending || []).length > 0) {
            warnings.push(`Є ${state.pending.length} незіставлених рядків будівель на сторінці «Імпорт» — вони не увійшли до звіту.`);
        }

        return {
            ready: missing.length === 0 && rows.length > 0,
            rows,
            missing,
            warnings,
            stats: {
                totalRows: rows.length,
                years
            }
        };
    }

    function downloadCsv(filename, rows) {
        const csvText = toCsv(rows);
        const url = URL.createObjectURL(new Blob([csvText], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    A.reportsCore = {
        CSV_FIELDS,
        FIELD_LABELS,
        buildDataGovReport,
        downloadCsv
    };
})(window.App);