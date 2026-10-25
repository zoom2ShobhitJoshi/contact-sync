import type {proto, WAMessage} from '@whiskeysockets/baileys';
import {classifyMedia, resolveFileName} from '../shared/media.js';
import type {ClassifyInput, MediaCandidate, MediaKind} from '../shared/types.js';
import {messageTimestampMs} from './whatsapp.js';

type AnyMessageContent = proto.IMessage;

function unwrapMessage(message?: AnyMessageContent | null): AnyMessageContent | null {
  if (!message) {
    return null;
  }
  if (message.ephemeralMessage?.message) {
    return unwrapMessage(message.ephemeralMessage.message);
  }
  if (message.viewOnceMessage?.message) {
    return unwrapMessage(message.viewOnceMessage.message);
  }
  if (message.viewOnceMessageV2?.message) {
    return unwrapMessage(message.viewOnceMessageV2.message);
  }
  if (message.documentWithCaptionMessage?.message) {
    return unwrapMessage(message.documentWithCaptionMessage.message);
  }
  return message;
}

export function extractMediaCandidate(msg: WAMessage): MediaCandidate | null {
  const content = unwrapMessage(msg.message);
  if (!content) {
    return null;
  }

  const messageId = msg.key.id;
  if (!messageId) {
    return null;
  }

  let input: ClassifyInput | null = null;
  let fileName: string | undefined;
  let mimeType: string | undefined;

  if (content.imageMessage) {
    mimeType = content.imageMessage.mimetype ?? undefined;
    fileName =
      (content.imageMessage as {fileName?: string | null}).fileName ?? undefined;
    input = {
      messageType: 'image',
      mimeType,
      fileName,
      isGif: mimeType === 'image/gif',
    };
  } else if (content.stickerMessage) {
    mimeType = content.stickerMessage.mimetype ?? 'image/webp';
    input = {messageType: 'sticker', mimeType};
  } else if (content.videoMessage) {
    mimeType = content.videoMessage.mimetype ?? undefined;
    fileName =
      (content.videoMessage as {fileName?: string | null}).fileName ?? undefined;
    input = {
      messageType: 'video',
      mimeType,
      fileName,
      isGif: Boolean(content.videoMessage.gifPlayback),
    };
  } else if (content.audioMessage) {
    mimeType = content.audioMessage.mimetype ?? undefined;
    input = {
      messageType: 'audio',
      mimeType,
      isVoiceNote: Boolean(content.audioMessage.ptt),
    };
  } else if (content.documentMessage) {
    mimeType = content.documentMessage.mimetype ?? undefined;
    fileName = content.documentMessage.fileName ?? undefined;
    input = {
      messageType: 'document',
      mimeType,
      fileName,
    };
  }

  if (!input) {
    return null;
  }

  const kind = classifyMedia(input);
  if (!kind) {
    return null;
  }

  return {
    messageId,
    timestampMs: messageTimestampMs(msg),
    kind,
    fileName: resolveFileName(fileName, kind, messageId, mimeType),
    mimeType,
  };
}

export function kindLabel(kind: MediaKind): string {
  return kind;
}
