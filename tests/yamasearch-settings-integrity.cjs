const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('products/yamasearch/MainWindow.xaml.cs', 'utf8');
const start = source.indexOf('public sealed class SettingsStore');
assert.ok(start >= 0, 'SettingsStore must exist');
const store = source.slice(start);

assert.match(store, /private static AppData\? SharedData/,
  'all windows in one process must share one settings model');
assert.match(store, /lock \(Sync\)/,
  'settings load and save must be serialized');
assert.match(store, /TryLoad\(_path\) \?\? TryLoad\(BackupPath\)/,
  'a damaged primary settings file must recover from its backup');
assert.match(store, /File\.WriteAllText\(temporary/,
  'settings must be written to a temporary file first');
assert.match(store, /File\.Replace\(temporary, _path, BackupPath/,
  'an existing profile must be replaced atomically with a backup');
assert.doesNotMatch(store, /File\.WriteAllText\(_path/,
  'settings must never be truncated in place');

console.log('YamaSearch shared and atomic settings contracts verified.');
