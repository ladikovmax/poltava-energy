window.Workspace = window.Workspace || {};

(function (W) {
    'use strict';

    const E = window.Energy;
    const { esc, save, notify, csv, keys } = W;
    const { opt, ico, header, pane, table, methodology } = W.ui;

    // Рендеринг сторінки імпорту файлів XLSX/CSV, контролю якості даних та налаштувань
    function importPage($main) {
        const st = W.state;
        const { data, gas, importMsg } = st;
        const ids = Object.keys(data.subjects || {}), builds = [...data.buildings].sort((a, b) => a.name.localeCompare(b.name, 'uk'));
        const options = (current) => builds.map(b => opt(b.id, b.name, current)).join('');
        $main.html(header('Імпорт даних', 'Оригінальні файли Excel обробляються у вашому браузері.') + `<div class="columns import-columns">
 <section class="panel import-guide"><h2>1. Завантажте звіти з uMuni</h2>
 <p>Відкрийте папку <a href="https://drive.google.com/drive/search?q=Трек%202%20Енергетиний%20менеджмент" target="_blank" rel="noopener noreferrer">«Трек 2 Енергетиний менеджмент»</a> через пошук у вашому Google Диску. Завантажте файли у форматі XLSX. Якщо Диск створить ZIP, спершу розпакуйте його.</p>
 <h3>Для звіту на data.gov.ua:</h3>
 <ul><li><b>Реєстр будівель</b><span>Додайте при першому імпорті.</span></li>
 <li><b>Річне використання ресурсів</b><span>Повний 2025 рік. Дає базовий рівень і рейтинг.</span></li></ul>
 <h3>Для повної перевірки додайте ще три</h3>
 <ul><li><b>Річне_використання_ресурсів (50).xlsx</b><span>Споживання за 2026 рік станом на 11 листопада.</span></li>
 <li><b>Лічильники (3).xlsx</b><span>Прилади обліку та їхній зв’язок із будівлями.</span></li>
 <li><b>Інформація щодо впровадження СЕМ у Полтавській ТГ 13.07.2026.xlsx</b><span>Довідник суб’єктів СЕнМ для зведення за організаціями.</span></li></ul>
 <p class="footnote">Документ ТЗ у форматі DOCX пропустіть. Після імпорту відкрийте «Відкриті дані», щоб переглянути споживання за всі роки та реєстр лічильників. Показання можна ввести в таблиці або завантажити журнал нижче.</p></section>
 <div class="import-tools"><section class="panel"><h2>2. Імпортуйте XLSX</h2><p class="muted">Додавайте файли по одному або разом. Перевірте список і натисніть «Опрацювати файли».</p>
 <div class="file-zone">${ico('upload')}<label class="field">Файли Excel<input type="file" accept=".xlsx" multiple id="files"></label><div><button class="btn primary" id="importFiles">Опрацювати файли</button></div></div>
 <div id="fileQueue" role="status"></div>
 <div id="messages" role="status" class="import-result">${importMsg.map(m => `<p>${esc(m)}</p>`).join('')}</div>
 ${Object.keys(data.periods).length ? '<a class="btn secondary extras" href="#overview">Переглянути огляд</a>' : ''} ${Object.keys(data.meterIndex || {}).length || Object.keys(data.periods).length ? '<a class="btn primary extras" href="#publication">Переглянути імпортовані дані</a>' : ''}</section>
 <section class="panel">${pane('Робочі дані', 'Збережено у цьому браузері.')}<dl class="facts"><div><dt>Будівлі</dt><dd>${builds.length}</dd></div><div><dt>Лічильники</dt><dd>${Object.keys(data.meterIndex || {}).length}</dd></div><div><dt>Звітні роки</dt><dd>${esc(Object.keys(data.periods).sort().join(', ') || '—')}</dd></div></dl>
 <p class="footnote">Після імпорту всіх п’яти файлів із цієї папки очікуйте 311 будівель, 1 097 лічильників і два звітні роки.</p>
 <button type="button" class="btn secondary extras" id="clear-data">Очистити дані сайту</button></section></div></div>
 <section class="panel section-gap">${pane('Журнал показань для resources.csv', 'Якщо маєте фактичні показання, додайте їх тут. Журнал одразу потрапить у «Відкриті дані». ')}<p class="footnote">CSV UTF-8: date (РРРР-ММ-ДД), meterNumber (номер лічильника або ID uMuni), quantity (показання). Інші колонки звіту можна додати до файлу або заповнити в таблиці.</p><div class="fields"><label class="field">Журнал CSV<input type="file" accept=".csv,text/csv" id="journalFile"></label><button id="importJournal" class="btn secondary">Додати показання</button><a href="#publication">Відкрити таблицю resources.csv</a></div><p id="journalMessage" role="status"></p></section>
 <section class="panel section-gap">${pane('Якість даних', 'Пропуски, непридатна площа та розбіжності між лічильниками й споживанням.')}<button class="btn secondary" id="defects">${ico('download')}Завантажити data-defects.csv</button></section>
 <section class="panel">${pane('Зв’язки із суб’єктами СЕнМ', ids.length ? `${ids.length} суб’єктів у довіднику. Підтвердьте зв’язок для зведення.` : 'Завантажте файл D2-05, щоб прив’язати будівлю до суб’єкта.')} ${ids.length ? `<div class="form-grid"><label class="field">Будівля<select id="linkBuilding">${options('')}</select></label><label class="field">Суб’єкт<select id="linkSubject"></select></label><button class="btn primary" id="saveLink">Зберегти зв’язок</button></div>` : ''}</section>
 ${(data.pending || []).length ? `<section class="panel">${pane('Зіставлення будівель', `${data.pending.length} рядків потребують рішення.`)}<label class="field">Рядок звіту<select id="pendingRow">${data.pending.map((v, i) => opt(i, `${v.year} · ${v.name} · ${v.address}`, '')).join('')}</select></label><div class="form-grid extras"><label class="field">Будівля реєстру<select id="pendingBuilding"><option value="">Оберіть будівлю</option>${options('')}</select></label><button id="resolve" class="btn primary">Підтвердити збіг</button></div></section>` : ''}
 <section class="panel">${pane('Теплота згоряння газу', 'Коефіцієнт застосовується до всіх завантажених років.')}<div class="fields"><label class="field">кВт·год/м³<input id="gas" type="number" min="0.01" max="25" step="any" value="${gas}"></label><button id="saveGas" class="btn secondary">Перерахувати</button></div></section>${methodology()}`);
        const queued = new Map(), $filesInput = $('#files'), $queueBox = $('#fileQueue');

        // Відображення списку обраних користувачем XLSX-файлів у черзі на імпорт
        function showQueue() {
            $queueBox.html(queued.size ? '<p>Обрано файлів: ' + queued.size + '</p><ul>' + Array.from(queued.keys(), name => '<li>' + esc(name) + ' <button type="button" data-remove-file="' + esc(name) + '" aria-label="Вилучити ' + esc(name) + '">Вилучити</button></li>').join('') + '</ul>' : '');
        }

        $filesInput.on('change', function () {
            for (const file of this.files) queued.set(file.name, file);
            $(this).val('');
            showQueue();
        });
        $queueBox.on('click', '[data-remove-file]', function () {
            queued.delete($(this).attr('data-remove-file'));
            showQueue();
        });
        $('#importFiles').on('click', async function () {
            if (!queued.size) {
                notify('Спершу оберіть XLSX-файли.');
                return;
            }
            const $btn = $(this);
            $btn.prop('disabled', true);
            $filesInput.prop('disabled', true);
            $queueBox.prop('inert', true);
            $btn.text('Обробка…');
            try {
                const result = await EnergyImport.readFiles([...queued.values()], st.data);
                st.data = result.state;
                st.importMsg = result.messages;
                save();
                if (!st.data.periods[st.year]) st.year = Object.keys(st.data.periods).sort()[0] || '2025';
                st.query = '';
                st.cat = '';
                st.page = 1;
                W.render();
                notify('Імпорт завершено');
            } catch (err) {
                $('#messages').text(err.message);
                $btn.prop('disabled', false);
                $filesInput.prop('disabled', false);
                $queueBox.prop('inert', false);
                $btn.text('Опрацювати файли');
            }
        });
        $('#importJournal').on('click', async function () {
            const file = $('#journalFile')[0].files[0], $message = $('#journalMessage');
            if (!file) {
                $message.text('Оберіть журнал у форматі CSV.');
                return;
            }
            const $button = $(this);
            $button.prop('disabled', true);
            try {
                const added = window.PublicationData.importJournal(await file.text(), st.data);
                $message.text('Додано показань: ' + added + '. Перегляньте таблицю у розділі «Відкриті дані».');
            } catch (err) {
                $message.text(err.message);
            } finally {
                $button.prop('disabled', false);
            }
        });
        const defects = [];
        for (const y of Object.keys(st.data.periods)) {
            for (const r of E.analyze(st.data, y, st.gas)) {
                for (const rule of r.issues) {
                    const area = rule.includes('площа'), volume = rule.includes('об’єм'), source = (area || volume) ? r.b.registrySource : r.b.yearSources?.[y];
                    const value = area ? r.b.area : volume ? r.b.volume : r.raw.map(x => x ?? '—').join(' / ');
                    defects.push([y, r.b.id, r.b.name, rule, value, source?.file || 'Знеособлений приклад', source?.row || '']);
                }
            }
        }
        for (const p of st.data.pending || []) defects.push([p.year, '', p.name, 'Не підтверджено відповідність будівлі', p.address, p.source?.file, p.source?.row]);
        const $defectButton = $('#defects');
        $defectButton.before('<details class="details"><summary>Переглянути зауваження (' + defects.length + ')</summary>' + table(['Рік', 'Будівля', 'Правило'], defects.slice(0, 8).map(d => '<tr><td>' + esc(d[0]) + '</td><td>' + esc(d[2]) + '</td><td>' + esc(d[3]) + '</td></tr>').join('')) + '<p class="footnote">Перші ' + Math.min(defects.length, 8) + ' записів. Повний перелік доступний у CSV.</p></details>');
        $defectButton.on('click', () => csv('data-defects.csv', [['Рік', 'ID будівлі', 'Будівля', 'Поле / правило', 'Вихідне значення', 'Файл', 'Рядок у XLSX'], ...defects]));
        $('#clear-data').on('click', () => {
            if (!window.confirm('Очистити імпортовані звіти, показання, довідники та налаштування у цьому браузері?')) return;
            try {
                window.EnergyStorage.clear();
            } catch {
                notify('Сховище браузера недоступне. Оновіть сторінку, щоб завершити сеанс.');
                return;
            }
            location.reload();
        });
        $('#saveGas').on('click', () => {
            const el = $('#gas')[0], v = el.valueAsNumber;
            if (!el.checkValidity() || !E.finite(v) || v <= 0) {
                el.reportValidity();
                return;
            }
            st.gas = v;
            try {
                localStorage.setItem(keys.gas, String(v));
            } catch {
            }
            W.render();
            notify('Коефіцієнт оновлено');
        });
        if (ids.length) {
            const $b = $('#linkBuilding'), $s = $('#linkSubject');
            const refresh = () => $s.html(opt('', 'Не визначений', st.data.links?.[$b.val()]) + ids.map(id => opt(id, `${st.data.subjects[id]} · ${id}`, st.data.links?.[$b.val()])).join(''));
            refresh();
            $b.on('change', refresh);
            $('#saveLink').on('click', () => {
                st.data.links[$b.val()] = $s.val();
                save();
                notify('Зв’язок оновлено');
            });
        }
        const $resolve = $('#resolve');
        if ($resolve.length) $resolve.on('click', () => {
            const id = $('#pendingBuilding').val();
            if (!id) {
                notify('Оберіть будівлю');
                return;
            }
            try {
                st.data = EnergyImport.resolve(st.data, +$('#pendingRow').val(), id);
                save();
                W.render();
                notify('Зіставлення збережене');
            } catch (err) {
                notify(err.message);
            }
        });
    }

    W.pages = W.pages || {};
    W.pages.import = importPage;
})(window.Workspace);