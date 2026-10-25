# Contact Sync

**Desktop app** for Windows & macOS (not a website). Downloads photos, videos, documents, and voice notes **received from one WhatsApp contact** into local folders.

## Download

Installers are published on **GitHub Releases**:

**➡️ [Download the latest release](https://github.com/zoom2ShobhitJoshi/contact-sync/releases/latest)**

| Platform | What to download |
|----------|------------------|
| **macOS** | `ContactSync-*.dmg` — open the disk image and drag the app into **Applications** |
| **Windows** | `ContactSync-Setup-*.exe` — run the installer |
| **Windows (no install)** | `ContactSync-Portable-*.exe` — double-click to run |

### First open on macOS
Builds are unsigned. If macOS says the app can’t be opened: right-click the app → **Open** → confirm.

### Publish a new version (maintainers)

Pushing a version tag to GitHub triggers Actions, which builds **macOS (.dmg)** and **Windows (.exe)** and attaches them to a [GitHub Release](https://github.com/zoom2ShobhitJoshi/contact-sync/releases) so anyone can download them.

```bash
# Make sure main is on GitHub first
git push github main

# Create and push a version tag (must start with v)
git tag v1.0.0
git push github v1.0.0
```

Watch the build: https://github.com/zoom2ShobhitJoshi/contact-sync/actions  

When it finishes, downloads appear here: https://github.com/zoom2ShobhitJoshi/contact-sync/releases/latest

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
