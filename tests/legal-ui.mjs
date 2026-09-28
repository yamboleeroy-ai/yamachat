import fs from 'node:fs';
import assert from 'node:assert/strict';
import {withLegalUi} from '../scripts/legal-ui.mjs';

const desktop=fs.readFileSync(new URL('../desktop/desktop-client.html',import.meta.url),'utf8');
const generated=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

function verify(html,label){
  assert.match(html,/id="ycLegalAboutBtn" class="yc-v3-nav-btn yc-legal-nav-entry"[^>]*>[\s\S]*?<span>O aplikaci<\/span><\/button>/,label+': About must be a full navigation item');
  assert.ok(html.indexOf('id="ycLegalAboutBtn"')<html.indexOf('id="logoutBtn"'),label+': About must be before logout');
  assert.ok(html.includes("['profileBtn','appSettingsBtn','ycLegalAboutBtn','logoutBtn']"),label+': About must mount directly above logout in global/mobile navigation');
  assert.ok(html.includes("['ycLegalAboutBtn','ⓘ','O aplikaci']"),label+': About must be registered in the final Atlas nav actions');
  assert.match(html,/data-yc-auth-legal="terms"[^>]*>Podmínky<\/button>/,label+': missing Terms link');
  assert.match(html,/data-yc-auth-legal="privacy"[^>]*>Soukromí<\/button>/,label+': missing Privacy link');
  assert.ok(!html.includes('<small>Věk</small><strong>33 let</strong>'),label+': developer age still present');
  assert.match(html,/id="ycDevLegalOpen"[^>]*>Zobrazit právní informace<\/button>/,label+': missing developer legal card');
  assert.ok(html.includes('Yamachat — proprietární projekt'),label+': proprietary project label missing');
  assert.ok(html.includes('© 2026 Lukáš Hubáček. Všechna práva vyhrazena.'),label+': copyright footer missing');
  assert.ok(html.includes('legal-baseline-2026-09-27'),label+': legal baseline tag missing');
  assert.ok(html.includes('Digitálně podepsaná právní baseline – podpis ověřen'),label+': verified signature wording missing');
  assert.ok(html.includes("Nejde o právní certifikaci ani právní ověření obsahu."),label+': signature limitation missing');
  assert.ok(html.includes('class="yc-legal-links-grid"'),label+': About legal document cards missing');
  assert.ok(html.includes('class="yc-legal-signature"'),label+': signature status card missing');
  assert.ok(html.includes('(max-width:1100px) and (max-height:560px)'),label+': phone-landscape legal layout missing');
  assert.ok(html.includes('env(safe-area-inset-bottom)'),label+': legal safe-area support missing');
  assert.ok(html.includes("id='ycLegalPortal'")||html.includes("r.id='ycLegalPortal'"),label+': legal dialog must use body-level portal for login access');
  assert.ok(html.includes("{id:'terms',label:'Podmínky používání',icon:'§',doc:'terms'}"),label+': Terms must be final document');
  assert.ok(html.includes("{id:'privacy',label:'Ochrana osobních údajů',icon:'◈',doc:'privacy'}"),label+': Privacy must be final document');
  for(const file of ['LICENSE','TERMS_OF_USE.md','PRIVACY_POLICY.md','THIRD_PARTY_NOTICES.md','BRAND-NOTICE.md','PROVENANCE.md','ASSET-MANIFEST.md','LEGAL-BASELINE.md']){
    assert.ok(html.includes(file),label+': legal source missing '+file);
  }
  assert.ok(html.includes('TERMS_OF_USE.md'),label+': Terms source label missing');
  assert.ok(html.includes('PRIVACY_POLICY.md'),label+': Privacy source label missing');
  assert.ok(!html.includes("label:'Podmínky používání',icon:'§',pending:true"),label+': Terms still marked pending');
  assert.ok(!html.includes("label:'Ochrana osobních údajů',icon:'◈',pending:true"),label+': Privacy still marked pending');
  assert.ok(!html.includes('®'),label+': registered trademark symbol must not be introduced by legal UI');
}

verify(desktop,'desktop');
verify(generated,'generated web/mobile');

const again=withLegalUi(generated);
assert.equal(again,generated,'legal transform must be idempotent');

const ordered=['O aplikaci','Podmínky používání','Ochrana osobních údajů','Licence třetích stran','Informace o značce Yamachat','Původ projektu a assetů','Právní baseline'];
let last=-1;
for(const label of ordered){const pos=generated.indexOf("label:'"+label+"'");assert.ok(pos>last,'section order invalid at '+label);last=pos}

console.log('Legal UI checks passed for Windows and generated Web/PWA/Capacitor client.');
