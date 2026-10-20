$ErrorActionPreference = 'Stop'

$nodePath = Join-Path $PSScriptRoot 'runtime\node.exe'
if (-not (Test-Path -LiteralPath $nodePath)) {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($node) { $nodePath = $node.Source }
  else {
    Write-Host 'V balíčku chybí běhové prostředí Node.js. Stáhni YamaConvert znovu z Yamaportalu.' -ForegroundColor Red
    Read-Host 'Stiskni Enter pro zavření'
    exit 1
  }
}
$runtimeDir = Split-Path -Parent $nodePath
$env:PATH = "$runtimeDir;$env:PATH"

$engine = Join-Path $PSScriptRoot 'vendor\yt-dlp\yt-dlp.exe'
if (-not (Test-Path -LiteralPath $engine)) {
  Write-Host 'Připravuji místní stahovací engine. To se dělá jen při prvním spuštění…' -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot 'Install-YtDlp.ps1')
  if (-not (Test-Path -LiteralPath $engine)) {
    Write-Host 'Příprava stahovacího enginu selhala. Zkontroluj připojení k internetu a spusť aplikaci znovu.' -ForegroundColor Red
    Read-Host 'Stiskni Enter pro zavření'
    exit 1
  }
}

$port = 4197
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  $url = "http://127.0.0.1:$port/api/status"
  try {
    $status = Invoke-RestMethod -Uri $url -TimeoutSec 1
    if ($status.socialDownloads -eq $true) {
      Start-Process "http://127.0.0.1:$port/"
      exit 0
    }
  } catch {}

  $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if (-not $listener) { break }
  $port++
}

if ($attempt -ge 20) {
  Write-Host 'Nenašel jsem volný místní port pro YamaConvert.' -ForegroundColor Red
  Read-Host 'Stiskni Enter pro zavření'
  exit 1
}

$env:YAMACONVERT_PORT = "$port"
$process = Start-Process -FilePath $nodePath -ArgumentList 'preview.cjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
$url = "http://127.0.0.1:$port/"
$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  Start-Sleep -Milliseconds 300
  try {
    $status = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/status" -TimeoutSec 1
    if ($status.socialDownloads -eq $true) { $ready = $true; break }
  } catch {}
  if ($process.HasExited) { break }
}

if (-not $ready) {
  if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
  Write-Host 'Místní stahovací službu se nepodařilo spustit.' -ForegroundColor Red
  Read-Host 'Stiskni Enter pro zavření'
  exit 1
}

Start-Process $url
$stateDir = Join-Path $env:LOCALAPPDATA 'YamaConvert'
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
@{ pid = $process.Id; port = $port } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stateDir 'local-server.json') -Encoding UTF8
Write-Host "YamaConvert běží na $url. Až skončíš, spusť Stop-YamaConvert.cmd."
