const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');

for(const file of ['desktop/desktop-client.html','index.html']){
  const html=fs.readFileSync(path.join(root,file),'utf8');

  const prepareStart=html.indexOf('async function ycPrepareExplicitAuthExit()');
  const prepareEnd=html.indexOf("$('logoutBtn').onclick",prepareStart);
  assert(prepareStart>=0&&prepareEnd>prepareStart,file+' explicit auth-exit cleanup missing');
  const prepare=html.slice(prepareStart,prepareEnd);
  assert(prepare.includes('await leaveVoiceChannel(true)'),file+' logout cleanup must await voice leave');
  assert(prepare.includes('await stopScreenShare(true)'),file+' logout cleanup must await direct stream stop');
  assert(prepare.includes('await ycStopGlobalStreamPresence(uid)'),file+' logout cleanup must await stream-presence deletion');
  assert(prepare.includes('await ycStopCommunityStreamWatch()'),file+' logout cleanup must stop stream watch before signout');

  const logoutStart=html.indexOf("$('logoutBtn').onclick",prepareEnd);
  const logoutEnd=html.indexOf('\n',logoutStart);
  const logout=html.slice(logoutStart,logoutEnd>logoutStart?logoutEnd:logoutStart+400);
  const cleanupAt=logout.indexOf('await ycPrepareExplicitAuthExit()');
  const signoutAt=logout.indexOf('await sb.auth.signOut()');
  assert(cleanupAt>=0&&signoutAt>cleanupAt,file+' logout must finish network cleanup before signOut');

  const banNeedle="await ycPrepareExplicitAuthExit();await sb.auth.signOut({scope:'local'})";
  assert(html.includes(banNeedle),file+' banned-account exit must cleanup before local signOut');

  assert(html.includes("ycStreamPresenceClearedUserId=''"),file+' stream cleanup idempotency state missing');
  const stopStart=html.indexOf('async function ycStopGlobalStreamPresence(');
  const stopEnd=html.indexOf('\n}',stopStart);
  assert(stopStart>=0&&stopEnd>stopStart,file+' global stream cleanup missing');
  const stop=html.slice(stopStart,stopEnd+2);
  assert(stop.includes('ycStreamPresenceClearedUserId!==uid'),file+' duplicate stream-presence DELETE guard missing');
  assert(stop.includes('if(!error)ycStreamPresenceClearedUserId=uid'),file+' successful stream cleanup must mark user cleared');

  const publishStart=html.indexOf('async function ycPublishStreamPresence(');
  const publishEnd=html.indexOf('async function ycStartGlobalStreamPresence()',publishStart);
  assert(publishStart>=0&&publishEnd>publishStart,file+' stream publish block missing');
  assert(html.slice(publishStart,publishEnd).includes("ycStreamPresenceClearedUserId=''"),file+' successful stream publish must reset cleanup marker');
}

console.log('PASS auth exit cleanup: voice/stream network cleanup finishes before signOut and stream-presence DELETE is idempotent on desktop and generated clients.');
