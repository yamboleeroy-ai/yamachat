// Installation offers appear in both login and settings; omit the running platform.
function ycInstalledPlatform(){
 const native=window.Capacitor?.isNativePlatform?.();
 if(native)return window.Capacitor.getPlatform();
 if(/Electron\//.test(navigator.userAgent))return 'windows';
 const standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 if(standalone){if(/Android/i.test(navigator.userAgent))return 'android';if(/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1))return 'ios'}
 return '';
}
function ycDownloadOffers(){
 const installed=ycInstalledPlatform();
 const cards=[
 ['windows','Desktop · Windows','Stáhni instalátor, otevři jej a dokonči instalaci. Pak se přihlas stejným účtem. Další aktualizace nabídne desktopová aplikace.','<a class="ghost" data-yc-windows-download href="https://github.com/yamboleeroy-ai/yamachat/releases/latest" target="_blank" rel="noopener noreferrer">Stáhnout pro Windows</a><small data-yc-windows-status></small>'],
 ['android','Android','Stáhni APK a otevři stažený soubor. Pokud Android požádá, povol instalaci z tohoto zdroje a zvol Nainstalovat.','<a class="ghost" href="https://yamachat.eu/download/Yamachat-Android.apk" target="_blank" rel="noopener noreferrer">Stáhnout Android APK</a>'],
 ['ios','iPhone / iPad','V Safari otevři yamachat.eu, klepni na Sdílet → Přidat na plochu → Přidat. Aktuálně je k dispozici webová aplikace na plochu; veřejný odkaz na nativní iOS aplikaci zatím není zveřejněný.','<a class="ghost" href="https://yamachat.eu/download/#ios" target="_blank" rel="noopener noreferrer">Návod pro iPhone / iPad</a>']
 ];
 return '<div class="yc-download-offers">'+cards.filter(([platform])=>platform!==installed).map(([platform,title,instructions,action])=>'<details data-download-platform="'+platform+'"><summary>'+title+'</summary><p>'+instructions+'</p>'+action+'</details>').join('')+'</div>';
}
ycAppSettingsSections.delete('windows-download');
ycRegisterAppSettingsSection({id:'downloads',title:'Stáhnout Yamachat',description:'Stejný účet a zprávy na dalších zařízeních. Vyber verzi a zobraz postup instalace.',render:ycDownloadOffers,bind:root=>{if(root.querySelector('[data-yc-windows-download]'))void ycWebLoadWindowsDownload(root)}});
document.querySelector('[data-yc-web-install]')?.remove();
const ycAuthDownloads=document.createElement('section');ycAuthDownloads.id='ycAuthDownloads';ycAuthDownloads.innerHTML='<h2>Yamachat na dalších zařízeních</h2>'+ycDownloadOffers();document.querySelector('.auth-card')?.appendChild(ycAuthDownloads);
if(ycAuthDownloads.querySelector('[data-yc-windows-download]'))void ycWebLoadWindowsDownload(ycAuthDownloads);
