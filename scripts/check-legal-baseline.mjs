import fs from 'node:fs';

const legalFiles=[
  "LICENSE",
  "TERMS_OF_USE.md",
  "PRIVACY_POLICY.md",
  "BRAND-NOTICE.md",
  "PROVENANCE.md",
  "THIRD_PARTY_NOTICES.md",
  "LEGAL-BASELINE.md",
  "ASSET-MANIFEST.md"
];
const fail=(message)=>{throw new Error(message)};

for(const file of legalFiles){
  if(!fs.existsSync(file))fail('Missing legal baseline file: '+file);
}

const desktop=JSON.parse(fs.readFileSync('desktop/package.json','utf8'));
if(desktop.license!=='UNLICENSED')fail('Desktop package must be UNLICENSED');
if(desktop.private!==true)fail('Desktop package must be private');
if(!String(desktop.author||'').includes('Lukáš Hubáček'))fail('Desktop package owner metadata missing');
const filters=desktop?.build?.extraResources?.flatMap(x=>Array.isArray(x?.filter)?x.filter:[])||[];
for(const file of legalFiles)if(!filters.includes(file))fail('Desktop legal resource missing: '+file);

const mobile=JSON.parse(fs.readFileSync('mobile/package.json','utf8'));
if(mobile.license!=='UNLICENSED')fail('Mobile package must be UNLICENSED');
if(mobile.private!==true)fail('Mobile package must be private');
if(!String(mobile.author||'').includes('Lukáš Hubáček'))fail('Mobile package owner metadata missing');

const sync=fs.readFileSync('mobile/scripts/sync-web.mjs','utf8');
for(const file of legalFiles)if(!sync.includes(file))fail('Mobile legal packaging marker missing: '+file);

const workflow=fs.readFileSync('.github/workflows/web-check.yml','utf8');
for(const file of legalFiles)if(!workflow.includes(file))fail('Web legal packaging marker missing: '+file);

console.log('Yamachat proprietary legal baseline metadata and cross-platform packaging verified.');
