# Stable Android APKs

Package: `eu.yamachat.app` (unchanged). The public certificate fingerprint and
version floor live in `android-release.json`. Never commit a private keystore or
its password. Back up the encrypted keystore and password securely.

Configure repository Actions secrets `ANDROID_KEYSTORE_B64` (base64 of the
permanent PKCS12 keystore, alias `yamachat`) and `ANDROID_KEYSTORE_PASSWORD`.
Missing secrets stop the build; there is no random debug-key fallback.
Both debug and release Gradle builds use the same pinned certificate.

CI versionCode is 200000 + GITHUB_RUN_NUMBER; versionName is 1.1.0.RUN_NUMBER.
Re-running a job reproduces its version; each new run increases it. If replacing
or renaming the workflow, preserve monotonic numbering or deliberately raise the
floor and CI formula together. Artifact verification rejects a versionCode that
is not greater than the currently published APK.

Local builds: prepare:web, cap add android if absent, cap sync android, then
`node scripts/patch-native.mjs android`. Set ANDROID_KEYSTORE_PATH to an absolute
keystore path, ANDROID_KEYSTORE_PASSWORD, and ANDROID_VERSION_CODE to a value
above the installed/published build before running Gradle assembleRelease.
Without an override local versionCode defaults to 200000; do not distribute it
over newer CI builds. Use the CI artifact for distribution.

Build #65 had versionCode 100065 and used a newly generated runner debug key;
the signing secrets were empty. Earlier runner keys were not saved in the
repository. Those installations cannot be updated with the new key: users need
a one-time uninstall/reinstall (local app data is removed). Subsequent APKs with
the permanent key and higher versionCode can update in place. A version bump
alone cannot repair a certificate mismatch. The old private key cannot be
recovered from an APK.

`verify-android-apk.py` verifies the signed APK, package, version, pinned
certificate and comparison with the previous published APK, and writes the
artifact report. CI also checks zip alignment. A physical-device installation
and call test remains necessary; browser geometry checks do not emulate Android.

Android portrait CSS is copied only into Android assets after cap sync, never
into shared www, web, iOS, or the desktop reference. Capacitor 8 SystemBars
provides --safe-area-inset-bottom: zero for a natively inset WebView or the real
inset for edge-to-edge. Only the dock host owns it. The controls row has 6px
padding, never a second safe-area padding inside its fixed 68px height.

UI regression check (after sync/patch, with Playwright installed):
`node mobile/tests/android-layout.cjs`. Optional BROWSER_EXECUTABLE selects the
browser, ANDROID_TEST_OUTPUT saves a screenshot and geometry report. The test
uses local fixtures and blocks external requests.
