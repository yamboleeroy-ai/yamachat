const assert=require('node:assert/strict'),fs=require('node:fs');

const client=fs.readFileSync('desktop/desktop-client.html','utf8');
const edge=fs.readFileSync('supabase/functions/yamachat-source/index.ts','utf8');

for(const marker of [
  "const YC_DESKTOP_NATURAL_PREFIX='azure:'",
  "sb.functions.invoke('yamachat-source',{body:{action:'tts-voices'}})",
  "sb.functions.invoke('yamachat-source',{body:{action:'tts-synthesize'",
  "cs-CZ-VlastaNeural",
  "cs-CZ-AntoninNeural",
  "ycDesktopLocalVoiceSpeakEnhanced=ycVoiceSpeakEnhanced",
  "Microsoft Natural · čeština",
  "Microsoft Natural TTS fallback to local Windows voice",
  "id:'voice-experience'",
  "bind:ycBindDesktopNaturalVoiceSettings"
]) assert(client.includes(marker),'Desktop Natural voice marker missing: '+marker);

assert(!client.includes("AZURE_SPEECH_KEY"),'Azure Speech secret must never be embedded in desktop client');
assert(client.includes("root.querySelector('#ycVoiceAnnounceTest').onclick"),'Vyzkoušet hlas button binding missing');
assert(client.includes("ycVoiceSpeakEnhanced((profile?.display_name||profile?.username||'Yamachat')+' se připojil do místnosti'"),'Voice preview must use the same selected Natural/local voice path');
assert(client.includes("if(!text||ycVoiceAnnounceMode()!=='speech'||voiceDeafened)"),'Desktop Natural TTS must respect deafen before starting');
assert(client.includes('ycDesktopStopAnnouncementsBase=window.YamachatStopVoiceAnnouncements'),'Desktop Natural audio must extend the shared deafen cleanup');
assert(client.includes("if(voiceDeafened){finish();return null}"),'Desktop Natural TTS must re-check deafen around async synthesis');
assert(client.includes("if(ycDesktopNaturalState!=='ready'){ycDesktopNaturalState='loading';fillVoices()}await ycDesktopNaturalVoiceLoad()"),'Desktop Natural voice list must reuse the ready cache when settings reopen');
assert(!client.includes("const loadNatural=async()=>{ycDesktopNaturalState='loading';fillVoices();await ycDesktopNaturalVoiceLoad()"),'Desktop settings must not force a Natural voice refetch when already ready');
assert(client.includes("if(audio){ycDesktopNaturalPlayers.delete(audio);try{audio.pause()}catch{}}"),'Failed desktop Natural playback must release its tracked audio object');
assert(client.includes("if(!ycVoiceAvailableVoices().length)try{speechSynthesis?.addEventListener?.('voiceschanged',fillVoices,{once:true})}"),'Desktop settings must not add a stale voiceschanged listener when voices are already loaded');
assert(client.includes("ycDesktopNaturalQueue=Promise.resolve(),ycDesktopNaturalQueueGeneration=0,ycDesktopNaturalQueued=0"),'Desktop Natural TTS must use a serialized bounded queue');
assert(client.includes("if(ycDesktopNaturalQueued>=16)"),'Desktop Natural TTS queue must be bounded during join/leave bursts');
assert(client.includes("++ycDesktopNaturalQueueGeneration"),'Desktop deafen/announcement cleanup must invalidate queued Natural requests');
assert(client.includes("try{await ycScreenShareStopPromise}catch{}"),'Windows screen share restart must wait for previous cleanup');
assert(client.includes("window.__ycScreenAudioTrackHooks=window.__ycScreenAudioTrackHooks||new WeakSet()"),'Windows screen audio listeners must be deduplicated');

for(const marker of [
  "Deno.env.get('AZURE_SPEECH_KEY')",
  "Deno.env.get('AZURE_SPEECH_REGION')",
  "/cognitiveservices/voices/list",
  "/cognitiveservices/v1",
  "audio-24khz-96kbitrate-mono-mp3",
  "if(!text||text.length>220)",
  "const user=await requestUser(req);if(!user)return json({error:'unauthorized'},401);",
  "if(!ycTtsAllow(user.id))return json({error:'rate-limit'},429);",
  "if(req.method==='POST'&&incoming.pathname.endsWith('/yamachat-source'))return ttsHandler(req)"
]) assert(edge.includes(marker),'Secure yamachat-source TTS marker missing: '+marker);

assert(!/Ocp-Apim-Subscription-Key['"]?\s*:\s*['"][^'"]{8,}/.test(edge),'Azure Speech key must come only from server environment');
assert(edge.includes("if(ycTtsRate.size>256)" )&&edge.includes("ycTtsRate.delete(id)"),'TTS rate-limit memory must prune stale inactive users');

console.log('PASS Windows Microsoft Natural voices: Azure-backed real voice list/synthesis, Czech Vlasta/Antonin preference, secure server secret and local Jakub fallback.');
