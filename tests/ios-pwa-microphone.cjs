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
  "if(ycIosWebMicRuntime()){try{return await ycFinishMicStream(raw,mode==='ai'?'standard':mode,options)}"
])assert(html.includes(marker),'Missing iOS microphone hardening marker: '+marker);

const join=html.slice(html.indexOf('async function joinVoiceChannel(ch)'),html.indexOf('// VOICE PRESENCE CLEANUP',html.indexOf('async function joinVoiceChannel(ch)')));
assert(join.indexOf('pendingMic=ycIosWebMicRuntime()')<join.indexOf('await leaveVoiceChannel(true)'),'iOS microphone request must start before async voice cleanup');
assert(join.indexOf('pendingMic=ycIosWebMicRuntime()')<join.indexOf('await loadVoiceTurnServers()'),'iOS microphone request must start before TURN network wait');

const constraints=html.slice(html.indexOf('function ycNoiseConstraints'),html.indexOf('async function ycBuildStrongMicStream'));
assert(constraints.includes("if(!ios){out.channelCount=1;if(clean==='ai')out.sampleRate=48000}"),'iOS microphone constraints must omit forced sample rate/channel count');
assert(constraints.includes("noiseSuppression:ios?clean!=='off'"),'iOS must keep native noise suppression when AI processing is bypassed');

console.log('PASS iOS Web/PWA microphone capture is gesture-first and processing failures fall back to live raw WebRTC audio.');
