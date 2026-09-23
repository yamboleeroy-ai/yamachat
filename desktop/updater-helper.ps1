param(
  [Parameter(Mandatory=$true)][string]$StatePath,
  [Parameter(Mandatory=$true)][string]$SessionId,
  [Parameter(Mandatory=$true)][int]$OldPid,
  [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = 'SilentlyContinue'
$logDir = Join-Path $env:LOCALAPPDATA 'YamachatUpdater\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir 'rollback.log'

function Log([string]$Text) {
  Add-Content -Path $logFile -Value ((Get-Date).ToString('s') + ' ' + $Text)
}

function Read-State {
  try { return (Get-Content -Raw -Path $StatePath | ConvertFrom-Json) } catch { return $null }
}

function Write-State($State) {
  try {
    $State.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
    $tmp = $StatePath + '.helper.tmp'
    [System.IO.File]::WriteAllText($tmp, ($State | ConvertTo-Json -Depth 8), [System.Text.UTF8Encoding]::new($false))
    Move-Item -Force -Path $tmp -Destination $StatePath
  } catch {}
}

Log "Helper started session=$SessionId oldPid=$OldPid"

$stopWait = [DateTime]::UtcNow.AddSeconds(60)
while ([DateTime]::UtcNow -lt $stopWait) {
  if (-not (Get-Process -Id $OldPid -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 500
}

if (Get-Process -Id $OldPid -ErrorAction SilentlyContinue) {
  Log 'Original application is still running; rollback aborted.'
  exit 5
}

$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
$launchedRecoveryAttempt = $false

while ([DateTime]::UtcNow -lt $deadline) {
  $state = Read-State
  if ($null -ne $state -and $state.sessionId -eq $SessionId) {
    if ($state.state -eq 'healthy' -or $state.state -eq 'committed') {
      Log "Health OK state=$($state.state) target=$($state.targetVersion)"
      exit 0
    }

    if (-not $launchedRecoveryAttempt -and [DateTime]::UtcNow -gt $deadline.AddSeconds(-90)) {
      $exe = [string]$state.installedExePath
      if ($exe -and (Test-Path $exe)) {
        Log "No health yet, starting one recovery launch: $exe"
        Start-Process -FilePath $exe -ArgumentList '--yamachat-post-update-health' -WindowStyle Hidden | Out-Null
        $launchedRecoveryAttempt = $true
      }
    }
  }
  Start-Sleep -Seconds 2
}

$state = Read-State
if ($null -eq $state -or $state.sessionId -ne $SessionId) {
  Log 'State missing or session changed; rollback aborted.'
  exit 2
}
if ($state.state -ne 'pending_health') {
  Log "Session no longer pending: $($state.state); rollback aborted."
  exit 0
}

$rollback = [string]$state.rollbackInstaller
if (-not $rollback -or -not (Test-Path $rollback)) {
  $state.state = 'rollback_unavailable'
  $state.lastError = 'Health check timed out and rollback installer is unavailable.'
  Write-State $state
  Log 'Rollback installer unavailable.'
  exit 3
}

$state.state = 'rolling_back'
$state.lastError = 'New version did not pass the Yamachat startup health check.'
Write-State $state
Log "Rolling back using $rollback"

$installedPath = [string]$state.installedExePath
Get-Process -Name 'Yamachat' -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path -eq $installedPath } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

$proc = Start-Process -FilePath $rollback -ArgumentList '/S' -PassThru -Wait -WindowStyle Hidden
if ($null -eq $proc -or $proc.ExitCode -ne 0) {
  $state = Read-State
  if ($null -ne $state) {
    $state.state = 'rollback_failed'
    $state.lastError = 'Rollback installer failed.'
    Write-State $state
  }
  Log "Rollback installer failed exit=$($proc.ExitCode)"
  exit 4
}

$state = Read-State
if ($null -ne $state) {
  $state.state = 'rolled_back'
  $state.currentVersion = $state.rollbackVersion
  Write-State $state
}

$exe = [string]$state.installedExePath
if ($exe -and (Test-Path $exe)) {
  Start-Process -FilePath $exe -ArgumentList '--yamachat-rollback-recovered' -WindowStyle Hidden | Out-Null
}
Log 'Rollback completed.'
exit 0