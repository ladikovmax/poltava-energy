window.App = window.App || {};
window.App.pages = window.App.pages || {};

(function (A) {
    'use strict';

    const uiState = {
        hddNormalized: true,
        includeBaseLoad10: false,
        defectFilter: 'all', // 'all' | 'operational' | 'data_error' | 'zero_drop'
        preset: 'baseline',  // 'optimistic' | 'baseline' | 'stress' | 'custom'
        sliders: {
            weatherPct: 0,
            economyPct: 0,
            heatTariffPct: 0,
            elecTariffPct: 0,
            gasTariffPct: 0,
            waterTariffPct: 0,
            fixAnomaliesF04: false
        }
    };

    const PRESET_SLIDERS = {
        optimistic: {
            weatherPct: -8,
            economyPct: -8,
            heatTariffPct: -9,   // фіксація ставок кінця 2026 р. (3980 проти 4378)
            elecTariffPct: 0,
            gasTariffPct: -9,    // фіксація 20,88 проти 22,97
            waterTariffPct: 0,
            fixAnomaliesF04: true
        },
        baseline: {
            weatherPct: 0,
            economyPct: 0,
            heatTariffPct: 0,
            elecTariffPct: 0,
            gasTariffPct: 0,
            waterTariffPct: 0,
            fixAnomaliesF04: false
        },
        stress: {
            weatherPct: 12,
            economyPct: 2,
            heatTariffPct: 11,   // +22% до кінця 2026 р. (~4856 грн/Гкал)
            elecTariffPct: 22,   // +22% (~18,02 грн/кВт·год)
            gasTariffPct: 13,    // ринкова ціна ~26 грн/м³
            waterTariffPct: 10,
            fixAnomaliesF04: false
        }
    };

    function esc(s) {
        return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function fmt(v, p = 0) {
        return (typeof v === 'number' && Number.isFinite(v))
            ? new Intl.NumberFormat('uk-UA', { maximumFractionDigits: p }).format(v)
            : '—';
    }

    function fmtMln(uah) {
        if (typeof uah !== 'number' || !Number.isFinite(uah)) return '—';
        return fmt(uah / 1e6, 2) + ' млн грн';
    }

    function showToast(msg) {
        const $t = $('#toast');
        if (!$t.length) return;
        $t.text(msg);
        clearTimeout($t.data('timer'));
        $t.data('timer', setTimeout(() => $t.empty(), 2600));
    }

    function computeHddTableData(state, core) {
        const buildings = state.buildings || [];
        const hdd = core.getHddSummary();
        const t25 = core.getTariffs('2025');
        const t26 = core.getTariffs('2026');

        const totals25 = [0, 0, 0, 0, 0];
        const totals26Raw = [0, 0, 0, 0, 0];
        const totals26Norm = [0, 0, 0, 0, 0];

        let cost25Uah = 0;
        let cost26RawUah = 0;
        let cost26NormUah = 0;

        for (const b of buildings) {
            const r25 = core.getNormalizedResources(b, '2025', { forceHdd: false });
            const r26r = core.getNormalizedResources(b, '2026', { forceHdd: false });
            const r26n = core.getNormalizedResources(b, '2026', {
                forceHdd: true,
                includeBaseLoad10: uiState.includeBaseLoad10,
                hddSummary: hdd
            });

            for (let i = 0; i < 5; i++) {
                totals25[i] += r25[i];
                totals26Raw[i] += r26r[i];
                totals26Norm[i] += r26n[i];
            }

            cost25Uah += core.calcBuildingCostUah(r25, b, t25, state);
            cost26RawUah += core.calcBuildingCostUah(r26r, b, t26, state);
            cost26NormUah += core.calcBuildingCostUah(r26n, b, t26, state);
        }

        return {
            hdd,
            totals25,
            totals26Raw,
            totals26Norm,
            cost25Uah,
            cost26RawUah,
            cost26NormUah
        };
    }

    function renderAnalytics($main) {
        const core = A.analyticsCore;
        const state = A.importCore?.getState ? A.importCore.getState() : { buildings: [] };
        const buildings = state.buildings || [];

        if (!core || !buildings.length) {
            $main.html(`
                <section class="panel" style="padding:28px;">
                    <h1 style="margin-top:0;">Аналітика, аномалії та бюджет 2027</h1>
                    <p style="color:var(--muted);">Дані будівель ще не завантажені. Імпортуйте звіти D2-02 / D2-03 на вкладці «Імпорт».</p>
                    <a href="#import" class="btn" style="display:inline-block;margin-top:8px;padding:10px 18px;background:var(--green);color:#fff;border-radius:10px;text-decoration:none;font-weight:600;">Перейти до імпорту</a>
                </section>
            `);
            return;
        }

        const hddData = computeHddTableData(state, core);
        const hdd = hddData.hdd;
        const anomalies = core.detectAnomalies(buildings);
        const budget = core.simulateBudget2027(uiState.sliders);

        const active26Totals = uiState.hddNormalized ? hddData.totals26Norm : hddData.totals26Raw;
        const active26Cost = uiState.hddNormalized ? hddData.cost26NormUah : hddData.cost26RawUah;

        // Позиція активного сценарію на шкалі коридору [lowMln .. highMln]
        const span = Math.max(0.01, budget.corridor.highMln - budget.corridor.lowMln);
        const markerPct = Math.max(0, Math.min(100, ((budget.corridor.activeMln - budget.corridor.lowMln) / span) * 100));
        const baseMarkerPct = Math.max(0, Math.min(100, ((budget.corridor.baseMln - budget.corridor.lowMln) / span) * 100));

        const filteredDefects = anomalies.defects.filter(d => {
            if (uiState.defectFilter === 'all') return true;
            return d.bucket === uiState.defectFilter;
        });

        const html = `
            <div style="display:flex;flex-direction:column;gap:22px;padding-bottom:32px;">
                <header>
                    <h1 style="margin:0 0 6px;font-size:clamp(1.6rem,3vw,2.2rem);color:var(--ink);">Аналітика, аномалії та прогноз бюджету 2027</h1>
                    <p style="margin:0;color:var(--muted);">Єдиний розрахунковий конвеєр Полтавської ТГ: погодне коригування ГДОП (Ф-03), монетизація перевитрат (Ф-04) та планування КЕКВ 2271–2274 (Ф-05).</p>
                </header>

                <!-- =========================================================
                     Ф-03. ПОГОДНЕ КОРИГУВАННЯ HDD (ГДОП)
                     ========================================================= -->
                <section class="panel" style="padding:22px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);">
                    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:16px;">
                        <div>
                            <span style="display:inline-block;font-size:.78rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--green);background:#e6f2ec;padding:3px 9px;border-radius:999px;margin-bottom:6px;">Модуль Ф-03 · Метеонормалізація</span>
                            <h2 style="margin:0 0 4px;font-size:1.3rem;color:var(--ink);">Погодне коригування HDD (ГДОП) для порівняння 2025 і 2026 років</h2>
                            <p style="margin:0;font-size:.92rem;color:var(--muted);">Приведення неповного періоду 2026 р. (до ${esc(hdd.asOf2026)}) до повного кліматичного року за градусо-днями опалювального періоду ($T_{\\text{вн}} = 18\\,^\\circ\\text{C}$, $T_{\\text{пор}} = 8\\,^\\circ\\text{C}$).</p>
                        </div>

                        <div role="group" aria-label="Режим відображення 2026 року" style="display:inline-flex;background:var(--paper);padding:4px;border-radius:11px;border:1px solid var(--line);gap:4px;">
                            <button type="button" data-f03-mode="0" style="border:0;border-radius:8px;padding:8px 14px;font:inherit;font-size:.88rem;font-weight:600;cursor:pointer;background:${!uiState.hddNormalized ? 'var(--green)' : 'transparent'};color:${!uiState.hddNormalized ? '#fff' : 'var(--text)'};">Факт (сирі дані)</button>
                            <button type="button" data-f03-mode="1" style="border:0;border-radius:8px;padding:8px 14px;font:inherit;font-size:.88rem;font-weight:600;cursor:pointer;background:${uiState.hddNormalized ? 'var(--green)' : 'transparent'};color:${uiState.hddNormalized ? '#fff' : 'var(--text)'};">Кліматична нормалізація (HDD)</button>
                        </div>
                    </div>

                    <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;background:var(--paper);border:1px solid var(--line);border-radius:12px;margin-bottom:16px;">
                        <div style="font-size:.9rem;color:var(--text);">
                            <strong>ГДОП Полтави:</strong>
                            2025 р. (до 11.11) — <strong>${fmt(hdd.hdd2025Comparable, 1)}</strong> ·
                            2025 р. (повний рік) — <strong>${fmt(hdd.hdd2025Full, 1)}</strong> ·
                            2026 р. (до 11.11) — <strong>${fmt(hdd.hdd2026Actual, 1)}</strong> ·
                            <span style="color:var(--green);font-weight:700;">${esc(hdd.badgeText)}</span>
                        </div>
                        <label style="display:inline-flex;align-items:center;gap:7px;font-size:.86rem;color:var(--text);cursor:pointer;user-select:none;">
                            <input type="checkbox" id="f03-baseload" ${uiState.includeBaseLoad10 ? 'checked' : ''} style="accent-color:var(--green);width:16px;height:16px;">
                            Виділити 10% цілорічного базового навантаження газу (ГВП / харчоблоки)
                        </label>
                    </div>

                    <div style="overflow-x:auto;">
                        <table style="width:100%;border-collapse:collapse;font-size:.9rem;">
                            <thead>
                                <tr style="border-bottom:2px solid var(--line);text-align:left;color:var(--muted);">
                                    <th style="padding:10px 8px;">Енергоресурс / Вода</th>
                                    <th style="padding:10px 8px;">Коригування</th>
                                    <th style="padding:10px 8px;text-align:right;">Факт 2025 (повний рік)</th>
                                    <th style="padding:10px 8px;text-align:right;">${uiState.hddNormalized ? '2026 (HDD-приведений рік)' : 'Факт 2026 (до 11.11)'}</th>
                                    <th style="padding:10px 8px;text-align:right;">Динаміка, %</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${core.RESOURCE_LABELS.map((label, idx) => {
                                    const v25 = hddData.totals25[idx];
                                    const v26 = active26Totals[idx];
                                    const isWeather = idx === 0 || idx === 2;
                                    const diff = v25 > 0 ? ((v26 - v25) / v25) * 100 : null;
                                    const diffColor = diff === null ? 'var(--muted)' : (diff > 5 ? '#b91c1c' : (diff < -2 ? '#15803d' : 'var(--text)'));
                                    return `
                                        <tr style="border-bottom:1px solid var(--line);">
                                            <td style="padding:10px 8px;font-weight:600;color:var(--ink);">${esc(label)}</td>
                                            <td style="padding:10px 8px;font-size:.82rem;color:var(--muted);">${isWeather ? (uiState.hddNormalized ? `× ${fmt(hdd.scaleToFull2025, 3)} (ГДОП)` : 'Погодозалежний (без нормування)') : 'Без перерахунку на HDD'}</td>
                                            <td style="padding:10px 8px;text-align:right;font-variant-numeric:tabular-nums;">${fmt(v25, 0)} <span style="color:var(--muted);font-size:.82rem;">${core.RESOURCE_UNITS[idx]}</span></td>
                                            <td style="padding:10px 8px;text-align:right;font-weight:600;font-variant-numeric:tabular-nums;">${fmt(v26, 0)} <span style="color:var(--muted);font-size:.82rem;">${core.RESOURCE_UNITS[idx]}</span></td>
                                            <td style="padding:10px 8px;text-align:right;font-weight:700;color:${diffColor};font-variant-numeric:tabular-nums;">${diff !== null ? (diff > 0 ? '+' : '') + fmt(diff, 1) + '%' : '—'}</td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                            <tfoot>
                                <tr style="background:var(--paper);font-weight:700;color:var(--ink);">
                                    <td colspan="2" style="padding:11px 8px;">Оцінка вартості у відповідних тарифах громади (з ПДВ)</td>
                                    <td style="padding:11px 8px;text-align:right;">${fmtMln(hddData.cost25Uah)} <span style="font-weight:400;font-size:.8rem;color:var(--muted);">(база 2025)</span></td>
                                    <td style="padding:11px 8px;text-align:right;">${fmtMln(active26Cost)} <span style="font-weight:400;font-size:.8rem;color:var(--muted);">(тарифи кінця 2026)</span></td>
                                    <td style="padding:11px 8px;text-align:right;color:var(--green);">Коеф. ×${fmt(hdd.scaleToFull2025, 3)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </section>

                <!-- =========================================================
                     Ф-04. ДЕТЕКТОР АНОМАЛІЙ ТА ФІНАНСОВИХ ВТРАТ
                     ========================================================= -->
                <section class="panel" style="padding:22px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);">
                    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:18px;">
                        <div>
                            <span style="display:inline-block;font-size:.78rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#9a3412;background:#ffedd5;padding:3px 9px;border-radius:999px;margin-bottom:6px;">Модуль Ф-04 · Аудит втрат і якості даних</span>
                            <h2 style="margin:0 0 4px;font-size:1.3rem;color:var(--ink);">Детектор аномалій та фінансових втрат</h2>
                            <p style="margin:0;font-size:.92rem;color:var(--muted);">Автоматичне розділення реального потенціалу економії громади та критичних викидів обліку UMUNI (&gt; +100%).</p>
                        </div>
                        <button type="button" id="btn-export-defects" style="border:1px solid var(--green);background:var(--green);color:#fff;border-radius:10px;padding:9px 16px;font:inherit;font-size:.88rem;font-weight:600;cursor:pointer;">
                            Експортувати data-defects.csv (${anomalies.summary.totalDefectsCount})
                        </button>
                    </div>

                    <!-- Розділені кошики: Реальна економія vs Помилки даних -->
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin-bottom:20px;">
                        <div style="padding:16px;border-radius:14px;border:1px solid #bbf7d0;background:#f0fdf4;">
                            <div style="font-size:.82rem;font-weight:700;color:#166534;text-transform:uppercase;">Кошик 1 · Реальна економія</div>
                            <div style="font-size:1.75rem;font-weight:800;color:#14532d;margin:6px 0;">${fmtMln(anomalies.summary.totalRealSavingsUah)}</div>
                            <div style="font-size:.84rem;color:#166534;">Потенціал скорочення видатків за рахунок енергоаудиту та виходу на медіану класу D</div>
                        </div>

                        <div style="padding:16px;border-radius:14px;border:1px solid var(--line);background:var(--paper);">
                            <div style="font-size:.82rem;font-weight:600;color:var(--muted);">Операційні перевитрати (+25% … +100%)</div>
                            <div style="font-size:1.5rem;font-weight:800;color:var(--ink);margin:6px 0;">${fmtMln(anomalies.summary.realOperationalLossUah)}</div>
                            <div style="font-size:.84rem;color:var(--muted);">${anomalies.summary.operationalCount} випадків по ресурсах (об’єкти для регулювання режимів)</div>
                        </div>

                        <div style="padding:16px;border-radius:14px;border:1px solid var(--line);background:var(--paper);">
                            <div style="font-size:.82rem;font-weight:600;color:var(--muted);">Бенчмарк-потенціал (понад медіану)</div>
                            <div style="font-size:1.5rem;font-weight:800;color:var(--ink);margin:6px 0;">${fmtMln(anomalies.summary.benchmarkPotentialUah)}</div>
                            <div style="font-size:.84rem;color:var(--muted);">${anomalies.summary.benchmarkExcessCount} будівель вище медіани своєї категорії</div>
                        </div>

                        <div style="padding:16px;border-radius:14px;border:1px solid #fecaca;background:#fef2f2;">
                            <div style="font-size:.82rem;font-weight:700;color:#991b1b;text-transform:uppercase;">Кошик 2 · Помилки даних (&gt; +100%)</div>
                            <div style="font-size:1.75rem;font-weight:800;color:#7f1d1d;margin:6px 0;">${fmtMln(anomalies.summary.virtualDataErrorUah)}</div>
                            <div style="font-size:.84rem;color:#991b1b;">${anomalies.summary.dataErrorCount} критичних викидів + ${anomalies.summary.zeroDropCount} обнулень (-100%) — ізольовано від бюджету</div>
                        </div>
                    </div>

                    <!-- ТОП-15 об'єктів із найбільшими фінансовими втратами -->
                    <h3 style="margin:0 0 10px;font-size:1.08rem;color:var(--ink);">ТОП-15 об’єктів із найбільшими фінансовими втратами (реальний потенціал економії)</h3>
                    <div style="overflow-x:auto;margin-bottom:20px;">
                        <table style="width:100%;border-collapse:collapse;font-size:.88rem;">
                            <thead>
                                <tr style="border-bottom:2px solid var(--line);text-align:left;color:var(--muted);">
                                    <th style="padding:8px;">#</th>
                                    <th style="padding:8px;">Заклад / Будівля</th>
                                    <th style="padding:8px;">Категорія</th>
                                    <th style="padding:8px;text-align:right;">Перевитрата (+25..100%)</th>
                                    <th style="padding:8px;text-align:right;">Понад медіану (клас D)</th>
                                    <th style="padding:8px;text-align:right;">Сумарний потенціал</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${anomalies.top15Losses.map((item, idx) => `
                                    <tr style="border-bottom:1px solid var(--line);">
                                        <td style="padding:9px 8px;color:var(--muted);font-weight:700;">${idx + 1}</td>
                                        <td style="padding:9px 8px;">
                                            <button type="button" data-pass="${esc(item.building.id)}" style="background:none;border:0;padding:0;color:var(--green);font:inherit;font-weight:700;text-align:left;cursor:pointer;text-decoration:underline;">
                                                ${esc(item.building.name)}
                                            </button>
                                            <div style="font-size:.79rem;color:var(--muted);margin-top:2px;">${esc(item.reasons.slice(0, 2).join(' · '))}</div>
                                        </td>
                                        <td style="padding:9px 8px;color:var(--muted);font-size:.82rem;">${esc(item.category)}</td>
                                        <td style="padding:9px 8px;text-align:right;font-variant-numeric:tabular-nums;">${item.operationalLossUah > 0 ? fmt(item.operationalLossUah) + ' грн' : '—'}</td>
                                        <td style="padding:9px 8px;text-align:right;font-variant-numeric:tabular-nums;">${item.benchmarkSavingsUah > 0 ? fmt(item.benchmarkSavingsUah) + ' грн' : '—'}</td>
                                        <td style="padding:9px 8px;text-align:right;font-weight:800;color:var(--ink);font-variant-numeric:tabular-nums;">${fmt(item.totalRealLossUah)} грн/рік</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>

                    <!-- Реєстр виявлених відхилень та дефектів обліку -->
                    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;">
                        <h3 style="margin:0;font-size:1.05rem;color:var(--ink);">Журнал виявлених аномалій та дефектів UMUNI</h3>
                        <div style="display:flex;flex-wrap:wrap;gap:6px;">
                            ${[
                                ['all', `Усі (${anomalies.defects.length})`],
                                ['data_error', `Викиди >100% (${anomalies.summary.dataErrorCount})`],
                                ['operational', `Перевитрати 25–100% (${anomalies.summary.operationalCount})`],
                                ['zero_drop', `Обнулення -100% (${anomalies.summary.zeroDropCount})`]
                            ].map(([key, label]) => `
                                <button type="button" data-defect-filter="${key}" style="border:1px solid var(--line);border-radius:999px;padding:5px 12px;font:inherit;font-size:.82rem;font-weight:600;cursor:pointer;background:${uiState.defectFilter === key ? 'var(--ink)' : 'var(--paper)'};color:${uiState.defectFilter === key ? '#fff' : 'var(--text)'};">
                                    ${label}
                                </button>
                            `).join('')}
                        </div>
                    </div>

                    <div style="overflow-x:auto;max-height:340px;border:1px solid var(--line);border-radius:12px;">
                        <table style="width:100%;border-collapse:collapse;font-size:.85rem;">
                            <thead style="position:sticky;top:0;background:var(--paper);z-index:1;">
                                <tr style="border-bottom:1px solid var(--line);text-align:left;color:var(--muted);">
                                    <th style="padding:8px 10px;">Будівля</th>
                                    <th style="padding:8px 10px;">Ресурс</th>
                                    <th style="padding:8px 10px;text-align:right;">2025</th>
                                    <th style="padding:8px 10px;text-align:right;">2026 (HDD)</th>
                                    <th style="padding:8px 10px;text-align:right;">Відхилення</th>
                                    <th style="padding:8px 10px;">Діагноз</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${filteredDefects.slice(0, 60).map(d => {
                                    const badgeBg = d.bucket === 'data_error' ? '#fee2e2' : (d.bucket === 'operational' ? '#fef3c7' : '#e0f2fe');
                                    const badgeCol = d.bucket === 'data_error' ? '#991b1b' : (d.bucket === 'operational' ? '#92400e' : '#075985');
                                    return `
                                        <tr style="border-bottom:1px solid var(--line);">
                                            <td style="padding:8px 10px;font-weight:600;">
                                                <button type="button" data-pass="${esc(d.buildingId)}" style="background:none;border:0;padding:0;color:var(--ink);font:inherit;font-weight:600;text-align:left;cursor:pointer;text-decoration:underline;">
                                                    ${esc(d.buildingName)}
                                                </button>
                                            </td>
                                            <td style="padding:8px 10px;">${esc(d.resource)}</td>
                                            <td style="padding:8px 10px;text-align:right;font-variant-numeric:tabular-nums;">${fmt(d.val2025, 1)}</td>
                                            <td style="padding:8px 10px;text-align:right;font-variant-numeric:tabular-nums;">${fmt(d.val2026Hdd, 1)}</td>
                                            <td style="padding:8px 10px;text-align:right;font-weight:700;color:${badgeCol};">${d.changePct !== null ? (d.changePct > 0 ? '+' : '') + fmt(d.changePct, 0) + '%' : '—'}</td>
                                            <td style="padding:8px 10px;"><span style="display:inline-block;padding:2px 8px;border-radius:6px;background:${badgeBg};color:${badgeCol};font-size:.79rem;font-weight:600;">${esc(d.diagnosis)}</span></td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </section>

                <!-- =========================================================
                     Ф-05. ПРОГНОЗ БЮДЖЕТУ 2027 (НИЖНЯ — БАЗОВА — ВЕРХНЯ МЕЖА)
                     ========================================================= -->
                <section class="panel" style="padding:22px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);">
                    <div style="margin-bottom:16px;">
                        <span style="display:inline-block;font-size:.78rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#1e40af;background:#dbeafe;padding:3px 9px;border-radius:999px;margin-bottom:6px;">Модуль Ф-05 · Бюджетний симулятор 2027</span>
                        <h2 style="margin:0 0 4px;font-size:1.3rem;color:var(--ink);">Інтервальний прогноз бюджету 2027 (КЕКВ 2271–2274)</h2>
                        <p style="margin:0;font-size:.92rem;color:var(--muted);">Розрахунок на очищеній базі споживання громади без сенсорних викидів UMUNI. Бюджет Полтавської МТГ (${esc(budget.dksuMeta.budgetCode)}).</p>
                    </div>

                    <!-- Горизонтальний діапазонний індикатор коридору бюджету 2027 -->
                    <div style="padding:18px;background:var(--paper);border:1px solid var(--line);border-radius:14px;margin-bottom:18px;">
                        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:12px;">
                            <div style="font-size:1rem;font-weight:700;color:var(--ink);">
                                Коридор бюджету 2027: від <span style="color:#15803d;">${fmt(budget.corridor.lowMln, 2)} млн грн</span> до <span style="color:#b91c1c;">${fmt(budget.corridor.highMln, 2)} млн грн</span>, базовий прогноз — <span style="color:var(--green);">${fmt(budget.corridor.baseMln, 2)} млн грн</span>
                            </div>
                            <div style="font-size:.92rem;font-weight:800;color:#fff;background:var(--green);padding:5px 12px;border-radius:999px;">
                                Поточний сценарій: ${fmt(budget.corridor.activeMln, 2)} млн грн
                            </div>
                        </div>

                        <div style="position:relative;height:18px;border-radius:999px;background:linear-gradient(90deg,#22c55e 0%,#eab308 50%,#ef4444 100%);margin:14px 0 8px;">
                            <div title="Базова межа: ${fmt(budget.corridor.baseMln, 2)} млн грн" style="position:absolute;top:-4px;left:${baseMarkerPct}%;transform:translateX(-50%);width:4px;height:26px;background:var(--ink);border-radius:2px;"></div>
                            <div title="Обраний сценарій: ${fmt(budget.corridor.activeMln, 2)} млн грн" style="position:absolute;top:-6px;left:${markerPct}%;transform:translateX(-50%);width:30px;height:30px;border-radius:50%;background:#fff;border:4px solid var(--green);box-shadow:0 2px 8px rgba(0,0,0,.22);"></div>
                        </div>
                        <div style="display:flex;justify-content:space-between;font-size:.82rem;color:var(--muted);">
                            <span>Нижня межа: <strong>${fmt(budget.corridor.lowMln, 2)} млн</strong> (тепла зима + СЕС/СЕнМ)</span>
                            <span>Базова: <strong>${fmt(budget.corridor.baseMln, 2)} млн</strong></span>
                            <span>Верхня: <strong>${fmt(budget.corridor.highMln, 2)} млн</strong> (холодна зима + ринок газу)</span>
                        </div>
                    </div>

                    <!-- Кнопки швидких сценаріїв + інтерактивні повзунки фінансиста -->
                    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
                        ${[
                            ['optimistic', 'Нижня межа (Оптимістичний)'],
                            ['baseline', 'Базова межа (Реалістичний)'],
                            ['stress', 'Верхня межа (Стрес-сценарій)']
                        ].map(([id, title]) => `
                            <button type="button" data-f05-preset="${id}" style="border:1px solid var(--line);border-radius:10px;padding:8px 14px;font:inherit;font-size:.86rem;font-weight:600;cursor:pointer;background:${uiState.preset === id ? 'var(--green)' : 'var(--paper)'};color:${uiState.preset === id ? '#fff' : 'var(--text)'};">
                                ${title}
                            </button>
                        `).join('')}
                    </div>

                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;padding:14px;background:var(--paper);border:1px solid var(--line);border-radius:12px;margin-bottom:18px;">
                        ${[
                            ['weatherPct', 'Погодний фактор ГДОП (тепло/газ)', -15, 20],
                            ['heatTariffPct', 'Зміна тарифу на тепло (від бази 2027)', -15, 25],
                            ['elecTariffPct', 'Зміна тарифу на електроенергію', -10, 30],
                            ['gasTariffPct', 'Зміна ціни природного газу', -15, 30],
                            ['waterTariffPct', 'Зміна тарифу на воду та стоки', -10, 25],
                            ['economyPct', 'Заходи СЕнМ / СЕС (фіз. обсяг)', -15, 10]
                        ].map(([key, label, min, max]) => `
                            <label style="display:flex;flex-direction:column;gap:4px;font-size:.83rem;color:var(--text);">
                                <span style="display:flex;justify-content:space-between;">
                                    <span>${label}</span>
                                    <strong style="color:var(--green);">${uiState.sliders[key] > 0 ? '+' : ''}${uiState.sliders[key]}%</strong>
                                </span>
                                <input type="range" data-f05-slider="${key}" min="${min}" max="${max}" step="1" value="${uiState.sliders[key]}" style="accent-color:var(--green);cursor:pointer;">
                            </label>
                        `).join('')}

                        <label style="grid-column:1 / -1;display:flex;align-items:center;gap:8px;padding-top:6px;border-top:1px solid var(--line);font-size:.88rem;font-weight:600;color:var(--ink);cursor:pointer;">
                            <input type="checkbox" id="f05-fix-anomalies" ${uiState.sliders.fixAnomaliesF04 ? 'checked' : ''} style="accent-color:var(--green);width:17px;height:17px;">
                            Врахувати економію від ліквідації аномалій Ф-04 (−${fmtMln(anomalies.summary.totalRealSavingsUah)})
                        </label>
                    </div>

                    <!-- Дві таблиці розбивки: за видами ресурсів (КЕКВ) та категоріями закладів -->
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px;">
                        <div>
                            <h3 style="margin:0 0 8px;font-size:1rem;color:var(--ink);">Розбивка бюджету 2027 за видами ресурсів (КЕКВ)</h3>
                            <table style="width:100%;border-collapse:collapse;font-size:.86rem;">
                                <thead>
                                    <tr style="border-bottom:2px solid var(--line);text-align:left;color:var(--muted);">
                                        <th style="padding:7px 6px;">Ресурс / КЕКВ</th>
                                        <th style="padding:7px 6px;text-align:right;">Прогноз 2027</th>
                                        <th style="padding:7px 6px;text-align:right;">Частка</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${core.RESOURCE_LABELS.map((label, idx) => {
                                        const uah = budget.active.resourcesUah[idx];
                                        const share = budget.active.totalUah > 0 ? (uah / budget.active.totalUah) * 100 : 0;
                                        const kekv = idx === 0 ? 'КЕКВ 2274' : (idx === 1 ? 'КЕКВ 2272' : (idx === 2 ? 'КЕКВ 2273' : 'КЕКВ 2271'));
                                        return `
                                            <tr style="border-bottom:1px solid var(--line);">
                                                <td style="padding:8px 6px;"><strong>${esc(label)}</strong> <span style="color:var(--muted);font-size:.78rem;">(${kekv})</span></td>
                                                <td style="padding:8px 6px;text-align:right;font-weight:600;font-variant-numeric:tabular-nums;">${fmtMln(uah)}</td>
                                                <td style="padding:8px 6px;text-align:right;color:var(--muted);">${fmt(share, 1)}%</td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                                <tfoot>
                                    ${budget.active.savingsDeductionUah > 0 ? `
                                        <tr style="color:#15803d;font-size:.84rem;">
                                            <td style="padding:7px 6px;">Економія від усунення аномалій Ф-04</td>
                                            <td style="padding:7px 6px;text-align:right;font-weight:700;">−${fmtMln(budget.active.savingsDeductionUah)}</td>
                                            <td></td>
                                        </tr>
                                    ` : ''}
                                    <tr style="background:var(--paper);font-weight:800;color:var(--ink);">
                                        <td style="padding:9px 6px;">Разом по громаді (2027 р.)</td>
                                        <td style="padding:9px 6px;text-align:right;">${fmtMln(budget.active.totalUah)}</td>
                                        <td style="padding:9px 6px;text-align:right;">100%</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        <div>
                            <h3 style="margin:0 0 8px;font-size:1rem;color:var(--ink);">Розбивка бюджету 2027 за категоріями закладів</h3>
                            <table style="width:100%;border-collapse:collapse;font-size:.86rem;">
                                <thead>
                                    <tr style="border-bottom:2px solid var(--line);text-align:left;color:var(--muted);">
                                        <th style="padding:7px 6px;">Категорія закладів</th>
                                        <th style="padding:7px 6px;text-align:right;">Будівель</th>
                                        <th style="padding:7px 6px;text-align:right;">Прогноз 2027</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${budget.active.categories.map(c => `
                                        <tr style="border-bottom:1px solid var(--line);">
                                            <td style="padding:8px 6px;font-weight:600;">${esc(c.category)}</td>
                                            <td style="padding:8px 6px;text-align:right;color:var(--muted);">${c.count}</td>
                                            <td style="padding:8px 6px;text-align:right;font-weight:600;font-variant-numeric:tabular-nums;">${fmtMln(c.totalUah)}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                            <div style="margin-top:10px;padding:10px 12px;background:var(--paper);border-radius:10px;font-size:.8rem;color:var(--muted);">
                                Верифікація ДКСУ (spending.gov.ua / OpenBudget): бюджет Полтавської МТГ <strong>${esc(budget.dksuMeta.budgetCode)}</strong>, ${budget.dksuMeta.subjectsCount} балансоутримувачів за ЄДРПОУ (КЕКВ 2271–2274).
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        `;

        $main.html(html);

        // Обробники подій вкладки «Аналітика»
        $main.find('[data-f03-mode]').on('click', function () {
            uiState.hddNormalized = $(this).attr('data-f03-mode') === '1';
            renderAnalytics($main);
        });

        $main.find('#f03-baseload').on('change', function () {
            uiState.includeBaseLoad10 = this.checked;
            renderAnalytics($main);
        });

        $main.find('#btn-export-defects').on('click', function () {
            core.exportDefectsCsv(anomalies);
            showToast('Файл data-defects.csv сформовано та завантажено');
        });

        $main.find('[data-defect-filter]').on('click', function () {
            uiState.defectFilter = $(this).attr('data-defect-filter');
            renderAnalytics($main);
        });

        $main.find('[data-f05-preset]').on('click', function () {
            const p = $(this).attr('data-f05-preset');
            if (PRESET_SLIDERS[p]) {
                uiState.preset = p;
                uiState.sliders = Object.assign({}, PRESET_SLIDERS[p]);
                renderAnalytics($main);
            }
        });

        $main.find('[data-f05-slider]').on('input change', function () {
            const key = $(this).attr('data-f05-slider');
            uiState.preset = 'custom';
            uiState.sliders[key] = Number(this.value) || 0;
            renderAnalytics($main);
        });

        $main.find('#f05-fix-anomalies').on('change', function () {
            uiState.preset = 'custom';
            uiState.sliders.fixAnomaliesF04 = this.checked;
            renderAnalytics($main);
        });
    }

    A.pages.analytics = renderAnalytics;
})(window.App);