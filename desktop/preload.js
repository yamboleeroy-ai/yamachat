const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('yamachatDesktop', {
  getAppSettings: () => ipcRenderer.invoke('yamachat:get-app-settings'),
  setAppSetting: (key, value) => ipcRenderer.invoke('yamachat:set-app-setting', key, value),
  minimizeWindow: () => ipcRenderer.invoke('yamachat:window-minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('yamachat:window-toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('yamachat:window-close'),
  getWindowState: () => ipcRenderer.invoke('yamachat:get-window-state'),
  showNotification: (payload) => ipcRenderer.invoke('yamachat:show-notification', payload),
  getUpdateState: () => ipcRenderer.invoke('yamachat:update-get-state'),
  checkForUpdates: () => ipcRenderer.invoke('yamachat:update-check'),
  downloadUpdate: () => ipcRenderer.invoke('yamachat:update-download'),
  installUpdate: () => ipcRenderer.invoke('yamachat:update-install'),
  reportRendererReady: () => ipcRenderer.invoke('yamachat:update-renderer-ready'),
  onUpdateState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, state) => callback(state || {});
    ipcRenderer.on('yamachat:update-state', handler);
    return () => ipcRenderer.removeListener('yamachat:update-state', handler);
  },
  onOpenNotificationTarget: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, target) => callback(target || {});
    ipcRenderer.on('yamachat:open-notification-target', handler);
    return () => ipcRenderer.removeListener('yamachat:open-notification-target', handler);
  },
  onWindowState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, state) => callback(state || {});
    ipcRenderer.on('yamachat:window-state', handler);
    return () => ipcRenderer.removeListener('yamachat:window-state', handler);
  }
});
