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
            const builds = state.buildings || [];
            const metersCount = Object.keys(state.meterIndex || {}).length;
            const subjectsCount = Object.keys(state.subjects || {}).length;
            const years = Object.keys(state.periods || {}).sort();
            const hasAnyData = builds.length > 0 || metersCount > 0 || subjectsCount > 0 || years.length > 0;

            $main.html(`
                <div class="page-head">
                    <div>
                        <h1>Імпорт даних з Excel</h1>
                        <p class="subtitle">Файли uMuni та СЕМ обробляються локально у вашому браузері.</p>
                    </div>
                </div>

                <div class="columns import-columns">
                    <!-- Ліва колонка: інструкція про підтримувані звіти -->
                    <section class="panel import-guide">
                        <h2>1. Які звіти приймає система (.xlsx)</h2>
                        <p class="muted">Ви можете завантажити всі файли разом або додавати їх поступово (першим обов'язково має бути реєстр будівель):</p>
                        <ul>
                            <li>
                                <b>Реєстр будівель</b>
                                <span>Перелік комунальних об'єктів, їхні адреси, опалювана площа та об'єм.</span>
                            </li>
                            <li>
                                <b>Річне використання (за різні роки)</b>
                                <span>Показники споживання ресурсів за звітний рік.</span>
                            </li>
                            <li>
                                <b>Лічильники</b>
                                <span>Прилади обліку, їхні номери, ресурси та прив'язка до будівель.</span>
                            </li>
                            <li>
                                <b>Інформація щодо впровадження СЕМ у Полтавській ТГ</b>
                                <span>Довідник суб'єктів СЕнМ та їхні коди ЄДРПОУ для зведення й звітності.</span>
                            </li>
                        </ul>
                    </section>

                    <!-- Права колонка: завантаження файлів -->
                    <section class="panel import-upload">
                        <h2>2. Завантаження файлів (.xlsx)</h2>
                        <div class="file-zone">
                            <label class="field">Оберіть один або кілька файлів Excel
                                <input type="file" accept=".xlsx" multiple id="imp-files">
                            </label>
                            <button type="button" class="btn primary" id="imp-run">Опрацювати файли</button>
                        </div>

                        <div id="imp-queue" class="imp-queue" hidden></div>

                        ${messages.length ? `
                            <div id="imp-messages" class="import-result">
                                ${messages.map(m => `<p>✅ ${esc(m)}</p>`).join('')}
                            </div>
                        ` : '<div id="imp-messages" class="import-result" hidden></div>'}

                        ${years.length ? `
                            <div class="import-next-actions">
                                <a class="btn secondary" href="#overview">Перейти до огляду</a>
                                <a class="btn primary" href="#reports">Сформувати звіт data.gov.ua</a>
                            </div>
                        ` : ''}
                    </section>
                </div>

                <!-- Блок стану локального сховища на всю ширину під двома верхніми картками -->
                <section class="panel section-gap import-storage">
                    <div class="import-storage-head">
                        <div>
                            <div class="import-storage-title">
                                <h2>Завантажено у браузер</h2>
                                <span class="badge ${hasAnyData ? '' : 'warn'}">${hasAnyData ? 'Дані збережено локально' : 'Сховище порожнє'}</span>
                            </div>
                            <p class="muted">Зведена статистика поточного зрізу, який використовується для розрахунків та звітів.</p>
                        </div>
                        <button type="button" class="btn secondary imp-clear-btn" id="imp-clear" ${hasAnyData ? '' : 'disabled'}>Очистити всі дані</button>
                    </div>

                    <dl class="facts import-storage-facts">
                        <div class="storage-card">
                            <dt>Будівель у реєстрі</dt>
                            <dd>${builds.length}</dd>
                            <span class="storage-hint">Комунальних об'єктів</span>
                        </div>
                        <div class="storage-card">
                            <dt>Лічильників</dt>
                            <dd>${metersCount}</dd>
                            <span class="storage-hint">Прив'язаних приладів</span>
                        </div>
                        <div class="storage-card">
                            <dt>Суб'єктів СЕМ</dt>
                            <dd>${subjectsCount}</dd>
                            <span class="storage-hint">Установ у довіднику</span>
                        </div>
                        <div class="storage-card">
                            <dt>Звітні роки</dt>
                            <dd>${esc(years.join(', ') || '—')}</dd>
                            <span class="storage-hint">${years.length ? `Завантажено періодів: ${years.length}` : 'Немає річних звітів'}</span>
                        </div>
                    </dl>
                </section>

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
            bindEvents();
        }

        // Відмальовка списку файлів у черзі
        function renderQueue() {
            const $q = $('#imp-queue');
            if (!queuedFiles.size) {
                $q.prop('hidden', true).empty();
                return;
            }
            const items = Array.from(queuedFiles.keys(), name =>
                `<li>
                    <span class="imp-file-name" title="${esc(name)}">${esc(name)}</span>
                    <button type="button" class="imp-file-del" data-del-file="${esc(name)}" aria-label="Прибрати файл ${esc(name)}">✕</button>
                </li>`
            ).join('');
            $q.prop('hidden', false).html(`
                <div class="imp-queue-head">
                    <span>Обрано файлів: <b>${queuedFiles.size}</b></span>
                    <button type="button" class="imp-queue-clear" id="imp-clear-queue">Очистити список</button>
                </div>
                <ul class="imp-queue-list">${items}</ul>
            `);
        }

        // Прив'язка всіх обробників подій
        function bindEvents() {
            $('#imp-files').on('change', function () {
                for (const f of this.files) queuedFiles.set(f.name, f);
                $(this).val('');
                renderQueue();
            });

            $('#imp-queue').on('click', '[data-del-file]', function () {
                queuedFiles.delete($(this).attr('data-del-file'));
                renderQueue();
            });

            $('#imp-queue').on('click', '#imp-clear-queue', function () {
                queuedFiles.clear();
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
                    $('#imp-messages')
                        .prop('hidden', false)
                        .html(`<p class="is-error">❌ ${esc(err.message)}</p>`);
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