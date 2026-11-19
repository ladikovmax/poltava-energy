window.Workspace = window.Workspace || {};

(function (W) {
    'use strict';

    const E = window.Energy;
    const keys = window.EnergyStorage.keys;

    // Безпечне зчитування та парсинг JSON-даних із localStorage браузера
    function readStore(k) {
        try {
            return JSON.parse(localStorage.getItem(k));
        } catch {
            return null;
        }
    }

    const initialData = readStore(keys.workspace) || window.EnergyImport.empty();
    const initialGas = Number(readStore(keys.gas)) || E.gasDefault;
    const initialYear = initialData.periods['2025'] ? '2025' : Object.keys(initialData.periods).sort().at(-1) || '2025';

    // Спільний стан застосунку, доступний усім сторінкам
    W.state = {
        data: initialData,
        gas: initialGas,
        year: initialYear,
        cat: '',
        query: '',
        page: 1,
        showInvalid: false,
        passportId: '',
        importMsg: []
    };

    W.colors = ['#1c5744', '#71ab86', '#c0df73'];
    W.keys = keys;

    let timer;

    // Екранування спеціальних HTML-символів для захисту від XSS-вразливостей
    W.esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));

    // Форматування числових значень згідно з українською локаллю (або виведення тире, якщо значення відсутнє)
    W.fmt = (v, precision = 1) => E.finite(v)
        ? new Intl.NumberFormat('uk-UA', { maximumFractionDigits: precision }).format(v)
        : '—';

    // Перетворення дати з формату РРРР-ММ-ДД у ДД.ММ.РРРР
    W.date = s => s
        ? /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('.') : String(s)
        : '—';

    // Формування підпису звітного періоду (повний рік або неповний із вказанням кінцевої дати)
    W.displayYear = y => W.state.data.periods[y]?.full
        ? `${y} рік`
        : `${y} · до ${W.date(W.state.data.periods[y]?.asOf)}`;

    // Групування масиву записів у об'єкт Map за ключем, що повертає функція getKey
    W.grouped = function (rows, getKey) {
        const g = new Map();
        for (const r of rows) {
            const k = getKey(r);
            if (!g.has(k)) g.set(k, []);
            g.get(k).push(r);
        }
        return g;
    };

    // Відображення тимчасового спливаючого повідомлення (toast) на 4.8 секунди
    W.notify = function (msg) {
        const $t = $('#toast');
        $t.text(msg);
        clearTimeout(timer);
        timer = setTimeout(() => $t.text(''), 4800);
    };

    // Збереження поточного стану робочих даних у localStorage із обробкою переповнення пам'яті
    W.save = function () {
        try {
            localStorage.setItem(keys.workspace, JSON.stringify(W.state.data));
        } catch {
            W.notify('Сховище браузера заповнене. Зміни доступні у відкритій вкладці.');
        }
    };

    // Ініціація завантаження текстового або CSV-файлу користувачем через віртуальне посилання
    W.download = function (name, text) {
        const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        $('<a>', { href: url, download: name })[0].click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    // Формування CSV-рядків із BOM-маркером UTF-8 та запуск завантаження файлу
    W.csv = function (name, rows) {
        const cell = v => `"${String(v ?? '').replaceAll('"', '""')}"`;
        W.download(name, '\uFEFF' + rows.map(r => r.map(cell).join(',')).join('\r\n'));
    };
})(window.Workspace);