const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
test('Android package uses its own app id and encrypted Supabase session store',()=>{
 const config=JSON.parse(fs.readFileSync(path.join(root,'capacitor.config.json'),'utf8'));
 assert.equal(config.appId,'eu.yamaportal.app');
 assert.equal(pkg.dependencies['@aparajita/capacitor-secure-storage'],'8.0.1');
 const bridge=fs.readFileSync(path.join(root,'src/native-bridge.ts'),'utf8');
 assert.match(bridge,/SecureStorage\.getItem/);assert.match(bridge,/eu\.yamaportal\.app:\/\/auth-callback/);
});
test('Android package copies the existing Portal rather than the Yamachat mobile source',()=>{
 const build=fs.readFileSync(path.join(root,'scripts/build-web.mjs'),'utf8');
 assert.match(build,/productRoot/); // The implementation intentionally derives the bundle from the Portal product.
 assert.match(build,/preview.*dist/);
 assert.doesNotMatch(build,/mobile\/src\/native-bridge/);
});
test('Android launcher only targets installed YamaSearch and returns without passing account data',()=>{
 const plugin=fs.readFileSync(path.join(root,'android','YamaAppLauncherPlugin.java'),'utf8');
 assert.match(plugin,/eu\.yamachat\.yamasearch\.mobile/);
 assert.match(plugin,/eu\.yamaportal\.app/);
 assert.match(plugin,/if \(!"search"\.equals\(id\)\)/);
 assert.doesNotMatch(plugin,/access_token|refresh_token|password/i);
 const patcher=fs.readFileSync(path.join(root,'scripts','patch-android.mjs'),'utf8');
 assert.match(patcher,/registerPlugin\(YamaAppLauncherPlugin\.class\)/);
 assert.match(patcher,/eu\.yamachat\.yamasearch\.mobile/);
});
test('YamaSearch exposes a return action only when Yamaportal is installed',()=>{
 const productRoot=path.resolve(root,'..','..','yamasearch');
 const manifest=fs.readFileSync(path.join(productRoot,'android','app','src','main','AndroidManifest.xml'),'utf8');
 const browser=fs.readFileSync(path.join(productRoot,'android','app','src','main','java','eu','yamachat','yamasearch','BrowserActivity.java'),'utf8');
 assert.match(manifest,/package android:name="eu\.yamaportal\.app"/);
 assert.match(browser,/Zpět do Yamaportalu/);
 assert.match(browser,/getLaunchIntentForPackage\("eu\.yamaportal\.app"\)/);
});
test('desktop-only controls are not injected into the Android Portal',()=>{
 const ui=fs.readFileSync(path.join(root,'..','preview','dist','native-ui.js'),'utf8');
 assert.match(ui,/platform==='windows'/);
 assert.match(ui,/platform==='android'/);
 assert.match(ui,/data-android-launch/);
});
