import type {MediaSyncApi} from '@shared/api';
import {defaultProgress, defaultSettings, filterContacts} from '@shared/sync-state';
import type {
  AppSettings,
  ConnectionStatus,
  ContactInfo,
  SyncProgress,
} from '@shared/types';

const demoContacts: ContactInfo[] = [
  {id: '15551230001@s.whatsapp.net', name: 'Ada Lovelace', phone: '15551230001'},
  {id: '15551230002@s.whatsapp.net', name: 'Grace Hopper', phone: '15551230002'},
  {id: '15551230003@s.whatsapp.net', name: 'Alan Turing', phone: '15551230003'},
];

function createBrowserDemoApi(): MediaSyncApi {
  let settings: AppSettings = {
    ...defaultSettings(),
    rootFolder: null,
  };
  let status: ConnectionStatus = 'qr';
  let progress: SyncProgress = defaultProgress();
  const statusListeners = new Set<(s: ConnectionStatus) => void>();
  const qrListeners = new Set<(q: string | null) => void>();
  const contactListeners = new Set<(c: ContactInfo[]) => void>();
  const progressListeners = new Set<(p: SyncProgress) => void>();
  const settingsListeners = new Set<(s: AppSettings) => void>();

  const qrSvg =
    'data:image/svg+xml,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280" viewBox="0 0 280 280">
        <rect width="280" height="280" fill="#f4f7f4"/>
        <rect x="24" y="24" width="72" height="72" fill="#1b4332"/>
        <rect x="184" y="24" width="72" height="72" fill="#1b4332"/>
        <rect x="24" y="184" width="72" height="72" fill="#1b4332"/>
        <rect x="40" y="40" width="40" height="40" fill="#f4f7f4"/>
        <rect x="200" y="40" width="40" height="40" fill="#f4f7f4"/>
        <rect x="40" y="200" width="40" height="40" fill="#f4f7f4"/>
        <rect x="112" y="112" width="56" height="56" fill="#1b4332"/>
        <text x="140" y="268" text-anchor="middle" font-family="Georgia, serif" font-size="12" fill="#1b4332">Demo QR — open the Electron app to link WhatsApp</text>
      </svg>`,
    );

  return {
    getSettings: async () => settings,
    setRootFolder: async () => {
      settings = {
        ...settings,
        rootFolder: '/Users/you/WhatsAppSync',
      };
      settingsListeners.forEach((cb) => cb(settings));
      return settings.rootFolder;
    },
    getStatus: async () => status,
    getQr: async () => qrSvg,
    getContacts: async () => demoContacts,
    getProgress: async () => progress,
    startWhatsApp: async () => {
      status = 'qr';
      statusListeners.forEach((cb) => cb(status));
      qrListeners.forEach((cb) => cb(qrSvg));
      setTimeout(() => {
        status = 'ready';
        statusListeners.forEach((cb) => cb(status));
        contactListeners.forEach((cb) => cb(demoContacts));
      }, 1200);
    },
    logout: async () => {
      status = 'logged_out';
      statusListeners.forEach((cb) => cb(status));
    },
    syncContact: async ({contactId, contactName, startDateIso}) => {
      if (!settings.rootFolder) {
        throw new Error('Choose a root folder before syncing');
      }
      const existing = settings.contacts[contactId];
      if (!existing && !startDateIso) {
        throw new Error('Pick a start date for the first sync with this contact');
      }
      settings = {
        ...settings,
        lastContactId: contactId,
        contacts: {
          ...settings.contacts,
          [contactId]: existing ?? {
            contactId,
            contactName,
            startDateIso: startDateIso!,
            downloadedIds: [],
          },
        },
      };
      settingsListeners.forEach((cb) => cb(settings));
      progress = {
        status: 'running',
        contactId,
        contactName,
        scanned: 0,
        downloaded: 0,
        skipped: 0,
        failed: 0,
        message: 'Scanning messages…',
      };
      progressListeners.forEach((cb) => cb(progress));
      await new Promise((r) => setTimeout(r, 500));
      progress = {
        ...progress,
        scanned: 12,
        downloaded: 7,
        skipped: 5,
        status: 'done',
        message: 'Done. Downloaded 7, skipped 5, failed 0. (browser demo)',
      };
      progressListeners.forEach((cb) => cb(progress));
    },
    onStatus: (cb) => {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    onQr: (cb) => {
      qrListeners.add(cb);
      return () => qrListeners.delete(cb);
    },
    onContacts: (cb) => {
      contactListeners.add(cb);
      return () => contactListeners.delete(cb);
    },
    onProgress: (cb) => {
      progressListeners.add(cb);
      return () => progressListeners.delete(cb);
    },
    onSettings: (cb) => {
      settingsListeners.add(cb);
      return () => settingsListeners.delete(cb);
    },
  };
}

export function getApi(): MediaSyncApi {
  if (window.mediaSync) {
    return window.mediaSync;
  }
  return createBrowserDemoApi();
}

export {filterContacts};
