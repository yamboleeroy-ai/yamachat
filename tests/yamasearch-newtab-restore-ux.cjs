const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('products/yamasearch/MainWindow.xaml.cs', 'utf8');
const xaml = fs.readFileSync('products/yamasearch/MainWindow.xaml', 'utf8');

assert.match(source, /var focusAddressBar = address is null && !deferNavigationToNewWindow && !isScriptPopup;/,
  'ordinary new tabs must request address-bar focus');
assert.match(source, /DispatcherPriority\.Input[\s\S]*?AddressBox\.Focus\(\);[\s\S]*?Keyboard\.Focus\(AddressBox\);[\s\S]*?AddressBox\.SelectAll\(\);/,
  'new-tab focus must be applied after WebView initialization at input priority');
assert.match(source, /TabsScroller\.Visibility = Visibility\.Hidden;[\s\S]*?BrowserHost\.Visibility = Visibility\.Hidden;/,
  'session WebViews and tabs must stay hidden while they are restored');
assert.match(source, /finally \{ CompleteSessionRestorePresentation\(\); \}/,
  'session UI must be revealed even if one restore operation fails');
assert.match(source, /TabsScroller\.Visibility = Visibility\.Visible;[\s\S]*?BrowserHost\.Visibility = Visibility\.Visible;/,
  'the restored session must be revealed atomically');
assert.match(xaml, /<Grid x:Name="ShellRoot">/,
  'the browser shell remains an explicit stable visual root');

console.log('YamaSearch new-tab focus and restore presentation contracts verified.');
