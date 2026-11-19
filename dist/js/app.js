$(function () {
    'use strict';

    const A = window.App = window.App || {};
    const $main = $('#main');

    // Головна функція маршрутизації
    function render() {
        // Отримуємо назву сторінки з URL (наприклад, #import?id=1 -> 'import')
        const page = location.hash.slice(1).split('?')[0] || 'overview';

        // Оновлюємо активний стан посилань у меню
        $('nav a').each(function () {
            const isActive = this.hash === '#' + page;
            $(this).toggleClass('active', isActive)
                   .attr('aria-current', isActive ? 'page' : null);
        });

        // Викликаємо відповідну сторінку (якщо модуль ще не підключений — показуємо заглушку)
        if (page === 'import' && A.pages?.import) {
            A.pages.import($main);
        } else if (page === 'passport' && A.pages?.passport) {
            A.pages.passport($main);
        } else if ((page === 'reports' || page === 'publication') && A.pages?.reports) {
            A.pages.reports($main);
        } else if (A.pages?.overview) {
            A.pages.overview($main);
        } else {
            $main.html(`<section class="panel"><h2>Сторінка «${page}» у розробці</h2></section>`);
        }
    }

    // Робимо render доступним глобально, щоб сторінки могли перемалювати себе після змін
    A.render = render;

    // Глобальний клік по кнопці переходу в паспорт будівлі
    $main.on('click', '[data-pass]', function () {
        location.hash = 'passport?id=' + encodeURIComponent($(this).attr('data-pass'));
    });

    // Реагуємо на зміну хешу в адресному рядку
    $(window).on('hashchange', () => {
        render();
        window.scrollTo(0, 0);
    });

    // Перший запуск при завантаженні сторінки
    render();
});