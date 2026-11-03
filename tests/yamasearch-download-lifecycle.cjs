const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('products/yamasearch/MainWindow.xaml.cs', 'utf8');
const hookStart = source.indexOf('core.DownloadStarting +=');
const hookEnd = source.indexOf('\n    }', hookStart);
assert.ok(hookStart >= 0 && hookEnd > hookStart, 'download hook must be present');
const hook = source.slice(hookStart, hookEnd);

assert.match(hook, /try \{ tab\.Owner\?\.HandleDownloadStarting\(e\); \}/,
  'download start bookkeeping must have an exception boundary');
assert.match(source, /private void QueueDownloadEntryUpdate\(/,
  'progress callbacks must be marshalled through the safe update path');
assert.match(source, /Dispatcher\.HasShutdownStarted/,
  'download callbacks must not target a closing dispatcher');
assert.match(source, /private void TryUpdateDownloadEntry\(/,
  'an invalidated WebView2 download operation must be contained');
assert.match(source, /private void TrySaveDownloadHistory\(/,
  'profile write failure must not abort a download');
assert.doesNotMatch(source, /BytesReceivedChanged \+= \(_, _\) => Dispatcher\.BeginInvoke\(\(\) => UpdateDownloadEntry/,
  'raw progress callbacks must not escape onto the WPF dispatcher');

console.log('YamaSearch download lifecycle contract verified.');
