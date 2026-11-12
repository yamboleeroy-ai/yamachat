const assert = require('node:assert/strict');
const fs = require('node:fs');

const main = fs.readFileSync('products/yamasearch/MainWindow.xaml.cs', 'utf8');
const settings = fs.readFileSync('products/yamasearch/SettingsWindow.xaml.cs', 'utf8');
const settingsView = fs.readFileSync('products/yamasearch/SettingsWindow.xaml', 'utf8');

assert.match(main, /RestorePreviousSessionAsync\(\)/, 'startup must have a session restore path');
assert.match(main, /SavePreviousSessionSnapshot\(\)/, 'window close must save the opted-in session');
assert.match(main, /Closed \+= \(_, _\) =>[\s\S]{0,300}CleanupWindowWebViews\(\)/,
  'every normal and private window must deterministically dispose remaining WebViews');
assert.doesNotMatch(main, /Closed \+= \(_, _\) => CleanupPrivateWebData\(\)/,
  'WebView cleanup must not be private-window-only');
assert.match(main, /try \{ SavePreviousSessionSnapshot\(\); \}[\s\S]{0,140}catch/,
  'a profile write failure must not abort window shutdown');
assert.match(main, /!tab\.IsScriptPopup/, 'script/payment popups must not enter session restore data');
assert.match(main, /_isPrivateWindow \|\| _siteAppMode/, 'private and installed-app windows must not persist sessions');
assert.match(main, /LastSessionActiveIndex/, 'the selected tab must be restored');
assert.match(settingsView, /x:Name="RestorePreviousSession"/, 'settings must expose the session option');
assert.match(settings, /RestorePreviousSession\.IsChecked/, 'settings must load and save the session option');

const fullscreenStart = main.indexOf('core.ContainsFullScreenElementChanged');
const fullscreenEnd = main.indexOf('core.SourceChanged', fullscreenStart);
const fullscreenEvent = main.slice(fullscreenStart, fullscreenEnd);
assert.match(fullscreenEvent, /Dispatcher\.BeginInvoke/, 'fullscreen callback must not synchronously re-enter WebView2');
assert.match(fullscreenEvent, /ReferenceEquals\(owner\._active, tab\)/, 'only the visible tab may change window fullscreen');
assert.match(fullscreenEvent, /var containsFullScreenElement = core\.ContainsFullScreenElement[\s\S]*SetVideoFullScreen\(containsFullScreenElement\)/, 'fullscreen state must be captured before dispatching to avoid transition races');
assert.match(main, /BrowserHost\.UpdateLayout\(\)/, 'fullscreen must immediately resize the browser host');
assert.match(main, /if \(!ReferenceEquals\(_active, tab\) && _videoFullScreen\)\s*SetVideoFullScreen\(false\)/, 'switching tabs must leave stale fullscreen');
const reassertStart = main.indexOf('private async Task ReassertVideoFullscreenAsync');
const reassertEnd = main.indexOf('private void ApplyMonitorBounds', reassertStart);
assert.doesNotMatch(main.slice(reassertStart, reassertEnd), /\bActivate\(\)/, 'fullscreen reassertion must not steal focus from iframe video players');
const applyBoundsStart = main.indexOf('private void ApplyMonitorBounds');
const applyBoundsEnd = main.indexOf('private void SetWindowTopmostState', applyBoundsStart);
const applyBounds = main.slice(applyBoundsStart, applyBoundsEnd);
assert.match(applyBounds, /var flags = SwpFrameChanged \| SwpShowWindow \| SwpNoActivate/, 'native fullscreen resizing must never activate the parent window');
assert.doesNotMatch(applyBounds, /BringWindowToTop|SetForegroundWindow|SetActiveWindow/, 'fullscreen bounds updates must not steal focus from WebView2');
assert.match(main, /InstallFullscreenVideoControlsBridgeAsync\(tab\)/, 'every WebView must install the fullscreen video controls bridge');
assert.match(main, /\.video-js:fullscreen \.vjs-control-bar/, 'Video.js fullscreen controls must remain visible even when pointer activity is not forwarded');
assert.match(main, /\.video-js\.vjs-fullscreen \.vjs-control-bar/, 'Video.js class-based fullscreen mode must keep controls visible');
assert.match(main, /document\.addEventListener\('fullscreenchange', syncFullscreenState/, 'fullscreen changes must refresh the stable control visibility marker');
assert.match(main, /classList\.toggle\([\s\S]*'yama-video-fullscreen'/, 'fullscreen state must keep a stable document-level control visibility marker');
assert.match(main, /visibility: visible !important;[\s\S]*opacity: 1 !important;/, 'fullscreen Video.js controls must be visibly rendered');

console.log('YamaSearch session restore and fullscreen contracts verified.');
