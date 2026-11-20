window.App = window.App || {};

(function (A) {
    'use strict';

    const RESOURCES = [
        { idx: 0, name: 'Теплова енергія', unit: 'Гкал', factorMwh: 1.163 },
        { idx: 1, name: 'Електроенергія', unit: 'кВт·год', factorMwh: 0.001 },
        { idx: 2, name: 'Природний газ', unit: 'м³', factorMwh: null }, // береться з getGas() / 1000
        { idx: 3, name: 'Холодна вода', unit: 'м³', factorMwh: 0 },
        { idx: 4, name: 'Гаряча вода', unit: 'м³', factorMwh: 0 }
    ];

    const CLASS_META = [
        { grade: 'A', max: 0.60, color: '#15803d', desc: 'Висока енергоефективність (орієнтир найкращих практик у громаді)' },
        { grade: 'B', max: 0.80, color: '#22c55e', desc: 'Добра енергоефективність (типово для термомодернізованих об’єктів)' },
        { grade: 'C', max: 0.95, color: '#84cc16', desc: 'Трохи краще за середній рівень по категорії' },
        { grade: 'D', max: 1.05, color: '#eab308', desc: 'Медіанний рівень категорії (базова норма по громаді)' },
        { grade: 'E', max: 1.20, color: '#f97316', desc: 'Підвищене споживання (потрібен операційний контроль режимів)' },
        { grade: 'F', max: 1.50, color: '#ef4444', desc: 'Високе споживання (кандидат на першочерговий енергоаудит)' },
        { grade: 'G', max: Infinity, color: '#991b1b', desc: 'Критичні перевитрати або прихована помилка в площі / лічильниках' }
    ];

    const finite = v => typeof v === 'number' && Number.isFinite(v);
    const norm = v => String(v ?? '').toLocaleLowerCase('uk').trim();

    // Виправлення відомих помилок класифікації (наприклад, ДЮКи у житловому фонді)
    function normalizeCategory(b) {
        const rawCat = String(b.category || '').trim();
        const nameLow = norm(b.name);
        const catLow = norm(rawCat);

        if (nameLow.includes('дюк') || nameLow.includes('дитячо-юнацький клуб') || catLow.includes('житлов')) {
            return 'Позашкільні заклади (ДЮК)';
        }
        return rawCat || 'Інші комунальні будівлі';
    }

    // Розрахунок базового рівня енергії за конкретний рік
    function calcYearEnergy(values, gasKwhPerM3) {
        if (!Array.isArray(values)) return { mwh: null, toe: null, byResource: [null, null, null, null, null] };

        const gasFactor = (finite(gasKwhPerM3) && gasKwhPerM3 > 0 ? gasKwhPerM3 : 9.3) / 1000;
        const factors = [1.163, 0.001, gasFactor, 0, 0];

        let totalMwh = 0;
        let hasEnergy = false;
        const byResource = values.map((val, idx) => {
            if (!finite(val) || val < 0) return null;
            if (idx <= 2) {
                const mwh = val * factors[idx];
                if (val > 0) hasEnergy = true;
                totalMwh += mwh;
                return mwh;
            }
            return 0; // вода не входить у тепловий/електричний баланс МВт·год
        });

        const mwh = hasEnergy ? totalMwh : (values.slice(0, 3).some(v => v === 0) ? 0 : null);
        return {
            mwh,
            toe: mwh !== null ? mwh * 0.086 : null,
            byResource
        };
    }

    // Медіана масиву чисел
    function median(nums) {
        if (!nums.length) return null;
        const sorted = [...nums].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    // Маскування серійного номера лічильника (без публікації повного номера)
    function maskMeterNumber(raw) {
        const s = String(raw ?? '').trim();
        if (!s || /^б\s*\/\s*н/i.test(s)) return 'б/н';
        if (s.length <= 4) return '••••';
        return '••••' + s.slice(-4);
    }

    // Повний аналіз усіх будівель за базовий 2025 рік
    function analyzeAll() {
        const state = A.importCore.getState();
        const gasKwh = A.importCore.getGas();
        const baseYear = state.periods?.['2025'] ? '2025' : Object.keys(state.periods || {}).sort()[0] || '2025';

        // 1. Первинний розрахунок по кожній будівлі
        const items = state.buildings.map(b => {
            const category = normalizeCategory(b);
            const y2025 = calcYearEnergy(b.years?.[baseYear], gasKwh);
            const excludes = [];

            if (!finite(b.area) || b.area <= 1.0) {
                excludes.push('Непридатна або фіктивна опалювана площа (≤ 1,00 м²)');
            }
            if (y2025.mwh === null || y2025.mwh <= 0) {
                excludes.push(`Нульове або відсутнє споживання енергії у ${baseYear} році`);
            }

            const eligible = excludes.length === 0;
            const intensity = eligible ? (y2025.mwh * 1000) / b.area : null;
            const byVolume = (eligible && finite(b.volume) && b.volume > 1) ? (y2025.mwh * 1000) / b.volume : null;

            return {
                b,
                category,
                baseYear,
                y2025,
                eligible,
                excludes,
                intensity,
                byVolume,
                median: null,
                peerCount: 0,
                ratio: null,
                gradeInfo: null
            };
        });

        // 2. Групування за категоріями та розрахунок медіани (M_кат)
        const byCat = new Map();
        for (const item of items) {
            if (!item.eligible) continue;
            if (!byCat.has(item.category)) byCat.set(item.category, []);
            byCat.get(item.category).push(item.intensity);
        }

        for (const item of items) {
            const peers = byCat.get(item.category) || [];
            item.peerCount = peers.length;
            if (!item.eligible || peers.length === 0) continue;

            const med = median(peers);
            item.median = med;

            if (med > 0 && peers.length >= 5) {
                const k = item.intensity / med;
                item.ratio = k;
                item.gradeInfo = CLASS_META.find(c => k <= c.max) || CLASS_META.at(-1);
            }
        }

        return { state, items, baseYear, gasKwh };
    }

    // Отримання детального паспорта для однієї будівлі (з урахуванням Ф-03 HDD)
    function getBuildingPassport(buildingId) {
        const { state, items, baseYear, gasKwh } = analyzeAll();
        if (!items.length) return null;

        const sorted = [...items].sort((a, b) => a.b.name.localeCompare(b.b.name, 'uk'));
        const target = sorted.find(x => x.b.id === String(buildingId))
            || sorted.find(x => x.eligible && x.gradeInfo)
            || sorted[0];

        const rawB = target.b;
        const years = Object.keys(state.periods || {}).sort();
        const edrpou = state.links?.[rawB.id] || '';
        const subjectName = edrpou ? (state.subjects?.[edrpou] || '') : '';

        const hddSummary = A.analyticsCore?.getHddSummary ? A.analyticsCore.getHddSummary() : null;
        const hddActive = Boolean(A.analyticsCore?.isHddMode && A.analyticsCore.isHddMode() && hddSummary && years.includes('2026'));

        // Підготовка копії будівлі з HDD-нормалізованим 2026 роком (без мутації сирого state)
        let b = rawB;
        if (hddActive && Array.isArray(rawB.years?.['2026'])) {
            const normArr = A.analyticsCore.getNormalizedResources(rawB, '2026', { forceHdd: true, hddSummary });
            const norm26 = rawB.years['2026'].map((orig, idx) =>
                (finite(orig) && orig >= 0) ? Math.round(normArr[idx] * 100) / 100 : orig
            );
            b = Object.assign({}, rawB, {
                rawYears: rawB.years,
                years: Object.assign({}, rawB.years, { '2026': norm26 })
            });
        }

        // Таблиця споживання по роках + виявлення аномалій 2026 року
        const yearlyData = {};
        for (const y of years) {
            yearlyData[y] = calcYearEnergy(b.years?.[y], gasKwh);
        }

        const anomalies2026 = [];
        if (years.includes('2025') && years.includes('2026')) {
            const v25 = b.years?.['2025'] || [];
            const v26 = b.years?.['2026'] || [];
            const jumpThreshold = hddActive ? 1.25 : 1.15;

            RESOURCES.forEach((res, i) => {
                const a = v25[i], c = v26[i];
                if (finite(a) && a > 0 && c === 0) {
                    anomalies2026.push(`Обнулення показників у 2026 році: ${res.name} (у 2025 було ${a} ${res.unit}).`);
                } else if (finite(a) && a > 0 && finite(c) && c > a * jumpThreshold) {
                    const pct = Math.round(((c - a) / a) * 100);
                    const modeNote = hddActive ? 'після кліматичної нормалізації (HDD)' : 'у неповному 2026 році';
                    anomalies2026.push(`Аномальний стрибок (+${pct}%) ${modeNote}: ${res.name} (${c} проти ${a} ${res.unit}).`);
                }
            });
        }

        // Реєстр вузлів обліку будівлі (D2-04) з маскуванням та перевіркою дефектів (ГВП у Гкал)
        const meters = [];
        for (const [mId, bId] of Object.entries(state.meterIndex || {})) {
            if (String(bId) !== String(b.id)) continue;
            const det = state.meterDetails?.[mId] || {};
            const resName = state.meterResources?.[mId] || 'Ресурс не вказано';
            const isGvpGcal = /гаряч/i.test(resName) && /гкал/i.test(resName);

            meters.push({
                id: mId,
                resource: resName,
                kind: det.kind || 'Комерційний',
                model: det.model || '—',
                maskedNumber: maskMeterNumber(det.number),
                hasDefect: isGvpGcal,
                defectNote: isGvpGcal ? 'Дефект обліку: ГВП заведено в Гкал замість м³' : ''
            });
        }

        return {
            building: b,
            list: sorted.map(x => ({ id: x.b.id, name: x.b.name, grade: x.gradeInfo?.grade || '' })),
            category: target.category,
            edrpou,
            subjectName,
            baseYear,
            gasKwh,
            hddActive,
            hddSummary,
            eligible: target.eligible,
            excludes: target.excludes,
            intensity: target.intensity,
            byVolume: target.byVolume,
            median: target.median,
            peerCount: target.peerCount,
            ratio: target.ratio,
            gradeInfo: target.gradeInfo,
            years,
            periods: state.periods,
            yearlyData,
            anomalies2026,
            meters,
            classScale: CLASS_META,
            resourcesMeta: RESOURCES
        };
    }

    A.passportCore = {
        getBuildingPassport,
        analyzeAll
    };
})(window.App);