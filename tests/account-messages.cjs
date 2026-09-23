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
    "YC_ADMIN_USERS_FUNCTION='yamachat-snapshot-v11'",
    "action:'ban'",
    "action:'unban'",
    "action:'self-status'",
    'Platform Admin · uživatelské účty',
    'Poslední přihlášení:',
    'Zabanovat účet'
  ]) assert(html.includes(marker),target+' missing '+marker);
}
const source=fs.readFileSync(path.join(root,'web/account-messages.js'),'utf8');
for(const marker of [
  "sb.functions.invoke(YC_ADMIN_USERS_FUNCTION",
  "duration:'permanent'",
  "setInterval(()=>void ycCheckOwnBanStatus(),60000)"
]) assert(source.includes(marker),'source missing '+marker);
console.log('PASS: account inbox and Platform Admin user moderation are present in web and desktop clients.');
