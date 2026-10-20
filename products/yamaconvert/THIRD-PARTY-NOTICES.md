# YamaConvert third-party notices

## QuickJS-NG

YamaConvert Android bundles the QuickJS-NG command-line runtime to provide
yt-dlp with a JavaScript runtime. QuickJS-NG is distributed under the MIT
License. The build downloads the pinned `v0.16.1` source from the upstream
`quickjs-ng/quickjs` repository and builds it for Android; the upstream
`LICENSE` is included in that source checkout.

## yt-dlp Android

The Android app uses `dev.ffmpegkit-maintained:yt-dlp-android:2.0.2`, which is
distributed under the MIT License. yt-dlp's license and included dependency
notices are available from the library's `THIRD-PARTY-NOTICES.txt` and upstream
project documentation.

## yt-dlp EJS scripts

For YouTube support, yt-dlp may download its compatible EJS challenge scripts
from the official `yt-dlp/ejs` GitHub releases at runtime. Those scripts retain
their upstream licenses and are not modified by YamaConvert.

## Windows portable app

The Windows ZIP includes the unmodified `@breezystack/lamejs@1.2.7` browser
bundle and its LGPL-3.0 license and source. The `yt-dlp.exe` binary is not
bundled in the ZIP; on first run the app downloads the current official
`yt-dlp/yt-dlp` release and verifies the SHA-256 checksum published by that
project. The yt-dlp executable and its bundled components retain their
upstream licenses. License and source information is available at
https://github.com/yt-dlp/yt-dlp#licensing.
