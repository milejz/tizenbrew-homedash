// Public holidays, computed locally (no API). Swedish built in; other countries can be added by
// js/local.js before this file loads: HOMEDASH_HOLIDAYS = { XX: function (year, h) { return [[date, name, note?]] } }
// where h = { d: (y, m, day) -> Date, addDays: (date, n) -> Date }.
// HOLIDAYS.between(from, to, countries) -> [{ date: Date, name: String, country: String, note?: String }]
var HOLIDAYS = (function () {
    'use strict';

    function d(y, m, day) { return new Date(y, m - 1, day); }
    function addDays(date, n) { return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n); }

    // Western (Gregorian) Easter Sunday - anonymous Gregorian algorithm.
    function westernEaster(y) {
        var a = y % 19, b = Math.floor(y / 100), c = y % 100, dd = Math.floor(b / 4), e = b % 4;
        var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
        var h = (19 * a + b - dd - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
        var l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
        var month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
        return d(y, month, day);
    }

    // First date in [from, from+6] that falls on weekday wd (0 = Sunday).
    function weekdayOnOrAfter(from, wd) { return addDays(from, (wd - from.getDay() + 7) % 7); }

    function swedish(y) {
        var easter = westernEaster(y);
        return [
            [d(y, 1, 1), 'Nyårsdagen'],
            [d(y, 1, 6), 'Trettondedag jul'],
            [addDays(easter, -2), 'Långfredagen'],
            [easter, 'Påskdagen'],
            [addDays(easter, 1), 'Annandag påsk'],
            [d(y, 5, 1), 'Första maj'],
            [addDays(easter, 39), 'Kristi himmelsfärd'],
            [addDays(easter, 49), 'Pingstdagen'],
            [d(y, 6, 6), 'Nationaldagen'],
            [weekdayOnOrAfter(d(y, 6, 19), 5), 'Midsommarafton'],
            [weekdayOnOrAfter(d(y, 6, 20), 6), 'Midsommardagen'],
            [weekdayOnOrAfter(d(y, 10, 31), 6), 'Alla helgons dag'],
            [d(y, 12, 24), 'Julafton'],
            [d(y, 12, 25), 'Juldagen'],
            [d(y, 12, 26), 'Annandag jul'],
            [d(y, 12, 31), 'Nyårsafton']
        ];
    }

    var BY_COUNTRY = { SE: swedish }, extra = window.HOMEDASH_HOLIDAYS || {}, helpers = { d: d, addDays: addDays };
    Object.keys(extra).forEach(function (c) { BY_COUNTRY[c] = function (y) { return extra[c](y, helpers); }; });

    function between(from, to, countries) {
        var out = [];
        for (var y = from.getFullYear(); y <= to.getFullYear(); y++) {
            (countries || ['SE']).forEach(function (c) {
                if (BY_COUNTRY[c]) out = out.concat(BY_COUNTRY[c](y).map(function (h) { return { date: h[0], name: h[1], country: c, note: h[2] }; }));
            });
        }
        return out.filter(function (h) { return h.date >= from && h.date <= to; })
            .sort(function (a, b) { return a.date - b.date || (a.country < b.country ? -1 : 1); });
    }

    return { between: between, westernEaster: westernEaster };
})();
