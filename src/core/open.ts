import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

// 02 §12 — external links: only http(s), only via the guarded xdg-open path.
export const XDG_OPEN = '/usr/bin/xdg-open';

export function canOpen(): boolean {
  return existsSync(XDG_OPEN);
}

export function openExternal(url: string): boolean {
  // true only when /^https?:\/\//.test(url) && canOpen(); false otherwise
  // (caller shows a status warning 'cannot open <scheme>').
  if (!/^https?:\/\//.test(url) || !canOpen()) return false;
  spawn(XDG_OPEN, [url], { detached: true, stdio: 'ignore' }).unref();
  return true;
}
