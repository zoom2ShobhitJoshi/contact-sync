import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
} from 'electron';
import {defaultProgress, defaultSettings} from '../shared/sync-state.js';
import type {
  AppSettings,
  ConnectionStatus,
  ContactInfo,
  SyncProgress,
} from '../shared/types.js';
import {loadSettings, saveSettings} from './settings-store.js';
import {SyncEngine} from './sync-engine.js';
import {WhatsAppClient} from './whatsapp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function appIconPath(): string | undefined {
  const candidates =
    process.platform === 'win32'
      ? [
          path.join(__dirname, '../../build/icons/icon.ico'),
          path.join(__dirname, '../../build/icons/icon.png'),
        ]
      : [
          path.join(__dirname, '../../build/icons/icon.png'),
          path.join(__dirname, '../../build/icons/icon-256.png'),
        ];
  return candidates.find((p) => fs.existsSync(p));
}

let mainWindow: BrowserWindow | null = null;
let status: ConnectionStatus = 'disconnected';
let qrDataUrl: string | null = null;
let contacts: ContactInfo[] = [];
let settings: AppSettings = defaultSettings();
let progress: SyncProgress = defaultProgress();

const client = new WhatsAppClient({
  onStatus: (next) => {
    status = next;
    mainWindow?.webContents.send('wa:status', next);
  },
  onQr: (dataUrl) => {
    qrDataUrl = dataUrl;
    mainWindow?.webContents.send('wa:qr', dataUrl);
  },
  onContacts: (list) => {
    contacts = list;
    mainWindow?.webContents.send('wa:contacts', list);
  },
  onMessage: (msg) => {
    void syncEngine.handleLiveMessage(msg);
  },
  onError: (message) => {
    progress = {...progress, status: 'error', error: message, message};
    mainWindow?.webContents.send('sync:progress', progress);
  },
});

const syncEngine = new SyncEngine(
  client,
  (next) => {
    progress = next;
    mainWindow?.webContents.send('sync:progress', next);
  },
  (next) => {
    settings = next;
    mainWindow?.webContents.send('settings:updated', next);
  },
);

function createWindow(): void {
  const icon = appIconPath();
  mainWindow = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    title: 'Contact Sync',
    ...(icon ? {icon} : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => {
    settings = loadSettings();
    return settings;
  });

  ipcMain.handle('settings:pick-root', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose sync root folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    settings = {...loadSettings(), rootFolder: result.filePaths[0]};
    saveSettings(settings);
    mainWindow?.webContents.send('settings:updated', settings);
    return settings.rootFolder;
  });

  ipcMain.handle('wa:status', () => status);
  ipcMain.handle('wa:qr', () => qrDataUrl);
  ipcMain.handle('wa:contacts', () => contacts);
  ipcMain.handle('sync:progress', () => progress);

  ipcMain.handle('wa:start', async () => {
    await client.start();
  });

  ipcMain.handle('wa:logout', async () => {
    await client.logout();
    qrDataUrl = null;
  });

  ipcMain.handle(
    'sync:start',
    async (
      _event,
      payload: {contactId: string; contactName: string; startDateIso?: string},
    ) => {
      await syncEngine.syncContact(
        payload.contactId,
        payload.contactName,
        payload.startDateIso,
      );
    },
  );

  ipcMain.handle(
    'sync:retry-failed',
    async (
      _event,
      payload: {contactId: string; contactName: string},
    ) => {
      await syncEngine.retryFailed(payload.contactId, payload.contactName);
    },
  );
}

app.setName('Contact Sync');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.contactsync.app');
}

app.whenReady().then(() => {
  const dockIcon = appIconPath();
  if (process.platform === 'darwin' && app.dock != null && dockIcon != null) {
    try {
      app.dock.setIcon(dockIcon);
    } catch (err) {
      console.warn('Could not set dock icon:', err);
    }
  }
  settings = loadSettings();
  registerIpc();
  // Start WhatsApp first so cached contacts/messages hydrate before the UI loads.
  void client.start();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
