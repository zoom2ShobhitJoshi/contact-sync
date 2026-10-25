import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WAMessage,
  type WASocket,
} from '@whiskeysockets/baileys';
import {Boom} from '@hapi/boom';
import {useMultiFileAuthState} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import {jidsMatch, normalizeJid} from '../shared/jids.js';
import type {ContactInfo, ConnectionStatus} from '../shared/types.js';
import {
  loadAllPersistedMessageChats,
  loadPersistedContacts,
  savePersistedContacts,
  savePersistedMessages,
} from './persist-store.js';
import {authDir, loadSettings} from './settings-store.js';

export type WhatsAppEvents = {
  onStatus: (status: ConnectionStatus) => void;
  onQr: (dataUrl: string) => void;
  onContacts: (contacts: ContactInfo[]) => void;
  onMessage: (message: WAMessage) => void;
  onError: (message: string) => void;
};

export class WhatsAppClient {
  private sock: WASocket | null = null;
  private contacts = new Map<string, ContactInfo>();
  private messagesByChat = new Map<string, WAMessage[]>();
  private starting = false;
  private persistTimer: NodeJS.Timeout | null = null;

  private hydrated = false;

  constructor(private readonly events: WhatsAppEvents) {}

  getSocket(): WASocket | null {
    return this.sock;
  }

  listContacts(): ContactInfo[] {
    this.ensureHydrated();
    return [...this.contacts.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  getMessagesForContact(contactId: string): WAMessage[] {
    this.ensureHydrated();
    const matched: WAMessage[] = [];
    const seen = new Set<string>();
    for (const [jid, list] of this.messagesByChat.entries()) {
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

  getMessage(contactId: string, messageId: string): WAMessage | undefined {
    return this.getMessagesForContact(contactId).find((m) => m.key.id === messageId);
  }

  async start(): Promise<void> {
    if (this.starting) {
      return;
    }
    this.ensureHydrated();
    if (this.sock) {
      // Already connected — refresh contact list for the UI.
      this.publishContacts();
      return;
    }
    this.starting = true;
    this.events.onStatus('connecting');

    try {
      const {state, saveCreds} = await useMultiFileAuthState(authDir());
      const {version} = await fetchLatestBaileysVersion();
      const logger = pino({level: 'silent'});

      const sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        logger,
        printQRInTerminal: false,
        syncFullHistory: true,
        markOnlineOnConnect: false,
        getMessage: async (key) => {
          const jid = key.remoteJid;
          if (!jid || !key.id) {
            return undefined;
          }
          const msg = this.getMessage(jid, key.id);
          return msg?.message ?? undefined;
        },
      });
      this.sock = sock;

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update) => {
        const {connection, lastDisconnect, qr} = update;
        if (qr) {
          this.events.onStatus('qr');
          const dataUrl = await QRCode.toDataURL(qr, {margin: 1, width: 280});
          this.events.onQr(dataUrl);
        }
        if (connection === 'open') {
          this.events.onStatus('ready');
          this.publishContacts();
        }
        if (connection === 'close') {
          const code = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
          this.sock = null;
          this.starting = false;
          this.flushPersist();
          if (code === DisconnectReason.loggedOut) {
            this.events.onStatus('logged_out');
            return;
          }
          this.events.onStatus('disconnected');
          setTimeout(() => {
            void this.start();
          }, 2000);
        }
      });

      sock.ev.on('contacts.upsert', (list) => {
        for (const c of list) {
          this.upsertContact(c.id, c.notify || c.name || c.verifiedName || c.id);
        }
        this.publishContacts();
      });

      sock.ev.on('contacts.update', (list) => {
        for (const c of list) {
          if (!c.id) continue;
          this.upsertContact(c.id, c.notify || c.name || c.verifiedName);
        }
        this.publishContacts();
      });

      sock.ev.on('chats.upsert', (chats) => {
        for (const chat of chats) {
          if (chat.id.endsWith('@g.us')) continue;
          this.upsertContact(chat.id, chat.name || chat.id);
        }
        this.publishContacts();
      });

      sock.ev.on('chats.update', (chats) => {
        for (const chat of chats) {
          if (!chat.id || chat.id.endsWith('@g.us')) continue;
          this.upsertContact(chat.id, chat.name);
        }
        this.publishContacts();
      });

      sock.ev.on('messaging-history.set', ({messages, contacts, chats}) => {
        for (const c of contacts || []) {
          this.upsertContact(c.id, c.notify || c.name || c.verifiedName || c.id);
        }
        for (const chat of chats || []) {
          if (chat.id.endsWith('@g.us')) continue;
          this.upsertContact(chat.id, chat.name || chat.id);
        }
        for (const msg of messages || []) {
          this.rememberMessage(msg);
        }
        this.publishContacts();
        this.flushPersist();
      });

      sock.ev.on('messages.upsert', ({messages}) => {
        for (const msg of messages) {
          this.rememberMessage(msg);
          this.events.onMessage(msg);
        }
        this.schedulePersist();
      });
    } catch (err) {
      this.starting = false;
      this.sock = null;
      this.events.onStatus('disconnected');
      this.events.onError(err instanceof Error ? err.message : String(err));
    } finally {
      this.starting = false;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.sock?.logout();
    } catch {
      // ignore
    }
    this.sock = null;
    this.events.onStatus('logged_out');
  }

  async downloadMessageMedia(message: WAMessage): Promise<Buffer> {
    if (!this.sock) {
      throw new Error('WhatsApp is not connected');
    }
    const buffer = await downloadMediaMessage(
      message,
      'buffer',
      {},
      {
        logger: pino({level: 'silent'}),
        reuploadRequest: this.sock.updateMediaMessage,
      },
    );
    return buffer as Buffer;
  }

  private ensureHydrated(): void {
    if (this.hydrated) {
      return;
    }
    this.hydrated = true;
    this.hydrateFromDisk();
  }

  private hydrateFromDisk(): void {
    for (const contact of loadPersistedContacts()) {
      this.upsertContact(contact.id, contact.name, false);
    }
    try {
      const settings = loadSettings();
      for (const state of Object.values(settings.contacts)) {
        this.upsertContact(state.contactId, state.contactName, false);
      }
    } catch {
      // app may not be ready yet in tests
    }
    for (const chat of loadAllPersistedMessageChats()) {
      if (chat.messages.length === 0) {
        continue;
      }
      this.messagesByChat.set(normalizeJid(chat.jid), chat.messages);
      this.upsertContact(chat.jid, undefined, false);
    }
    this.publishContacts();
  }

  private upsertContact(
    id: string,
    name?: string | null,
    persist = true,
  ): void {
    if (!id || id === 'status@broadcast' || id.endsWith('@g.us') || id.endsWith('@newsletter')) {
      return;
    }
    const key = normalizeJid(id);
    const prev = this.contacts.get(key);
    const phone = id.replace(/@.*/, '');
    const display =
      (name && name.trim()) ||
      prev?.name ||
      phone;
    this.contacts.set(key, {id: key, name: display, phone});
    if (persist) {
      this.schedulePersist();
    }
  }

  private publishContacts(): void {
    this.events.onContacts(this.listContacts());
  }

  private rememberMessage(msg: WAMessage): void {
    const jid = msg.key.remoteJid;
    if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') {
      return;
    }
    const key = normalizeJid(jid);
    const alt = normalizeJid(
      (msg.key as {remoteJidAlt?: string | null}).remoteJidAlt ?? undefined,
    );
    this.storeMessage(key, msg);
    if (alt && alt !== key) {
      this.storeMessage(alt, msg);
    }

    if (!msg.key.fromMe) {
      this.upsertContact(jid, undefined);
      if (alt) {
        this.upsertContact(alt, undefined);
      }
    }
  }

  private storeMessage(jid: string, msg: WAMessage): void {
    const list = this.messagesByChat.get(jid) ?? [];
    const id = msg.key.id;
    if (id && list.some((m) => m.key.id === id)) {
      return;
    }
    list.push(msg);
    this.messagesByChat.set(jid, list);
  }

  private schedulePersist(): void {
    if (this.persistTimer) {
      return;
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.flushPersist();
    }, 1500);
  }

  private flushPersist(): void {
    savePersistedContacts(this.listContacts());
    for (const [jid, messages] of this.messagesByChat.entries()) {
      savePersistedMessages(jid, messages);
    }
  }
}

export function messageTimestampMs(msg: WAMessage): number {
  const ts = msg.messageTimestamp;
  if (!ts) {
    return 0;
  }
  const n = typeof ts === 'number' ? ts : Number(ts);
  return n > 1e12 ? n : n * 1000;
}

export function isFromContact(msg: WAMessage, contactId: string): boolean {
  if (msg.key.fromMe) {
    return false;
  }
  const remote = msg.key.remoteJid;
  const alt = (msg.key as {remoteJidAlt?: string | null}).remoteJidAlt;
  return jidsMatch(remote, contactId) || jidsMatch(alt, contactId);
}
