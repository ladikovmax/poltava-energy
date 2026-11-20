window.App = window.App || {};

(function (A) {
    'use strict';

    const Core = A.importCore;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const ICONS = {
        success: `<svg class="imp-msg-ico" width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="9" fill="#eef5f0" stroke="#1c5744" stroke-width="1.5"/>
            <path d="M6.2 10.3L8.7 12.8L13.8 7.5" stroke="#1c5744" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        error: `<svg class="imp-msg-ico" width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="9" fill="#fef2f2" stroke="#dc2626" stroke-width="1.5"/>
            <path d="M7.2 7.2L12.8 12.8M12.8 7.2L7.2 12.8" stroke="#dc2626" stroke-width="1.8" stroke-linecap="round"/>
        </svg>`
    };

    function renderResultMessage(type, text) {
        const cls = type === 'error' ? 'imp-msg is-error' : 'imp-msg is-success';
        return `<p class="${cls}">${ICONS[type]}<span>${esc(text)}</span></p>`;
    }

    function toast(msg) {
        const $t = $('#toast').text(msg);
        setTimeout(() => $t.text(''), 4500);
    }

    function formatFilesCount(count) {
        if (!count) return 'Файли не вибрано';
        const mod10 = count % 10;
        const mod100 = count % 100;
        if (mod10 === 1 && mod100 !== 11) return `Обрано ${count} файл`;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `Обрано ${count} файли`;
        return `Обрано ${count} файлів`;
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
            const allReportsLoaded = builds.length > 0 && years.length > 0 && metersCount > 0 && subjectsCount > 0;

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
                            <div class="field">
                                <span>Оберіть один або кілька файлів Excel</span>
                                <div class="imp-picker-row" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 4px;">
                                    <label class="btn secondary" for="imp-files" style="cursor: pointer; margin: 0;">
                                        Вибрати файли
                                    </label>
                                    <span id="imp-files-status" class="cell-meta">Файли не вибрано</span>
                                    <input type="file" accept=".xlsx" multiple id="imp-files" style="display: none;">
                                </div>
                            </div>
                            <button type="button" class="btn primary" id="imp-run">Опрацювати файли</button>
                        </div>

                        <div id="imp-queue" class="imp-queue" hidden></div>

                        ${messages.length ? `
                            <div id="imp-messages" class="import-result">
                                ${messages.map(m => renderResultMessage('success', m)).join('')}
                            </div>
                        ` : '<div id="imp-messages" class="import-result" hidden></div>'}

                        ${allReportsLoaded ? `
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

        // Відмальовка списку файлів у черзі та оновлення індикатора біля кнопки вибору
        function renderQueue() {
            const count = queuedFiles.size;
            $('#imp-files-status')
                .text(formatFilesCount(count))
                .css('font-weight', count ? '600' : '400');

            const $q = $('#imp-queue');
            if (!count) {
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
                    <span>Обрано файлів: <b>${count}</b></span>
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
                        .html(renderResultMessage('error', err.message));
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