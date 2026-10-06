param(
  [Parameter(Mandatory=$true)][string]$Version
)

$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$source=Get-Content (Join-Path $root 'MainWindow.xaml.cs') -Raw
$installer=Get-Content (Join-Path $root 'installer\YamaSearch.iss') -Raw
$manifest=Get-Content (Join-Path $root 'release\latest.json') -Raw | ConvertFrom-Json

if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Version must use X.Y.Z.' }
if ($source -notmatch 'https://updates\.yamachat\.eu/yamasearch/latest\.json') { throw 'The updater manifest is not isolated to YamaSearch.' }
if ($source -notmatch 'uri\.Scheme == Uri\.UriSchemeHttps' -or $source -notmatch 'string\.Equals\(uri\.Host, "updates\.yamachat\.eu"') { throw 'The updater no longer validates the trusted HTTPS host.' }
if ($installer -notmatch 'AppId=\{\{54F1C6D2-8A1C-4706-9FC8-5D7C3D80D5B1\}') { throw 'The installer identity is missing or changed.' }
if ($installer -notmatch 'DefaultDirName=\{localappdata\}\\Programs\\YamaSearch') { throw 'The installer target is not isolated to YamaSearch.' }
if ($manifest.product -ne 'YamaSearch') { throw 'The checked-in manifest has the wrong product identity.' }
foreach ($url in @($manifest.portableUrl,$manifest.installerUrl)) {
  if ($url -notmatch '^https://updates\.yamachat\.eu/yamasearch/') { throw "Manifest escaped the YamaSearch namespace: $url" }
}
Write-Output "YamaSearch release contract verified for $Version."
