'use strict';

const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const appDir = __dirname;
const serverScript = path.join(appDir, 'preview.cjs');
const appIcon = path.join(appDir, 'icons', 'yamaconvert.ico');
const nodeExe = path.resolve(process.resourcesPath, '..', 'runtime', 'node.exe');
const logsDir = app.getPath('userData');
let serverProcess;
let serverPort;
let mainWindow;
let shuttingDown = false;

function log(message) {
  fs.mkdirSync(logsDir, { recursive: true });
  fs.appendFileSync(path.join(logsDir, 'app.log'), `[${new Date().toISOString()}] ${message}\n`);
}

async function findPort(start = 4197) {
  for (let port = start; port < start + 50; port++) {
    const available = await new Promise(resolve => {
      const probe = net.createServer();
      probe.once('error', () => resolve(false));
      probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new Error('Nenašel se volný místní port pro YamaConvert.');
}

async function waitForServer(child, port) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Místní převodní služba se před otevřením aplikace ukončila.');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/status`, { signal: AbortSignal.timeout(900) });
      if (response.ok && (await response.json()).app === true) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Místní převodní služba se nespustila do 15 sekund.');
}

async function startServer() {
  if (!fs.existsSync(nodeExe)) throw new Error('V instalaci chybí Node.js runtime. Stáhni YamaConvert z Yamaportalu znovu.');
  if (!fs.existsSync(serverScript)) throw new Error('Instalace neobsahuje místní převodní službu.');
  serverPort = await findPort();
  const logs = fs.createWriteStream(path.join(logsDir, 'server.log'), { flags: 'a' });
  serverProcess = spawn(nodeExe, [serverScript], {
    cwd: appDir,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, YAMACONVERT_PORT: String(serverPort), PATH: `${path.dirname(nodeExe)};${process.env.PATH || ''}` },
  });
  serverProcess.stdout.pipe(logs);
  serverProcess.stderr.pipe(logs);
  serverProcess.once('error', error => log(`Server process error: ${error.message}`));
  serverProcess.once('exit', (code, signal) => {
    log(`Server exited (code=${code}, signal=${signal})`);
    if (!shuttingDown && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox('YamaConvert se zastavil', 'Místní převodní služba se ukončila. Zavři aplikaci a spusť ji znovu.');
      app.quit();
    }
  });
  await waitForServer(serverProcess, serverPort);
  log(`Local service ready on port ${serverPort}`);
}

async function smokeTest() {
  const result = await mainWindow.webContents.executeJavaScript(`(() => {
    const nav = document.querySelector('[data-view="downloads"]');
    const panel = document.querySelector('#downloads-view');
    const choose = document.querySelector('#choose');
    if (!window.YamaApp || !nav || !panel || !choose || typeof choose.onclick !== 'function') return 'Chybí obsluha tlačítek nebo navigace.';
    nav.click();
    return panel.classList.contains('hidden') ? 'Navigace nereaguje.' : 'ok';
  })()`);
  if (result !== 'ok') throw new Error(`Kontrola interakce aplikace selhala: ${result}`);
  log('Smoke test passed: app scripts and navigation are interactive.');
  app.quit();
}

function createWindow() {
  app.setAppUserModelId('eu.yamachat.yamaconvert');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 860,
    minHeight: 620,
    show: false,
    backgroundColor: '#080b18',
    autoHideMenuBar: true,
    title: 'YamaConvert',
    icon: fs.existsSync(appIcon) ? appIcon : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== `http://127.0.0.1:${serverPort}/`) event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.once('did-finish-load', () => {
    if (process.env.YAMACONVERT_SMOKE_TEST === '1') void smokeTest().catch(error => {
      log(error.stack || error.message);
      app.quit();
    });
  });
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/`);
}

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(async () => {
    try {
      await startServer();
      createWindow();
    } catch (error) {
      log(error.stack || error.message);
      dialog.showErrorBox('YamaConvert se nepodařilo spustit', error.message || 'Zkontroluj instalaci a zkus aplikaci spustit znovu.');
      app.exit(1);
    }
  });
}

app.on('before-quit', () => {
  shuttingDown = true;
  if (serverProcess && serverProcess.exitCode === null) serverProcess.kill();
});
