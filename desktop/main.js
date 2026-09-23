const {
  app,
  BrowserWindow,
  shell,
  session,
  desktopCapturer,
  powerSaveBlocker,
  Tray,
  Menu,
  dialog,
  nativeImage,
  ipcMain,
  screen
} = require('electron')

const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { YamachatUpdater } = require('./updater');

let mainWindow = null;
let yamachatUpdater = null;
let powerSaveId = null;
let tray = null;
let trayPollTimer = null;
let trayPollGeneration = 0;
let isQuitting = false;
let closePromptOpen = false;
let notificationWindow = null;
let notificationCloseTimer = null;
let notificationTarget = null;
let lastTrayStateKey = '';
let traySpeakingHoldUntil = 0;
const TRAY_SPEAKING_HOLD_MS = 480;
const DEFAULT_APP_SETTINGS = { closeBehavior: 'ask', uiThemeColor: '#e056fd', uiThemeColors: {}, sidebarCollapsed: false, serverCardBackgrounds: {} };
let appSettings = { ...DEFAULT_APP_SETTINGS };

const desktopUrl = pathToFileURL(path.join(__dirname, 'desktop.html')).href;
function isClientFrame(frame) {
  if (!frame || !mainWindow || mainWindow.isDestroyed()) return false;
  const top = mainWindow.webContents.mainFrame;
  return (frame === top && frame.url === desktopUrl) ||
    (frame.parent === top && frame.url === 'about:srcdoc');
}
function handleClientIpc(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    const notification = channel === 'yamachat:notification-open' || channel === 'yamachat:notification-close';
    const expected = notification ? notificationWindow : mainWindow;
    if (!expected || expected.isDestroyed() || event.sender !== expected.webContents || event.senderFrame !== expected.webContents.mainFrame) {
      throw new Error('Untrusted Yamachat IPC sender');
    }
    return handler(event, ...args);
  });
}
function openSafeExternal(url) {
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:', 'mailto:'].includes(parsed.protocol)) return;
    void shell.openExternal(parsed.href).catch(error => console.warn('External link:', error.message));
  } catch {}
}

const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();
app.on('second-instance', () => showMainWindow());

function appSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadAppSettings() {
  try {
    const raw = fs.readFileSync(appSettingsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_APP_SETTINGS,
      ...(parsed && typeof parsed === 'object' ? parsed : {})
    };
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

function saveAppSettings() {
  try {
    const file = appSettingsPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(appSettings, null, 2), 'utf8');
  } catch (error) {
    console.warn('Yamachat settings save failed', error);
  }
}

function setAppSetting(key, value) {
  if (key === 'closeBehavior' && ['ask', 'tray', 'quit'].includes(value)) {
    appSettings.closeBehavior = value;
    saveAppSettings();
    return { ...appSettings };
  }

  if (key === 'uiThemeColor') {
    const color = String(value || '').trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(color)) {
      throw new Error('Invalid Yamachat UI color');
    }
    appSettings.uiThemeColor = color;
    saveAppSettings();
    return { ...appSettings };
  }

  if (key === 'uiThemeColorForUser' && value && typeof value === 'object') {
    const userId = String(value.userId || '').trim();
    const color = String(value.color || '').trim().toLowerCase();
    if (!userId || userId.length > 160 || !/^#[0-9a-f]{6}$/.test(color)) {
      throw new Error('Invalid account-scoped Yamachat UI color');
    }
    const colors = appSettings.uiThemeColors && typeof appSettings.uiThemeColors === 'object'
      ? { ...appSettings.uiThemeColors }
      : {};
    colors[userId] = color;
    appSettings.uiThemeColors = colors;
    appSettings.uiThemeColor = color;
    saveAppSettings();
    return { ...appSettings };
  }

  if (key === 'sidebarCollapsed') {
    appSettings.sidebarCollapsed = value === true;
    saveAppSettings();
    return { ...appSettings };
  }

  if (key === 'serverCardBackground' && value && typeof value === 'object') {
    const communityId = String(value.communityId || '').trim();
    const background = String(value.background || '').trim();
    if (!communityId || communityId.length > 160) {
      throw new Error('Invalid Yamachat community id');
    }
    if (background && (!/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(background) || background.length > 1200000)) {
      throw new Error('Invalid or too large server card background');
    }
    const backgrounds = appSettings.serverCardBackgrounds && typeof appSettings.serverCardBackgrounds === 'object'
      ? { ...appSettings.serverCardBackgrounds }
      : {};
    if (background) backgrounds[communityId] = background;
    else delete backgrounds[communityId];
    appSettings.serverCardBackgrounds = backgrounds;
    saveAppSettings();
    return { ...appSettings };
  }

  throw new Error('Unsupported Yamachat setting: ' + key);
}

let desktopState = {
  voiceConnected: false,
  voiceChannelId: '',
  voiceChannelName: '',
  voiceMuted: false,
  voiceDeafened: false,
  voiceSpeaking: false,
  presenceMode: 'online',
  notificationUnreadCount: 0,
  screenShareActive: false
};

app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

function yamachatBrandIconDataUrl() {
  try {
    const image = nativeImage.createFromPath(
      path.join(__dirname, 'build', 'app-icon-source.png')
    );
    return image.isEmpty() ? '' : image.toDataURL();
  } catch {
    return '';
  }
}


function ycEscapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ycNormalizeAccent(value) {
  const color = String(value || '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : '#70e4e8';
}

function ycNotificationHtml(payload = {}) {
  const title = ycEscapeHtml(payload.title || 'Yamachat');
  const sender = ycEscapeHtml(payload.sender || payload.title || 'Yamachat');
  const where = ycEscapeHtml(payload.where || 'Nová zpráva');
  const body = ycEscapeHtml(payload.body || 'Nová zpráva');
  const avatar = String(payload.avatar || '').trim();
  const avatarHtml = /^(https?:|data:image\/)/i.test(avatar)
    ? `<img class="avatar" src="${ycEscapeHtml(avatar)}" alt="">`
    : `<div class="avatar fallback">${ycEscapeHtml((payload.initials || sender.slice(0, 2) || 'Y').toUpperCase())}</div>`;
  const accent = ycNormalizeAccent(payload.accent || appSettings.uiThemeColor);
  const mention = payload.mentioned === true;
  const brandImage = nativeImage.createFromPath(path.join(__dirname, 'build', 'yamachat-logo-full.png'));
  const brandLogo = !brandImage.isEmpty() ? brandImage.resize({ width: 112 }).toDataURL() : '';
  const brandHtml = brandLogo
    ? `<img class="brand-logo" src="${brandLogo}" alt="Yamachat">`
    : `<div class="brand-text">Yamachat</div>`;
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  :root{--a:${accent};--bg:#07131d;--bg2:#0c1e2a;--line:color-mix(in srgb,var(--a) 40%,#233845);font-family:Inter,"Segoe UI",Arial,sans-serif}
  *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;background:transparent;overflow:hidden;color:#edfaff}
  body{padding:1px}.card{height:100%;position:relative;overflow:hidden;border:1px solid var(--line);border-radius:15px;background:radial-gradient(circle at 10% -20%,color-mix(in srgb,var(--a) 19%,transparent),transparent 48%),linear-gradient(135deg,#102532 0%,#091720 62%,#07121a 100%);box-shadow:0 18px 55px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.05);display:grid;grid-template-columns:52px minmax(0,1fr) 32px;gap:11px;padding:14px 12px;cursor:pointer;user-select:none}
  .card:before{content:"";position:absolute;left:0;top:12px;bottom:12px;width:3px;border-radius:3px;background:var(--a);box-shadow:0 0 17px color-mix(in srgb,var(--a) 72%,transparent)}
  .brand{position:absolute;right:43px;top:9px;display:flex;align-items:center;justify-content:flex-end;max-width:118px;height:22px;opacity:.95}.brand-logo{display:block;max-width:112px;max-height:18px;width:auto;height:auto;object-fit:contain;filter:drop-shadow(0 0 8px color-mix(in srgb,var(--a) 22%,transparent))}.brand-text{font-size:9px;font-weight:900;letter-spacing:.13em;text-transform:uppercase;color:color-mix(in srgb,var(--a) 70%,#a7c6d6);opacity:.82}
  .avatar{width:48px;height:48px;border-radius:12px;object-fit:cover;border:2px solid color-mix(in srgb,var(--a) 64%,#203746);box-shadow:0 0 0 2px rgba(0,0,0,.38),0 0 18px color-mix(in srgb,var(--a) 16%,transparent)}.fallback{display:grid;place-items:center;font-weight:900;background:#102633;color:#dffaff}.copy{min-width:0;padding-top:3px}.top{display:flex;align-items:center;gap:7px;min-width:0}.sender{font-size:13px;font-weight:900;color:#f3fbff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mention{font-size:9px;font-weight:900;padding:2px 6px;border-radius:999px;color:#08151d;background:${mention ? 'var(--a)' : 'transparent'};display:${mention ? 'inline-block' : 'none'}}.where{font-size:10px;color:#7fa1b2;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.body{font-size:11px;line-height:1.35;color:#b8ced9;margin-top:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.close{align-self:start;width:28px;height:28px;border:0;border-radius:8px;background:transparent;color:#7694a4;font-size:19px;line-height:1;cursor:pointer}.close:hover{background:rgba(255,255,255,.07);color:white}.hint{position:absolute;right:45px;bottom:8px;font-size:8px;color:#607f8e}.card:hover{border-color:color-mix(in srgb,var(--a) 67%,#324f60);filter:brightness(1.04)}
  </style></head><body><div class="card" id="open"><div class="brand">${brandHtml}</div>${avatarHtml}<div class="copy"><div class="top"><div class="sender">${sender}</div><span class="mention">ZMÍNKA</span></div><div class="where">${where}</div><div class="body">${body}</div></div><button class="close" id="close" aria-label="Zavřít">×</button><div class="hint">Klikni pro otevření zprávy</div></div><script>
  const api=window.yamachatNotification;
  document.getElementById('open').addEventListener('click',e=>{if(e.target.closest('#close'))return;api?.open?.()});
  document.getElementById('close').addEventListener('click',e=>{e.stopPropagation();api?.close?.()});
</script></body></html>`;
}

function closeYamachatNotification() {
  if (notificationCloseTimer) {
    clearTimeout(notificationCloseTimer);
    notificationCloseTimer = null;
  }
  if (notificationWindow && !notificationWindow.isDestroyed()) notificationWindow.close();
  notificationWindow = null;
  notificationTarget = null;
}

function positionYamachatNotification(win) {
  try {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const area = display.workArea;
    const [w, h] = win.getSize();
    win.setPosition(Math.round(area.x + area.width - w - 18), Math.round(area.y + area.height - h - 18), false);
  } catch {}
}

function showYamachatNotification(payload = {}) {
  try {
    if (notificationCloseTimer) clearTimeout(notificationCloseTimer);
    notificationTarget = payload.target && typeof payload.target === 'object' ? { ...payload.target } : null;
    if (notificationWindow && !notificationWindow.isDestroyed()) {
      notificationWindow.close();
      notificationWindow = null;
    }
    const win = new BrowserWindow({
      width: 420,
      height: 126,
      frame: false,
      transparent: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
        preload: path.join(__dirname, 'notification-preload.js')
      }
    });
    notificationWindow = win;
    win.setAlwaysOnTop(true, 'floating');
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(ycNotificationHtml(payload)));
    win.once('ready-to-show', () => {
      if (win.isDestroyed()) return;
      positionYamachatNotification(win);
      win.showInactive();
    });
    win.on('closed', () => {
      if (notificationWindow === win) notificationWindow = null;
    });
    notificationCloseTimer = setTimeout(() => closeYamachatNotification(), payload.mentioned ? 11000 : 8000);
    return true;
  } catch (error) {
    console.warn('Yamachat custom notification failed', error);
    return false;
  }
}

function openYamachatNotificationTarget() {
  const target = notificationTarget ? { ...notificationTarget } : null;
  closeYamachatNotification();
  if (!target || !mainWindow || mainWindow.isDestroyed()) return false;
  try {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    wakeBackgroundAudio(mainWindow);
    setTimeout(() => {
      try {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send('yamachat:open-notification-target', target);
      } catch {}
    }, 120);
    return true;
  } catch (error) {
    console.warn('Yamachat notification target open failed', error);
    return false;
  }
}

// ----------------------------------------------------
// VÝBĚR OBRAZOVKY / OKNA
// ----------------------------------------------------

async function chooseDesktopSource(parentWindow) {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: {
      width: 320,
      height: 180
    },
    fetchWindowIcons: true
  });

  if (!sources.length) {
    return null;
  }

  return new Promise((resolve) => {
    let finished = false;

    const picker = new BrowserWindow({
      width: 980,
      height: 700,
      minWidth: 760,
      minHeight: 500,
      parent: parentWindow || undefined,
      modal: !!parentWindow,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#101820',

      webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
      }
    });

    const finish = (source) => {
      if (finished) return;
      finished = true;

      resolve(source || null);

      if (!picker.isDestroyed()) {
        picker.destroy();
      }
    };

    const screenSources = sources.filter(
      source => source.id.startsWith('screen:')
    );

    const windowSources = sources.filter(
      source => !source.id.startsWith('screen:')
    );

    function sourceCard(source, type) {
      const thumb = source.thumbnail.toDataURL();

      return `
        <button
          class="source-card"
          onclick="chooseSource('${encodeURIComponent(source.id)}')"
        >
          <div class="preview">
            <img src="${thumb}">
          </div>

          <div class="source-info">
            <strong>${escapeHtml(source.name)}</strong>
            <span>
              ${type === 'screen'
                ? '🖥 Celá obrazovka'
                : '▣ Okno aplikace'}
            </span>
          </div>
        </button>
      `;
    }

    const html = `
<!doctype html>
<html lang="cs">
<head>
<meta charset="UTF-8">

<title>Vyber, co chceš sdílet</title>

<style>
* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  width: 100%;
  min-height: 100%;
  background:
    radial-gradient(circle at 50% -20%, #27465d 0, transparent 38%),
    #101820;
  color: #e3edf5;
  font-family: Segoe UI, Arial, sans-serif;
}

body {
  padding: 22px;
}

.header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
}

.logo {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  overflow: hidden;
  filter: drop-shadow(0 5px 14px rgba(53,190,255,.20));
}
.logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.header-copy {
  flex: 1;
}

h1 {
  margin: 0;
  font-size: 22px;
}

.subtitle {
  color: #8fa6b8;
  font-size: 13px;
  margin-top: 4px;
}

.section {
  margin-top: 22px;
}

.section-title {
  color: #a9c0d1;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .08em;
  margin: 0 0 10px 4px;
}

.grid {
  display: grid;
  grid-template-columns:
    repeat(auto-fill, minmax(270px, 1fr));
  gap: 12px;
}

.source-card {
  appearance: none;
  border: 1px solid #304b5f;
  background: linear-gradient(180deg,#1c2c38,#151f28);
  color: white;
  border-radius: 11px;
  overflow: hidden;
  padding: 0;
  cursor: pointer;
  text-align: left;
  transition:
    transform .12s,
    border-color .12s,
    box-shadow .12s;
}

.source-card:hover {
  transform: translateY(-2px);
  border-color: #66c0f4;
  box-shadow:
    0 0 0 2px rgba(102,192,244,.08),
    0 12px 28px rgba(0,0,0,.35);
}

.preview {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #05090d;
  display: grid;
  place-items: center;
  overflow: hidden;
}

.preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.source-info {
  padding: 10px 12px 12px;
}

.source-info strong {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
}

.source-info span {
  display: block;
  color: #7894a8;
  margin-top: 4px;
  font-size: 11px;
}

.footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 22px;
}

.cancel {
  border: 1px solid #405c70;
  background: #20313d;
  color: #d6e4ed;
  border-radius: 8px;
  padding: 10px 18px;
  cursor: pointer;
}

.cancel:hover {
  border-color: #66c0f4;
  color: white;
}

.empty {
  color: #70899b;
  border: 1px dashed #344c5e;
  padding: 20px;
  border-radius: 10px;
}
</style>
</head>

<body>

<div class="header">
  <div class="logo"><img src="${yamachatBrandIconDataUrl()}" alt="Yamachat"></div>

  <div class="header-copy">
    <h1>Vyber, co chceš sdílet</h1>

    <div class="subtitle">
      Yamachat · sdílení obrazovky
    </div>
  </div>
</div>

${screenSources.length ? `
<div class="section">
  <div class="section-title">
    Celá obrazovka
  </div>

  <div class="grid">
    ${screenSources
      .map(s => sourceCard(s, 'screen'))
      .join('')}
  </div>
</div>
` : ''}

${windowSources.length ? `
<div class="section">
  <div class="section-title">
    Okna aplikací
  </div>

  <div class="grid">
    ${windowSources
      .map(s => sourceCard(s, 'window'))
      .join('')}
  </div>
</div>
` : `
<div class="section">
  <div class="empty">
    Nebyla nalezena žádná další okna.
  </div>
</div>
`}

<div class="footer">
  <button
    class="cancel"
    onclick="cancelShare()"
  >
    Zrušit
  </button>
</div>

<script>
function chooseSource(id) {
  location.href =
    'yamachat-picker://source/' + id;
}

function cancelShare() {
  location.href =
    'yamachat-picker://cancel';
}
</script>

</body>
</html>
`;

    picker.webContents.on(
      'will-navigate',
      (event, url) => {

        if (
          url.startsWith(
            'yamachat-picker://source/'
          )
        ) {
          event.preventDefault();

          const encoded =
            url.substring(
              'yamachat-picker://source/'.length
            );

          const sourceId =
            decodeURIComponent(encoded);

          const source =
            sources.find(
              item => item.id === sourceId
            );

          finish(source);

          return;
        }

        if (
          url.startsWith(
            'yamachat-picker://cancel'
          )
        ) {
          event.preventDefault();
          finish(null);
        }
      }
    );

    picker.on('closed', () => {
      finish(null);
    });

    picker.loadURL(
      'data:text/html;charset=utf-8,' +
      encodeURIComponent(html)
    );

    picker.once('ready-to-show', () => {
      picker.show();
    });
  });
}


// ----------------------------------------------------
// HTML ESCAPE
// ----------------------------------------------------

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}


// ----------------------------------------------------
// VOICE / BACKGROUND KEEP-ALIVE
// ----------------------------------------------------

function keepRendererAwake(win) {
  try {
    if (!win || win.isDestroyed()) return;
    if (win.webContents.isDestroyed()) return;

    win.webContents.setBackgroundThrottling(false);
  } catch (error) {
    console.warn('Yamachat background throttling guard:', error);
  }
}

async function installAudioKeepAlive(win) {
  try {
    if (!win || win.isDestroyed()) return;
    if (win.webContents.isDestroyed()) return;

    await win.webContents.executeJavaScript(`
      (() => {
        if (window.__yamachatAudioKeepAliveInstalled) {
          try {
            const ctx = window.__yamachatKeepAliveCtx;
            if (ctx && ctx.state !== 'running') {
              ctx.resume().catch(() => {});
            }
          } catch {}
          return true;
        }

        window.__yamachatAudioKeepAliveInstalled = true;

        const startKeepAlive = () => {
          try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;

            if (!window.__yamachatKeepAliveCtx) {
              const ctx = new AudioCtx({ latencyHint: 'interactive' });
              const oscillator = ctx.createOscillator();
              const gain = ctx.createGain();

              // Subsonic + extremely quiet signal: keeps the audio renderer active
              // without being audible in normal use.
              oscillator.frequency.value = 1;
              gain.gain.value = 0.000001;

              oscillator.connect(gain);
              gain.connect(ctx.destination);
              oscillator.start();

              window.__yamachatKeepAliveCtx = ctx;
              window.__yamachatKeepAliveOscillator = oscillator;
              window.__yamachatKeepAliveGain = gain;
            }

            const ctx = window.__yamachatKeepAliveCtx;
            if (ctx && ctx.state !== 'running') {
              ctx.resume().catch(() => {});
            }
          } catch {}
        };

        const bindFrame = () => {
          try {
            const frame = document.getElementById('yamachat');
            const doc = frame?.contentWindow?.document;

            if (doc && !doc.__yamachatKeepAliveBound) {
              doc.__yamachatKeepAliveBound = true;
              doc.addEventListener('pointerdown', startKeepAlive, true);
              doc.addEventListener('keydown', startKeepAlive, true);
            }
          } catch {}
        };

        window.addEventListener('pointerdown', startKeepAlive, true);
        window.addEventListener('keydown', startKeepAlive, true);
        window.addEventListener('focus', startKeepAlive);
        document.addEventListener('visibilitychange', startKeepAlive);

        const frame = document.getElementById('yamachat');
        if (frame) {
          frame.addEventListener('load', () => {
            bindFrame();
            startKeepAlive();
          });
        }

        // Once the user has activated audio at least once, keep trying to
        // resume it if Chromium/Windows suspends it while Yamachat is hidden.
        setInterval(startKeepAlive, 1000);

        bindFrame();
        startKeepAlive();
        return true;
      })();
    `, true);
  } catch (error) {
    console.warn('Yamachat audio keep-alive install:', error);
  }
}

function wakeBackgroundAudio(win) {
  keepRendererAwake(win);

  try {
    if (!win || win.isDestroyed()) return;
    if (win.webContents.isDestroyed()) return;

    win.webContents.executeJavaScript(`
      (() => {
        try {
          const ctx = window.__yamachatKeepAliveCtx;
          if (ctx && ctx.state !== 'running') {
            ctx.resume().catch(() => {});
          }
          const frame = document.getElementById('yamachat');
          try { frame?.contentWindow?.postMessage({ type: 'yamachat:desktop-voice-wake', ts: Date.now() }, '*'); } catch {}
        } catch {}
      })();
    `, true).catch(() => {});
  } catch {}
}


// ----------------------------------------------------
// WINDOWS TRAY + DESKTOP VOICE STATUS
// ----------------------------------------------------

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
  wakeBackgroundAudio(mainWindow);
}

function normalizePresenceMode(value) {
  const raw = String(value || 'online').toLowerCase();
  if (raw === 'away') return 'afk';
  if (raw === 'busy') return 'dnd';
  if (raw === 'offline') return 'invisible';
  return ['online', 'afk', 'dnd', 'invisible'].includes(raw) ? raw : 'online';
}

function trayStatusLabel(mode) {
  const normalized = normalizePresenceMode(mode);
  if (normalized === 'afk') return 'Nečinný';
  if (normalized === 'dnd') return 'Nerušit';
  if (normalized === 'invisible') return 'Neviditelný';
  return 'Online';
}

// NEON BRANDING TRAY ASSETS v1.0.11
// 64px high-contrast sources are intentionally used so Windows can scale them
// cleanly at 16/20/24/32px. Voice idle stays dim; speaking lights up.
function trayAsset(fileName, fallback = 'icon.ico') {
  const asset = nativeImage.createFromPath(path.join(__dirname, 'build', fileName));
  if (!asset.isEmpty()) return asset;
  return nativeImage.createFromPath(path.join(__dirname, 'build', fallback));
}

function isTraySpeakingNow() {
  if (!desktopState.voiceConnected || desktopState.voiceMuted) {
    traySpeakingHoldUntil = 0;
    return false;
  }
  if (desktopState.voiceSpeaking) {
    traySpeakingHoldUntil = Date.now() + TRAY_SPEAKING_HOLD_MS;
    return true;
  }
  return Date.now() < traySpeakingHoldUntil;
}

function trayIconForCurrentState() {
  if (desktopState.voiceConnected) {
    return isTraySpeakingNow()
      ? trayAsset('tray-controller-speaking.png')
      : trayAsset('tray-controller-idle.png');
  }

  const mode = normalizePresenceMode(desktopState.presenceMode);
  const unread = Math.max(0, Number(desktopState.notificationUnreadCount || 0));
  return unread > 0
    ? trayAsset(`tray-status-${mode}-notify.png`, `tray-status-${mode}.png`)
    : trayAsset(`tray-status-${mode}.png`);
}

function refreshTray() {
  if (!tray) return;

  const channelName = String(desktopState.voiceChannelName || 'Voice').trim() || 'Voice';
  const presenceMode = normalizePresenceMode(desktopState.presenceMode);
  const unread = Math.max(0, Number(desktopState.notificationUnreadCount || 0));
  const speaking = isTraySpeakingNow();
  const voiceText = desktopState.voiceConnected
    ? `${speaking ? 'Mluvíš' : 'Voice připojen'} · ${channelName}${desktopState.voiceMuted ? ' · mikrofon ztlumen' : ''}`
    : `Stav: ${trayStatusLabel(presenceMode)}${unread > 0 ? ` · ${unread} nepřečtených` : ''}`;

  const iconMode = desktopState.voiceConnected
    ? (speaking ? 'voice-speaking' : 'voice-idle')
    : `status-${presenceMode}-${unread > 0 ? `notify-${unread}` : 'clear'}`;

  const key = [
    iconMode,
    channelName,
    desktopState.voiceMuted ? '1' : '0',
    desktopState.voiceDeafened ? '1' : '0'
  ].join('|');

  if (key !== lastTrayStateKey) {
    tray.setImage(trayIconForCurrentState());
    tray.setToolTip(
      desktopState.voiceConnected
        ? `Yamachat · ${speaking ? 'Mluvíš' : 'Voice'}: ${channelName}`
        : `Yamachat · ${trayStatusLabel(presenceMode)}${unread > 0 ? ` · ${unread} nepřečtených` : ''}`
    );

    tray.setContextMenu(Menu.buildFromTemplate([
      {
        label: 'Otevřít Yamachat',
        click: showMainWindow
      },
      { type: 'separator' },
      {
        label: voiceText,
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Ukončit Yamachat',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]));

    lastTrayStateKey = key;
  }
}

function createTray() {
  if (tray) return tray;

  tray = new Tray(trayIconForCurrentState());
  tray.setToolTip('Yamachat · Online');
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
  refreshTray();

  return tray;
}

async function readDesktopState() {
  const win = mainWindow;
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;

  try {
    const next = await win.webContents.executeJavaScript(`
      (() => {
        try {
          const frame = document.getElementById('yamachat');
          const getter = frame?.contentWindow?.__ycDesktopState;
          if (typeof getter !== 'function') return null;
          const state = getter();
          if (state?.voiceConnected) {
            const now = Date.now();
            if (!window.__ycLastDesktopVoiceWake || now - window.__ycLastDesktopVoiceWake >= 900) {
              window.__ycLastDesktopVoiceWake = now;
              try { frame.contentWindow.postMessage({ type: 'yamachat:desktop-voice-wake', ts: now }, '*'); } catch {}
            }
          }
          return state;
        } catch {
          return null;
        }