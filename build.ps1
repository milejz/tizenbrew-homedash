# Build, sign and install HomeDash on a Samsung TV.
# Usage:  .\build.ps1 -TvIp 192.168.1.50              (build + install + run)
#         .\build.ps1                                  (build .wgt only)
# Needs Tizen Studio CLI + a Samsung TV certificate profile (see README.md).
param(
    [string]$TvIp,
    [string]$CertProfile = 'HomeDashTV',
    [string]$TizenRoot = 'C:\tizen6'
)
$ErrorActionPreference = 'Stop'
$tizen = Join-Path $TizenRoot 'tools\ide\bin\tizen.bat'
$sdb   = Join-Path $TizenRoot 'tools\sdb.exe'
$app   = Join-Path $PSScriptRoot 'app'
$out   = Join-Path $PSScriptRoot 'out'
$appId = 'HmDash0001.HomeDash'

if (-not (Test-Path $tizen)) { throw "Tizen CLI not found at $tizen. Install Tizen Studio (README.md step 1) or pass -TizenRoot." }

if (Test-Path $out) { Remove-Item -Recurse -Force $out }
& $tizen build-web -out $out -- $app
if ($LASTEXITCODE) { throw 'build-web failed' }
& $tizen package -t wgt -s $CertProfile -- $out
if ($LASTEXITCODE) { throw "package failed (does cert profile '$CertProfile' exist? see README step 3)" }
$wgt = Get-ChildItem $out -Filter *.wgt | Select-Object -First 1
Write-Host "Built $($wgt.FullName)" -ForegroundColor Green

if (-not $TvIp) { return }
$serial = "${TvIp}:26101"
& $sdb connect $TvIp
& $sdb devices
& $tizen install -s $serial -n $wgt.Name -- $out
if ($LASTEXITCODE) { throw 'install failed (Developer Mode on? PC IP entered on TV? cert DUID matches TV?)' }
& $tizen run -s $serial -p $appId
Write-Host "Installed and started $appId on $TvIp" -ForegroundColor Green
