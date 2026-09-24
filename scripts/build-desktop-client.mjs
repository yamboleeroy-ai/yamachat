import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {withProfileActions} from './profile-actions.mjs';
import {withPasswordRecovery} from './password-recovery.mjs';
import {withAccountMessages} from './account-messages.mjs';
import {withActiveServerContext} from './active-server-context.mjs';
const root=path.resolve(import.meta.dirname,'..'),ref=path.join(root,'reference/desktop-1.0.78');
for(const [file,hash] of Object.entries(JSON.parse(fs.readFileSync(path.join(ref,'SHA256.json'),'utf8')))){
  if(crypto.createHash('sha256').update(fs.readFileSync(path.join(ref,file))).digest('hex')!==hash)throw Error('Desktop reference changed: '+file);
}
const out=path.join(root,'desktop-client-dist');fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'desktop-client.html'),withActiveServerContext(withAccountMessages(withPasswordRecovery(withProfileActions(fs.readFileSync(path.join(ref,'desktop-client.html'),'utf8'))))));
console.log('Generated desktop client: desktop-client-dist/desktop-client.html (requires the existing complete desktop runtime to package).');
