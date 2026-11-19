window.Workspace = window.Workspace || {};

(function (W) {
    'use strict';

    const E = window.Energy;
    const { esc, fmt, grouped, csv, colors } = W;
    const { opt, ico, header, stat, pane, table, grade, periodSelect, methodology } = W.ui;

    // Побудова зведеної таблиці базового рівня СЕнМ за 2025 рік у розрізі суб'єктів громади та її експорт у CSV
    function drawBase() {
        const { data, gas } = W.state;
        const $host = $('#baseline'), rows = E.analyze(data, '2025', gas);
        if (!data.periods['2025']) {
            $host.html('<p class="empty">Завантажте річний звіт за 2025 рік.</p>');
            return;
        }
        const groups = grouped(rows, r => data.links?.[r.b.id] || '');
        const lines = [['Громада', rows], ...[...groups].map(([code, rs]) => [code ? (data.subjects?.[code] || code) + ' · ' + code : 'Суб’єкт не визначений', rs])];
        const values = lines.map(([group, rs]) => {
            const s = E.summary(rs);
            return [group, `${s.covered}/${rs.length}`, ...s.amounts.map((v, i) => s.counts[i] ? v : null), s.total, s.total === null ? null : s.total * .086];
        });
        const cols = ['Рівень', 'Покриття', 'Тепло, МВт·год', 'Електрика, МВт·год', 'Газ, МВт·год', 'Усього, МВт·год', 'т н. е.'];
        $host.html(table(cols, values.map(line => `<tr>${line.map(v => `<td>${typeof v === 'string' ? esc(v) : fmt(v)}</td>`).join('')}</tr>`).join('')) + `<button class="btn secondary extras" id="baseCSV">${ico('download')}Завантажити зведення і будівлі</button>`);
        $('#baseCSV').on('click', () => csv('Базовий-рівень-2025.csv', [cols, ...values, ...rows.map(r => [r.b.name, `${r.total !== null ? 1 : 0}/1`, ...r.converted, r.total, r.total === null ? null : r.total * .086])]));
    }

    // Рендеринг головної сторінки огляду енергоспоживання (картки KPI, графіки та інтерактивний рейтинг)
    function overview($main) {
        const st = W.state;
        const { data, year, gas } = st;

        if (!data.buildings.length || !Object.keys(data.periods).length) {
            const hasRegistry = data.buildings.length > 0;
            $main.html(
                header('Огляд енергоспоживання', '') +
                `<section class="panel">${pane(hasRegistry ? 'Реєстр завантажено' : 'Даних ще немає', hasRegistry ? 'Додайте річний звіт про споживання, щоб побачити показники громади.' : 'Для першої перевірки завантажте реєстр будівель і звіт за 2025 рік.')}<a class="btn primary" href="#import">${ico('upload')}Перейти до імпорту</a></section>`
            );
            return;
        }
        const rows = E.analyze(data, year, gas), s = E.summary(rows), cats = grouped(rows, r => r.b.category || ''), full = !!data.periods[year]?.full;
        const groups = [...cats].map(([name, list]) => ({ name, ...E.summary(list) })).sort((a, b) => (b.total || 0) - (a.total || 0));
        if (!cats.has(st.cat)) st.cat = groups.find(g => E.category(g.name) === 'Навчальні заклади')?.name || groups[0]?.name || '';
        const biggest = groups[0]?.total || 1, shares = s.amounts.map(v => s.total ? v / s.total * 100 : 0);
        let end = 0;
        const gradient = shares.map((v, i) => {
            const start = end;
            end += v;
            return `${colors[i]} ${start}% ${end}%`;
        }).join(',');
        const leg = E.energyNames.map((v, i) => `<span class="key-label"><i class="swatch" style="background:${colors[i]}"></i>${esc(v)}</span>`).join('');
        $main.html(header('Огляд енергоспоживання', 'Споживання, базовий рівень та порівняння будівель громади.', periodSelect() + `<a class="btn primary" href="#import">${ico('upload')}Імпорт XLSX</a>`)
            + `<section class="stats">${stat('Енергоспоживання', fmt(s.total, 0), 'МВт·год', full ? 'За повний звітний рік' : 'За неповний звітний період', 'bolt')}${stat('Будівлі у реєстрі', fmt(rows.length, 0), '', `${s.covered} з даними про енергію`, 'build')}${stat('Еквівалент споживання', fmt(s.total === null ? null : s.total * .086, 1), 'т н. е.', year === '2025' ? 'Базовий рівень СЕнМ' : 'За обраний період', 'leaf')}${stat('Доступні для рейтингу', String(rows.filter(r => r.eligible).length), '', full ? 'Після перевірки повноти' : 'Рейтинг доступний за повний рік', 'chart')}</section>
 <section class="dashboard overview-charts"><article class="panel">${pane('Споживання за категоріями', 'Сумарний обсяг за видами будівель', `<span class="pill unit">МВт·год</span>`)}<div class="bars">${groups.map(g => `<div class="bar-row"><span class="bar-label">${esc(E.category(g.name))}</span><div class="bar-track">${g.amounts.map((v, i) => `<span class="bar-segment" style="background:${colors[i]};width:${v / biggest * 100}%" title="${E.energyNames[i]}: ${fmt(v)} МВт·год"></span>`).join('')}</div><span class="bar-value">${fmt(g.total, 0)}</span></div>`).join('')}</div><div class="legend chart-foot">${leg}</div></article>
 <article class="panel">${pane('Структура споживання', 'Частка кожного енергоносія')}<div class="share-body"><div class="ring" style="background:${s.total ? `conic-gradient(${gradient})` : '#eaf0eb'}"><div class="ring-hole"><b>${s.total ? '100%' : '—'}</b><small>разом</small></div></div><div class="share-list">${E.energyNames.map((name, i) => `<div><span class="key-label"><i class="swatch" style="background:${colors[i]}"></i>${name}</span><strong>${s.counts[i] ? fmt(shares[i], 1) + '%' : '—'}</strong></div>`).join('')}</div></div></article></section>
 <section class="panel section-gap scroll-me" id="ranking">${pane('Рейтинг будівель', full ? 'За питомим споживанням у межах однієї категорії' : 'Дані неповного року доступні в паспортах будівель', `<button class="btn secondary" id="rankCSV">${ico('download')}CSV</button>`)}<div class="filterline"><select id="category" aria-label="Категорія будівель">${groups.map(g => opt(g.name, E.category(g.name), st.cat)).join('')}</select><label class="search">${ico('search')}<input id="query" aria-label="Пошук будівлі" placeholder="Пошук за назвою або адресою" value="${esc(st.query)}"></label><label><input type="checkbox" id="invalid" ${st.showInvalid ? 'checked' : ''}> Поза рейтингом</label></div><div id="rankrows"></div></section>
 <details class="panel details"><summary>Базовий рівень СЕнМ за 2025 рік · зведення та експорт</summary><div class="extras" id="baseline"></div></details>${methodology()}`);

        // Внутрішня функція фільтрації, пагінації та відображення таблиці рейтингу будівель
        const rank = () => {
            const matches = rows.filter(r => (r.b.category || '') === st.cat && (st.showInvalid ? !r.eligible : r.eligible)).sort((a, b) => (b.intensity ?? -Infinity) - (a.intensity ?? -Infinity));
            const indexed = matches.map((r, i) => ({ r, i: i + 1 })).filter(({ r }) => `${r.b.name} ${r.b.address}`.toLocaleLowerCase('uk').includes(st.query.toLocaleLowerCase('uk')));
            const n = Math.max(1, Math.ceil(indexed.length / 10));
            st.page = Math.max(1, Math.min(n, st.page));
            const display = indexed.slice((st.page - 1) * 10, st.page * 10);
            $('#rankrows').html((display.length ? table(['Місце', 'Будівля', st.showInvalid ? 'Причина' : 'кВт·год/м²', 'Медіана групи', 'Клас'], display.map(({ r, i }) => `<tr><td class="rank">${st.showInvalid ? '—' : i}</td><td class="row-name"><button data-pass="${esc(r.b.id)}">${esc(r.b.name)}</button></td><td>${st.showInvalid ? esc(r.excludes.join(' · ')) : fmt(r.intensity)}</td><td>${fmt(r.median)}</td><td>${grade(r.grade)}</td></tr>`).join('')) : `<p class="empty">${full ? 'За цим фільтром будівель немає.' : 'Для рейтингу оберіть повний рік. Увімкніть «Поза рейтингом», щоб переглянути будівлі.'}</p>`) + `<div class="table-end"><span class="cell-meta">${indexed.length} будівель · сторінка ${st.page} із ${n}</span><div class="section-actions"><button class="btn" id="prev" ${st.page === 1 ? 'disabled' : ''}>Назад</button><button class="btn" id="next" ${st.page === n ? 'disabled' : ''}>Далі</button></div></div>`);
            $('#prev').on('click', () => {
                st.page--;
                rank();
            });
            $('#next').on('click', () => {
                st.page++;
                rank();
            });
            $('#rankCSV').on('click', () => csv(`Рейтинг-${st.year}.csv`, [['Місце', 'Будівля', 'Категорія', 'кВт·год/м²', 'Медіана', 'Клас', 'Причина виключення'], ...indexed.map(({ r, i }) => [st.showInvalid ? '' : i, r.b.name, r.b.category, r.intensity, r.median, r.grade, r.excludes.join(' · ')])]));
        };
        rank();
        $('#year').on('change', function () {
            st.year = $(this).val();
            st.page = 1;
            W.render();
        });
        $('#category').on('change', function () {
            st.cat = $(this).val();
            st.page = 1;
            rank();
        });
        $('#query').on('input', function () {
            st.query = $(this).val();
            st.page = 1;
            rank();
        });
        $('#invalid').on('change', function () {
            st.showInvalid = $(this).prop('checked');
            st.page = 1;
            rank();
        });
        drawBase();
    }

    W.pages = W.pages || {};
    W.pages.overview = overview;
})(window.Workspace);