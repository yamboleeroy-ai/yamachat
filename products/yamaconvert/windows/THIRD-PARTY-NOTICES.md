# YamaConvert Windows portable app: third-party notices

The Windows ZIP includes the unmodified `@breezystack/lamejs@1.2.7` browser
bundle, its source file, and the package's LGPL-3.0 license. The files are kept
under `vendor/lamejs/`.

The `yt-dlp.exe` executable is not included in the ZIP. On first start,
`Install-YtDlp.ps1` downloads the current official Windows executable and
`SHA2-256SUMS` from the yt-dlp GitHub release, then verifies the binary's
SHA-256 checksum before installation. The executable and its bundled
components retain their upstream licenses. yt-dlp's licensing and source
information is available at https://github.com/yt-dlp/yt-dlp#licensing.
