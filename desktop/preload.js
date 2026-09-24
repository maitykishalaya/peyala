const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  printThermal: (html, options = {}) => ipcRenderer.invoke('print-thermal-slip', { html, ...options }),
  getPrinters: () => ipcRenderer.invoke('get-system-printers'),
  toggleKiosk: () => ipcRenderer.invoke('toggle-kiosk'),
  isKiosk: () => ipcRenderer.invoke('is-kiosk'),
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  selectProjectFolder: () => ipcRenderer.invoke('select-project-folder'),
  restartServers: () => ipcRenderer.invoke('restart-local-servers'),
  onServerStatus: (callback) => {
    const subscription = (event, status) => callback(status);
    ipcRenderer.on('server-status', subscription);
    return () => ipcRenderer.removeListener('server-status', subscription);
  }
});
