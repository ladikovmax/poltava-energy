$(function () {
    'use strict';

    const A = window.App = window.App || {};
    const $main =$('#main');

    if (A.analyticsCore?.setHddMode) {
        A.analyticsCore.setHddMode(false);
    }

    function render() {
        const page = location.hash.slice(1).split('?')[0] || 'overview';

        $('nav a').each(function () {
            const isActive = this.hash === '#' + page;
            $(this).toggleClass('active', isActive)
                   .attr('aria-current', isActive ? 'page' : null);
        });

        if (page === 'import' && A.pages?.import) {
            A.pages.import($main);
        } else if (page === 'passport' && A.pages?.passport) {
            A.pages.passport($main);
        } else if (page === 'analytics' && A.pages?.analytics) {
            A.pages.analytics($main);
        } else if ((page === 'reports' || page === 'publication') && A.pages?.reports) {
            A.pages.reports($main);
        } else if (A.pages?.overview) {
            A.pages.overview($main);
        } else {
            $main.html(`<section class="panel"><h2>Сторінка «${page}» у розробці</h2></section>`);
        }
    }

    A.render = render;

    $main.on('click', '[data-pass]', function () {
        location.hash = 'passport?id=' + encodeURIComponent($(this).attr('data-pass'));
    });

    $(window).on('hashchange', () => {
        render();
        window.scrollTo(0, 0);
    });

    render();
});