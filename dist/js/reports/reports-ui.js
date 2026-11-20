window.App = window.App || {};

(function (A) {
    'use strict';

    const Core = A.reportsCore;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function toast(msg) {
        const $t = $('#toast').text(msg);
        setTimeout(() => $t.text(''), 4000);
    }

    function renderReportsPage($main) {
        const report = Core.buildDataGovReport();

        let isPreviewOpen = false;
        let previewQuery = '';
        let previewPage = 1;
        const PAGE_SIZE = 15;

        $main.html(`
            <div class="page-head">
                <div>
                    <h1>Формування звітів</h1>
                    <p class="subtitle">Автоматична генерація регламентованої звітності на основі імпортованих даних.</p>
                </div>
            </div>

            <!-- Картка звіту Data.gov.ua -->
            <section class="panel">
                <div class="panel-head">
                    <div>
                        <h2>Звіт для порталу відкритих даних (Data.gov.ua)</h2>
                        <p>Набір даних про споживання комунальних ресурсів (<code>resources.csv</code>) у стандарті Міністерства цифрової трансформації.</p>
                    </div>
                    <span class="pill">${report.ready ? `Готово: ${report.stats.totalRows} записів` : 'Недостатньо даних'}</span>
                </div>

                ${report.ready ? `
                    <p class="muted">
                        Усі обов'язкові поля перевірено (звітні роки: <b>${esc(report.stats.years.join(', '))}</b>). 
                        Ви можете переглянути таблицю перед завантаженням або одразу зберегти файл.
                    </p>
                    <div class="actions extras">
                        <button type="button" class="btn secondary" id="btn-preview-datagov" aria-expanded="false">
                            Попередній перегляд
                        </button>
                        <button type="button" class="btn primary" id="btn-download-datagov">
                            Завантажити resources.csv
                        </button>
                    </div>

                    <!-- Контейнер попереднього перегляду -->
                    <div id="preview-datagov-box" class="extras" hidden></div>
                ` : `
                    <div class="extras" style="padding: 12px 16px; border-left: 3px solid #dc2626; background: #fef2f2; border-radius: 6px;">
                        <p style="margin: 0 0 8px; font-weight: 600; color: #991b1b;">
                            Неможливо сформувати звіт — бракує обов'язкових даних:
                        </p>
                        <ul style="margin: 0; padding-left: 20px; color: #7f1d1d;">
                            ${report.missing.map(item => `<li>${esc(item)}</li>`).join('')}
                        </ul>
                        <div class="extras">
                            <a class="btn primary" href="#import">Перейти до імпорту даних</a>
                        </div>
                    </div>
                `}

                ${report.warnings.length ? `
                    <details class="details extras">
                        <summary>Звернути увагу (${report.warnings.length})</summary>
                        <ul style="margin: 8px 0 0; padding-left: 20px;">
                            ${report.warnings.map(w => `<li>${esc(w)}</li>`).join('')}
                        </ul>
                    </details>
                ` : ''}
            </section>

            <!-- Заготовка під майбутні звіти -->
            <section class="panel section-gap" style="opacity: 0.7;">
                <div class="panel-head">
                    <div>
                        <h2>Інші регламентовані звіти</h2>
                        <p>Зведені звіти для СЕнМ та паспорти енергоефективності громади будуть додані у наступних оновленнях.</p>
                    </div>
                    <span class="pill">У розробці</span>
                </div>
            </section>
        `);

        // Відмальовка таблиці попереднього перегляду
        function drawPreview() {
            const $box = $('#preview-datagov-box');
            if (!isPreviewOpen) {
                $box.prop('hidden', true).empty();
                $('#btn-preview-datagov').text('Попередній перегляд').attr('aria-expanded', 'false');
                return;
            }

            $('#btn-preview-datagov').text('Сховати перегляд').attr('aria-expanded', 'true');
            $box.prop('hidden', false);

            const q = previewQuery.trim().toLocaleLowerCase('uk');
            const filtered = q
                ? report.rows.filter(r =>
                    Core.CSV_FIELDS.some(f => String(r[f] ?? '').toLocaleLowerCase('uk').includes(q))
                )
                : report.rows;

            const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
            previewPage = Math.max(1, Math.min(totalPages, previewPage));
            const slice = filtered.slice((previewPage - 1) * PAGE_SIZE, previewPage * PAGE_SIZE);

            const headHtml = Core.CSV_FIELDS.map(col => `
                <th scope="col" title="${esc(Core.FIELD_LABELS[col] || col)}">
                    <div>${esc(col)}</div>
                    <small class="cell-meta" style="font-weight:400">${esc(Core.FIELD_LABELS[col] || '')}</small>
                </th>
            `).join('');

            const bodyHtml = slice.map(row => `
                <tr>
                    ${Core.CSV_FIELDS.map(col => `<td>${esc(row[col] || '—')}</td>`).join('')}
                </tr>
            `).join('');

            $box.html(`
                <div style="border-top: 1px solid #e2e8f0; padding-top: 16px;">
                    <div class="filterline">
                        <label class="search">
                            <input type="text" id="preview-search" placeholder="Пошук у звіті (заклад, ЄДРПОУ, лічильник, послуга)..." value="${esc(previewQuery)}">
                        </label>
                        <span class="cell-meta">Знайдено записів: <b>${filtered.length}</b> із ${report.rows.length}</span>
                    </div>

                    ${slice.length ? `
                        <div class="table-wrap">
                            <table class="data-table">
                                <thead><tr>${headHtml}</tr></thead>
                                <tbody>${bodyHtml}</tbody>
                            </table>
                        </div>
                        <div class="table-end">
                            <span class="cell-meta">Сторінка ${previewPage} із ${totalPages}</span>
                            <div class="section-actions">
                                <button type="button" class="btn secondary" id="preview-prev" ${previewPage === 1 ? 'disabled' : ''}>Назад</button>
                                <button type="button" class="btn secondary" id="preview-next" ${previewPage === totalPages ? 'disabled' : ''}>Далі</button>
                            </div>
                        </div>
                    ` : `<p class="empty">За вашим запитом нічого не знайдено.</p>`}
                </div>
            `);

            // Фокус назад у поле пошуку після перемальовки
            const $search = $('#preview-search');
            if ($search.length && document.activeElement?.id !== 'preview-search' && previewQuery) {
                $search.trigger('focus');
                const len = previewQuery.length;
                $search[0].setSelectionRange(len, len);
            }

            $search.on('input', function () {
                previewQuery = $(this).val();
                previewPage = 1;
                drawPreview();
            });

            $('#preview-prev').on('click', () => { previewPage--; drawPreview(); });
            $('#preview-next').on('click', () => { previewPage++; drawPreview(); });
        }

        // Кнопка перемикання попереднього перегляду
        $('#btn-preview-datagov').on('click', () => {
            isPreviewOpen = !isPreviewOpen;
            drawPreview();
        });

        // Кнопка завантаження CSV
        $('#btn-download-datagov').on('click', () => {
            if (!report.ready) return;
            Core.downloadCsv('resources.csv', report.rows);
            toast(`Файл resources.csv (${report.stats.totalRows} записів) завантажено!`);
        });
    }

    A.pages = A.pages || {};
    A.pages.reports = renderReportsPage;
})(window.App);