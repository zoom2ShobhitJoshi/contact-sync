import {contextBridge, ipcRenderer} from 'electron';
import type {MediaSyncApi} from '../shared/api.js';

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: MediaSyncApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setRootFolder: () => ipcRenderer.invoke('settings:pick-root'),
  getStatus: () => ipcRenderer.invoke('wa:status'),
  getQr: () => ipcRenderer.invoke('wa:qr'),
  getContacts: () => ipcRenderer.invoke('wa:contacts'),
  getProgress: () => ipcRenderer.invoke('sync:progress'),
  startWhatsApp: () => ipcRenderer.invoke('wa:start'),
  logout: () => ipcRenderer.invoke('wa:logout'),
  syncContact: (payload) => ipcRenderer.invoke('sync:start', payload),
  retryFailed: (payload) => ipcRenderer.invoke('sync:retry-failed', payload),
  onStatus: (cb) => subscribe('wa:status', cb),
  onQr: (cb) => subscribe('wa:qr', cb),
  onContacts: (cb) => subscribe('wa:contacts', cb),
  onProgress: (cb) => subscribe('sync:progress', cb),
  onSettings: (cb) => subscribe('settings:updated', cb),
};

contextBridge.exposeInMainWorld('mediaSync', api);
