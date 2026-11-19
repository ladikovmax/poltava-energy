window.App = window.App || {};

(function (A) {
    'use strict';

    const Core = A.passportCore;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = (v, d = 1) => (typeof v === 'number' && Number.isFinite(v))
        ? new Intl.NumberFormat('uk-UA', { maximumFractionDigits: d }).format(v)
        : '—';

    // Розрахунок позиції маркера будівлі на шкалі A — D — G (0..100%)
    function calcMarkerPosition(ratio) {
        if (!ratio || ratio <= 0) return 50;
        // Шкала центрована на медіані (k = 1.0 -> 50%), діапазон від 0.4 (5%) до 1.6 (95%)
        const clamped = Math.max(0.4, Math.min(1.6, ratio));
        return Math.round(((clamped - 0.4) / 1.2) * 90 + 5);
    }

    function renderPassportPage($main) {
        const hashQuery = location.hash.split('?')[1] || '';
        const selectedId = new URLSearchParams(hashQuery).get('id') || '';
        const p = Core.getBuildingPassport(selectedId);

        if (!p) {
            $main.html(`
                <div class="page-head">
                    <div>
                        <h1>Бенчмаркінг та енергопаспорти (Ф-02)</h1>
                        <p class="subtitle">Дані ще не завантажені.</p>
                    </div>
                </div>
                <section class="panel">
                    <p>Для формування енергетичного паспорта спершу завантажте реєстр будівель та річний звіт у розділі імпорту.</p>
                    <a class="btn primary extras" href="#import">Перейти до імпорту даних</a>
                </section>
            `);
            return;
        }

        const b = p.building;
        const y25 = p.yearlyData[p.baseYear] || { mwh: null, toe: null };
        const diffPercent = (p.eligible && p.median > 0) ? ((p.intensity / p.median) - 1) * 100 : null;
        const markerLeft = calcMarkerPosition(p.ratio);
        const todayStr = new Date().toLocaleDateString('uk-UA');

        $main.html(`
            <!-- Вбудовані стилі для шкали A-G та формату А4 при друку -->
            <style>
                .pass-grade-box { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
                .pass-badge {
                    width: 72px; height: 72px; border-radius: 14px; display: flex; align-items: center;
                    justify-content: center; font-size: 2.2rem; font-weight: 800; color: #fff; flex-shrink: 0;
                }
                .pass-scale-wrap { margin-top: 18px; position: relative; padding-top: 26px; }
                .pass-scale-bar {
                    display: grid; grid-template-columns: repeat(7, 1fr); height: 14px;
                    border-radius: 7px; overflow: hidden; font-size: 10px; font-weight: 700; color: #fff; text-align: center;
                }
                .pass-marker {
                    position: absolute; top: 0; transform: translateX(-50%);
                    background: #0f172a; color: #fff; font-size: 11px; font-weight: 700;
                    padding: 2px 7px; border-radius: 4px; white-space: nowrap;
                }
                .pass-marker::after {
                    content: ''; position: absolute; left: 50%; bottom: -5px; transform: translateX(-50%);
                    border-width: 5px 5px 0; border-style: solid; border-color: #0f172a transparent transparent;
                }
                .print-only-footer { display: none; }
                @media print {
                    header, nav, .no-print { display: none !important; }
                    body { background: #fff !important; font-size: 11pt; }
                    .panel { box-shadow: none !important; border: 1px solid #cbd5e1 !important; break-inside: avoid; margin-bottom: 10px !important; padding: 12px !important; }
                    .print-only-footer { display: block !important; margin-top: 14px; font-size: 9pt; color: #475569; border-top: 1px solid #cbd5e1; padding-top: 8px; }
                }
            </style>

            <!-- Верхня панель керування (приховується при друку) -->
            <div class="page-head no-print">
                <div>
                    <h1>Енергетичний паспорт будівлі</h1>
                    <p class="subtitle">Цифровий аналітичний профіль та бенчмаркінг за методикою СЕнМ Полтавської ТГ.</p>
                </div>
            </div>

            <div class="toolbar no-print" style="justify-content: space-between; align-items: end;">
                <label class="field wide-select">Оберіть комунальну будівлю (усього ${p.list.length})
                    <select id="pass-select">
                        ${p.list.map(item => `
                            <option value="${esc(item.id)}" ${item.id === b.id ? 'selected' : ''}>
                                ${esc(item.name)} ${item.grade ? `[Клас ${item.grade}]` : '[Недостатньо даних]'}
                            </option>
                        `).join('')}
                    </select>
                </label>
                <div class="actions">
                    <button type="button" class="btn primary" id="pass-print">Експорт у PDF (A4)</button>
                </div>
            </div>

            <!-- 1. Шапка паспорта будівлі -->
            <section class="panel">
                <div class="panel-head">
                    <div>
                        <h2>${esc(b.name)}</h2>
                        <p>${esc(b.address || 'Адресу не вказано')} · ID UMUNI: <b>${esc(b.id)}</b></p>
                    </div>
                    <span class="pill">${esc(p.category)}</span>
                </div>
                <dl class="facts">
                    <div><dt>Балансоутримувач (ЄДРПОУ)</dt><dd>${p.edrpou ? `${esc(p.subjectName)} (${esc(p.edrpou)})` : 'Не прив’язано (D2-05)'}</dd></div>
                    <div><dt>Рік побудови / Поверховість</dt><dd>${b.year || '—'} р. / ${b.floors || '—'} пов.</dd></div>
                    <div><dt>Опалювана площа</dt><dd>${fmt(b.area, 1)} м²</dd></div>
                    <div><dt>Опалюваний об’єм</dt><dd>${fmt(b.volume, 1)} м³</dd></div>
                    <div><dt>Система опалення</dt><dd>${esc(b.heating || 'Не вказано')}</dd></div>
                    <div><dt>Статус СЕнМ / МЕП</dt><dd>${p.edrpou ? 'Суб’єкт СЕнМ підключений' : 'Очікує прив’язки суб’єкта'}</dd></div>
                </dl>
            </section>

            <!-- 2. Блок бенчмаркінгу (Клас A–G) -->
            <section class="panel section-gap">
                <div class="panel-head">
                    <div>
                        <h2>Бенчмаркінг у межах категорії (${esc(p.baseYear)} рік)</h2>
                        <p>Порівняння питомого енергоспоживання з медіаною групи «${esc(p.category)}» (${p.peerCount} будівель).</p>
                    </div>
                </div>

                ${p.eligible ? `
                    <div class="pass-grade-box">
                        <div class="pass-badge" style="background:${p.gradeInfo ? p.gradeInfo.color : '#64748b'}">
                            ${p.gradeInfo ? p.gradeInfo.grade : '—'}
                        </div>
                        <div>
                            <div style="font-size:1.25rem; font-weight:700;">
                                Питоме споживання: ${fmt(p.intensity, 1)} кВт·год/м²
                                <span style="font-size:0.95rem; font-weight:500; color:#475569;">(${fmt(p.byVolume, 1)} кВт·год/м³)</span>
                            </div>
                            <p style="margin:4px 0;">
                                Медіана категорії: <b>${fmt(p.median, 1)} кВт·год/м²</b> ·
                                Відхилення від медіани: <b style="color:${diffPercent <= 0 ? '#15803d' : '#b91c1c'}">${diffPercent > 0 ? '+' : ''}${fmt(diffPercent, 1)}%</b>
                            </p>
                            <p class="muted" style="margin:0;">
                                ${p.gradeInfo ? esc(p.gradeInfo.desc) : 'Для присвоєння класу A–G потрібно щонайменше 5 будівель у категорії.'}
                            </p>
                        </div>
                    </div>

                    <!-- Горизонтальна шкала-лінійка A — D — G -->
                    <div class="pass-scale-wrap">
                        <div class="pass-marker" style="left:${markerLeft}%">Ви тут (${fmt(p.intensity, 0)})</div>
                        <div class="pass-scale-bar">
                            ${p.classScale.map(c => `<div style="background:${c.color}" title="Клас ${c.grade}: ${c.desc}">${c.grade}</div>`).join('')}
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:11px; color:#64748b; margin-top:4px;">
                            <span>Кращі практики (A)</span>
                            <span>Медіана категорії (D)</span>
                            <span>Критичні перевитрати (G)</span>
                        </div>
                    </div>
                ` : `
                    <div style="padding:12px 16px; background:#fefce8; border-left:3px solid #eab308; border-radius:6px;">
                        <b>Недостатньо даних для розрахунку рейтингу:</b>
                        <ul style="margin:6px 0 0; padding-left:20px;">
                            ${p.excludes.map(reason => `<li>${esc(reason)}</li>`).join('')}
                        </ul>
                    </div>
                `}

                <p class="footnote extras">
                    Примітка: це аналітичний бенчмарк громади для управлінського контролю, а не офіційний енергетичний сертифікат за Законом України «Про енергетичну ефективність будівель».
                </p>
            </section>

            <!-- 3. Таблиця базового рівня (2025) та оперативного зрізу (2026) -->
            <section class="panel section-gap">
                <div class="panel-head">
                    <div>
                        <h2>Споживання енергоресурсів та води</h2>
                        <p>Натуральні одиниці та зведення до спільного енергетичного еквівалента (Постанова КМУ № 1460).</p>
                    </div>
                </div>

                ${p.anomalies2026.length ? `
                    <div style="margin-bottom:12px; padding:10px 14px; background:#fef2f2; border-left:3px solid #dc2626; border-radius:6px; color:#991b1b;">
                        <b>Виявлено аномалії у неповному 2026 році:</b>
                        <ul style="margin:4px 0 0; padding-left:20px;">
                            ${p.anomalies2026.map(a => `<li>${esc(a)}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}

                <div class="table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Ресурс</th>
                                <th>Од. виміру</th>
                                ${p.years.map(y => `
                                    <th>${y} рік ${p.periods[y]?.full ? '(базовий)' : `(до ${esc(p.periods[y]?.asOf || '')})`}</th>
                                `).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${p.resourcesMeta.map(res => `
                                <tr>
                                    <td>${esc(res.name)}</td>
                                    <td>${esc(res.unit)}</td>
                                    ${p.years.map(y => {
                                        const val = b.years?.[y]?.[res.idx];
                                        const mwh = p.yearlyData[y]?.byResource?.[res.idx];
                                        return `<td>
                                            <b>${fmt(val, 2)}</b>
                                            ${res.idx <= 2 && mwh !== null ? `<span class="cell-meta"> (${fmt(mwh, 2)} МВт·год)</span>` : ''}
                                        </td>`;
                                    }).join('')}
                                </tr>
                            `).join('')}
                            <tr style="background:#f8fafc; font-weight:700;">
                                <td colspan="2">Разом енергоспоживання, МВт·год</td>
                                ${p.years.map(y => `<td>${fmt(p.yearlyData[y]?.mwh, 2)} МВт·год</td>`).join('')}
                            </tr>
                            <tr style="background:#f8fafc; font-weight:700;">
                                <td colspan="2">Еквівалент, т н. е. (× 0,086)</td>
                                ${p.years.map(y => `<td>${fmt(p.yearlyData[y]?.toe, 3)} т н. е.</td>`).join('')}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- 4. Реєстр вузлів обліку (D2-04) -->
            <section class="panel section-gap">
                <div class="panel-head">
                    <div>
                        <h2>Реєстр вузлів обліку будівлі (${p.meters.length})</h2>
                        <p>Прилади обліку з вивантаження UMUNI (серійні номери замасковано з міркувань безпеки).</p>
                    </div>
                </div>

                ${p.meters.length ? `
                    <div class="table-wrap">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Ресурс</th>
                                    <th>Тип обліку</th>
                                    <th>Модель приладу</th>
                                    <th>Номер (маскований)</th>
                                    <th>Стан обліку</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${p.meters.map(m => `
                                    <tr>
                                        <td>${esc(m.resource)}</td>
                                        <td>${esc(m.kind)}</td>
                                        <td>${esc(m.model)}</td>
                                        <td><code>${esc(m.maskedNumber)}</code></td>
                                        <td>${m.hasDefect ? `<span style="color:#b91c1c; font-weight:600;">⚠ ${esc(m.defectNote)}</span>` : 'Норма'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : `<p class="empty">Прилади обліку для цієї будівлі не завантажені (перевірте файл Лічильники.xlsx).</p>`}
            </section>

            <!-- Службовий колонтитул для друку у PDF -->
            <footer class="print-only-footer">
                Витяг сформовано системою енергомоніторингу Полтавської ТГ · Дата формування: ${todayStr} ·
                Методика: тепло × 1,163 МВт·год/Гкал, е/е ÷ 1000, газ × ${fmt(p.gasKwh / 1000, 4)} МВт·год/м³, т н. е. = МВт·год × 0,086 (Постанова КМУ № 1460).
            </footer>
        `);

        // Перемикання будівлі
        $('#pass-select').on('change', function () {
            location.hash = 'passport?id=' + encodeURIComponent($(this).val());
        });

        // Друк / збереження у PDF
        $('#pass-print').on('click', () => window.print());
    }

    A.pages = A.pages || {};
    A.pages.passport = renderPassportPage;
})(window.App);