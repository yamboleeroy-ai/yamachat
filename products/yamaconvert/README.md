# YamaConvert

The first Android release is an installable Progressive Web App served by the
existing Yamaportal Cloudflare Pages site at `/yamaconvert/`. It uses the
browser's local file APIs for conversions and shares the Yamaportal browser
session. A service worker checks for new assets when the app starts and keeps
the static application shell available offline.

The social-page downloader is intentionally not part of the public PWA. It
depends on the Windows local Node service and its downloader engine. The PWA
disables that action and explains the limitation; local file conversion remains
available on Android where the browser supports the selected format.

This package is not a signed Android APK. Publishing it through the existing
Portal Pages workflow makes it installable from Android Chrome and updates it
through the service worker. A native APK requires a separately maintained
Android project and product signing credentials.
