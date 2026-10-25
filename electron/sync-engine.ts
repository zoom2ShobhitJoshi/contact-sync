import fs from 'node:fs';
import path from 'node:path';
import type {WAMessage} from '@whiskeysockets/baileys';
import {buildMediaPath, uniquePath} from '../shared/paths.js';
import {
  defaultProgress,
  ensureContactState,
  getContactState,
  markDownloaded,
  needsStartDate,
  wasDownloaded,
} from '../shared/sync-state.js';
import type {AppSettings, SyncProgress} from '../shared/types.js';
import {extractMediaCandidate} from './message-media.js';
import {loadSettings, saveSettings} from './settings-store.js';
import {
  isFromContact,
  messageTimestampMs,
  WhatsAppClient,
} from './whatsapp.js';

export class SyncEngine {
  private progress: SyncProgress = defaultProgress();
  private running = false;

  constructor(
    private readonly client: WhatsAppClient,
    private readonly onProgress: (progress: SyncProgress) => void,
    private readonly onSettings: (settings: AppSettings) => void,
  ) {}

  getProgress(): SyncProgress {
    return this.progress;
  }

  async syncContact(contactId: string, contactName: string, startDateIso?: string): Promise<void> {
    if (this.running) {
      throw new Error('A sync is already running');
    }

    let settings = loadSettings();
    if (!settings.rootFolder) {
      throw new Error('Choose a root folder before syncing');
    }

    if (needsStartDate(settings, contactId)) {
      if (!startDateIso) {
        throw new Error('Pick a start date for the first sync with this contact');
      }
      settings = ensureContactState(settings, contactId, contactName, startDateIso);
      saveSettings(settings);
      this.onSettings(settings);
    } else {
      settings = ensureContactState(
        settings,
        contactId,
        contactName,
        getContactState(settings, contactId)!.startDateIso,
      );
      saveSettings(settings);
      this.onSettings(settings);
    }

    const state = getContactState(settings, contactId)!;
    const resumeAfter = state.lastMessageTimestamp
      ? state.lastMessageTimestamp
      : undefined;
    const startMs = (() => {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(state.startDateIso);
      if (!match) throw new Error(`Invalid start date: ${state.startDateIso}`);
      return new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        0,
        0,
        0,
        0,
      ).getTime();
    })();

    this.running = true;
    this.progress = {
      ...defaultProgress(),
      status: 'running',
      contactId,
      contactName,
      message: 'Scanning messages…',
    };
    this.onProgress(this.progress);

    try {
      const messages = this.client
        .getMessagesForContact(contactId)
        .filter((m) => isFromContact(m, contactId))
        .sort((a, b) => messageTimestampMs(a) - messageTimestampMs(b));

      for (const msg of messages) {
        await this.processMessage(msg, contactId, contactName, startMs, resumeAfter);
      }

      this.progress = {
        ...this.progress,
        status: 'done',
        currentFile: undefined,
        message: `Done. Downloaded ${this.progress.downloaded}, skipped ${this.progress.skipped}, failed ${this.progress.failed}.`,
      };
      this.onProgress(this.progress);
    } catch (err) {
      this.progress = {
        ...this.progress,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        message: 'Sync failed',
      };
      this.onProgress(this.progress);
    } finally {
      this.running = false;
    }
  }

  async handleLiveMessage(msg: WAMessage): Promise<void> {
    if (this.running) {
      return;
    }
    const settings = loadSettings();
    const contactId = settings.lastContactId;
    if (!contactId || !settings.rootFolder) {
      return;
    }
    if (!isFromContact(msg, contactId)) {
      return;
    }
    const state = getContactState(settings, contactId);
    if (!state) {
      return;
    }
    const startMs = (() => {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(state.startDateIso);
      if (!match) return 0;
      return new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        0,
        0,
        0,
        0,
      ).getTime();
    })();

    this.running = true;
    try {
      await this.processMessage(
        msg,
        contactId,
        state.contactName,
        startMs,
        state.lastMessageTimestamp,
      );
      if (this.progress.status === 'running') {
        this.progress = {...this.progress, status: 'done', message: 'Live update saved'};
        this.onProgress(this.progress);
      }
    } finally {
      this.running = false;
    }
  }

  private async processMessage(
    msg: WAMessage,
    contactId: string,
    contactName: string,
    startMs: number,
    resumeAfter?: number,
  ): Promise<void> {
    const candidate = extractMediaCandidate(msg);
    if (!candidate) {
      return;
    }

    this.progress = {
      ...this.progress,
      status: 'running',
      scanned: this.progress.scanned + 1,
    };
    this.onProgress(this.progress);

    const ts = candidate.timestampMs;
    if (ts < startMs) {
      this.progress = {...this.progress, skipped: this.progress.skipped + 1};
      this.onProgress(this.progress);
      return;
    }
    if (resumeAfter != null && ts <= resumeAfter) {
      // Still check downloaded ids for safety on same-timestamp media.
      const settings = loadSettings();
      if (wasDownloaded(settings, contactId, candidate.messageId)) {
        this.progress = {...this.progress, skipped: this.progress.skipped + 1};
        this.onProgress(this.progress);
        return;
      }
    }

    let settings = loadSettings();
    if (wasDownloaded(settings, contactId, candidate.messageId)) {
      this.progress = {...this.progress, skipped: this.progress.skipped + 1};
      this.onProgress(this.progress);
      return;
    }

    const root = settings.rootFolder!;
    const {dir, fullPath} = buildMediaPath(
      root,
      contactName,
      contactId,
      candidate.kind,
      candidate.fileName,
    );

    this.progress = {
      ...this.progress,
      currentFile: candidate.fileName,
      message: `Downloading ${candidate.fileName}…`,
    };
    this.onProgress(this.progress);

    try {
      fs.mkdirSync(dir, {recursive: true});
      const target = uniquePath(fullPath, (p) => fs.existsSync(p));
      const buffer = await this.client.downloadMessageMedia(msg);
      fs.writeFileSync(target, buffer);

      settings = markDownloaded(loadSettings(), contactId, candidate.messageId, ts);
      saveSettings(settings);
      this.onSettings(settings);

      this.progress = {
        ...this.progress,
        downloaded: this.progress.downloaded + 1,
        currentFile: path.basename(target),
      };
      this.onProgress(this.progress);
    } catch (err) {
      this.progress = {
        ...this.progress,
        failed: this.progress.failed + 1,
        message: err instanceof Error ? err.message : String(err),
      };
      this.onProgress(this.progress);
    }
  }
}
