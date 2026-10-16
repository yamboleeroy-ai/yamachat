const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const javaRoot = path.join(root, 'products/yamasearch/android/app/src/main/java/eu/yamachat/yamasearch');
const read = name => fs.readFileSync(path.join(javaRoot, name), 'utf8');

const activity = read('BrowserActivity.java');
const store = read('BrowserStore.java');
const home = read('MobileHomePage.java');
const panel = read('MobileSearchPanel.java');
const updateController = read('AndroidUpdateController.java');
const updateChecker = read('AndroidUpdateChecker.java');
const updateManifest = read('AndroidUpdateManifest.java');
const updateRecord = read('AndroidUpdateDownloadRecord.java');
const updateVerifier = read('AndroidUpdateDownloadVerifier.java');
const updatePackageVerifier = read('AndroidUpdatePackageVerifier.java');
const androidManifest = fs.readFileSync(path.join(root,
  'products/yamasearch/android/app/src/main/AndroidManifest.xml'), 'utf8');
const updatePaths = fs.readFileSync(path.join(root,
  'products/yamasearch/android/app/src/main/res/xml/yamasearch_update_paths.xml'), 'utf8');

assert(activity.includes('MobileNavigation.resolve(text)'), 'Address input must be classified once');
assert(activity.includes('!privateSession() && destination.search'), 'Private searches must not reach persistent storage');
assert(activity.includes('profile.rememberSearches'), 'Search persistence must respect profile settings');
assert(activity.includes('store.recordSearch(destination.input)'), 'The original query, not a Google URL, must be stored');
assert(activity.includes('handleInternalNavigation(tab, view, request)'), 'Local home actions must be handled by the owning tab');
assert(activity.includes('MobileHomePage.HOME_BASE'), 'Home content needs a stable local base');
assert(activity.includes('final String homeDocumentUrl = MobileHomePage.HOME_BASE + UUID.randomUUID()'),
  'Each tab must use an unguessable synthetic home URL');
assert(activity.includes('boolean trustedHome = tab.homeDocumentUrl.equals(url)'),
  'Back/Forward may restore only that tab\'s generated home document');
assert(activity.includes('refreshHomeInPlace(selected)'), 'Reload on home must update without another history navigation');
assert(activity.includes('tab.homeContentDirty = true'), 'Hidden home renderers must be refreshed lazily');
assert(activity.includes('createTab(HOME, true, true)'), 'Popup WebViews must be transported before any initial navigation');
assert(activity.includes('onCloseWindow(WebView window)'), 'Web popups must release their tab and WebView on window.close()');
assert(activity.includes('closeTab(tab);'), 'Popup close must target the owning tab, not whichever tab is selected');
assert(activity.includes('refreshHomeTabs();'), 'Favorites/profile/search mutations must refresh home tabs');
assert(activity.includes('new AndroidUpdateController('), 'Normal Android browser must own the update lifecycle');
assert(activity.includes('updateController.onResume();'), 'Foreground resume must trigger a throttled update check');
assert(activity.includes('updateController.onPause();'), 'Background Activities must not receive update dialogs');
assert(activity.includes('updateController.checkManually();'), 'The browser menu must expose a manual update check');
assert(activity.includes('!privateSession() && AndroidUpdateManifest.PACKAGE_ID.equals(getPackageName())'),
  'Only the normal production package may initialize the updater');
assert(activity.includes('updateController.close();'), 'Destroying the Activity must release updater resources');

assert(updateChecker.includes('HttpsURLConnection'), 'Android updater must use the HTTPS transport');
assert(updateChecker.includes('setInstanceFollowRedirects(false)'), 'Update metadata redirects must be rejected');
assert(updateChecker.includes('Unexpected manifest content type'), 'HTML fallbacks must not be accepted as update metadata');
assert(updateChecker.includes('Executors.newSingleThreadExecutor'), 'Update network work must stay off the UI thread');
assert(updateManifest.includes('eu.yamachat.yamasearch.mobile'), 'Update metadata must bind to the production package');
assert(updateManifest.includes('YamaSearch-Android-" + version + ".apk'), 'Update downloads must use immutable versioned APKs');
assert(updateController.includes('SUCCESS_INTERVAL_MILLIS'), 'Automatic checks must be lifecycle-throttled');
assert(updateController.includes('PROMPT_REPEAT_MILLIS'), 'Dismissed versions must not prompt on every resume');
assert(activity.includes('DownloadManager.ACTION_DOWNLOAD_COMPLETE'), 'Update downloads must track system completion');
assert(activity.includes('AndroidUpdateDownloadVerifier.verify('), 'Downloaded APK bytes must be verified before approval');
assert(activity.includes('AndroidUpdatePackageVerifier.verify('), 'Downloaded APK identity must be verified before approval');
assert(activity.includes('createVerifiedInternalUpdateCopy('),
  'Verified bytes must be isolated from shared external storage before installation');
assert(activity.includes('FileProvider.getUriForFile('),
  'Only the private verified APK copy may be shared with Android Package Installer');
assert(!activity.includes('getUriForDownloadedFile('),
  'The mutable DownloadManager file URI must never reach Android Package Installer');
assert(updateVerifier.includes('MessageDigest.getInstance("SHA-256")'), 'Downloaded APKs must use SHA-256 verification');
assert(updatePackageVerifier.includes('A6AE7F09A6C808CB8394FBA6271E59BAF47D58D8ED37B43282193DD2799DF75D'),
  'The updater must pin the production signing certificate enforced by release CI');
assert(androidManifest.includes('android.permission.REQUEST_INSTALL_PACKAGES'), 'Verified APKs need an explicit system-installer handoff permission');
assert(androidManifest.includes('android:name="androidx.core.content.FileProvider"')
  && androidManifest.includes('android:exported="false"'), 'The verified-update provider must not be exported');
assert(updatePaths.includes('<files-path name="verified_updates" path="verified-updates/"'),
  'FileProvider may expose only the dedicated internal verified-update directory');
assert(activity.includes('canRequestPackageInstalls()'), 'Android unknown-source consent must be checked before installer launch');
assert(activity.includes('Intent.ACTION_INSTALL_PACKAGE'), 'Verified APKs must be handed to the system package installer');

const between = (source, start, end) => {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  assert(startAt >= 0 && endAt > startAt, `Missing method range: ${start}`);
  return source.slice(startAt, endAt);
};
const ordinaryDownload = between(activity, 'private void enqueueDownload(', 'private SharedPreferences updateDownloadPreferences(');
const appUpdateDownload = between(activity, 'private void downloadAppUpdate(', 'private void ensureUpdateDownloadReceiver(');
const destroyLifecycle = between(activity, '@Override protected void onDestroy()', 'super.onDestroy();');
assert(ordinaryDownload.includes('VISIBILITY_VISIBLE_NOTIFY_COMPLETED'),
  'Ordinary browser downloads must retain their completed notification');
assert(appUpdateDownload.includes('setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);'),
  'Update APKs must disappear from DownloadManager UI until verification finishes');
assert(!appUpdateDownload.includes('VISIBILITY_VISIBLE_NOTIFY_COMPLETED'),
  'An unverified update APK must never expose a completed notification action');
assert(activity.includes('.putLong(UPDATE_DOWNLOAD_ID, record.getDownloadId())')
  && activity.includes('.putString(UPDATE_DOWNLOAD_MANIFEST, record.getManifestJson())')
  && activity.includes('.commit();'), 'Download ID and strict manifest must be committed together');
assert(activity.indexOf('restorePendingUpdateDownload(installedVersionCode);')
  < activity.indexOf('new AndroidUpdateController('), 'Pending update state must restore before a new network check');
assert(activity.includes('AndroidUpdateDownloadRecord.restore('), 'Process restart must revalidate persisted update state');
assert(activity.includes('synchronized (UPDATE_DOWNLOAD_STATE_LOCK)'),
  'Multiple BrowserActivity instances must serialize updater download creation');
assert(activity.includes('UPDATE_DOWNLOAD_VERIFICATION_OWNERS')
  && activity.includes('updateDownloadVerificationToken'),
  'Cross-window verification claims must be released only by their owning lifecycle token');
assert(activity.includes('Set<WeakReference<BrowserActivity>> UPDATE_ACTIVITIES')
  && activity.includes('notifyUpdateVerificationReleased(id)'),
  'A completed verification must wake the focused waiting browser window without polling');
assert(activity.includes('cleanupStaleUpdatePartialsLocked()')
  && activity.includes('file.getName().startsWith(".partial-")'),
  'Updater cleanup must preserve an in-flight private APK copy');
assert(activity.includes('@SuppressLint("UnspecifiedRegisterReceiverFlag")')
  && activity.includes('Context.RECEIVER_EXPORTED'),
  'DownloadProvider completion broadcasts must use explicit receiver visibility on all supported APIs');
assert(updateRecord.includes('manifest.isNewerThan(installedVersionCode)'),
  'Stale downloaded versions must not survive an installed update');
assert(!destroyLifecycle.includes('clearPersistedUpdateDownload')
  && !destroyLifecycle.includes('removeUpdateDownload('),
  'Activity destruction must not lose a DownloadManager update owned by another process');
const focusLifecycle = between(activity, '@Override public void onWindowFocusChanged(',
  '@Override protected void onDestroy()');
assert(focusLifecycle.indexOf('checkPendingUpdateDownload();')
  < focusLifecycle.indexOf('deliverDeferredUpdateUiIfVisible();'),
  'A newly focused window must immediately pick up a completed cross-window verification');

assert(store.includes('searchHistoryV1'));
assert(store.includes('MAX_SEARCHES = 100'));
assert(store.includes('MAX_STORED_URL_CHARS = 4096'));
assert(store.includes('MAX_TITLE_CODE_POINTS = 256'));
assert(store.includes('query.toLowerCase(Locale.ROOT)'), 'Search history must deduplicate case-insensitively');

assert(home.includes("default-src 'none'"), 'Local home must not load remote resources');
assert(home.includes('home.yamasearch.invalid'), 'Synthetic home must use a reserved, non-public origin');
assert(!home.includes('addJavascriptInterface'), 'Home must not expose a JavaScript bridge');
assert(home.includes('MobileNavigation.isWebUrl(value)'), 'Home favorites must share strict URL and IDN validation');
assert(home.includes('if (showFavorites) appendFavorites'));
assert(home.includes('if (showRecentSearches) appendRecentSearches'));
assert(home.includes('privateSession || favorites == null'), 'Private home must discard normal favorites');
assert(home.includes('privateSession || recentSearches == null'), 'Private home must discard normal searches');

const privateBranch = panel.slice(panel.indexOf('if (privateSession)'), panel.indexOf('int searchRows'));
assert(!privateBranch.includes('store.'), 'Private suggestions must return before reading normal profile storage');
assert(!/setTimeout|setInterval|Thread\.sleep/.test(activity + panel + updateController), 'Mobile browser UI must be event-driven');

console.log('PASS: Android mobile home, profile, suggestions, persistence and private isolation are wired.');
