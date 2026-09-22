import { Capacitor } from '@capacitor/core';
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
    };
    ycNativeRequestNotifications?: () => Promise<{granted:boolean; token?:string}>;
    ycCloseMobileSurface?: () => boolean;
    ycNativeNotificationPermission?: () => Promise<boolean>;
    ycNativeShowNotification?: (payload: {title?:string;body?:string;where?:string;target?:Record<string,string>}) => Promise<boolean>;
    ycOpenDesktopNotificationTarget?: (target: Record<string,string>) => Promise<void>;
  }
}

(async () => {
  if (!Capacitor.isNativePlatform()) return;

  const platform = Capacitor.getPlatform();
  document.documentElement.classList.add('yc-native-app', 'yc-native-' + platform);
  window.__YAMACHAT_MOBILE__ = { native: true, platform, version: '1.0.0' };
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

  window.ycNativeRequestNotifications = async () => {
    try {
      const permission = await LocalNotifications.requestPermissions();
      return { granted: permission.display === 'granted' };
    } catch {
      return { granted: false };
    }
  };
})();
