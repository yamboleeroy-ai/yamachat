import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import { PushNotifications } from '@capacitor/push-notifications';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

declare global {
  interface Window {
    __YAMACHAT_MOBILE__?: {
      native: boolean;
      platform: string;
      version: string;
    };
    ycNativeRequestNotifications?: () => Promise<{granted:boolean; token?:string}>;
  }
}

(async () => {
  if (!Capacitor.isNativePlatform()) return;

  const platform = Capacitor.getPlatform();
  document.documentElement.classList.add('yc-native-app', 'yc-native-' + platform);
  window.__YAMACHAT_MOBILE__ = { native: true, platform, version: '1.0.0' };

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
  if (document.readyState === 'complete') setTimeout(hideSplash, 120);
  else window.addEventListener('load', () => setTimeout(hideSplash, 120), { once: true });

  try {
    Keyboard.addListener('keyboardWillShow', () => document.documentElement.classList.add('yc-native-keyboard-open'));
    Keyboard.addListener('keyboardWillHide', () => document.documentElement.classList.remove('yc-native-keyboard-open'));
  } catch {}

  try {
    App.addListener('appStateChange', ({ isActive }) => {
      window.dispatchEvent(new CustomEvent('yamachat:native-app-state', { detail: { isActive } }));
    });
    App.addListener('backButton', ({ canGoBack }) => {
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
      let permission = await PushNotifications.checkPermissions();
      if (permission.receive === 'prompt') permission = await PushNotifications.requestPermissions();
      if (permission.receive !== 'granted') return { granted: false };
      await PushNotifications.register();
      return { granted: true, token: pushToken || undefined };
    } catch {
      return { granted: false };
    }
  };
})();
