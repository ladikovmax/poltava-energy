window.App = window.App || {};

(function (A) {
    'use strict';

    // Орієнтовні тарифи Полтавської ТГ (з ПДВ) у грн за 1 МВт·год:
    // Тепло: ~3 980 грн/Гкал (~3 422 грн/МВт·год), е/е: 14,77 грн/кВт·год, газ: 20,88 грн/м³ (~2 245 грн/МВт·год)
    const TARIFF_UAH_PER_MWH = [3422, 14770, 2245];
    const ENERGY_NAMES = ['Теплова енергія', 'Електроенергія', 'Природний газ'];

    const finite = v => typeof v === 'number' && Number.isFinite(v);

    // Орієнтовний бюджет у млн грн
    function estimateCostMln(amounts) {
        if (!Array.isArray(amounts)) return null;
        const totalUah = amounts.reduce((sum, mwh, i) => sum + (mwh || 0) * (TARIFF_UAH_PER_MWH[i] || 0), 0);
        return totalUah > 0 ? totalUah / 1e6 : null;
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
        return {
            amounts,
            counts,
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
        const full = !!period.full;
        const gasFactor = (finite(gasKwh) && gasKwh > 0 ? gasKwh : 9.3) / 1000;
        const factors = [1.163, 0.001, gasFactor];

        // Використовуємо базовий аналіз із passportCore для базового року або рахуємо для вибраного
        const baseAnalysis = A.passportCore.analyzeAll();
        const baseMap = new Map(baseAnalysis.items.map(x => [x.b.id, x]));

        const rows = state.buildings.map(b => {
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
            const excludes = [];
            if (!full) excludes.push('Неповний звітний період');
            if (!finite(b.area) || b.area <= 1.0) excludes.push('Фіктивна або відсутня площа (≤ 1,00 м²)');
            if (totalMwh === null || totalMwh <= 0) excludes.push(`Нульове споживання у ${year} р.`);

            const eligible = excludes.length === 0;
            const intensity = eligible ? (totalMwh * 1000) / b.area : null;

            return {
                b,
                category,
                mwh: totalMwh,
                byResource,
                eligible,
                excludes,
                intensity,
                median: full && baseItem ? baseItem.median : null,
                grade: full && baseItem?.gradeInfo ? baseItem.gradeInfo.grade : null
            };
        });

        // Групування за категоріями
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
            full,
            rows,
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