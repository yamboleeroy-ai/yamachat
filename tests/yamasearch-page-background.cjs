const assert = require('node:assert/strict');
const fs = require('node:fs');

const main = fs.readFileSync('products/yamasearch/MainWindow.xaml.cs', 'utf8');

assert.match(
  main,
  /public WebView2 View \{ get; \} = new\(\) \{ DefaultBackgroundColor = System\.Drawing\.Color\.White \};/,
  'web content must use the normal white Chromium canvas for transparent pages',
);
assert.doesNotMatch(
  main,
  /DefaultBackgroundColor\s*=\s*System\.Drawing\.Color\.FromArgb\(0x0B,\s*0x10,\s*0x1A\)/,
  'the dark YamaSearch shell color must not leak through transparent web pages',
);
assert.doesNotMatch(
  main,
  /--force-dark-mode|--enable-force-dark/,
  'YamaSearch must not force dark mode on websites',
);

console.log('YamaSearch web page background contract verified.');
