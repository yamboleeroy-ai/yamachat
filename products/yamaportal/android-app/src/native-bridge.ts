import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { Keyboard } from '@capacitor/keyboard';
import { StatusBar, Style } from '@capacitor/status-bar';
import { registerPlugin } from '@capacitor/core';

declare global { interface Window { YamaNative?: any } }

if (Capacitor.isNativePlatform()) {
  interface YamaLauncherPlugin {
    apps(): Promise<{ apps: Array<{ id: string; installed: boolean }> }>;
    launch(options: { id: string }): Promise<{ launched: boolean }>;
    returnToPortal(): Promise<{ returned: boolean }>;
  }
  const Launcher = registerPlugin<YamaLauncherPlugin>('YamaAppLauncher');
  document.documentElement.classList.add('android-shell');
  document.documentElement.dataset.portalPlatform = 'android';
  const callbackUrl = 'eu.yamaportal.app://auth-callback';
  const callbacks = new Set<(url: string) => void>();
  let pending: { started: number } | null = null;
  const allowedAuthHosts = new Set([
    'bxjvmjdppmqgbxfcowpf.supabase.co', 'accounts.google.com', 'login.microsoftonline.com',
    'login.seznam.cz', 'appleid.apple.com', 'facebook.com', 'www.facebook.com',
    'discord.com', 'github.com', 'mojeid.cz', 'www.mojeid.cz'
  ]);

  const receive = async (value: string) => {
    let url: URL;
    try { url = new URL(value); } catch { return; }
    if (url.protocol !== 'eu.yamaportal.app:' || url.hostname !== 'auth-callback' || url.username || url.password || url.port || !['', '/'].includes(url.pathname) || url.hash || value.length > 4096) return;
    if (!pending || Date.now() - pending.started > 600_000 || Date.now() < pending.started) return;
    if ([...url.searchParams.keys()].some(key => !['code', 'error', 'error_description', 'error_code'].includes(key))) return;
    const codes = url.searchParams.getAll('code');
    const errors = url.searchParams.getAll('error');
    if (!((codes.length === 1 && !!codes[0] && errors.length === 0) || (errors.length === 1 && !!errors[0] && codes.length === 0))) return;
    pending = null;
    await Browser.close().catch(() => undefined);
    for (const callback of callbacks) callback(url.href);
  };

  const native = {
    platform: 'android',
    apps: async () => (await Launcher.apps()).apps,
    launch: (id: string) => Launcher.launch({ id }),
    returnToPortal: () => Launcher.returnToPortal(),
    storage: {
      getItem: (key: string) => SecureStorage.getItem(key),
      setItem: (key: string, value: string) => SecureStorage.setItem(key, value),
      removeItem: (key: string) => SecureStorage.removeItem(key)
    },
    oauth: {
      callbackUrl,
      async begin(value: string, callback: string) {
        if (callback !== callbackUrl || !value || value.length > 4096) throw new Error('Návrat přihlášení ještě není schválený.');
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || url.port || !allowedAuthHosts.has(url.hostname)) throw new Error('Neplatná přihlašovací adresa.');
        if (pending && Date.now() - pending.started < 600_000) throw new Error('Přihlášení již probíhá.');
        pending = { started: Date.now() };
        try { await Browser.open({ url: url.href }); }
        catch { pending = null; throw new Error('Systémový prohlížeč se nepodařilo otevřít.'); }
      },
      async cancel() { pending = null; await Browser.close().catch(() => undefined); },
      onCallback(callback: (url: string) => void) { callbacks.add(callback); return () => callbacks.delete(callback); }
    }
  };
  Object.defineProperty(window, 'YamaNative', { value: Object.freeze(native), configurable: false, writable: false });
  void StatusBar.setStyle({ style: Style.Dark });
  void StatusBar.setBackgroundColor({ color: '#030a17' });
  void Keyboard.setResizeMode({ mode: 'native' });
  void App.addListener('appUrlOpen', event => { void receive(event.url); });
  void App.getLaunchUrl().then(event => { if (event?.url) void receive(event.url); });
  void App.addListener('backButton', () => {
    const dialog = document.querySelector('dialog[open]') as HTMLDialogElement | null;
    if (dialog) { dialog.close(); return; }
    if (location.hash && location.hash !== '#domu') { location.hash = 'domu'; return; }
  });
}
