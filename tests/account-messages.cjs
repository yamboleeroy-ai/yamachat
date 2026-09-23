const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
for(const target of ['index.html','desktop-client-dist/desktop-client.html']){
  const html=fs.readFileSync(path.join(root,target),'utf8');
  for(const marker of [
    "from('account_messages')",
    'window.ycOpenAccountInbox=ycOpenAccountInbox',
    'window.ycOpenPlatformUsers=ycOpenPlatformUsers',
    'data-yc-account-read',
    'recipient_user_id:p.id',
    'created_by:user.id',
    '👤 Uživatelé'
  ]) assert(html.includes(marker),target+' missing '+marker);
}
console.log('PASS: admin account messages are present in generated web and desktop clients.');
