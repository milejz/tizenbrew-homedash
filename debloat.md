# Samsung TV debloat (Tizen)

Retail Samsung TVs give no root and only a limited `sdb shell`, so you **cannot uninstall
system apps** the way you can with adb on the S24. Real debloat = settings + DNS block + HomeDash on top.
Menu names differ by year. Paths below are for 2020+ (One UI Tizen); on older models use Settings search.

## 1. Kill ads and tracking (Settings → General & Privacy / Support → Terms & Privacy)
- [ ] Privacy Choices → **Viewing Information Services** → OFF (ACR, screen tracking)
- [ ] Privacy Choices → **Interest-Based Advertisement** → OFF, then **Reset advertising ID**
- [ ] Privacy Choices → **Voice Recognition Services** → OFF (if you don't use Bixby/Alexa)
- [ ] Terms & Conditions → withdraw from optional items (Marketing, Info Linking, Samsung Plus)
- [ ] Settings → General → **Diagnostics & usage data / Send diagnostic data** → OFF

## 2. Stop Smart Hub taking over, boot into HomeDash
- [ ] General → Smart Features → **Autorun Smart Hub** → OFF
- [ ] General → Smart Features → **Autorun Last App** → ON  ← open HomeDash before power-off and TV boots back into it
- [ ] General → Smart Features → **Autorun Samsung TV Plus** → OFF (and Channel list → hide TV Plus channels)
- [ ] General → Smart Features → **Auto Play / Run Ambient** → OFF
- [ ] General → Smart Features → **Ad / Recommendations on Home** (if present) → OFF
- [ ] Notifications → turn off everything except what you want

## 3. Bloat apps
- Home → highlight a preinstalled app tile → **Down / long-press OK → Remove** (works for many partner apps; core ones like TV Plus/Gaming Hub can only be removed from the bar)
- Apps → ⚙ → **Delete** on apps that allow it
- Apps → ⚙ → **Auto Update** → OFF if you want nothing reappearing

## 4. Network-level block
Put `dns-blocklist.txt` into Pi-hole / AdGuard Home / NextDNS (same as the family DNS on the S23),
or set the TV's DNS manually: Network → Network Status → IP Settings → DNS → Enter manually.

## 5. Power / performance
- [ ] General → Power & Energy Saving → **Power On with Mobile** → OFF unless you use SmartThings
- [ ] General → Power & Energy Saving → **Instant On / Quick Start** → ON (fast boot, keeps HomeDash warm)
- [ ] Picture → Expert → Motion settings → off for faster UI on cheap models (optional)
