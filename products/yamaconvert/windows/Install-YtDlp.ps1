$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$headers = @{ 'User-Agent' = 'YamaConvert-Windows' }
$release = Invoke-RestMethod -Uri 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest' -Headers $headers
$binaryAsset = $release.assets | Where-Object name -eq 'yt-dlp.exe' | Select-Object -First 1
$sumsAsset = $release.assets | Where-Object name -eq 'SHA2-256SUMS' | Select-Object -First 1
if (-not $binaryAsset -or -not $sumsAsset) { throw 'Oficialni vydani yt-dlp neobsahuje program nebo kontrolni soucty.' }
$temp = Join-Path $env:TEMP ("yamaconvert-yt-dlp-" + [guid]::NewGuid().ToString('N'))
$download = Join-Path $temp 'yt-dlp.exe'
New-Item -ItemType Directory -Path $temp -Force | Out-Null
try {
  Invoke-WebRequest -UseBasicParsing -Uri $binaryAsset.browser_download_url -OutFile $download -Headers $headers
  $sums = (Invoke-WebRequest -UseBasicParsing -Uri $sumsAsset.browser_download_url -Headers $headers).Content
  $match = [regex]::Match($sums, '(?m)^([0-9a-fA-F]{64})\s+\*?yt-dlp\.exe\s*$')
  if (-not $match.Success) { throw 'SHA-256 for yt-dlp.exe is missing from the official checksum file.' }
  $actual = (Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash
  if ($actual -ine $match.Groups[1].Value) { throw 'The downloaded yt-dlp checksum does not match.' }
  $target = Join-Path $PSScriptRoot 'vendor\yt-dlp'
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  Move-Item -LiteralPath $download -Destination (Join-Path $target 'yt-dlp.exe') -Force
  Write-Host "yt-dlp $($release.tag_name) is verified and ready." -ForegroundColor Green
} finally {
  Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}
