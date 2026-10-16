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
assert(!/setTimeout|setInterval/.test(activity + panel), 'Mobile browser UI must be event-driven');

console.log('PASS: Android mobile home, profile, suggestions, persistence and private isolation are wired.');
