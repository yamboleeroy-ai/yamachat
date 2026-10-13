# YamaSearch for Android

Native Android browser application for the existing YamaSearch product. It is not a wrapper around the YamaSearch web site: the interface, tabs, navigation, downloads, history and bookmarks are owned by the Android application; each card uses Android System WebView to display normal web content.

## Current capabilities

- real Android `WebView` cards, address/search bar, back/forward/reload and home;
- current-card tab strip, new card and long-press to close a card;
- locally stored history and bookmarks for the normal profile;
- Android DownloadManager downloads;
- camera, microphone, location and file-picker hand-off through Android's permission APIs;
- fullscreen web content and media playback;
- per-process anonymous browser activity using `WebView.setDataDirectorySuffix`, with storage and cookies cleared when it closes;
- lightweight YamaBlock host filtering for known ad/tracker hosts.

## Intentional platform limits

Android System WebView owns many browser policies: third-party cookie policy, Web Push delivery, autoplay and notification permissions may vary by installed WebView and Android version. The application does not claim background Web Push support that WebView has not provided. Android OS camera/microphone/location permissions remain authoritative.

## Building

The local SDK path lives in `local.properties`, which is ignored by Git. Use JDK 17 and Android SDK API 35:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot'
& 'C:\path\to\gradle\bin\gradle.bat' :app:assembleDebug
& 'C:\path\to\gradle\bin\gradle.bat' :app:assembleRelease
```

`app/build/outputs/apk/debug/app-debug.apk` is a development build. `app/build/outputs/apk/release/app-release.apk` is release-signed only when a local `keystore.properties` file is present.

## Signing and future updates

The production key is deliberately excluded from Git (`keys/` and `keystore.properties`). Preserve the same key, `applicationId` (`eu.yamachat.yamasearch`), and incrementing `versionCode` for every future release. Losing the key prevents Android from installing later builds as updates over existing installations.

Do not add an Android download card to the production web site until a signed APK has been uploaded to the `yamasearch/` distribution namespace and its URL returns the current file.
