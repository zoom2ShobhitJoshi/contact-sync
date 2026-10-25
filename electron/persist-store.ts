import fs from 'node:fs';
import path from 'node:path';
import type {WAMessage} from '@whiskeysockets/baileys';
import type {ContactInfo} from '../shared/types.js';
import {normalizeJid} from '../shared/jids.js';

const MAX_MESSAGES_PER_CHAT = 8_000;

interface MessageFile {
  jid: string;
  messages: WAMessage[];
}

let cacheRootOverride: string | null = null;

/** Test helper — point cache at a temp folder without Electron. */
export function setCacheRootForTests(root: string | null): void {
  cacheRootOverride = root;
}

function dataRoot(): string {
  if (cacheRootOverride) {
    return cacheRootOverride;
  }
  // Lazy-require electron so unit tests can run without launching Electron.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {app} = require('electron') as typeof import('electron');
  return path.join(app.getPath('userData'), 'wa-cache');
}

function contactsPath(): string {
  return path.join(dataRoot(), 'contacts.json');
}

function messagesDir(): string {
  return path.join(dataRoot(), 'messages');
}

function safeFileName(jid: string): string {
  return normalizeJid(jid).replace(/[^a-z0-9._-]+/gi, '_');
}

export function loadPersistedContacts(): ContactInfo[] {
  const file = contactsPath();
  if (!fs.existsSync(file)) {
    return [];
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as ContactInfo[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function savePersistedContacts(contacts: ContactInfo[]): void {
  const file = contactsPath();
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify(contacts, null, 2), 'utf8');
}

export function loadPersistedMessages(jid: string): WAMessage[] {
  const file = path.join(messagesDir(), `${safeFileName(jid)}.json`);
  if (!fs.existsSync(file)) {
    return [];
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as MessageFile | WAMessage[];
    if (Array.isArray(raw)) {
      return raw;
    }
    return Array.isArray(raw.messages) ? raw.messages : [];
  } catch {
    return [];
  }
}

export function savePersistedMessages(jid: string, messages: WAMessage[]): void {
  const dir = messagesDir();
  fs.mkdirSync(dir, {recursive: true});
  const trimmed =
    messages.length > MAX_MESSAGES_PER_CHAT
      ? messages.slice(messages.length - MAX_MESSAGES_PER_CHAT)
      : messages;
  const file = path.join(dir, `${safeFileName(jid)}.json`);
  const payload: MessageFile = {jid: normalizeJid(jid), messages: trimmed};
  fs.writeFileSync(file, JSON.stringify(payload), 'utf8');
}

/** Loads every cached chat file as [jid, messages]. */
export function loadAllPersistedMessageChats(): Array<{jid: string; messages: WAMessage[]}> {
  const dir = messagesDir();
  if (!fs.existsSync(dir)) {
    return [];
  }
  const out: Array<{jid: string; messages: WAMessage[]}> = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) {
      continue;
    }
    const file = path.join(dir, name);
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as MessageFile | WAMessage[];
      if (Array.isArray(raw)) {
        out.push({jid: name.replace(/\.json$/, ''), messages: raw});
      } else if (raw?.jid && Array.isArray(raw.messages)) {
        out.push({jid: normalizeJid(raw.jid), messages: raw.messages});
      }
    } catch {
      // skip corrupt files
    }
  }
  return out;
}
