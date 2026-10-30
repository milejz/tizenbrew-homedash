// Copy to local.js (gitignored) and fill in. Packaged into the TV app only (never pushed); overrides config.js.
CONFIG.sl = { siteId: 1234, name: 'Min hållplats', max: 7, modes: ['METRO', 'BUS', 'TRAIN', 'TRAM', 'SHIP'] };
CONFIG.slDisruptions = { lines: ['40'], max: 2 };
CONFIG.lunch = [{ name: 'Skolan', school: 'skolans-url-namn' }];
// CONFIG.favorites = [ { name: 'App', appId: 'AbCdEf1234.AppName' } ];

// Extra holiday countries: function (year, h) -> [[date, name, note?]], h = { d(y, m, day), addDays(date, n) }.
// var HOMEDASH_HOLIDAYS = { XX: function (y, h) { return [[h.d(y, 1, 1), 'New year']]; } };

// Plugins (see the hook list at "plugins" in main.js); helpers in window.HD.
// var HOMEDASH_PLUGINS = [{ rateRows: function () { return ''; } }];
