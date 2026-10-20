# YamaConvert

YamaConvert is served as an installable Progressive Web App from the existing
Yamaportal Cloudflare Pages site at `/yamaconvert/`. A separate native Android
project lives in `android/`; it opens the same Yamaportal page, keeps its own
Yamaportal sign-in and runs the public-link downloader on the phone. Android
file conversions remain local.

The Android PWA registers as a system share target for audio and video files.
Saved files can be shared directly into YamaConvert for local conversion.
Shared files stay in a same-origin IndexedDB inbox until the PWA opens them;
unopened inbox entries expire after 24 hours.

Social downloads are provided by the native Android app and the Windows
desktop app. Both run yt-dlp on the user's device, so the request uses the
device's network instead of a hosted PWA server IP. The web/PWA directs users
to an app for social downloads and remains available for local file conversion.
The Android app uses Yamaportal sign-in. The Windows app runs locally and
downloads the official yt-dlp Windows executable on first start after
validating its SHA-256 checksum. It includes its own Node.js runtime, so a
separate Node installation is not required. Yamaportal offers a Windows
installer (`.exe`) and a portable ZIP. The installer creates a Start menu
shortcut and can add a desktop shortcut.

Both app routes require a fresh confirmation that the user has rights to use
the content. Changing a link or starting another download clears the
confirmation. Downloads are limited to 100 MB. The apps do not use source-site
cookies or credentials, do not use a proxy, and do not bypass private, paid, or
DRM-protected content; a platform can still refuse a download.

Android offers MP3, MP4, or WEBM output choices. Downloaded media is temporarily
staged by the Android downloader service and deleted after it is streamed to
the app; conversion and history remain local. The Windows app processes
downloads and file conversions on the user's own computer.

The Android route uses a shared allow-list in
`downloader/supported-sites.txt` for common yt-dlp sites. The upstream
extractor catalog is much larger and includes sources that may be broken or
need an account; accepted domains stay limited to this shared list.

The native Android project uses the free `yt-dlp-android` library from Maven
Central and bundles QuickJS-NG for yt-dlp's YouTube JavaScript challenge
support. The Android preview and release workflows build the runtime for arm64
and x86_64; run `bash scripts/build-quickjs.sh` from `android/` before making
a local APK. A signed release is published as a versioned GitHub Release. The
Portal links to its stable APK asset, and the installed app checks GitHub
Releases for newer versions. Android asks the user to approve each APK update
and validates the product signature before replacing the installed app.

Build a local preview in Android Studio by opening `android/`; build QuickJS
first using the script above. The debug package ID is
`eu.yamachat.yamaconvert.preview`, so it installs beside any future public
version. The `yamaconvert-android-preview.yml` workflow builds the same APK
and stores it as a temporary GitHub Actions artifact; it does not publish it.
