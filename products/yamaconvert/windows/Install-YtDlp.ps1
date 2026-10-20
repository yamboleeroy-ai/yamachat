$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$headers = @{ 'User-Agent' = 'YamaConvert-Windows' }
$release = Invoke-RestMethod -Uri 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest' -Headers $headers
$binaryAsset = $release.assets | Where-Object name -eq 'yt-dlp.exe' | Select-Object -First 1
$sumsAsset = $release.assets | Where-Object name -eq 'SHA2-256SUMS' | Select-Object -First 1
if (-not $binaryAsset -or -not $sumsAsset) { throw 'Oficiální vydání yt-dlp neobsahuje program nebo kontrolní součty.' }
$temp = Join-Path $env:TEMP ("yamaconvert-yt-dlp-" + [guid]::NewGuid().ToString('N'))
$download = Join-Path $temp 'yt-dlp.exe'
New-Item -ItemType Directory -Path $temp -Force | Out-Null
try {
  Invoke-WebRequest -Uri $binaryAsset.browser_download_url -OutFile $download -Headers $headers
  $sums = (Invoke-WebRequest -Uri $sumsAsset.browser_download_url -Headers $headers).Content
  $match = [regex]::Match($sums, '(?m)^([0-9a-fA-F]{64})\s+\*?yt-dlp\.exe\s*$')
  if (-not $match.Success) { throw 'Kontrolní soubor neobsahuje SHA-256 pro yt-dlp.exe.' }
  $actual = (Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash
  if ($actual -ine $match.Groups[1].Value) { throw 'Kontrolní součet staženého yt-dlp nesouhlasí.' }
  $target = Join-Path $PSScriptRoot 'vendor\yt-dlp'
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  Move-Item -LiteralPath $download -Destination (Join-Path $target 'yt-dlp.exe') -Force
  Write-Host "Stahovací engine yt-dlp $($release.tag_name) je ověřený a připravený." -ForegroundColor Green
} finally {
  Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}
