const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('packageCompiler', {
    selectImage: resolution => ipcRenderer.invoke('select-image', resolution),
    createPackage: payload => ipcRenderer.invoke('create-package', payload)
});
