// 01 §2.4 / INV-2.4 — Obsidian callout header `[!TYPE] Title`.
const CALLOUT_RE = /^\[!([A-Za-z]+)\](?:\s+(.*))??$/;

export function parseCallout(p: string): { type: string; title: string | null } | null {
  const m = p.match(CALLOUT_RE);
  if (!m) return null;
  const title = m[2];
  return { type: m[1].toUpperCase(), title: title === undefined || title === '' ? null : title };
}
