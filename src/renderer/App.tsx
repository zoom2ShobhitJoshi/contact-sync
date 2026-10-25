import {useEffect, useMemo, useState} from 'react';
import {filterContacts, getApi} from './api';
import type {
  AppSettings,
  ConnectionStatus,
  ContactInfo,
  SyncProgress,
} from '@shared/types';
import {defaultProgress, defaultSettings, needsStartDate} from '@shared/sync-state';

const api = getApi();
const isBrowserDemo = !window.mediaSync;

export function App() {
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
  }, []);

  useEffect(() => {
    if (!selected && settings.lastContactId && contacts.length) {
      const match = contacts.find((c) => c.id === settings.lastContactId);
      if (match) {
        setSelected(match);
        setQuery(match.name);
      }
    }
  }, [contacts, settings.lastContactId, selected]);

  const filtered = useMemo(
    () => filterContacts(contacts, query).slice(0, 40),
    [contacts, query],
  );

  const firstSync = selected ? needsStartDate(settings, selected.id) : true;

  async function pickFolder() {
    setError(null);
    const folder = await api.setRootFolder();
    if (folder) {
      setSettings(await api.getSettings());
    }
  }

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

  return (
    <div className="app">
      <header className="brand">
        <div className="brand-mark">Shelf</div>
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
          {isBrowserDemo && (
            <p className="demo-note">
              Browser preview mode — use the desktop app (npm run dev:electron)
              to link a real WhatsApp account.
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

          <div className="row">
            <label className="field contact-list">
              Contact
              <input
                value={query}
                placeholder="Search by name or number"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpenList(true);
                  setSelected(null);
                }}
                onFocus={() => setOpenList(true)}
                disabled={status !== 'ready' && !isBrowserDemo}
              />
              {openList && filtered.length > 0 && (
                <div className="dropdown" role="listbox">
                  {filtered.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      aria-selected={selected?.id === c.id}
                      onClick={() => {
                        setSelected(c);
                        setQuery(c.name);
                        setOpenList(false);
                      }}
                    >
                      {c.name}
                      <span>{c.phone ?? c.id}</span>
                    </button>
                  ))}
                </div>
              )}
            </label>

            {firstSync && (
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

          {!firstSync && selected && settings.contacts[selected.id] && (
            <p className="banner">
              Resume for {selected.name}: last sync{' '}
              {settings.contacts[selected.id].lastSyncedAtIso
                ? new Date(
                    settings.contacts[selected.id].lastSyncedAtIso!,
                  ).toLocaleString()
                : 'not yet completed'}
              . Only new media since then will download.
            </p>
          )}

          <div className="row" style={{marginTop: 14}}>
            <button
              className="btn btn-primary"
              type="button"
              onClick={runSync}
              disabled={
                progress.status === 'running' ||
                (!isBrowserDemo && status !== 'ready')
              }
            >
              {progress.status === 'running' ? 'Syncing…' : 'Start sync'}
            </button>
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
              <strong>{progress.failed}</strong>
              <span>Failed</span>
            </div>
          </div>

          {(progress.message || error) && (
            <div className={`banner ${error || progress.status === 'error' ? 'error' : ''}`}>
              {error ?? progress.message}
              {progress.currentFile ? ` · ${progress.currentFile}` : ''}
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
