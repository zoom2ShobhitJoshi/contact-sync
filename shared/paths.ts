import type {MediaKind} from './types.js';
import {sanitizeFileName} from './media.js';

export function contactFolderName(contactName: string, contactId: string): string {
  const base = contactName.trim() || contactId.split('@')[0] || 'unknown-contact';
  return sanitizeFileName(base);
}

export function mediaSubfolder(kind: MediaKind): string {
  return kind;
}

/**
 * Builds `<root>/<Contact Name>/<kind>/<fileName>`.
 */
export function buildMediaPath(
  rootFolder: string,
  contactName: string,
  contactId: string,
  kind: MediaKind,
  fileName: string,
): {dir: string; fullPath: string; contactDir: string} {
  const contactDirName = contactFolderName(contactName, contactId);
  const sep = rootFolder.includes('\\') && !rootFolder.includes('/') ? '\\' : '/';
  const join = (...parts: string[]) =>
    parts
      .map((p, i) => (i === 0 ? p.replace(/[/\\]+$/, '') : p.replace(/^[/\\]+|[/\\]+$/g, '')))
      .filter(Boolean)
      .join(sep);

  const contactDir = join(rootFolder, contactDirName);
  const dir = join(contactDir, mediaSubfolder(kind));
  const fullPath = join(dir, sanitizeFileName(fileName));
  return {dir, fullPath, contactDir};
}

/** Avoid overwriting unrelated files when names collide. */
export function uniquePath(fullPath: string, exists: (path: string) => boolean): string {
  if (!exists(fullPath)) {
    return fullPath;
  }
  const sep = fullPath.includes('\\') && !fullPath.includes('/') ? '\\' : '/';
  const lastSep = Math.max(fullPath.lastIndexOf('/'), fullPath.lastIndexOf('\\'));
  const dir = lastSep >= 0 ? fullPath.slice(0, lastSep) : '';
  const base = lastSep >= 0 ? fullPath.slice(lastSep + 1) : fullPath;
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';

  let n = 1;
  while (true) {
    const candidate = dir ? `${dir}${sep}${stem} (${n})${ext}` : `${stem} (${n})${ext}`;
    if (!exists(candidate)) {
      return candidate;
    }
    n += 1;
  }
}
