import {useEffect, useMemo, useState} from 'react';
import type {MediaSyncApi} from '@shared/api';
import {filterContacts, getApi} from './api';
import type {
  AppSettings,
  ConnectionStatus,
  ContactInfo,
  SyncProgress,
} from '@shared/types';
import {
  annotateContactsForPicker,
  contactSyncKind,
  findContactSyncState,
  mergeKnownContacts,
  selectionAfterQueryChange,
  syncKindCounts,
  syncKindLabel,
} from '@shared/contact-session';
import {defaultProgress, defaultSettings} from '@shared/sync-state';
import logoUrl from './assets/logo.svg';
import {DesktopOnly} from './DesktopOnly';

export function App() {
  const api = getApi();
  if (!api) {
    return <DesktopOnly />;
  }
  return <AppMain api={api} />;
}

function AppMain({api}: {api: MediaSyncApi}) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings());
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [qr, setQr] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ContactInfo[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ContactInfo | null>(null);
  const [startDate, setStartDate] = useState('');
  const [progress, setProgress] = useState<SyncProgress>(defaultProgress());
  const [error, setError] = useState<string | null>(null);
  const [openList, setOpenList] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [s, st, q, c, p] = await Promise.all([
        api.getSettings(),
        api.getStatus(),
        api.getQr(),
        api.getContacts(),
        api.getProgress(),
      ]);
      if (!alive) return;
      setSettings(s);
      setStatus(st);
      setQr(q);
      setContacts(c);
      setProgress(p);
      if (s.lastContactId) {
        const match = c.find((x) => x.id === s.lastContactId);
        if (match) {
          setSelected(match);
          setQuery(match.name);
        }
      }
      await api.startWhatsApp();
    })().catch((err) => setError(err instanceof Error ? err.message : String(err)));

    const offs = [
      api.onSettings(setSettings),
      api.onStatus(setStatus),
      api.onQr(setQr),
      api.onContacts((list) => {
        setContacts(list);
      }),
      api.onProgress(setProgress),
    ];
    return () => {
      alive = false;
      offs.forEach((off) => off());
    };
  }, [api]);

  const knownContacts = useMemo(
    () => mergeKnownContacts(contacts, settings.contacts),
    [contacts, settings.contacts],
  );

  useEffect(() => {
    if (!selected && settings.lastContactId && knownContacts.length) {
      const match = knownContacts.find((c) => c.id === settings.lastContactId);
      if (match) {
        setSelected(match);
        setQuery(match.name);
      }
    }
  }, [knownContacts, settings.lastContactId, selected]);

  const pickerContacts = useMemo(
    () => annotateContactsForPicker(knownContacts, settings),
    [knownContacts, settings],
  );

  const filtered = useMemo(
    () =>
      annotateContactsForPicker(
        filterContacts(knownContacts, query).slice(0, 40),
        settings,
      ),
    [knownContacts, query, settings],
  );

  const kindCounts = useMemo(
    () => syncKindCounts(pickerContacts),
    [pickerContacts],
  );

  const selectedKind = selected
    ? contactSyncKind(settings, selected.id)
    : null;
  const selectedState = selected
    ? findContactSyncState(settings, selected.id)
    : undefined;
  const firstSync = selectedKind !== 'synced';
  const canStartSync =
    status === 'ready' &&
    progress.status !== 'running' &&
    !!selected &&
    !!settings.rootFolder &&
    (!firstSync || !!startDate);

  async function pickFolder() {
    setError(null);
    const folder = await api.setRootFolder();
    if (folder) {
      setSettings(await api.getSettings());
    }
  }

  const failures =
    (selected && settings.contacts[selected.id]?.failures) ||
    progress.failures ||
    [];

  async function runSync() {
    setError(null);
    if (!selected) {
      setError('Select a contact first');
      return;
    }
    if (!settings.rootFolder) {
      setError('Choose a root folder first');
      return;
    }
    if (firstSync && !startDate) {
      setError('Pick the date to start syncing from');
      return;
    }
    try {
      await api.syncContact({
        contactId: selected.id,
        contactName: selected.name,
        startDateIso: firstSync ? startDate : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function retryFailed() {
    setError(null);
    if (!selected) {
      setError('Select a contact first');
      return;
    }
    try {
      await api.retryFailed({
        contactId: selected.id,
        contactName: selected.name,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="app">
      <header className="brand">
        <div className="brand-row">
          <img
            className="brand-logo"
            src={logoUrl}
            width={56}
            height={56}
            alt="Contact Sync"
          />
          <div className="brand-mark">Contact Sync</div>
        </div>
        <p>
          Pull photos, videos, documents, and voice notes from one WhatsApp
          contact into local folders — resume where you left off every time you
          open the app.
        </p>
      </header>

      <div className="shell">
        <section className="panel">
          <div className="row" style={{justifyContent: 'space-between'}}>
            <div>
              <h2>WhatsApp link</h2>
              <p className="hint" style={{marginBottom: 0}}>
                Scan once with WhatsApp → Linked devices. Session stays on this
                computer.
              </p>
            </div>
            <div className={`status-pill`}>
              <span className={`status-dot ${status}`} />
              {labelForStatus(status)}
            </div>
          </div>

          {(status === 'qr' || status === 'connecting' || (status !== 'ready' && qr)) && (
            <div className="qr-wrap" style={{marginTop: 16}}>
              <div className="qr-frame">
                {qr ? (
                  <img src={qr} alt="WhatsApp QR code" />
                ) : (
                  <div className="qr-placeholder">Waiting for QR…</div>
                )}
              </div>
              <div>
                <p className="hint">
                  Open WhatsApp on your phone → Settings → Linked devices → Link
                  a device, then scan this code.
                </p>
                <button className="btn btn-ghost" type="button" onClick={() => api.startWhatsApp()}>
                  Refresh connection
                </button>
              </div>
            </div>
          )}

          {status === 'ready' && (
            <p className="banner" style={{marginTop: 16}}>
              Connected. Choose a folder and contact, then sync.
            </p>
          )}
        </section>

        <section className="panel">
          <h2>Local storage</h2>
          <p className="hint">
            Files land under{' '}
            <code>&lt;root&gt;/&lt;Contact&gt;/photos|videos|documents|audio</code>.
            The root folder is remembered for next launches.
          </p>
          <div className="row">
            <button className="btn btn-ghost" type="button" onClick={pickFolder}>
              {settings.rootFolder ? 'Change folder' : 'Choose folder'}
            </button>
            <div className="path">
              {settings.rootFolder ?? 'No folder selected yet'}
            </div>
          </div>
          <ul className="folder-tree" style={{marginTop: 14}}>
            <li>photos — images, GIFs, stickers</li>
            <li>videos — regular videos</li>
            <li>documents — PDF, Office, zip, and other files</li>
            <li>audio — voice notes and audio</li>
          </ul>
        </section>

        <section className="panel">
          <h2>Contact & sync</h2>
          <p className="hint">
            Search your chats, pick a contact, and sync. Switching contacts keeps
            each person’s folder and history separate.
          </p>

          {status === 'ready' && knownContacts.length > 0 && (
            <div className="sync-legend" aria-live="polite">
              <span className="sync-legend-item">
                <span className="sync-badge synced">{syncKindLabel('synced')}</span>
                Already set up here ({kindCounts.synced}) — resumes without a
                start date
              </span>
              <span className="sync-legend-item">
                <span className="sync-badge new">{syncKindLabel('new')}</span>
                New to sync ({kindCounts.new}) — pick a start date first
              </span>
            </div>
          )}

          <div className="row">
            <label className="field contact-list">
              Contact
              <input
                value={query}
                placeholder="Search by name or number"
                onChange={(e) => {
                  const next = e.target.value;
                  setQuery(next);
                  setOpenList(true);
                  setSelected(selectionAfterQueryChange(selected, next));
                }}
                onFocus={() => setOpenList(true)}
                disabled={status !== 'ready'}
              />
              {openList && status === 'ready' && (
                <div className="dropdown" role="listbox">
                  {filtered.length === 0 ? (
                    <div className="dropdown-empty">
                      No contacts match. Wait for WhatsApp to sync chats, or
                      clear the search.
                    </div>
                  ) : (
                    <>
                      {filtered.some((c) => c.syncKind === 'synced') && (
                        <div className="dropdown-group">Already synced</div>
                      )}
                      {filtered
                        .filter((c) => c.syncKind === 'synced')
                        .map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="dropdown-contact"
                            aria-selected={selected?.id === c.id}
                            onClick={() => {
                              setSelected(c);
                              setQuery(c.name);
                              setOpenList(false);
                              setStartDate('');
                              setError(null);
                            }}
                          >
                            <span className="dropdown-contact-main">
                              <span className="dropdown-contact-name">{c.name}</span>
                              <span className="sync-badge synced">
                                {syncKindLabel('synced')}
                              </span>
                            </span>
                            <span className="dropdown-contact-meta">
                              {c.phone ?? c.id}
                            </span>
                          </button>
                        ))}
                      {filtered.some((c) => c.syncKind === 'new') && (
                        <div className="dropdown-group">New to sync</div>
                      )}
                      {filtered
                        .filter((c) => c.syncKind === 'new')
                        .map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="dropdown-contact"
                            aria-selected={selected?.id === c.id}
                            onClick={() => {
                              setSelected(c);
                              setQuery(c.name);
                              setOpenList(false);
                              setStartDate('');
                              setError(null);
                            }}
                          >
                            <span className="dropdown-contact-main">
                              <span className="dropdown-contact-name">{c.name}</span>
                              <span className="sync-badge new">
                                {syncKindLabel('new')}
                              </span>
                            </span>
                            <span className="dropdown-contact-meta">
                              {c.phone ?? c.id}
                            </span>
                          </button>
                        ))}
                    </>
                  )}
                </div>
              )}
            </label>

            {selected && (
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  setSelected(null);
                  setQuery('');
                  setOpenList(true);
                  setStartDate('');
                }}
              >
                Change contact
              </button>
            )}

            {selected && firstSync && (
              <label className="field" style={{flex: '0 1 180px'}}>
                Start from (received on/after)
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>
            )}
          </div>

          {status === 'ready' && knownContacts.length === 0 && (
            <p className="banner" style={{marginTop: 12}}>
              No chats loaded yet. Keep the app open a minute while WhatsApp
              syncs your contact list, then search again.
            </p>
          )}

          {selected && firstSync && (
            <p className="banner warn">
              <span className="sync-badge new">{syncKindLabel('new')}</span>{' '}
              {selected.name} has not been synced on this computer yet. Choose a
              start date above, then press Start sync.
            </p>
          )}

          {selected && !firstSync && (
            <p className="banner">
              <span className="sync-badge synced">{syncKindLabel('synced')}</span>{' '}
              Resume for {selected.name}
              {selectedState?.lastSyncedAtIso
                ? `: last sync ${new Date(
                    selectedState.lastSyncedAtIso,
                  ).toLocaleString()}`
                : ''}
              . Only new media since then will download — no start date needed.
            </p>
          )}

          <div className="row" style={{marginTop: 14}}>
            <button
              className="btn btn-primary"
              type="button"
              onClick={runSync}
              disabled={!canStartSync}
              title={
                !selected
                  ? 'Select a contact first'
                  : firstSync && !startDate
                    ? 'Pick a start date for this new contact'
                    : !settings.rootFolder
                      ? 'Choose a root folder first'
                      : undefined
              }
            >
              {progress.status === 'running' ? 'Syncing…' : 'Start sync'}
            </button>
            {failures.length > 0 && (
              <button
                className="btn btn-ghost"
                type="button"
                onClick={retryFailed}
                disabled={progress.status === 'running' || status !== 'ready'}
              >
                Retry failed ({failures.length})
              </button>
            )}
            {selected && (
              <span className="path">
                Saving to …/{selected.name}/
              </span>
            )}
          </div>

          <div className="progress-grid">
            <div className="stat">
              <strong>{progress.scanned}</strong>
              <span>Scanned</span>
            </div>
            <div className="stat">
              <strong>{progress.downloaded}</strong>
              <span>Downloaded</span>
            </div>
            <div className="stat">
              <strong>{progress.skipped}</strong>
              <span>Skipped</span>
            </div>
            <div className="stat">
              <strong>{Math.max(progress.failed, failures.length)}</strong>
              <span>Failed</span>
            </div>
          </div>

          {(progress.message || error) && (
            <div className={`banner ${error || progress.status === 'error' ? 'error' : ''}`}>
              {error ?? progress.message}
              {progress.currentFile ? ` · ${progress.currentFile}` : ''}
            </div>
          )}

          {failures.length > 0 && (
            <div className="failure-panel">
              <h3>Failed downloads</h3>
              <p className="hint">
                Each item shows why it failed. Retry only these without
                re-scanning everything.
              </p>
              <ul className="failure-list">
                {failures.map((f) => (
                  <li key={f.messageId}>
                    <div className="failure-file">
                      <strong>{f.fileName}</strong>
                      <span className="failure-kind">{f.kind}</span>
                    </div>
                    <div className="failure-error">{f.error}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function labelForStatus(status: ConnectionStatus): string {
  switch (status) {
    case 'ready':
      return 'Connected';
    case 'qr':
      return 'Scan QR code';
    case 'connecting':
      return 'Connecting…';
    case 'logged_out':
      return 'Logged out';
    default:
      return 'Disconnected';
  }
}
