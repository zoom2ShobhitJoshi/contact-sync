import type {
  AppSettings,
  ContactSyncState,
  SyncFailure,
  SyncProgress,
} from './types.js';

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
    failures: [],
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
        failures: existing.failures ?? [],
      }
    : {
        contactId,
        contactName,
        startDateIso,
        downloadedIds: [],
        failures: [],
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
    return clearFailure(settings, contactId, messageId);
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
        failures: (existing.failures ?? []).filter((f) => f.messageId !== messageId),
      },
    },
  };
}

export function getFailures(settings: AppSettings, contactId: string): SyncFailure[] {
  return settings.contacts[contactId]?.failures ?? [];
}

export function recordFailure(
  settings: AppSettings,
  contactId: string,
  failure: SyncFailure,
): AppSettings {
  const existing = settings.contacts[contactId];
  if (!existing) {
    throw new Error(`No sync state for contact ${contactId}`);
  }
  const others = (existing.failures ?? []).filter((f) => f.messageId !== failure.messageId);
  return {
    ...settings,
    contacts: {
      ...settings.contacts,
      [contactId]: {
        ...existing,
        failures: [...others, failure],
      },
    },
  };
}

export function clearFailure(
  settings: AppSettings,
  contactId: string,
  messageId: string,
): AppSettings {
  const existing = settings.contacts[contactId];
  if (!existing) {
    return settings;
  }
  return {
    ...settings,
    contacts: {
      ...settings.contacts,
      [contactId]: {
        ...existing,
        failures: (existing.failures ?? []).filter((f) => f.messageId !== messageId),
      },
    },
  };
}

/** Turns raw download errors into short user-facing reasons. */
export function explainSyncError(raw: string): string {
  const text = raw.trim();
  const lower = text.toLowerCase();

  if (
    lower.includes('404') ||
    lower.includes('not found') ||
    lower.includes('no longer available') ||
    lower.includes('media not available') ||
    lower.includes('gone') ||
    lower.includes('expired') ||
    lower.includes('enoent')
  ) {
    return 'Media is no longer available on WhatsApp (often too old or never opened).';
  }

  if (
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('timeout') ||
    lower.includes('network') ||
    lower.includes('socket') ||
    lower.includes('fetch failed')
  ) {
    return 'Network or connection problem — try again.';
  }

  if (lower.includes('enospc') || lower.includes('no space')) {
    return 'Not enough disk space to save this file.';
  }

  if (lower.includes('eacces') || lower.includes('permission')) {
    return 'Permission denied writing to the sync folder.';
  }

  return text || 'Unknown download error';
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
