window.App = window.App || {};

(function (A) {
    'use strict';

    const Core = A.overviewCore;
    const COLORS = ['#1c5744', '#71ab86', '#c0df73'];
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = (v, p = 1) => (typeof v === 'number' && Number.isFinite(v))
        ? new Intl.NumberFormat('uk-UA', { maximumFractionDigits: p }).format(v)
        : '—';

    // Локальний стан фільтрів огляду
    const uiState = {
        year: '2025',
        cat: '',
        query: '',
        page: 1,
        showInvalid: false
    };

    function renderOverviewPage($main) {
        const data = Core.getOverviewData(uiState.year);

        if (data.empty) {
            $main.html(`
                <div class="page-head">
                    <div>
                        <h1>Огляд енергоспоживання</h1>
                        <p class="subtitle">Аналітична панель енергоменеджменту Полтавської громади</p>
                    </div>
                </div>
                <section class="panel empty-hero">
                    <h2>${data.hasRegistry ? 'Реєстр будівель завантажено' : 'Почніть роботу з імпорту даних UMUNI'}</h2>
                    <p class="muted">${data.hasRegistry
                        ? 'Додайте річний звіт про споживання за 2025 або 2026 рік, щоб розрахувати базовий рівень та рейтинг будівель.'
                        : 'Завантажте реєстр будівель (Buildings_Info_Report.xlsx) та річні звіти споживання у форматі XLSX.'}</p>
                    <a class="btn primary extras" href="#import">Перейти до імпорту XLSX</a>
                </section>
            `);
            return;
        }

        uiState.year = data.year;
        const { rows, summary: s, groups, full, years, period } = data;

        if (!groups.some(g => g.name === uiState.cat)) {
            uiState.cat = groups.find(g => /навчальн|школ/i.test(g.name))?.name || groups[0]?.name || '';
        }

        const biggest = groups[0]?.total || 1;
        const shares = s.amounts.map(v => (s.total ? (v / s.total) * 100 : 0));
        const eligibleTotal = rows.filter(r => r.eligible).length;
        const excludedWithData = Math.max(0, s.covered - eligibleTotal);

        let end = 0;
        const gradient = shares.map((v, i) => {
            const start = end;
            end += v;
            return `${COLORS[i]} ${start}% ${end}%`;
        }).join(',');

        const legendHtml = data.energyNames
            .map((v, i) => `<span class="key-label"><i class="swatch" style="background:${COLORS[i]}"></i>${esc(v)}</span>`)
            .join('');

        const baseline = Core.getBaseline2025();

        $main.html(`
            <div class="page-head">
                <div>
                    <h1>Огляд енергоспоживання</h1>
                    <p class="subtitle">Споживання, базовий рівень СЕнМ та бенчмаркінг будівель громади.</p>
                </div>
                <div class="actions no-print">
                    <select id="ov-year" aria-label="Звітний рік">
                        ${years.map(y => `<option value="${esc(y)}" ${y === data.year ? 'selected' : ''}>${y} рік ${data.state.periods[y]?.full ? '' : `(до ${data.state.periods[y]?.asOf || ''})`}</option>`).join('')}
                    </select>
                    <a class="btn primary" href="#import">Імпорт XLSX</a>
                </div>
            </div>

            <!-- 4 KPI-картки -->
            <section class="stats">
                <article class="stat">
                    <div class="stat-head">Енергоспоживання</div>
                    <strong>${fmt(s.total, 0)}<span class="suffix">МВт·год</span></strong>
                    <div class="stat-note">${s.costMln ? `≈ ${fmt(s.costMln, 1)} млн грн у цінах 2026 р.` : (full ? 'За повний звітний рік' : `Станом на ${esc(period.asOf)}`)}</div>
                </article>
                <article class="stat">
                    <div class="stat-head">Будівлі у реєстрі</div>
                    <strong>${fmt(rows.length, 0)}</strong>
                    <div class="stat-note">${s.covered} зі споживанням · ${rows.length - s.covered} без даних</div>
                </article>
                <article class="stat">
                    <div class="stat-head">Базовий рівень СЕнМ</div>
                    <strong>${fmt(s.toe, 1)}<span class="suffix">т н. е.</span></strong>
                    <div class="stat-note">${data.year === '2025' ? 'Еталонний базовий 2025 рік' : `Зріз за ${data.year} рік`}</div>
                </article>
                <article class="stat">
                    <div class="stat-head">Доступні для рейтингу</div>
                    <strong>${eligibleTotal}</strong>
                    <div class="stat-note">${full ? `${excludedWithData} відсіяно через дефекти площі` : 'Рейтинг доступний за повний рік'}</div>
                </article>
            </section>

            <!-- Інтерактивні діаграми -->
            <section class="dashboard overview-charts">
                <article class="panel">
                    <div class="panel-head">
                        <div>
                            <h2>Споживання за категоріями</h2>
                            <p>Натисніть на категорію, щоб відкрити її у рейтингу нижче</p>
                        </div>
                        <span class="pill unit">МВт·год</span>
                    </div>
                    <div class="bars" id="ov-cat-bars">
                        ${groups.map(g => {
                            const isActive = g.name === uiState.cat;
                            const pct = s.total ? Math.round(((g.total || 0) / s.total) * 100) : 0;
                            return `
                                <button type="button" class="bar-row bar-interactive ${isActive ? 'is-active' : ''}" data-pick-cat="${esc(g.name)}">
                                    <span class="bar-label">${esc(g.name)}</span>
                                    <div class="bar-track">
                                        ${g.amounts.map((v, i) => `<span class="bar-segment" style="background:${COLORS[i]};width:${(v / biggest) * 100}%" title="${data.energyNames[i]}: ${fmt(v)} МВт·год"></span>`).join('')}
                                    </div>
                                    <span class="bar-value">${fmt(g.total, 0)} <small class="bar-pct">(${pct}%)</small></span>
                                </button>
                            `;
                        }).join('')}
                    </div>
                    <div class="legend chart-foot">${legendHtml}</div>
                </article>

                <article class="panel">
                    <div class="panel-head">
                        <div>
                            <h2>Структура споживання</h2>
                            <p>Баланс енергоносіїв по громаді</p>
                        </div>
                    </div>
                    <div class="share-body">
                        <div class="ring" style="background:${s.total ? `conic-gradient(${gradient})` : '#eaf0eb'}">
                            <div class="ring-hole"><b>${s.total ? '100%' : '—'}</b><small>разом</small></div>
                        </div>
                        <div class="share-list">
                            ${data.energyNames.map((name, i) => `
                                <div class="share-item">
                                    <div>
                                        <span class="key-label"><i class="swatch" style="background:${COLORS[i]}"></i>${name}</span>
                                        <small class="cell-meta">${s.counts[i] ? `${fmt(s.amounts[i], 0)} МВт·год` : 'Немає даних'}</small>
                                    </div>
                                    <strong>${s.counts[i] ? fmt(shares[i], 1) + '%' : '—'}</strong>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </article>
            </section>

            <!-- Таблиця рейтингу будівель -->
            <section class="panel section-gap scroll-me" id="ov-ranking">
                <div class="panel-head">
                    <div>
                        <h2>Рейтинг енергоефективності будівель</h2>
                        <p>${full ? 'Порівняння питомого споживання з медіаною своєї категорії' : 'Для неповного року доступний перегляд об’єктів та їхніх паспортів'}</p>
                    </div>
                    <div class="actions">
                        <span class="pill median-pill" id="ov-median-badge">Медіана групи: —</span>
                        <button type="button" class="btn secondary" id="ov-rank-csv">Експорт CSV</button>
                    </div>
                </div>

                <div class="filterline">
                    <select id="ov-category" aria-label="Категорія будівель">
                        ${groups.map(g => `<option value="${esc(g.name)}" ${g.name === uiState.cat ? 'selected' : ''}>${esc(g.name)} (${g.count})</option>`).join('')}
                    </select>
                    <label class="search">
                        <input id="ov-query" aria-label="Пошук будівлі" placeholder="Пошук за назвою або адресою..." value="${esc(uiState.query)}">
                    </label>
                    <div class="seg-tabs" role="tablist">
                        <button type="button" class="seg-btn ${!uiState.showInvalid ? 'is-active' : ''}" data-mode="valid" id="ov-tab-valid">У рейтингу</button>
                        <button type="button" class="seg-btn ${uiState.showInvalid ? 'is-active' : ''}" data-mode="invalid" id="ov-tab-invalid">Поза рейтингом</button>
                    </div>
                </div>
                <div id="ov-rankrows"></div>
            </section>

            <!-- Нижня картка базового рівня СЕнМ за 2025 рік -->
            <details class="panel details section-gap" id="ov-baseline-details">
                <summary>
                    <span>Базовий рівень СЕнМ за 2025 рік · зведення за суб’єктами</span>
                    <span class="pill">${baseline ? `${baseline.subjectsCount} суб’єктів ЄДРПОУ · ${baseline.buildingsCount} будівель` : 'Немає даних за 2025 р.'}</span>
                </summary>
                <div class="extras" id="ov-baseline">
                    ${baseline ? `
                        <div class="table-wrap">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>Суб’єкт / Рівень</th>
                                        <th>Покриття</th>
                                        <th>Тепло, МВт·год</th>
                                        <th>Електрика, МВт·год</th>
                                        <th>Газ, МВт·год</th>
                                        <th>Усього, МВт·год</th>
                                        <th>т н. е.</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${baseline.lines.map(l => `
                                        <tr class="${l.isTotal ? 'row-total' : ''}">
                                            <td>${esc(l.label)}</td>
                                            <td>${l.covered}/${l.count}</td>
                                            <td>${l.counts[0] ? fmt(l.amounts[0]) : '—'}</td>
                                            <td>${l.counts[1] ? fmt(l.amounts[1]) : '—'}</td>
                                            <td>${l.counts[2] ? fmt(l.amounts[2]) : '—'}</td>
                                            <td>${fmt(l.total)}</td>
                                            <td>${fmt(l.toe)}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                        <div class="table-end">
                            <span class="cell-meta">Перерахунок у т н. е. виконано за коефіцієнтом 0,086 (Постанова КМУ № 1460)</span>
                            <button type="button" class="btn secondary" id="ov-base-csv">Завантажити зведення (CSV)</button>
                        </div>
                    ` : '<p class="empty">Завантажте річний звіт за 2025 рік у розділі «Імпорт».</p>'}
                </div>
            </details>
        `);

        // Малювання таблиці рейтингу
        function drawRank() {
            const catRows = rows.filter(r => r.category === uiState.cat);
            const validCount = catRows.filter(r => r.eligible).length;
            const invalidCount = catRows.length - validCount;

            $('#ov-tab-valid').text(`У рейтингу (${validCount})`);
            $('#ov-tab-invalid').text(`Поза рейтингом (${invalidCount})`);

            const sampleMedian = catRows.find(r => r.median !== null)?.median;
            $('#ov-median-badge').html(
                sampleMedian ? `Медіана групи: <b>${fmt(sampleMedian, 1)}</b> кВт·год/м²` : 'Медіана групи: —'
            );

            const matches = catRows
                .filter(r => (uiState.showInvalid ? !r.eligible : r.eligible))
                .sort((a, b) => (b.intensity ?? -Infinity) - (a.intensity ?? -Infinity));

            const q = uiState.query.toLocaleLowerCase('uk').trim();
            const indexed = matches
                .map((r, i) => ({ r, i: i + 1 }))
                .filter(({ r }) => !q || `${r.b.name} ${r.b.address || ''}`.toLocaleLowerCase('uk').includes(q));

            const totalPages = Math.max(1, Math.ceil(indexed.length / 10));
            uiState.page = Math.max(1, Math.min(totalPages, uiState.page));
            const display = indexed.slice((uiState.page - 1) * 10, uiState.page * 10);

            if (!display.length) {
                $('#ov-rankrows').html(`<p class="empty">${full ? 'За цим фільтром будівель немає.' : 'Для побудови рейтингу оберіть повний 2025 рік або перейдіть у вкладку «Поза рейтингом».'}</p>`);
            } else {
                const head = uiState.showInvalid
                    ? '<th>№</th><th>Будівля та адреса</th><th>Причина виключення з рейтингу</th><th>Спожито, МВт·год</th>'
                    : '<th>Місце</th><th>Будівля та адреса</th><th>кВт·год/м²</th><th>Відхилення від медіани</th><th>Клас</th>';

                const body = display.map(({ r, i }) => {
                    const addr = r.b.address ? `<span class="cell-meta row-addr">${esc(r.b.address)}</span>` : '';
                    if (uiState.showInvalid) {
                        return `
                            <tr>
                                <td class="rank">—</td>
                                <td class="row-name"><button type="button" data-pass="${esc(r.b.id)}">${esc(r.b.name)}</button>${addr}</td>
                                <td><span class="defect-tag">${esc(r.excludes.join(' · '))}</span></td>
                                <td>${fmt(r.mwh, 1)}</td>
                            </tr>
                        `;
                    }
                    const diffPct = r.median && r.intensity !== null ? ((r.intensity - r.median) / r.median) * 100 : null;
                    const diffSign = diffPct !== null ? (diffPct > 0 ? `+${fmt(diffPct, 0)}%` : `${fmt(diffPct, 0)}%`) : '—';
                    const diffCls = diffPct === null ? '' : diffPct > 15 ? 'diff-bad' : diffPct < -10 ? 'diff-good' : 'diff-neutral';
                    const ratioWidth = r.median && r.intensity !== null ? Math.min(100, Math.round((r.intensity / (r.median * 2)) * 100)) : 0;
                    const gradeBadge = r.grade ? `<span class="grade ${r.grade.toLowerCase()}">${r.grade}</span>` : '—';

                    return `
                        <tr>
                            <td class="rank">${i}</td>
                            <td class="row-name"><button type="button" data-pass="${esc(r.b.id)}">${esc(r.b.name)}</button>${addr}</td>
                            <td class="num-strong">${fmt(r.intensity, 1)}</td>
                            <td>
                                <div class="diff-cell">
                                    <span class="diff-badge ${diffCls}">${diffSign}</span>
                                    <div class="mini-meter" title="100% шкали = 2× медіани групи">
                                        <span class="mini-fill ${diffCls}" style="width:${ratioWidth}%"></span>
                                        <i class="mini-median-mark" title="Медіана групи (${fmt(r.median, 1)})"></i>
                                    </div>
                                </div>
                            </td>
                            <td>${gradeBadge}</td>
                        </tr>
                    `;
                }).join('');

                $('#ov-rankrows').html(`
                    <div class="table-wrap"><table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
                    <div class="table-end">
                        <span class="cell-meta">Показано ${display.length} із ${indexed.length} будівель · сторінка ${uiState.page} із ${totalPages}</span>
                        <div class="section-actions">
                            <button type="button" class="btn secondary" id="ov-prev" ${uiState.page === 1 ? 'disabled' : ''}>Назад</button>
                            <button type="button" class="btn secondary" id="ov-next" ${uiState.page === totalPages ? 'disabled' : ''}>Далі</button>
                        </div>
                    </div>
                `);
            }

            $('#ov-prev').on('click', () => { uiState.page--; drawRank(); });
            $('#ov-next').on('click', () => { uiState.page++; drawRank(); });
            $('#ov-rank-csv').off('click').on('click', () => {
                Core.downloadCsv(`Рейтинг-${uiState.year}-${uiState.cat}.csv`, [
                    ['Місце', 'Будівля', 'Адреса', 'Категорія', 'кВт·год/м²', 'Медіана групи', 'Клас', 'Причина виключення'],
                    ...indexed.map(({ r, i }) => [uiState.showInvalid ? '' : i, r.b.name, r.b.address, r.category, r.intensity, r.median, r.grade, r.excludes.join(' · ')])
                ]);
            });
        }

        drawRank();

        // Події сторінки
        $('#ov-cat-bars').on('click', '[data-pick-cat]', function () {
            uiState.cat = $(this).attr('data-pick-cat');
            uiState.page = 1;
            $('#ov-category').val(uiState.cat);
            $('#ov-cat-bars .bar-interactive').removeClass('is-active');
            $(this).addClass('is-active');
            drawRank();
            document.getElementById('ov-ranking')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

        $('#ov-year').on('change', function () {
            uiState.year = $(this).val();
            uiState.page = 1;
            renderOverviewPage($main);
        });

        $('#ov-category').on('change', function () {
            uiState.cat = $(this).val();
            uiState.page = 1;
            $('#ov-cat-bars .bar-interactive').removeClass('is-active');
            $(`#ov-cat-bars [data-pick-cat="${CSS.escape(uiState.cat)}"]`).addClass('is-active');
            drawRank();
        });

        $('#ov-query').on('input', function () {
            uiState.query = $(this).val();
            uiState.page = 1;
            drawRank();
        });

        $('.seg-btn').on('click', function () {
            uiState.showInvalid = $(this).data('mode') === 'invalid';
            uiState.page = 1;
            $('.seg-btn').removeClass('is-active');
            $(this).addClass('is-active');
            drawRank();
        });

        if (baseline) {
            $('#ov-base-csv').on('click', () => {
                Core.downloadCsv('Базовий-рівень-2025.csv', [
                    ['Суб’єкт / Рівень', 'Покриття', 'Тепло, МВт·год', 'Електрика, МВт·год', 'Газ, МВт·год', 'Усього, МВт·год', 'т н. е.'],
                    ...baseline.lines.map(l => [l.label, `${l.covered}/${l.count}`, l.amounts[0], l.amounts[1], l.amounts[2], l.total, l.toe])
                ]);
            });
        }
    }

    A.pages = A.pages || {};
    A.pages.overview = renderOverviewPage;
})(window.App);