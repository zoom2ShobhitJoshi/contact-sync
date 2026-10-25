import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
  loadAllPersistedMessageChats,
  loadPersistedContacts,
  savePersistedContacts,
  savePersistedMessages,
  setCacheRootForTests,
} from '../electron/persist-store';
import {
  annotateContactsForPicker,
  beginSyncForSelectedContact,
  contactSyncKind,
  emptyHistoryMessage,
  mergeKnownContacts,
  messagesForContact,
  searchContactsForPicker,
  selectionAfterQueryChange,
  syncKindCounts,
  syncKindLabel,
} from '../shared/contact-session';
import {
  defaultSettings,
  ensureContactState,
  markDownloaded,
  needsStartDate,
  wasDownloaded,
} from '../shared/sync-state';
import type {AppSettings, ContactInfo} from '../shared/types';

function tempCacheRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'contact-sync-cache-'));
}

function ada(): ContactInfo {
  return {
    id: '15551110001@s.whatsapp.net',
    name: 'Ada Lovelace',
    phone: '15551110001',
  };
}

function grace(): ContactInfo {
  return {
    id: '15552220002@s.whatsapp.net',
    name: 'Grace Hopper',
    phone: '15552220002',
  };
}

function katherine(): ContactInfo {
  return {
    id: '15553330003@s.whatsapp.net',
    name: 'Katherine Johnson',
    phone: '15553330003',
  };
}

/** Simulates first-run sync of one contact, then an app quit that drops memory. */
function firstRunSyncedAda(): {
  settings: AppSettings;
  diskContacts: ContactInfo[];
} {
  const contact = ada();
  let settings = ensureContactState(
    defaultSettings(),
    contact.id,
    contact.name,
    '2024-01-15',
  );
  settings = markDownloaded(settings, contact.id, 'msg-ada-1', 1_700_000_000_000);
  settings = {
    ...settings,
    rootFolder: '/tmp/ContactSyncMedia',
    lastContactId: contact.id,
  };
  return {settings, diskContacts: [contact]};
}

describe('restart then add contacts', () => {
  let cacheRoot: string;

  beforeEach(() => {
    cacheRoot = tempCacheRoot();
    setCacheRootForTests(cacheRoot);
  });

  afterEach(() => {
    setCacheRootForTests(null);
    fs.rmSync(cacheRoot, {recursive: true, force: true});
  });

  it('keeps the first-run contact in the picker after a cold restart with empty live contacts', () => {
    const {settings, diskContacts} = firstRunSyncedAda();
    savePersistedContacts(diskContacts);

    // Second process: no live WhatsApp list yet (still connecting).
    const known = mergeKnownContacts([], settings.contacts, loadPersistedContacts());

    expect(known.map((c) => c.name)).toEqual(['Ada Lovelace']);
    expect(needsStartDate(settings, ada().id)).toBe(false);
  });

  it('requires a start date when adding a brand-new contact on the second run', () => {
    const {settings} = firstRunSyncedAda();
    const newContact = grace();

    expect(needsStartDate(settings, newContact.id)).toBe(true);
    expect(() => beginSyncForSelectedContact(settings, newContact)).toThrow(
      /start date/i,
    );

    const started = beginSyncForSelectedContact(
      settings,
      newContact,
      '2025-03-01',
    );
    expect(started.requiresStartDate).toBe(true);
    expect(started.settings.contacts[newContact.id]?.startDateIso).toBe(
      '2025-03-01',
    );
    expect(started.settings.lastContactId).toBe(newContact.id);
    // Prior contact state must survive adding a new one.
    expect(wasDownloaded(started.settings, ada().id, 'msg-ada-1')).toBe(true);
  });

  it('resumes the previously synced contact without asking for a start date again', () => {
    const {settings} = firstRunSyncedAda();
    const resumed = beginSyncForSelectedContact(settings, ada());

    expect(resumed.requiresStartDate).toBe(false);
    expect(resumed.settings.contacts[ada().id]?.startDateIso).toBe('2024-01-15');
    expect(wasDownloaded(resumed.settings, ada().id, 'msg-ada-1')).toBe(true);
  });

  it('merges disk cache, saved sync states, and live contacts without duplicates', () => {
    const a = ada();
    const g = grace();
    savePersistedContacts([a]);

    const settings = ensureContactState(
      defaultSettings(),
      a.id,
      a.name,
      '2024-01-15',
    );
    // Live list uses a richer name for Ada and also includes Grace.
    const live: ContactInfo[] = [
      {...a, name: 'Ada L.'},
      g,
    ];

    const known = mergeKnownContacts(live, settings.contacts, loadPersistedContacts());
    expect(known).toHaveLength(2);
    expect(known.find((c) => c.id === a.id)?.name).toBe('Ada L.');
    expect(known.find((c) => c.id === g.id)?.name).toBe('Grace Hopper');
  });

  it('surfaces contacts that only exist in settings when the cache file is missing', () => {
    const {settings} = firstRunSyncedAda();
    expect(loadPersistedContacts()).toEqual([]);

    const known = mergeKnownContacts([], settings.contacts, []);
    expect(known).toHaveLength(1);
    expect(known[0]?.id).toBe(ada().id);
  });

  it('lets the user search for a new contact among first-run + live contacts', () => {
    const {settings, diskContacts} = firstRunSyncedAda();
    savePersistedContacts(diskContacts);
    const known = mergeKnownContacts(
      [grace(), katherine()],
      settings.contacts,
      loadPersistedContacts(),
    );

    expect(searchContactsForPicker(known, 'hop').map((c) => c.name)).toEqual([
      'Grace Hopper',
    ]);
    expect(searchContactsForPicker(known, '1555333').map((c) => c.name)).toEqual([
      'Katherine Johnson',
    ]);
    expect(searchContactsForPicker(known, '').map((c) => c.name)).toEqual([
      'Ada Lovelace',
      'Grace Hopper',
      'Katherine Johnson',
    ]);
  });

  it('clears selection when the search query no longer matches the selected contact', () => {
    const selected = ada();
    expect(selectionAfterQueryChange(selected, 'Ada')).toEqual(selected);
    expect(selectionAfterQueryChange(selected, 'Gr')).toBeNull();
    expect(selectionAfterQueryChange(selected, '')).toEqual(selected);
    expect(selectionAfterQueryChange(null, 'Ada')).toBeNull();
  });

  it('persists contacts and messages across a simulated process restart', () => {
    const a = ada();
    const g = grace();
    savePersistedContacts([a]);
    savePersistedMessages(a.id, [
      {
        key: {remoteJid: a.id, id: 'm1', fromMe: false},
        messageTimestamp: 100,
      } as never,
    ]);

    // "Quit" — drop override, then "relaunch" pointing at the same disk root.
    setCacheRootForTests(null);
    setCacheRootForTests(cacheRoot);

    expect(loadPersistedContacts()).toEqual([a]);
    // Second run adds Grace to the cache without wiping Ada.
    savePersistedContacts([...loadPersistedContacts(), g]);
    expect(loadPersistedContacts().map((c) => c.name)).toEqual([
      'Ada Lovelace',
      'Grace Hopper',
    ]);

    const chats = loadAllPersistedMessageChats();
    expect(chats).toHaveLength(1);
    expect(chats[0]?.jid).toBe(a.id);
    expect(chats[0]?.messages).toHaveLength(1);
  });

  it('finds cached messages when the contact id uses a phone vs lid alias', () => {
    const phoneJid = '15551110001@s.whatsapp.net';
    const lidJid = '15551110001@lid';
    const byChat = new Map([
      [
        lidJid,
        [
          {key: {remoteJid: lidJid, id: 'lid-1'}},
          {key: {remoteJid: lidJid, id: 'lid-2'}},
        ],
      ],
    ]);

    const found = messagesForContact(byChat, phoneJid);
    expect(found.map((m) => m.key.id)).toEqual(['lid-1', 'lid-2']);
  });

  it('dedupes the same message id when both phone and lid chat maps hold it', () => {
    const phoneJid = '15551110001@s.whatsapp.net';
    const lidJid = '15551110001@lid';
    const msg = {key: {remoteJid: phoneJid, id: 'shared-1'}};
    const byChat = new Map([
      [phoneJid, [msg]],
      [lidJid, [{key: {remoteJid: lidJid, id: 'shared-1'}}]],
    ]);

    expect(messagesForContact(byChat, phoneJid)).toHaveLength(1);
  });

  it('supports adding several new contacts in one second-run session', () => {
    let {settings} = firstRunSyncedAda();
    const newcomers = [grace(), katherine()];

    for (const contact of newcomers) {
      expect(needsStartDate(settings, contact.id)).toBe(true);
      const next = beginSyncForSelectedContact(settings, contact, '2025-06-01');
      settings = next.settings;
      expect(next.requiresStartDate).toBe(true);
    }

    expect(Object.keys(settings.contacts).sort()).toEqual(
      [ada().id, grace().id, katherine().id].sort(),
    );
    expect(wasDownloaded(settings, ada().id, 'msg-ada-1')).toBe(true);
    expect(settings.contacts[grace().id]?.downloadedIds).toEqual([]);
    expect(settings.lastContactId).toBe(katherine().id);
  });

  it('keeps first-run download history when switching away and back on second run', () => {
    let {settings} = firstRunSyncedAda();
    settings = beginSyncForSelectedContact(
      settings,
      grace(),
      '2025-01-01',
    ).settings;
    settings = markDownloaded(settings, grace().id, 'msg-grace-1', 2_000);

    const backToAda = beginSyncForSelectedContact(settings, ada());
    expect(backToAda.requiresStartDate).toBe(false);
    expect(wasDownloaded(backToAda.settings, ada().id, 'msg-ada-1')).toBe(true);
    expect(wasDownloaded(backToAda.settings, grace().id, 'msg-grace-1')).toBe(
      true,
    );
  });

  it('explains empty history clearly when a new contact has no cached messages yet', () => {
    expect(emptyHistoryMessage()).toMatch(/No messages found/i);
    expect(emptyHistoryMessage()).toMatch(/Start sync again/i);
  });

  it('does not treat a contact with empty startDateIso as already configured', () => {
    const contact = grace();
    const broken: AppSettings = {
      ...defaultSettings(),
      contacts: {
        [contact.id]: {
          contactId: contact.id,
          contactName: contact.name,
          startDateIso: '',
          downloadedIds: [],
        },
      },
    };
    expect(needsStartDate(broken, contact.id)).toBe(true);
    const fixed = beginSyncForSelectedContact(broken, contact, '2025-02-02');
    expect(fixed.settings.contacts[contact.id]?.startDateIso).toBe('2025-02-02');
  });

  it('round-trips a full first-run → quit → second-run → new contact flow on disk', () => {
    // --- First run ---
    const a = ada();
    let settings = ensureContactState(
      {...defaultSettings(), rootFolder: '/media'},
      a.id,
      a.name,
      '2024-06-01',
    );
    settings = markDownloaded(settings, a.id, 'photo-1', 500);
    savePersistedContacts([a]);
    savePersistedMessages(a.id, [
      {key: {remoteJid: a.id, id: 'photo-1', fromMe: false}} as never,
    ]);
    const settingsSnapshot = structuredClone(settings);

    // --- Quit: forget in-memory; disk remains ---
    setCacheRootForTests(null);

    // --- Second run ---
    setCacheRootForTests(cacheRoot);
    const restoredContacts = loadPersistedContacts();
    const known = mergeKnownContacts(
      [],
      settingsSnapshot.contacts,
      restoredContacts,
    );
    expect(known.map((c) => c.id)).toEqual([a.id]);

    const g = grace();
    // User types to find a newly connected live contact.
    const withLive = mergeKnownContacts(
      [g],
      settingsSnapshot.contacts,
      restoredContacts,
    );
    expect(searchContactsForPicker(withLive, 'Grace')).toHaveLength(1);

    const afterNew = beginSyncForSelectedContact(
      settingsSnapshot,
      g,
      '2025-10-01',
    );
    expect(afterNew.requiresStartDate).toBe(true);
    savePersistedContacts(
      mergeKnownContacts(
        [g],
        afterNew.settings.contacts,
        loadPersistedContacts(),
      ),
    );

    expect(loadPersistedContacts().map((c) => c.name).sort()).toEqual([
      'Ada Lovelace',
      'Grace Hopper',
    ]);
    expect(wasDownloaded(afterNew.settings, a.id, 'photo-1')).toBe(true);
    expect(needsStartDate(afterNew.settings, g.id)).toBe(false);
  });

  it('labels first-run contacts as synced and newcomers as new before Start sync', () => {
    const {settings} = firstRunSyncedAda();
    const known = mergeKnownContacts([grace(), katherine()], settings.contacts);
    const picker = annotateContactsForPicker(known, settings);

    expect(picker.map((c) => [c.name, c.syncKind])).toEqual([
      ['Ada Lovelace', 'synced'],
      ['Grace Hopper', 'new'],
      ['Katherine Johnson', 'new'],
    ]);
    expect(syncKindCounts(picker)).toEqual({synced: 1, new: 2});
    expect(syncKindLabel('synced')).toBe('Synced');
    expect(syncKindLabel('new')).toBe('New');
    expect(contactSyncKind(settings, ada().id)).toBe('synced');
    expect(contactSyncKind(settings, grace().id)).toBe('new');
  });

  it('treats a phone/lid alias of a synced contact as already hydrated', () => {
    const {settings} = firstRunSyncedAda();
    const lidTwin: ContactInfo = {
      id: '15551110001@lid',
      name: 'Ada Lovelace',
      phone: '15551110001',
    };
    expect(contactSyncKind(settings, lidTwin.id)).toBe('synced');
    const picker = annotateContactsForPicker([lidTwin, grace()], settings);
    expect(picker[0]?.syncKind).toBe('synced');
    expect(picker[1]?.syncKind).toBe('new');
  });
});
