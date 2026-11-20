window.App = window.App || {};

(function (A) {
    'use strict';

    const HDD_T_IN = 18.0;
    const HDD_T_THRESH = 8.0;
    const HDD_MODE_KEY = 'poltava_energy_hdd_mode_v1';

    // 4 будівлі з лічильниками ГВП у Гкал (D2-04: № 108, 531, 780, 991)
    const DHW_GCAL_BUILDING_IDS = new Set([9622, 9747, 9802, 9864]);

    // Єдина тарифна матриця Полтавської ТГ (бюджетні установи, з ПДВ)
    const TARIFFS = {
        '2025': {
            heat_gcal: 3270.00, // ПОКВПТГ «Полтаватеплоенерго», грн/Гкал
            elec_kwh: 9.80,     // ТОВ «Полтаваенергозбут» (УП, 2 клас), грн/кВт·год
            gas_m3: 20.21,      // Нафтогаз Трейдинг + АТ «Полтавагаз», грн/м³
            cold_m3: 67.49,     // КП ПОР «Полтававодоканал», грн/м³
            hot_m3: 215.00,     // ПОКВПТГ «Полтаватеплоенерго», грн/м³
            hot_gcal: 3270.00   // Для лічильників ГВП у Гкал
        },
        '2026': {
            heat_gcal: 3980.00, // ПОКВПТГ «Полтаватеплоенерго» (кінець 2026 р.), грн/Гкал
            elec_kwh: 14.77,    // УП 2 клас з 01.12.2026 (1 клас — 12,03 грн), грн/кВт·год
            gas_m3: 20.88,      // 17,05 ПСО + 3,83 розподіл з 01.04.2026, грн/м³
            cold_m3: 83.71,     // З 01.08.2026 (рішення облради № 1183), грн/м³
            hot_m3: 248.00,     // ПОКВПТГ «Полтаватеплоенерго», грн/м³
            hot_gcal: 3980.00   // Для лічильників ГВП у Гкал
        }
    };

    // Три базові сценарії бюджету 2027 (КЕКВ 2271–2274)
    const SCENARIOS_2027 = {
        optimistic: {
            id: 'optimistic',
            name: 'Нижня межа (Оптимістичний)',
            weatherHeatGasFactor: 0.92, // Тепла зима: -8% ГДОП
            volumeEconomyFactor: 0.92,  // Усунення перевитрат >25% + дахові СЕС (-8%)
            tariffs: {
                heat_gcal: 3980.00,
                elec_kwh: 14.77,
                gas_m3: 20.88,
                cold_m3: 83.71,
                hot_m3: 248.00,
                hot_gcal: 3980.00
            }
        },
        baseline: {
            id: 'baseline',
            name: 'Базова межа (Реалістичний)',
            weatherHeatGasFactor: 1.00, // Кліматична норма Полтави (5 років)
            volumeEconomyFactor: 1.00,  // Інерційне споживання (0%)
            tariffs: {
                heat_gcal: 4378.00, // +10% індексація після 31.03.2027
                elec_kwh: 14.77,    // Повнорічний ефект грудневого тарифу 2026 р.
                gas_m3: 22.97,      // +10% індексація після 31.03.2027
                cold_m3: 83.71,     // Повнорічний ефект серпневого тарифу 2026 р.
                hot_m3: 272.80,     // +10% індексація після 31.03.2027
                hot_gcal: 4378.00
            }
        },
        stress: {
            id: 'stress',
            name: 'Верхня межа (Стрес-сценарій)',
            weatherHeatGasFactor: 1.12, // Холодна зима: +12% ГДОП
            volumeEconomyFactor: 1.02,  // Без впровадження заходів економії (+2%)
            tariffs: {
                heat_gcal: 4855.60, // +22% до рівня кінця 2026 р.
                elec_kwh: 18.02,    // +22% до рівня кінця 2026 р.
                gas_m3: 26.00,      // Ринкова ціна газу після закінчення ПСО (~26 грн/м³)
                cold_m3: 92.08,     // +10% коригування водоканалу
                hot_m3: 302.56,     // +22% до рівня кінця 2026 р.
                hot_gcal: 4855.60
            }
        }
    };

    const RESOURCE_LABELS = [
        'Теплова енергія',
        'Електроенергія',
        'Природний газ',
        'Холодна вода та стоки',
        'Гаряча вода (ГВП)'
    ];

    const RESOURCE_UNITS = ['Гкал', 'кВт·год', 'м³', 'м³', 'м³'];

    function num(v) {
        return typeof v === 'number' && Number.isFinite(v) ? v : 0;
    }

    function median(values) {
        const arr = values.filter(v => typeof v === 'number' && Number.isFinite(v) && v > 0).sort((a, b) => a - b);
        if (!arr.length) return null;
        const mid = Math.floor(arr.length / 2);
        return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
    }

    function fmtNum(v, p = 1) {
        return (typeof v === 'number' && Number.isFinite(v))
            ? new Intl.NumberFormat('uk-UA', { maximumFractionDigits: p }).format(v)
            : '—';
    }

    /* =========================================================================
       Ф-03. Погодне коригування HDD (ГДОП)
       ========================================================================= */
    function isHddMode() {
        try {
            return sessionStorage.getItem(HDD_MODE_KEY) === '1';
        } catch (e) {
            return false;
        }
    }

    function setHddMode(enabled) {
        try {
            sessionStorage.setItem(HDD_MODE_KEY, enabled ? '1' : '0');
        } catch (e) {
            // Ігноруємо помилку сховища
        }
        return isHddMode();
    }

    function calcHddForRange(startDate, endDate) {
        const daily = A.WEATHER_POLTAVA?.daily || {};
        let hdd = 0;
        let days = 0;
        let heatingDays = 0;

        for (const dateStr of Object.keys(daily)) {
            if (dateStr >= startDate && dateStr <= endDate) {
                const t = daily[dateStr];
                if (typeof t === 'number' && Number.isFinite(t)) {
                    days++;
                    if (t <= HDD_T_THRESH) {
                        heatingDays++;
                        hdd += (HDD_T_IN - t);
                    }
                }
            }
        }
        return {
            hdd: Math.round(hdd * 10) / 10,
            days,
            heatingDays
        };
    }

    function parseIsoDate(raw, fallback) {
        const s = String(raw || '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
        if (m) return `${m[3]}-${m[2]}-${m[1]}`;
        return fallback;
    }

    function getHddSummary(customAsOf2026) {
        const state = A.importCore?.getState ? A.importCore.getState() : null;
        const rawAsOf = customAsOf2026 || state?.periods?.['2026']?.asOf || '2026-11-11';
        const asOf2026 = parseIsoDate(rawAsOf, '2026-11-11');
        const mmdd = asOf2026.slice(5); // '11-11'
        const asOf2025Comp = `2025-${mmdd}`;

        const full2025 = calcHddForRange('2025-01-01', '2025-12-31');
        const comp2025 = calcHddForRange('2025-01-01', asOf2025Comp);
        const part2026 = calcHddForRange('2026-01-01', asOf2026);

        const diffPct = comp2025.hdd > 0
            ? ((part2026.hdd - comp2025.hdd) / comp2025.hdd) * 100
            : 0;

        const scaleToFull2025 = part2026.hdd > 0
            ? full2025.hdd / part2026.hdd
            : 1;

        const absDiff = Math.abs(diffPct);
        const toneWord = diffPct < -0.1 ? "м'якший" : (diffPct > 0.1 ? 'холодніший' : 'ідентичний');
        const badgeText = `Період 2026 р. на ${fmtNum(absDiff, 1)}% ${toneWord} за 2025 р. за ГДОП`;

        return {
            asOf2026,
            hdd2025Full: full2025.hdd,
            hdd2025Comparable: comp2025.hdd,
            hdd2026Actual: part2026.hdd,
            diffPct: Math.round(diffPct * 10) / 10,
            scaleToFull2025,
            badgeText
        };
    }

    /**
     * Повертає масив з 5 ресурсів будівлі [тепло_Гкал, е/е_кВт·год, газ_м3, хв_м3, гвп_м3_або_Гкал]
     * із застосуванням HDD-нормалізації (якщо увімкнено глобально або передано forceHdd: true).
     */
    function getNormalizedResources(building, year, options = {}) {
        const raw = building?.years?.[String(year)] || [];
        const vals = [num(raw[0]), num(raw[1]), num(raw[2]), num(raw[3]), num(raw[4])];
        const useHdd = options.forceHdd !== undefined ? Boolean(options.forceHdd) : isHddMode();

        if (!useHdd || String(year) !== '2026') {
            return vals;
        }

        const summary = options.hddSummary || getHddSummary();
        const k = summary.scaleToFull2025;
        const baseShare = options.includeBaseLoad10 ? 0.10 : 0.0;

        // Коригуються лише погодозалежні ресурси: тепло [0] та природний газ [2]
        vals[0] = vals[0] * k;
        vals[2] = (vals[2] * baseShare) + (vals[2] * (1 - baseShare) * k);
        return vals;
    }

    /* =========================================================================
       Тарифні утиліти Полтавської громади
       ========================================================================= */
    function isDhwInGcal(building, state) {
        const bId = Number(building?.id);
        if (DHW_GCAL_BUILDING_IDS.has(bId)) return true;
        const meters = state?.meters || [];
        return meters.some(m =>
            Number(m.buildingId ?? m.building_id ?? m.id) === bId &&
            /гаряч|гвп/i.test(String(m.resource || m.type || '')) &&
            /гкал|gcal/i.test(String(m.unit || m.measure || ''))
        );
    }

    function getTariffs(tariffYear = '2026') {
        return TARIFFS[String(tariffYear)] || TARIFFS['2026'];
    }

    // Повертає тарифи у грн/МВт·год для [Тепло, Електрика, Газ] — сумісно з overview-core.js
    function getMwhTariffs(tariffYear = '2026') {
        const t = getTariffs(tariffYear);
        const gasKwhPerM3 = A.importCore?.getGas ? A.importCore.getGas() : 9.3;
        return [
            t.heat_gcal / 1.163,
            t.elec_kwh * 1000,
            t.gas_m3 * (1000 / gasKwhPerM3)
        ];
    }

    function calcResourceCostUah(resIndex, volume, building, tariffSet, state) {
        const v = num(volume);
        if (v <= 0) return 0;
        const t = tariffSet || getTariffs('2026');
        switch (resIndex) {
            case 0: return v * t.heat_gcal;
            case 1: return v * t.elec_kwh;
            case 2: return v * t.gas_m3;
            case 3: return v * t.cold_m3;
            case 4: return v * (isDhwInGcal(building, state) ? t.hot_gcal : t.hot_m3);
            default: return 0;
        }
    }

    function calcBuildingCostUah(resources5, building, tariffSet, state) {
        let sum = 0;
        for (let i = 0; i < 5; i++) {
            sum += calcResourceCostUah(i, resources5[i], building, tariffSet, state);
        }
        return sum;
    }

    /* =========================================================================
       Ф-04. Детектор аномалій та фінансових втрат
       ========================================================================= */
    function detectAnomalies(customBuildings) {
        const state = A.importCore?.getState ? A.importCore.getState() : { buildings: [] };
        const buildings = customBuildings || state.buildings || [];
        const hddSummary = getHddSummary();
        const tariffs2026 = getTariffs('2026');
        const gasKwh = A.importCore?.getGas ? A.importCore.getGas() : 9.3;
        const mwhFactors = [1.163, 0.001, gasKwh / 1000];

        // 1. Обчислення медіан по функціональних категоріях (на очищеній HDD-базі 2026 або 2025)
        const catIntensities = {};
        const buildingProfiles = buildings.map(b => {
            const r25 = getNormalizedResources(b, '2025', { forceHdd: false });
            const r26Hdd = getNormalizedResources(b, '2026', { forceHdd: true, hddSummary });

            const sum25 = r25.reduce((acc, v) => acc + v, 0);
            const sum26 = r26Hdd.reduce((acc, v) => acc + v, 0);

            // Для питомого енергоспоживання (кВт·год/м²) беремо тепло + е/е + газ
            const mwh26 = r26Hdd[0] * mwhFactors[0] + r26Hdd[1] * mwhFactors[1] + r26Hdd[2] * mwhFactors[2];
            const mwh25 = r25[0] * mwhFactors[0] + r25[1] * mwhFactors[1] + r25[2] * mwhFactors[2];
            const refMwh = mwh26 > 0 ? mwh26 : mwh25;
            const validArea = typeof b.area === 'number' && b.area > 10;
            const intensity = validArea && refMwh > 0 ? (refMwh * 1000) / b.area : null;
            const cat = b.category || 'Інші споруди';

            if (intensity !== null) {
                catIntensities[cat] = catIntensities[cat] || [];
                catIntensities[cat].push(intensity);
            }

            return { b, cat, r25, r26Hdd, sum25, sum26, validArea, intensity, mwh25, mwh26 };
        });

        const categoryMedians = {};
        for (const [cat, list] of Object.entries(catIntensities)) {
            categoryMedians[cat] = median(list);
        }

        const defects = [];
        const buildingLossMap = new Map();

        let realOperationalLossUah = 0;
        let benchmarkPotentialUah = 0;
        let virtualDataErrorUah = 0;
        let operationalCount = 0;
        let dataErrorCount = 0;
        let zeroDropCount = 0;
        let benchmarkExcessCount = 0;

        function ensureBuildingLoss(b, cat) {
            if (!buildingLossMap.has(b.id)) {
                buildingLossMap.set(b.id, {
                    building: b,
                    category: cat,
                    operationalLossUah: 0,
                    benchmarkSavingsUah: 0,
                    virtualErrorUah: 0,
                    totalRealLossUah: 0,
                    reasons: []
                });
            }
            return buildingLossMap.get(b.id);
        }

        for (const p of buildingProfiles) {
            const { b, cat, r25, r26Hdd, sum25, sum26, validArea, intensity } = p;

            // Дефект площі реєстру (наприклад, 9 об'єктів із площею 1,00 м²)
            if (!validArea && (sum25 > 0 || sum26 > 0)) {
                defects.push({
                    buildingId: b.id,
                    buildingName: b.name,
                    address: b.address || '',
                    category: cat,
                    bucket: 'registry_defect',
                    severity: 'medium',
                    resource: 'Опалювана площа',
                    unit: 'м²',
                    val2025: b.area ?? 0,
                    val2026Hdd: b.area ?? 0,
                    changePct: null,
                    lossUah: 0,
                    diagnosis: 'Фіктивна або відсутня опалювана площа (≤ 10 м²)'
                });
            }

            // Повне зникнення даних по об'єкту у 2026 р. проти непорожнього 2025 р.
            if (sum25 > 0 && sum26 === 0) {
                zeroDropCount++;
                const missedCost25 = calcBuildingCostUah(r25, b, tariffs2026, state);
                defects.push({
                    buildingId: b.id,
                    buildingName: b.name,
                    address: b.address || '',
                    category: cat,
                    bucket: 'zero_drop',
                    severity: 'high',
                    resource: 'Усі ресурси',
                    unit: '—',
                    val2025: Math.round(sum25 * 10) / 10,
                    val2026Hdd: 0,
                    changePct: -100,
                    lossUah: Math.round(missedCost25),
                    diagnosis: 'Зникнення даних (-100%): у 2026 р. подано нулі проти активного 2025 р.'
                });
                continue;
            }

            // Перевірка кожного з 5 ресурсів на міжрічні стрибки
            for (let i = 0; i < 5; i++) {
                const v25 = r25[i];
                const v26 = r26Hdd[i];
                const unit = (i === 4 && isDhwInGcal(b, state)) ? 'Гкал' : RESOURCE_UNITS[i];

                if (v25 > 0 && v26 === 0) {
                    zeroDropCount++;
                    const missedUah = calcResourceCostUah(i, v25, b, tariffs2026, state);
                    defects.push({
                        buildingId: b.id,
                        buildingName: b.name,
                        address: b.address || '',
                        category: cat,
                        bucket: 'zero_drop',
                        severity: 'medium',
                        resource: RESOURCE_LABELS[i],
                        unit,
                        val2025: Math.round(v25 * 10) / 10,
                        val2026Hdd: 0,
                        changePct: -100,
                        lossUah: Math.round(missedUah),
                        diagnosis: `Обнулення показників (-100%) по ресурсу «${RESOURCE_LABELS[i]}»`
                    });
                    continue;
                }

                if (v25 > 0 && v26 > v25) {
                    const pct = ((v26 - v25) / v25) * 100;
                    const deltaV = v26 - v25;
                    const deltaUah = calcResourceCostUah(i, deltaV, b, tariffs2026, state);

                    if (pct > 100) {
                        // Критичний викид / дефект обліку (> +100%) — не змішуємо з реальною економією
                        dataErrorCount++;
                        virtualDataErrorUah += deltaUah;
                        const entry = ensureBuildingLoss(b, cat);
                        entry.virtualErrorUah += deltaUah;

                        const mult = (v26 / v25).toFixed(1);
                        defects.push({
                            buildingId: b.id,
                            buildingName: b.name,
                            address: b.address || '',
                            category: cat,
                            bucket: 'data_error',
                            severity: 'critical',
                            resource: RESOURCE_LABELS[i],
                            unit,
                            val2025: Math.round(v25 * 10) / 10,
                            val2026Hdd: Math.round(v26 * 10) / 10,
                            changePct: Math.round(pct * 10) / 10,
                            lossUah: Math.round(deltaUah),
                            diagnosis: `Підозра на помилку розрядності або аварію лічильника (×${mult}, +${fmtNum(pct, 0)}%)`
                        });
                    } else if (pct > 25) {
                        // Операційна перевитрата (+25% ... +100%)
                        operationalCount++;
                        realOperationalLossUah += deltaUah;
                        const entry = ensureBuildingLoss(b, cat);
                        entry.operationalLossUah += deltaUah;
                        entry.totalRealLossUah += deltaUah;
                        entry.reasons.push(`${RESOURCE_LABELS[i]} +${fmtNum(pct, 0)}%`);

                        defects.push({
                            buildingId: b.id,
                            buildingName: b.name,
                            address: b.address || '',
                            category: cat,
                            bucket: 'operational',
                            severity: 'high',
                            resource: RESOURCE_LABELS[i],
                            unit,
                            val2025: Math.round(v25 * 10) / 10,
                            val2026Hdd: Math.round(v26 * 10) / 10,
                            changePct: Math.round(pct * 10) / 10,
                            lossUah: Math.round(deltaUah),
                            diagnosis: `Операційна перевитрата (+${fmtNum(pct, 1)}%) — об'єкт для енергоаудиту`
                        });
                    }
                }
            }

            // Критерій 2: Бенчмарк-потенціал (перевищення медіани категорії M_кат)
            const catMed = categoryMedians[cat];
            if (validArea && intensity !== null && catMed && intensity > catMed) {
                const excessKwh = (intensity - catMed) * b.area;
                const excessMwh = excessKwh / 1000;
                const baseRes = p.mwh26 > 0 ? r26Hdd : r25;
                const baseMwh = p.mwh26 > 0 ? p.mwh26 : p.mwh25;

                // Пропорційна монетизація надлишку за структурою паливно-енергетичного балансу будівлі
                let potUah = 0;
                if (baseMwh > 0) {
                    const ratio = Math.min(0.85, excessMwh / baseMwh); // обмежуємо вплив можливих викидів
                    for (let j = 0; j < 3; j++) {
                        potUah += calcResourceCostUah(j, baseRes[j] * ratio, b, tariffs2026, state);
                    }
                }

                if (potUah > 1000) {
                    benchmarkExcessCount++;
                    benchmarkPotentialUah += potUah;
                    const entry = ensureBuildingLoss(b, cat);
                    entry.benchmarkSavingsUah += potUah;
                    entry.totalRealLossUah += potUah;
                    entry.reasons.push(`Понад медіану групи (${fmtNum(intensity, 0)} проти ${fmtNum(catMed, 0)} кВт·год/м²)`);
                }
            }
        }

        const top15Losses = Array.from(buildingLossMap.values())
            .filter(item => item.totalRealLossUah > 0)
            .sort((a, b) => b.totalRealLossUah - a.totalRealLossUah)
            .slice(0, 15);

        defects.sort((a, b) => (b.lossUah || 0) - (a.lossUah || 0));

        return {
            hddSummary,
            categoryMedians,
            summary: {
                realOperationalLossUah: Math.round(realOperationalLossUah),
                benchmarkPotentialUah: Math.round(benchmarkPotentialUah),
                totalRealSavingsUah: Math.round(realOperationalLossUah + benchmarkPotentialUah),
                virtualDataErrorUah: Math.round(virtualDataErrorUah),
                operationalCount,
                dataErrorCount,
                zeroDropCount,
                benchmarkExcessCount,
                totalDefectsCount: defects.length
            },
            top15Losses,
            defects
        };
    }

    function exportDefectsCsv(anomalyResult) {
        const res = anomalyResult || detectAnomalies();
        const rows = [
            ['ID будівлі', 'Будівля', 'Адреса', 'Категорія', 'Тип кошика', 'Ресурс', 'Од. виміру', 'Факт 2025', '2026 (HDD-прив.)', 'Відхилення, %', 'Оцінка впливу, грн', 'Діагноз'],
            ...res.defects.map(d => [
                d.buildingId,
                d.buildingName,
                d.address,
                d.category,
                d.bucket === 'data_error' ? 'Помилка даних (>100%)' :
                    d.bucket === 'operational' ? 'Операційна перевитрата' :
                    d.bucket === 'zero_drop' ? 'Зникнення даних (-100%)' : 'Дефект реєстру',
                d.resource,
                d.unit,
                d.val2025,
                d.val2026Hdd,
                d.changePct !== null ? d.changePct : '',
                d.lossUah,
                d.diagnosis
            ])
        ];

        const csvContent = '\uFEFF' + rows
            .map(r => r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';'))
            .join('\r\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'data-defects.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /* =========================================================================
       Ф-05. Інтервальний прогноз бюджету 2027 (нижня — базова — верхня межа)
       ========================================================================= */
    function buildCleanBaselineMap(buildings, hddSummary) {
        // Очищена база V_{i,r}^{баз}: HDD-нормалізований 2026 без критичних викидів (>+100%)
        // або перевірений 2025 рік, якщо у 2026 зафіксовано викид чи зникнення даних.
        return buildings.map(b => {
            const r25 = getNormalizedResources(b, '2025', { forceHdd: false });
            const r26Hdd = getNormalizedResources(b, '2026', { forceHdd: true, hddSummary });
            const clean = [0, 0, 0, 0, 0];

            for (let i = 0; i < 5; i++) {
                const v25 = r25[i];
                const v26 = r26Hdd[i];
                if (v26 > 0) {
                    const isSpike = v25 > 0 && ((v26 - v25) / v25) > 1.0;
                    clean[i] = isSpike ? v25 : v26;
                } else {
                    clean[i] = v25;
                }
            }
            return { b, clean };
        });
    }

    function runSingleScenario(cleanList, scenarioConfig, state, anomalyResult) {
        const t = scenarioConfig.tariffs;
        const wFactor = scenarioConfig.weatherHeatGasFactor;
        const eFactor = scenarioConfig.volumeEconomyFactor;
        const fixAnomalies = Boolean(scenarioConfig.fixAnomaliesF04);

        const resTotalsUah = [0, 0, 0, 0, 0];
        const resTotalsPhys = [0, 0, 0, 0, 0];
        const catTotalsUah = {};

        for (const { b, clean } of cleanList) {
            const cat = b.category || 'Інші споруди';
            catTotalsUah[cat] = catTotalsUah[cat] || { category: cat, count: 0, totalUah: 0, resourcesUah: [0, 0, 0, 0, 0] };
            catTotalsUah[cat].count++;

            for (let i = 0; i < 5; i++) {
                const isWeatherDep = (i === 0 || i === 2);
                const phys = clean[i] * (isWeatherDep ? wFactor : 1.0) * eFactor;
                const cost = calcResourceCostUah(i, phys, b, t, state);

                resTotalsPhys[i] += phys;
                resTotalsUah[i] += cost;
                catTotalsUah[cat].totalUah += cost;
                catTotalsUah[cat].resourcesUah[i] += cost;
            }
        }

        let grossUah = resTotalsUah.reduce((a, b) => a + b, 0);
        let savingsDeductionUah = 0;

        if (fixAnomalies && anomalyResult?.summary?.totalRealSavingsUah) {
            savingsDeductionUah = anomalyResult.summary.totalRealSavingsUah;
            grossUah = Math.max(0, grossUah - savingsDeductionUah);
        }

        return {
            id: scenarioConfig.id,
            name: scenarioConfig.name,
            totalUah: Math.round(grossUah),
            totalMln: Math.round((grossUah / 1e6) * 100) / 100,
            savingsDeductionUah: Math.round(savingsDeductionUah),
            resourcesUah: resTotalsUah.map(v => Math.round(v)),
            resourcesPhys: resTotalsPhys.map(v => Math.round(v * 10) / 10),
            categories: Object.values(catTotalsUah).sort((a, b) => b.totalUah - a.totalUah)
        };
    }

    function simulateBudget2027(customOverrides = null) {
        const state = A.importCore?.getState ? A.importCore.getState() : { buildings: [] };
        const buildings = state.buildings || [];
        const hddSummary = getHddSummary();
        const cleanList = buildCleanBaselineMap(buildings, hddSummary);
        const anomalyResult = detectAnomalies(buildings);

        const optimistic = runSingleScenario(cleanList, SCENARIOS_2027.optimistic, state, anomalyResult);
        const baseline = runSingleScenario(cleanList, SCENARIOS_2027.baseline, state, anomalyResult);
        const stress = runSingleScenario(cleanList, SCENARIOS_2027.stress, state, anomalyResult);

        let active = baseline;
        if (customOverrides) {
            const baseT = SCENARIOS_2027.baseline.tariffs;
            const mult = pct => 1 + (num(pct) / 100);
            const customConfig = {
                id: 'custom',
                name: 'Користувацький сценарій',
                weatherHeatGasFactor: mult(customOverrides.weatherPct || 0),
                volumeEconomyFactor: mult(customOverrides.economyPct || 0),
                fixAnomaliesF04: Boolean(customOverrides.fixAnomaliesF04),
                tariffs: {
                    heat_gcal: baseT.heat_gcal * mult(customOverrides.heatTariffPct || 0),
                    elec_kwh: baseT.elec_kwh * mult(customOverrides.elecTariffPct || 0),
                    gas_m3: baseT.gas_m3 * mult(customOverrides.gasTariffPct || 0),
                    cold_m3: baseT.cold_m3 * mult(customOverrides.waterTariffPct || 0),
                    hot_m3: baseT.hot_m3 * mult(customOverrides.waterTariffPct || 0),
                    hot_gcal: baseT.hot_gcal * mult(customOverrides.heatTariffPct || 0)
                }
            };
            active = runSingleScenario(cleanList, customConfig, state, anomalyResult);
        }

        return {
            corridor: {
                lowMln: optimistic.totalMln,
                baseMln: baseline.totalMln,
                highMln: stress.totalMln,
                activeMln: active.totalMln
            },
            scenarios: { optimistic, baseline, stress },
            active,
            dksuMeta: {
                budgetCode: '1657010000',
                kekvCodes: ['2271 (Водопостачання/водовідведення)', '2272 (Електроенергія)', '2273 (Природний газ)', '2274 (Інші енергоносії)'],
                subjectsCount: Object.keys(state.subjects || {}).length || 112
            }
        };
    }

    A.analyticsCore = {
        TARIFFS,
        SCENARIOS_2027,
        RESOURCE_LABELS,
        RESOURCE_UNITS,
        isHddMode,
        setHddMode,
        calcHddForRange,
        getHddSummary,
        getNormalizedResources,
        isDhwInGcal,
        getTariffs,
        getMwhTariffs,
        calcBuildingCostUah,
        detectAnomalies,
        exportDefectsCsv,
        simulateBudget2027
    };
})(window.App);