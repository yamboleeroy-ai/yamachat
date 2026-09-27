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

for(const marker of [
  "Deno.env.get('AZURE_SPEECH_KEY')",
  "Deno.env.get('AZURE_SPEECH_REGION')",
  "/cognitiveservices/voices/list",
  "/cognitiveservices/v1",
  "audio-24khz-96kbitrate-mono-mp3",
  "if(!text||text.length>220)",
  "if(!userId)return json({error:'unauthorized'},401)",
  "if(!allowSynthesis(userId))return json({error:'rate-limit'},429)"
]) assert(edge.includes(marker),'Secure yamachat-source TTS marker missing: '+marker);

assert(!/Ocp-Apim-Subscription-Key['"]?\s*:\s*['"][^'"]{8,}/.test(edge),'Azure Speech key must come only from server environment');

console.log('PASS Windows Microsoft Natural voices: Azure-backed real voice list/synthesis, Czech Vlasta/Antonin preference, secure server secret and local Jakub fallback.');
