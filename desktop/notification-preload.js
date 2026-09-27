const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('yamachatNotification', {
  open: () => ipcRenderer.invoke('yamachat:notification-open'),
  close: () => ipcRenderer.invoke('yamachat:notification-close')
});
