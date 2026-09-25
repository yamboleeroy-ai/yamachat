import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {withActiveServerGlow} from './thin-server-context.mjs';
const root=path.resolve(import.meta.dirname,'..');
const base=execFileSync('git',['show','ca7bc189da45a461cadbd970660a08ce90e55ee3:desktop/desktop-client.html'],{cwd:root,maxBuffer:8e6});
const normalized=base.toString('utf8').replace(/\r\n/g,'\n');
const hash=crypto.createHash('sha256').update(normalized).digest('hex');
const expected=fs.readFileSync(path.join(root,'scripts/desktop81-client.sha256'),'utf8').trim();
if(hash!==expected)throw Error('Verified desktop 1.0.81 client mismatch');
const client=withActiveServerGlow(normalized);
fs.writeFileSync(path.join(root,'desktop/desktop-client.html'),client);
console.log('Generated 1.0.89 visual-only client from verified desktop 1.0.81, SHA256 '+hash);

