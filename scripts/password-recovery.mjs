import fs from 'node:fs';

const read=name=>fs.readFileSync(new URL('../web/'+name,import.meta.url),'utf8');
export function withPasswordRecovery(html){
  const boundary='<div id="authMsg" class="msgline"></div>\n    </form>';
  if(!html.includes(boundary))throw Error('Missing login form boundary');
  const moduleBoundary="const $=(id)=>document.getElementById(id)";
  if(!html.includes(moduleBoundary))throw Error('Missing password request module boundary');
  html=html.replace(
    boundary,
    boundary+'\n    <button id="ycForgotPassword" type="button" style="display:block;width:100%;border:0;background:transparent;text-align:center;margin-top:14px;font-size:13px;color:inherit;cursor:pointer">Zapomenuté heslo?</button>\n'+read('password-request.html')
  );
  html=html.replace(
    moduleBoundary,
    moduleBoundary+'\n'+read('password-request.js')
  );
  return html.replace(
    '</head>',
    '<style id="ycPasswordRequestStyle">'+read('password-request.css')+'</style>\n</head>'
  );
}
export function buildPasswordRecovery(reference,root){
  const url=reference.match(/const SUPABASE_URL='([^']+)'/)?.[1];
  const key=reference.match(/const SUPABASE_KEY='([^']+)'/)?.[1];
  if(!url||!key)throw Error('Missing public Supabase configuration');
  const script=read('password-recovery.js').replace('__PUBLIC_SUPABASE_URL__',JSON.stringify(url)).replace('__PUBLIC_SUPABASE_KEY__',JSON.stringify(key));
  fs.writeFileSync(new URL('../build/password-recovery.js',import.meta.url),script);
  fs.writeFileSync(new URL('../reset-password.html',import.meta.url),read('password-recovery.html').replace('__AUTH_ORIGIN__',new URL(url).origin));
}
