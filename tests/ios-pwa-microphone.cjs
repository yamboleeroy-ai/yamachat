const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

for(const marker of [
  "function ycIosWebMicRuntime()",
  "function voiceConstraints(){return ycNoiseConstraints",
  "const audio=voiceConstraints(),request=media.getUserMedia({audio});raw=await request",
  "const pendingMic=ycIosWebMicRuntime()&&!reusableStream?acquireVoiceStream():null",
  "iOS Web/PWA microphone: AudioWorklet unavailable, using raw WebRTC microphone",
  "iOS Web/PWA microphone processing fallback",
  "if(ycIosWebMicRuntime()){try{return await ycFinishMicStream(raw,mode==='ai'?'standard':mode,options)}",
  "async function ycIosApplyEchoConstraint(stream,echo)",
  "await track.applyConstraints({echoCancellation:!!echo})",
  "if(ycIosWebMicRuntime())await ycIosApplyEchoConstraint(raw,voiceEcho)",
  "if(ycIosWebMicRuntime())await ycIosApplyEchoConstraint(raw,$('voiceEchoCheck')?.checked??voiceEcho)",
  "function ycIosMicTestAudioSession(phase)",
  "navigator.audioSession.type='play-and-record'",
  "const preserveAudio=ycIosWebMicRuntime()&&!!ycMicTestAudio",
  "ycCleanupMicTest({restoreVoice:false,clearWanted:false,preserveAudio})",
  "if(!ycMicTestAudio){ycMicTestAudio=document.createElement('audio')"
])assert(html.includes(marker),'Missing iOS microphone hardening marker: '+marker);

const join=html.slice(html.indexOf('async function joinVoiceChannel(ch)'),html.indexOf('// VOICE PRESENCE CLEANUP',html.indexOf('async function joinVoiceChannel(ch)')));
assert(join.indexOf('pendingMic=ycIosWebMicRuntime()')<join.indexOf('await leaveVoiceChannel(true)'),'iOS microphone request must start before async voice cleanup');
assert(join.indexOf('pendingMic=ycIosWebMicRuntime()')<join.indexOf('await loadVoiceTurnServers()'),'iOS microphone request must start before TURN network wait');

const constraints=html.slice(html.indexOf('function ycNoiseConstraints'),html.indexOf('async function ycBuildStrongMicStream'));
assert(constraints.includes("if(!ios){out.echoCancellation=!!echo;out.channelCount=1;if(clean==='ai')out.sampleRate=48000}"),'iOS getUserMedia constraints must omit echo cancellation, forced sample rate and channel count');
assert(constraints.includes("noiseSuppression:ios?clean!=='off'"),'iOS must keep native noise suppression when AI processing is bypassed');
assert(!constraints.includes("out={deviceId:deviceId?{exact:deviceId}:undefined,echoCancellation:!!echo"),'iOS getUserMedia must not request echoCancellation:false directly');

const micRestart=html.slice(html.indexOf('function ycRestartMicTest()'),html.indexOf('function ycMicTestSettingChanged',html.indexOf('function ycRestartMicTest()')));
assert(micRestart.includes("ycMicTestAudio.play().catch(()=>{})"),'iOS mic-test restart must retain the already-authorized monitor element');
assert(micRestart.indexOf("if(ycIosWebMicRuntime()){ycMicTestRestartTimer=null;void ycStartMicTestInternal();return}")<micRestart.indexOf("setTimeout"),'iOS mic-test restart must stay inside the settings change user gesture');

const cleanup=html.slice(html.indexOf('function ycCleanupMicTest'),html.indexOf('function ycStopMicTest',html.indexOf('function ycCleanupMicTest')));
assert(cleanup.includes('preserveAudio=false'),'mic-test cleanup must support preserving the iOS monitor element');
assert(cleanup.includes("ycMicTestAudio&&!preserveAudio"),'iOS monitor element must survive echo/AGC restart');

console.log('PASS iOS Web/PWA microphone capture applies echo cancellation with track.applyConstraints and avoids the WebKit echo-off getUserMedia failure path.');
