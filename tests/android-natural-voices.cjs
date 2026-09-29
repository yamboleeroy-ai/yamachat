const fs=require('node:fs'),assert=require('node:assert/strict');

const androidPath='mobile/android/app/src/main/assets/public/index.html';
const sharedPath='mobile/www/index.html';
const sourcePath='index.html';
const edgePath='supabase/functions/yamachat-source/index.ts';

for(const p of [androidPath,sharedPath,edgePath])assert(fs.existsSync(p),'Missing Android Natural voice test input: '+p);
const android=fs.readFileSync(androidPath,'utf8');
const shared=fs.readFileSync(sharedPath,'utf8');
const source=fs.existsSync(sourcePath)?fs.readFileSync(sourcePath,'utf8'):'';
const edge=fs.readFileSync(edgePath,'utf8');

for(const marker of [
  "ANDROID MICROSOFT NATURAL VOICES v1",
  "const YC_ANDROID_NATURAL_PREFIX='azure:'",
  "sb.functions.invoke('yamachat-source',{body:{action:'tts-voices'}})",
  "sb.functions.invoke('yamachat-source',{body:{action:'tts-synthesize'",
  "cs-CZ-VlastaNeural",
  "cs-CZ-AntoninNeural",
  "ycAndroidLocalVoiceSpeakEnhanced=ycVoiceSpeakEnhanced",
  "Microsoft Natural · čeština",
  "fallback to Android system voice",
  "bind:ycBindAndroidNaturalVoiceSettings",
  "natural:true,platform:'android'"
]) assert(android.includes(marker),'Android Natural voice marker missing: '+marker);

assert(!android.includes('AZURE_SPEECH_KEY'),'Azure Speech secret name must not be required by the Android client');
assert(!shared.includes('YC_ANDROID_NATURAL_PREFIX'),'Android Natural TTS leaked into shared Capacitor bundle / iOS');
assert(!source.includes('YC_ANDROID_NATURAL_PREFIX'),'Android Natural TTS leaked into generated Web/PWA source');
assert(android.includes("if(!text||ycVoiceAnnounceMode()!=='speech'||voiceDeafened)"),'Android Natural TTS must respect deafen before starting');
assert(android.includes("if(voiceDeafened){finish();return null}"),'Android Natural TTS must re-check deafen around async synthesis');
assert(android.includes("if(ycAndroidNaturalState!=='ready'){ycAndroidNaturalState='loading';fillVoices()}await ycAndroidNaturalVoiceLoad()"),'Android Natural voice list must reuse the ready cache when settings reopen');
assert(!android.includes("const loadNatural=async()=>{ycAndroidNaturalState='loading';fillVoices();await ycAndroidNaturalVoiceLoad()"),'Android settings must not force a Natural voice refetch when already ready');
assert(android.includes("if(audio){ycAndroidNaturalPlayers.delete(audio);try{audio.pause()}catch{}}"),'Failed Android Natural playback must release its tracked audio object');
assert(android.includes("if(!ycVoiceAvailableVoices().length)try{speechSynthesis?.addEventListener?.('voiceschanged',fillVoices,{once:true})}"),'Android settings must not add a stale voiceschanged listener when voices are already loaded');

for(const marker of [
  "Deno.env.get('AZURE_SPEECH_KEY')",
  "Deno.env.get('AZURE_SPEECH_REGION')",
  "const user=await requestUser(req);if(!user)return json({error:'unauthorized'},401);",
  "if(!ycTtsAllow(user.id))return json({error:'rate-limit'},429);",
  "/cognitiveservices/voices/list",
  "/cognitiveservices/v1"
]) assert(edge.includes(marker),'Secure server TTS marker missing: '+marker);

console.log('PASS Android Microsoft Natural voices: authenticated Azure-backed Vlasta/Antonin + Android system TTS fallback; Web/PWA/iOS remain untouched.');
