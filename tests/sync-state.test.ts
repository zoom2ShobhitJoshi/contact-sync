import {describe, expect, it} from 'vitest';
import {
  defaultSettings,
  effectiveStartTimestampMs,
  ensureContactState,
  filterContacts,
  markDownloaded,
  needsStartDate,
  wasDownloaded,
} from '../shared/sync-state';

describe('sync state', () => {
  it('requires a start date on the first sync for a contact', () => {
    const settings = defaultSettings();
    expect(needsStartDate(settings, 'c1')).toBe(true);
    const withContact = ensureContactState(settings, 'c1', 'Ada', '2024-01-01');
    expect(needsStartDate(withContact, 'c1')).toBe(false);
    expect(withContact.lastContactId).toBe('c1');
  });

  it('remembers downloads per contact and skips duplicates', () => {
    let settings = ensureContactState(defaultSettings(), 'c1', 'Ada', '2024-01-01');
    settings = markDownloaded(settings, 'c1', 'msg-1', 1_700_000_000_000);
    expect(wasDownloaded(settings, 'c1', 'msg-1')).toBe(true);
    expect(wasDownloaded(settings, 'c1', 'msg-2')).toBe(false);
    expect(settings.contacts.c1.lastMessageTimestamp).toBe(1_700_000_000_000);
  });

  it('keeps separate folders/state when switching contacts', () => {
    let settings = ensureContactState(defaultSettings(), 'c1', 'Ada', '2024-01-01');
    settings = markDownloaded(settings, 'c1', 'msg-a', 100);
    settings = ensureContactState(settings, 'c2', 'Grace', '2024-02-01');
    expect(needsStartDate(settings, 'c2')).toBe(false);
    expect(wasDownloaded(settings, 'c1', 'msg-a')).toBe(true);
    expect(wasDownloaded(settings, 'c2', 'msg-a')).toBe(false);
    expect(settings.lastContactId).toBe('c2');
  });

  it('resumes after the last message timestamp on later runs', () => {
    let settings = ensureContactState(defaultSettings(), 'c1', 'Ada', '2024-06-15');
    settings = markDownloaded(settings, 'c1', 'msg-1', 1_000);
    const ts = effectiveStartTimestampMs(settings.contacts.c1);
    expect(ts).toBe(1_001);
  });

  it('filters contacts by name or phone for the dropdown search', () => {
    const list = filterContacts(
      [
        {id: '1', name: 'Ada Lovelace', phone: '1555'},
        {id: '2', name: 'Grace Hopper', phone: '1999'},
      ],
      'hop',
    );
    expect(list.map((c) => c.name)).toEqual(['Grace Hopper']);
  });
});
