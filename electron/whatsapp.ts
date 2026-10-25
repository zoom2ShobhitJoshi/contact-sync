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
import type {ContactInfo, ConnectionStatus} from '../shared/types.js';
import {authDir} from './settings-store.js';

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

  constructor(private readonly events: WhatsAppEvents) {}

  getSocket(): WASocket | null {
    return this.sock;
  }

  listContacts(): ContactInfo[] {
    return [...this.contacts.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  getMessagesForContact(contactId: string): WAMessage[] {
    return this.messagesByChat.get(contactId) ?? [];
  }

  async start(): Promise<void> {
    if (this.starting || this.sock) {
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
      });

      sock.ev.on('messages.upsert', ({messages}) => {
        for (const msg of messages) {
          this.rememberMessage(msg);
          this.events.onMessage(msg);
        }
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

  private upsertContact(id: string, name?: string | null): void {
    if (!id || id === 'status@broadcast' || id.endsWith('@g.us') || id.endsWith('@newsletter')) {
      return;
    }
    const prev = this.contacts.get(id);
    const phone = id.replace(/@.*/, '');
    const display =
      (name && name.trim()) ||
      prev?.name ||
      phone;
    this.contacts.set(id, {id, name: display, phone});
  }

  private publishContacts(): void {
    this.events.onContacts(this.listContacts());
  }

  private rememberMessage(msg: WAMessage): void {
    const jid = msg.key.remoteJid;
    if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') {
      return;
    }
    const list = this.messagesByChat.get(jid) ?? [];
    const id = msg.key.id;
    if (id && list.some((m) => m.key.id === id)) {
      return;
    }
    list.push(msg);
    this.messagesByChat.set(jid, list);

    if (!msg.key.fromMe) {
      this.upsertContact(jid, undefined);
    }
  }
}

export function messageTimestampMs(msg: WAMessage): number {
  const ts = msg.messageTimestamp;
  if (!ts) {
    return 0;
  }
  const n = typeof ts === 'number' ? ts : Number(ts);
  // WhatsApp timestamps are seconds.
  return n > 1e12 ? n : n * 1000;
}

export function isFromContact(msg: WAMessage, contactId: string): boolean {
  if (msg.key.fromMe) {
    return false;
  }
  const remote = msg.key.remoteJid;
  if (remote === contactId) {
    return true;
  }
  // Linked device participant for groups — we skip groups entirely.
  return false;
}
