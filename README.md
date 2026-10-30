# Samsung TV kit (Tizen)

| File | What |
|---|---|
| `debloat.md` | Settings checklist: ads/ACR off, Smart Hub autorun off, boot into HomeDash |
| `dns-blocklist.txt` | Samsung ads/tracking domains for Pi-hole / AdGuard / NextDNS |
| `app/` | **HomeDash**: dashboard + launcher web app (clock, week, weather, SL departures, SVT news, app grid) |
| `app/js/config.js` | Location, SL stop, news feed, pinned apps (edit this) |
| `build.ps1` | Build → sign → install → run on the TV |

## TizenBrew (recommended)
HomeDash is a TizenBrew app module (`package.json` + `service.js` news proxy), published to npm as `tizenbrew-homedash`.
On the TV: TizenBrew → Module Manager → Add → `npm/tizenbrew-homedash`. Optional: set it as the auto-launch module.
Update: bump `version` in `package.json` and push. `app/index.html` loads css/js pinned to the latest commit (GitHub API → `cdn.jsdelivr.net/gh/...@<sha>/`), so only `index.html` itself goes through jsDelivr's branch cache (up to ~12 h); purge it with `https://purge.jsdelivr.net/gh/milejz/tizenbrew-homedash/app/index.html`.
No Tizen Studio, certificate, or `build.ps1` needed on this path.

## Remote keys in HomeDash
Arrows = move · OK = start app · **Red** = all installed apps (shows app ids) · **Green** = refresh · Back = hide/close list

## Why not a "real" launcher replacement?
Tizen does not allow third-party apps to replace Home or autostart at boot (partner-only privileges).
Workaround: **Autorun Smart Hub OFF + Autorun Last App ON**. Leave HomeDash open when powering off, and the TV comes back up in it.
Back hides the app instead of exiting, so it stays the "last app".

## Privacy and trust
- **This repo is public.** `app/js/config.js` holds neutral defaults only. Personal settings (home stop, school,
  warning areas, holidays, rates) go in `app/js/local.js` (gitignored; template: `local.example.js`). `build.ps1`
  packages it into the TV app; it is never pushed and never loaded from the network.
- **Only signed code runs.** The `index.html` loader takes the newest commit on `main` that GitHub marks
  *Verified* and that is authored by `milejz`, and loads css/js pinned to that sha. Unsigned pushes are ignored and
  the TV falls back to the code packaged at install time. Commits here are signed with `~/.ssh/homedash_signing`
  (repo-local git config); its public key must be added on GitHub as a **Signing key**.

## Native app (.wgt) instead of TizenBrew
Same `app/` folder, installed as a real Samsung app (own tile in Apps, no TizenBrew needed).
The page still loads css/js from the latest GitHub commit, so pushes update it without reinstalling;
only `config.xml`/`index.html` changes need a rebuild. No CORS in a .wgt, so news/FOREX go direct
(service.js is not used). YouTube opens TizenTube if TizenBrew is installed, else the YouTube app.
TizenBrew needs Developer Mode IP `127.0.0.1`; `sdb` install needs this PC's IP. Switch to the PC IP,
install, then switch back. The installed app keeps working.

## One-time setup
1. **Tizen Studio** (CLI is enough): https://developer.tizen.org/development/tizen-studio/download
   Install to `C:\tizen-studio`, then in Package Manager → Extension SDK install **TV Extensions** and **Samsung Certificate Extension**.
2. **TV Developer Mode**: on the TV open Apps, type `1 2 3 4 5` on the remote → Developer Mode ON → enter this PC's IP → restart the TV.
3. **Certificate** (Samsung account required, one time): Tizen Studio → Tools → Certificate Manager → `+` → **Samsung** → TV →
   create author + distributor cert. When asked for the device, connect the TV first (`C:\tizen-studio\tools\sdb.exe connect <TV-IP>`) so its DUID is added.
   Name the profile `tv` (or pass `-CertProfile`).
4. `.\build.ps1 -TvIp <TV-IP>`

## Preview in a browser
Open `app\index.html` in Chrome at 1920×1080. Weather and news load; the app list is TV-only.
