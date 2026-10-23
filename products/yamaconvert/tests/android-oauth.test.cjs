const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const manifest=fs.readFileSync(path.join(root,'android/app/src/main/AndroidManifest.xml'),'utf8');
const activity=fs.readFileSync(path.join(root,'android/app/src/main/java/eu/yamachat/yamaconvert/YamaConvertActivity.java'),'utf8');

test('Android app accepts only the dedicated Yamaconvert OAuth deep link',()=>{
  assert.match(manifest,/android:launchMode="singleTask"/);
  assert.match(manifest,/<action android:name="android\.intent\.action\.VIEW"\s*\/>[\s\S]*?<category android:name="android\.intent\.category\.BROWSABLE"\s*\/>[\s\S]*?<data android:scheme="yamaconvert" android:host="auth-callback"\s*\/>/);
  assert.match(activity,/OAUTH_SCHEME\.equals\(uri\.getScheme\(\)\)/);
  assert.match(activity,/OAUTH_HOST\.equals\(uri\.getHost\(\)\)/);
  assert.match(activity,/yamaconvert-oauth-callback/);
});

test('OAuth callback validation rejects duplicate codes, tokens, fragments and oversized URLs',()=>{
  assert.match(activity,/uri\.getFragment\(\) != null/);
  assert.match(activity,/uri\.toString\(\)\.length\(\) > 4096/);
  const allowlist=activity.match(/!Set\.of\(([^)]*)\)\.contains\(key\)/)?.[1]||'';
  assert.match(activity,/getQueryParameterNames\(\)/);
  assert.match(allowlist,/"code"/);assert.match(allowlist,/"error"/);
  assert.doesNotMatch(allowlist,/access_token|refresh_token|token_hash/);
  assert.match(activity,/codes\.size\(\) == 1/);assert.match(activity,/errors\.size\(\) == 1/);
});

