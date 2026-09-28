# Android 1.0.107 delivery refresh

This file intentionally triggers a fresh signed Android production build from the already-released Yamachat 1.0.107 source.

Reason:
- public 1.0.107 Android was published as versionCode 200672;
- CI/preview Android builds from the same period can have higher versionCodes;
- Android will not offer an update to any installed build whose versionCode is already >= 200672.

No Yamachat runtime, UI, voice, stream, WebRTC, notification, auth or platform layout code is changed by this refresh.
The main-branch Android workflow must preserve package eu.yamachat.app and the pinned production signing certificate while assigning a newer monotonically increasing versionCode.
