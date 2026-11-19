window.App = window.App || {};

(function (A) {
    'use strict';

    const Core = A.importCore;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function toast(msg) {
        const $t = $('#toast').text(msg);
        setTimeout(() => $t.text(''), 4500);
    }

    // Головна функція відмальовки сторінки імпорту
    function renderImportPage($main) {
        let state = Core.getState();
        let gas = Core.getGas();
        let messages = [];
        const queuedFiles = new Map();

        function draw() {
            const builds = [...state.buildings].sort((a, b) => a.name.localeCompare(b.name, 'uk'));
            const subjectIds = Object.keys(state.subjects || {});
            const years = Object.keys(state.periods || {}).sort();
            const buildingOptions = builds.map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('');

            $main.html(`
                <div class="page-head">
                    <div>
                        <h1>Імпорт даних з Excel</h1>
                        <p class="subtitle">Файли uMuni та СЕнМ обробляються локально у вашому браузері.</p>
                    </div>
                </div>

                <div class="columns import-columns">
                    <!-- Ліва колонка: інструкція -->
                    <section class="panel import-guide">
                        <h2>1. Які файли потрібні</h2>
                        <h3>Обов'язково для старту:</h3>
                        <ul>
                            <li><b>Buildings_Info_Report.xlsx</b><span>Реєстр будівель із uMuni.</span></li>
                            <li><b>Річне_використання_ресурсів.xlsx</b><span>Показники споживання за звітний рік.</span></li>
                        </ul>
                        <h3>Додатково (для повної аналітики та звітів):</h3>
                        <ul>
                            <li><b>Лічильники.xlsx</b><span>Прив'язка приладів обліку до будівель.</span></li>
                            <li><b>Довідник суб'єктів СЕнМ.xlsx</b><span>Коди ЄДРПОУ організацій.</span></li>
                        </ul>
                    </section>

                    <!-- Права колонка: завантаження та статус -->
                    <div class="import-tools">
                        <section class="panel">
                            <h2>2. Завантаження файлів (.xlsx)</h2>
                            <div class="file-zone">
                                <label class="field">Оберіть один або кілька файлів Excel
                                    <input type="file" accept=".xlsx" multiple id="imp-files">
                                </label>
                                <div class="extras">
                                    <button type="button" class="btn primary" id="imp-run">Опрацювати файли</button>
                                </div>
                            </div>

                            <div id="imp-queue" class="extras"></div>

                            <div id="imp-messages" class="import-result extras">
                                ${messages.map(m => `<p>✅ ${esc(m)}</p>`).join('')}
                            </div>

                            ${years.length ? `
                                <div class="actions extras">
                                    <a class="btn secondary" href="#overview">Перейти до огляду</a>
                                    <a class="btn primary" href="#reports">Сформувати звіт data.gov.ua</a>
                                </div>
                            ` : ''}
                        </section>

                        <section class="panel">
                            <h2>Завантажено у браузер</h2>
                            <dl class="facts">
                                <div><dt>Будівель</dt><dd>${builds.length}</dd></div>
                                <div><dt>Лічильників</dt><dd>${Object.keys(state.meterIndex || {}).length}</dd></div>
                                <div><dt>Звітні роки</dt><dd>${esc(years.join(', ') || '—')}</dd></div>
                            </dl>
                            <button type="button" class="btn secondary extras" id="imp-clear">Очистити всі дані</button>
                        </section>
                    </div>
                </div>

                <!-- Налаштування коефіцієнта газу -->
                <section class="panel section-gap">
                    <h2>Коефіцієнт теплоти згоряння газу (кВт·год/м³)</h2>
                    <div class="fields">
                        <label class="field">Значення
                            <input id="imp-gas" type="number" min="0.01" max="25" step="any" value="${gas}">
                        </label>
                        <button type="button" class="btn secondary" id="imp-save-gas">Зберегти коефіцієнт</button>
                    </div>
                </section>
            `);

            renderQueue();
            bindEvents(subjectIds);
        }

        // Відмальовка списку файлів у черзі
        function renderQueue() {
            const $q = $('#imp-queue');
            if (!queuedFiles.size) {
                $q.empty();
                return;
            }
            const items = Array.from(queuedFiles.keys(), name =>
                `<li>${esc(name)} <button type="button" data-del-file="${esc(name)}">✕</button></li>`
            ).join('');
            $q.html(`<p>Обрано файлів: <b>${queuedFiles.size}</b></p><ul>${items}</ul>`);
        }

        // Прив'язка всіх обробників подій
        function bindEvents(subjectIds) {
            $('#imp-files').on('change', function () {
                for (const f of this.files) queuedFiles.set(f.name, f);
                $(this).val('');
                renderQueue();
            });

            $('#imp-queue').on('click', '[data-del-file]', function () {
                queuedFiles.delete($(this).attr('data-del-file'));
                renderQueue();
            });

            // Запуск імпорту Excel
            $('#imp-run').on('click', async function () {
                if (!queuedFiles.size) return toast('Спершу оберіть файли .xlsx');

                const $btn = $(this).prop('disabled', true).text('Обробка...');
                try {
                    const res = await Core.processFiles([...queuedFiles.values()], state);
                    state = res.state;
                    messages = res.messages;
                    queuedFiles.clear();
                    toast('Імпорт успішно завершено!');
                    draw();
                } catch (err) {
                    $('#imp-messages').html(`<p style="color:#b91c1c">❌ ${esc(err.message)}</p>`);
                    $btn.prop('disabled', false).text('Опрацювати файли');
                }
            });

            // Ручне зіставлення будівлі
            $('#imp-resolve').on('click', () => {
                const bId = $('#imp-pending-build').val();
                if (!bId) return toast('Оберіть будівлю зі списку');
                try {
                    state = Core.resolvePending(state, Number($('#imp-pending-row').val()), bId);
                    toast('Зіставлення збережено');
                    draw();
                } catch (err) {
                    toast(err.message);
                }
            });

            // Прив'язка ЄДРПОУ
            if (subjectIds.length) {
                const $b = $('#imp-link-build'), $s = $('#imp-link-subj');
                const updateSubj = () => {
                    const cur = state.links?.[$b.val()] || '';
                    const opts = `<option value="">— Не визначений —</option>` +
                        subjectIds.map(id => `<option value="${esc(id)}" ${id === cur ? 'selected' : ''}>${esc(state.subjects[id])} (${esc(id)})</option>`).join('');
                    $s.html(opts);
                };
                updateSubj();
                $b.on('change', updateSubj);

                $('#imp-save-link').on('click', () => {
                    state.links[$b.val()] = $s.val();
                    Core.saveState(state);
                    toast('Зв’язок із суб’єктом СЕнМ збережено');
                });
            }

            // Збереження коефіцієнта газу
            $('#imp-save-gas').on('click', () => {
                const val = Number($('#imp-gas').val());
                if (!Number.isFinite(val) || val <= 0) return toast('Введіть коректне число');
                gas = val;
                Core.setGas(val);
                toast('Коефіцієнт газу оновлено');
            });

            // Очищення даних
            $('#imp-clear').on('click', () => {
                if (!confirm('Видалити всі імпортовані дані з браузера?')) return;
                Core.clearAllData();
                location.reload();
            });
        }

        draw();
    }

    A.pages = A.pages || {};
    A.pages.import = renderImportPage;
})(window.App);