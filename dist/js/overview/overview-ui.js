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

    const SORT_MODES = [
        {
            id: 'inefficient',
            label: 'Найменш економні',
            hint: 'Найвище питоме споживання (кВт·год/м²)',
            icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 11l4-4 3 3 5-6"/><path d="M10 4h4v4"/></svg>'
        },
        {
            id: 'efficient',
            label: 'Найбільш економні',
            hint: 'Найнижче питоме споживання (кВт·год/м²)',
            icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5l4 4 3-3 5 6"/><path d="M10 12h4V8"/></svg>'
        },
        {
            id: 'area_desc',
            label: 'Найбільші за площею',
            hint: 'Від найбільшої опалюваної площі (м²)',
            icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M6 10l4-4M7.5 6H10v2.5"/></svg>'
        },
        {
            id: 'area_asc',
            label: 'Найменші за площею',
            hint: 'Від найменшої опалюваної площі (м²)',
            icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M10 6L6 10M8.5 10H6V7.5"/></svg>'
        },
        {
            id: 'consumption_desc',
            label: 'За рівнем споживання',
            hint: 'Найбільший сумарний обсяг (МВт·год)',
            icon: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 1.8L3.5 9H8l-1 5.2L12.5 7H8l1-5.2z"/></svg>'
        }
    ];

    const PAGE_SIZES = [
        { value: 10, label: '10' },
        { value: 25, label: '25' },
        { value: 50, label: '50' },
        { value: 'all', label: 'Усі' }
    ];

    const CLOCK_ICON = `<svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="4.5"/><path d="M6 3.5v2.7l1.8 1.1"/></svg>`;
    const CHEVRON_ICON = `<svg class="ui-select-chevron" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>`;
    const CHECK_ICON = `<svg class="ui-opt-check" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-6.5"/></svg>`;
    const SEARCH_ICON = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>`;

    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = (v, p = 1) => (typeof v === 'number' && Number.isFinite(v))
        ? new Intl.NumberFormat('uk-UA', { maximumFractionDigits: p }).format(v)
        : '—';

    /* =========================================================================
       Кастомний селект під дизайн системи (автоматично для всіх <select>)
       ========================================================================= */
    function formatOptionParts(rawText) {
        const text = String(rawText || '').trim();
        const match = text.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
        if (!match) {
            return { main: text, tag: '', tagClass: '' };
        }
        const main = match[1].trim();
        const tag = match[2].trim();
        let tagClass = 'is-muted';

        if (/клас\s*[abc]\b/i.test(tag)) {
            tagClass = 'is-good';
        } else if (/клас\s*[de]\b/i.test(tag)) {
            tagClass = 'is-mid';
        } else if (/клас\s*[fg]\b/i.test(tag)) {
            tagClass = 'is-bad';
        }
        return { main, tag, tagClass };
    }

    function closeAllCustomSelects(exceptWrap = null) {
        document.querySelectorAll('.ui-select.is-open').forEach(wrap => {
            if (wrap === exceptWrap) return;
            wrap.classList.remove('is-open', 'align-right', 'open-up');
            const btn = wrap.querySelector('.ui-select-trigger');
            const menu = wrap.querySelector('.ui-select-menu');
            if (btn) btn.setAttribute('aria-expanded', 'false');
            if (menu) menu.hidden = true;
        });
    }

    function syncCustomSelect(selectEl) {
        if (!selectEl || !selectEl._uiWrap) return;
        const wrap = selectEl._uiWrap;
        const valueBox = wrap.querySelector('.ui-select-value');
        const optionsBox = wrap.querySelector('.ui-select-options');
        const searchWrap = wrap.querySelector('.ui-select-search');
        const searchInput = wrap.querySelector('.ui-select-search input');

        const opts = Array.from(selectEl.options || []);
        const selectedOpt = opts.find(o => o.selected) || opts[0];

        if (valueBox) {
            if (selectedOpt) {
                const { main, tag, tagClass } = formatOptionParts(selectedOpt.textContent);
                valueBox.innerHTML = tag
                    ? `<span class="ui-val-main">${esc(main)}</span><span class="ui-opt-tag ${tagClass}">${esc(tag)}</span>`
                    : `<span class="ui-val-main">${esc(main)}</span>`;
            } else {
                valueBox.textContent = '—';
            }
        }

        if (searchWrap) {
            searchWrap.hidden = opts.length <= 10;
        }

        if (optionsBox) {
            const q = (searchInput && !searchWrap?.hidden ? searchInput.value : '').toLocaleLowerCase('uk').trim();
            const filtered = opts.filter(o => !q || o.textContent.toLocaleLowerCase('uk').includes(q));

            if (!filtered.length) {
                optionsBox.innerHTML = '<div class="ui-select-empty">Нічого не знайдено</div>';
            } else {
                optionsBox.innerHTML = filtered.map(o => {
                    const isSel = o.value === selectEl.value;
                    const { main, tag, tagClass } = formatOptionParts(o.textContent);
                    return `
                        <button type="button" class="ui-select-option ${isSel ? 'is-selected' : ''}" role="option" aria-selected="${isSel ? 'true' : 'false'}" data-val="${esc(o.value)}" ${o.disabled ? 'disabled' : ''}>
                            <span class="ui-opt-text">${esc(main)}</span>
                            <span class="ui-opt-right">
                                ${tag ? `<span class="ui-opt-tag ${tagClass}">${esc(tag)}</span>` : ''}
                                ${isSel ? CHECK_ICON : ''}
                            </span>
                        </button>
                    `;
                }).join('');
            }
        }
    }

    function enhanceSelect(selectEl) {
        if (!selectEl || selectEl.dataset.uiEnhanced === '1') return;
        if (selectEl.multiple || Number(selectEl.size) > 1) return;

        selectEl.dataset.uiEnhanced = '1';
        selectEl.classList.add('ui-select-native');
        selectEl.tabIndex = -1;

        const wrap = document.createElement('div');
        wrap.className = 'ui-select';
        if (selectEl.classList.contains('wide-select')) {
            wrap.classList.add('wide-select');
        }

        const ariaLabel = selectEl.getAttribute('aria-label') || 'Оберіть значення';
        wrap.innerHTML = `
            <button type="button" class="ui-select-trigger" aria-haspopup="listbox" aria-expanded="false" aria-label="${esc(ariaLabel)}">
                <span class="ui-select-value"></span>
                ${CHEVRON_ICON}
            </button>
            <div class="ui-select-menu" role="listbox" hidden>
                <div class="ui-select-search" hidden>
                    ${SEARCH_ICON}
                    <input type="text" placeholder="Швидкий пошук..." autocomplete="off" aria-label="Пошук у списку">
                </div>
                <div class="ui-select-options"></div>
            </div>
        `;

        selectEl.parentNode.insertBefore(wrap, selectEl.nextSibling);
        selectEl._uiWrap = wrap;

        const trigger = wrap.querySelector('.ui-select-trigger');
        const menu = wrap.querySelector('.ui-select-menu');
        const searchInput = wrap.querySelector('.ui-select-search input');
        const optionsBox = wrap.querySelector('.ui-select-options');

        function openMenu() {
            closeAllCustomSelects(wrap);
            if (searchInput) searchInput.value = '';
            syncCustomSelect(selectEl);

            wrap.classList.remove('align-right', 'open-up');
            wrap.classList.add('is-open');
            menu.hidden = false;
            trigger.setAttribute('aria-expanded', 'true');

            const trigRect = trigger.getBoundingClientRect();
            const menuRect = menu.getBoundingClientRect();

            if (trigRect.left + menuRect.width > window.innerWidth - 14) {
                wrap.classList.add('align-right');
            }
            if (trigRect.bottom + menuRect.height > window.innerHeight - 14 && trigRect.top > menuRect.height + 20) {
                wrap.classList.add('open-up');
            }

            const activeOpt = optionsBox.querySelector('.ui-select-option.is-selected');
            if (activeOpt) {
                activeOpt.scrollIntoView({ block: 'nearest' });
            }
            if (searchInput && !wrap.querySelector('.ui-select-search').hidden) {
                requestAnimationFrame(() => searchInput.focus());
            }
        }

        function closeMenu(returnFocus = false) {
            wrap.classList.remove('is-open', 'align-right', 'open-up');
            menu.hidden = true;
            trigger.setAttribute('aria-expanded', 'false');
            if (returnFocus) trigger.focus();
        }

        trigger.addEventListener('click', e => {
            e.stopPropagation();
            if (wrap.classList.contains('is-open')) {
                closeMenu();
            } else {
                openMenu();
            }
        });

        trigger.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!wrap.classList.contains('is-open')) {
                    openMenu();
                }
            } else if (e.key === 'Escape') {
                closeMenu();
            }
        });

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                syncCustomSelect(selectEl);
            });
            searchInput.addEventListener('keydown', e => {
                if (e.key === 'Escape') {
                    e.stopPropagation();
                    closeMenu(true);
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const first = optionsBox.querySelector('.ui-select-option:not(:disabled)');
                    if (first) first.focus();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const first = optionsBox.querySelector('.ui-select-option:not(:disabled)');
                    if (first) first.click();
                }
            });
        }

        optionsBox.addEventListener('click', e => {
            const btn = e.target.closest('.ui-select-option');
            if (!btn || btn.disabled) return;
            const newVal = btn.getAttribute('data-val');
            const changed = selectEl.value !== newVal;
            selectEl.value = newVal;
            syncCustomSelect(selectEl);
            closeMenu(true);
            if (changed) {
                selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });

        optionsBox.addEventListener('keydown', e => {
            const items = Array.from(optionsBox.querySelectorAll('.ui-select-option:not(:disabled)'));
            const idx = items.indexOf(document.activeElement);
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = items[idx + 1] || items[0];
                if (next) next.focus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (idx <= 0 && searchInput && !wrap.querySelector('.ui-select-search').hidden) {
                    searchInput.focus();
                } else {
                    const prev = items[idx - 1] || items[items.length - 1];
                    if (prev) prev.focus();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeMenu(true);
            }
        });

        selectEl.addEventListener('change', () => syncCustomSelect(selectEl));
        syncCustomSelect(selectEl);
    }

    function enhanceAllSelects(root = document) {
        root.querySelectorAll('select').forEach(enhanceSelect);
    }

    let selectObserverStarted = false;
    function startSelectObserver() {
        if (selectObserverStarted) return;
        selectObserverStarted = true;

        document.addEventListener('click', e => {
            if (!e.target.closest('.ui-select')) {
                closeAllCustomSelects();
            }
        });

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                closeAllCustomSelects();
            }
        });

        const observer = new MutationObserver(mutations => {
            for (const m of mutations) {
                if (m.type === 'childList') {
                    m.addedNodes.forEach(node => {
                        if (node.nodeType !== 1) return;
                        if (node.tagName === 'SELECT') enhanceSelect(node);
                        else if (node.querySelectorAll) enhanceAllSelects(node);
                    });
                    if (m.target && m.target.tagName === 'SELECT') {
                        syncCustomSelect(m.target);
                    }
                } else if (m.type === 'attributes' && m.target?.tagName === 'OPTION') {
                    const parentSel = m.target.closest('select');
                    if (parentSel) syncCustomSelect(parentSel);
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['selected', 'disabled']
        });

        enhanceAllSelects(document);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startSelectObserver);
    } else {
        startSelectObserver();
    }

    /* =========================================================================
       Логіка сторінки «Огляд енергоспоживання»
       ========================================================================= */
    const uiState = {
        year: '2025',
        cat: '',
        donutCat: '',
        query: '',
        sort: 'inefficient',
        page: 1,
        pageSize: 10,
        extraRows: 0,
        showInvalid: false
    };

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

    function sortRows(list, mode) {
        const asc = (a, b) => {
            const va = typeof a === 'number' && Number.isFinite(a) ? a : Infinity;
            const vb = typeof b === 'number' && Number.isFinite(b) ? b : Infinity;
            return va - vb;
        };
        const desc = (a, b) => {
            const va = typeof a === 'number' && Number.isFinite(a) ? a : -Infinity;
            const vb = typeof b === 'number' && Number.isFinite(b) ? b : -Infinity;
            return vb - va;
        };

        return [...list].sort((a, b) => {
            switch (mode) {
                case 'efficient':
                    return asc(a.intensity, b.intensity);
                case 'area_desc':
                    return desc(a.b?.area > 1 ? a.b.area : null, b.b?.area > 1 ? b.b.area : null);
                case 'area_asc':
                    return asc(a.b?.area > 1 ? a.b.area : null, b.b?.area > 1 ? b.b.area : null);
                case 'consumption_desc':
                    return desc(a.mwh, b.mwh);
                case 'inefficient':
                default:
                    return desc(a.intensity, b.intensity);
            }
        });
    }

    function buildPageTokens(current, total) {
        if (total <= 7) {
            return Array.from({ length: total }, (_, idx) => idx + 1);
        }
        const pages = new Set([1, total, current - 1, current, current + 1]);
        if (current <= 3) {
            pages.add(2);
            pages.add(3);
            pages.add(4);
        }
        if (current >= total - 2) {
            pages.add(total - 1);
            pages.add(total - 2);
            pages.add(total - 3);
        }
        const sorted = [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
        const tokens = [];
        for (let i = 0; i < sorted.length; i++) {
            if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
                tokens.push('...');
            }
            tokens.push(sorted[i]);
        }
        return tokens;
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
        const { rows, activeRows, summary: s, groups, full, periodMeta, years, period } = data;
        const canGrade = periodMeta.enoughForGrade;

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

        const rankSubtitle = full
            ? 'Порівняння питомого споживання з медіаною своєї категорії за повний звітний рік'
            : (canGrade
                ? `Попередня оцінка за неповний ${data.year} рік (до ${esc(period.asOf)}) · позначка <span class="inline-partial-badge">${CLOCK_ICON}</span> означає неповний рік`
                : `Даних за ${data.year} рік менше 1 місяця (до ${esc(period.asOf)}) · оцінка класу A–G прихована`);

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

                <!-- Права картка: клікабельна смуга громади + блок обраної категорії або громади -->
                <article class="panel structure-panel">
                    <div class="panel-head">
                        <div>
                            <h2>Структура споживання</h2>
                            <p>Баланс енергоносіїв по громаді та категорії</p>
                        </div>
                        <span class="pill unit">${s.total ? `${fmt(s.total, 0)} МВт·год` : '—'}</span>
                    </div>

                    <!-- 1. Клікабельний блок по всій громаді за обраний рік -->
                    <button type="button" class="comm-mix comm-mix-btn ${isAllSelected ? 'is-active' : ''}" id="ov-pick-all" title="Показати всі ${activeRows.length} споруд за ${data.year} рік у структурі та таблиці">
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

                    <!-- 2. Нижній блок з анімованим SVG-кругом для обраної категорії або всієї громади -->
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
                        <p>${rankSubtitle}</p>
                    </div>
                    <div class="actions">
                        <span class="pill median-pill" id="ov-median-badge">Медіана групи: —</span>
                        <button type="button" class="btn secondary" id="ov-rank-csv">Експорт CSV</button>
                    </div>
                </div>

                <!-- Рядок 1: Категорія + Пошук + Вкладки рейтингу -->
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

                <!-- Рядок 2: Швидкі фільтри сортування -->
                <div class="sort-toolbar" role="group" aria-label="Сортування списку будівель">
                    <span class="sort-toolbar-label">Сортувати:</span>
                    <div class="sort-pills" id="ov-sort-pills">
                        ${SORT_MODES.map(m => `
                            <button type="button" class="sort-pill ${uiState.sort === m.id ? 'is-active' : ''}" data-sort="${m.id}" title="${esc(m.hint)}">
                                ${m.icon}
                                <span>${esc(m.label)}</span>
                            </button>
                        `).join('')}
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

        enhanceAllSelects($main[0]);

        function updateCategoryDonut(animateEntrance = true) {
            const isAll = uiState.cat === ALL_CAT;
            const g = isAll
                ? {
                    name: 'Уся громада (усі категорії)',
                    covered: s.covered,
                    count: rows.length,
                    total: s.total,
                    amounts: s.amounts,
                    counts: s.counts,
                    shares: s.shares,
                    toe: s.toe,
                    costMln: s.costMln
                }
                : (groups.find(item => item.name === uiState.cat) || groups.find(item => item.name === uiState.donutCat) || groups[0]);
            if (!g) return;

            const $box = $('#ov-cat-drilldown');
            if (animateEntrance) {
                $box.removeClass('is-animating');
                void $box[0]?.offsetWidth;
                $box.addClass('is-animating');
            }

            const shareOfComm = isAll
                ? 100
                : (s.total && g.total ? (g.total / s.total) * 100 : 0);

            $('#ov-drill-meta').text(`${g.covered} із ${g.count} будівель зі споживанням`);
            $('#ov-drill-title').text(g.name);

            if (g.costMln) {
                $('#ov-drill-cost').text(`≈ ${fmt(g.costMln, 1)} млн грн`).show();
            } else {
                $('#ov-drill-cost').hide();
            }

            $('#ov-ring-total').text(g.total !== null ? fmt(g.total, 0) : '0');
            $('#ov-ring-share').text(s.total ? `${fmt(shareOfComm, isAll ? 0 : 1)}% громади` : 'немає даних');

            const catMedian = !isAll && canGrade
                ? rows.find(r => r.category === g.name && r.median !== null)?.median
                : null;
            const toeText = g.toe !== null ? `${fmt(g.toe, 1)} т н. е.` : 'немає даних';
            const extraText = isAll
                ? ` · ${groups.length} категорій`
                : (catMedian ? ` · медіана ${fmt(catMedian, 1)} кВт·год/м²` : '');
            $('#ov-drill-toe').text(toeText + extraText);

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

        function scrollToRankingTop() {
            const el = document.getElementById('ov-ranking');
            if (!el) return;
            const rect = el.getBoundingClientRect();
            if (rect.top < 0) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }

        function drawRank() {
            const isAll = uiState.cat === ALL_CAT;
            const catRows = isAll ? activeRows : activeRows.filter(r => r.category === uiState.cat);
            const validCount = catRows.filter(r => r.eligible).length;
            const invalidCount = catRows.length - validCount;

            $('#ov-tab-valid').text(`У рейтингу (${validCount})`);
            $('#ov-tab-invalid').text(`Поза рейтингом (${invalidCount})`);

            if (!canGrade) {
                $('#ov-median-badge').text(`Зріз до ${period.asOf} (< 1 міс.)`);
            } else if (isAll) {
                $('#ov-median-badge').text(full ? 'Медіана: за категорією будівлі' : `Медіана: за категорією (до ${period.asOf})`);
            } else {
                const sampleMedian = catRows.find(r => r.median !== null)?.median;
                const medPrefix = full ? 'Медіана групи' : `Медіана (до ${period.asOf})`;
                $('#ov-median-badge').html(
                    sampleMedian ? `${medPrefix}: <b>${fmt(sampleMedian, 1)}</b> кВт·год/м²` : `${medPrefix}: —`
                );
            }

            const filtered = catRows.filter(r => (uiState.showInvalid ? !r.eligible : r.eligible));
            const sorted = sortRows(filtered, uiState.sort);

            const q = uiState.query.toLocaleLowerCase('uk').trim();
            const indexed = sorted
                .map((r, i) => ({ r, i: i + 1 }))
                .filter(({ r }) => !q || `${r.b.name} ${r.b.address || ''} ${r.category}`.toLocaleLowerCase('uk').includes(q));

            const totalItems = indexed.length;
            const isShowAll = uiState.pageSize === 'all';
            const baseSize = isShowAll ? Math.max(1, totalItems) : Number(uiState.pageSize) || 10;
            const totalPages = isShowAll ? 1 : Math.max(1, Math.ceil(totalItems / baseSize));

            uiState.page = Math.max(1, Math.min(totalPages, uiState.page));
            const startIdx = isShowAll ? 0 : (uiState.page - 1) * baseSize;
            const endIdx = isShowAll ? totalItems : Math.min(totalItems, startIdx + baseSize + uiState.extraRows);
            const display = indexed.slice(startIdx, endIdx);
            const remaining = Math.max(0, totalItems - endIdx);

            const isAreaSort = uiState.sort === 'area_desc' || uiState.sort === 'area_asc';
            const isConsSort = uiState.sort === 'consumption_desc';
            const isEconSort = uiState.sort === 'inefficient' || uiState.sort === 'efficient';

            if (!display.length) {
                $('#ov-rankrows').html(`<p class="empty">За цим фільтром споруд у ${data.year} році немає.</p>`);
            } else {
                const head = uiState.showInvalid
                    ? '<th>№</th><th>Будівля та адреса</th><th>Площа / Обсяг</th><th>Причина виключення з рейтингу</th>'
                    : (canGrade
                        ? '<th>№</th><th>Будівля та адреса</th><th>Площа / Обсяг</th><th>кВт·год/м²</th><th>Відхилення від медіани</th><th>Клас</th>'
                        : '<th>№</th><th>Будівля та адреса</th><th>Площа / Обсяг</th><th>кВт·год/м²</th><th>Клас</th>');

                const body = display.map(({ r, i }) => {
                    const subParts = [r.b.address, isAll ? r.category : ''].filter(Boolean);
                    const addr = subParts.length ? `<span class="cell-meta row-addr">${esc(subParts.join(' · '))}</span>` : '';

                    const areaText = r.b.area > 1 ? `${fmt(r.b.area, 0)} м²` : 'площа —';
                    const mwhText = `${fmt(r.mwh, 1)} МВт·год`;
                    const metricsCell = `
                        <div class="metric-stack">
                            <span class="${isAreaSort ? 'metric-highlight' : 'metric-main'}">${areaText}</span>
                            <span class="${isConsSort ? 'metric-highlight' : 'cell-meta'}">${mwhText}</span>
                        </div>
                    `;

                    if (uiState.showInvalid) {
                        return `
                            <tr>
                                <td class="rank">${i}</td>
                                <td class="row-name"><button type="button" data-pass="${esc(r.b.id)}">${esc(r.b.name)}</button>${addr}</td>
                                <td>${metricsCell}</td>
                                <td><span class="defect-tag">${esc(r.excludes.join(' · '))}</span></td>
                            </tr>
                        `;
                    }

                    if (!canGrade) {
                        const shortTip = `Оцінка класу прихована: у звіті менше 1 місяця даних (до ${period.asOf})`;
                        return `
                            <tr>
                                <td class="rank">${i}</td>
                                <td class="row-name"><button type="button" data-pass="${esc(r.b.id)}">${esc(r.b.name)}</button>${addr}</td>
                                <td>${metricsCell}</td>
                                <td class="${isEconSort ? 'num-strong' : ''}">${fmt(r.intensity, 1)}</td>
                                <td><span class="cell-meta grade-tip" data-tip="${esc(shortTip)}" tabindex="0">—</span></td>
                            </tr>
                        `;
                    }

                    const diffPct = r.median && r.intensity !== null ? ((r.intensity - r.median) / r.median) * 100 : null;
                    const diffSign = diffPct !== null ? (diffPct > 0 ? `+${fmt(diffPct, 0)}%` : `${fmt(diffPct, 0)}%`) : '—';
                    const diffCls = diffPct === null ? '' : diffPct > 15 ? 'diff-bad' : diffPct < -10 ? 'diff-good' : 'diff-neutral';
                    const ratioWidth = r.median && r.intensity !== null ? Math.min(100, Math.round((r.intensity / (r.median * 2)) * 100)) : 0;

                    const baseTip = r.grade ? (GRADE_TIPS[r.grade] || '') : '';
                    const tip = r.isPartialGrade
                        ? `${baseTip} · Попередня оцінка за неповний рік (зріз до ${period.asOf})`
                        : baseTip;

                    const partialBadge = r.isPartialGrade
                        ? `<i class="grade-partial-mark" aria-hidden="true">${CLOCK_ICON}</i>`
                        : '';

                    const gradeBadge = r.grade
                        ? `<span class="grade ${r.grade.toLowerCase()} ${r.isPartialGrade ? 'is-partial' : ''} grade-tip" data-tip="${esc(tip)}" aria-label="${esc(tip)}" tabindex="0">${r.grade}${partialBadge}</span>`
                        : '—';

                    return `
                        <tr>
                            <td class="rank">${i}</td>
                            <td class="row-name"><button type="button" data-pass="${esc(r.b.id)}">${esc(r.b.name)}</button>${addr}</td>
                            <td>${metricsCell}</td>
                            <td class="${isEconSort ? 'num-strong' : ''}">${fmt(r.intensity, 1)}</td>
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
                const omittedNote = omittedCount > 0 ? ` · без даних у ${data.year} р.: ${omittedCount}` : '';

                const pageTokens = buildPageTokens(uiState.page, totalPages);
                const pageButtonsHtml = totalPages > 1
                    ? `
                        <div class="pager-pages" role="navigation" aria-label="Сторінки рейтингу">
                            <button type="button" class="page-btn" data-page="${uiState.page - 1}" ${uiState.page === 1 ? 'disabled' : ''} title="Попередня сторінка" aria-label="Попередня сторінка">‹</button>
                            ${pageTokens.map(tok => tok === '...'
                                ? '<span class="page-dots">…</span>'
                                : `<button type="button" class="page-btn ${tok === uiState.page ? 'is-active' : ''}" data-page="${tok}">${tok}</button>`
                            ).join('')}
                            <button type="button" class="page-btn" data-page="${uiState.page + 1}" ${uiState.page === totalPages ? 'disabled' : ''} title="Наступна сторінка" aria-label="Наступна сторінка">›</button>
                            ${totalPages > 5 ? `
                                <label class="page-jump" title="Швидкий перехід на сторінку">
                                    <span>Стор.</span>
                                    <input type="number" id="ov-page-jump" min="1" max="${totalPages}" value="${uiState.page}" aria-label="Номер сторінки">
                                </label>
                            ` : ''}
                        </div>
                    `
                    : '';

                const loadMoreHtml = (!isShowAll && remaining > 0)
                    ? `<button type="button" class="btn secondary btn-load-more" id="ov-load-more">Показати ще +${Math.min(baseSize, remaining)}</button>`
                    : '';

                $('#ov-rankrows').html(`
                    <div class="table-wrap"><table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
                    <div class="pager-bar">
                        <div class="pager-left">
                            <span class="cell-meta">Показано <b>${startIdx + 1}–${endIdx}</b> із <b>${totalItems}</b>${omittedNote}</span>
                            <div class="page-size-group" role="group" aria-label="Рядків на сторінці">
                                <span class="cell-meta">Рядків:</span>
                                ${PAGE_SIZES.map(ps => `
                                    <button type="button" class="size-pill ${String(uiState.pageSize) === String(ps.value) ? 'is-active' : ''}" data-pagesize="${ps.value}">${ps.label}</button>
                                `).join('')}
                            </div>
                        </div>
                        <div class="pager-right">
                            ${loadMoreHtml}
                            ${pageButtonsHtml}
                        </div>
                    </div>
                `);
            }

            $('#ov-rankrows .page-btn').on('click', function () {
                const target = Number($(this).attr('data-page'));
                if (!Number.isFinite(target) || target < 1 || target > totalPages) return;
                uiState.page = target;
                uiState.extraRows = 0;
                drawRank();
                scrollToRankingTop();
            });

            $('#ov-page-jump').on('change keydown', function (e) {
                if (e.type === 'keydown' && e.key !== 'Enter') return;
                const val = Math.max(1, Math.min(totalPages, Math.round(Number($(this).val()) || 1)));
                uiState.page = val;
                uiState.extraRows = 0;
                drawRank();
                scrollToRankingTop();
            });

            $('#ov-load-more').on('click', () => {
                uiState.extraRows += baseSize;
                drawRank();
            });

            $('#ov-rankrows .size-pill').on('click', function () {
                const raw = $(this).attr('data-pagesize');
                uiState.pageSize = raw === 'all' ? 'all' : Number(raw);
                uiState.page = 1;
                uiState.extraRows = 0;
                drawRank();
            });

            $('#ov-rank-csv').off('click').on('click', () => {
                const catFile = isAll ? 'Всі-споруди' : uiState.cat;
                Core.downloadCsv(`Рейтинг-${uiState.year}-${catFile}.csv`, [
                    ['№', 'Будівля', 'Адреса', 'Категорія', 'Опал. площа, м²', 'Спожито, МВт·год', 'кВт·год/м²', 'Медіана групи', 'Клас', 'Примітка періоду', 'Причина виключення'],
                    ...indexed.map(({ r, i }) => [
                        i,
                        r.b.name,
                        r.b.address,
                        r.category,
                        r.b.area > 1 ? r.b.area : '',
                        r.mwh,
                        r.intensity,
                        r.median,
                        r.grade,
                        r.isPartialGrade ? `Неповний рік (до ${period.asOf})` : (full ? 'Повний рік' : ''),
                        r.excludes.join(' · ')
                    ])
                ]);
            });
        }

        function selectCategory(catName) {
            const isAll = catName === ALL_CAT;
            const prevCat = uiState.cat;

            uiState.cat = catName;
            if (!isAll) {
                uiState.donutCat = catName;
            }
            uiState.page = 1;
            uiState.extraRows = 0;

            const catSelect = document.getElementById('ov-category');
            if (catSelect) {
                catSelect.value = catName;
                syncCustomSelect(catSelect);
            }

            $('#ov-pick-all').toggleClass('is-active', isAll);
            $('#ov-all-tag').text(isAll ? 'Обрано' : 'Усі →');

            $('#ov-cat-bars .bar-interactive').each(function () {
                $(this).toggleClass('is-active', !isAll && $(this).attr('data-pick-cat') === catName);
            });

            if (prevCat !== catName) {
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
            document.getElementById('ov-ranking')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

        $('#ov-year').on('change', function () {
            uiState.year = $(this).val();
            uiState.page = 1;
            uiState.extraRows = 0;
            renderOverviewPage($main);
        });

        $('#ov-category').on('change', function () {
            selectCategory($(this).val());
        });

        $('#ov-query').on('input', function () {
            uiState.query = $(this).val();
            uiState.page = 1;
            uiState.extraRows = 0;
            drawRank();
        });

        $('.seg-btn').on('click', function () {
            uiState.showInvalid = $(this).data('mode') === 'invalid';
            uiState.page = 1;
            uiState.extraRows = 0;
            $('.seg-btn').removeClass('is-active');
            $(this).addClass('is-active');
            drawRank();
        });

        $('#ov-sort-pills').on('click', '.sort-pill', function () {
            const nextSort = $(this).attr('data-sort');
            if (!nextSort || nextSort === uiState.sort) return;
            uiState.sort = nextSort;
            uiState.page = 1;
            uiState.extraRows = 0;
            $('#ov-sort-pills .sort-pill').removeClass('is-active');
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

    A.syncSelect = syncCustomSelect;
    A.pages = A.pages || {};
    A.pages.overview = renderOverviewPage;
})(window.App);