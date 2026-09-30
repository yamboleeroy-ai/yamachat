import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const target = process.argv[2] || 'all';

function walk(dir, visitor) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visitor);
    else visitor(full);
  }
}

function patchAndroidBranding(res) {
  const preferredLogo = path.join(root, 'www/build/yamachat-logo-symbol.png');
  const fallbackLogo = path.join(root, 'www/icons/icon-512.png');
  const brandLogo = fs.existsSync(preferredLogo) ? preferredLogo : fallbackLogo;
  if (!fs.existsSync(brandLogo) || !fs.existsSync(res)) return;

  // Launcher: prefer the clean, transparent Yamachat symbol generated from the
  // desktop-derived web assets instead of Capacitor's default icon.
  for (const dir of fs.readdirSync(res).filter(x => /^mipmap-(mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi)$/.test(x))) {
    const dst = path.join(res, dir);
    for (const name of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
      const out = path.join(dst, name);
      if (fs.existsSync(out)) fs.copyFileSync(brandLogo, out);
    }
  }

  // Native launch screen: remove Capacitor's generated white splash bitmaps and
  // replace the shared @drawable/splash resource with Yamachat branding.
  walk(res, file => {
    if (path.basename(file) === 'splash.png') fs.rmSync(file, { force: true });
  });

  const nodpi = path.join(res, 'drawable-nodpi');
  fs.mkdirSync(nodpi, { recursive: true });
  fs.copyFileSync(brandLogo, path.join(nodpi, 'yamachat_splash_logo.png'));

  // Notification branding: a full Yamachat logo for expanded/local notifications.
  fs.copyFileSync(brandLogo, path.join(nodpi, 'yamachat_notification_logo.png'));

  // Android status-bar icons must be monochrome. Keep the Yamachat chat/Y
  // silhouette separate from the full-color app logo to avoid a white square.
  const drawable = path.join(res, 'drawable');
  fs.mkdirSync(drawable, { recursive: true });
  fs.writeFileSync(path.join(drawable, 'ic_yamachat_notification.xml'), `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp"
    android:viewportWidth="24" android:viewportHeight="24">
    <path android:pathData="M4,3.5H20A1.5,1.5 0,0 1,21.5 5V15.5A1.5,1.5 0,0 1,20 17H8L4,20.5V17H4A1.5,1.5 0,0 1,2.5 15.5V5A1.5,1.5 0,0 1,4 3.5Z"
        android:fillColor="#00000000" android:strokeColor="#FFFFFFFF" android:strokeWidth="2"/>
    <path android:pathData="M6.5,7L11.2,11.7V15.5H13.8V11.7L18.5,7L16.5,5.7L12.5,9.7L8.5,5.7Z"
        android:fillColor="#FFFFFFFF"/>
</vector>
`, 'utf8');

  const rawDir = path.join(res, 'raw');
  fs.mkdirSync(rawDir, { recursive: true });
  const messageSound = path.join(root, 'native-assets/yamachat_message.mp3');
  if (!fs.existsSync(messageSound)) throw new Error('Yamachat native message sound is missing');
  fs.copyFileSync(messageSound, path.join(rawDir, 'yamachat_message.mp3'));

  fs.writeFileSync(path.join(drawable, 'splash.xml'), `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item>
        <shape android:shape="rectangle">
            <solid android:color="#071019" />
        </shape>
    </item>
    <item android:gravity="center" android:width="176dp" android:height="176dp">
        <bitmap android:src="@drawable/yamachat_splash_logo" android:gravity="fill" />
    </item>
</layer-list>
`, 'utf8');

  // Android 12+ may render a system splash before Capacitor gets control.
  // Keep that system stage in the same Yamachat colors/logo when those theme
  // items exist in the generated project.
  walk(res, file => {
    if (!file.endsWith('.xml') || !file.includes(`${path.sep}values`)) return;
    let xml = fs.readFileSync(file, 'utf8');
    const before = xml;
    xml = xml.replace(
      /(<item\s+name="(?:android:)?windowSplashScreenBackground">)[\s\S]*?(<\/item>)/g,
      '$1#071019$2'
    );
    xml = xml.replace(
      /(<item\s+name="(?:android:)?windowSplashScreenAnimatedIcon">)[\s\S]*?(<\/item>)/g,
      '$1@drawable/yamachat_splash_logo$2'
    );
    if (xml !== before) fs.writeFileSync(file, xml, 'utf8');
  });

  console.log('Android Yamachat launcher and native splash branding patched.');
}

function patchAndroidNaturalVoices(html) {
  const marker = '// Mobile long-press + notification preferences.';
  if (html.includes('ANDROID MICROSOFT NATURAL VOICES v1')) return html;
  if (!html.includes(marker)) throw new Error('Android Natural voice insertion marker missing');

  const registrationOld = "description:'Oznámení lidí ve voice, hlas čtení a osobní hlasitost soundboardu.',\n render:ycVoiceExperienceSettingsHtml,\n bind:ycBindVoiceExperienceSettings";
  const registrationNew = "description:'Oznámení lidí ve voice, Microsoft Natural hlas čtení a osobní hlasitost soundboardu.',\n render:ycVoiceExperienceSettingsHtml,\n bind:ycBindAndroidNaturalVoiceSettings";
  if (!html.includes(registrationOld)) throw new Error('Android Natural voice settings registration boundary missing');

  const androidNatural = [
    "/* ANDROID MICROSOFT NATURAL VOICES v1",
    "   Uses the authenticated yamachat-source Edge Function. No Azure key is bundled in the APK.",
    "   The current Android/system speechSynthesis voice remains the fallback. */",
    "const YC_ANDROID_NATURAL_PREFIX='azure:';",
    "let ycAndroidNaturalVoices=[],ycAndroidNaturalState='idle',ycAndroidNaturalPromise=null,ycAndroidNaturalQueue=Promise.resolve(),ycAndroidNaturalQueueGeneration=0,ycAndroidNaturalQueued=0;",
    "const ycAndroidNaturalPlayers=new Set();",
    "const ycAndroidStopAnnouncementsBase=window.YamachatStopVoiceAnnouncements;",
    "window.YamachatStopVoiceAnnouncements=function(){++ycAndroidNaturalQueueGeneration;try{ycAndroidStopAnnouncementsBase?.()}catch{}for(const audio of [...ycAndroidNaturalPlayers]){try{audio.pause();audio.onended?.()}catch{}ycAndroidNaturalPlayers.delete(audio)}};",
    "function ycAndroidNaturalValue(voice){return YC_ANDROID_NATURAL_PREFIX+String(voice?.shortName||'')}",
    "function ycAndroidNaturalGender(voice){const g=String(voice?.gender||'').toLowerCase();return g==='female'?'female':g==='male'?'male':''}",
    "function ycAndroidNaturalLabel(voice){const name=String(voice?.displayName||voice?.localName||voice?.shortName||'Microsoft Natural'),locale=String(voice?.locale||''),localeName=String(voice?.localeName||locale),g=ycAndroidNaturalGender(voice),gender=g==='female'?' · ženský':g==='male'?' · mužský':'';return 'Microsoft '+name+' Online (Natural) - '+localeName+' · '+locale+gender}",
    "function ycAndroidNaturalOptionsHtml(voices){const sorted=[...(voices||[])].sort((a,b)=>{const ac=String(a.locale||'').toLowerCase()==='cs-cz'?0:1,bc=String(b.locale||'').toLowerCase()==='cs-cz'?0:1;return ac-bc||String(a.localeName||a.locale||'').localeCompare(String(b.localeName||b.locale||''),'cs')||String(a.displayName||'').localeCompare(String(b.displayName||''),'cs')});const cs=sorted.filter(v=>String(v.locale||'').toLowerCase()==='cs-cz'),rest=sorted.filter(v=>String(v.locale||'').toLowerCase()!=='cs-cz');const group=(label,list)=>list.length?'<optgroup label=\"'+esc(label)+'\">'+list.map(v=>'<option value=\"'+esc(ycAndroidNaturalValue(v))+'\">'+esc(ycAndroidNaturalLabel(v))+'</option>').join('')+'</optgroup>':'';return group('Microsoft Natural · čeština',cs)+group('Microsoft Natural · další jazyky',rest)}",
    "async function ycAndroidNaturalVoiceLoad(force=false){if(!force&&ycAndroidNaturalState==='ready')return ycAndroidNaturalVoices;if(!force&&ycAndroidNaturalPromise)return ycAndroidNaturalPromise;ycAndroidNaturalState='loading';ycAndroidNaturalPromise=(async()=>{try{const {data,error}=await sb.functions.invoke('yamachat-source',{body:{action:'tts-voices'}});if(error)throw error;const list=Array.isArray(data?.voices)?data.voices:[];ycAndroidNaturalVoices=list.filter(v=>v&&v.shortName&&v.locale);ycAndroidNaturalState=ycAndroidNaturalVoices.length?'ready':'unavailable';return ycAndroidNaturalVoices}catch(e){console.warn('Microsoft Natural voices unavailable on Android',e);ycAndroidNaturalVoices=[];ycAndroidNaturalState='unavailable';return[]}finally{ycAndroidNaturalPromise=null}})();return ycAndroidNaturalPromise}",
    "function ycAndroidNaturalVoiceForPreference(){const voices=ycAndroidNaturalVoices,gender=ycVoiceGender(),wanted=localStorage.getItem(YC_VOICE_ANNOUNCE_VOICE_KEY)||'';if(wanted.startsWith(YC_ANDROID_NATURAL_PREFIX)){const shortName=wanted.slice(YC_ANDROID_NATURAL_PREFIX.length),exact=voices.find(v=>String(v.shortName)===shortName);if(exact)return exact}if(gender==='female')return voices.find(v=>String(v.shortName||'')==='cs-CZ-VlastaNeural')||voices.find(v=>String(v.locale||'').toLowerCase()==='cs-cz'&&ycAndroidNaturalGender(v)==='female')||voices.find(v=>ycAndroidNaturalGender(v)==='female')||null;if(gender==='male')return voices.find(v=>String(v.shortName||'')==='cs-CZ-AntoninNeural')||voices.find(v=>String(v.locale||'').toLowerCase()==='cs-cz'&&ycAndroidNaturalGender(v)==='male')||voices.find(v=>ycAndroidNaturalGender(v)==='male')||null;return null}",
    "const ycAndroidLocalVoiceSpeakEnhanced=ycVoiceSpeakEnhanced;",
    "async function ycAndroidNaturalSpeak(text,voice,onDone){let audio=null,finished=false;const finish=()=>{if(finished)return;finished=true;if(audio)ycAndroidNaturalPlayers.delete(audio);try{onDone?.()}catch{}};if(voiceDeafened){finish();return null}try{const {data,error}=await sb.functions.invoke('yamachat-source',{body:{action:'tts-synthesize',voice:String(voice.shortName||''),text:String(text||'').slice(0,220)}});if(error||!data?.audioBase64)throw error||new Error('Natural voice audio missing');if(voiceDeafened){finish();return null}audio=new Audio('data:'+(data.mimeType||'audio/mpeg')+';base64,'+data.audioBase64);audio.preload='auto';audio.volume=.94;ycAndroidNaturalPlayers.add(audio);audio.onended=finish;audio.onerror=finish;await audio.play();return audio}catch(e){if(audio){ycAndroidNaturalPlayers.delete(audio);try{audio.pause()}catch{}}console.warn('Microsoft Natural TTS fallback to Android system voice',e);return ycAndroidLocalVoiceSpeakEnhanced(text,onDone)}}",
    "function ycAndroidNaturalEnqueue(text,voice,onDone){const generation=ycAndroidNaturalQueueGeneration;if(ycAndroidNaturalQueued>=16){try{onDone?.()}catch{};return}++ycAndroidNaturalQueued;const task=ycAndroidNaturalQueue.catch(()=>{}).then(async()=>{if(generation!==ycAndroidNaturalQueueGeneration||voiceDeafened){try{onDone?.()}catch{};return}await new Promise(resolve=>{let done=false,timer=0;const finish=()=>{if(done)return;done=true;clearTimeout(timer);try{onDone?.()}catch{}resolve()};timer=setTimeout(finish,9000);void ycAndroidNaturalSpeak(text,voice,finish).then(result=>{if(!result)finish()},finish)})}).finally(()=>{ycAndroidNaturalQueued=Math.max(0,ycAndroidNaturalQueued-1)});ycAndroidNaturalQueue=task.catch(()=>{})}",

    "ycVoiceSpeakEnhanced=function(text,onDone){if(!text||ycVoiceAnnounceMode()!=='speech'||voiceDeafened){try{onDone?.()}catch{};return null}const wanted=localStorage.getItem(YC_VOICE_ANNOUNCE_VOICE_KEY)||'',gender=ycVoiceGender(),wantsNatural=wanted.startsWith(YC_ANDROID_NATURAL_PREFIX)||gender==='female'||gender==='male';if(!wantsNatural)return ycAndroidLocalVoiceSpeakEnhanced(text,onDone);const generation=ycAndroidNaturalQueueGeneration;void(async()=>{if(ycAndroidNaturalState!=='ready')await ycAndroidNaturalVoiceLoad();if(generation!==ycAndroidNaturalQueueGeneration||voiceDeafened){try{onDone?.()}catch{};return}const voice=ycAndroidNaturalVoiceForPreference();if(voice)ycAndroidNaturalEnqueue(text,voice,onDone);else ycAndroidLocalVoiceSpeakEnhanced(text,onDone)})();return {natural:true,platform:'android'}};",
    "function ycBindAndroidNaturalVoiceSettings(root){if(!root)return;const mode=root.querySelector('#ycVoiceAnnounceMode'),voiceSelect=root.querySelector('#ycVoiceAnnounceVoice'),genderSelect=root.querySelector('#ycVoiceGender');const syncVisibility=()=>{const speech=mode?.value==='speech',cue=mode?.value==='cue';root.querySelector('[data-yc-voice-select-wrap]')?.toggleAttribute('hidden',!speech);root.querySelector('#ycVoiceAnnounceTest')?.toggleAttribute('hidden',!speech);root.querySelector('#ycVoiceJoinTest')?.toggleAttribute('hidden',!cue);root.querySelector('#ycVoiceLeaveTest')?.toggleAttribute('hidden',!cue)};genderSelect.value=ycVoiceGender();const fillVoices=()=>{if(!voiceSelect)return;const chosen=localStorage.getItem(YC_VOICE_ANNOUNCE_VOICE_KEY)||'',local=ycVoiceAvailableVoices();voiceSelect.innerHTML='<option value=\"\">Automaticky · systémový hlas Androidu jako fallback</option>'+ycAndroidNaturalOptionsHtml(ycAndroidNaturalVoices)+ycVoiceOptionsHtml(local);voiceSelect.value=[...voiceSelect.options].some(o=>o.value===chosen)?chosen:'';const note=root.querySelector('[data-yc-real-voice-note]'),natural=ycAndroidNaturalVoiceForPreference(),localSelected=ycVoiceSelectedVoice(local),gender=ycVoiceGender();if(note){if(natural)note.textContent='Použitý hlas: '+ycAndroidNaturalLabel(natural)+' · online Microsoft Natural. Při výpadku se automaticky použije '+(localSelected?ycVoiceOptionLabel(localSelected):'systémový hlas Androidu')+'.';else if(ycAndroidNaturalState==='loading')note.textContent='Načítám Microsoft Natural hlasy… Systémový hlas Androidu zůstává připravený jako fallback.';else if(ycAndroidNaturalState==='unavailable')note.textContent='Microsoft Natural služba není dostupná. Používá se '+(localSelected?ycVoiceOptionLabel(localSelected):'výchozí hlas Androidu')+'.';else note.textContent=localSelected?'Použitý lokální hlas: '+ycVoiceOptionLabel(localSelected)+(gender!=='auto'&&ycVoiceGenderHint(localSelected)!==gender?' — odpovídající Natural hlas se ještě načítá.':''):'Hlasy se ještě načítají.'}};const loadNatural=async()=>{if(ycAndroidNaturalState!=='ready'){ycAndroidNaturalState='loading';fillVoices()}await ycAndroidNaturalVoiceLoad();if(root.isConnected)fillVoices()};fillVoices();void loadNatural();if(!ycVoiceAvailableVoices().length)try{speechSynthesis?.addEventListener?.('voiceschanged',fillVoices,{once:true})}catch{};genderSelect.onchange=()=>{localStorage.setItem(YC_VOICE_GENDER_KEY,genderSelect.value);fillVoices()};mode.onchange=()=>{localStorage.setItem(YC_VOICE_ANNOUNCE_MODE_KEY,mode.value);syncVisibility()};voiceSelect.onchange=()=>{localStorage.setItem(YC_VOICE_ANNOUNCE_VOICE_KEY,voiceSelect.value);fillVoices()};const sbRange=root.querySelector('#ycSoundboardVolumeRange'),sbv=root.querySelector('#ycSoundboardVolumeValue');sbRange.oninput=()=>{const v=Math.max(0,Math.min(100,Number(sbRange.value)||0));localStorage.setItem(YC_SOUNDBOARD_VOLUME_KEY,String(v));sbv.textContent=v+' %'};const previewButtons=[...root.querySelectorAll('#ycVoiceAnnounceTest,#ycVoiceJoinTest,#ycVoiceLeaveTest')];let previewBusy=false,previewTimer=0;const previewUnlock=()=>{previewBusy=false;clearTimeout(previewTimer);previewButtons.forEach(b=>b.disabled=false)};const previewRun=(runner,minLock=2600)=>{if(previewBusy)return;previewBusy=true;previewButtons.forEach(b=>b.disabled=true);const started=Date.now(),done=()=>{const rest=Math.max(0,minLock-(Date.now()-started));clearTimeout(previewTimer);previewTimer=setTimeout(previewUnlock,rest)};previewTimer=setTimeout(previewUnlock,Math.max(minLock,7000));try{runner(done)}catch(e){done();console.warn('voice preview',e)}};root.querySelector('#ycVoiceAnnounceTest').onclick=()=>previewRun(done=>{try{speechSynthesis.cancel()}catch{};ycVoiceSpeakEnhanced((profile?.display_name||profile?.username||'Yamachat')+' se připojil do místnosti',done)},3600);root.querySelector('#ycVoiceJoinTest').onclick=()=>previewRun(done=>void ycPlayVoiceFileCue('join',done),2600);root.querySelector('#ycVoiceLeaveTest').onclick=()=>previewRun(done=>void ycPlayVoiceFileCue('leave',done),2600);syncVisibility()}",
    ""
  ].join('\n');

  html = html.replace(marker, androidNatural + '\n' + marker);
  html = html.replace(registrationOld, registrationNew);
  return html;
}

function patchAndroid() {
  const p = path.join(root, 'android/app/src/main/AndroidManifest.xml');
  if (!fs.existsSync(p)) {
    console.log('Android project not generated yet; skipping manifest patch.');
    return;
  }
  let xml = fs.readFileSync(p, 'utf8');
  const permissions = [
    '<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
    '<uses-permission android:name="android.permission.CAMERA" />',
    '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
    '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
    '<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />',
    '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />'
  ];
  for (const line of permissions) {
    const name = line.match(/android:name="([^"]+)"/)?.[1];
    if (name && !xml.includes(name)) xml = xml.replace(/<manifest([^>]*)>/, '<manifest$1>\n    ' + line);
  }
  if (!xml.includes('com.google.firebase.messaging.default_notification_icon')) {
    const meta = [
      '        <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_yamachat_notification" />',
      '        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="yamachat-messages-v2" />'
    ].join('\n');
    xml = xml.replace('</application>', meta + '\n    </application>');
  }
  if (!xml.includes('android.support.FILE_PROVIDER_PATHS')) {
    const provider = [
      '        <provider',
      '            android:name="androidx.core.content.FileProvider"',
      '            android:authorities="${applicationId}.fileprovider"',
      '            android:exported="false"',
      '            android:grantUriPermissions="true">',
      '            <meta-data',
      '                android:name="android.support.FILE_PROVIDER_PATHS"',
      '                android:resource="@xml/yamachat_file_paths" />',
      '        </provider>'
    ].join('\n');
    xml = xml.replace('</application>', provider + '\n    </application>');
  }
  fs.writeFileSync(p, xml, 'utf8');

  // Patch the Android bundle only, after cap sync. Web/iOS assets stay identical.
  const publicDir = path.join(root, 'android/app/src/main/assets/public');
  const htmlPath = path.join(publicDir, 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = patchAndroidNaturalVoices(html);
  const androidStyle = '<link rel="stylesheet" href="./android-portrait.css">';
  if (!html.includes(androidStyle)) html = html.replace('</head>', androidStyle + '\n</head>');
  fs.writeFileSync(htmlPath, html);
  fs.copyFileSync(path.join(root, 'android-portrait.css'), path.join(publicDir, 'android-portrait.css'));

  // Apply only to the generated Android project; iOS configuration is unchanged.
  const gradlePath = path.join(root, 'android/app/build.gradle');
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  const release = JSON.parse(fs.readFileSync(path.join(root, 'android-release.json'), 'utf8'));
  const config = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
  if (config.appId !== release.applicationId || !gradle.includes('applicationId "' + release.applicationId + '"')) {
    throw new Error('Android package changed; refusing an incompatible build');
  }
  const apply = "apply from: '../../android-signing.gradle'";
  if (!gradle.includes(apply)) fs.writeFileSync(gradlePath, gradle + '\n' + apply + '\n');
  patchAndroidUpdater(release);
  patchAndroidBranding(path.join(root, 'android/app/src/main/res'));
  console.log('Android permissions and Yamachat native branding patched.');
}


function patchAndroidUpdater(release) {
  const pkg = String(release.applicationId || '').trim();
  if (!pkg) throw new Error('Android updater package is missing');

  const javaDir = path.join(root, 'android/app/src/main/java', ...pkg.split('.'));
  fs.mkdirSync(javaDir, { recursive: true });

  const pluginSource = `package ${pkg};

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.security.MessageDigest;
import java.util.Locale;

@CapacitorPlugin(name = "YamachatUpdate")
public class YamachatUpdatePlugin extends Plugin {
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        final String url = call.getString("url", "").trim();
        final String version = call.getString("version", "latest").trim();
        final String expectedSha256 = call.getString("sha256", "").replace(":", "").trim().toLowerCase(Locale.ROOT);

        if (!url.startsWith("https://")) {
            call.reject("Aktualizační URL není platná.");
            return;
        }

        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.getPackageName()));
            if (getActivity() != null) getActivity().startActivity(settings);
            else {
                settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(settings);
            }
            JSObject result = new JSObject();
            result.put("permissionRequired", true);
            call.resolve(result);
            return;
        }

        try {
            String safeVersion = version.replaceAll("[^0-9A-Za-z._-]", "_");
            String fileName = "Yamachat-" + (safeVersion.isEmpty() ? "update" : safeVersion) + ".apk";
            File dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) throw new IllegalStateException("Android update directory is unavailable");
            if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Android update directory cannot be created");
            File target = new File(dir, fileName);
            if (target.exists()) target.delete();

            DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setTitle("Yamachat " + version);
            request.setDescription("Stahuji aktualizaci Yamachatu");
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(false);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
            request.setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, fileName);
            long id = manager.enqueue(request);

            JSObject result = new JSObject();
            result.put("started", true);
            result.put("downloadId", id);
            call.resolve(result);

            Thread watcher = new Thread(() -> monitorDownload(manager, id, target, expectedSha256), "yamachat-update-download");
            watcher.setDaemon(true);
            watcher.start();
        } catch (Exception error) {
            call.reject("Aktualizaci se nepodařilo spustit: " + safeMessage(error));
        }
    }

    private void monitorDownload(DownloadManager manager, long id, File target, String expectedSha256) {
        try {
            boolean done = false;
            while (!done) {
                DownloadManager.Query query = new DownloadManager.Query().setFilterById(id);
                try (Cursor cursor = manager.query(query)) {
                    if (cursor == null || !cursor.moveToFirst()) throw new IllegalStateException("Stažení aktualizace zmizelo ze systému.");
                    int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                    long downloaded = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                    long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                    double percent = total > 0 ? Math.min(100d, (downloaded * 100d) / total) : 0d;

                    if (status == DownloadManager.STATUS_SUCCESSFUL) {
                        emit("verifying", 100d, "Ověřuji APK");
                        if (!target.isFile()) throw new IllegalStateException("Stažená APK nebyla nalezena.");
                        if (!expectedSha256.isEmpty()) {
                            String actual = sha256(target);
                            if (!expectedSha256.equals(actual)) {
                                target.delete();
                                throw new SecurityException("Kontrolní součet APK nesouhlasí.");
                            }
                        }
                        emit("ready", 100d, "APK je připravená");
                        installApk(target);
                        done = true;
                    } else if (status == DownloadManager.STATUS_FAILED) {
                        int reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                        throw new IllegalStateException("Android odmítl stažení aktualizace (" + reason + ").");
                    } else {
                        emit("downloading", percent, "Stahuji aktualizaci");
                    }
                }
                if (!done) Thread.sleep(500);
            }
        } catch (Exception error) {
            emit("error", 0d, safeMessage(error));
        }
    }

    private void installApk(File apk) {
        Context context = getContext();
        Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    private void emit(String status, double percent, String message) {
        JSObject data = new JSObject();
        data.put("status", status);
        data.put("percent", percent);
        data.put("message", message == null ? "" : message);
        if (getActivity() != null) getActivity().runOnUiThread(() -> notifyListeners("updateProgress", data));
        else notifyListeners("updateProgress", data);
    }

    private String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[1024 * 128];
            int read;
            while ((read = input.read(buffer)) > 0) digest.update(buffer, 0, read);
        }
        StringBuilder out = new StringBuilder();
        for (byte b : digest.digest()) out.append(String.format(Locale.ROOT, "%02x", b));
        return out.toString();
    }

    private String safeMessage(Exception error) {
        String message = error == null ? "" : String.valueOf(error.getMessage());
        if (message == null || message.trim().isEmpty()) message = error == null ? "Neznámá chyba" : error.getClass().getSimpleName();
        return message.replaceAll("\\s+", " ").trim();
    }
}
`;
  fs.writeFileSync(path.join(javaDir, 'YamachatUpdatePlugin.java'), pluginSource, 'utf8');

  const mainActivity = `package ${pkg};

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Capacitor must know custom plugins before BridgeActivity creates the bridge.
        // Registering after super.onCreate() leaves JS with a proxy that reports
        // "plugin is not implemented on android".
        registerPlugin(YamachatUpdatePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`;
  fs.writeFileSync(path.join(javaDir, 'MainActivity.java'), mainActivity, 'utf8');

  const xmlDir = path.join(root, 'android/app/src/main/res/xml');
  fs.mkdirSync(xmlDir, { recursive: true });
  fs.writeFileSync(path.join(xmlDir, 'yamachat_file_paths.xml'), `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-files-path name="yamachat_updates" path="Download/" />
</paths>
`, 'utf8');

  console.log('Android in-app APK updater patched.');
}

function plistEntry(key, value) {
  return `\n\t<key>${key}</key>\n\t<string>${value}</string>`;
}

function patchIos() {
  const p = path.join(root, 'ios/App/App/Info.plist');
  if (!fs.existsSync(p)) {
    console.log('iOS project not generated yet; skipping Info.plist patch.');
    return;
  }
  let xml = fs.readFileSync(p, 'utf8');
  const entries = [
    ['NSMicrophoneUsageDescription', 'Yamachat potřebuje mikrofon pro hlasové kanály a hovory.'],
    ['NSCameraUsageDescription', 'Yamachat potřebuje kameru pro video a sdílení médií.'],
    ['NSPhotoLibraryUsageDescription', 'Yamachat potřebuje přístup k fotkám pro odesílání obrázků a souborů.']
  ];
  for (const [key, value] of entries) {
    if (!xml.includes('<key>' + key + '</key>')) xml = xml.replace('</dict>', plistEntry(key, value) + '\n</dict>');
  }
  if (!xml.includes('<key>UIBackgroundModes</key>')) {
    xml = xml.replace('</dict>', '\n\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>audio</string>\n\t</array>\n</dict>');
  }
  fs.writeFileSync(p, xml, 'utf8');
  console.log('iOS privacy/background audio keys patched.');
}

if (target === 'all' || target === 'android') patchAndroid();
if (target === 'all' || target === 'ios') patchIos();
