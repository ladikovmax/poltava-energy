window.Workspace = window.Workspace || {};

(function (W) {
    'use strict';

    const E = window.Energy;
    const { esc, fmt, displayYear } = W;
    const { opt, ico, header, stat, pane, table, methodology } = W.ui;

    // Рендеринг сторінки детального енергетичного паспорта обраної будівлі з можливістю друку
    function passport($main) {
        const st = W.state;
        const { data, gas } = st;
        const sel = new URLSearchParams(location.hash.split('?')[1] || '').get('id') || st.passportId;
        const list = [...data.buildings].sort((a, b) => a.name.localeCompare(b.name, 'uk'));
        if (!list.length) {
            $main.html(header('Паспорт будівлі', 'Завантажте реєстр будівель.') + '<a class="btn primary" href="#import">Імпорт XLSX</a>');
            return;
        }
        const baseRows = E.analyze(data, '2025', gas), b = list.find(x => x.id === sel) || baseRows.find(r => r.eligible && r.grade)?.b || list[0];
        st.passportId = b.id;
        const base = baseRows.find(r => r.b.id === b.id), years = Object.keys(data.periods).sort();
        const facts = [['Категорія', b.category], ['Адреса', b.address], ['Рік забудови', b.year], ['Поверховість', b.floors], ['Опалювана площа', E.finite(b.area) ? fmt(b.area) + ' м²' : ''], ['Опалюваний об’єм', E.finite(b.volume) ? fmt(b.volume) + ' м³' : ''], ['Опалення', b.heating], ['Суб’єкт СЕнМ', data.subjects?.[data.links?.[b.id]]]];
        $main.html(header('Паспорт будівлі', b.name, `<button class="btn secondary" id="print">${ico('download')}Друк / PDF</button>`) + `<div class="toolbar no-print"><label class="field wide-select">Будівля<select id="pick">${list.map(x => opt(x.id, x.name, b.id)).join('')}</select></label></div><section class="stats">${stat('Базовий рівень · 2025', fmt(base.total), 'МВт·год', `${fmt(base.total === null ? null : base.total * .086)} т н. е. за наявними значеннями`, 'bolt')}${stat('Питоме споживання', fmt(base.intensity), 'кВт·год/м²', `${fmt(base.byVolume)} кВт·год/м³ опалюваного об’єму`, 'build')}${stat('Умовний клас', base.grade || '—', '', `Медіана групи: ${fmt(base.median)} кВт·год/м²`, 'leaf')}</section>
 <section class="panel">${pane('Характеристики будівлі', 'За реєстром uMuni')}<dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v || 'Немає даних')}</dd></div>`).join('')}</dl><p class="footnote">Лічильники: ${esc(Object.entries(b.meters || {}).map(([k, n]) => `${k} — ${n}`).join(' · ') || 'даних немає')}.</p></section>
 <section class="panel">${pane('Показники споживання', 'Значення у вихідних одиницях. Тире означає пропуск.')} ${table(['Ресурс', 'Одиниця', ...years.map(displayYear)], E.resources.map((n, i) => `<tr><td>${n}</td><td>${E.units[i]}</td>${years.map(y => `<td>${fmt(b.years[y]?.[i], 2)}</td>`).join('')}</tr>`).join(''))}</section>
 <section class="panel">${pane('Порівняння з аналогами', 'Базовий 2025 рік')}<p>${base.eligible && base.median > 0 ? `Споживання будівлі — <strong>${fmt(base.intensity)} кВт·год/м²</strong>. Медіана категорії — <strong>${fmt(base.median)} кВт·год/м²</strong> (${base.peerCount} будівель). Відхилення — ${fmt((base.intensity / base.median - 1) * 100)}%.` : esc(base.excludes.join(' · ') || 'Недостатньо даних для порівняння.')}</p><p class="footnote">Аналітична оцінка. Не є енергетичним сертифікатом.${!base.grade && base.eligible ? ' Для класу потрібні щонайменше п’ять будівель та додатна медіана.' : ''}</p></section>${methodology()}`);
        $('#pick').on('change', function () {
            location.hash = 'passport?id=' + encodeURIComponent($(this).val());
        });
        $('#print').on('click', () => window.print());
    }

    W.pages = W.pages || {};
    W.pages.passport = passport;
})(window.Workspace);