const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('products/yamasearch/MainWindow.xaml.cs', 'utf8');
const start = source.indexOf('private void RenderTabs()');
const end = source.indexOf('private void TabsScroller_SizeChanged', start);
assert.ok(start >= 0 && end > start, 'tab renderer must be present');
const render = source.slice(start, end);

assert.match(render, /Math\.Max\(54, Math\.Min\(104, usableWidth \/ _tabs\.Count\)\)/,
  'dense tabs must reserve a usable favicon and close-button footprint');
assert.match(render, /var titleWidth = Math\.Max\(0, tabWidth - horizontalPadding/,
  'the title must shrink around fixed controls');
assert.match(render, /Closing must never disappear merely because many tabs are open/,
  'the close button must live outside the non-compact-only branch');
assert.match(render, /Width = closeWidth[\s\S]*Height = 22[\s\S]*Padding = new Thickness\(0\)/,
  'the close button must keep a deterministic compact hit target');
assert.doesNotMatch(render, /if \(!compact\)[\s\S]{0,900}ToolTip = "Zavřít kartu"/,
  'the close button must not be conditional on wide mode');
assert.match(render, /Padding = compact \? new Thickness\(4, 6, 3, 6\)/,
  'compact tab padding must not consume the close-button space');

console.log('YamaSearch dense-tab close-button contract verified.');
