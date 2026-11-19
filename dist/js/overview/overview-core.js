window.App = window.App || {};

(function (A) {
    'use strict';

    // Орієнтовні тарифи Полтавської ТГ (з ПДВ) у грн за 1 МВт·год:
    // Тепло: ~3 980 грн/Гкал (~3 422 грн/МВт·год), е/е: 14,77 грн/кВт·год, газ: 20,88 грн/м³ (~2 245 грн/мВт·год)
    const TARIFF_UAH_PER_MWH = [3422, 14770, 2245];
    const ENERGY_NAMES = ['Теплова енергія', 'Електроенергія', 'Природний газ'];
    const MIN_DAYS_FOR_GRADE = 30; // Мінімум 1 місяць даних для оцінки ефективності

    const finite = v => typeof v === 'number' && Number.isFinite(v);

    // Орієнтовний бюджет у млн грн
    function estimateCostMln(amounts) {
        if (!Array.isArray(amounts)) return null;
        const totalUah = amounts.reduce((sum, mwh, i) => sum + (mwh || 0) * (TARIFF_UAH_PER_MWH[i] || 0), 0);
        return totalUah > 0 ? totalUah / 1e6 : null;
    }

    // Визначення тривалості звітного періоду (повний рік / кількість днів до дати зрізу)
    function getPeriodMeta(year, period) {
        if (period?.full) {
            return { full: true, isPartial: false, days: 365, enoughForGrade: true };
        }
        const raw = String(period?.asOf || '').trim();
        let y = Number(year);
        let m = 0;
        let d = 0;

        const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
        const ua = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})/);

        if (iso) {
            y = Number(iso[1]);
            m = Number(iso[2]);
            d = Number(iso[3]);
        } else if (ua) {
            d = Number(ua[1]);
            m = Number(ua[2]);
            y = Number(ua[3]);
        }

        if (!m || !d || !Number.isFinite(y)) {
            return { full: false, isPartial: true, days: 0, enoughForGrade: false };
        }

        const start = Date.UTC(y, 0, 1);
        const end = Date.UTC(y, m - 1, d);
        const days = Math.max(0, Math.floor((end - start) / 86400000) + 1);

        return {
            full: false,
            isPartial: true,
            days,
            enoughForGrade: days >= MIN_DAYS_FOR_GRADE
        };
    }

    function calcMedian(values) {
        const sorted = values.filter(finite).sort((a, b) => a - b);
        if (!sorted.length) return null;
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0
            ? sorted[mid]
            : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    function calcGrade(intensity, median) {
        if (!finite(intensity) || !finite(median) || median <= 0) return null;
        const ratio = intensity / median;
        if (ratio <= 0.50) return 'A';
        if (ratio <= 0.70) return 'B';
        if (ratio <= 0.90) return 'C';
        if (ratio <= 1.10) return 'D';
        if (ratio <= 1.30) return 'E';
        if (ratio <= 1.50) return 'F';
        return 'G';
    }

    // Агрегація списку будівель
    function summarize(rows) {
        const amounts = [0, 0, 0];
        const counts = [0, 0, 0];
        let covered = 0;

        for (const r of rows) {
            if (r.mwh !== null && r.mwh > 0) covered++;
            (r.byResource || []).slice(0, 3).forEach((val, i) => {
                if (finite(val) && val > 0) {
                    amounts[i] += val;
                    counts[i]++;
                }
            });
        }

        const hasAny = counts.some(c => c > 0);
        const total = hasAny ? amounts.reduce((a, b) => a + b, 0) : null;
        const shares = amounts.map(v => (total && total > 0 ? (v / total) * 100 : 0));

        return {
            amounts,
            counts,
            shares,
            covered,
            total,
            toe: total !== null ? total * 0.086 : null,
            costMln: estimateCostMln(amounts)
        };
    }

    // Підготовка даних для вибраного року (огляд + категорії + рейтинг)
    function getOverviewData(selectedYear) {
        const state = A.importCore.getState();
        const gasKwh = A.importCore.getGas();
        const years = Object.keys(state.periods || {}).sort().reverse();

        if (!state.buildings.length || !years.length) {
            return { empty: true, hasRegistry: state.buildings.length > 0, years: [] };
        }

        const year = years.includes(selectedYear) ? selectedYear : (years.includes('2025') ? '2025' : years[0]);
        const period = state.periods[year] || { full: false, asOf: '' };
        const periodMeta = getPeriodMeta(year, period);
        const full = periodMeta.full;

        const gasFactor = (finite(gasKwh) && gasKwh > 0 ? gasKwh : 9.3) / 1000;
        const factors = [1.163, 0.001, gasFactor];

        const baseAnalysis = A.passportCore.analyzeAll();
        const baseMap = new Map(baseAnalysis.items.map(x => [x.b.id, x]));

        // 1. Первинний розрахунок споживання та питомого показника кожної будівлі
        const draftRows = state.buildings.map(b => {
            const baseItem = baseMap.get(b.id);
            const category = baseItem ? baseItem.category : (b.category || 'Інші комунальні будівлі');
            const raw = b.years?.[year] || [];

            let mwh = 0;
            let hasEnergy = false;
            const byResource = [0, 1, 2].map(i => {
                const v = raw[i];
                if (!finite(v) || v < 0) return null;
                if (v > 0) hasEnergy = true;
                const conv = v * factors[i];
                mwh += conv;
                return conv;
            });

            const totalMwh = hasEnergy ? mwh : (raw.slice(0, 3).some(v => v === 0) ? 0 : null);
            const hasData = totalMwh !== null && totalMwh > 0;
            const areaValid = finite(b.area) && b.area > 1.0;

            const excludes = [];
            if (!areaValid) excludes.push('Фіктивна або відсутня площа (≤ 1,00 м²)');
            if (!hasData) excludes.push(`Немає споживання у ${year} р.`);

            const eligible = hasData && areaValid;
            const intensity = eligible ? (totalMwh * 1000) / b.area : null;

            return {
                b,
                baseItem,
                category,
                mwh: totalMwh,
                hasData,
                byResource,
                eligible,
                excludes,
                intensity
            };
        });

        // 2. Розрахунок медіан категорій для неповного року (якщо зібрано >= 1 місяця даних)
        const partialMedians = new Map();
        if (!full && periodMeta.enoughForGrade) {
            const byCat = new Map();
            for (const r of draftRows) {
                if (!r.eligible || !finite(r.intensity)) continue;
                if (!byCat.has(r.category)) byCat.set(r.category, []);
                byCat.get(r.category).push(r.intensity);
            }
            for (const [cat, vals] of byCat.entries()) {
                partialMedians.set(cat, calcMedian(vals));
            }
        }

        // 3. Присвоєння медіани та класу ефективності (A–G)
        const rows = draftRows.map(r => {
            let median = null;
            let grade = null;
            let isPartialGrade = false;

            if (full) {
                median = r.baseItem ? r.baseItem.median : null;
                grade = r.eligible
                    ? (r.baseItem?.gradeInfo ? r.baseItem.gradeInfo.grade : calcGrade(r.intensity, median))
                    : null;
            } else if (periodMeta.enoughForGrade) {
                median = partialMedians.get(r.category) ?? null;
                if (median === null && r.baseItem?.median) {
                    median = r.baseItem.median * (periodMeta.days / 365);
                }
                grade = r.eligible ? calcGrade(r.intensity, median) : null;
                isPartialGrade = grade !== null;
            }

            return {
                b: r.b,
                category: r.category,
                mwh: r.mwh,
                hasData: r.hasData,
                byResource: r.byResource,
                eligible: r.eligible,
                excludes: r.excludes,
                intensity: r.intensity,
                median,
                grade,
                isPartialGrade
            };
        });

        const activeRows = rows.filter(r => r.hasData);

        const catMap = new Map();
        for (const r of rows) {
            if (!catMap.has(r.category)) catMap.set(r.category, []);
            catMap.get(r.category).push(r);
        }

        const groups = [...catMap.entries()]
            .map(([name, list]) => ({ name, count: list.length, ...summarize(list) }))
            .sort((a, b) => (b.total || 0) - (a.total || 0));

        return {
            empty: false,
            state,
            year,
            years,
            period,
            periodMeta,
            full,
            rows,
            activeRows,
            summary: summarize(rows),
            groups,
            energyNames: ENERGY_NAMES
        };
    }

    // Зведення базового рівня СЕнМ за 2025 рік у розрізі 112 суб'єктів ЄДРПОУ
    function getBaseline2025() {
        const state = A.importCore.getState();
        if (!state.periods?.['2025']) return null;

        const overview25 = getOverviewData('2025');
        const rows = overview25.rows || [];
        const bySubject = new Map();

        for (const r of rows) {
            const code = state.links?.[r.b.id] || '';
            if (!bySubject.has(code)) bySubject.set(code, []);
            bySubject.get(code).push(r);
        }

        const lines = [
            { label: 'Уся громада (разом)', isTotal: true, count: rows.length, ...summarize(rows) },
            ...[...bySubject.entries()]
                .map(([code, list]) => ({
                    label: code ? `${state.subjects?.[code] || 'Балансоутримувач'} · ЄДРПОУ ${code}` : 'Суб’єкт не визначений',
                    isTotal: false,
                    count: list.length,
                    ...summarize(list)
                }))
                .sort((a, b) => (b.total || 0) - (a.total || 0))
        ];

        return {
            subjectsCount: [...bySubject.keys()].filter(Boolean).length,
            buildingsCount: rows.length,
            lines,
            rows
        };
    }

    function downloadCsv(filename, rows) {
        const cell = v => `"${String(v ?? '').replaceAll('"', '""')}"`;
        const text = '\uFEFF' + rows.map(r => r.map(cell).join(',')).join('\r\n');
        const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    A.overviewCore = {
        getOverviewData,
        getBaseline2025,
        downloadCsv
    };
})(window.App);