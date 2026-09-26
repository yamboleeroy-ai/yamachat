import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {withStreamViewer} from './stream-viewer.mjs';

// Desktop has a separate release lineage from main. Use the verified 1.0.96
// client, never regenerate it from the historic web/mobile reference.
export const desktopBaseline='653d01fb81fd5410908bcb3a3aedc2d9eb7859c0';
const root=path.resolve(import.meta.dirname,'..');
const source=execFileSync('git',['show',desktopBaseline+':desktop/desktop-client.html'],{cwd:root,encoding:'utf8',maxBuffer:20e6});
const out=path.join(root,'desktop-client-dist');fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'desktop-client.html'),withStreamViewer(source,{desktop:true}));
console.log('Generated local desktop test client from Windows 1.0.96; no packaging or publishing.');
