import {describe, expect, it} from 'vitest';
import {jidsMatch, normalizeJid} from '../shared/jids';

describe('jidsMatch', () => {
  it('matches identical jids', () => {
    expect(jidsMatch('1555@s.whatsapp.net', '1555@s.whatsapp.net')).toBe(true);
  });

  it('matches phone user across host suffixes', () => {
    expect(jidsMatch('15551234567@s.whatsapp.net', '15551234567@lid')).toBe(true);
  });

  it('matches device-suffixed users', () => {
    expect(jidsMatch('1555:12@s.whatsapp.net', '1555@s.whatsapp.net')).toBe(true);
  });

  it('does not match different people', () => {
    expect(jidsMatch('111@s.whatsapp.net', '222@s.whatsapp.net')).toBe(false);
  });

  it('normalizes case and whitespace', () => {
    expect(normalizeJid(' 1555@S.WhatsApp.Net ')).toBe('1555@s.whatsapp.net');
  });
});
