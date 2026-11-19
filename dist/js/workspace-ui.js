window.Workspace = window.Workspace || {};

(function (W) {
    'use strict';

    const { esc, fmt, displayYear } = W;

    // Генерація HTML-елемента <option> для випадаючих списків із визначенням вибраного пункту
    const opt = (v, label, current) => `<option value="${esc(v)}"${String(v) === String(current) ? ' selected' : ''}>${esc(label)}</option>`;

    // Генерація вбудованої векторної SVG-іконки за її назвою
    const ico = (name) => {
        const p = {
            bolt: 'm14 2-9 12h6l-1 8 9-13h-6l1-7Z',
            build: 'M4 21h16M6 20V4h12v16M9 8h1m4 0h1m-6 4h1m4 0h1m-4 8v-4h3v4',
            report: 'M5 3h11l3 3v15H5z M9 10h6m-6 4h6',
            chart: 'M4 20h16M7 16v-5m5 5V5m5 11V8',
            upload: 'M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5',
            download: 'M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4',
            search: 'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
            leaf: 'M3 17C2 8 8 4 21 3c-1 12-6 16-14 14m-3 3L16 8'
        };
        return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${p[name] || p.chart}"/></svg>`;
    };

    // Рендеринг верхньої шапки сторінки із заголовком, описом та панеллю кнопок дій
    function header(title, desc, action = '') {
        return `<div class="page-head">
    <div>
        <h1>${esc(title)}</h1>
        ${desc ? `<p class="subtitle">${esc(desc)}</p>` : ''}
    </div>
    <div class="actions no-print">${action}</div>
</div>`;
    }

    // Генерація HTML-картки окремого статистичного показника
    function stat(label, value, unit, note, icon) {
        return `<article class="stat"><div class="stat-head">${esc(label)}<span class="stat-mark">${ico(icon)}</span></div><strong>${value}<span class="suffix">${esc(unit)}</span></strong><div class="stat-note">${esc(note)}</div></article>`;
    }

    // Генерація HTML-заголовка внутрішньої панелі або картки контенту
    function pane(title, sub, right = '') {
        return `<div class="panel-head"><div><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${right}</div>`;
    }

    // Генерація HTML-обгортки та розмітки таблиці даних із заголовками та тілом
    const table = (headers, body) => `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;

    // Генерація кольорового бейджа класу енергоефективності будівлі (від A до G)
    const grade = g => g ? `<span class="grade ${g.toLowerCase()}">${g}</span>` : '—';

    // Генерація випадаючого списку вибору звітного року
    function periodSelect() {
        const { data, year } = W.state;
        return `<select id="year" aria-label="Звітний рік">${Object.keys(data.periods).sort().reverse().map(y => opt(y, displayYear(y), year)).join('')}</select>`;
    }

    // Генерація розгортаємого блоку з довідковою інформацією про методику розрахунків
    function methodology() {
        const { gas } = W.state;
        return `<details class="details panel method"><summary>Методика розрахунку</summary><p>Базовий рік — 2025. Тепло: Гкал × 1,163. Електроенергія: кВт·год ÷ 1000. Газ: м³ × ${fmt(gas, 4)} кВт·год/м³ ÷ 1000. Тонни нафтового еквівалента: МВт·год × 0,086 за формою СЕнМ. Вода в м³ розглядається окремо.</p><p>Загальна сума включає наявні невід’ємні значення. Пропуски позначені тире. Покриття означає кількість будівель із принаймні одним енергетичним показником. Якщо бракує показника для наявного типу лічильника, питомі показники не обчислюються. Реєстр приладів відображає дату його вивантаження.</p><p>Рейтинг розраховується за повний рік, за опалюваною площею понад 1 м², у межах категорії. Клас — відношення кВт·год/м² будівлі до медіани групи з щонайменше 5 будівель: A ≤ 0,60; B ≤ 0,80; C ≤ 0,95; D ≤ 1,05; E ≤ 1,20; F ≤ 1,50; G &gt; 1,50. Це аналітична оцінка, а не енергетичний сертифікат.</p><p>Типове значення газу 9,7 кВт·год/м³ — приклад перерахунку за нижчою теплотою 34,92 МДж/м³ в одній із зон за другу декаду грудня 2025 року. Для розрахунку громади задайте погоджений показник у розділі «Імпорт». <a href="https://poltavagaz.com.ua/archives/23821" target="_blank" rel="noopener">Дані АТ «Полтавагаз»</a>.</p></details>`;
    }

    W.ui = { opt, ico, header, stat, pane, table, grade, periodSelect, methodology };
})(window.Workspace);