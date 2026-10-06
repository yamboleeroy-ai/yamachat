param(
  [Parameter(Mandatory=$true)][string]$Version,
  [string]$Notes='Vydání YamaSearch.',
  [switch]$SkipInstaller
)

$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$artifacts=Join-Path $root 'artifacts'
$publish=Join-Path $artifacts 'publish'
$portable=Join-Path $artifacts "YamaSearch-Portable-$Version.zip"
Remove-Item -LiteralPath $artifacts -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $publish -Force | Out-Null

dotnet publish (Join-Path $root 'YamaSearch.csproj') -c Release -r win-x64 --self-contained false -p:Version=$Version -p:AssemblyVersion="$Version.0" -p:FileVersion="$Version.0" -o $publish
if ($LASTEXITCODE -ne 0) { throw 'dotnet publish selhal.' }
Compress-Archive -Path (Join-Path $publish '*') -DestinationPath $portable -Force

$manifest=[ordered]@{
  product='YamaSearch'; version=$Version; notes=$Notes
  portableUrl='https://updates.yamachat.eu/yamasearch/YamaSearch-Portable-latest.zip'
  installerUrl='https://updates.yamachat.eu/yamasearch/YamaSearch-Setup-latest.exe'
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $artifacts 'latest.json') -Encoding utf8
Get-FileHash $portable -Algorithm SHA256 | ForEach-Object { "{0}  {1}" -f $_.Hash.ToLowerInvariant(),(Split-Path $_.Path -Leaf) } | Set-Content -LiteralPath (Join-Path $artifacts 'SHA256SUMS.txt') -Encoding ascii

if (-not $SkipInstaller) {
  $iscc=(Get-Command iscc.exe -ErrorAction SilentlyContinue).Source
  if (-not $iscc) {
    $candidates=@(
      "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
      'C:\Program Files\Inno Setup 6\ISCC.exe',
      'C:\Program Files (x86)\Inno Setup 6\ISCC.exe'
    )
    $candidates+=Get-ChildItem -LiteralPath 'C:\Users' -Directory -ErrorAction SilentlyContinue |
      ForEach-Object { Join-Path $_.FullName 'AppData\Local\Programs\Inno Setup 6\ISCC.exe' }
    $iscc=$candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  }
  if (-not $iscc) { throw 'Inno Setup (iscc.exe) není k dispozici. Portable artefakt zůstal vytvořen; pro Installer nainstalujte Inno Setup.' }
  & $iscc "/DAppVersion=$Version" (Join-Path $root 'installer\YamaSearch.iss')
  if ($LASTEXITCODE -ne 0) { throw 'Inno Setup selhal.' }
  $installer=Join-Path $artifacts "YamaSearch-Setup-$Version.exe"
  Get-FileHash $installer -Algorithm SHA256 | ForEach-Object { "{0}  {1}" -f $_.Hash.ToLowerInvariant(),(Split-Path $_.Path -Leaf) } | Add-Content -LiteralPath (Join-Path $artifacts 'SHA256SUMS.txt') -Encoding ascii
}
