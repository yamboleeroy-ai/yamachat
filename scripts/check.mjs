import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import './build-web.mjs';
const root=path.resolve(import.meta.dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'yamachat-check-'));
let count=0;
try{
 for(const file of ['index.html',...(fs.existsSync(path.join(root,'mobile/www/index.html'))?['mobile/www/index.html']:[])]){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  for(const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){
   if(!match[2].trim())continue;
   const target=path.join(tmp,String(count++)+(match[1].includes('module')?'.mjs':'.js'));fs.writeFileSync(target,match[2]);
   const result=spawnSync(process.execPath,['--check',target],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  }
  for(const match of html.matchAll(/<script[^>]+src="\.\/([^"]+)"/g))assert(fs.existsSync(path.join(path.dirname(path.join(root,file)),match[1])),`Missing script ${match[1]}`);
  assert(!html.includes('https://esm.sh/'),'Remote runtime dependency');
  for(const marker of ['SUPABASE_URL','SUPABASE_KEY']){
   const ref=fs.readFileSync(path.join(root,'reference/desktop-1.0.78/desktop-client.html'),'utf8');
   const re=new RegExp('const '+marker+'=([^\\n]+)');assert(ref.match(re),`Missing ${marker}`);assert.deepEqual(html.match(re)?.[1],ref.match(re)?.[1]);
  }
 }
 const nativePatchSource=fs.readFileSync(path.join(root,'mobile/scripts/patch-native.mjs'),'utf8');
 const registerAt=nativePatchSource.indexOf('registerPlugin(YamachatUpdatePlugin.class);');
 const superAt=nativePatchSource.indexOf('super.onCreate(savedInstanceState);', registerAt);
 assert(registerAt>=0 && superAt>registerAt, 'Android YamachatUpdate plugin must be registered before BridgeActivity super.onCreate()');
 const nativeBridgeSource=fs.readFileSync(path.join(root,'mobile/src/native-bridge.ts'),'utf8');
 for(const marker of [
   'ycNativeSettingsUpdateCheck',
   'ZKONTROLOVAT AKTUALIZACE',
   'window.ycNativeCheckForUpdates = checkNativeUpdate',
   'https://yamachat.eu/update-manifest.json',
   "id: 'updates'"
 ]) assert(nativeBridgeSource.includes(marker),`Missing Android update-settings marker: ${marker}`);
 const generatedWeb=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert(generatedWeb.includes('ycServerContextFrame'), 'Generated client is missing connected active-server context visual');
 assert(generatedWeb.includes('function drawFrame()'), 'Generated client is missing the visual-only server context synchronizer');
 assert(generatedWeb.includes('pointer-events:none!important'), 'Server context visual must never block pointer interaction');
 assert(generatedWeb.includes('.yc-context-line{stroke-width:1'), 'Server frame must keep a thin one-pixel contour');
 for(const forbidden of ['ycActiveServerConnectedFrame','__ycActiveServerContextV2','yc-active-server-context-card','ycActiveServerGlobalContext']){
   assert(!generatedWeb.includes(forbidden),'Generated client contains old active-server runtime: '+forbidden);
 }
 assert(generatedWeb.includes("document.querySelectorAll('#rail [data-community]').forEach(b=>b.classList.remove('active'))"), 'Friends/DM mode must clear active server selection');
 assert(generatedWeb.includes('window.YamachatAppSettings={register:ycRegisterAppSettingsSection,open:ycOpenAppSettings'), 'Generated client is missing YamachatAppSettings registry');
 for(const marker of ['ycServerCardContextStyle','ycOpenServerCardInfo','ycServerCardCanManage',"addEventListener('contextmenu'","addEventListener('pointerdown'",'data-yc-server-card-menu'])
   assert(generatedWeb.includes(marker),'Server card context menu missing: '+marker);
 assert(generatedWeb.includes("await ycLeaveCommunity(c.id,false)"),'Server-card leave must reuse existing leave logic');
 assert(generatedWeb.includes("window.ycOpenServerSettings()"),'Server-card settings must reuse existing server settings');
 console.log('PASS: Android manual update-check section is registered and wired to the shared update manifest.');
 const mobileCss=fs.readFileSync(path.join(root,'web/mobile.css'),'utf8');
 for(const marker of [
   'html.yc-native-ios .yc-ss-nav',
   'touch-action:pan-x!important',
   'html.yc-native-ios:not(.yc-keyboard-open) .yc-v3-voice-host',
   'top:4px!important'
 ]) assert(mobileCss.includes(marker),`Missing iOS mobile layout marker: ${marker}`);
 const mobileJs=fs.readFileSync(path.join(root,'web/mobile.js'),'utf8');
 assert(mobileJs.includes("document.documentElement.classList.toggle('yc-ios-pwa',iosPwa)"), 'iOS PWA class detection missing');
 const mobileCssPwa=fs.readFileSync(path.join(root,'web/mobile.css'),'utf8');
 for(const marker of [
   'html.yc-ios-pwa .yc-ss-nav',
   'html.yc-ios-pwa .yc-ss-tab',
   'overflow-x:auto!important',
   'html.yc-ios-pwa .yc-ss-body'
 ]) assert(mobileCssPwa.includes(marker),`Missing iOS PWA layout marker: ${marker}`);
 const webIntegration=fs.readFileSync(path.join(root,'web/integration.js'),'utf8');
 for(const marker of [
   "YC_IOS_VOICE_RESUME_KEY='yc_ios_voice_resume_v1'",
   "ycWebIsIosPwa",
   "ycIosVoiceReconnect('visibility')",
   "ycOnLifecycle('community'",
   "leaveVoiceChannel(true)",
   "await joinVoiceChannel(channel)"
 ]) assert(webIntegration.includes(marker),`Missing iOS PWA voice reconnect marker: ${marker}`);
 console.log(`PASS: ${count} scripts parse; desktop SHA-256 and backend constants preserved; runtime assets present.`);
 const recoveryScript=path.join(root,'build/password-recovery.js');
 assert.equal(spawnSync(process.execPath,['--check',recoveryScript],{encoding:'utf8'}).status,0,'Recovery script must parse');
 assert(fs.readFileSync(path.join(root,'reset-password.html'),'utf8').includes('name="referrer" content="no-referrer"'));
 assert(fs.readFileSync(path.join(root,'email/recovery.html'),'utf8').includes('{{ .TokenHash }}'));
 const passwordRequestSource=fs.readFileSync(path.join(root,'web/password-request.js'),'utf8');
 assert.equal(spawnSync(process.execPath,['--check',path.join(root,'web/password-request.js')],{encoding:'utf8'}).status,0,'In-app password request script must parse');
 for(const marker of ['ycPasswordRequestBack','ycPasswordRequestEmail','Odeslat odkaz',"sb.auth.resetPasswordForEmail(email","redirectTo:'https://yamachat.eu/reset-password.html'"]) assert(generatedWeb.includes(marker),'Generated web missing in-app password request: '+marker);
 assert(!generatedWeb.includes('id="ycForgotPassword" href="https://yamachat.eu/reset-password.html" target="_blank"'),'Forgot-password request must not leave the app');
 const accountMessagesSource=fs.readFileSync(path.join(root,'web/account-messages.js'),'utf8');
 assert.equal(spawnSync(process.execPath,['--check',path.join(root,'web/account-messages.js')],{encoding:'utf8'}).status,0,'Account messages script must parse');
 for(const marker of ["from('account_messages')",'window.ycOpenAccountInbox=ycOpenAccountInbox','window.ycOpenPlatformUsers=ycOpenPlatformUsers','created_by:user.id',"YC_ADMIN_USERS_FUNCTION='yamachat-snapshot-v11'","action:'ban'","action:'unban'","action:'self-status'"]) assert(accountMessagesSource.includes(marker),'Missing account/admin marker: '+marker);
 for(const marker of ['📨 Zprávy od Yamachatu','Platform Admin · uživatelské účty','Poslední přihlášení:',"from('account_messages')"]) assert(generatedWeb.includes(marker),'Generated web missing account/admin marker: '+marker);
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
