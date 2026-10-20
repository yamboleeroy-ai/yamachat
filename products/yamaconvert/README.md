# YamaConvert

YamaConvert is served as an installable Progressive Web App from the existing
Yamaportal Cloudflare Pages site at `/yamaconvert/`. A separate native Android
project lives in `android/`; it opens the same Yamaportal page, keeps its own
Yamaportal sign-in and runs the public-link downloader on the phone. Android
file conversions remain local. The PWA and Windows installation keep using the
hosted downloader when it accepts a public URL.

The Android PWA registers as a system share target for audio and video files.
Saved files can be shared directly into YamaConvert for local conversion.
Shared files stay in a same-origin IndexedDB inbox until the PWA opens them;
unopened inbox entries expire after 24 hours.

YamaConvert also accepts public links from supported social and video sites.
The web/PWA uses the hosted downloader; the native APK invokes yt-dlp locally
on the phone, so source sites see the user's network instead of a cloud-server
IP. Both paths offer MP3, MP4, or WEBM output choices. Each download requires
a Yamaportal sign-in and a fresh
confirmation that the user has rights to use the content. Changing a link or
starting another download clears the confirmation. Downloads are limited to
100 MB and 10 per account per 24 hours. The service never uses source-site
cookies or credentials and does not bypass private, paid, or DRM-protected
content. Downloaded media is temporarily staged on the downloader service and
deleted after it is streamed to the app; conversion and history remain local.

The native project uses the free `yt-dlp-android` library from Maven Central
and bundles QuickJS-NG for yt-dlp's YouTube JavaScript challenge support. The
Android preview and release workflows build the runtime for arm64 and x86_64;
run `bash scripts/build-quickjs.sh` from `android/` before making a local APK.
The app does not pass social-site cookies or credentials, use a proxy, or
attempt to overcome a platform block; a platform can still refuse a download. A signed
release is published as a versioned GitHub Release. The Portal links to its
stable APK asset, and the installed app checks GitHub Releases for newer
versions. Android asks the user to approve each APK update and validates the
product signature before replacing the installed app. The release workflow
requires YamaConvert-specific signing secrets and a pinned certificate
fingerprint; it is separate from YamaSearch signing material.

Build a local preview in Android Studio by opening `android/`; build QuickJS
first using the script above. The debug package ID is
`eu.yamachat.yamaconvert.preview`, so it installs beside any future public
version. The `yamaconvert-android-preview.yml` workflow builds the same APK and
stores it as a temporary GitHub Actions artifact; it does not publish it.

