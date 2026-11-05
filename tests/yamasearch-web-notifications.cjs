const assert = require('node:assert/strict');
const fs = require('node:fs');

const main = fs.readFileSync('products/yamasearch/MainWindow.xaml.cs', 'utf8');
const toast = fs.readFileSync('products/yamasearch/WindowsToastService.cs', 'utf8');

assert.match(main, /currentCount > \(previousCount \?\? 0\)/,
  'title fallback must fire only when the site-provided unread count increases');
assert.match(main, /hadObservedNotificationState/,
  'the first title after navigation must establish a baseline without a stale toast');
assert.match(main, /!ReferenceEquals\(tab, _active\)/,
  'a visible tab must not create a redundant unread-count toast');
assert.match(main, /IsNotificationExplicitlyDenied\(tab\)/,
  'an explicit site-level notification denial must be respected');
assert.match(main, /WindowsToastService\.TryShowUnreadCount/,
  'persistent/service-worker notification fallback must reach Windows');
assert.doesNotMatch(main, /(?:Contains|Equals|EndsWith)\s*\(\s*["'](?:facebook|gmail|messenger|whatsapp|discord|twitch)/i,
  'notification fallback must not be hard-coded to individual sites');

assert.match(toast, /A web notification tag means replace, not suppress/,
  'reused web notification tags must replace the previous toast');
assert.match(toast, /Show\(builder, taggedKey\)/,
  'tagged notifications must use a stable Windows replacement identity');
assert.match(toast, /SHA256\.HashData/,
  'arbitrary web tags must be normalized to a safe Windows toast tag');
assert.match(toast, /CoreWebView2Notification\? Notification/,
  'title-count fallback routes must not require a synthetic WebView notification');

console.log('YamaSearch generic web notification contracts verified.');
