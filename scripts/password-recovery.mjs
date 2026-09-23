import fs from 'node:fs';

const read=name=>fs.readFileSync(new URL('../web/'+name,import.meta.url),'utf8');
export function withPasswordRecovery(html){
  const boundary='<div id="authMsg" class="msgline"></div>\n    </form>';
  if(!html.includes(boundary))throw Error('Missing login form boundary');
  return html.replace(boundary,boundary+'\n    <a id="ycForgotPassword" href="https://yamachat.eu/reset-password.html" target="_blank" rel="noopener noreferrer" style="display:block;text-align:center;margin-top:14px;font-size:13px;color:inherit">Zapomenuté heslo?</a>');
}
export function buildPasswordRecovery(reference,root){
  const url=reference.match(/const SUPABASE_URL='([^']+)'/)?.[1];
  const key=reference.match(/const SUPABASE_KEY='([^']+)'/)?.[1];
  if(!url||!key)throw Error('Missing public Supabase configuration');
  const script=read('password-recovery.js').replace('__PUBLIC_SUPABASE_URL__',JSON.stringify(url)).replace('__PUBLIC_SUPABASE_KEY__',JSON.stringify(key));
  fs.writeFileSync(new URL('../build/password-recovery.js',import.meta.url),script);
  fs.writeFileSync(new URL('../reset-password.html',import.meta.url),read('password-recovery.html').replace('__AUTH_ORIGIN__',new URL(url).origin));
}
