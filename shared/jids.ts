/** Normalize WhatsApp JIDs so phone and LID forms can be compared. */
export function normalizeJid(jid: string | null | undefined): string {
  if (!jid) {
    return '';
  }
  return jid.trim().toLowerCase();
}

export function jidUser(jid: string | null | undefined): string {
  const n = normalizeJid(jid);
  if (!n) {
    return '';
  }
  return n.split('@')[0] ?? '';
}

/**
 * True when two JIDs refer to the same chat/person.
 * Handles phone (`@s.whatsapp.net`) vs linked-device (`@lid`) mismatches by
 * matching exact id or the user/phone part when both look like phone numbers.
 */
export function jidsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = normalizeJid(a);
  const right = normalizeJid(b);
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }

  const leftUser = jidUser(left);
  const rightUser = jidUser(right);
  if (!leftUser || !rightUser) {
    return false;
  }
  if (leftUser === rightUser) {
    return true;
  }

  // Strip common device suffixes like :12 on older multi-device JIDs.
  const stripDevice = (user: string) => user.split(':')[0] ?? user;
  return stripDevice(leftUser) === stripDevice(rightUser);
}

export function collectJidAliases(
  primary: string,
  ...extras: Array<string | null | undefined>
): string[] {
  const out = new Set<string>();
  for (const value of [primary, ...extras]) {
    const n = normalizeJid(value);
    if (n) {
      out.add(n);
    }
  }
  return [...out];
}
