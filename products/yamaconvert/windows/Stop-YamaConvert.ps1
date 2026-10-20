$ErrorActionPreference = 'Stop'
$stateFile = Join-Path $env:LOCALAPPDATA 'YamaConvert\local-server.json'
if (-not (Test-Path -LiteralPath $stateFile)) {
  Write-Host 'YamaConvert neběží přes jeho spouštěč.'
  exit 0
}

$state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
$process = Get-CimInstance Win32_Process -Filter "ProcessId=$($state.pid)" -ErrorAction SilentlyContinue
if ($process -and $process.Name -eq 'node.exe' -and $process.CommandLine -match 'preview\.cjs') {
  Stop-Process -Id $state.pid -Force
  Write-Host 'Místní služba YamaConvert je vypnutá.'
} else {
  Write-Host 'Místní služba YamaConvert už neběží.'
}
Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue
