// HomeDash - Tizen TV dashboard + launcher.
// Plain ES5 + XHR on purpose: 2016-2018 Samsung TVs ship old Chromium builds.
(function () {
    'use strict';

    var IS_TV = typeof tizen !== 'undefined';
    var DAYS = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
    var DAYS_SHORT = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];
    var MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti',
        'september', 'oktober', 'november', 'december'];
    var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27,
        RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406 };

    function $(id) { return document.getElementById(id); }
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }
    function status(msg) { $('status').textContent = msg || ''; }

    function get(url, cb, asXml) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.timeout = 15000;
        xhr.onload = function () {
            if (xhr.status < 200 || xhr.status >= 300) return cb(new Error('HTTP ' + xhr.status));
            try {
                cb(null, asXml ? (xhr.responseXML || new DOMParser().parseFromString(xhr.responseText, 'text/xml'))
                    : JSON.parse(xhr.responseText));
            } catch (e) { cb(e); }
        };
        xhr.onerror = function () { cb(new Error('nätverksfel')); };
        xhr.ontimeout = function () { cb(new Error('timeout')); };
        xhr.send();
    }

    // ---------- clock ----------
    function isoWeek(d) {
        var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        var day = t.getUTCDay() || 7;
        t.setUTCDate(t.getUTCDate() + 4 - day);
        var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
        return Math.ceil(((t - y0) / 86400000 + 1) / 7);
    }
    // Background sky follows the sun: sunrise/sunset from the weather call, fallback 07:00/19:00.
    var sun = { rise: 7 * 60, set: 19 * 60 };
    function hm(s) { return parseInt(s.slice(11, 13), 10) * 60 + parseInt(s.slice(14, 16), 10); }
    function updateSky(d) {
        var m = d.getHours() * 60 + d.getMinutes(), sky;
        if (Math.abs(m - sun.rise) <= 60) sky = 'dawn';
        else if (Math.abs(m - sun.set) <= 60) sky = 'dusk';
        else sky = m > sun.rise && m < sun.set ? 'day' : 'night';
        if (document.body.getAttribute('data-sky') !== sky) document.body.setAttribute('data-sky', sky);
    }

    var lastHour = -1;
    function tickClock() {
        var d = new Date();
        updateSky(d);
        // Hour change: move the elpris "now" bar; midnight: new day's prices + holiday countdown.
        if (lastHour !== -1 && d.getHours() !== lastHour) {
            if (d.getHours() === 0 || d.getHours() === 13) loadElpris(); else renderElpris();
            renderHolidays();
        }
        lastHour = d.getHours();
        $('time').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
        $('date').textContent = DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] +
            ' · vecka ' + isoWeek(d);
    }

    // ---------- weather (Open-Meteo, no key) ----------
    function wmo(code) {
        if (code === 0) return 'Klart';
        if (code <= 2) return 'Halvklart';
        if (code === 3) return 'Mulet';
        if (code <= 48) return 'Dimma';
        if (code <= 57) return 'Duggregn';
        if (code <= 67) return 'Regn';
        if (code <= 77) return 'Snö';
        if (code <= 82) return 'Regnskurar';
        if (code <= 86) return 'Snöbyar';
        return 'Åska';
    }
    // Inline SVG weather icons (64x64 grid). night = moon instead of sun for clear/partly cloudy.
    var CLOUD = '<path d="M19 47h27a11 11 0 0 0 1-22 15 15 0 0 0-28-3 12 12 0 0 0 0 25z" fill="#dfe6ee"/>';
    function sunSvg(cx, cy, r) {
        var rays = '';
        for (var a = 0; a < 8; a++) {
            var t = a * Math.PI / 4, c = Math.cos(t), s = Math.sin(t);
            rays += '<line x1="' + (cx + c * (r + 5)) + '" y1="' + (cy + s * (r + 5)) + '" x2="' + (cx + c * (r + 10)) +
                '" y2="' + (cy + s * (r + 10)) + '"/>';
        }
        return '<g stroke="#ffd166" stroke-width="3.5" stroke-linecap="round">' + rays + '</g><circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#ffd166"/>';
    }
    function moonSvg(dx, dy, k) {
        return '<path transform="translate(' + dx + ' ' + dy + ') scale(' + k + ')" d="M38 10a20 20 0 1 0 16 31A17 17 0 0 1 38 10z" fill="#efe6c4"/>';
    }
    function drops(color, dots) {
        var out = '';
        for (var i = 0; i < 3; i++) {
            var x = 22 + i * 10;
            out += dots ? '<circle cx="' + x + '" cy="' + (55 + (i % 2) * 4) + '" r="2.6" fill="' + color + '"/>'
                : '<line x1="' + x + '" y1="52" x2="' + (x - 3) + '" y2="60" stroke="' + color + '" stroke-width="3.5" stroke-linecap="round"/>';
        }
        return out;
    }
    function wIcon(code, night) {
        var up = '<g transform="translate(0 -6)">' + CLOUD + '</g>', body;
        if (code === 0) body = night ? moonSvg(4, 4, 1) : sunSvg(32, 32, 12);
        else if (code <= 2) body = (night ? moonSvg(-4, -6, .8) : sunSvg(24, 22, 9)) + '<g transform="translate(6 6) scale(.85)">' + CLOUD + '</g>';
        else if (code === 3) body = CLOUD;
        else if (code <= 48) body = '<g stroke="#cfd8e3" stroke-width="4" stroke-linecap="round"><line x1="12" y1="24" x2="52" y2="24"/><line x1="8" y1="34" x2="48" y2="34"/><line x1="16" y1="44" x2="56" y2="44"/></g>';
        else if (code <= 67 || (code >= 80 && code <= 82)) body = up + drops('#6fb6ff');
        else if (code <= 86) body = up + drops('#ffffff', true);
        else body = up + '<path d="M34 40l-8 12h7l-4 10 11-14h-7l4-8z" fill="#ffd166"/>';
        return '<svg class="wicon" viewBox="0 0 64 64">' + body + '</svg>';
    }
    function loadWeather() {
        var L = CONFIG.location;
        var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + L.lat + '&longitude=' + L.lon +
            '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m' +
            '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset' +
            '&wind_speed_unit=ms&timezone=auto&forecast_days=5';
        get(url, function (err, w) {
            if (err) return status('Väder: ' + err.message);
            var c = w.current, dl = w.daily;
            sun = { rise: hm(dl.sunrise[0]), set: hm(dl.sunset[0]) };
            updateSky(new Date());
            var night = document.body.getAttribute('data-sky') === 'night';
            $('weatherNow').innerHTML = wIcon(c.weather_code, night) +
                '<div class="temp">' + Math.round(c.temperature_2m) + '°</div>' +
                '<div class="wdesc">' + esc(wmo(c.weather_code)) + '<br>' +
                '<small>Känns som ' + Math.round(c.apparent_temperature) + '° · vind ' +
                Math.round(c.wind_speed_10m) + ' m/s</small><br>' +
                '<small>' + esc(L.name) + ' · ' + Math.floor((sun.set - sun.rise) / 60) + ' h ' +
                pad((sun.set - sun.rise) % 60) + ' min dagsljus</small><br>' +
                '<small class="sun">Soluppgång <b>' + esc(dl.sunrise[0].slice(11)) + '</b> · Solnedgång <b>' +
                esc(dl.sunset[0].slice(11)) + '</b></small></div>';
            var html = '';
            for (var i = 0; i < dl.time.length; i++) {
                var day = i === 0 ? 'idag' : DAYS_SHORT[new Date(dl.time[i] + 'T12:00').getDay()];
                html += '<div class="fday"><div class="fname">' + day + '</div>' + wIcon(dl.weather_code[i], false) +
                    '<div class="fdesc">' + esc(wmo(dl.weather_code[i])) + '</div>' +
                    '<div class="ftemp">' + Math.round(dl.temperature_2m_max[i]) + '° <span>' +
                    Math.round(dl.temperature_2m_min[i]) + '°</span></div>' +
                    '<div class="frain">' + (dl.precipitation_probability_max[i] || 0) + '% regn</div>' +
                    '<div class="fsun">' + esc(dl.sunrise[i].slice(11)) + '–' + esc(dl.sunset[i].slice(11)) + '</div></div>';
            }
            $('forecast').innerHTML = html;
        });
    }

    // ---------- SL departures + disruptions ----------
    var lastDeps = null, disruptionCount = 0;

    // "Nu" -> green pill, "5 min" -> big number + small unit, clock times as-is.
    function whenHtml(t) {
        t = String(t || '');
        if (/^nu$/i.test(t)) return '<span class="when now">Nu</span>';
        var m = /^(\d+)\s*min$/.exec(t.trim());
        return '<span class="when">' + (m ? '<b>' + m[1] + '</b><small>min</small>' : esc(t)) + '</span>';
    }
    function renderDepartures() {
        var sl = CONFIG.sl;
        if (!lastDeps) return;
        // Each disruption line takes about one departure row of space.
        var deps = lastDeps.slice(0, Math.max(3, sl.max - disruptionCount));
        if (!deps.length) { $('departures').innerHTML = '<li class="muted">Inga avgångar</li>'; return; }
        $('departures').innerHTML = deps.map(function (d) {
            var mode = (d.line && d.line.transport_mode || '').toLowerCase().replace(/[^a-z]/g, '');
            return '<li><span class="line ' + mode + '">' + esc(d.line && d.line.designation) + '</span>' +
                '<span class="dest">' + esc(d.destination) + '</span>' +
                whenHtml(d.display) + '</li>';
        }).join('');
    }

    function loadDepartures() {
        var sl = CONFIG.sl;
        if (!sl || !sl.siteId) { $('departuresCard').className += ' hidden'; return; }
        $('departuresTitle').textContent = 'Avgångar · ' + sl.name;
        get('https://transport.integration.sl.se/v1/sites/' + sl.siteId + '/departures?forecast=60', function (err, r) {
            if (err) { $('departures').innerHTML = '<li class="muted">Kunde inte hämta (' + esc(err.message) + ')</li>'; return; }
            lastDeps = (r.departures || []).filter(function (d) {
                return !sl.modes || sl.modes.indexOf(d.line && d.line.transport_mode) >= 0;
            });
            renderDepartures();
        });
    }

    function loadDisruptions() {
        var cfg = CONFIG.slDisruptions;
        if (!cfg || !cfg.lines || !cfg.lines.length) return;
        var url = 'https://deviations.integration.sl.se/v1/messages?transport_authority=1&line=' +
            cfg.lines.map(encodeURIComponent).join('&line=');
        get(url, function (err, msgs) {
            if (err || !msgs || !msgs.length) msgs = [];
            var now = new Date();
            var active = msgs.filter(function (m) {
                var p = m.publish || {};
                return (!p.from || new Date(p.from) <= now) && (!p.upto || new Date(p.upto) >= now);
            }).sort(function (a, b) {
                return ((b.priority && b.priority.importance_level) || 0) - ((a.priority && a.priority.importance_level) || 0);
            }).slice(0, cfg.max);
            disruptionCount = active.length;
            $('disruptions').innerHTML = active.map(function (m) {
                var v = (m.message_variants || [])[0] || {};
                return '<div class="disruption"><b>' + esc(v.scope_alias || 'SL') + '</b> ' + esc(v.header) + '</div>';
            }).join('');
            renderDepartures();
        });
    }

    // ---------- electricity spot price (elprisetjustnu.se) ----------
    var elDays = {}; // 'YYYY-MM-DD' -> [24 hourly prices in öre/kWh] or null

    function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

    function loadElDay(date, cb) {
        var cfg = CONFIG.elpris, key = ymd(date);
        var url = 'https://www.elprisetjustnu.se/api/v1/prices/' + date.getFullYear() + '/' +
            pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + '_' + cfg.area + '.json';
        get(url, function (err, rows) {
            if (err || !rows || !rows.length) { elDays[key] = null; return cb(); }
            // 15-minute (or hourly) rows -> hourly averages, in öre/kWh.
            var sum = {}, n = {};
            rows.forEach(function (r) {
                var h = new Date(r.time_start).getHours();
                sum[h] = (sum[h] || 0) + r.SEK_per_kWh;
                n[h] = (n[h] || 0) + 1;
            });
            var hours = [];
            for (var h = 0; h < 24; h++) {
                hours.push(n[h] ? sum[h] / n[h] * 100 * (cfg.vat ? 1.25 : 1) : null);
            }
            elDays[key] = hours;
            cb();
        });
    }

    function loadElpris() {
        if (!CONFIG.elpris) return;
        var today = new Date(), tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
        loadElDay(today, function () {
            renderElpris();
            // Next-day prices are published around 13:00.
            if (today.getHours() >= 13) loadElDay(tomorrow, renderElpris);
        });
    }

    function renderElpris() {
        var cfg = CONFIG.elpris;
        if (!cfg) return;
        var now = new Date(), hours = elDays[ymd(now)];
        if (!hours) { $('elpris').innerHTML = '<div class="el-title">Elpris ' + esc(cfg.area) + '</div><div class="muted">Ingen data</div>'; return; }
        var valid = hours.filter(function (p) { return p !== null; });
        var max = Math.max.apply(null, valid), min = Math.min.apply(null, valid);
        var avg = valid.reduce(function (a, b) { return a + b; }, 0) / valid.length;
        var cheap = hours.map(function (p, h) { return { p: p, h: h }; })
            .filter(function (x) { return x.p !== null && x.h >= now.getHours(); })
            .sort(function (a, b) { return a.p - b.p; }).slice(0, cfg.cheapest || 3)
            .map(function (x) { return x.h; });
        var cur = hours[now.getHours()];
        var bars = hours.map(function (p, h) {
            if (p === null) return '<div class="bar"></div>';
            var pct = max > 0 ? Math.max(4, Math.round(Math.max(p, 0) / max * 100)) : 4;
            var cls = h === now.getHours() ? ' now' : cheap.indexOf(h) >= 0 ? ' cheap' : h < now.getHours() ? ' past' : '';
            return '<div class="bar' + cls + '"><i style="height:' + pct + '%"></i></div>';
        }).join('');
        var best = cheap.slice().sort(function (a, b) { return hours[a] - hours[b]; })[0];
        var tomorrow = elDays[ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))];
        var tAvg = tomorrow && tomorrow.filter(function (p) { return p !== null; });
        tAvg = tAvg && tAvg.length ? tAvg.reduce(function (a, b) { return a + b; }, 0) / tAvg.length : null;
        $('elpris').innerHTML =
            '<div class="el-head"><span class="el-title">Elpris ' + esc(cfg.area) + '</span>' +
            '<span class="el-now">' + Math.round(cur) + '<small> öre/kWh</small></span></div>' +
            '<div class="bars">' + bars + '</div>' +
            '<div class="el-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>' +
            '<div class="el-foot">' +
            (best !== undefined ? 'Billigast kvar ' + pad(best) + '–' + pad((best + 1) % 24) + ' (' + Math.round(hours[best]) + ') · ' : '') +
            'snitt ' + Math.round(avg) + ' · ' + Math.round(min) + '–' + Math.round(max) +
            (tAvg !== null ? ' · imorgon ' + Math.round(tAvg) : '') +
            (cfg.vat ? ' · inkl. moms' : '') + '</div>';
    }

    // ---------- holidays (SE + RS, computed locally) ----------
    function renderHolidays() {
        var cfg = CONFIG.holidays;
        if (!cfg) return;
        var now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        var list = HOLIDAYS.between(today, new Date(today.getFullYear(), today.getMonth(), today.getDate() + (cfg.daysAhead || 120)), cfg.countries)
            .slice(0, cfg.max);
        if (!list.length) { $('holidays').innerHTML = '<li class="muted">Inga helgdagar snart</li>'; return; }
        $('holidays').innerHTML = list.map(function (h) {
            var days = Math.round((h.date - today) / 86400000);
            var when = days === 0 ? 'idag' : days === 1 ? 'imorgon' : 'om ' + days + ' d';
            return '<li' + (days === 0 ? ' class="today"' : '') + '><span class="flag ' + h.country.toLowerCase() + '">' + h.country + '</span>' +
                '<span class="dest">' + esc(h.name) + (h.note ? ' <small>(' + esc(h.note) + ')</small>' : '') + '</span>' +
                '<span class="when">' + DAYS_SHORT[h.date.getDay()] + ' ' + h.date.getDate() + '/' + (h.date.getMonth() + 1) +
                ' · ' + when + '</span></li>';
        }).join('');
    }

    // ---------- warnings (SMHI + Krisinformation) ----------
    var warn = { smhi: [], kris: [] };

    function matchesArea(text) {
        return CONFIG.warnings.areas.some(function (a) { return String(text || '').indexOf(a) >= 0; });
    }

    function loadWarnings() {
        var cfg = CONFIG.warnings;
        if (!cfg) return;
        get('https://opendata-download-warnings.smhi.se/ibww/api/version/1/warning.json', function (err, list) {
            warn.smhi = [];
            if (!err && list) list.forEach(function (w) {
                (w.warningAreas || []).forEach(function (a) {
                    var end = a.approximateEnd && new Date(a.approximateEnd);
                    if (cfg.smhiLevels.indexOf(a.warningLevel && a.warningLevel.code) < 0 || (end && end < new Date())) return;
                    if (!matchesArea(a.areaName && a.areaName.sv)) return;
                    warn.smhi.push({ level: a.warningLevel.code.toLowerCase(), src: 'SMHI',
                        text: (a.eventDescription && a.eventDescription.sv) || w.event.sv });
                });
            });
            renderWarnings();
        });
        get('https://api.krisinformation.se/v3/vmas', function (err, vmas) {
            var out = (!err && vmas ? vmas : []).map(function (v) {
                return { level: 'red', src: 'VMA', text: v.Headline || v.headline || v.PushMessage || 'Viktigt meddelande till allmänheten' };
            });
            get('https://api.krisinformation.se/v3/news?days=1', function (err2, news) {
                (!err2 && news ? news : []).forEach(function (n) {
                    if ((n.area || []).some(function (a) { return a.type !== 'Country' && matchesArea(a.description); }))
                        out.push({ level: 'orange', src: 'Krisinfo', text: n.headline });
                });
                warn.kris = out;
                renderWarnings();
            });
        });
    }

    function renderWarnings() {
        var rank = { red: 0, orange: 1, yellow: 2, message: 3 };
        var all = warn.kris.concat(warn.smhi).sort(function (a, b) { return rank[a.level] - rank[b.level]; });
        $('warnings').innerHTML = all.slice(0, CONFIG.warnings.max).map(function (w) {
            return '<div class="warning ' + w.level + '"><b>' + esc(w.src) + '</b> ' + esc(w.text) + '</div>';
        }).join('') + (all.length > CONFIG.warnings.max ? '<div class="warning-more">+' + (all.length - CONFIG.warnings.max) + ' till</div>' : '');
    }

    // ---------- exchange rates (FOREX Bank) ----------
    // api.forex.se answers browser (CORS) requests with an empty body, so under TizenBrew this goes
    // through the service proxy; the native .wgt has no CORS and asks directly first.
    // Rate ids are MARKET-FROM-TO: SWE-SEK-EUR = SEK per EUR when FOREX sells EUR,
    // SWE-EUR-SEK = EUR per SEK when FOREX buys EUR back.
    function forexRate(from, to, cb) {
        var url = 'https://api.forex.se/currency/exchangeRates/SWE-' + from + '-' + to + '/exchange/1.000000';
        function parse(err, r) { var rate = !err && r && r.data && r.data.attributes && r.data.attributes.rate; return rate > 0 ? rate : null; }
        get(url, function (err, r) {
            var rate = parse(err, r);
            if (rate) return cb(rate);
            get(PROXY + encodeURIComponent(url), function (err2, r2) { cb(parse(err2, r2)); });
        });
    }

    // ---------- plugins ----------
    // Personal features live outside this public repo, in js/local.js (gitignored, packaged into the TV
    // app only): HOMEDASH_PLUGINS = [{ ... }]. Hooks, all optional (HD = helper API, set at init):
    //   loadRates(done)  fetch extra rates, call done() once     rateRows() -> extra <tr> html for the rates table
    //   rateNote() -> text appended to the rates title           afterRates() -> runs after the table is drawn
    //   buttons() -> extra launcher-bar html (data-app ids)       open(id) -> true if it handled that button
    //   key(name) -> true if it handled a colour key ('YELLOW')   back() -> true if it closed something
    var PLUGINS = window.HOMEDASH_PLUGINS || [];
    function hook(name) {
        var args = Array.prototype.slice.call(arguments, 1), out = [];
        PLUGINS.forEach(function (p) {
            if (typeof p[name] !== 'function') return;
            try { out.push(p[name].apply(p, args)); } catch (e) { status('Plugin: ' + e.message); }
        });
        return out;
    }
    function handled(results) { return results.indexOf(true) >= 0; }

    var rateRows = { forex: {} };

    function loadRates() {
        var cfg = CONFIG.rates;
        if (!cfg) return;
        var fx = cfg.forex || [], waits = PLUGINS.filter(function (p) { return typeof p.loadRates === 'function'; });
        var left = fx.length * 2 + waits.length;
        function done() { if (--left === 0) renderRates(); }
        if (!left) return renderRates();
        rateRows.forex = {};
        fx.forEach(function (c) {
            var row = rateRows.forex[c.code] = {};
            forexRate('SEK', c.code, function (r) { row.sell = r; done(); });
            forexRate(c.code, 'SEK', function (r) { row.buy = r && 1 / r; done(); });
        });
        waits.forEach(function (p) {
            var once = false;
            try { p.loadRates(function () { if (!once) { once = true; done(); } }); } catch (e) { if (!once) { once = true; done(); } }
        });
    }

    function rateRow(label, src, v, unit, dec, cls) {
        return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><th><span class="src ' + src.toLowerCase() + '">' + src + '</span>' + label + '</th>' + v.map(function (n) {
            return '<td>' + (n ? (n * unit).toFixed(dec).replace('.', ',') : '–') + '</td>';
        }).join('') + '</tr>';
    }

    function renderRates() {
        var cfg = CONFIG.rates, html = '';
        (cfg.forex || []).forEach(function (c) {
            var r = rateRows.forex[c.code] || {}, unit = c.unit || 1;
            html += rateRow((unit > 1 ? unit + ' ' : '') + esc(c.code) + '/SEK', 'FOREX',
                [r.buy, r.buy && r.sell ? (r.buy + r.sell) / 2 : null, r.sell], unit, c.decimals == null ? 2 : c.decimals);
        });
        html += hook('rateRows').join('');
        var now = new Date();
        $('ratesTitle').innerHTML = 'Valuta <span class="hint">FOREX ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) +
            esc(hook('rateNote').join('')) + '</span>';
        $('rates').innerHTML = '<tr class="head"><th></th><td>Köp</td><td>Mitt</td><td>Sälj</td></tr>' + html;
        hook('afterRates');
    }

    function fmtNum(n, dec) {
        var parts = n.toFixed(dec || 0).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        return parts.join(',');
    }

    // ---------- extras row: school lunch (skolmaten.se RSS) + air quality/pollen (Open-Meteo) ----------
    // Built in JS under the cards so the installed .wgt needs no index.html change.
    function setupExtras() {
        var row = $('forecastCard').parentNode, box = document.createElement('section'), html = '';
        box.className = 'extras';
        if (CONFIG.music && CONFIG.music.playerUrl) {
            var btn = function (id, icon, extra) {
                return '<div class="mbtn focusable' + (extra || '') + '" tabindex="0" data-app="' + id + '">' + icon + '</div>';
            };
            html += '<div class="card mini music"><div class="mplayer"><iframe id="mframe" src="' + esc(CONFIG.music.playerUrl) +
                '" allow="autoplay; encrypted-media" frameborder="0"></iframe></div>' +
                '<div class="minfo"><h2>' + esc(CONFIG.music.name || 'Musik') + '</h2>' +
                '<div id="mtitle" class="mtitle">Laddar spelaren…</div><div id="mauthor" class="mauthor"></div>' +
                '<div class="mctrl">' + btn(M.prev, ICONS.prev) + btn(M.toggle, ICONS.play, ' big') + btn(M.next, ICONS.next) +
                btn(M.search, ICONS.search) + btn(M.full, ICONS.full) + '</div></div></div>';
        }
        (CONFIG.lunch || []).forEach(function (l, i) {
            html += '<div class="card mini lunch"><h2>Lunch · ' + esc(l.name) + '</h2><div id="lunch' + i + '" class="lunch-body muted">…</div></div>';
        });
        if (CONFIG.air !== false) html += '<div class="card mini air"><h2>Luft &amp; pollen</h2><div id="air" class="air-body muted">…</div></div>';
        box.innerHTML = html;
        row.parentNode.insertBefore(box, row.nextSibling);
    }

    // Music card: the YouTube player lives in player/index.html on an https host (YouTube won't embed
    // in a file:// page); we drive it with postMessage and it reports state/title back.
    var M = { prev: '#mprev', toggle: '#mtoggle', next: '#mnext', full: '#mfull', search: '#msearch' }, mState = -1;
    function musicLink() {
        var link = String(CONFIG.music.link || '');
        var v = /[?&]v=([\w-]+)/.exec(link), list = /[?&]list=([\w-]+)/.exec(link);
        return { v: v && v[1], list: list && list[1] };
    }
    // Only talk to our own player frame, and only at the origin configured in playerUrl.
    function playerOrigin() { var m = /^https:\/\/[^/]+/.exec(String(CONFIG.music.playerUrl || '')); return m ? m[0] : null; }
    function playerCmd(msg) {
        var f = $('mframe'), o = playerOrigin();
        if (f && f.contentWindow && o) f.contentWindow.postMessage(msg, o);
    }
    window.addEventListener('message', function (e) {
        var d = e.data, f = $('mframe');
        if (!f || e.source !== f.contentWindow || e.origin !== playerOrigin()) return;
        if (!d || d.homedash !== 'player') return;
        if (d.state === -2) { var l = musicLink(); return playerCmd({ cmd: 'load', v: l.v, list: l.list, autoplay: !!CONFIG.music.autoplay }); }
        mState = d.state;
        if (d.title) { $('mtitle').textContent = d.title; $('mauthor').textContent = d.author || ''; }
        var t = document.querySelector('[data-app="' + M.toggle + '"]');
        if (t) t.innerHTML = mState === 1 ? ICONS.pause : ICONS.play;
    });

    // ---------- music search ----------
    // Reads YouTube's normal search page and its embedded ytInitialData (no API key). Only works in the
    // native .wgt, which has no browser CORS limits. Unofficial: may break when YouTube changes the page.
    var SEARCH_PREFIX = '#ytplay:';
    function searchOpen() { var p = $('searchPanel'); return !!p && p.className.indexOf('hidden') < 0; }
    function ytResults(html, max) {
        var i = html.indexOf('var ytInitialData = ');
        if (i < 0) i = html.indexOf('ytInitialData = ');
        if (i < 0) return [];
        var start = html.indexOf('{', i), end = html.indexOf(';</script>', start), out = [];
        (function walk(o) {
            if (!o || typeof o !== 'object' || out.length >= max) return;
            if (o.videoRenderer && o.videoRenderer.videoId) {
                var v = o.videoRenderer, t = v.title && (v.title.runs ? v.title.runs.map(function (r) { return r.text; }).join('') : v.title.simpleText);
                out.push({ id: v.videoId, title: t || '', author: v.ownerText && v.ownerText.runs ? v.ownerText.runs[0].text : '',
                    length: v.lengthText ? v.lengthText.simpleText : '' });
                return;
            }
            for (var k in o) walk(o[k]);
        })(JSON.parse(html.slice(start, end)));
        return out;
    }
    function setupSearch() {
        var p = document.createElement('div');
        p.id = 'searchPanel';
        p.className = 'search-panel hidden';
        p.innerHTML = '<h2>Sök musik <span class="hint">OK på fältet = tangentbord · Tillbaka = stäng</span></h2>' +
            '<input id="searchInput" class="search-input focusable" type="search" placeholder="Låt, artist eller album…" autocomplete="off">' +
            '<div id="searchResults" class="search-results"></div>';
        document.body.appendChild(p);
        var input = $('searchInput');
        input.addEventListener('keydown', function (e) {
            // 13 = Enter, 65376 = Samsung IME "Done"
            if ((e.keyCode === 13 || e.keyCode === 65376) && input.value.trim()) { e.preventDefault(); e.stopPropagation(); runSearch(input.value); }
            else if (e.keyCode === 13) e.stopPropagation(); // empty field: let OK open the TV keyboard
        });
        input.addEventListener('change', function () { runSearch(input.value); });
    }
    var lastQuery = '';
    function runSearch(q) {
        q = String(q || '').trim();
        if (!q || q === lastQuery) return;
        lastQuery = q;
        var box = $('searchResults');
        box.innerHTML = '<div class="muted">Söker…</div>';
        var xhr = new XMLHttpRequest();
        xhr.open('GET', 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q) + '&sp=EgIQAQ%253D%253D&hl=sv&gl=SE', true);
        xhr.timeout = 15000;
        xhr.onload = function () {
            var list = [];
            try { list = xhr.status === 200 ? ytResults(xhr.responseText, 12) : []; } catch (e) { }
            if (!list.length) { box.innerHTML = '<div class="muted">Inga träffar (eller så har YouTube ändrat sidan)</div>'; return; }
            box.innerHTML = list.map(function (r) {
                return '<div class="sres focusable" tabindex="0" data-app="' + SEARCH_PREFIX + esc(r.id) + '">' +
                    '<img src="https://i.ytimg.com/vi/' + esc(r.id) + '/mqdefault.jpg" alt="">' +
                    '<div class="sres-title">' + esc(r.title) + '</div>' +
                    '<div class="sres-meta">' + esc(r.author) + (r.length ? ' · ' + esc(r.length) : '') + '</div></div>';
            }).join('');
            var first = box.querySelector('.sres');
            if (first) first.focus();
        };
        xhr.onerror = xhr.ontimeout = function () { box.innerHTML = '<div class="muted">Kunde inte söka (nätverk)</div>'; lastQuery = ''; };
        xhr.send();
    }
    function toggleSearch() {
        var p = $('searchPanel'), open = !searchOpen();
        p.className = open ? 'search-panel' : 'search-panel hidden';
        if (open) { lastQuery = ''; $('searchInput').focus(); }
        else { var b = document.querySelector('[data-app="' + M.search + '"]'); if (b) b.focus(); }
    }
    function playSearchResult(id) {
        if (!/^[\w-]{6,20}$/.test(id)) return;
        playerCmd({ cmd: 'load', v: id, autoplay: true });
        if (searchOpen()) toggleSearch();
    }

    var WEEKDAYS = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
    function loadLunch() {
        var now = new Date(), target = new Date(now.getTime());
        if (now.getHours() >= 14) target.setDate(target.getDate() + 1); // after lunch: show tomorrow
        var label = target.getDate() === now.getDate() ? 'Idag' : 'Imorgon';
        var key = target.getFullYear() + '-' + target.getMonth() + '-' + target.getDate();
        (CONFIG.lunch || []).forEach(function (l, i) {
            var el = $('lunch' + i);
            if (!el) return;
            if (!l.school) { el.innerHTML = 'Ange skolans skolmaten-namn i config.js'; return; }
            get('https://skolmaten.se/api/4/rss/week/' + encodeURIComponent(l.school) + '?locale=sv', function (err, xml) {
                if (err || !xml) { el.className = 'lunch-body muted'; el.textContent = 'Kunde inte hämta menyn'; return; }
                var items = xml.getElementsByTagName('item'), dishes = null;
                for (var k = 0; k < items.length; k++) {
                    var p = items[k].getElementsByTagName('pubDate')[0], d = p && new Date(p.textContent);
                    // pubDate is the day at 00:00 GMT, so compare UTC date parts
                    if (d && d.getUTCFullYear() + '-' + d.getUTCMonth() + '-' + d.getUTCDate() === key) {
                        var desc = items[k].getElementsByTagName('description')[0];
                        dishes = String(desc ? desc.textContent : '').split(/<br\s*\/?>|\n/i).map(function (s) {
                            return s.replace(/<[^>]*>/g, '').trim();
                        }).filter(Boolean);
                    }
                }
                var when = label + ' · ' + WEEKDAYS[target.getDay()];
                if (dishes && dishes.length) {
                    el.className = 'lunch-body';
                    el.innerHTML = '<div class="lunch-when">' + when + '</div>' + dishes.slice(0, 2).map(function (s) {
                        return '<div class="dish">' + esc(s) + '</div>';
                    }).join('');
                } else {
                    el.className = 'lunch-body muted';
                    el.innerHTML = '<div class="lunch-when">' + when + '</div><div class="dish">' +
                        (dishes ? 'Ingen meny – lov?' : target.getDay() % 6 === 0 ? 'Helg – ingen skollunch' : 'Ingen skollunch') + '</div>';
                }
            }, true);
        });
    }

    // EAQI bands -> label/class; pollen grains/m³ -> level (tree pollen tolerates more than grass/weeds).
    function aqiBand(v) {
        var b = [[20, 'Bra luft', 'good'], [40, 'Ganska bra luft', 'fair'], [60, 'Måttlig luft', 'moderate'],
            [80, 'Dålig luft', 'poor'], [100, 'Mycket dålig luft', 'bad']];
        for (var i = 0; i < b.length; i++) if (v <= b[i][0]) return b[i];
        return [999, 'Extremt dålig luft', 'bad'];
    }
    var POLLEN = [['birch_pollen', 'Björk', 100], ['alder_pollen', 'Al', 100], ['grass_pollen', 'Gräs', 50], ['mugwort_pollen', 'Gråbo', 50]];
    function loadAir() {
        if (!$('air')) return;
        var L = CONFIG.location;
        get('https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + L.lat + '&longitude=' + L.lon +
            '&current=european_aqi&hourly=' + POLLEN.map(function (p) { return p[0]; }).join(',') +
            '&forecast_days=1&timezone=auto', function (err, r) {
            var el = $('air');
            if (err || !r || !r.current) { el.className = 'air-body muted'; el.textContent = 'Kunde inte hämta luftkvalitet'; return; }
            var aqi = Math.round(r.current.european_aqi), band = aqiBand(aqi), chips = '';
            POLLEN.forEach(function (p) {
                var max = Math.max.apply(null, (r.hourly[p[0]] || [0]).map(function (x) { return x || 0; }));
                if (max < 1) return;
                var lvl = max >= p[2] ? ['Hög', 'high'] : max >= 10 ? ['Måttlig', 'mid'] : ['Låg', 'low'];
                chips += '<span class="chip ' + lvl[1] + '">' + p[1] + ' · ' + lvl[0] + '</span>';
            });
            el.className = 'air-body';
            el.innerHTML = '<div class="aqi ' + band[2] + '"><span class="aqi-num">' + aqi + '</span><span class="aqi-txt">' + band[1] +
                '<small>Europeiskt luftindex</small></span></div>' +
                '<div class="pollen">' + (chips || '<span class="chip none">Inget pollen i luften idag</span>') + '</div>';
        });
    }

    // ---------- news (RSS) ----------
    // Under TizenBrew the page is served from 127.0.0.1 and RSS feeds lack CORS headers,
    // so fall back to the module's local proxy (service.js).
    var SERVICE = 'http://127.0.0.1:8092';
    var PROXY = SERVICE + '/proxy?url=';
    function loadNews() {
        get(CONFIG.newsFeed, function (err, xml) {
            if (err || !xml) return get(PROXY + encodeURIComponent(CONFIG.newsFeed), renderNews, true);
            renderNews(null, xml);
        }, true);
    }
    function renderNews(err, xml) {
        if (err || !xml) { $('news').innerHTML = '<li class="muted">Kunde inte hämta nyheter</li>'; return; }
        var items = xml.getElementsByTagName('item'), html = '';
        for (var i = 0; i < items.length && i < CONFIG.newsMax; i++) {
            var t = items[i].getElementsByTagName('title')[0];
            var p = items[i].getElementsByTagName('pubDate')[0];
            var when = '';
            if (p) { var d = new Date(p.textContent); if (!isNaN(d)) when = pad(d.getHours()) + ':' + pad(d.getMinutes()); }
            html += '<li><span class="when">' + when + '</span><span class="dest">' + esc(t && t.textContent) + '</span></li>';
        }
        $('news').innerHTML = html || '<li class="muted">Inga nyheter</li>';
    }

    // ---------- network ----------
    function showNet() {
        var txt = navigator.onLine ? 'Online' : 'Offline';
        try { if (window.webapis && webapis.network) txt += ' · IP ' + webapis.network.getIp(); } catch (e) { }
        $('net').textContent = txt + ' · version ' + codeVersion();
    }

    // ---------- apps ----------
    var installed = null; // appId -> app info (TV only)
    var installedComplete = false; // true when the list came from the Tizen API, not manifest files
    var appsError = '';

    // tvOS-style tile: coloured rounded icon (brand bg/fg from config, else a hue derived from the
    // name) with the TV's icon or a name wordmark, label underneath.
    function tileColors(name, bg, fg) {
        if (bg) return { bg: bg, fg: fg || '#fff' };
        var h = 0;
        for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
        return { bg: 'linear-gradient(160deg, hsl(' + h + ', 55%, 46%), hsl(' + ((h + 25) % 360) + ', 60%, 30%))', fg: '#fff' };
    }
    function tile(name, appId, icon, module, bg, fg) {
        var el = document.createElement('div');
        var c = tileColors(name, bg, fg);
        var wordmark = '<span class="wordmark" style="color:' + esc(c.fg) + '">' + esc(name) + '</span>';
        el.className = 'app focusable';
        el.tabIndex = 0;
        el.setAttribute('data-app', appId);
        if (module) el.setAttribute('data-module', module);
        el.innerHTML = '<div class="icon" style="background:' + esc(c.bg) + '">' +
            (icon ? '<img src="' + esc(icon) + '" alt="">' : wordmark) + '</div><div class="aname">' + esc(name) + '</div>';
        // Icons are local file paths; under TizenBrew (http origin) they may not load.
        var img = el.querySelector('img');
        if (img) img.onerror = function () { img.outerHTML = wordmark; };
        return el;
    }

    function renderFavorites() {
        var box = $('favorites');
        box.innerHTML = '';
        CONFIG.favorites.forEach(function (f) {
            var info = installed && installed[f.appId];
            if (installedComplete && !info && !f.module) return; // not installed on this TV
            box.appendChild(tile(f.name, f.appId, info && info.iconPath, f.module, f.bg, f.fg));
        });
    }

    function renderAllApps() {
        var box = $('allApps');
        box.innerHTML = '';
        if (!installed) {
            box.innerHTML = '<div class="muted">' + (appsError ? 'Kunde inte läsa applistan: ' + esc(appsError) : 'Applista finns bara på TV:n') + '</div>';
            return;
        }
        // getAppsInfo also returns widgets/services/internal parts (many just named "App"). User-facing
        // apps have store ids "<10 chars>.<Name>"; plus system apps listed in CONFIG.systemApps and favourites.
        var keep = {};
        (CONFIG.systemApps || []).concat(CONFIG.favorites.map(function (f) { return f.appId; })).forEach(function (id) { keep[id] = true; });
        var list = Object.keys(installed).map(function (k) { return installed[k]; }).filter(function (a) {
            var s = (a.id + ' ' + a.name).toLowerCase();
            if (!keep[a.id] && !/^[A-Za-z0-9]{10}\.[A-Za-z0-9]+$/.test(a.id)) return false;
            return a.show !== false && !CONFIG.hideApps.some(function (h) { return s.indexOf(h.toLowerCase()) >= 0; });
        }).sort(function (a, b) { return a.name.localeCompare(b.name); });
        list.forEach(function (a) {
            var t = tile(a.name, a.id, a.iconPath);
            t.querySelector('.aname').innerHTML += '<small>' + esc(a.id) + '</small>';
            box.appendChild(t);
        });
    }

    // Under TizenBrew the page has no `tizen` object; the module's service.js does the
    // launching/listing instead. Installed as a standalone .wgt, the page uses tizen directly.
    function svc(path, cb) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', SERVICE + path, true);
        xhr.timeout = 10000;
        xhr.onload = function () { cb(xhr.status === 200 ? null : new Error(xhr.responseText || 'HTTP ' + xhr.status), xhr.responseText); };
        xhr.onerror = function () { cb(new Error('ingen tjänst')); };
        xhr.ontimeout = function () { cb(new Error('timeout')); };
        xhr.send();
    }

    function setInstalled(apps, complete) {
        installed = {};
        installedComplete = complete !== false;
        apps.forEach(function (a) { installed[a.id] = a; });
        renderFavorites(); renderAllApps(); focusFirst();
    }

    function loadAppsViaService() {
        svc('/apps', function (err, text) {
            if (err) { appsError = err.message; renderFavorites(); renderAllApps(); return; } // no list: show all pinned apps
            try {
                var r = JSON.parse(text);
                r.apps.forEach(function (a) { a.iconPath = a.icon ? SERVICE + '/icon?id=' + encodeURIComponent(a.id) : null; });
                setInstalled(r.apps, r.source === 'api');
            } catch (e) { appsError = e.message; renderFavorites(); renderAllApps(); }
        });
    }

    function loadApps() {
        if (!IS_TV) return loadAppsViaService();
        try {
            tizen.application.getAppsInfo(setInstalled, loadAppsViaService);
        } catch (e) { loadAppsViaService(); }
    }

    function launchViaService(appId) {
        status('Startar ' + appId + '…');
        svc('/launch?id=' + encodeURIComponent(appId), function (err) {
            status(err ? 'Kunde inte starta ' + appId + ': ' + err.message : '');
        });
    }

    function launch(appId) {
        if (!IS_TV) return launchViaService(appId);
        try {
            tizen.application.launch(appId, null, function () { launchViaService(appId); });
        } catch (e) { launchViaService(appId); }
    }

    // Open another TizenBrew module (e.g. TizenTube) the way TizenBrew's own menu does: tell its
    // service over ws://127.0.0.1:8081 which module is current (it then injects the module's script
    // into the next page), and navigate to the module's page. Message ids mirror TizenBrew's Events.
    var TB = { GetModules: 4, LaunchModule: 5 };
    function launchModule(match, fallbackAppId) {
        var ws, done = false, chosen = null;
        function fail(msg) {
            if (done) return;
            done = true;
            try { ws.close(); } catch (e) { }
            status(msg);
            if (fallbackAppId) launch(fallbackAppId);
        }
        var timer = setTimeout(function () { fail('TizenBrew svarar inte'); }, 5000);
        try { ws = new WebSocket('ws://127.0.0.1:8081'); } catch (e) { clearTimeout(timer); return fail('Ingen TizenBrew'); }
        ws.onerror = function () { clearTimeout(timer); fail('Ingen TizenBrew'); };
        ws.onopen = function () { ws.send(JSON.stringify({ type: TB.GetModules, payload: false })); };
        ws.onmessage = function (ev) {
            var msg;
            try { msg = JSON.parse(ev.data); } catch (e) { return; }
            if (msg.type === TB.GetModules) {
                var mods = msg.payload || [], m = null;
                for (var i = 0; i < mods.length; i++) {
                    if ((mods[i].fullName || '').toLowerCase().indexOf(match.toLowerCase()) >= 0) { m = mods[i]; break; }
                }
                if (!m) {
                    // Service cache may be empty: ask it to (re)load once.
                    if (!mods.length && !launchModule.reloaded) {
                        launchModule.reloaded = true;
                        return ws.send(JSON.stringify({ type: TB.GetModules, payload: true }));
                    }
                    clearTimeout(timer);
                    return fail('Modulen "' + match + '" finns inte i TizenBrew');
                }
                clearTimeout(timer);
                done = true;
                chosen = m;
                status('Startar ' + (m.appName || m.name) + '…');
                ws.send(JSON.stringify({ type: TB.LaunchModule, payload: m }));
                // Like TizenBrew: modules evaluated on document start navigate once the service confirms.
                if (!m.evaluateScriptOnDocumentStart) setTimeout(function () { location.href = m.appPath; }, 300);
            } else if (msg.type === TB.LaunchModule && chosen && chosen.evaluateScriptOnDocumentStart) {
                location.href = chosen.appPath; // service has queued the script for the next document
            }
        };
    }

    // ---------- remote / focus ----------
    function focusables() {
        var scope = searchOpen() ? $('searchPanel') : drawerOpen() ? $('allAppsSection') : document;
        return Array.prototype.slice.call(scope.querySelectorAll('.focusable')).filter(function (el) {
            return el.offsetParent !== null;
        });
    }
    function focusFirst() {
        if (document.activeElement && document.activeElement.className.indexOf('focusable') >= 0) return;
        var f = (!drawerOpen() && document.querySelector('.launcher')) || focusables()[0]; // start on "Appar"
        if (f) f.focus();
    }
    function move(dir) {
        var cur = document.activeElement, all = focusables();
        if (!cur || all.indexOf(cur) < 0) return focusFirst();
        var a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
        var best = null, bestScore = Infinity;
        all.forEach(function (el) {
            if (el === cur) return;
            var b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
            var dx = bx - ax, dy = by - ay, main, cross;
            if (dir === KEY.LEFT) { main = -dx; cross = dy; }
            else if (dir === KEY.RIGHT) { main = dx; cross = dy; }
            else if (dir === KEY.UP) { main = -dy; cross = dx; }
            else { main = dy; cross = dx; }
            if (main <= 1) return;
            var score = main + Math.abs(cross) * 3;
            if (score < bestScore) { bestScore = score; best = el; }
        });
        if (best) { best.focus(); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    }

    // App drawer: the dashboard shows only an "Appar" button; favourites + all apps live in a
    // full-screen overlay (the allAppsSection, with #favorites moved into it). Done here rather than
    // in index.html so the installed .wgt picks it up without a rebuild.
    var LAUNCHER = '#apps', RELOAD = '#reload';
    // Line icons for the buttons (stroke = currentColor, styled in .launcher svg).
    var ICONS = {
        apps: '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></svg>',
        reload: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 0-14.6-4.5M4 13a8 8 0 0 0 14.6 4.5"/><path d="M4 3.5V7h3.5M20 20.5V17h-3.5"/></svg>',
        fx: '<svg viewBox="0 0 24 24"><path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/></svg>',
        play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>',
        pause: '<svg viewBox="0 0 24 24"><path d="M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z" fill="currentColor"/></svg>',
        prev: '<svg viewBox="0 0 24 24"><path d="M18 5v14l-9.5-7zM6 5v14"/></svg>',
        next: '<svg viewBox="0 0 24 24"><path d="M6 5v14l9.5-7zM18 5v14"/></svg>',
        full: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
        search: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20"/></svg>'
    };
    // Commit the page's scripts were loaded from (index.html loader pins them to the latest one).
    function codeVersion() {
        var s = document.querySelector('script[src*="main.js"]'), m = s && /@([0-9a-f]{7})/.exec(s.src);
        return m ? m[1] : 'lokal';
    }
    function reloadDash() {
        status('Laddar om…');
        setTimeout(function () { location.reload(); }, 100);
    }
    function setupDrawer() {
        var favSection = $('favorites').parentNode, drawer = $('allAppsSection');
        var favTitle = document.createElement('h2');
        favTitle.className = 'section-title';
        favTitle.innerHTML = 'Favoriter <span class="hint">OK = starta · Tillbaka = stäng</span>';
        drawer.insertBefore($('favorites'), drawer.firstChild);
        drawer.insertBefore(favTitle, drawer.firstChild);
        favSection.className = 'launcher-bar';
        favSection.innerHTML = '<div class="launcher focusable" tabindex="0" data-app="' + LAUNCHER + '">' + ICONS.apps + 'Appar</div>' +
            '<div class="launcher focusable" tabindex="0" data-app="' + RELOAD + '">' + ICONS.reload + 'Uppdatera</div>' +
            hook('buttons').join('');
        drawer.className = 'drawer hidden';
    }
    function drawerOpen() { return $('allAppsSection').className.indexOf('hidden') < 0; }
    function toggleAllApps() {
        var s = $('allAppsSection'), open = !drawerOpen();
        s.className = open ? 'drawer' : 'drawer hidden';
        document.body.className = open ? 'drawer-open' : '';
        if (open) {
            if (!installed) loadApps();
            s.scrollTop = 0;
            var f = s.querySelector('.focusable');
            if (f) f.focus();
        } else {
            var l = document.querySelector('.launcher');
            if (l) l.focus(); else focusFirst();
        }
    }

    function refreshAll() { status('Uppdaterar…'); loadWeather(); loadDepartures(); loadDisruptions(); loadElpris(); renderHolidays(); loadWarnings(); loadRates(); loadNews(); loadLunch(); loadAir(); showNet(); setTimeout(status, 2000); }

    document.addEventListener('keydown', function (e) {
        switch (e.keyCode) {
            case KEY.LEFT: case KEY.RIGHT: case KEY.UP: case KEY.DOWN:
                move(e.keyCode); e.preventDefault(); break;
            case KEY.ENTER:
                if (document.activeElement && document.activeElement.getAttribute('data-app')) open(document.activeElement);
                break;
            case KEY.RED: toggleAllApps(); break;
            case KEY.GREEN: refreshAll(); break;
            case KEY.YELLOW: hook('key', 'YELLOW'); break;
            case KEY.BACK: case KEY.ESC:
                if (searchOpen()) { toggleSearch(); break; }
                if (handled(hook('back'))) break;
                if ($('allAppsSection').className.indexOf('hidden') < 0) { toggleAllApps(); break; }
                // hide (not exit) so "Autorun Last App" brings HomeDash back on next power-on
                if (IS_TV) try { tizen.application.getCurrentApplication().hide(); } catch (x) { }
                break;
        }
    });
    document.addEventListener('click', function (e) {
        var t = e.target;
        while (t && t !== document && !t.getAttribute('data-app')) t = t.parentNode;
        if (t && t !== document) open(t);
    });
    // Native .wgt: TizenBrew's service only injects module scripts into its own app, so start
    // TizenBrew with app-control data {moduleType, moduleName}; it then opens that module itself.
    // args (optional) = query string TizenBrew appends to the module's page, e.g. 'v=..&list=..' for TizenTube.
    function launchViaTizenBrew(pkg, fallbackAppId, args) {
        var i = pkg.indexOf('/');
        function fail(msg) { status('TizenBrew: ' + msg); if (fallbackAppId) launch(fallbackAppId); }
        try {
            var data = new tizen.ApplicationControlData('module',
                [JSON.stringify({ moduleType: pkg.slice(0, i), moduleName: pkg.slice(i + 1), args: args || '' })]);
            var ac = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/default', null, null, null, [data]);
            status('Startar TizenBrew…');
            tizen.application.launchAppControl(ac, CONFIG.tizenBrewAppId, function () { status(''); },
                function (e) { fail(e.message); });
        } catch (e) { fail(e.message); }
    }
    // Full screen: open TizenTube (YouTube's TV app) on CONFIG.music.link; TizenBrew appends the args to its URL.
    function musicFullscreen() {
        var l = musicLink(), q = [];
        if (l.v) q.push('v=' + l.v);
        if (l.list) q.push('list=' + l.list);
        if (!q.length) return status('Ange en YouTube-länk i config.js (music.link)');
        if (mState === 1) playerCmd({ cmd: 'toggle' }); // don't play twice
        if (IS_TV && CONFIG.tizenBrewAppId) launchViaTizenBrew(CONFIG.music.module || 'npm/@foxreis/tizentube', null, q.join('&'));
        else status('Fullskärm kräver TizenBrew på TV:n');
    }
    function open(el) {
        var mod = el.getAttribute('data-module'), id = el.getAttribute('data-app');
        if (id === LAUNCHER) return toggleAllApps();
        if (id === RELOAD) return reloadDash();
        if (handled(hook('open', id))) return;
        if (id === M.toggle) return playerCmd({ cmd: 'toggle' });
        if (id === M.next) return playerCmd({ cmd: 'next' });
        if (id === M.prev) return playerCmd({ cmd: 'prev' });
        if (id === M.full) return musicFullscreen();
        if (id === M.search) return toggleSearch();
        if (id && id.indexOf(SEARCH_PREFIX) === 0) return playSearchResult(id.slice(SEARCH_PREFIX.length));
        if (drawerOpen()) toggleAllApps(); // come back to the dashboard, not the drawer
        if (mod && IS_TV && CONFIG.tizenBrewAppId && mod.indexOf('/') > 0) launchViaTizenBrew(mod, el.getAttribute('data-app'));
        else if (mod) launchModule(mod, el.getAttribute('data-app'));
        else launch(el.getAttribute('data-app'));
    }
    // Re-pull fresh data when returning from another app.
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { refreshAll(); loadApps(); } });
    window.addEventListener('online', showNet);
    window.addEventListener('offline', showNet);

    // Helper API for plugins (js/local.js).
    window.HD = { $: $, esc: esc, get: get, status: status, pad: pad, fmtNum: fmtNum, rateRow: rateRow,
        rateRows: rateRows, proxy: function (url) { return PROXY + encodeURIComponent(url); }, icons: ICONS };

    // ---------- init ----------
    if (IS_TV) {
        try { tizen.tvinputdevice.registerKeyBatch(['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue']); } catch (e) { }
    }
    setupDrawer();
    setupExtras();
    if (CONFIG.music && CONFIG.music.playerUrl) setupSearch();
    tickClock(); setInterval(tickClock, 5000);
    refreshAll();
    loadApps();
    focusFirst();
    setInterval(loadWeather, CONFIG.refresh.weatherMin * 60000);
    setInterval(loadDepartures, CONFIG.refresh.departuresSec * 1000);
    setInterval(loadNews, CONFIG.refresh.newsMin * 60000);
    setInterval(loadDisruptions, 5 * 60000);
    setInterval(loadElpris, 30 * 60000);
    setInterval(loadWarnings, 10 * 60000);
    setInterval(loadRates, 60 * 60000);
    setInterval(loadLunch, 60 * 60000);
    setInterval(loadAir, 60 * 60000);
    setInterval(showNet, 60000);
})();
