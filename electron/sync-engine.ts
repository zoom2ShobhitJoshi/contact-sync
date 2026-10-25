import fs from 'node:fs';
import path from 'node:path';
import type {WAMessage} from '@whiskeysockets/baileys';
import {buildMediaPath, uniquePath} from '../shared/paths.js';
import {
  defaultProgress,
  ensureContactState,
  explainSyncError,
  getContactState,
  getFailures,
  markDownloaded,
  needsStartDate,
  recordFailure,
  wasDownloaded,
} from '../shared/sync-state.js';
import type {AppSettings, SyncFailure, SyncProgress} from '../shared/types.js';
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
    const startMs = startOfDayMs(state.startDateIso);

    this.running = true;
    this.progress = {
      ...defaultProgress(),
      status: 'running',
      contactId,
      contactName,
      failures: getFailures(loadSettings(), contactId),
      failed: getFailures(loadSettings(), contactId).length,
      message: 'Scanning messages…',
    };
    this.onProgress(this.progress);

    try {
      // Give WhatsApp a moment to deliver history after reconnect.
      if (this.client.getMessagesForContact(contactId).length === 0) {
        this.progress = {
          ...this.progress,
          message: 'Waiting for WhatsApp chat history…',
        };
        this.onProgress(this.progress);
        await sleep(2500);
      }

      const messages = this.client
        .getMessagesForContact(contactId)
        .filter((m) => isFromContact(m, contactId))
        .sort((a, b) => messageTimestampMs(a) - messageTimestampMs(b));

      if (messages.length === 0) {
        const failures = getFailures(loadSettings(), contactId);
        this.progress = {
          ...this.progress,
          status: 'done',
          currentFile: undefined,
          failures,
          failed: failures.length,
          message:
            'No messages found for this contact yet. Keep Contact Sync open, open the chat on your phone so WhatsApp syncs history, then tap Start sync again.',
        };
        this.onProgress(this.progress);
        return;
      }

      for (const msg of messages) {
        await this.processMessage(msg, contactId, contactName, startMs, resumeAfter);
      }

      const failures = getFailures(loadSettings(), contactId);
      this.progress = {
        ...this.progress,
        status: 'done',
        currentFile: undefined,
        failures,
        failed: failures.length,
        message: `Done. Downloaded ${this.progress.downloaded}, skipped ${this.progress.skipped}, failed ${failures.length}.`,
      };
      this.onProgress(this.progress);
    } catch (err) {
      const failures = getFailures(loadSettings(), contactId);
      this.progress = {
        ...this.progress,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        message: 'Sync failed',
        failures,
        failed: failures.length,
      };
      this.onProgress(this.progress);
    } finally {
      this.running = false;
    }
  }

  /** Retries only previously failed downloads for this contact. */
  async retryFailed(contactId: string, contactName: string): Promise<void> {
    if (this.running) {
      throw new Error('A sync is already running');
    }

    const settings = loadSettings();
    if (!settings.rootFolder) {
      throw new Error('Choose a root folder before syncing');
    }

    const failures = getFailures(settings, contactId);
    if (failures.length === 0) {
      throw new Error('No failed items to retry for this contact');
    }

    this.running = true;
    this.progress = {
      ...defaultProgress(),
      status: 'running',
      contactId,
      contactName,
      failures: [...failures],
      failed: failures.length,
      message: `Retrying ${failures.length} failed item(s)…`,
    };
    this.onProgress(this.progress);

    try {
      for (const failure of failures) {
        const msg = this.client.getMessage(contactId, failure.messageId);
        if (!msg) {
          const nextSettings = recordFailure(loadSettings(), contactId, {
            ...failure,
            error: explainSyncError(
              'Message is not in the local WhatsApp session — reconnect or open the chat, then retry.',
            ),
            failedAtIso: new Date().toISOString(),
          });
          saveSettings(nextSettings);
          this.onSettings(nextSettings);
          this.publishFailures(contactId, `Still failing: ${failure.fileName}`);
          continue;
        }

        await this.downloadCandidate(msg, contactId, contactName);
      }

      const remaining = getFailures(loadSettings(), contactId);
      this.progress = {
        ...this.progress,
        status: 'done',
        currentFile: undefined,
        failures: remaining,
        failed: remaining.length,
        message:
          remaining.length === 0
            ? `Retry complete. All ${this.progress.downloaded} failed item(s) downloaded.`
            : `Retry complete. Downloaded ${this.progress.downloaded}, still failing ${remaining.length}.`,
      };
      this.onProgress(this.progress);
    } catch (err) {
      const remaining = getFailures(loadSettings(), contactId);
      this.progress = {
        ...this.progress,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        message: 'Retry failed',
        failures: remaining,
        failed: remaining.length,
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
    const startMs = startOfDayMs(state.startDateIso);

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
        const failures = getFailures(loadSettings(), contactId);
        this.progress = {
          ...this.progress,
          status: 'done',
          message: 'Live update saved',
          failures,
          failed: failures.length,
        };
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
      const settings = loadSettings();
      if (wasDownloaded(settings, contactId, candidate.messageId)) {
        this.progress = {...this.progress, skipped: this.progress.skipped + 1};
        this.onProgress(this.progress);
        return;
      }
    }

    const settings = loadSettings();
    if (wasDownloaded(settings, contactId, candidate.messageId)) {
      this.progress = {...this.progress, skipped: this.progress.skipped + 1};
      this.onProgress(this.progress);
      return;
    }

    await this.downloadCandidate(msg, contactId, contactName);
  }

  private async downloadCandidate(
    msg: WAMessage,
    contactId: string,
    contactName: string,
  ): Promise<void> {
    const candidate = extractMediaCandidate(msg);
    if (!candidate) {
      return;
    }

    let settings = loadSettings();
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

      settings = markDownloaded(
        loadSettings(),
        contactId,
        candidate.messageId,
        candidate.timestampMs,
      );
      saveSettings(settings);
      this.onSettings(settings);

      const failures = getFailures(settings, contactId);
      this.progress = {
        ...this.progress,
        downloaded: this.progress.downloaded + 1,
        currentFile: path.basename(target),
        failures,
        failed: failures.length,
      };
      this.onProgress(this.progress);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const failure: SyncFailure = {
        messageId: candidate.messageId,
        fileName: candidate.fileName,
        kind: candidate.kind,
        error: explainSyncError(raw),
        failedAtIso: new Date().toISOString(),
      };
      settings = recordFailure(loadSettings(), contactId, failure);
      saveSettings(settings);
      this.onSettings(settings);
      this.publishFailures(contactId, failure.error);
    }
  }

  private publishFailures(contactId: string, message: string): void {
    const failures = getFailures(loadSettings(), contactId);
    this.progress = {
      ...this.progress,
      failed: failures.length,
      failures,
      message,
    };
    this.onProgress(this.progress);
  }
}

function startOfDayMs(dateIso: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (!match) {
    throw new Error(`Invalid start date: ${dateIso}`);
  }
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    0,
    0,
    0,
    0,
  ).getTime();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
