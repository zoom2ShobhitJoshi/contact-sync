import {describe, expect, it} from 'vitest';
import {
  classifyMedia,
  isReceivedOnOrAfter,
  resolveFileName,
  sanitizeFileName,
} from '../shared/media';

describe('classifyMedia', () => {
  it('puts stickers and still images in photos', () => {
    expect(classifyMedia({messageType: 'sticker'})).toBe('photos');
    expect(
      classifyMedia({messageType: 'image', mimeType: 'image/jpeg', fileName: 'a.jpg'}),
    ).toBe('photos');
  });

  it('puts GIFs in photos even when sent as video', () => {
    expect(
      classifyMedia({
        messageType: 'video',
        isGif: true,
        mimeType: 'video/mp4',
        fileName: 'clip.mp4',
      }),
    ).toBe('photos');
  });

  it('puts regular videos in videos', () => {
    expect(
      classifyMedia({
        messageType: 'video',
        mimeType: 'video/mp4',
        fileName: 'clip.mp4',
      }),
    ).toBe('videos');
  });

  it('puts voice notes and audio in audio', () => {
    expect(classifyMedia({messageType: 'audio', isVoiceNote: true})).toBe('audio');
    expect(
      classifyMedia({messageType: 'audio', mimeType: 'audio/ogg', fileName: 'note.ogg'}),
    ).toBe('audio');
  });

  it('puts office and zip files in documents', () => {
    expect(
      classifyMedia({
        messageType: 'document',
        mimeType: 'application/pdf',
        fileName: 'report.pdf',
      }),
    ).toBe('documents');
    expect(
      classifyMedia({
        messageType: 'document',
        mimeType: 'application/zip',
        fileName: 'archive.zip',
      }),
    ).toBe('documents');
  });

  it('routes document payloads by mime when they are media', () => {
    expect(
      classifyMedia({
        messageType: 'document',
        mimeType: 'image/png',
        fileName: 'shot.png',
      }),
    ).toBe('photos');
    expect(
      classifyMedia({
        messageType: 'document',
        mimeType: 'video/mp4',
        fileName: 'clip.mp4',
      }),
    ).toBe('videos');
  });
});

describe('resolveFileName', () => {
  it('keeps the original WhatsApp file name', () => {
    expect(resolveFileName('Holiday Photo.JPG', 'photos', 'msg1')).toBe(
      'Holiday Photo.JPG',
    );
  });

  it('falls back when WhatsApp sends no name', () => {
    expect(resolveFileName(undefined, 'photos', 'ABCD1234', 'image/jpeg')).toBe(
      'ABCD1234.jpg',
    );
  });

  it('sanitizes unsafe path characters', () => {
    expect(sanitizeFileName('a/b:c*.pdf')).toBe('a_b_c_.pdf');
  });
});

describe('isReceivedOnOrAfter', () => {
  it('includes media from the start day local midnight onward', () => {
    const start = '2024-06-15';
    const onDay = new Date(2024, 5, 15, 0, 0, 0, 0).getTime();
    const before = onDay - 1;
    const later = new Date(2024, 5, 16, 12, 0, 0, 0).getTime();
    expect(isReceivedOnOrAfter(onDay, start)).toBe(true);
    expect(isReceivedOnOrAfter(before, start)).toBe(false);
    expect(isReceivedOnOrAfter(later, start)).toBe(true);
  });
});
