import fs from 'node:fs';
import path from 'node:path';
import {app} from 'electron';
import {defaultSettings} from '../shared/sync-state.js';
import type {AppSettings} from '../shared/types.js';

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

export function loadSettings(): AppSettings {
  const file = settingsPath();
  if (!fs.existsSync(file)) {
    return defaultSettings();
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as AppSettings;
    return {
      ...defaultSettings(),
      ...raw,
      contacts: raw.contacts ?? {},
    };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: AppSettings): void {
  const file = settingsPath();
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify(settings, null, 2), 'utf8');
}

export function authDir(): string {
  return path.join(app.getPath('userData'), 'whatsapp-auth');
}
