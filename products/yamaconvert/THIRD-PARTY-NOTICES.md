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

