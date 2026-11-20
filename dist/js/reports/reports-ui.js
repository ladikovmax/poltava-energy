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
        let currentReport = Core.buildDataGovReport();
        let isPreviewOpen = false;
        let previewQuery = '';
        let previewPage = 1;
        let hasDownloaded = false;
        const PAGE_SIZE = 15;

        const subjectEntries = Object.entries(currentReport.subjects || {});
        const initialIssuesCount = currentReport.issuesByBuilding.length;

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
                    <span class="pill" id="datagov-status-pill">
                        ${!currentReport.hasBaseData ? 'Немає базових файлів' : `Готово: ${currentReport.stats.totalRows} записів`}
                    </span>
                </div>

                ${!currentReport.hasBaseData ? `
                    <div class="extras" style="padding: 12px 16px; border-left: 3px solid #dc2626; background: #fef2f2; border-radius: 6px;">
                        <p style="margin: 0 0 8px; font-weight: 600; color: #991b1b;">
                            Неможливо сформувати звіт — не завантажені базові файли:
                        </p>
                        <ul style="margin: 0; padding-left: 20px; color: #7f1d1d;">
                            ${currentReport.fatalMissing.map(item => `<li>${esc(item)}</li>`).join('')}
                        </ul>
                        <div class="extras">
                            <a class="btn primary" href="#import">Перейти до імпорту даних</a>
                        </div>
                    </div>
                ` : `
                    <!-- Блок готового звіту (показується/оновлюється без перезавантаження) -->
                    <div id="datagov-ready-block" ${currentReport.ready ? '' : 'hidden'}>
                        <p class="muted" id="datagov-summary-text"></p>
                        <div class="actions extras" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                                <button type="button" class="btn secondary" id="btn-preview-datagov" aria-expanded="false">
                                    Попередній перегляд
                                </button>
                                <button type="button" class="btn primary" id="btn-download-datagov">
                                    Завантажити resources.csv
                                </button>
                            </div>

                            <button type="button" class="btn primary" id="btn-send-datagov" hidden>
                                Вивантажити на Data.gov.ua
                            </button>
                        </div>

                        <div id="preview-datagov-box" class="extras" hidden></div>
                    </div>

                    <!-- Повідомлення, коли ще жоден об'єкт не заповнений -->
                    <p class="muted" id="datagov-empty-notice" style="color: #92400e;" ${currentReport.ready ? 'hidden' : ''}>
                        Поки немає жодного повністю заповненого запису. Розгорніть об'єкти нижче та вкажіть відсутні реквізити, щоб сформувати звіт.
                    </p>

                    <!-- Мінімалістичний блок об'єктів із пропусками -->
                    ${initialIssuesCount > 0 ? `
                        <details class="details extras" id="issues-wrapper-details" ${!currentReport.ready ? 'open' : ''}>
                            <summary style="cursor: pointer; font-weight: 600;">
                                <span id="issues-summary-title">Об'єкти з пропусками у даних (${initialIssuesCount})</span>
                                <span class="cell-meta" style="font-weight: 400;">— натисніть на об'єкт, щоб заповнити</span>
                            </summary>
                            <div id="issues-buildings-list" style="margin-top: 10px; display: flex; flex-direction: column; gap: 6px;"></div>
                        </details>
                    ` : ''}
                `}

                ${currentReport.warnings.length ? `
                    <details class="details extras">
                        <summary>Звернути увагу (${currentReport.warnings.length})</summary>
                        <ul style="margin: 8px 0 0; padding-left: 20px;">
                            ${currentReport.warnings.map(w => `<li>${esc(w)}</li>`).join('')}
                        </ul>
                    </details>
                ` : ''}
            </section>

            <!-- Заготовка під майбутні звіти -->
            <section class="panel section-gap" style="opacity: 0.7;">
                <div class="panel-head">
                    <div>
                        <h2>Конструктор звітів</h2>
                        <p>Зведені звіти для СЕнМ та паспорти енергоефективності громади будуть додані у наступних оновленнях.</p>
                    </div>
                    <span class="pill">У розробці</span>
                </div>
            </section>
        `);

        // Точкове оновлення лічильників та статусів без перемальовки сторінки
        function syncStatusUI() {
            const issuesCount = currentReport.issuesByBuilding.length;

            $('#datagov-status-pill').text(`Готово: ${currentReport.stats.totalRows} записів`);
            $('#issues-summary-title').text(`Об'єкти з пропусками у даних (${issuesCount})`);

            if (currentReport.ready) {
                $('#datagov-empty-notice').prop('hidden', true);
                $('#datagov-ready-block').prop('hidden', false);

                const extraNote = issuesCount
                    ? ` Ще <b>${currentReport.skippedRowsCount}</b> записів у <b>${issuesCount}</b> об'єктах мають порожні поля — їх можна виправити нижче або завантажити звіт вже зараз.`
                    : '';

                $('#datagov-summary-text').html(
                    `Сформовано <b>${currentReport.stats.totalRows}</b> коректних записів (звітні роки: <b>${esc(currentReport.stats.years.join(', '))}</b>).${extraNote}`
                );
            }

            if (isPreviewOpen && currentReport.ready) {
                drawPreview();
            }
        }

        // Відмальовка списку об'єктів із пропусками
        function renderIssuesList() {
            const subjectOptionsHtml = subjectEntries.length
                ? `<option value="">— З довідника СЕМ —</option>` +
                  subjectEntries.map(([code, name]) => `<option value="${esc(code)}" data-name="${esc(name)}">${esc(name)} (${esc(code)})</option>`).join('')
                : '';

            const html = currentReport.issuesByBuilding.map(obj => {
                const badges = [
                    obj.missingEdrpou ? 'ЄДРПОУ' : '',
                    ...obj.missingResources.map(r => `лічильник: ${r.toLowerCase()}`)
                ].filter(Boolean).join(', ');

                return `
                    <details class="issue-obj" data-bid="${esc(obj.buildingId)}"
                        style="border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; padding: 8px 12px;">
                        <summary style="cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 8px; list-style: none;">
                            <span>
                                <b>${esc(obj.buildingName)}</b>
                                ${obj.address ? `<span class="cell-meta"> · ${esc(obj.address)}</span>` : ''}
                            </span>
                            <span class="cell-meta" style="color: #b45309; white-space: nowrap;">
                                Бракує: ${esc(badges)} ▾
                            </span>
                        </summary>

                        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #e2e8f0; display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end;">
                            ${obj.missingEdrpou ? `
                                ${subjectEntries.length ? `
                                    <label class="field" style="min-width: 210px; flex: 1;">Суб'єкт СЕМ
                                        <select class="iss-subj-select">${subjectOptionsHtml}</select>
                                    </label>
                                ` : ''}
                                <label class="field" style="width: 150px;">ЄДРПОУ (8 цифр)
                                    <input type="text" class="iss-edrpou" maxlength="8" placeholder="25698412" value="${esc(obj.currentEdrpou)}">
                                </label>
                                <label class="field" style="min-width: 200px; flex: 1;">Назва закладу
                                    <input type="text" class="iss-org-name" placeholder="Офіційна назва" value="${esc(obj.currentOrgName)}">
                                </label>
                            ` : ''}

                            ${obj.missingResources.map(resType => `
                                <label class="field" style="min-width: 180px;">Лічильник (${esc(resType)})
                                    <input type="text" class="iss-meter" data-res-type="${esc(resType)}" placeholder="Номер приладу">
                                </label>
                            `).join('')}

                            <button type="button" class="btn primary iss-save-btn"
                                data-bid="${esc(obj.buildingId)}"
                                data-need-edrpou="${obj.missingEdrpou ? '1' : '0'}">
                                Зберегти
                            </button>
                        </div>
                    </details>
                `;
            }).join('');

            $('#issues-buildings-list').html(html);
        }

        // Попередній перегляд таблиці
        function drawPreview() {
            const $box = $('#preview-datagov-box');
            const q = previewQuery.trim().toLocaleLowerCase('uk');
            const filtered = q
                ? currentReport.rows.filter(r =>
                    Core.CSV_FIELDS.some(f => String(r[f] ?? '').toLocaleLowerCase('uk').includes(q))
                )
                : currentReport.rows;

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
                        <span class="cell-meta">Знайдено записів: <b>${filtered.length}</b> із ${currentReport.rows.length}</span>
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

        if (currentReport.hasBaseData) {
            syncStatusUI();
            if (initialIssuesCount > 0) renderIssuesList();
        }

        // Автопідстановка з довідника СЕМ
        $main.off('change.iss').on('change.iss', '.iss-subj-select', function () {
            const $box = $(this).closest('.issue-obj');
            const code = $(this).val();
            const name = $(this).find('option:selected').data('name') || '';
            if (code) {
                $box.find('.iss-edrpou').val(code);
                if (name) $box.find('.iss-org-name').val(name);
            }
        });

        // Збереження пропусків із плавним зникненням картки без перезавантаження сторінки
        $main.off('click.iss').on('click.iss', '.iss-save-btn', function () {
            const $btn = $(this);
            const $box = $btn.closest('.issue-obj');
            const bId = String($btn.data('bid'));

            const payload = { buildingId: bId, meters: [] };

            if ($btn.data('need-edrpou') === 1) {
                payload.edrpou = $box.find('.iss-edrpou').val();
                payload.orgName = $box.find('.iss-org-name').val();
            }

            $box.find('.iss-meter').each(function () {
                payload.meters.push({
                    resourceType: $(this).data('res-type'),
                    meterNumber: $(this).val()
                });
            });

            try {
                Core.saveBuildingFix(payload);
                currentReport = Core.buildDataGovReport();

                $btn.prop('disabled', true).text('Збережено ✓');
                $box.css({ background: '#f0fdf4', borderColor: '#bbf7d0' })
                    .fadeTo(160, 0.35)
                    .slideUp(220, function () {
                        $(this).remove();

                        // Якщо пропусків більше не лишилось — плавно ховаємо весь блок
                        if (currentReport.issuesByBuilding.length === 0) {
                            $('#issues-wrapper-details').slideUp(200, function () {
                                $(this).remove();
                            });
                        }
                    });

                syncStatusUI();
                toast('Збережено! Об’єкт додано до готового звіту.');
            } catch (err) {
                toast(err.message);
            }
        });

        // Попередній перегляд
        $('#btn-preview-datagov').on('click', function () {
            isPreviewOpen = !isPreviewOpen;
            const $box = $('#preview-datagov-box');

            if (isPreviewOpen) {
                $(this).text('Сховати перегляд').attr('aria-expanded', 'true');
                $box.prop('hidden', false);
                drawPreview();
            } else {
                $(this).text('Попередній перегляд').attr('aria-expanded', 'false');
                $box.prop('hidden', true).empty();
            }
        });

        // Завантаження CSV -> відкриває кнопку «Вивантажити на Data.gov.ua»
        $('#btn-download-datagov').on('click', () => {
            if (!currentReport.ready) return;
            Core.downloadCsv('resources.csv', currentReport.rows);
            hasDownloaded = true;
            $('#btn-send-datagov').prop('hidden', false);
            toast(`Файл resources.csv (${currentReport.stats.totalRows} записів) завантажено!`);
        });

        // Вивантаження на Data.gov.ua
        $('#btn-send-datagov').on('click', () => {
            if (!currentReport.ready || !hasDownloaded) return;
            window.open('https://data.gov.ua/', '_blank', 'noopener,noreferrer');
            toast('Відкрито портал Data.gov.ua для публікації завантаженого resources.csv.');
        });
    }

    A.pages = A.pages || {};
    A.pages.reports = renderReportsPage;
})(window.App);