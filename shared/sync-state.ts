import type {AppSettings, ContactSyncState, SyncProgress} from './types.js';

export function defaultSettings(): AppSettings {
  return {
    rootFolder: null,
    lastContactId: null,
    contacts: {},
  };
}

export function defaultProgress(): SyncProgress {
  return {
    status: 'idle',
    scanned: 0,
    downloaded: 0,
    skipped: 0,
    failed: 0,
  };
}

export function getContactState(
  settings: AppSettings,
  contactId: string,
): ContactSyncState | undefined {
  return settings.contacts[contactId];
}

export function needsStartDate(settings: AppSettings, contactId: string): boolean {
  const state = settings.contacts[contactId];
  return !state?.startDateIso;
}

export function ensureContactState(
  settings: AppSettings,
  contactId: string,
  contactName: string,
  startDateIso: string,
): AppSettings {
  const existing = settings.contacts[contactId];
  const next: ContactSyncState = existing
    ? {
        ...existing,
        contactName,
        startDateIso: existing.startDateIso || startDateIso,
      }
    : {
        contactId,
        contactName,
        startDateIso,
        downloadedIds: [],
      };

  return {
    ...settings,
    lastContactId: contactId,
    contacts: {
      ...settings.contacts,
      [contactId]: next,
    },
  };
}

export function markDownloaded(
  settings: AppSettings,
  contactId: string,
  messageId: string,
  messageTimestampMs: number,
): AppSettings {
  const existing = settings.contacts[contactId];
  if (!existing) {
    throw new Error(`No sync state for contact ${contactId}`);
  }
  if (existing.downloadedIds.includes(messageId)) {
    return settings;
  }

  const downloadedIds = [...existing.downloadedIds, messageId];
  const lastMessageTimestamp = Math.max(
    existing.lastMessageTimestamp ?? 0,
    messageTimestampMs,
  );

  return {
    ...settings,
    contacts: {
      ...settings.contacts,
      [contactId]: {
        ...existing,
        downloadedIds,
        lastMessageTimestamp,
        lastSyncedAtIso: new Date().toISOString(),
      },
    },
  };
}

export function wasDownloaded(
  settings: AppSettings,
  contactId: string,
  messageId: string,
): boolean {
  return settings.contacts[contactId]?.downloadedIds.includes(messageId) ?? false;
}

export function effectiveStartTimestampMs(state: ContactSyncState): number {
  if (state.lastMessageTimestamp != null && state.lastMessageTimestamp > 0) {
    // Resume after the last saved message (exclusive of already processed).
    return state.lastMessageTimestamp + 1;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(state.startDateIso);
  if (!match) {
    throw new Error(`Invalid start date: ${state.startDateIso}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

export function filterContacts(
  contacts: {id: string; name: string; phone?: string}[],
  query: string,
): {id: string; name: string; phone?: string}[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return contacts.slice().sort((a, b) => a.name.localeCompare(b.name));
  }
  return contacts
    .filter((c) => {
      const hay = `${c.name} ${c.phone ?? ''} ${c.id}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
