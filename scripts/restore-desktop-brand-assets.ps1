param(
  [string]$Destination = "build"
)

$ErrorActionPreference = "Stop"
$repo = "yamboleeroy-ai/yamachat"
$tag = "v1.0.79"
$setup = "Yamachat-Setup-1.0.79.exe"
$required = @{
  "icon.ico"                         = "3d286b12f69b42fcfced22ce7cc32623bfb02329df66b9681c092cdc0837a838"
  "app-icon-source.png"              = "ae6fd30a2de1b53b199fb6998b57f6ffb2ea06710cf2b25a3ac2199f3cfa0ac9"
  "tray-controller-idle.png"         = "234ce8f2b7d19e6e4ccc2e6616c44fcf391e4151c42f618b4c29e4427943fc8f"
  "tray-controller-speaking.png"     = "68a0802519a9c609ad143ea2612eced4b3cb254ec08bdbbc1411cc5349ed0cb3"
  "tray-status-afk-notify.png"       = "f23a2a097327e1429c924f6b5fbfde0ff88a10069dca539e00ba58309a5e8d44"
  "tray-status-afk.png"              = "bf38f212716567c53862bce6bf8b832c9007dcf9430ca7a61d063e109d65b44a"
  "tray-status-dnd-notify.png"       = "e14a8d0f04bea7a63137819b6d7582c7d41b53f2e2b820930c35022e2cfef767"
  "tray-status-dnd.png"              = "9bd1aa65fe387f28339bbece8481abcc99525b9836fb667948e46f4e339695bd"
  "tray-status-invisible-notify.png" = "f927fcc1cc61a061fe11b0b7f7d2499fba420cb9ea3ec61b2ff7fe7220328ba8"
  "tray-status-invisible.png"        = "38412a2fc7157b1bc70085802a67a07297ec3b2adee811cd418b28256fb7d3eb"
  "tray-status-online-notify.png"    = "645f417e2a291912735cf77a3d14db5b80f259b19f9e4e0e1a11c6ad1653af82"
  "tray-status-online.png"           = "42d7e997bb3b988259bccd5224c4a66b6c6318c1be3289b328b09ef4c26b85cc"
  "tray-voice.png"                   = "68a0802519a9c609ad143ea2612eced4b3cb254ec08bdbbc1411cc5349ed0cb3"
  "yamachat-logo-ui.webp"            = "88e1179d327d260b1a480cc9afab984d5807a690c065c826be0e1fcafe7e9498"
}

New-Item -ItemType Directory -Force -Path $Destination | Out-Null

function Test-Assets {
  foreach ($name in $required.Keys) {
    $p = Join-Path $Destination $name
    if (-not (Test-Path $p)) { return $false }
    $sha = (Get-FileHash $p -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($sha -ne $required[$name]) { return $false }
  }
  return $true
}

if (Test-Assets) {
  Write-Host "PASS: desktop tray/icon assets already restored."
  exit 0
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw "GitHub CLI is required to restore the proven 1.0.79 assets." }
if (-not (Get-Command 7z -ErrorAction SilentlyContinue)) { throw "7-Zip is required to restore the proven 1.0.79 assets." }

$work = Join-Path $env:RUNNER_TEMP ("yamachat-assets-" + [guid]::NewGuid().ToString("N"))
$download = Join-Path $work "download"
$outer = Join-Path $work "outer"
New-Item -ItemType Directory -Force -Path $download,$outer | Out-Null

gh release download $tag --repo $repo --pattern $setup --dir $download
$setupPath = Join-Path $download $setup
if (-not (Test-Path $setupPath)) { throw "Unable to download $setup from $tag" }

& 7z x $setupPath "-o$outer" -y | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Unable to extract the 1.0.79 Setup" }

$archives = @(Get-ChildItem $outer -Recurse -File | Where-Object { $_.Extension -in @(".7z",".zip") })
$round = 0
while ($round -lt 4 -and $archives.Count -gt 0) {
  $round++
  $newArchives = @()
  foreach ($archive in $archives) {
    $out = Join-Path $work ("nested-" + $round + "-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $out | Out-Null
    & 7z x $archive.FullName "-o$out" -y | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $newArchives += @(Get-ChildItem $out -Recurse -File | Where-Object { $_.Extension -in @(".7z",".zip") })
    }
  }
  $archives = $newArchives
}

$roots = @(Get-ChildItem $work -Recurse -File -Filter "tray-status-online.png" | ForEach-Object { $_.Directory.FullName } | Select-Object -Unique)
$sourceRoot = $null
foreach ($candidate in $roots) {
  $ok = $true
  foreach ($name in $required.Keys) {
    if (-not (Test-Path (Join-Path $candidate $name))) { $ok = $false; break }
  }
  if ($ok) { $sourceRoot = $candidate; break }
}
if (-not $sourceRoot) { throw "The known-good 1.0.79 tray/icon asset set was not found inside the release Setup." }

foreach ($name in $required.Keys) {
  Copy-Item -Force (Join-Path $sourceRoot $name) (Join-Path $Destination $name)
}

if (-not (Test-Assets)) { throw "Restored desktop assets failed SHA-256 verification." }
Write-Host "PASS: restored verified Yamachat 1.0.79 desktop tray/icon assets."
