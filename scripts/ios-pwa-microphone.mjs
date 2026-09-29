const replaceOnce=(html,oldValue,newValue,label)=>{
  if(!html.includes(oldValue))throw new Error('iOS PWA microphone patch boundary missing: '+label);
  return html.replace(oldValue,newValue);
};

export function withIosPwaMicrophone(html){
  const oldConstraints="function ycNoiseConstraints(mode=ycNoiseMode,deviceId='',echo=voiceEcho,agc=voiceAgc){const clean=YC_NOISE_MODES[mode]?mode:'standard';return{deviceId:deviceId?{exact:deviceId}:undefined,echoCancellation:!!echo,noiseSuppression:clean==='standard'||clean==='strong',autoGainControl:!!agc,channelCount:1,sampleRate:clean==='ai'?48000:undefined}}";
  const newConstraints=`function ycIosWebMicRuntime(){return !window.Capacitor?.isNativePlatform?.()&&(/iP(?:hone|ad|od)/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1))}
function ycNoiseConstraints(mode=ycNoiseMode,deviceId='',echo=voiceEcho,agc=voiceAgc){const clean=YC_NOISE_MODES[mode]?mode:'standard',ios=ycIosWebMicRuntime(),out={deviceId:deviceId?{exact:deviceId}:undefined,echoCancellation:!!echo,noiseSuppression:ios?clean!=='off':clean==='standard'||clean==='strong',autoGainControl:!!agc};if(!ios){out.channelCount=1;if(clean==='ai')out.sampleRate=48000}return out}`;
  html=replaceOnce(html,oldConstraints,newConstraints,'noise constraints');

  const finishStart="async function ycFinishMicStream(input,mode,options=ycMicOptions()){const C=window.AudioContext||window.webkitAudioContext;if(!C||!window.AudioWorkletNode)throw Error('AudioWorklet není dostupný; nelze spustit mikrofonní filtry.');let ctx,src,high,node,limiter,dest;try{ctx=new C({sampleRate:48000,latencyHint:'interactive'});await ctx.resume();await ctx.audioWorklet.addModule(new URL('./audio/mic-gate.worklet.js',document.baseURI).href);";
  const finishNew="async function ycFinishMicStream(input,mode,options=ycMicOptions()){const C=window.AudioContext||window.webkitAudioContext;if(!C||!window.AudioWorkletNode){if(ycIosWebMicRuntime()){console.warn('iOS Web/PWA microphone: AudioWorklet unavailable, using raw WebRTC microphone');return input}throw Error('AudioWorklet není dostupný; nelze spustit mikrofonní filtry.')}let ctx,src,high,node,limiter,dest;try{ctx=new C({sampleRate:48000,latencyHint:'interactive'});if(ycIosWebMicRuntime()){await Promise.race([Promise.resolve(ctx.resume()).catch(()=>{}),new Promise(resolve=>setTimeout(resolve,300))]);if(ctx.state!=='running')throw Error('iOS Web Audio context did not enter running state');await Promise.race([ctx.audioWorklet.addModule(new URL('./audio/mic-gate.worklet.js',document.baseURI).href),new Promise((_,reject)=>setTimeout(()=>reject(Error('iOS AudioWorklet load timeout')),900))])}else{await ctx.resume();await ctx.audioWorklet.addModule(new URL('./audio/mic-gate.worklet.js',document.baseURI).href)};";
  html=replaceOnce(html,finishStart,finishNew,'microphone processor start');

  const finishCatch="}catch(e){for(const n of [src,high,node,limiter,dest])try{n?.disconnect()}catch{};await ctx?.close().catch(()=>{});throw e}}";
  const finishCatchNew="}catch(e){for(const n of [src,high,node,limiter,dest])try{n?.disconnect()}catch{};await ctx?.close().catch(()=>{});if(ycIosWebMicRuntime()){console.warn('iOS Web/PWA microphone processing fallback',e);return input}throw e}}";
  html=replaceOnce(html,finishCatch,finishCatchNew,'microphone processor fallback');

  const prepare="async function ycPrepareMicStream(raw,mode=ycNoiseMode,options=ycMicOptions()){\n  let cleaned=raw;\n  try{if(mode==='ai')cleaned=await ycBuildAiMicStream(raw,options);return await ycFinishMicStream(cleaned,mode,options)}\n  catch(e){await ycStopManagedMicStream(cleaned);throw e}\n}";
  const prepareNew="async function ycPrepareMicStream(raw,mode=ycNoiseMode,options=ycMicOptions()){\n  if(ycIosWebMicRuntime()){try{return await ycFinishMicStream(raw,mode==='ai'?'standard':mode,options)}catch(e){console.warn('iOS Web/PWA microphone raw fallback',e);return raw}}\n  let cleaned=raw;\n  try{if(mode==='ai')cleaned=await ycBuildAiMicStream(raw,options);return await ycFinishMicStream(cleaned,mode,options)}\n  catch(e){await ycStopManagedMicStream(cleaned);throw e}\n}";
  html=replaceOnce(html,prepare,prepareNew,'iOS processing bypass');

  const acquire="async function voiceConstraints(){return ycNoiseConstraints(ycNoiseMode,voiceDeviceId,voiceEcho,voiceAgc)}\nasync function acquireVoiceStream(){const media=getVoiceMediaDevices();if(!media?.getUserMedia)throw new Error('Prohlížeč nepodporuje mikrofon.');let raw;try{raw=await media.getUserMedia({audio:await voiceConstraints()})}catch(e){if(voiceDeviceId&&['NotFoundError','OverconstrainedError'].includes(e?.name)){voiceDeviceId='';localStorage.removeItem('yc_voice_mic');raw=await media.getUserMedia({audio:ycNoiseConstraints(ycNoiseMode,'',voiceEcho,voiceAgc)})}else throw e}const track=raw.getAudioTracks()[0];const actual=track?.getSettings?.().deviceId;if(actual){voiceDeviceId=actual;localStorage.setItem('yc_voice_mic',actual)}return await ycPrepareMicStream(raw,ycNoiseMode)}";
  const acquireNew="function voiceConstraints(){return ycNoiseConstraints(ycNoiseMode,voiceDeviceId,voiceEcho,voiceAgc)}\nasync function acquireVoiceStream(){const media=getVoiceMediaDevices();if(!media?.getUserMedia)throw new Error('Prohlížeč nepodporuje mikrofon.');let raw;try{const audio=voiceConstraints(),request=media.getUserMedia({audio});raw=await request}catch(e){if(voiceDeviceId&&['NotFoundError','OverconstrainedError'].includes(e?.name)){voiceDeviceId='';localStorage.removeItem('yc_voice_mic');const audio=ycNoiseConstraints(ycNoiseMode,'',voiceEcho,voiceAgc),request=media.getUserMedia({audio});raw=await request}else throw e}const track=raw.getAudioTracks()[0];const actual=track?.getSettings?.().deviceId;if(actual){voiceDeviceId=actual;localStorage.setItem('yc_voice_mic',actual)}return await ycPrepareMicStream(raw,ycNoiseMode)}";
  html=replaceOnce(html,acquire,acquireNew,'gesture-safe getUserMedia');

  const joinOld=`      const reusableStream=voiceStream?.getAudioTracks?.().some(t=>t.readyState==='live')?voiceStream:null;
      ycVoiceKeepMicDuringSwitch=!!reusableStream;
      try{await leaveVoiceChannel(true)}finally{ycVoiceKeepMicDuringSwitch=false}
      if(actionId!==voiceActionSeq)return;
      const hasTurn=await loadVoiceTurnServers();
      if(actionId!==voiceActionSeq)return;
      let stream=reusableStream;
      if(!stream||!stream.getAudioTracks?.().some(t=>t.readyState==='live')){
        try{stream=await acquireVoiceStream()}catch(e){toast((e?.name==='NotAllowedError'?'Povol Yamachatu přístup k mikrofonu. ':'Mikrofon se nepodařilo spustit. ')+(e?.message||e),true);return}
      }`;
  const joinNew=`      const reusableStream=voiceStream?.getAudioTracks?.().some(t=>t.readyState==='live')?voiceStream:null;
      const pendingMic=ycIosWebMicRuntime()&&!reusableStream?acquireVoiceStream():null;
      if(pendingMic)pendingMic.catch(()=>{});
      const discardPendingMic=()=>{if(pendingMic)void pendingMic.then(s=>ycStopManagedMicStream(s)).catch(()=>{})};
      ycVoiceKeepMicDuringSwitch=!!reusableStream;
      try{await leaveVoiceChannel(true)}finally{ycVoiceKeepMicDuringSwitch=false}
      if(actionId!==voiceActionSeq){discardPendingMic();return}
      const hasTurn=await loadVoiceTurnServers();
      if(actionId!==voiceActionSeq){discardPendingMic();return}
      let stream=reusableStream;
      if(!stream||!stream.getAudioTracks?.().some(t=>t.readyState==='live')){
        try{stream=await (pendingMic||acquireVoiceStream())}catch(e){toast((e?.name==='NotAllowedError'?'Povol Yamachatu přístup k mikrofonu v Nastavení iOS / Safari. ':'Mikrofon se nepodařilo spustit. ')+(e?.message||e),true);return}
      }`;
  html=replaceOnce(html,joinOld,joinNew,'join microphone prewarm');

  return html;
}
