const fs=require('node:fs'),assert=require('node:assert/strict');
const client=fs.readFileSync('desktop/desktop-client.html','utf8');
const pkg=require('../desktop/package.json');

assert.equal(pkg.version,'1.0.110','Windows release version');

for(const marker of [
  'YC_CONTEXT_LONGPRESS_SELECTOR',
  "from('notification_preferences')",
  "ycNotificationMenuItems('channel'",
  "ycNotificationMenuItems('server'",
  "ycNotificationMenuItems('user'",
  'ycShouldNotifyMessage',
  'ycMicTestVoiceHold',
  'function ycRestartMicTest()',
  'ycMicTestSettingChanged',
  '!voiceMuted&&!voiceDeafened&&!ycMicTestVoiceHold',
  'muted=voiceMuted||ycMicTestVoiceHold',
  'if(!await ycShouldNotifyMessage(m))return',
  'ycAttachExistingScreenAudioReceiver',
  'ycPrepareDesktopProcessAudio',
  "filter:'direct_thread_id=eq.'+tid",
  "table:'direct_thread_members',filter:'user_id=eq.'+uid",
  "String(user?.id||'')!==uid",
  "filter:'channel_id=eq.'+id",
  'yc-win-notify-targeted-'
]) assert(client.includes(marker),'Generated Windows client missing marker: '+marker);

assert(!client.includes("addEventListener('change',ycStopMicTest)"),'Windows mic setting change still stops active mic test');
assert(client.includes("YC_STREAM_DESKTOP=true"),'Windows stream viewer marker missing');
assert(!client.includes('yc-dm-global-'),'Windows DM notification subscription must not listen to every message');
assert(!client.includes("sb.channel('yc-win-notify-'+user.id"),'Windows foreground notifications must not listen to every message');

console.log('PASS Windows 1.0.110 interaction/notification regression: scoped alerts, temporary mic-test voice hold and stream fixes coexist.');
