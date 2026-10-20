# YamaConvert

The first Android release is an installable Progressive Web App served by the
existing Yamaportal Cloudflare Pages site at `/yamaconvert/`. It uses the
browser's local file APIs for conversions and shares the Yamaportal browser
session. A service worker checks for new assets when the app starts and keeps
the static application shell available offline.

The Android PWA registers as a system share target for audio and video files.
Saved files can be shared directly into YamaConvert for local conversion.
Shared files stay in a same-origin IndexedDB inbox until the PWA opens them;
unopened inbox entries expire after 24 hours.

YamaConvert also accepts public links from the supported social and video sites.
The web and Android PWA use the same downloader service and MP3, MP4, or WEBM
output choices. Each download requires a Yamaportal sign-in and a fresh
confirmation that the user has rights to use the content. Changing a link or
starting another download clears the confirmation. Downloads are limited to
100 MB and 10 per account per 24 hours. The service never uses source-site
cookies or credentials and does not bypass private, paid, or DRM-protected
content. Downloaded media is temporarily staged on the downloader service and
deleted after it is streamed to the app; conversion and history remain local.

This package is not a signed Android APK. Publishing it through the existing
Portal Pages workflow makes it installable from Android Chrome and updates it
through the service worker. A native APK requires a separately maintained
Android project and product signing credentials.
