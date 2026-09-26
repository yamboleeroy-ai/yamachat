param(
  [switch]$TestMode
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$project = Join-Path $root "windows\wns\Yamachat.WnsBridge\Yamachat.WnsBridge.csproj"
$template = Join-Path $root "windows\wns\AppxManifest.template.xml"
$outDir = Join-Path $root "desktop\wns"
$sparseDir = Join-Path $outDir "sparse"
$assetsDir = Join-Path $outDir "Assets"
$bridgeExe = Join-Path $outDir "Yamachat.WnsBridge.exe"
$identityMsix = Join-Path $outDir "Yamachat.PushIdentity.msix"
$configPath = Join-Path $outDir "wns-config.json"
$runtimeInstaller = Join-Path $outDir "WindowsAppRuntimeInstall-x64.exe"
$runtimeInstallerUrl = if ($env:YAMACHAT_WINDOWS_APP_RUNTIME_URL) { $env:YAMACHAT_WINDOWS_APP_RUNTIME_URL } else { "https://aka.ms/windowsappsdk/2.5/2.5.1/windowsappruntimeinstall-x64.exe" }

function Require-Value([string]$Name, [string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { throw "Missing required WNS build value: $Name" }
  return $Value
}

$packageName = if ($env:YAMACHAT_WNS_PACKAGE_NAME) { $env:YAMACHAT_WNS_PACKAGE_NAME } elseif ($TestMode) { "Yamachat.Desktop.Push.Dev" } else { "yamachat.eu-7E03B8AF" }
$publisher = if ($env:YAMACHAT_WNS_PUBLISHER) { $env:YAMACHAT_WNS_PUBLISHER } elseif ($TestMode) { "CN=Yamachat Development" } else { "" }
$appId = if ($env:YAMACHAT_WNS_APP_ID) { $env:YAMACHAT_WNS_APP_ID } elseif ($TestMode) { "cf14f6d1-3ce9-4eab-9678-aa0141550074" } else { "9addf482-cc9c-4e61-8075-ebcb7adce1cf" }
$objectId = if ($env:YAMACHAT_WNS_OBJECT_ID) { $env:YAMACHAT_WNS_OBJECT_ID } elseif ($TestMode) { "78b663b0-2adf-4f2f-82bd-a8e140b305d3" } else { "ac8013be-a388-485b-b68f-6f70fa7ec6f6" }
$packageVersion = if ($env:YAMACHAT_WNS_PACKAGE_VERSION) { $env:YAMACHAT_WNS_PACKAGE_VERSION } elseif ($TestMode) { "1.0.0.0" } else { "" }

Require-Value "YAMACHAT_WNS_PACKAGE_NAME" $packageName | Out-Null
Require-Value "YAMACHAT_WNS_PUBLISHER" $publisher | Out-Null
Require-Value "YAMACHAT_WNS_APP_ID" $appId | Out-Null
Require-Value "YAMACHAT_WNS_OBJECT_ID" $objectId | Out-Null
Require-Value "YAMACHAT_WNS_PACKAGE_VERSION" $packageVersion | Out-Null

$parsedGuid = [guid]::Empty
if (-not [guid]::TryParse($appId, [ref]$parsedGuid)) { throw "YAMACHAT_WNS_APP_ID must be a GUID." }
$parsedGuid = [guid]::Empty
if (-not [guid]::TryParse($objectId, [ref]$parsedGuid)) { throw "YAMACHAT_WNS_OBJECT_ID must be a GUID." }

Remove-Item $outDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $outDir,$sparseDir,$assetsDir | Out-Null

Write-Host "Downloading Windows App SDK Runtime 2.5.1 x64..."
Invoke-WebRequest -Uri $runtimeInstallerUrl -OutFile $runtimeInstaller -UseBasicParsing
if (-not (Test-Path $runtimeInstaller) -or (Get-Item $runtimeInstaller).Length -lt 100000) {
  throw "Windows App SDK Runtime installer download failed."
}

dotnet publish $project -c Release -r win-x64 --self-contained true -o $outDir
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $bridgeExe)) { throw "WNS bridge publish failed." }

# Generate a canonical sparse layout/assets with Microsoft's CLI, then replace only
# the manifest with Yamachat's COM/push activation extensions.
npx --no-install winapp init --exe $bridgeExe --sparse --use-defaults --force --name $packageName --publisher $publisher --output-dir $sparseDir
if ($LASTEXITCODE -ne 0) { throw "winapp sparse init failed." }

$generatedAssets = Join-Path $sparseDir "Assets"
if (Test-Path $generatedAssets) {
  Copy-Item (Join-Path $generatedAssets "*") $assetsDir -Recurse -Force
}

# Ensure every logo path referenced by the sparse manifest exists at the external location.
$brand = Join-Path $root "build\app-icon-source.png"
if (-not (Test-Path $brand)) { throw "Verified Yamachat app icon is missing: $brand" }
foreach ($name in @("StoreLogo.png","Square44x44Logo.png","Square150x150Logo.png","Wide310x150Logo.png")) {
  $target = Join-Path $assetsDir $name
  if (-not (Test-Path $target)) { Copy-Item $brand $target -Force }
}

$manifest = Get-Content $template -Raw
$manifest = $manifest.Replace("{{PACKAGE_NAME}}", $packageName)
$manifest = $manifest.Replace("{{PUBLISHER}}", $publisher)
$manifest = $manifest.Replace("{{PACKAGE_VERSION}}", $packageVersion)
$manifest = $manifest.Replace("{{WNS_APP_ID}}", $appId)
$manifestPath = Join-Path $sparseDir "appxmanifest.xml"
Set-Content -Path $manifestPath -Value $manifest -Encoding UTF8

@{
  objectId = $objectId
  protocol = "yamachat"
} | ConvertTo-Json | Set-Content -Path $configPath -Encoding UTF8

$cert = $env:YAMACHAT_WNS_PFX_PATH
$certPassword = $env:YAMACHAT_WNS_PFX_PASSWORD
if ($TestMode) {
  $cert = Join-Path $outDir "wns-devcert.pfx"
  $certPassword = "yamachat-ci"
  npx --no-install winapp cert generate --manifest $manifestPath --output $cert --password $certPassword
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $cert)) { throw "WNS development certificate generation failed." }
} else {
  Require-Value "YAMACHAT_WNS_PFX_PATH" $cert | Out-Null
  Require-Value "YAMACHAT_WNS_PFX_PASSWORD" $certPassword | Out-Null
  if (-not (Test-Path $cert)) { throw "WNS production signing PFX was not found." }
}

npx --no-install winapp pack $manifestPath --output $identityMsix --cert $cert --cert-password $certPassword
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $identityMsix)) { throw "WNS identity package build failed." }

npx --no-install winapp embed-identity $bridgeExe --manifest $manifestPath
if ($LASTEXITCODE -ne 0) { throw "Embedding sparse package identity into the WNS bridge failed." }

Write-Host "PASS: Yamachat WNS bridge + sparse identity built."
Write-Host "Bridge: $bridgeExe"
Write-Host "Identity: $identityMsix"
Write-Host "Windows App Runtime: $runtimeInstaller"
