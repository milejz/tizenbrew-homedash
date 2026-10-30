// TizenBrew service for HomeDash (runs in TizenBrew's Node v4 sandbox: ES5 only).
// The module page is served from 127.0.0.1 and gets no `tizen` object, but this service does
// (TizenBrew passes it in), so app launching/listing goes through here. Also proxies feeds
// that lack CORS headers (e.g. SVT RSS).
//   GET /proxy?url=<encoded https url>
//   GET /launch?id=<appId>
//   GET /apps
//   GET /icon?id=<appId>   (icon of an app found by /apps)
var http = require('http');
var fs = require('fs');
var https = require('https');
var urlLib = require('url');

var PORT = 8092; // 8091 = v1.0.x servers that cannot be swapped (pre handler-swap)
var ALLOWED = ['www.svt.se', 'feeds.expressen.se', 'rss.aftonbladet.se', 'api.sr.se', 'api.forex.se'];
// Only the HomeDash page (served by TizenBrew on :8081) may call this service. Checking Origin blocks
// other pages on the TV (YouTube, ads, the browser); checking Host blocks DNS-rebinding domains.
var ORIGINS = ['http://127.0.0.1:8081', 'http://localhost:8081'];
var HOSTS = ['127.0.0.1:' + PORT, 'localhost:' + PORT];
var APP_ID = /^[A-Za-z0-9._-]{1,128}$/;
var MAX_BYTES = 2 * 1024 * 1024;

function fetchUrl(target, redirects, cb) {
    var u = urlLib.parse(target);
    if (u.protocol !== 'https:' || ALLOWED.indexOf(u.hostname) < 0) return cb(new Error('host not allowed'));
    var done = false, original = cb;
    cb = function (err, status, type, body) { if (!done) { done = true; original(err, status, type, body); } };
    var req = https.get({ hostname: u.hostname, path: u.path, headers: { 'User-Agent': 'HomeDash' } }, function (res) {
        res.on('error', cb);
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 3) {
            res.resume();
            return fetchUrl(urlLib.resolve(target, res.headers.location), redirects + 1, cb);
        }
        var chunks = [], size = 0;
        res.on('data', function (c) {
            size += c.length;
            if (size > MAX_BYTES) { req.abort(); return cb(new Error('too large')); }
            chunks.push(c);
        });
        res.on('end', function () { cb(null, res.statusCode, res.headers['content-type'], Buffer.concat(chunks)); });
    });
    req.on('error', cb);
    req.setTimeout(15000, function () { req.abort(); cb(new Error('timeout')); });
}

function send(res, status, body, type) {
    try {
        res.writeHead(status, { 'Content-Type': type || 'text/plain; charset=utf-8' });
        res.end(body);
    } catch (e) { }
}

function launchApp(id, res) {
    if (typeof tizen === 'undefined') return send(res, 500, 'no tizen in service');
    try {
        tizen.application.launch(id,
            function () { send(res, 200, 'ok'); },
            function (e) { send(res, 500, e.name + ': ' + e.message); });
    } catch (e) { send(res, 500, e.name + ': ' + e.message); }
}

// TizenBrew's own config.xml lacks the application.info privilege, so getAppsInfo usually throws
// SecurityError. Fallback: read the package manifests pkgmgr keeps on disk.
var MANIFEST_DIRS = ['/opt/share/packages', '/usr/share/packages'];
var ICON_PATH = /^\/(opt|usr)\/(?!.*\.\.).*\.(png|jpg|jpeg)$/i;
var icons = {}; // appId -> icon file, filled by the last /apps

function attr(tag, name) {
    var m = new RegExp('\\s' + name + '\\s*=\\s*"([^"]*)"').exec(tag);
    return m ? m[1] : null;
}

function parseManifest(xml, out) {
    var re = /<ui-application\b([^>]*?)(\/>|>([\s\S]*?)<\/ui-application>)/g, m;
    while ((m = re.exec(xml))) {
        var id = attr(m[1], 'appid');
        if (!id || attr(m[1], 'nodisplay') === 'true') continue;
        var body = m[3] || '', name = null, icon = null, l;
        var labels = /<label\b([^>]*)>([^<]*)<\/label>/g;
        while ((l = labels.exec(body))) {
            var lang = attr(l[1], 'xml:lang');
            if (!name || !lang || /^en/i.test(lang)) name = l[2].trim() || name;
            if (!lang) break;
        }
        var ic = /<icon\b[^>]*>([^<]*)<\/icon>/.exec(body);
        if (ic) icon = ic[1].trim();
        out.push({ id: id, name: name || id, iconPath: icon, show: true });
    }
}

function scanManifests(cb) {
    var out = [], errors = [], pending = MANIFEST_DIRS.length;
    MANIFEST_DIRS.forEach(function (dir) {
        fs.readdir(dir, function (err, files) {
            if (err) { errors.push(dir + ': ' + err.code); return finish(); }
            files = files.filter(function (f) { return /\.xml$/.test(f); });
            var left = files.length;
            if (!left) return finish();
            files.forEach(function (f) {
                fs.readFile(dir + '/' + f, 'utf8', function (e, xml) {
                    try { if (!e && xml.length < MAX_BYTES) parseManifest(xml, out); } catch (x) { }
                    if (--left === 0) finish();
                });
            });
        });
    });
    function finish() {
        if (--pending > 0) return;
        var seen = {}, apps = out.filter(function (a) { return seen[a.id] ? false : (seen[a.id] = true); });
        cb(apps.length ? null : new Error(errors.join(', ') || 'no manifests'), apps);
    }
}

function sendApps(res, apps, source) {
    icons = {};
    var out = apps.map(function (a) {
        if (a.iconPath && ICON_PATH.test(a.iconPath)) icons[a.id] = a.iconPath;
        return { id: a.id, name: a.name, show: a.show, icon: !!icons[a.id] };
    });
    send(res, 200, JSON.stringify({ source: source, apps: out }), 'application/json');
}

function listApps(res) {
    var apiError = 'no tizen in service';
    function fallback() {
        scanManifests(function (err, apps) {
            if (err) return send(res, 500, apiError + '; manifests: ' + err.message);
            sendApps(res, apps, 'manifest');
        });
    }
    if (typeof tizen === 'undefined') return fallback();
    try {
        tizen.application.getAppsInfo(function (apps) {
            sendApps(res, apps.map(function (a) { return { id: a.id, name: a.name, iconPath: a.iconPath, show: a.show }; }), 'api');
        }, function (e) { apiError = e.name + ': ' + e.message; fallback(); });
    } catch (e) { apiError = e.name + ': ' + e.message; fallback(); }
}

function sendIcon(id, res) {
    var file = icons[id];
    if (!file) return send(res, 404, '');
    fs.readFile(file, function (err, data) {
        if (err || data.length > MAX_BYTES) return send(res, 404, '');
        send(res, 200, data, /\.png$/i.test(file) ? 'image/png' : 'image/jpeg');
    });
}

// Everything is guarded: an uncaught error here would take down TizenBrew's whole service.
// TizenBrew re-runs this file on every module launch in the same Node process, so a server from
// an earlier run (possibly older code) may already own the port. `process` is shared between
// runs: keep the server there and swap in the current handler instead of listening again.
function handler(req, res) {
    try {
        var origin = req.headers.origin;
        var q = urlLib.parse(req.url, true);
        if (HOSTS.indexOf(req.headers.host) < 0) return send(res, 403, '');
        // <img> loads send no Origin; icons are harmless, so /icon only rejects foreign origins.
        if (q.pathname === '/icon' && !origin) return sendIcon(String(q.query.id || ''), res);
        if (ORIGINS.indexOf(origin) < 0) return send(res, 403, '');
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        if (q.pathname === '/launch') {
            var id = String(q.query.id || '');
            return APP_ID.test(id) ? launchApp(id, res) : send(res, 400, 'bad id');
        }
        if (q.pathname === '/apps') return listApps(res);
        if (q.pathname === '/icon') return sendIcon(String(q.query.id || ''), res);
        if (q.pathname !== '/proxy' || !q.query.url) return send(res, 404, '');
        fetchUrl(q.query.url, 0, function (err, status, type, body) {
            if (err) return send(res, 502, err.message);
            send(res, status, body, type || 'text/xml');
        });
    } catch (e) {
        send(res, 500, '');
    }
}

try {
    var server = process.__homeDashServer;
    if (server) {
        server.removeAllListeners('request');
        server.on('request', handler);
    } else {
        server = http.createServer(handler);
        server.on('error', function () { });
        server.on('clientError', function (err, socket) { try { socket.destroy(); } catch (e) { } });
        server.listen(PORT, '127.0.0.1');
        process.__homeDashServer = server;
    }
} catch (e) { }
