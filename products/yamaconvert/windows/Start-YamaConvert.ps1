$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$stateDir = Join-Path $env:LOCALAPPDATA 'YamaConvert'
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
$logPath = Join-Path $stateDir 'launcher.log'
$nodeOut = Join-Path $stateDir 'server-output.log'
$nodeErr = Join-Path $stateDir 'server-error.log'

try {
  $nodePath = Join-Path $PSScriptRoot 'runtime\\node.exe'
  if (-not (Test-Path -LiteralPath $nodePath)) {
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($node) { $nodePath = $node.Source }
    else { throw 'Node.js runtime is missing. Re-download YamaConvert from Yamaportal.' }
  }
  $runtimeDir = Split-Path -Parent $nodePath
  $env:PATH = "$runtimeDir;$env:PATH"

  $engine = Join-Path $PSScriptRoot 'vendor\\yt-dlp\\yt-dlp.exe'
  if (-not (Test-Path -LiteralPath $engine)) {
    Write-Warning 'The social download engine is missing. The app will still open, but social downloads will be unavailable.'
    Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) yt-dlp.exe is missing; starting the app without social downloads."
  }

  $port = 4197
  $portFound = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try {
      $status = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/status" -TimeoutSec 1
      if ($status.app -eq $true) {
        Start-Process "http://127.0.0.1:$port/"
        exit 0
      }
    } catch {}

    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if (-not $listener) { $portFound = $true; break }
    $port++
  }
  if (-not $portFound) { throw 'No free local port is available for YamaConvert.' }

  $env:YAMACONVERT_PORT = "$port"
  Remove-Item -LiteralPath $nodeOut, $nodeErr -Force -ErrorAction SilentlyContinue
  $process = Start-Process -FilePath $nodePath -ArgumentList 'preview.cjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $nodeOut -RedirectStandardError $nodeErr
  $url = "http://127.0.0.1:$port/"
  $ready = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 300
    try {
      $status = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/status" -TimeoutSec 1
      if ($status.app -eq $true) { $ready = $true; break }
    } catch {}
    if ($process.HasExited) { break }
  }

  if (-not $ready) {
    $details = if (Test-Path -LiteralPath $nodeErr) { (Get-Content -LiteralPath $nodeErr -Tail 20) -join [Environment]::NewLine } else { 'No server output was captured.' }
    if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
    throw "The local app service did not start. Details: $details"
  }

  @{ pid = $process.Id; port = $port } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stateDir 'local-server.json') -Encoding UTF8
  Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) YamaConvert started at $url (PID $($process.Id))."
  Start-Process $url
  Write-Host "YamaConvert is running at $url. When you are done, run Stop-YamaConvert.cmd."
} catch {
  $message = "$(Get-Date -Format o) $($_.Exception.Message)"
  Add-Content -LiteralPath $logPath -Value $message
  Write-Host ''
  Write-Host 'YamaConvert could not start:' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host "Diagnostic log: $logPath" -ForegroundColor Yellow
  exit 1
}
