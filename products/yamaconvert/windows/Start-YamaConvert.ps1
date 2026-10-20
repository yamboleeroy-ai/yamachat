$ErrorActionPreference = 'Stop'

$nodePath = Join-Path $PSScriptRoot 'runtime\node.exe'
if (-not (Test-Path -LiteralPath $nodePath)) {
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($node) { $nodePath = $node.Source }
  else {
    Write-Host 'YamaConvert is missing its Node.js runtime. Download the app again from Yamaportal.' -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
  }
}
$runtimeDir = Split-Path -Parent $nodePath
$env:PATH = "$runtimeDir;$env:PATH"

$engine = Join-Path $PSScriptRoot 'vendor\yt-dlp\yt-dlp.exe'
if (-not (Test-Path -LiteralPath $engine)) {
  Write-Host 'Preparing the local download engine. This only happens the first time...' -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot 'Install-YtDlp.ps1')
  if (-not (Test-Path -LiteralPath $engine)) {
    Write-Host 'The download engine could not be prepared. Check your internet connection and start the app again.' -ForegroundColor Red
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
  Write-Host 'No free local port is available for YamaConvert.' -ForegroundColor Red
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
  Write-Host 'The local download service could not start.' -ForegroundColor Red
  Read-Host 'Stiskni Enter pro zavření'
  exit 1
}

Start-Process $url
$stateDir = Join-Path $env:LOCALAPPDATA 'YamaConvert'
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
@{ pid = $process.Id; port = $port } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stateDir 'local-server.json') -Encoding UTF8
Write-Host "YamaConvert is running at $url. When you are done, run Stop-YamaConvert.cmd."
