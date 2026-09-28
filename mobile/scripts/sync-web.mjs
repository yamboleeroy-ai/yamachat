import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// Package the reviewed current client; never regenerate from historical references.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=path.join(root,'mobile/www');
fs.mkdirSync(out,{recursive:true});
// Do not package previous APKs or source archives.
for(const asset of ['icons','audio','vendor','build','boot-guard.js','favicon.ico'])fs.cpSync(path.join(root,asset),path.join(out,asset),{recursive:true});
const legalFiles=["LICENSE","TERMS_OF_USE.md","PRIVACY_POLICY.md","BRAND-NOTICE.md","PROVENANCE.md","THIRD_PARTY_NOTICES.md","LEGAL-BASELINE.md","ASSET-MANIFEST.md"];
const legalOut=path.join(out,'legal');
fs.mkdirSync(legalOut,{recursive:true});
for(const file of legalFiles)fs.copyFileSync(path.join(root,file),path.join(legalOut,file));
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
html=html.replace('<script src="./vendor/supabase.js"></script>','<script src="./native-bridge.js"></script>\n<script src="./vendor/supabase.js"></script>');
html=html.replace('<link rel="manifest" href="./manifest.webmanifest">','');
fs.writeFileSync(path.join(out,'index.html'),html);
console.log('Desktop-derived client and offline dependencies prepared for Capacitor.');
