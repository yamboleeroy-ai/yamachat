const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('products/yamasearch/MainWindow.xaml.cs', 'utf8');

assert.match(source, /core\.ProcessFailed \+=/,
  'WebView2 process failures must be isolated to the affected tab');
assert.match(source, /HandleWebViewProcessFailure\(tab, failureKind\)/,
  'process failures must use the guarded recovery path');
assert.match(source, /LastProcessRecoveryAt < TimeSpan\.FromSeconds\(15\)/,
  'renderer recovery must be rate limited');
assert.match(source, /private void QueueHistorySave\(\)/,
  'history persistence must be coalesced away from navigation completion');
const addHistoryStart = source.indexOf('private void AddHistory(');
const queueHistoryStart = source.indexOf('private void QueueHistorySave(', addHistoryStart);
assert.ok(addHistoryStart >= 0 && queueHistoryStart > addHistoryStart, 'history methods must be present');
const addHistory = source.slice(addHistoryStart, queueHistoryStart);
assert.doesNotMatch(addHistory, /_settings\.Save\(\)/,
  'navigation completion must not synchronously rewrite the whole profile');
assert.doesNotMatch(source, /HistoryChanged \+= \(_, _\) =>[^\n]*Dispatcher\.Invoke/,
  'history updates must not synchronously block WebView2 callbacks');

console.log('YamaSearch resilience and performance contract verified.');
