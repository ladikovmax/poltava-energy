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
     * Формує готові рядки звіту та групує неповні записи по об'єктах (будівлях)
     */
    function buildDataGovReport() {
        const state = A.importCore.getState();
        const fatalMissing = [];
        const warnings = [];
        const rows = [];
        const brokenBuildingsMap = new Map();

        const years = Object.keys(state.periods || {}).sort();
        if (!state.buildings.length) {
            fatalMissing.push('Не завантажено реєстр будівель (файл Buildings_Info_Report.xlsx).');
        }
        if (!years.length) {
            fatalMissing.push('Не завантажено річне споживання ресурсів (файл Річне_використання_ресурсів.xlsx).');
        }

        if (fatalMissing.length) {
            return {
                hasBaseData: false,
                ready: false,
                rows: [],
                fatalMissing,
                issuesByBuilding: [],
                skippedRowsCount: 0,
                warnings: [],
                subjects: state.subjects || {},
                stats: { totalRows: 0, years }
            };
        }

        // Індексуємо лічильники по ID будівлі
        const buildingMeters = new Map();
        for (const [mId, bId] of Object.entries(state.meterIndex || {})) {
            const key = String(bId);
            if (!buildingMeters.has(key)) buildingMeters.set(key, []);
            const det = state.meterDetails?.[mId] || {};
            const num = clean(det.number);
            buildingMeters.get(key).push({
                meterNumber: num && !/^б\s*\/\s*н(?:\s|$)/i.test(num) ? num : mId,
                resource: state.meterResources?.[mId] || ''
            });
        }

        let skippedRowsCount = 0;

        for (const b of state.buildings) {
            const bId = String(b.id);
            const orgCode = String(state.links?.[bId] || '').trim();
            const orgName = orgCode ? (state.subjects?.[orgCode] || b.name) : b.name;
            const meters = buildingMeters.get(bId) || [];
            const hasValidEdrpou = /^\d{8}$/.test(orgCode);

            for (const [yr, values] of Object.entries(b.years || {})) {
                const reportDate = state.periods[yr]?.asOf || `${yr}-12-31`;

                for (const res of RESOURCE_MAP) {
                    const qty = values[res.idx];
                    if (qty == null || !Number.isFinite(qty) || qty < 0) continue;

                    const matchedMeter = meters.find(m => res.regex.test(m.resource));
                    const missingMeter = !matchedMeter;
                    const missingEdrpou = !hasValidEdrpou;

                    // Якщо в цьому записі є пропуск — фіксуємо його в картці об'єкта
                    if (missingEdrpou || missingMeter) {
                        skippedRowsCount++;
                        if (!brokenBuildingsMap.has(bId)) {
                            brokenBuildingsMap.set(bId, {
                                buildingId: bId,
                                buildingName: b.name,
                                address: b.address || '',
                                missingEdrpou,
                                currentEdrpou: orgCode,
                                currentOrgName: orgName,
                                missingResources: new Set(),
                                years: new Set()
                            });
                        }
                        const entry = brokenBuildingsMap.get(bId);
                        entry.years.add(yr);
                        if (missingMeter) entry.missingResources.add(res.type);
                        continue;
                    }

                    // Валідний запис одразу потрапляє у звіт
                    rows.push({
                        uid: 'UM-' + fingerprint(`${bId}|${orgCode}|${matchedMeter.meterNumber}|${yr}|${res.type}`),
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

        const issuesByBuilding = [...brokenBuildingsMap.values()]
            .map(item => ({
                ...item,
                missingResources: [...item.missingResources],
                years: [...item.years].sort()
            }))
            .sort((a, b) => a.buildingName.localeCompare(b.buildingName, 'uk'));

        if ((state.pending || []).length > 0) {
            warnings.push(`Є ${state.pending.length} незіставлених рядків будівель на сторінці «Імпорт» — вони не увійшли до звіту.`);
        }

        if (!rows.length && !issuesByBuilding.length) {
            fatalMissing.push('У завантажених звітах немає жодного числового показника споживання ресурсів.');
        }

        return {
            hasBaseData: fatalMissing.length === 0,
            ready: fatalMissing.length === 0 && rows.length > 0,
            rows,
            fatalMissing,
            issuesByBuilding,
            skippedRowsCount,
            warnings,
            subjects: state.subjects || {},
            stats: {
                totalRows: rows.length,
                years
            }
        };
    }

    /**
     * Зберігає виправлені реквізити для конкретного об'єкта (ЄДРПОУ та/або список лічильників)
     */
    function saveBuildingFix({ buildingId, edrpou, orgName, meters }) {
        const state = A.importCore.getState();
        const bId = String(buildingId);

        if (edrpou !== undefined) {
            const code = clean(edrpou);
            if (!/^\d{8}$/.test(code)) {
                throw Error('Код ЄДРПОУ має містити рівно 8 цифр.');
            }
            state.links = state.links || {};
            state.subjects = state.subjects || {};
            state.links[bId] = code;
            if (clean(orgName)) {
                state.subjects[code] = clean(orgName);
            } else if (!state.subjects[code]) {
                const b = state.buildings.find(x => String(x.id) === bId);
                state.subjects[code] = b ? b.name : `Суб'єкт ${code}`;
            }
        }

        if (Array.isArray(meters) && meters.length) {
            state.meterIndex = state.meterIndex || {};
            state.meterResources = state.meterResources || {};
            state.meterDetails = state.meterDetails || {};

            for (const m of meters) {
                const num = clean(m.meterNumber);
                if (!num) {
                    throw Error(`Вкажіть номер лічильника для послуги «${m.resourceType}».`);
                }
                const manualMeterId = `manual-${bId}-${fingerprint(m.resourceType)}`;
                state.meterIndex[manualMeterId] = bId;
                state.meterResources[manualMeterId] = m.resourceType;
                state.meterDetails[manualMeterId] = {
                    number: num,
                    model: 'Введено вручну',
                    kind: 'Комерційний'
                };
            }
        }

        A.importCore.saveState(state);
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
        saveBuildingFix,
        downloadCsv
    };
})(window.App);