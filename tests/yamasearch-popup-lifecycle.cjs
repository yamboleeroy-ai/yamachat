const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('products/yamasearch/MainWindow.xaml.cs', 'utf8');
const start = source.indexOf('private async Task HandleNewWindowRequestedAsync');
const end = source.indexOf('private static async Task InstallTabTitleWatcherAsync', start);
assert.ok(start >= 0 && end > start, 'popup handler must be present');

const handler = source.slice(start, end);
assert.match(handler, /CoreWebView2Deferral\? deferral = null/, 'deferral acquisition must be inside protected flow');
assert.match(handler, /catch \(Exception exception\)/, 'popup races must be contained');
assert.match(handler, /_tabs\.Remove\(popupTab\)/, 'an unattached popup tab must be rolled back');
assert.match(handler, /try \{ deferral\?\.Complete\(\); \}/, 'invalidated deferral completion must not crash WPF');
assert.match(handler, /SelectTab\(previousActiveTab\)/, 'failed popup must restore the originating tab');
assert.match(source, /new BrowserTab \{ IsScriptPopup = isScriptPopup \}/, 'popup identity must be explicit');
assert.match(source, /!tab\.IsScriptPopup/, 'window.close must be ignored for normal tabs');
assert.match(source, /action: 'closeScriptPopup'/, 'script popup close must be bridged to the host');
assert.match(source, /tab\.IsScriptPopup && _tabs\.Contains\(tab\)/, 'only a tracked popup may request tab closure');
const closeStart = source.indexOf('private void CloseTab(BrowserTab tab)');
const closeEnd = source.indexOf('private void CloseOtherTabs', closeStart);
const closeHandler = source.slice(closeStart, closeEnd);
assert.ok(closeHandler.indexOf('SelectTab(') < closeHandler.indexOf('DisposeBrowserTab(tab)'), 'active popup must detach before WebView disposal');

console.log('YamaSearch popup lifecycle contract verified.');
