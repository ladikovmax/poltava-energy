window.App = window.App || {};

(function (A) {
    'use strict';

    const Core = A.overviewCore;
    const COLORS = ['#1c5744', '#63a37e', '#b8db68'];
    const SHORT_NAMES = ['Тепло', 'Електрика', 'Газ'];
    const ALL_CAT = '__ALL__';
    const RING_RADIUS = 50;
    const RING_CIRC = 2 * Math.PI * RING_RADIUS;

    const GRADE_TIPS = {
        A: 'Клас A · Найвища ефективність (кращі практики, значно нижче медіани)',
        B: 'Клас B · Висока ефективність (помітно економніше за медіану групи)',
        C: 'Клас C · Добра ефективність (нижче медіани групи)',
        D: 'Клас D · Базовий рівень (відповідає медіані категорії)',
        E: 'Клас E · Знижена ефективність (помірне перевищення медіани)',
        F: 'Клас F · Низька ефективність (значні перевитрати проти медіани)',
        G: 'Клас G · Критичні перевитрати або похибка площі / вузла обліку'
    };

    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = (v, p = 1) => (typeof v === 'number' && Number.isFinite(v))
        ? new Intl.NumberFormat('uk-UA', { maximumFractionDigits: p }).format(v)
        : '—';

    const uiState = {
        year: '2025',
        cat: '',
        donutCat: '',
        query: '',
        page: 1,
        showInvalid: false
    };

    // Розрахунок параметрів дуг для SVG-кільця
    function calcRingArcs(shares) {
        const activeCount = shares.filter(p => p > 0.2).length;
        const gap = activeCount > 1 ? 3 : 0;
        let offset = 0;

        return shares.map(pct => {
            const rawLen = (Math.max(0, pct) / 100) * RING_CIRC;
            const dash = rawLen > gap ? rawLen - gap : rawLen;
            const seg = {
                dasharray: `${dash.toFixed(2)} ${RING_CIRC.toFixed(2)}`,
                dashoffset: (-offset).toFixed(2)
            };
            offset += rawLen;
            return seg;
        });
    }

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
        const { rows, activeRows, summary: s, groups, full, years, period } = data;

        const defaultCat = groups.find(g => /навчальн|школ/i.test(g.name))?.name || groups[0]?.name || '';
        if (!groups.some(g => g.name === uiState.donutCat)) {
            uiState.donutCat = defaultCat;
        }
        if (uiState.cat !== ALL_CAT && !groups.some(g => g.name === uiState.cat)) {
            uiState.cat = uiState.donutCat;
        }

        const isAllSelected = uiState.cat === ALL_CAT;
        const biggest = groups[0]?.total || 1;
        const eligibleTotal = activeRows.filter(r => r.eligible).length;
        const excludedWithData = Math.max(0, activeRows.length - eligibleTotal);
        const baseline = Core.getBaseline2025();

        const legendHtml = data.energyNames
            .map((v, i) => `<span class="key-label"><i class="swatch" style="background:${COLORS[i]}"></i>${esc(v)}</span>`)
            .join('');

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
                    <div class="stat-head">Будівлі зі споживанням</div>
                    <strong>${fmt(activeRows.length, 0)}<span class="suffix">із ${rows.length}</span></strong>
                    <div class="stat-note">${rows.length - activeRows.length} без даних за ${data.year} рік</div>
                </article>
                <article class="stat">
                    <div class="stat-head">Базовий рівень СЕнМ</div>
                    <strong>${fmt(s.toe, 1)}<span class="suffix">т н. е.</span></strong>
                    <div class="stat-note">${data.year === '2025' ? 'Еталонний базовий 2025 рік' : `Зріз за ${data.year} рік`}</div>
                </article>
                <article class="stat">
                    <div class="stat-head">Доступні для рейтингу</div>
                    <strong>${eligibleTotal}</strong>
                    <div class="stat-note">${excludedWithData} відсіяно через дефекти площі</div>
                </article>
            </section>

            <!-- Інтерактивні діаграми -->
            <section class="dashboard overview-charts">
                <!-- Ліва картка: споживання за категоріями -->
                <article class="panel">
                    <div class="panel-head">
                        <div>
                            <h2>Споживання за категоріями</h2>
                            <p>Оберіть категорію для перегляду структури та рейтингу</p>
                        </div>
                        <span class="pill unit">МВт·год</span>
                    </div>
                    <div class="bars" id="ov-cat-bars">
                        ${groups.map(g => {
                            const isActive = !isAllSelected && g.name === uiState.cat;
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

                <!-- Права картка: клікабельна смуга громади + блок обраної категорії -->
                <article class="panel structure-panel">
                    <div class="panel-head">
                        <div>
                            <h2>Структура споживання</h2>
                            <p>Баланс енергоносіїв по громаді та категорії</p>
                        </div>
                        <span class="pill unit">${s.total ? `${fmt(s.total, 0)} МВт·год` : '—'}</span>
                    </div>

                    <!-- 1. Клікабельний блок по всій громаді за обраний рік -->
                    <button type="button" class="comm-mix comm-mix-btn ${isAllSelected ? 'is-active' : ''}" id="ov-pick-all" title="Показати всі ${activeRows.length} споруд за ${data.year} рік у таблиці">
                        <div class="comm-mix-head">
                            <span class="mix-eyebrow">Уся громада · ${activeRows.length} буд. (${data.year})</span>
                            <span class="mix-head-right">
                                ${s.costMln ? `<span class="cell-meta nowrap">≈ ${fmt(s.costMln, 1)} млн грн</span>` : ''}
                                <span class="mix-action-tag nowrap" id="ov-all-tag">${isAllSelected ? 'Обрано' : 'Усі →'}</span>
                            </span>
                        </div>
                        <div class="stacked-strip" role="img" aria-label="Загальний баланс енергоносіїв по громаді">
                            ${s.shares.map((pct, i) => pct > 0
                                ? `<span class="strip-seg" style="width:${pct.toFixed(2)}%;background:${COLORS[i]}" title="${data.energyNames[i]}: ${fmt(pct, 1)}% (${fmt(s.amounts[i], 0)} МВт·год)"></span>`
                                : ''
                            ).join('')}
                        </div>
                        <div class="comm-mix-inline">
                            ${SHORT_NAMES.map((name, i) => `
                                <span class="mix-chip" title="${data.energyNames[i]}: ${s.counts[i] ? fmt(s.amounts[i], 0) + ' МВт·год' : 'немає даних'}">
                                    <i class="swatch" style="background:${COLORS[i]}"></i>
                                    <span>${name}</span>
                                    <strong>${s.counts[i] ? fmt(s.shares[i], 1) + '%' : '—'}</strong>
                                </span>
                            `).join('')}
                        </div>
                    </button>

                    <!-- 2. Нижній блок з анімованим SVG-кругом для конкретної категорії -->
                    <div class="cat-drilldown" id="ov-cat-drilldown">
                        <div class="drill-head">
                            <div class="drill-top-row">
                                <span class="drill-badge" id="ov-drill-meta">Обрана категорія</span>
                                <span class="pill median-pill nowrap" id="ov-drill-cost" style="display:none"></span>
                            </div>
                            <h3 class="drill-title" id="ov-drill-title">—</h3>
                        </div>

                        <div class="drill-body">
                            <div class="svg-donut-wrap">
                                <svg class="svg-donut" viewBox="0 0 132 132" aria-hidden="true">
                                    <circle class="donut-track" cx="66" cy="66" r="${RING_RADIUS}"></circle>
                                    <circle class="donut-seg" id="ov-ring-0" cx="66" cy="66" r="${RING_RADIUS}" stroke="${COLORS[0]}" stroke-dasharray="0 ${RING_CIRC}" stroke-dashoffset="0"></circle>
                                    <circle class="donut-seg" id="ov-ring-1" cx="66" cy="66" r="${RING_RADIUS}" stroke="${COLORS[1]}" stroke-dasharray="0 ${RING_CIRC}" stroke-dashoffset="0"></circle>
                                    <circle class="donut-seg" id="ov-ring-2" cx="66" cy="66" r="${RING_RADIUS}" stroke="${COLORS[2]}" stroke-dasharray="0 ${RING_CIRC}" stroke-dashoffset="0"></circle>
                                </svg>
                                <div class="svg-donut-center" id="ov-ring-center">
                                    <b id="ov-ring-total">—</b>
                                    <span>МВт·год</span>
                                    <small id="ov-ring-share">—</small>
                                </div>
                            </div>

                            <div class="drill-list" id="ov-drill-list"></div>
                        </div>

                        <div class="drill-foot">
                            <span class="cell-meta" id="ov-drill-toe"></span>
                            <button type="button" class="link-jump" id="ov-jump-rank">До рейтингу ↓</button>
                        </div>
                    </div>
                </article>
            </section>

            <!-- Таблиця рейтингу будівель -->
            <section class="panel section-gap scroll-me" id="ov-ranking">
                <div class="panel-head">
                    <div>
                        <h2>Рейтинг енергоефективності будівель (${data.year} рік)</h2>
                        <p>${full
                            ? 'Порівняння питомого споживання з медіаною своєї категорії за повний звітний рік'
                            : `Питоме споживання за неповний ${data.year} рік (до ${esc(period.asOf)}) · без оцінки класу A–G`}</p>
                    </div>
                    <div class="actions">
                        <span class="pill median-pill" id="ov-median-badge">Медіана групи: —</span>
                        <button type="button" class="btn secondary" id="ov-rank-csv">Експорт CSV</button>
                    </div>
                </div>

                <div class="filterline">
                    <select id="ov-category" aria-label="Категорія будівель">
                        <option value="${ALL_CAT}" ${isAllSelected ? 'selected' : ''}>Всі споруди за ${data.year} р. (${activeRows.length})</option>
                        ${groups.map(g => `<option value="${esc(g.name)}" ${!isAllSelected && g.name === uiState.cat ? 'selected' : ''}>${esc(g.name)} (${g.covered})</option>`).join('')}
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

        // Оновлення анімованого SVG-круга (показує обрану категорію uiState.donutCat за вибраний рік)
        function updateCategoryDonut(animateEntrance = true) {
            const g = groups.find(item => item.name === uiState.donutCat) || groups[0];
            if (!g) return;

            const $box = $('#ov-cat-drilldown');
            if (animateEntrance) {
                $box.removeClass('is-animating');
                void $box[0]?.offsetWidth;
                $box.addClass('is-animating');
            }

            const shareOfComm = s.total && g.total ? (g.total / s.total) * 100 : 0;

            $('#ov-drill-meta').text(`${g.covered} із ${g.count} будівель зі споживанням`);
            $('#ov-drill-title').text(g.name);

            if (g.costMln) {
                $('#ov-drill-cost').text(`≈ ${fmt(g.costMln, 1)} млн грн`).show();
            } else {
                $('#ov-drill-cost').hide();
            }

            $('#ov-ring-total').text(g.total !== null ? fmt(g.total, 0) : '0');
            $('#ov-ring-share').text(s.total ? `${fmt(shareOfComm, 1)}% громади` : 'немає даних');

            const catMedian = full ? rows.find(r => r.category === g.name && r.median !== null)?.median : null;
            const toeText = g.toe !== null ? `${fmt(g.toe, 1)} т н. е.` : 'немає даних';
            const medText = catMedian ? ` · медіана ${fmt(catMedian, 1)} кВт·год/м²` : '';
            $('#ov-drill-toe').text(toeText + medText);

            const arcs = calcRingArcs(g.shares);
            arcs.forEach((arc, i) => {
                const el = document.getElementById(`ov-ring-${i}`);
                if (el) {
                    el.setAttribute('stroke-dasharray', arc.dasharray);
                    el.setAttribute('stroke-dashoffset', arc.dashoffset);
                }
            });

            $('#ov-drill-list').html(
                SHORT_NAMES.map((name, i) => `
                    <div class="drill-row">
                        <div class="drill-row-top">
                            <span class="key-label"><i class="swatch" style="background:${COLORS[i]}"></i>${esc(name)}</span>
                            <strong class="drill-row-pct">${g.counts[i] ? fmt(g.shares[i], 1) + '%' : '—'}</strong>
                        </div>
                        <div class="drill-row-sub">
                            <span>${g.counts[i] ? `${fmt(g.amounts[i], 0)} МВт·год` : 'Немає даних'}</span>
                        </div>
                    </div>
                `).join('')
            );
        }

        // Малювання таблиці рейтингу (виключно по спорудах із даними за вибраний рік)
        function drawRank() {
            const isAll = uiState.cat === ALL_CAT;
            const catRows = isAll ? activeRows : activeRows.filter(r => r.category === uiState.cat);
            const validCount = catRows.filter(r => r.eligible).length;
            const invalidCount = catRows.length - validCount;

            $('#ov-tab-valid').text(`У рейтингу (${validCount})`);
            $('#ov-tab-invalid').text(`Поза рейтингом (${invalidCount})`);

            if (!full) {
                $('#ov-median-badge').text(`Зріз до ${period.asOf}`);
            } else if (isAll) {
                $('#ov-median-badge').text('Медіана: за категорією будівлі');
            } else {
                const sampleMedian = catRows.find(r => r.median !== null)?.median;
                $('#ov-median-badge').html(
                    sampleMedian ? `Медіана групи: <b>${fmt(sampleMedian, 1)}</b> кВт·год/м²` : 'Медіана групи: —'
                );
            }

            const matches = catRows
                .filter(r => (uiState.showInvalid ? !r.eligible : r.eligible))
                .sort((a, b) => (b.intensity ?? -Infinity) - (a.intensity ?? -Infinity));

            const q = uiState.query.toLocaleLowerCase('uk').trim();
            const indexed = matches
                .map((r, i) => ({ r, i: i + 1 }))
                .filter(({ r }) => !q || `${r.b.name} ${r.b.address || ''} ${r.category}`.toLocaleLowerCase('uk').includes(q));

            const totalPages = Math.max(1, Math.ceil(indexed.length / 10));
            uiState.page = Math.max(1, Math.min(totalPages, uiState.page));
            const display = indexed.slice((uiState.page - 1) * 10, uiState.page * 10);

            if (!display.length) {
                $('#ov-rankrows').html(`<p class="empty">За цим фільтром споруд у ${data.year} році немає.</p>`);
            } else {
                const head = uiState.showInvalid
                    ? '<th>№</th><th>Будівля та адреса</th><th>Причина виключення з рейтингу</th><th>Спожито, МВт·год</th>'
                    : (full
                        ? '<th>Місце</th><th>Будівля та адреса</th><th>кВт·год/м²</th><th>Відхилення від медіани</th><th>Клас</th>'
                        : '<th>Місце</th><th>Будівля та адреса</th><th>кВт·год/м²</th><th>Спожито, МВт·год</th><th>Клас</th>');

                const body = display.map(({ r, i }) => {
                    const subParts = [r.b.address, isAll ? r.category : ''].filter(Boolean);
                    const addr = subParts.length ? `<span class="cell-meta row-addr">${esc(subParts.join(' · '))}</span>` : '';

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

                    if (!full) {
                        return `
                            <tr>
                                <td class="rank">${i}</td>
                                <td class="row-name"><button type="button" data-pass="${esc(r.b.id)}">${esc(r.b.name)}</button>${addr}</td>
                                <td class="num-strong">${fmt(r.intensity, 1)}</td>
                                <td>${fmt(r.mwh, 1)}</td>
                                <td><span class="cell-meta" title="Клас ефективності визначається лише за повний календарний рік">—</span></td>
                            </tr>
                        `;
                    }

                    const diffPct = r.median && r.intensity !== null ? ((r.intensity - r.median) / r.median) * 100 : null;
                    const diffSign = diffPct !== null ? (diffPct > 0 ? `+${fmt(diffPct, 0)}%` : `${fmt(diffPct, 0)}%`) : '—';
                    const diffCls = diffPct === null ? '' : diffPct > 15 ? 'diff-bad' : diffPct < -10 ? 'diff-good' : 'diff-neutral';
                    const ratioWidth = r.median && r.intensity !== null ? Math.min(100, Math.round((r.intensity / (r.median * 2)) * 100)) : 0;

                    const tip = r.grade ? (GRADE_TIPS[r.grade] || '') : '';
                    const gradeBadge = r.grade
                        ? `<span class="grade ${r.grade.toLowerCase()} grade-tip" data-tip="${esc(tip)}" aria-label="${esc(tip)}" tabindex="0">${r.grade}</span>`
                        : '—';

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

                const omittedCount = isAll
                    ? rows.length - activeRows.length
                    : rows.filter(r => r.category === uiState.cat && !r.hasData).length;
                const omittedNote = omittedCount > 0 ? ` · ще ${omittedCount} без даних у ${data.year} р.` : '';

                $('#ov-rankrows').html(`
                    <div class="table-wrap"><table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
                    <div class="table-end">
                        <span class="cell-meta">Показано ${display.length} із ${indexed.length} будівель · сторінка ${uiState.page} із ${totalPages}${omittedNote}</span>
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
                const catFile = isAll ? 'Всі-споруди' : uiState.cat;
                Core.downloadCsv(`Рейтинг-${uiState.year}-${catFile}.csv`, [
                    ['Місце', 'Будівля', 'Адреса', 'Категорія', 'Спожито, МВт·год', 'кВт·год/м²', 'Медіана групи', 'Клас', 'Причина виключення'],
                    ...indexed.map(({ r, i }) => [uiState.showInvalid ? '' : i, r.b.name, r.b.address, r.category, r.mwh, r.intensity, r.median, r.grade, r.excludes.join(' · ')])
                ]);
            });
        }

        function selectCategory(catName) {
            const isAll = catName === ALL_CAT;
            const prevDonut = uiState.donutCat;

            uiState.cat = catName;
            if (!isAll) {
                uiState.donutCat = catName;
            }
            uiState.page = 1;

            $('#ov-category').val(catName);
            $('#ov-pick-all').toggleClass('is-active', isAll);
            $('#ov-all-tag').text(isAll ? 'Обрано' : 'Усі →');

            $('#ov-cat-bars .bar-interactive').each(function () {
                $(this).toggleClass('is-active', !isAll && $(this).attr('data-pick-cat') === catName);
            });

            if (!isAll && prevDonut !== catName) {
                updateCategoryDonut(true);
            }
            drawRank();
        }

        updateCategoryDonut(false);
        requestAnimationFrame(() => updateCategoryDonut(true));
        drawRank();

        $('#ov-pick-all').on('click', () => {
            selectCategory(ALL_CAT);
        });

        $('#ov-cat-bars').on('click', '[data-pick-cat]', function () {
            selectCategory($(this).attr('data-pick-cat'));
        });

        $('#ov-jump-rank').on('click', () => {
            if (uiState.cat === ALL_CAT && uiState.donutCat) {
                selectCategory(uiState.donutCat);
            }
            document.getElementById('ov-ranking')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

        $('#ov-year').on('change', function () {
            uiState.year = $(this).val();
            uiState.page = 1;
            renderOverviewPage($main);
        });

        $('#ov-category').on('change', function () {
            selectCategory($(this).val());
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