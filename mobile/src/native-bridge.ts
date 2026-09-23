import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import { PushNotifications } from '@capacitor/push-notifications';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { LocalNotifications } from '@capacitor/local-notifications';

declare global {
  interface Window {
    __YAMACHAT_MOBILE__?: {
      native: boolean;
      platform: string;
      version: string;
      build?: string;
    };
    ycNativeRequestNotifications?: () => Promise<{granted:boolean; token?:string}>;
    ycCloseMobileSurface?: () => boolean;
    ycNativeNotificationPermission?: () => Promise<boolean>;
    ycNativeShowNotification?: (payload: {title?:string;body?:string;where?:string;target?:Record<string,string>}) => Promise<boolean>;
    ycOpenDesktopNotificationTarget?: (target: Record<string,string>) => Promise<void>;
    ycNativeCheckForUpdates?: () => Promise<{available:boolean; currentCode:number; latestCode:number; item?:any; error?:string}>;
  }
}


type YamachatUpdateProgress = {
  status?: 'downloading' | 'verifying' | 'ready' | 'error';
  percent?: number;
  message?: string;
};

interface YamachatUpdateNativePlugin {
  downloadAndInstall(options: { url: string; version: string; sha256?: string }): Promise<{ started?: boolean; permissionRequired?: boolean }>;
  addListener(eventName: 'updateProgress', listener: (event: YamachatUpdateProgress) => void): Promise<{ remove: () => Promise<void> }>;
}

const YamachatUpdate = registerPlugin<YamachatUpdateNativePlugin>('YamachatUpdate');
const YAMACHAT_UPDATE_MANIFEST_URL = 'https://yamachat.eu/update-manifest.json';

(async () => {
  if (!Capacitor.isNativePlatform()) return;

  const platform = Capacitor.getPlatform();
  document.documentElement.classList.add('yc-native-app', 'yc-native-' + platform);
  const appInfo = await App.getInfo().catch(() => null);
  window.__YAMACHAT_MOBILE__ = {
    native: true,
    platform,
    version: appInfo?.version || '1.0.0',
    build: appInfo?.build || ''
  };
  window.ycNativeNotificationPermission = async () => (await LocalNotifications.checkPermissions()).display === 'granted';
  window.ycNativeShowNotification = async payload => {
    if (!(await window.ycNativeNotificationPermission!())) return false;
    await LocalNotifications.schedule({notifications:[{id:Math.floor(Math.random()*2147483646)+1,title:payload.title||'Yamachat',body:[payload.where,payload.body].filter(Boolean).join(' · '),extra:payload.target||{},channelId:'yamachat-messages'}]});
    return true;
  };
  if(platform==='android')void LocalNotifications.createChannel({id:'yamachat-messages',name:'Zprávy Yamachat',importance:4}).catch(()=>{});
  void LocalNotifications.addListener('localNotificationActionPerformed',action=>{
    void window.ycOpenDesktopNotificationTarget?.(action.notification.extra||{});
  });

  // Capacitor app uses bundled files, not the browser service worker cache.
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    if (regs) await Promise.all(regs.map(r => r.unregister()));
  } catch {}

  try {
    await StatusBar.setStyle({ style: Style.Light });
    if (platform === 'ios') {
      // Let Yamachat paint underneath the iPhone status bar. The responsive
      // layout already reserves env(safe-area-inset-top), so content stays
      // below the clock while the ugly white strip disappears.
      await StatusBar.setOverlaysWebView({ overlay: true });
    }
    if (platform === 'android') {
      await StatusBar.setBackgroundColor({ color: '#071019' });
    }
  } catch {}

  const hideSplash = async () => {
    try { await SplashScreen.hide(); } catch {}
  };
  // Never let a delayed image/network resource leave the native launch screen
  // covering Yamachat indefinitely. DOM readiness shows the bundled Yamachat
  // boot/auth UI; load remains the normal path and the timeout is a hard guard.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(hideSplash, 120), { once: true });
  } else {
    setTimeout(hideSplash, 120);
  }
  window.addEventListener('load', () => setTimeout(hideSplash, 120), { once: true });
  setTimeout(hideSplash, 2200);

  try {
    await Keyboard.addListener('keyboardWillShow', () => {document.documentElement.dataset.nativeKeyboard='true';document.documentElement.classList.add('yc-keyboard-open')});
    await Keyboard.addListener('keyboardWillHide', () => {delete document.documentElement.dataset.nativeKeyboard;document.documentElement.classList.remove('yc-keyboard-open')});
  } catch {}

  try {
    App.addListener('appStateChange', ({ isActive }) => {
      window.dispatchEvent(new CustomEvent('yamachat:native-app-state', { detail: { isActive } }));
    });
    App.addListener('backButton', ({ canGoBack }) => {
      if (window.ycCloseMobileSurface?.()) return;
      const nav = document.getElementById('ycGlobalNav');
      const side = document.getElementById('side');
      const right = document.querySelector('.yc-v3-content-grid>.right');
      const app = document.getElementById('app');

      const drawerOpen =
        nav?.classList.contains('yc-mobile-open') ||
        side?.classList.contains('mobile-open') ||
        right?.classList.contains('yc-mobile-open');

      if (drawerOpen) {
        nav?.classList.remove('yc-mobile-open');
        side?.classList.remove('mobile-open');
        right?.classList.remove('yc-mobile-open');
        app?.classList.remove('yc-mobile-drawer-open');
        return;
      }
      if (canGoBack) history.back();
    });
  } catch {}

  let pushToken = '';
  try {
    PushNotifications.addListener('registration', token => {
      pushToken = token.value || '';
      window.dispatchEvent(new CustomEvent('yamachat:native-push-token', { detail: { token: pushToken, platform } }));
    });
    PushNotifications.addListener('pushNotificationReceived', notification => {
      window.dispatchEvent(new CustomEvent('yamachat:native-push', { detail: notification }));
    });
    PushNotifications.addListener('pushNotificationActionPerformed', action => {
      window.dispatchEvent(new CustomEvent('yamachat:native-push-action', { detail: action }));
    });
  } catch {}


  const updateUi = {
    root: null as HTMLDivElement | null,
    card: null as HTMLDivElement | null,
    title: null as HTMLHeadingElement | null,
    text: null as HTMLParagraphElement | null,
    notes: null as HTMLDivElement | null,
    progressWrap: null as HTMLDivElement | null,
    progressBar: null as HTMLDivElement | null,
    progressText: null as HTMLSpanElement | null,
    button: null as HTMLButtonElement | null,
    later: null as HTMLButtonElement | null,
    current: null as any
  };

  const normalizeNotes = (value: unknown) => {
    if (Array.isArray(value)) return value.map(x => String(x || '').trim()).filter(Boolean).join('\n');
    return String(value || '').trim();
  };

  const nativeUpdateSettingsState = {
    registered: false,
    checking: false,
    message: '',
    latestVersion: ''
  };

  const syncNativeUpdateSettingsDom = (scope: ParentNode = document) => {
    const status = scope.querySelector?.('#ycNativeSettingsUpdateState') as HTMLElement | null;
    const button = scope.querySelector?.('#ycNativeSettingsUpdateCheck') as HTMLButtonElement | null;
    const latest = scope.querySelector?.('#ycNativeSettingsUpdateLatest') as HTMLElement | null;
    if (status) status.textContent = nativeUpdateSettingsState.message || 'Kontrola probíhá automaticky po spuštění aplikace.';
    if (latest) latest.textContent = nativeUpdateSettingsState.latestVersion ? 'Dostupná verze ' + nativeUpdateSettingsState.latestVersion : '';
    if (button) {
      button.disabled = nativeUpdateSettingsState.checking;
      button.textContent = nativeUpdateSettingsState.checking ? 'KONTROLUJI…' : 'ZKONTROLOVAT AKTUALIZACE';
    }
  };

  const ensureUpdateUi = () => {
    if (updateUi.root || !document.body) return updateUi.root;
    const style = document.createElement('style');
    style.textContent = `
      #ycNativeUpdateGate{position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;padding:22px;background:rgba(2,7,12,.84);backdrop-filter:blur(10px)}
      #ycNativeUpdateGate.show{display:flex}
      #ycNativeUpdateCard{width:min(440px,100%);max-height:min(660px,calc(100dvh - 44px));overflow:auto;border:1px solid rgba(224,86,253,.48);border-radius:18px;padding:26px;background:linear-gradient(180deg,rgba(12,24,34,.985),rgba(6,12,19,.995));box-shadow:0 26px 90px rgba(0,0,0,.62),0 0 36px rgba(53,231,255,.10);color:#edfaff;font-family:Inter,Segoe UI,Arial,sans-serif}
      #ycNativeUpdateBrand{display:flex;align-items:center;gap:11px;margin-bottom:20px}
      #ycNativeUpdateBrand img{width:46px;height:46px;object-fit:contain;filter:drop-shadow(0 0 12px rgba(53,231,255,.2))}
      #ycNativeUpdateBrand b{font-size:18px;letter-spacing:.01em}
      #ycNativeUpdatePill{display:inline-flex;padding:5px 9px;border:1px solid rgba(53,231,255,.24);border-radius:999px;color:#8eeaff;background:rgba(53,231,255,.06);font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
      #ycNativeUpdateTitle{margin:14px 0 7px;font-size:24px;line-height:1.12}
      #ycNativeUpdateText{margin:0;color:#8da7b7;font-size:14px;line-height:1.55}
      #ycNativeUpdateDetails{margin-top:15px;border:1px solid rgba(92,128,149,.22);border-radius:12px;background:#07131c}
      #ycNativeUpdateDetails summary{cursor:pointer;list-style:none;padding:12px 14px;color:#b6d5e5;font-weight:800;font-size:12px}
      #ycNativeUpdateDetails summary::-webkit-details-marker{display:none}
      #ycNativeUpdateNotes{white-space:pre-wrap;padding:0 14px 13px;color:#7897a8;font-size:12px;line-height:1.55}
      #ycNativeUpdateProgress{display:none;margin-top:16px}
      #ycNativeUpdateProgress.show{display:block}
      #ycNativeUpdateTrack{height:8px;border-radius:999px;overflow:hidden;background:#102531;border:1px solid rgba(53,231,255,.18)}
      #ycNativeUpdateBar{height:100%;width:0%;background:linear-gradient(90deg,#35e7ff,#e056fd);transition:width .18s ease}
      #ycNativeUpdateProgressText{display:block;margin-top:7px;color:#7fa2b6;font-size:11px}
      #ycNativeUpdateActions{display:flex;gap:10px;margin-top:20px}
      #ycNativeUpdateButton,#ycNativeUpdateLater{min-height:50px;border-radius:12px;font-weight:950;letter-spacing:.06em}
      #ycNativeUpdateButton{flex:1;border:1px solid rgba(224,86,253,.76);background:linear-gradient(135deg,#35e7ff 0%,#8d72ff 48%,#e056fd 100%);color:#041017;box-shadow:0 0 26px rgba(224,86,253,.18)}
      #ycNativeUpdateButton:disabled{opacity:.58}
      #ycNativeUpdateLater{display:none;padding:0 14px;border:1px solid #294758;background:#0a1822;color:#9ab9ca}
      #ycNativeUpdateLater.show{display:block}
    `;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'ycNativeUpdateGate';
    root.innerHTML = `
      <div id="ycNativeUpdateCard" role="dialog" aria-modal="true" aria-labelledby="ycNativeUpdateTitle">
        <div id="ycNativeUpdateBrand"><img src="./build/yamachat-logo-symbol.png" alt=""><div><div id="ycNativeUpdatePill">Aktualizace Yamachat</div><b>Yamachat</b></div></div>
        <h2 id="ycNativeUpdateTitle">Aktualizace je vyžadována</h2>
        <p id="ycNativeUpdateText"></p>
        <details id="ycNativeUpdateDetails"><summary>⌄ Co je nového</summary><div id="ycNativeUpdateNotes"></div></details>
        <div id="ycNativeUpdateProgress"><div id="ycNativeUpdateTrack"><div id="ycNativeUpdateBar"></div></div><span id="ycNativeUpdateProgressText"></span></div>
        <div id="ycNativeUpdateActions"><button id="ycNativeUpdateLater" type="button">Později</button><button id="ycNativeUpdateButton" type="button">STÁHNOUT A NAINSTALOVAT</button></div>
      </div>
    `;
    document.body.appendChild(root);
    updateUi.root = root;
    updateUi.card = root.querySelector('#ycNativeUpdateCard');
    updateUi.title = root.querySelector('#ycNativeUpdateTitle');
    updateUi.text = root.querySelector('#ycNativeUpdateText');
    updateUi.notes = root.querySelector('#ycNativeUpdateNotes');
    updateUi.progressWrap = root.querySelector('#ycNativeUpdateProgress');
    updateUi.progressBar = root.querySelector('#ycNativeUpdateBar');
    updateUi.progressText = root.querySelector('#ycNativeUpdateProgressText');
    updateUi.button = root.querySelector('#ycNativeUpdateButton');
    updateUi.later = root.querySelector('#ycNativeUpdateLater');

    updateUi.later?.addEventListener('click', () => {
      if (updateUi.current?.required) return;
      updateUi.root?.classList.remove('show');
    });

    updateUi.button?.addEventListener('click', async () => {
      const item = updateUi.current;
      if (!item || platform !== 'android' || !updateUi.button) return;
      updateUi.button.disabled = true;
      updateUi.button.textContent = 'PŘIPRAVUJI AKTUALIZACI…';
      updateUi.progressWrap?.classList.add('show');
      if (updateUi.progressText) updateUi.progressText.textContent = 'Kontroluji oprávnění Androidu…';
      try {
        const result = await YamachatUpdate.downloadAndInstall({
          url: String(item.apkUrl || ''),
          version: String(item.latestVersion || ''),
          sha256: String(item.sha256 || '')
        });
        if (result?.permissionRequired) {
          updateUi.button.disabled = false;
          updateUi.button.textContent = 'POVOLIT A POKRAČOVAT';
          if (updateUi.progressText) updateUi.progressText.textContent = 'Android otevřel nastavení. Povol instalaci z Yamachatu, vrať se sem a klepni znovu.';
          return;
        }
        if (updateUi.progressText) updateUi.progressText.textContent = 'Stahuji aktualizaci…';
      } catch (error) {
        updateUi.button.disabled = false;
        updateUi.button.textContent = 'ZKUSIT ZNOVU';
        if (updateUi.progressText) updateUi.progressText.textContent = String((error as any)?.message || error || 'Aktualizaci se nepodařilo spustit.');
      }
    });
    return root;
  };

  const showNativeUpdate = (item: any) => {
    nativeUpdateSettingsState.latestVersion = String(item?.latestVersion || '');
    nativeUpdateSettingsState.message = nativeUpdateSettingsState.latestVersion
      ? 'Je dostupná nová verze ' + nativeUpdateSettingsState.latestVersion + '.'
      : 'Je dostupná nová aktualizace.';
    syncNativeUpdateSettingsDom();
    const root = ensureUpdateUi();
    if (!root) return;
    updateUi.current = item;
    const required = item.required !== false;
    if (updateUi.title) updateUi.title.textContent = required ? 'Aktualizace je vyžadována' : 'Je dostupná nová aktualizace';
    if (updateUi.text) updateUi.text.textContent = `Verze ${item.latestVersion || ''} je dostupná. ${required ? 'Pro pokračování aktualizuj Yamachat.' : 'Můžeš ji nainstalovat teď.'}`;
    if (updateUi.notes) updateUi.notes.textContent = normalizeNotes(item.notes) || 'Vylepšení stability, oprav a funkcí Yamachatu.';
    updateUi.later?.classList.toggle('show', !required);
    if (updateUi.button) {
      updateUi.button.disabled = false;
      updateUi.button.textContent = 'STÁHNOUT A NAINSTALOVAT';
    }
    updateUi.progressWrap?.classList.remove('show');
    if (updateUi.progressBar) updateUi.progressBar.style.width = '0%';
    root.classList.add('show');
  };

  if (platform === 'android') {
    void YamachatUpdate.addListener('updateProgress', event => {
      ensureUpdateUi();
      const percent = Math.max(0, Math.min(100, Number(event.percent || 0)));
      if (updateUi.progressBar) updateUi.progressBar.style.width = percent + '%';
      updateUi.progressWrap?.classList.add('show');
      if (event.status === 'downloading') {
        if (updateUi.progressText) updateUi.progressText.textContent = 'Stahuji aktualizaci… ' + Math.round(percent) + ' %';
      } else if (event.status === 'verifying') {
        if (updateUi.progressText) updateUi.progressText.textContent = 'Ověřuji staženou APK…';
      } else if (event.status === 'ready') {
        if (updateUi.progressBar) updateUi.progressBar.style.width = '100%';
        if (updateUi.progressText) updateUi.progressText.textContent = 'Potvrď instalaci v systémovém okně Androidu.';
      } else if (event.status === 'error') {
        if (updateUi.progressText) updateUi.progressText.textContent = event.message || 'Aktualizace se nepodařila.';
        if (updateUi.button) {
          updateUi.button.disabled = false;
          updateUi.button.textContent = 'ZKUSIT ZNOVU';
        }
      }
    }).catch(() => {});

    const checkNativeUpdate = async () => {
      nativeUpdateSettingsState.checking = true;
      nativeUpdateSettingsState.message = 'Kontroluji dostupné aktualizace…';
      syncNativeUpdateSettingsDom();
      let currentCode = 0;
      let latestCode = 0;
      try {
        const info = await App.getInfo();
        currentCode = Number.parseInt(String(info.build || '0'), 10) || 0;
        const url = YAMACHAT_UPDATE_MANIFEST_URL + '?t=' + Date.now();
        const response = await CapacitorHttp.get({ url, headers: { 'Cache-Control': 'no-cache' } });
        if (response.status < 200 || response.status >= 300) throw new Error('Server aktualizací odpověděl stavem ' + response.status + '.');
        const manifest = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        const item = manifest?.android;
        latestCode = Number(item?.latestVersionCode || 0);
        if (!item || !item.apkUrl || latestCode <= currentCode) {
          nativeUpdateSettingsState.latestVersion = '';
          nativeUpdateSettingsState.message = 'Používáš nejnovější verzi Yamachatu.';
          return { available: false, currentCode, latestCode, item };
        }
        nativeUpdateSettingsState.latestVersion = String(item.latestVersion || '');
        nativeUpdateSettingsState.message = 'Je dostupná nová verze ' + (nativeUpdateSettingsState.latestVersion || latestCode) + '.';
        showNativeUpdate(item);
        return { available: true, currentCode, latestCode, item };
      } catch (error) {
        const message = String((error as any)?.message || error || 'Kontrolu aktualizací se nepodařilo dokončit.');
        nativeUpdateSettingsState.message = message;
        console.warn('Yamachat Android update check failed', error);
        return { available: false, currentCode, latestCode, error: message };
      } finally {
        nativeUpdateSettingsState.checking = false;
        syncNativeUpdateSettingsDom();
      }
    };

    window.ycNativeCheckForUpdates = checkNativeUpdate;

    const registerNativeUpdateSettings = () => {
      if (nativeUpdateSettingsState.registered) return true;
      const api = (window as any).YamachatAppSettings;
      if (!api?.register) return false;
      api.register({
        id: 'updates',
        title: 'Aktualizace Yamachatu',
        description: 'Android kontroluje nové verze automaticky. Kontrolu můžeš kdykoliv spustit i ručně.',
        render: () => {
          const version = window.__YAMACHAT_MOBILE__?.version || appInfo?.version || '—';
          const build = window.__YAMACHAT_MOBILE__?.build || appInfo?.build || '';
          return '<div class="yc-update-card"><div class="yc-update-head"><div class="yc-update-logo">Y</div><div class="yc-update-copy"><strong>Yamachat Android</strong><small>Nativní aktualizace APK přímo v aplikaci</small></div></div><div class="yc-update-body"><div class="yc-update-version"><span>Nainstalováno <b>' + version + (build ? ' · build ' + build : '') + '</b></span><span id="ycNativeSettingsUpdateLatest"></span></div><div id="ycNativeSettingsUpdateState" class="yc-update-detail">Kontrola probíhá automaticky po spuštění aplikace.</div><div class="yc-update-actions"><button id="ycNativeSettingsUpdateCheck" class="primary" type="button">ZKONTROLOVAT AKTUALIZACE</button></div><div class="yc-update-safety">✓ APK se před instalací ověřuje kontrolním součtem a používá stálý podpis Yamachatu.</div></div></div>';
        },
        bind: (root: HTMLElement) => {
          syncNativeUpdateSettingsDom(root);
          root.querySelector<HTMLButtonElement>('#ycNativeSettingsUpdateCheck')?.addEventListener('click', () => {
            void checkNativeUpdate();
          });
        }
      });
      nativeUpdateSettingsState.registered = true;
      return true;
    };

    const settingsRegistrationTimer = window.setInterval(() => {
      if (registerNativeUpdateSettings()) window.clearInterval(settingsRegistrationTimer);
    }, 250);
    window.setTimeout(() => window.clearInterval(settingsRegistrationTimer), 15000);

    const scheduleNativeUpdateCheck = () => setTimeout(() => { void checkNativeUpdate(); }, 2600);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleNativeUpdateCheck, { once: true });
    else scheduleNativeUpdateCheck();
    App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) setTimeout(() => { void checkNativeUpdate(); }, 900);
    });
  }

  window.ycNativeRequestNotifications = async () => {
    try {
      const permission = await LocalNotifications.requestPermissions();
      return { granted: permission.display === 'granted' };
    } catch {
      return { granted: false };
    }
  };
})();
