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

## Run locally

```bash
npm install
npm run dev:electron
```

- UI only (browser preview / demo data): `npm run dev` → http://127.0.0.1:3847
- Unit tests: `npm test`
- Production build: `npm run build` then `npm start`

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite UI on port **3847** (demo API in the browser) |
| `npm run dev:electron` | Electron + Vite with real WhatsApp linking |
| `npm test` | Vitest unit tests |
| `npm run build` | Build renderer + Electron main |

## Notes

- Sync does **not** run while the app is closed.
- Groups and status broadcasts are ignored.
- Only inbound media from the selected contact is saved.
