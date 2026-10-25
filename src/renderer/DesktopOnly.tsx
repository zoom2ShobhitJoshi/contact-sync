import logoUrl from './assets/logo.svg';

/** Shown only if the UI is opened outside the packaged Electron app. */
export function DesktopOnly() {
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
          This is a desktop app for Windows and macOS — it does not run in a
          browser.
        </p>
      </header>
      <section className="panel">
        <h2>Open the app</h2>
        <p className="hint">
          Install a build from <code>release/</code> (macOS <code>.dmg</code> /
          Windows installer), or during development run:
        </p>
        <pre className="path" style={{marginTop: 12}}>
          npm run dev
        </pre>
        <p className="hint" style={{marginTop: 14}}>
          To make installers for distribution:
        </p>
        <pre className="path" style={{marginTop: 12}}>
          npm run dist
        </pre>
      </section>
    </div>
  );
}
