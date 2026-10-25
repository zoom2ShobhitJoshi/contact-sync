import {describe, expect, it} from 'vitest';
import {
  clearFailure,
  defaultSettings,
  ensureContactState,
  getFailures,
  recordFailure,
  explainSyncError,
} from '../shared/sync-state';
import type {SyncFailure} from '../shared/types';

function sampleFailure(overrides: Partial<SyncFailure> = {}): SyncFailure {
  return {
    messageId: 'msg-1',
    fileName: 'photo.jpg',
    kind: 'photos',
    error: 'Media expired on WhatsApp servers',
    failedAtIso: '2026-10-25T12:00:00.000Z',
    ...overrides,
  };
}

describe('sync failures', () => {
  it('records a failure with reason per file', () => {
    let settings = ensureContactState(defaultSettings(), 'c1', 'Ada', '2024-01-01');
    settings = recordFailure(settings, 'c1', sampleFailure());
    expect(getFailures(settings, 'c1')).toEqual([sampleFailure()]);
  });

  it('updates the error if the same message fails again', () => {
    let settings = ensureContactState(defaultSettings(), 'c1', 'Ada', '2024-01-01');
    settings = recordFailure(settings, 'c1', sampleFailure());
    settings = recordFailure(
      settings,
      'c1',
      sampleFailure({error: 'Network timeout', failedAtIso: '2026-10-25T13:00:00.000Z'}),
    );
    const failures = getFailures(settings, 'c1');
    expect(failures).toHaveLength(1);
    expect(failures[0].error).toBe('Network timeout');
  });

  it('clears a failure after a successful retry', () => {
    let settings = ensureContactState(defaultSettings(), 'c1', 'Ada', '2024-01-01');
    settings = recordFailure(settings, 'c1', sampleFailure());
    settings = recordFailure(
      settings,
      'c1',
      sampleFailure({messageId: 'msg-2', fileName: 'clip.mp4', kind: 'videos'}),
    );
    settings = clearFailure(settings, 'c1', 'msg-1');
    expect(getFailures(settings, 'c1').map((f) => f.messageId)).toEqual(['msg-2']);
  });
});

describe('explainSyncError', () => {
  it('explains expired or missing WhatsApp media', () => {
    expect(explainSyncError('Error: 404')).toMatch(/no longer available|expired/i);
    expect(explainSyncError('media not available on server')).toMatch(
      /no longer available|expired/i,
    );
  });

  it('keeps a readable message for unknown errors', () => {
    expect(explainSyncError('ECONNRESET')).toMatch(/network|connection|try again/i);
    expect(explainSyncError('weird boom')).toContain('weird boom');
  });
});
