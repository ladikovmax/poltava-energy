$(function workspaceApp() {
    'use strict';

    const W = window.Workspace;
    const $main = $('#main');
    const { esc, download, notify } = W;
    const { header } = W.ui;

    // Головний маршрутизатор: оновлення активного пункту навігації та відображення відповідної сторінки за URL-хешем
    function render() {
        const pageName = (location.hash.slice(1).split('?')[0] || 'overview');
        $('nav a').each(function () {
            if (this.hash === '#' + pageName) $(this).attr('aria-current', 'page');
            else $(this).removeAttr('aria-current');
        });
        if (pageName === 'passport') W.pages.passport($main);
        else if (pageName === 'import') W.pages.import($main);
        else if (pageName === 'publication') {
            $main.html(header('Відкриті дані', 'Перевірка показань для оновлення resources.csv на data.gov.ua.') + '<div id="publication"></div>');
            window.renderPublication($('#publication')[0], W.state.data, { esc, download, notify });
        } else W.pages.overview($main);
    }

    W.render = render;

    $main.on('click', '[data-pass]', function () {
        location.hash = 'passport?id=' + encodeURIComponent($(this).attr('data-pass'));
    });

    $(window).on('hashchange', () => {
        render();
        window.scrollTo(0, 0);
    });

    render();
});