import type {ClassifyInput, MediaKind} from './types.js';

const IMAGE_EXT = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.bmp',
  '.heic',
  '.heif',
  '.tif',
  '.tiff',
]);

const VIDEO_EXT = new Set([
  '.mp4',
  '.mov',
  '.mkv',
  '.avi',
  '.webm',
  '.3gp',
  '.m4v',
]);

const AUDIO_EXT = new Set([
  '.ogg',
  '.opus',
  '.mp3',
  '.m4a',
  '.wav',
  '.aac',
  '.flac',
]);

function extensionOf(fileName?: string): string {
  if (!fileName) {
    return '';
  }
  const i = fileName.lastIndexOf('.');
  if (i < 0) {
    return '';
  }
  return fileName.slice(i).toLowerCase();
}

function mimeMajor(mimeType?: string): string {
  if (!mimeType) {
    return '';
  }
  return mimeType.split('/')[0]?.toLowerCase() ?? '';
}

/**
 * Maps a WhatsApp media message to a local subfolder kind.
 * GIFs (including video-as-GIF) go to photos with stickers and still images.
 */
export function classifyMedia(input: ClassifyInput): MediaKind | null {
  const {messageType, mimeType, fileName, isGif, isVoiceNote} = input;
  const ext = extensionOf(fileName);
  const major = mimeMajor(mimeType);

  if (messageType === 'sticker') {
    return 'photos';
  }

  if (messageType === 'image' || isGif) {
    return 'photos';
  }

  if (messageType === 'video') {
    if (isGif || mimeType === 'image/gif') {
      return 'photos';
    }
    return 'videos';
  }

  if (messageType === 'audio' || isVoiceNote) {
    return 'audio';
  }

  if (messageType === 'document') {
    if (major === 'image' || IMAGE_EXT.has(ext) || mimeType === 'image/gif') {
      return 'photos';
    }
    if (major === 'video' || VIDEO_EXT.has(ext)) {
      return 'videos';
    }
    if (major === 'audio' || AUDIO_EXT.has(ext)) {
      return 'audio';
    }
    return 'documents';
  }

  if (major === 'image' || IMAGE_EXT.has(ext)) {
    return 'photos';
  }
  if (major === 'video' || VIDEO_EXT.has(ext)) {
    return 'videos';
  }
  if (major === 'audio' || AUDIO_EXT.has(ext)) {
    return 'audio';
  }

  return null;
}

/** Prefer WhatsApp's original file name; fall back only when absent. */
export function resolveFileName(
  originalName: string | undefined,
  kind: MediaKind,
  messageId: string,
  mimeType?: string,
): string {
  const trimmed = originalName?.trim();
  if (trimmed) {
    return sanitizeFileName(trimmed);
  }

  const ext = defaultExtension(kind, mimeType);
  return sanitizeFileName(`${messageId}${ext}`);
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/^\.+/, '_');
}

function defaultExtension(kind: MediaKind, mimeType?: string): string {
  if (mimeType) {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'video/mp4': '.mp4',
      'audio/ogg': '.ogg',
      'audio/mpeg': '.mp3',
      'application/pdf': '.pdf',
    };
    if (map[mimeType]) {
      return map[mimeType];
    }
  }
  switch (kind) {
    case 'photos':
      return '.jpg';
    case 'videos':
      return '.mp4';
    case 'audio':
      return '.ogg';
    case 'documents':
      return '.bin';
  }
}

export function isReceivedOnOrAfter(
  messageTimestampMs: number,
  startDateIso: string,
): boolean {
  const start = startOfLocalDayMs(startDateIso);
  return messageTimestampMs >= start;
}

/** Interprets YYYY-MM-DD as local midnight. */
export function startOfLocalDayMs(dateIso: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (!match) {
    throw new Error(`Invalid start date: ${dateIso}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}
