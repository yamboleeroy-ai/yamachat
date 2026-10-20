$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$headers = @{ 'User-Agent' = 'YamaConvert-Windows' }
$release = Invoke-RestMethod -Uri 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest' -Headers $headers
$binaryAsset = $release.assets | Where-Object name -eq 'yt-dlp.exe' | Select-Object -First 1
if (-not $binaryAsset) { throw 'Oficialni vydani yt-dlp neobsahuje program.' }
$temp = Join-Path $env:TEMP ("yamaconvert-yt-dlp-" + [guid]::NewGuid().ToString('N'))
$download = Join-Path $temp 'yt-dlp.exe'
New-Item -ItemType Directory -Path $temp -Force | Out-Null
try {
  Invoke-WebRequest -UseBasicParsing -Uri $binaryAsset.browser_download_url -OutFile $download -Headers $headers
  $match = [regex]::Match([string]$binaryAsset.digest, '^sha256:([0-9a-fA-F]{64})
  $actual = (Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash
  if ($actual -ine $match.Groups[1].Value) { throw 'The downloaded yt-dlp checksum does not match.' }
  $target = Join-Path $PSScriptRoot 'vendor\yt-dlp'
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  Move-Item -LiteralPath $download -Destination (Join-Path $target 'yt-dlp.exe') -Force
  Write-Host "yt-dlp $($release.tag_name) is verified and ready." -ForegroundColor Green
} finally {
  Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}
)
  if (-not $match.Success) { throw 'GitHub API did not return SHA-256 for the official yt-dlp.exe.' }
  $actual = (Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash
  if ($actual -ine $match.Groups[1].Value) { throw 'The downloaded yt-dlp checksum does not match.' }
  $target = Join-Path $PSScriptRoot 'vendor\yt-dlp'
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  Move-Item -LiteralPath $download -Destination (Join-Path $target 'yt-dlp.exe') -Force
  Write-Host "yt-dlp $($release.tag_name) is verified and ready." -ForegroundColor Green
} finally {
  Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}
