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
                        Натисніть кнопку нижче, щоб завантажити готовий файл.
                    </p>
                    <div class="actions extras">
                        <button type="button" class="btn primary" id="btn-download-datagov">
                            Завантажити resources.csv
                        </button>
                    </div>
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

            <!-- Заготовка під майбутні звіти (поки прихована або як анонс) -->
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

        // Завантаження в один клік
        $('#btn-download-datagov').on('click', () => {
            if (!report.ready) return;
            Core.downloadCsv('resources.csv', report.rows);
            toast(`Файл resources.csv (${report.stats.totalRows} записів) завантажено!`);
        });
    }

    A.pages = A.pages || {};
    A.pages.reports = renderReportsPage;
})(window.App);