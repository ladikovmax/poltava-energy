/* Browser-local calculations shared by the overview, passport and exports. */
(() => {
    'use strict';

    const energyNames = ['Тепло', 'Електроенергія', 'Природний газ'];
    const resources = [...energyNames, 'Холодна вода', 'Гаряча вода'];
    const units = ['Гкал', 'кВт·год', 'м³', 'м³', 'м³'];
    const gasDefault = 9.7; // 34.92 MJ/m³ divided by 3.6; illustrative local sample, not an annual average.

    // Перевірка, чи є значення скінченним числом (виключає NaN, Infinity та нечислові типи)
    const finite = x => typeof x === 'number' && Number.isFinite(x);

    // Обчислення медіани числового масиву (повертає null для порожнього списку)
    function median(values) {
        if (!values.length) return null;
        const s = [...values].sort((a, b) => a - b), mid = Math.floor(s.length / 2);
        return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    }

    // Приведення назви категорії будівлі до стандартизованого відображуваного вигляду
    function category(s) {
        const n = (s || '').toLowerCase();
        if (n.includes('дошкіль')) return 'Дошкільні заклади';
        if (n.includes('навчаль')) return 'Навчальні заклади';
        if (n.includes('здоров')) return 'Заклади охорони здоров’я';
        if (n.includes('громадськ')) return 'Громадські будівлі';
        if (n.includes('спорт')) return 'Спортивні споруди';
        if (n.includes('житлов')) return 'Житлові будинки';
        return s || 'Без категорії';
    }

    // Визначення індексів обов'язкових енергоносіїв на основі наявних у будівлі лічильників
    function requiredCarriers(meters) {
        const set = new Set();
        for (const [name, count] of Object.entries(meters || {})) {
            if (!count) continue;
            if (/теплова енергія|теплопостачання/i.test(name)) set.add(0);
            if (/електр/i.test(name)) set.add(1);
            if (/газ/i.test(name)) set.add(2);
        }
        return set;
    }

    // Комплексний розрахунок споживання в МВт·год, питомих показників, перевірка якості даних та визначення класу енергоефективності (A–G)
    function analyze(data, year, gas = gasDefault) {
        const settled = data.periods[year]?.full === true;
        const rows = data.buildings.map(b => {
            const raw = b.years?.[year] || Array(5).fill(null);
            const factors = [1.163, 0.001, gas / 1000];
            const converted = factors.map((factor, i) => finite(raw[i]) && raw[i] >= 0 ? raw[i] * factor : null);
            const present = converted.filter(finite);
            const total = present.length ? present.reduce((a, v) => a + v, 0) : null;
            const issues = [], excludes = [];
            if (!settled) excludes.push('Неповний звітний рік');
            if (!b.category) excludes.push('Не визначена категорія');
            if (!(b.area > 1)) excludes.push('Опалювана площа відсутня або ≤ 1 м²');
            if (total === null) excludes.push('Немає показників енергоспоживання');
            if (raw.some(v => finite(v) && v < 0)) excludes.push('Є від’ємне споживання');
            const missing = [...requiredCarriers(b.meters)].filter(i => !finite(converted[i]));
            if (missing.length) excludes.push('Є лічильник, бракує даних: ' + missing.map(i => energyNames[i]).join(', '));
            issues.push(...excludes.filter(reason => reason !== 'Неповний звітний рік'));
            if (!(b.volume > 0)) issues.push('Не вказаний опалюваний об’єм');
            const usable = total !== null && !missing.length && !raw.some(v => finite(v) && v < 0);
            const intensity = usable && b.area > 1 ? total * 1000 / b.area : null;
            const byVolume = usable && b.volume > 0 ? total * 1000 / b.volume : null;
            return { b, raw, converted, total, intensity, byVolume, excludes, issues, eligible: !excludes.length, median: null, grade: null };
        });
        const cohorts = new Map();
        for (const row of rows.filter(r => r.eligible)) {
            if (!cohorts.has(row.b.category)) cohorts.set(row.b.category, []);
            cohorts.get(row.b.category).push(row.intensity);
        }
        for (const row of rows) {
            const peers = cohorts.get(row.b.category) || [];
            row.peerCount = peers.length;
            row.median = median(peers);
            if (!row.eligible || peers.length < 5 || !(row.median > 0)) continue;
            const ratio = row.intensity / row.median;
            row.grade = 'ABCDEFG'[[.60, .80, .95, 1.05, 1.20, 1.50, Infinity].findIndex(n => ratio <= n)];
        }
        return rows;
    }

    // Агрегація сумарного споживання по кожному енергоносію та підрахунок охоплення будівель даними
    function summary(rows) {
        const amounts = [0, 0, 0], counts = [0, 0, 0];
        for (const row of rows) row.converted.forEach((v, i) => {
            if (finite(v)) {
                amounts[i] += v;
                counts[i]++;
            }
        });
        return { amounts, counts, total: counts.some(Boolean) ? amounts.reduce((a, v) => a + v, 0) : null, covered: rows.filter(r => r.total !== null).length };
    }

    window.Energy = { analyze, summary, median, category, finite, energyNames, resources, units, gasDefault };
})();