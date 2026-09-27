param(
  [string]$Destination = "desktop/process-audio"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root "windows/process-audio"
$build = Join-Path $root "windows/process-audio/.build"
$destinationPath = Join-Path $root $Destination

if (Test-Path $build) { Remove-Item -Recurse -Force $build }
New-Item -ItemType Directory -Force -Path $build | Out-Null
New-Item -ItemType Directory -Force -Path $destinationPath | Out-Null

cmake -S $source -B $build -A x64
if ($LASTEXITCODE -ne 0) { throw "CMake configure failed for process-audio helper" }

cmake --build $build --config Release
if ($LASTEXITCODE -ne 0) { throw "Process-audio helper build failed" }

$exe = Join-Path $build "Release/Yamachat.ProcessAudioCapture.exe"
if (-not (Test-Path $exe)) { throw "Process-audio helper output missing: $exe" }

$target = Join-Path $destinationPath "Yamachat.ProcessAudioCapture.exe"
Copy-Item -Force $exe $target

& $target --version
if ($LASTEXITCODE -ne 0) { throw "Process-audio helper version probe failed" }

Write-Host "PASS Windows process-audio helper -> $target"
