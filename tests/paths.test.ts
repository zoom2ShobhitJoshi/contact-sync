import {describe, expect, it} from 'vitest';
import {buildMediaPath, contactFolderName, uniquePath} from '../shared/paths';

describe('buildMediaPath', () => {
  it('nests kind folders under the contact name', () => {
    const path = buildMediaPath(
      '/Users/me/WhatsAppSync',
      'Ada Lovelace',
      '15551234567@s.whatsapp.net',
      'photos',
      'IMG_001.jpg',
    );
    expect(path.contactDir).toBe('/Users/me/WhatsAppSync/Ada Lovelace');
    expect(path.dir).toBe('/Users/me/WhatsAppSync/Ada Lovelace/photos');
    expect(path.fullPath).toBe(
      '/Users/me/WhatsAppSync/Ada Lovelace/photos/IMG_001.jpg',
    );
  });

  it('uses a safe folder when the contact has no display name', () => {
    expect(contactFolderName('  ', '1555@s.whatsapp.net')).toBe('1555');
  });
});

describe('uniquePath', () => {
  it('appends a counter when the original name already exists on disk', () => {
    const existing = new Set(['/root/Ada/photos/a.jpg']);
    expect(uniquePath('/root/Ada/photos/a.jpg', (p) => existing.has(p))).toBe(
      '/root/Ada/photos/a (1).jpg',
    );
  });
});
