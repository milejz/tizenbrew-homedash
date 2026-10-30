// HomeDash public defaults. Personal settings (home stop, school, areas, ...) go in js/local.js, which is
// gitignored and only packaged into the TV app (see local.example.js). Never put personal data here: this repo is public.
var CONFIG = {
    location: { name: 'Stockholm', lat: 59.3293, lon: 18.0686 },

    // SL site id (find yours: https://transport.integration.sl.se/v1/sites?expand=false , search by name).
    // Set to null to hide the departures card.
    sl: null,

    // SL disruptions (deviations API) for these lines. Shown above departures only when active.
    slDisruptions: null,

    // Spot price from elprisetjustnu.se. area: SE1-SE4. vat: add 25 % moms (grid fee/energy tax not included).
    elpris: { area: 'SE3', vat: true, cheapest: 3 },

    // Public holidays, computed locally (SE built in; more countries via HOMEDASH_HOLIDAYS in local.js).
    holidays: { countries: ['SE'], max: 3, daysAhead: 120 },

    // Warning banner, shown only when something is active. SMHI levels: MESSAGE, YELLOW, ORANGE, RED.
    // Krisinformation: VMA always; news only when its area matches one of `areas`.
    warnings: { areas: ['Stockholm'], smhiLevels: ['YELLOW', 'ORANGE', 'RED'], max: 2 },

    // Exchange rates. Köp/Sälj = what the bank pays / charges, Mitt = middle.
    // forex: FOREX Bank cash rates in SEK (forex.se); `unit` = price of this many units. Plugins can add rows.
    rates: {
        forex: [{ code: 'EUR', decimals: 4 }]
    },


    // School lunch cards (skolmaten.se). school = the name in the school's URL: skolmaten.se/<school>
    lunch: [], // e.g. [{ name: 'Skolan', school: 'skolans-url-namn' }]
    // Music card: YouTube's embedded player (with YouTube's ads). playerUrl = https copy of player/index.html
    // (YouTube won't embed in the file:// app). link = optional own playlist (set it in local.js).
    music: { name: 'Musik', link: '', playLabel: 'Min lista', playerUrl: 'https://milejz.github.io/tizenbrew-homedash/player/index.html', debug: true },
    air: true, // air quality + pollen card (Open-Meteo, uses location above)

    newsFeed: 'https://www.svt.se/rss.xml',
    newsMax: 3,

    // Pinned apps, shown first. appId values for Samsung TV (verify via the Red-key "all apps" list,
    // which shows each id). Ids that are not installed are skipped automatically on the TV.
    // `module`: open this TizenBrew module instead, as '<type>/<package name>' (e.g. 'npm/@foxreis/tizentube').
    // Native .wgt: starts TizenBrew (tizenBrewAppId) straight into that module. Inside TizenBrew: opens it there.
    // Falls back to appId when TizenBrew or the module isn't available.
    // bg/fg (optional) = tile background (any CSS background) and wordmark colour.
    tizenBrewAppId: 'xvvl3S1bvH.TizenBrewStandalone',
    favorites: [
        { name: 'YouTube',    appId: '9Ur5IzDKqV.TizenYouTube', module: 'npm/@foxreis/tizentube', bg: 'linear-gradient(160deg, #ff3b30, #c4001d)' },
        { name: 'SVT Play',   appId: '5exPmCT0nz.svtplay', bg: 'linear-gradient(160deg, #1f8a4c, #0c4a28)' },
        { name: 'Webbläsare', appId: 'org.tizen.browser', bg: 'linear-gradient(160deg, #5aa0ff, #2f5fd0)' }
    ],

    // "All apps" shows store apps (ids like 'AbCdEf1234.AppName') + favourites + these system apps.
    systemApps: ['org.tizen.browser', 'org.tizen.netflix-app', 'com.samsung.tv.gallery'],

    // Hide these from the "all apps" list (system junk). Substring match on appId or name.
    hideApps: ['HmDash0001', 'samsungplus', 'TVPlus', 'gamingHub', 'ambient', 'tutorial', 'e-Manual', 'SmartThings', 'Preinstall', 'Service'],

    refresh: { weatherMin: 15, departuresSec: 60, newsMin: 15 }
};
