const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'products', 'yamasearch', 'AccountService.cs'),
  'utf8'
);

assert.match(source, /else\s*\{[\s\S]*EnsureBrowserAccountAsync\(token\.AccessToken, cancellationToken\)/,
  'The dedicated YamaSearch account must initialize its database profile after authentication.');
assert.match(source, /new Uri\(_config\.RestBaseUri, "rpc\/yamasearch_ensure_account"\)/,
  'Account initialization must use the authenticated Supabase RPC endpoint.');
assert.match(source, /request\.Content = JsonContent\.Create\(new \{ \}\)/,
  'The no-argument RPC must be invoked as a POST with a JSON body.');
assert.match(source, /catch \(Exception error\)[\s\S]*AccountDiagnostics\.Write\("ensure-browser-account", error\)/,
  'A temporarily paused backend must not invalidate the local signed-in session.');
assert.doesNotMatch(source, /Timer[^\n]*yamasearch_ensure_account|Task\.Delay[^\n]*yamasearch_ensure_account/,
  'Database activity must be tied to real account initialization, not a keep-alive timer.');

console.log('YamaSearch Supabase account activity contract passed.');
