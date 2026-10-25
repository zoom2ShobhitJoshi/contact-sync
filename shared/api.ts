import type {
  AppSettings,
  ConnectionStatus,
  ContactInfo,
  SyncProgress,
} from './types.js';

export interface MediaSyncApi {
  getSettings: () => Promise<AppSettings>;
  setRootFolder: () => Promise<string | null>;
  getStatus: () => Promise<ConnectionStatus>;
  getQr: () => Promise<string | null>;
  getContacts: () => Promise<ContactInfo[]>;
  getProgress: () => Promise<SyncProgress>;
  startWhatsApp: () => Promise<void>;
  logout: () => Promise<void>;
  syncContact: (payload: {
    contactId: string;
    contactName: string;
    startDateIso?: string;
  }) => Promise<void>;
  onStatus: (cb: (status: ConnectionStatus) => void) => () => void;
  onQr: (cb: (dataUrl: string | null) => void) => () => void;
  onContacts: (cb: (contacts: ContactInfo[]) => void) => () => void;
  onProgress: (cb: (progress: SyncProgress) => void) => () => void;
  onSettings: (cb: (settings: AppSettings) => void) => () => void;
}
