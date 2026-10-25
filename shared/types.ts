export type MediaKind = 'photos' | 'videos' | 'documents' | 'audio';

export type ConnectionStatus =
  | 'disconnected'
  | 'qr'
  | 'connecting'
  | 'ready'
  | 'logged_out';

export interface ContactInfo {
  id: string;
  name: string;
  phone?: string;
}

export interface SyncFailure {
  messageId: string;
  fileName: string;
  kind: MediaKind;
  error: string;
  failedAtIso: string;
}

export interface ContactSyncState {
  contactId: string;
  contactName: string;
  startDateIso: string;
  lastSyncedAtIso?: string;
  lastMessageTimestamp?: number;
  downloadedIds: string[];
  /** Media that failed to download; kept until a retry succeeds. */
  failures?: SyncFailure[];
}

export interface AppSettings {
  rootFolder: string | null;
  lastContactId: string | null;
  contacts: Record<string, ContactSyncState>;
}

export interface SyncProgress {
  status: 'idle' | 'running' | 'done' | 'error';
  contactId?: string;
  contactName?: string;
  scanned: number;
  downloaded: number;
  skipped: number;
  failed: number;
  currentFile?: string;
  message?: string;
  error?: string;
  /** Per-file failures for the active contact (persisted across runs). */
  failures?: SyncFailure[];
}

export interface MediaCandidate {
  messageId: string;
  timestampMs: number;
  kind: MediaKind;
  fileName: string;
  mimeType?: string;
}

export interface ClassifyInput {
  messageType:
    | 'image'
    | 'video'
    | 'audio'
    | 'document'
    | 'sticker'
    | 'unknown';
  mimeType?: string;
  fileName?: string;
  isGif?: boolean;
  isVoiceNote?: boolean;
}
