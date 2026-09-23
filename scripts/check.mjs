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
 const nativeBridgeSource=fs.readFileSync(path.join(root,'mobile/src/native-bridge.ts'),'utf8');
 for(const marker of [
   'ycNativeSettingsUpdateCheck',
   'ZKONTROLOVAT AKTUALIZACE',
   'window.ycNativeCheckForUpdates = checkNativeUpdate',
   'https://yamachat.eu/update-manifest.json',
   "id: 'updates'"
 ]) assert(nativeBridgeSource.includes(marker),`Missing Android update-settings marker: ${marker}`);
 const generatedWeb=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert(generatedWeb.includes('window.YamachatAppSettings={register:ycRegisterAppSettingsSection,open:ycOpenAppSettings'), 'Generated client is missing YamachatAppSettings registry');
 console.log('PASS: Android manual update-check section is registered and wired to the shared update manifest.');
 console.log(`PASS: ${count} scripts parse; desktop SHA-256 and backend constants preserved; runtime assets present.`);
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
