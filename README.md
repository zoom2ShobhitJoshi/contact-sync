# Shelf — WhatsApp Media Sync

Desktop app (Windows & macOS) that downloads media **received from one WhatsApp contact** into local folders. Sync runs when you open the app and resumes from the last successful run per contact.

## Folder layout

```text
<root you choose>/
  <Contact Name>/
    photos/       # images, GIFs, stickers
    videos/
    documents/    # PDF, Office, zip, etc.
    audio/        # voice notes & audio
```

Original WhatsApp file names are kept. Already-downloaded messages are skipped.

## How it works

1. Link WhatsApp by scanning a QR code (WhatsApp Web–style session; saved locally).
2. Choose a root folder (remembered next time).
3. Search and select a contact.
4. **First sync for that contact:** pick a start date — only media received on or after that day is saved.
5. **Later runs:** continues from the last sync for that contact.
6. Switch contacts anytime; each contact has its own folder and sync history.

## Requirements

- Node.js 20+
- WhatsApp account on your phone

> This uses an unofficial WhatsApp Web library ([Baileys](https://github.com/WhiskeySockets/Baileys)). Meta may restrict or ban accounts that use linked unofficial clients. Use at your own risk.

## Run the desktop app

This is an **Electron desktop application** for Windows and macOS — not a website.

```bash
npm install
npm run dev:electron
```

That opens the Shelf window. Scan the QR with WhatsApp on your phone, then choose a folder and contact.

- Unit tests: `npm test`
- Packaged run after build: `npm run build` then `npm start`

| Command | Purpose |
|---------|---------|
| `npm run dev:electron` | **Desktop app** (Electron window + real WhatsApp linking) |
| `npm test` | Vitest unit tests |
| `npm run build` | Build renderer + Electron main |

`npm run dev` starts only the UI toolkit used inside Electron; it is not how you use Shelf day to day.

## Notes

- Sync does **not** run while the app is closed.
- Groups and status broadcasts are ignored.
- Only inbound media from the selected contact is saved.
