'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const UPDATE_OWNER = 'yamboleeroy-ai';
const UPDATE_REPO = 'yamachat';
const UPDATE_CHANNEL = 'latest';
const STARTUP_CHECK_DELAY_MS = 15_000;
const PERIODIC_CHECK_MS = 6 * 60 * 60 * 1000;
const HEALTH_STABLE_MS = 8_000;

function safeError(error) {
  return String(error?.message || error || 'Neznámá chyba').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function formatReleaseNotes(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.replace(/<[^>]+>/g, '').trim().slice(0, 5000);
  if (Array.isArray(value)) {
    return value.map(item => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') return String(item.note || item.notes || '');
      return '';
    }).filter(Boolean).join('\n\n').replace(/<[^>]+>/g, '').trim().slice(0, 5000);
  }
  return '';
}

function atomicWriteJson(file, data) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const temp = file + '.tmp';
  const backup = file + '.bak';
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8');
  try {
    if (fs.existsSync(file)) fs.copyFileSync(file, backup);
  } catch {}
  fs.renameSync(temp, file);
}

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch {}
  try { return JSON.parse(fs.readFileSync(file + '.bak', 'utf8').replace(/^\uFEFF/, '')); } catch {}
  return fallback;
}

class YamachatUpdater {
  constructor({ app, getWindow }) {
    this.app = app;
    this.getWindow = typeof getWindow === 'function' ? getWindow : () => null;
    this.autoUpdater = null;
    this.ready = false;
    this.rendererReady = false;
    this.windowCreated = false;
    this.healthGeneration = 0;
    this.healthTimer = null;
    this.periodicTimer = null;
    this.startupTimer = null;
    this.checkPromise = null;
    this.downloadPromise = null;
    this.lastManualCheckAt = 0;

    this.runtimeRoot = path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'YamachatUpdater');
    this.stateFile = path.join(this.runtimeRoot, 'state.json');
    this.helperDir = path.join(this.runtimeRoot, 'helper');
    this.sessionDir = path.join(this.runtimeRoot, 'sessions');
    this.installedSetup = path.join(this.runtimeRoot, 'rollback', 'installed-setup.exe');

    this.state = {
      status: 'initializing',
      currentVersion: app.getVersion(),
      availableVersion: '',
      releaseNotes: '',
      percent: 0,
      transferred: 0,
      total: 0,
      bytesPerSecond: 0,
      canAutoUpdate: false,
      rollbackReady: false,
      updateOwner: UPDATE_OWNER,
      updateRepo: UPDATE_REPO,
      error: '',
      checkedAt: null,
      portable: false,
      reason: ''
    };
  }

  publicState() {
    return { ...this.state };
  }

  sendState() {
    const win = this.getWindow();
    try {
      if (win && !win.isDestroyed()) win.webContents.send('yamachat:update-state', this.publicState());
    } catch {}
  }

  setState(patch) {
    this.state = { ...this.state, ...patch };
    this.sendState();
    return this.publicState();
  }

  isInstalledUpdateBuild() {
    const portable = !!process.env.PORTABLE_EXECUTABLE_FILE;
    const config = path.join(process.resourcesPath || '', 'app-update.yml');
    return { portable, hasConfig: !!process.resourcesPath && fs.existsSync(config) };
  }

  async init() {
    fs.mkdirSync(this.runtimeRoot, { recursive: true });
    this.state.rollbackReady = fs.existsSync(this.installedSetup);

    const mode = this.isInstalledUpdateBuild();
    this.state.portable = mode.portable;

    try {
      const { autoUpdater } = require('electron-updater');
      this.autoUpdater = autoUpdater;
    } catch (error) {
      this.setState({
        status: 'disabled',
        canAutoUpdate: false,
        reason: 'Updater modul není součástí tohoto portable buildu.',
        error: ''
      });
      this.startPendingHealthIfNeeded();
      return this.publicState();
    }

    if (process.platform !== 'win32') {
      this.setState({ status: 'disabled', canAutoUpdate: false, reason: 'Automatické aktualizace jsou připravené pro Windows Setup.exe.' });
      this.startPendingHealthIfNeeded();
      return this.publicState();
    }

    if (mode.portable || !mode.hasConfig) {
      this.setState({
        status: 'disabled',
        canAutoUpdate: false,
        reason: 'Portable verze se sama nepřepisuje. Nainstaluj Yamachat přes Setup.exe a potom už budou další aktualizace probíhat přímo v aplikaci.'
      });
      this.startPendingHealthIfNeeded();
      return this.publicState();
    }

    this.configureAutoUpdater();
    this.ready = true;
    this.setState({ status: 'idle', canAutoUpdate: true, reason: '', error: '' });
    this.startPendingHealthIfNeeded();
    this.scheduleChecks();
    return this.publicState();
  }

  configureAutoUpdater() {
    const updater = this.autoUpdater;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.channel = UPDATE_CHANNEL;
    // Setting channel enables downgrades in electron-updater; restore the policy.
    updater.allowDowngrade = false;

    // app-update.yml generated by electron-builder points at the same public GitHub repo.
    // setFeedURL is kept explicit so the target is also obvious in runtime diagnostics.
    try {
      updater.setFeedURL({ provider: 'github', owner: UPDATE_OWNER, repo: UPDATE_REPO, channel: UPDATE_CHANNEL });
    } catch (error) {
      console.warn('Yamachat updater feed config:', safeError(error));
    }

    updater.on('checking-for-update', () => {
      this.setState({ status: 'checking', error: '', percent: 0 });
    });

    updater.on('update-available', info => {
      this.setState({
        status: 'available',
        availableVersion: String(info?.version || ''),
        releaseNotes: formatReleaseNotes(info?.releaseNotes),
        error: '',
        checkedAt: new Date().toISOString()
      });
    });

    updater.on('update-not-available', () => {
      this.setState({
        status: 'up-to-date',
        availableVersion: '',
        releaseNotes: '',
        error: '',
        percent: 0,
        checkedAt: new Date().toISOString()
      });
    });

    updater.on('download-progress', progress => {
      this.setState({
        status: 'downloading',
        percent: Number(progress?.percent || 0),
        transferred: Number(progress?.transferred || 0),
        total: Number(progress?.total || 0),
        bytesPerSecond: Number(progress?.bytesPerSecond || 0),
        error: ''
      });
    });

    updater.on('update-downloaded', info => {
      this.setState({
        status: 'downloaded',
        availableVersion: String(info?.version || this.state.availableVersion || ''),
        releaseNotes: formatReleaseNotes(info?.releaseNotes) || this.state.releaseNotes,
        percent: 100,
        error: '',
        rollbackReady: fs.existsSync(this.installedSetup)
      });
    });

    updater.on('error', error => {
      console.error('Yamachat updater:', error);
      this.setState({ status: 'error', error: safeError(error) });
    });
  }

  scheduleChecks() {
    clearTimeout(this.startupTimer);
    clearInterval(this.periodicTimer);
    this.startupTimer = setTimeout(() => { void this.check(false); }, STARTUP_CHECK_DELAY_MS);
    this.startupTimer.unref?.();
    this.periodicTimer = setInterval(() => { void this.check(false); }, PERIODIC_CHECK_MS);
    this.periodicTimer.unref?.();
  }

  async check(manual = true) {
    if (!this.ready || !this.autoUpdater) return this.publicState();
    if (this.downloadPromise || ['downloading', 'downloaded', 'installing'].includes(this.state.status)) return this.publicState();
    if (this.checkPromise) return this.publicState();
    if (manual) this.lastManualCheckAt = Date.now();
    this.checkPromise = Promise.resolve()
      .then(() => this.autoUpdater.checkForUpdates())
      .catch(error => this.setState({ status: 'error', error: safeError(error) }))
      .finally(() => { this.checkPromise = null; });
    await this.checkPromise;
    return this.publicState();
  }

  async download() {
    if (!this.ready || !this.autoUpdater) return this.publicState();
    if (!['available', 'error'].includes(this.state.status)) return this.publicState();
    if (this.downloadPromise) return this.publicState();
    this.setState({ status: 'downloading', percent: 0, transferred: 0, total: 0, bytesPerSecond: 0, error: '' });
    this.downloadPromise = Promise.resolve()
      .then(() => this.autoUpdater.downloadUpdate())
      .catch(error => this.setState({ status: 'error', error: safeError(error) }))
      .finally(() => { this.downloadPromise = null; });
    void this.downloadPromise;
    return this.publicState();
  }

  createSessionId() {
    return 'upd-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex');
  }

  copyRollbackInstaller(sessionId) {
    if (!fs.existsSync(this.installedSetup)) return '';
    const dir = path.join(this.sessionDir, sessionId);
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, 'rollback-setup.exe');
    fs.copyFileSync(this.installedSetup, target);
    return target;
  }

  copyHelper() {
    const source = path.join(__dirname, 'updater-helper.ps1');
    if (!fs.existsSync(source)) throw new Error('Chybí updater-helper.ps1');
    fs.mkdirSync(this.helperDir, { recursive: true });
    const target = path.join(this.helperDir, 'yamachat-updater-helper.ps1');
    fs.copyFileSync(source, target);
    return target;
  }

  prepareInstallState() {
    const sessionId = this.createSessionId();
    let rollbackInstaller = '';
    try { rollbackInstaller = this.copyRollbackInstaller(sessionId); } catch (error) { console.warn('Rollback copy:', safeError(error)); }
    const now = new Date().toISOString();
    const payload = {
      schemaVersion: 1,
      sessionId,
      currentVersion: this.app.getVersion(),
      targetVersion: this.state.availableVersion,
      rollbackVersion: this.app.getVersion(),
      state: 'pending_health',
      bootAttempts: 0,
      maxBootAttempts: 2,
      createdAt: now,
      updatedAt: now,
      installedExePath: process.execPath,
      rollbackInstaller,
      rollbackAvailable: !!rollbackInstaller,
      health: {
        mainStarted: false,
        windowCreated: false,
        rendererReady: false,
        stable: false,
        lastHeartbeat: null
      },
      lastError: null
    };
    atomicWriteJson(this.stateFile, payload);
    return payload;
  }

  async launchRollbackHelper(state) {
    if (!state?.rollbackAvailable) return false;
    const helper = this.copyHelper();
    const args = [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper,
      '-StatePath', this.stateFile,
      '-SessionId', state.sessionId,
      '-OldPid', String(process.pid),
      '-TimeoutSeconds', '180'
    ];
    const child = spawn('powershell.exe', args, { detached: true, windowsHide: true, stdio: 'ignore' });
    await new Promise((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    child.unref();
    return true;
  }

  async install() {
    if (!this.ready || !this.autoUpdater || this.state.status !== 'downloaded') return { ok: false, state: this.publicState() };
    this.setState({ status: 'installing', error: '' });
    try {
      const session = this.prepareInstallState();
      const helperStarted = await this.launchRollbackHelper(session);
      this.setState({ status: 'installing', rollbackReady: helperStarted && session.rollbackAvailable, error: '' });
      setTimeout(() => {
        try { this.autoUpdater.quitAndInstall(false, true); }
        catch (error) { this.setState({ status: 'error', error: safeError(error) }); }
      }, 250);
      return { ok: true, state: this.publicState() };
    } catch (error) {
      this.setState({ status: 'error', error: safeError(error) });
      return { ok: false, state: this.publicState() };
    }
  }

  updatePendingState(mutator) {
    const data = readJson(this.stateFile, null);
    if (!data || data.state !== 'pending_health' || String(data.targetVersion) !== this.app.getVersion()) return null;
    mutator(data);
    data.updatedAt = new Date().toISOString();
    atomicWriteJson(this.stateFile, data);
    return data;
  }

  startPendingHealthIfNeeded() {
    const pending = readJson(this.stateFile, null);
    if (!pending || pending.state !== 'pending_health') return;
    if (String(pending.targetVersion || '') !== String(this.app.getVersion())) return;
    this.updatePendingState(data => {
      data.bootAttempts = Number(data.bootAttempts || 0) + 1;
      data.health = data.health || {};
      data.health.mainStarted = true;
      data.health.windowCreated = false;
      data.health.rendererReady = false;
      data.health.stable = false;
      data.health.lastHeartbeat = new Date().toISOString();
    });
  }

  markWindowCreated() {
    this.windowCreated = true;
    this.updatePendingState(data => {
      data.health = data.health || {};
      data.health.windowCreated = true;
      data.health.lastHeartbeat = new Date().toISOString();
    });
    this.maybeScheduleHealthy();
  }

  markRendererReady() {
    this.rendererReady = true;
    this.updatePendingState(data => {
      data.health = data.health || {};
      data.health.rendererReady = true;
      data.health.lastHeartbeat = new Date().toISOString();
    });
    this.maybeScheduleHealthy();
    return true;
  }

  maybeScheduleHealthy() {
    clearTimeout(this.healthTimer);
    const generation = ++this.healthGeneration;
    const pending = readJson(this.stateFile, null);
    if (!pending || pending.state !== 'pending_health') return;
    if (String(pending.targetVersion || '') !== String(this.app.getVersion())) return;
    if (!this.windowCreated || !this.rendererReady || !pending.health?.mainStarted) return;
    this.healthTimer = setTimeout(async () => {
      const win = this.getWindow();
      try {
        if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
        const responsive = await Promise.race([
          win.webContents.executeJavaScript("document.getElementById('yamachat')?.contentWindow?.__ycClientReady === true"),
          new Promise(resolve => { const timer=setTimeout(()=>resolve(false),3000); timer.unref?.(); })
        ]);
        if (!responsive || generation !== this.healthGeneration) return;
      } catch { return; }
      this.updatePendingState(data => {
        data.health.stable = true;
        data.health.lastHeartbeat = new Date().toISOString();
        data.state = 'healthy';
        data.lastKnownGoodVersion = this.app.getVersion();
      });
      // Commit in a separate write so the helper can treat healthy as success even if app exits immediately after.
      const healthy = readJson(this.stateFile, null);
      if (healthy && healthy.state === 'healthy') {
        healthy.state = 'committed';
        healthy.updatedAt = new Date().toISOString();
        atomicWriteJson(this.stateFile, healthy);
      }
    }, HEALTH_STABLE_MS);
    this.healthTimer.unref?.();
  }

  markWindowLoaded() {
    this.markWindowCreated();
  }

  markRendererUnavailable() {
    this.rendererReady = false;
    this.healthGeneration += 1;
    clearTimeout(this.healthTimer);
    this.updatePendingState(data => {
      data.health.rendererReady = false;
      data.health.stable = false;
    });
  }

  shutdown() {
    this.healthGeneration += 1;
    clearTimeout(this.startupTimer);
    clearTimeout(this.healthTimer);
    clearInterval(this.periodicTimer);
  }
}

module.exports = { YamachatUpdater, UPDATE_OWNER, UPDATE_REPO };
