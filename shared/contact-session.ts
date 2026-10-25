import {jidsMatch, normalizeJid} from './jids.js';
import type {AppSettings, ContactInfo, ContactSyncState} from './types.js';
import {ensureContactState, filterContacts, needsStartDate} from './sync-state.js';

/** Whether a picker contact already has sync state on this computer. */
export type ContactSyncKind = 'synced' | 'new';

export interface PickerContact extends ContactInfo {
  syncKind: ContactSyncKind;
}

/** Find saved sync state even when phone vs LID JIDs differ. */
export function findContactSyncState(
  settings: AppSettings,
  contactId: string,
): ContactSyncState | undefined {
  const direct = settings.contacts[contactId];
  if (direct?.startDateIso) {
    return direct;
  }
  for (const state of Object.values(settings.contacts)) {
    if (jidsMatch(state.contactId, contactId) && state.startDateIso) {
      return state;
    }
  }
  return direct;
}

/**
 * Synced = already hydrated / has a saved start date (resume).
 * New = never synced here yet (needs a start date before Start sync).
 */
export function contactSyncKind(
  settings: AppSettings,
  contactId: string,
): ContactSyncKind {
  const state = findContactSyncState(settings, contactId);
  return state?.startDateIso ? 'synced' : 'new';
}

/** Tag and sort contacts so already-synced people appear first in the picker. */
export function annotateContactsForPicker(
  contacts: ContactInfo[],
  settings: AppSettings,
): PickerContact[] {
  return contacts
    .map((contact) => ({
      ...contact,
      syncKind: contactSyncKind(settings, contact.id),
    }))
    .sort((a, b) => {
      if (a.syncKind !== b.syncKind) {
        return a.syncKind === 'synced' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
}

export function syncKindLabel(kind: ContactSyncKind): string {
  return kind === 'synced' ? 'Synced' : 'New';
}

export function syncKindCounts(contacts: PickerContact[]): {
  synced: number;
  new: number;
} {
  let synced = 0;
  let fresh = 0;
  for (const c of contacts) {
    if (c.syncKind === 'synced') {
      synced += 1;
    } else {
      fresh += 1;
    }
  }
  return {synced, new: fresh};
}

/**
 * Merge live WhatsApp contacts with contacts remembered from prior syncs /
 * disk cache so the second launch still has a usable dropdown.
 */
export function mergeKnownContacts(
  liveContacts: ContactInfo[],
  savedContactStates: Record<string, ContactSyncState>,
  cachedContacts: ContactInfo[] = [],
): ContactInfo[] {
  const byId = new Map<string, ContactInfo>();

  const put = (contact: ContactInfo) => {
    const id = normalizeJid(contact.id);
    if (!id) {
      return;
    }
    const prev = byId.get(id);
    byId.set(id, {
      id,
      name: contact.name?.trim() || prev?.name || id.replace(/@.*/, ''),
      phone: contact.phone || prev?.phone || id.replace(/@.*/, ''),
    });
  };

  for (const c of cachedContacts) {
    put(c);
  }
  for (const state of Object.values(savedContactStates)) {
    put({
      id: state.contactId,
      name: state.contactName,
      phone: state.contactId.replace(/@.*/, ''),
    });
  }
  for (const c of liveContacts) {
    put(c);
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Search helper used by the contact dropdown. */
export function searchContactsForPicker(
  contacts: ContactInfo[],
  query: string,
): ContactInfo[] {
  return filterContacts(contacts, query);
}

/**
 * After typing in the search box, keep the current selection only while the
 * query still matches that contact's name prefix.
 */
export function selectionAfterQueryChange(
  selected: ContactInfo | null,
  query: string,
): ContactInfo | null {
  if (!selected) {
    return null;
  }
  const q = query.trim().toLowerCase();
  if (!q) {
    return selected;
  }
  if (selected.name.toLowerCase().startsWith(q)) {
    return selected;
  }
  return null;
}

/**
 * Second-run flow: user picks a contact that may be new or previously synced.
 */
export function beginSyncForSelectedContact(
  settings: AppSettings,
  contact: ContactInfo,
  startDateIso?: string,
): {settings: AppSettings; requiresStartDate: boolean} {
  const requiresStartDate = needsStartDate(settings, contact.id);
  if (requiresStartDate) {
    if (!startDateIso) {
      throw new Error('Pick a start date for the first sync with this contact');
    }
    return {
      settings: ensureContactState(
        settings,
        contact.id,
        contact.name,
        startDateIso,
      ),
      requiresStartDate: true,
    };
  }
  const existing = settings.contacts[contact.id]!;
  return {
    settings: ensureContactState(
      settings,
      contact.id,
      contact.name,
      existing.startDateIso,
    ),
    requiresStartDate: false,
  };
}

/** Find messages belonging to a contact across possibly aliased JIDs. */
export function messagesForContact<T extends {key: {remoteJid?: string | null; id?: string | null}}>(
  messagesByChat: Map<string, T[]>,
  contactId: string,
): T[] {
  const matched: T[] = [];
  const seen = new Set<string>();
  for (const [jid, list] of messagesByChat.entries()) {
    if (!jidsMatch(jid, contactId)) {
      continue;
    }
    for (const msg of list) {
      const id = msg.key.id ?? `${jid}-${matched.length}`;
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      matched.push(msg);
    }
  }
  return matched;
}

export function emptyHistoryMessage(): string {
  return (
    'No messages found for this contact yet. Keep Contact Sync open, open the chat on your phone so WhatsApp syncs history, then tap Start sync again.'
  );
}
