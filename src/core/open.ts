import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

// 02 §12 — external links: http(s) and existing absolute file:// URLs,
// only via the guarded xdg-open path.
export const XDG_OPEN = '/usr/bin/xdg-open';

export function canOpen(): boolean {
  return existsSync(XDG_OPEN);
}

export function openExternal(url: string): boolean {
  // http(s): spawn when canOpen(); file:// (ISSUE-004): spawn when the decoded
  // absolute path existsSync AND canOpen(); false otherwise (caller shows a
  // status warning 'cannot open <scheme>').
  if (/^https?:\/\//.test(url)) {
    if (!canOpen()) return false;
    spawn(XDG_OPEN, [url], { detached: true, stdio: 'ignore' }).unref();
    return true;
  }
  if (/^file:\/\//.test(url)) {
    let p = url.slice('file://'.length).split('#')[0];
    try {
      p = decodeURIComponent(p);
    } catch {
      return false;
    }
    if (!p.startsWith('/') || !existsSync(p) || !canOpen()) return false;
    spawn(XDG_OPEN, [url], { detached: true, stdio: 'ignore' }).unref();
    return true;
  }
  return false;
}
