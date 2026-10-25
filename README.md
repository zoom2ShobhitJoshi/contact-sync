# Contact Sync

**Desktop app** for Windows & macOS (not a website). Downloads photos, videos, documents, and voice notes **received from one WhatsApp contact** into local folders.

## Download

Installers are published on **GitHub Releases**:

**➡️ [Download the latest release](https://github.com/zoom2ShobhitJoshi/contact-sync/releases/latest)**

| Platform | What to download |
|----------|------------------|
| **macOS** | `Contact Sync-*.dmg` — open the disk image and drag the app into **Applications** |
| **Windows** | `Contact Sync-Setup-*.exe` — run the installer |
| **Windows (no install)** | `Contact Sync-Portable-*.exe` — double-click to run |

### First open on macOS
Builds are unsigned. If macOS says the app can’t be opened: right-click the app → **Open** → confirm.

### Publish a new version (maintainers)

GitHub Actions builds Mac + Windows and attaches them to a Release when you push a version tag:

```bash
# bump version in package.json first if needed, then:
git add -A && git commit -m "Prepare v1.0.1"
git tag v1.0.1
git push origin main
git push origin v1.0.1
```

Then open [Releases](https://github.com/zoom2ShobhitJoshi/contact-sync/releases) — the workflow uploads the installers automatically.

## Folder layout

```text
<root you choose>/
  <Contact Name>/
    photos/       # images, GIFs, stickers
    videos/
    documents/    # PDF, Office, zip, etc.
    audio/        # voice notes & audio
```

## How it works

1. Link WhatsApp by scanning a QR (session saved on this computer).
2. Choose a root folder (remembered next time).
3. Search and select a contact.
4. **First sync:** pick a start date — only media received on or after that day is saved.
5. **Later runs:** resume from the last sync; failed files list a reason and can be retried.

## Develop

```bash
npm install
npm run dev          # opens the Electron desktop window
npm test
```

### Build installers locally (optional)

```bash
npm run dist:mac     # → release/*.dmg (on a Mac)
npm run dist:win     # → release/*Setup*.exe (on Windows)
```

Prefer tagging a release so CI publishes both platforms for everyone.

## Notes

- Uses an unofficial WhatsApp Web library ([Baileys](https://github.com/WhiskeySockets/Baileys)). Meta may restrict accounts that use this — use at your own risk.
- Sync runs only while the app is open.
- Groups and status broadcasts are ignored; only inbound media from the selected contact is saved.
