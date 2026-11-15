// 01 §2.1 / D-4.5 (ADR-034) — Terminal Graphics Engine (Kitty APC and Truecolor Half-Block)

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import type { Theme } from './types.js';

export type GfxMode = 'kitty' | 'halfblock' | 'unicode' | 'none';

export function detectGfxMode(env: NodeJS.ProcessEnv = process.env, override?: GfxMode): 'kitty' | 'halfblock' | 'none' {
  if (env.NO_COLOR !== undefined || env.TERM === 'dumb') {
    return 'none';
  }
  if (override === 'unicode' || override === 'halfblock') {
    return 'halfblock';
  }
  if (override === 'kitty' || override === 'none') {
    return override;
  }
  if (Boolean(env.KITTY_WINDOW_ID || env.TERM === 'xterm-kitty' || env.TERM_PROGRAM === 'ghostty' || env.TERM_PROGRAM === 'WezTerm')) {
    return 'kitty';
  }
  return 'halfblock';
}

const halfBlockCache = new Map<string, string[]>();

export function renderHalfBlockImage(imgBuf: Buffer, cols: number, rows: number, borderSgr = ''): string[] {
  const c = Math.max(1, cols);
  const r = Math.max(1, rows);
  const cacheKey = `${imgBuf.length}:${imgBuf.subarray(0, 32).toString('hex')}:${c}x${r}:${borderSgr}`;
  const cached = halfBlockCache.get(cacheKey);
  if (cached) return [...cached];

  const totalPixels = c * (r * 2);

  const res = spawnSync(
    '/usr/bin/magick',
    ['-', '-background', '#181b28', '-alpha', 'remove', '-alpha', 'off', '-filter', 'Lanczos', '-resize', `${c}x${r * 2}!`, '-depth', '8', 'rgb:-'],
    { input: imgBuf, timeout: 2000, maxBuffer: 10 * 1024 * 1024 },
  );

  const out: string[] = [];
  const bdr = borderSgr ? `\x1b[${borderSgr}m` : '';
  const rst = borderSgr ? '\x1b[0m' : '';

  // Top border
  out.push(`${bdr}╭${'─'.repeat(c)}╮${rst}`);

  if (res.status === 0 && res.stdout && res.stdout.length >= totalPixels * 3) {
    const raw = res.stdout;
    for (let row = 0; row < r; row++) {
      let rowStr = `${bdr}│${rst}`;
      for (let col = 0; col < c; col++) {
        const topOff = (row * 2 * c + col) * 3;
        const botOff = ((row * 2 + 1) * c + col) * 3;
        const r1 = raw[topOff];
        const g1 = raw[topOff + 1];
        const b1 = raw[topOff + 2];
        const r2 = raw[botOff];
        const g2 = raw[botOff + 1];
        const b2 = raw[botOff + 2];
        rowStr += `\x1b[38;2;${r1};${g1};${b1};48;2;${r2};${g2};${b2}m▀\x1b[0m`;
      }
      rowStr += `${bdr}│${rst}`;
      out.push(rowStr);
    }
  } else {
    for (let row = 0; row < r; row++) {
      out.push(`${bdr}│${rst}${' '.repeat(c)}${bdr}│${rst}`);
    }
  }

  // Bottom border
  out.push(`${bdr}╰${'─'.repeat(c)}╯${rst}`);
  halfBlockCache.set(cacheKey, out);
  return [...out];
}

export function kittyImageId(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h & 0x7fffffff) || 1;
}

export function encodeKittyPlace(imageId: number, cols: number, rows: number, env: NodeJS.ProcessEnv = process.env): string {
  const apc = `\x1b_Ga=p,i=${imageId},p=1,c=${cols},r=${rows},C=1,q=2\x1b\\`;
  return env.TMUX ? `\x1bPtmux;\x1b${apc}\x1b\\` : apc;
}

export function encodeKittyPng(
  pngBuf: Buffer,
  cols: number,
  rows: number,
  env: NodeJS.ProcessEnv = process.env,
  imageId?: number,
): string[] {
  const b64 = pngBuf.toString('base64');
  const CHUNK_SIZE = 4096;
  const chunks: string[] = [];
  for (let i = 0; i < b64.length; i += CHUNK_SIZE) {
    chunks.push(b64.slice(i, i + CHUNK_SIZE));
  }

  const apcList: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const isFirst = i === 0;
    const isLast = i === chunks.length - 1;
    const m = isLast ? 0 : 1;

    let params: string;
    if (isFirst) {
      const idPart = imageId !== undefined ? `,i=${imageId},p=1` : '';
      params = `a=T,f=100${idPart},c=${cols},r=${rows},C=1,q=2,m=${chunks.length > 1 ? 1 : 0}`;
    } else {
      params = `m=${m}`;
    }

    let apc = `\x1b_G${params};${chunk}\x1b\\`;
    if (env.TMUX) {
      apc = `\x1bPtmux;\x1b${apc}\x1b\\`;
    }
    apcList.push(apc);
  }

  const apcJoined = apcList.join('');
  return Array.from({ length: Math.max(1, rows) }, (_, r) =>
    r === 0 ? apcJoined + ' '.repeat(cols) : ' '.repeat(cols),
  );
}

export function readPngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] !== 0x89 ||
    buf[1] !== 0x50 ||
    buf[2] !== 0x4e ||
    buf[3] !== 0x47 ||
    buf[4] !== 0x0d ||
    buf[5] !== 0x0a ||
    buf[6] !== 0x1a ||
    buf[7] !== 0x0a
  ) {
    return null;
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

export function createFallbackPng(label: string, widthPx = 480, heightPx = 120): Buffer {
  const safeLabel = label.replace(/[<>&'"]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}">
    <rect width="100%" height="100%" fill="#1a1b26" rx="8"/>
    <text x="50%" y="50%" fill="#7aa2f7" font-family="sans-serif" font-size="16" font-weight="bold" text-anchor="middle" dominant-baseline="middle">
      ${safeLabel}
    </text>
  </svg>`;

  try {
    const res = spawnSync('/usr/bin/magick', ['svg:-', 'png:-'], {
      input: Buffer.from(svg, 'utf8'),
      timeout: 1500,
    });
    if (res.status === 0 && res.stdout && res.stdout.length > 0) {
      return res.stdout;
    }
  } catch {
    // fallback below
  }

  return Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2d420000000049454e44ae426082',
    'hex',
  );
}

const imageCache = new Map<string, { png: Buffer; width: number; height: number }>();

export function clearImageCache(): void {
  imageCache.clear();
  halfBlockCache.clear();
}

export function loadImageAsPng(absOrUrl: string, maxW = 960, maxH = 540): { png: Buffer; width: number; height: number } | null {
  const cached = imageCache.get(absOrUrl);
  if (cached) return cached;

  if (absOrUrl.startsWith('http://') || absOrUrl.startsWith('https://')) {
    try {
      const curl = spawnSync('/usr/bin/curl', ['-sL', '--max-time', '3', '-A', 'trimd/0.3', absOrUrl], {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 3500,
      });
      if (curl.status === 0 && curl.stdout && curl.stdout.length > 0) {
        const conv = spawnSync('/usr/bin/magick', ['-', '-resize', `${maxW}x${maxH}>`, 'png:-'], {
          input: curl.stdout,
          timeout: 2000,
        });
        if (conv.status === 0 && conv.stdout && conv.stdout.length > 0) {
          const dims = readPngDimensions(conv.stdout) ?? { width: maxW, height: maxH };
          const res = { png: conv.stdout, width: dims.width, height: dims.height };
          imageCache.set(absOrUrl, res);
          return res;
        }
      }
    } catch {
      // fallback below
    }
    const fb = createFallbackPng(absOrUrl, maxW, maxH);
    const dims = readPngDimensions(fb) ?? { width: maxW, height: maxH };
    const res = { png: fb, width: dims.width, height: dims.height };
    imageCache.set(absOrUrl, res);
    return res;
  }

  // Local file
  if (existsSync(absOrUrl)) {
    try {
      if (absOrUrl.toLowerCase().endsWith('.png')) {
        const buf = readFileSync(absOrUrl);
        const dims = readPngDimensions(buf);
        if (dims && dims.width <= maxW && dims.height <= maxH) {
          const res = { png: buf, width: dims.width, height: dims.height };
          imageCache.set(absOrUrl, res);
          return res;
        }
      }
      const conv = spawnSync('/usr/bin/magick', [absOrUrl, '-resize', `${maxW}x${maxH}>`, 'png:-'], {
        timeout: 2000,
      });
      if (conv.status === 0 && conv.stdout && conv.stdout.length > 0) {
        const dims = readPngDimensions(conv.stdout) ?? { width: maxW, height: maxH };
        const res = { png: conv.stdout, width: dims.width, height: dims.height };
        imageCache.set(absOrUrl, res);
        return res;
      }
    } catch {
      return null;
    }
  }

  return null;
}

export function renderInlineImageRows(absOrUrl: string, width: number, gfx: GfxMode, theme: Theme): string[] {
  if (gfx === 'none' || theme.id === 'plain') return [];
  const img = loadImageAsPng(absOrUrl);
  if (!img) return [];

  const maxCols = Math.max(20, Math.min(54, width - 6));
  const aspect = img.height > 0 && img.width > 0 ? img.height / img.width : 0.5;
  const cols = maxCols;
  const rows = Math.max(6, Math.min(14, Math.round(cols * aspect * 0.5)));

  if (gfx === 'kitty') {
    return encodeKittyPng(img.png, cols, rows, process.env, kittyImageId(absOrUrl));
  }
  return renderHalfBlockImage(img.png, cols, rows, theme.colors.tableBorder);
}

function paintSgr(sgr: string | undefined, text: string): string {
  return sgr ? `\x1b[${sgr}m${text}\x1b[0m` : text;
}

function parseMermaidNode(rawTok: string): { id: string; label: string } {
  const t = rawTok.trim();
  const m = t.match(/^([a-zA-Z0-9_-]+)\s*(?:\[\[(.*?)\]\]|\(\[(.*?)\]\)|\[(.*?)\]|\((.*?)\)|\{(.*?)\})$/);
  if (m) {
    const id = m[1];
    const label = (m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? id).replace(/^["']|["']$/g, '').trim() || id;
    return { id, label };
  }
  const idOnly = t.replace(/[^a-zA-Z0-9_-]/g, '') || t;
  return { id: idOnly, label: idOnly };
}

function renderSequenceDiagramAscii(lines: string[], width: number, theme: Theme): string[] {
  const bdrSgr = theme.colors.info || theme.colors.heading2 || '';
  const lblSgr = theme.colors.bold || '';
  const dimSgr = theme.colors.dim || '';

  const participants = new Map<string, string>();
  const messages: { from: string; to: string; label: string }[] = [];

  for (const line of lines) {
    if (line.startsWith('sequenceDiagram') || line.startsWith('%%')) continue;
    const pMatch = line.match(/^participant\s+([a-zA-Z0-9_-]+)(?:\s+as\s+(.+))?$/);
    if (pMatch) {
      participants.set(pMatch[1], (pMatch[2] || pMatch[1]).trim());
      continue;
    }
    const mMatch = line.match(/^([a-zA-Z0-9_-]+)\s*-{1,2}>{1,2}[+-]?\s*([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
    if (mMatch) {
      const [, from, to, label] = mMatch;
      if (!participants.has(from)) participants.set(from, from);
      if (!participants.has(to)) participants.set(to, to);
      messages.push({ from, to, label: label.trim() });
    }
  }

  const pList = Array.from(participants.entries());
  if (pList.length === 0) return [];

  const maxColW = Math.max(10, Math.floor((width - 4) / pList.length) - 2);
  const maxMsgLen = messages.reduce((m, msg) => Math.max(m, msg.label.length), 0);
  const minBoxW = Math.min(maxColW, Math.max(7, Math.min(maxMsgLen + 4, Math.floor((width - 8) / pList.length) - 4)));
  const boxWidths = pList.map(([, label]) => Math.min(maxColW, Math.max(label.length + 2, minBoxW)));
  const gap = Math.max(4, Math.min(12, Math.floor((width - 4 - boxWidths.reduce((a, b) => a + b + 2, 0)) / Math.max(1, pList.length - 1))));
  const centers: number[] = [];
  let curX = 2;
  for (let idx = 0; idx < pList.length; idx++) {
    const bw = boxWidths[idx] + 2; // +2 for │ │
    centers.push(curX + Math.floor(bw / 2));
    curX += bw + gap;
  }

  const out: string[] = [];
  // Top boxes
  let topRow = '  ';
  let midRow = '  ';
  let botRow = '  ';
  for (let idx = 0; idx < pList.length; idx++) {
    const [, label] = pList[idx];
    const iw = boxWidths[idx];
    const clipped = label.length > iw - 2 ? label.slice(0, iw - 3) + '…' : label;
    const padL = Math.floor((iw - clipped.length) / 2);
    const padR = iw - clipped.length - padL;
    const sep = idx < pList.length - 1 ? ' '.repeat(gap) : '';
    topRow += paintSgr(bdrSgr, `╭${'─'.repeat(iw)}╮`) + sep;
    midRow += paintSgr(bdrSgr, '│') + ' '.repeat(padL) + paintSgr(lblSgr, clipped) + ' '.repeat(padR) + paintSgr(bdrSgr, '│') + sep;
    botRow += paintSgr(bdrSgr, `╰${'─'.repeat(iw)}╯`) + sep;
  }
  out.push(topRow.trimEnd(), midRow.trimEnd(), botRow.trimEnd());

  const totalW = Math.max(...centers) + 4;
  const makeLifeline = (): string[] => {
    const arr = Array.from({ length: totalW }, () => ' ');
    for (const c of centers) arr[c] = '│';
    return arr;
  };

  for (const msg of messages) {
    const fi = pList.findIndex(([id]) => id === msg.from);
    const ti = pList.findIndex(([id]) => id === msg.to);
    if (fi < 0 || ti < 0) continue;
    const fc = centers[fi];
    const tc = centers[ti];
    // Spacer lifeline
    out.push(paintSgr(dimSgr, makeLifeline().join('').trimEnd()));

    if (fi === ti) {
      const arr = makeLifeline();
      const text = `──▶ ${msg.label}`;
      const lineStr = arr.join('').slice(0, fc + 1) + paintSgr(lblSgr, text);
      out.push(lineStr);
      continue;
    }

    const left = Math.min(fc, tc);
    const right = Math.max(fc, tc);
    const span = right - left - 1;
    const lbl = msg.label.length > Math.max(0, span - 4) ? msg.label.slice(0, Math.max(0, span - 5)) + '…' : msg.label;
    const lblWithSpace = lbl ? ` ${lbl} ` : '';
    const dashTotal = Math.max(1, span - lblWithSpace.length - 1);
    const dashL = Math.floor(dashTotal / 2);
    const dashR = dashTotal - dashL;

    const arrowBody = fi < ti
      ? `${'─'.repeat(dashL)}${lblWithSpace}${'─'.repeat(dashR)}▶`
      : `◀${'─'.repeat(dashL)}${lblWithSpace}${'─'.repeat(dashR)}`;

    const prefixArr = makeLifeline().slice(0, left + 1);
    const suffixArr = makeLifeline().slice(right);
    const row = paintSgr(dimSgr, prefixArr.join(''))
      + paintSgr(bdrSgr, arrowBody)
      + paintSgr(dimSgr, suffixArr.join('').trimEnd());
    out.push(row);
  }
  out.push(paintSgr(dimSgr, makeLifeline().join('').trimEnd()));
  return out;
}

export function renderMermaidAscii(raw: string, width: number, theme: Theme): string[] {
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('%%'));
  if (lines.length === 0) return [];

  if (lines[0].startsWith('sequenceDiagram')) {
    return renderSequenceDiagramAscii(lines, width, theme);
  }

  let dir: 'LR' | 'TD' = 'TD';
  const header = lines.find((l) => /^(graph|flowchart)\s+/i.test(l));
  if (header && /\b(LR|RL)\b/i.test(header)) {
    dir = 'LR';
  }

  const nodes = new Map<string, string>();
  const edges: { from: string; to: string; label?: string }[] = [];
  const edgeOpRe = /\s*(?:--+\s*([^-\n>]+?)\s*--+>|-.->(?:\|([^|]+)\|)?|==+>(?:\|([^|]+)\|)?|-->?(?:\|([^|]+)\|)?)\s*/;

  for (const line of lines) {
    if (/^(graph|flowchart|subgraph|end|classDef|class|style|linkStyle|click)\b/i.test(line)) continue;
    // Support chained edges like A --> B --> C
    let rest = line;
    let match = edgeOpRe.exec(rest);
    if (!match) {
      // Standalone node declaration
      if (/^[a-zA-Z0-9_-]+\s*[\[\(\{]/.test(rest)) {
        const n = parseMermaidNode(rest);
        if (!nodes.has(n.id)) nodes.set(n.id, n.label);
      }
      continue;
    }
    while (match) {
      const leftStr = rest.slice(0, match.index);
      const afterStr = rest.slice(match.index + match[0].length);
      const nextMatch = edgeOpRe.exec(afterStr);
      const rightStr = nextMatch ? afterStr.slice(0, nextMatch.index) : afterStr;
      const fromNode = parseMermaidNode(leftStr);
      const toNode = parseMermaidNode(rightStr);
      if (!nodes.has(fromNode.id) || fromNode.label !== fromNode.id) nodes.set(fromNode.id, fromNode.label);
      if (!nodes.has(toNode.id) || toNode.label !== toNode.id) nodes.set(toNode.id, toNode.label);
      const edgeLabel = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? '').trim() || undefined;
      edges.push({ from: fromNode.id, to: toNode.id, label: edgeLabel });
      if (!nextMatch) break;
      rest = afterStr;
      match = nextMatch;
    }
  }

  if (nodes.size === 0) return [];

  const bdrSgr = theme.colors.info || theme.colors.heading2 || '';
  const lblSgr = theme.colors.bold || '';
  const dimSgr = theme.colors.dim || '';

  const makeBox = (label: string, maxW: number): [string, string, string, number] => {
    const clipped = label.length > maxW - 4 ? label.slice(0, maxW - 5) + '…' : label;
    const iw = clipped.length + 2;
    return [
      paintSgr(bdrSgr, `╭${'─'.repeat(iw)}╮`),
      paintSgr(bdrSgr, '│') + ' ' + paintSgr(lblSgr, clipped) + ' ' + paintSgr(bdrSgr, '│'),
      paintSgr(bdrSgr, `╰${'─'.repeat(iw)}╯`),
      iw + 2,
    ];
  };

  if (dir === 'LR' && edges.length > 0) {
    // Render edges horizontally, wrapping to new row when exceeding width
    const out: string[] = [];
    const maxBoxW = Math.max(12, Math.floor((width - 10) / 2));
    let rowTop = '  ';
    let rowMid = '  ';
    let rowBot = '  ';
    let curW = 2;
    let lastTo: string | null = null;

    const flushRow = (): void => {
      if (curW > 2) {
        out.push(rowTop.trimEnd(), rowMid.trimEnd(), rowBot.trimEnd(), '');
        rowTop = '  ';
        rowMid = '  ';
        rowBot = '  ';
        curW = 2;
      }
    };

    for (const e of edges) {
      const arrowText = e.label ? `── ${e.label} ──▶` : '───▶';
      const arrowW = arrowText.length + 2;
      const toBox = makeBox(nodes.get(e.to) ?? e.to, maxBoxW);

      if (lastTo === e.from && curW + arrowW + toBox[3] <= width - 2) {
        rowTop += ' '.repeat(arrowW) + toBox[0];
        rowMid += ' ' + paintSgr(bdrSgr, arrowText) + ' ' + toBox[1];
        rowBot += ' '.repeat(arrowW) + toBox[2];
        curW += arrowW + toBox[3];
        lastTo = e.to;
      } else {
        flushRow();
        const fromBox = makeBox(nodes.get(e.from) ?? e.from, maxBoxW);
        if (2 + fromBox[3] + arrowW + toBox[3] <= width - 2) {
          rowTop += fromBox[0] + ' '.repeat(arrowW) + toBox[0];
          rowMid += fromBox[1] + ' ' + paintSgr(bdrSgr, arrowText) + ' ' + toBox[1];
          rowBot += fromBox[2] + ' '.repeat(arrowW) + toBox[2];
          curW += fromBox[3] + arrowW + toBox[3];
          lastTo = e.to;
        } else {
          // Too wide for single horizontal line: stack vertically
          out.push('  ' + fromBox[0], '  ' + fromBox[1], '  ' + fromBox[2]);
          const midX = ' '.repeat(Math.max(2, Math.floor(fromBox[3] / 2) + 2));
          out.push(midX + paintSgr(bdrSgr, '│') + (e.label ? ' ' + paintSgr(dimSgr, e.label) : ''));
          out.push(midX + paintSgr(bdrSgr, '▼'));
          out.push('  ' + toBox[0], '  ' + toBox[1], '  ' + toBox[2], '');
          lastTo = null;
        }
      }
    }
    flushRow();
    while (out.length > 0 && out[out.length - 1] === '') out.pop();
    return out;
  }

  // TD / TB vertical layout
  const out: string[] = [];
  const maxBoxW = Math.max(16, width - 6);
  if (edges.length === 0) {
    for (const [, lbl] of nodes) {
      const b = makeBox(lbl, maxBoxW);
      out.push('  ' + b[0], '  ' + b[1], '  ' + b[2]);
    }
    return out;
  }

  let lastTo: string | null = null;
  for (const e of edges) {
    const fromBox = makeBox(nodes.get(e.from) ?? e.from, maxBoxW);
    const toBox = makeBox(nodes.get(e.to) ?? e.to, maxBoxW);
    if (lastTo !== e.from) {
      if (lastTo !== null) out.push('');
      out.push('  ' + fromBox[0], '  ' + fromBox[1], '  ' + fromBox[2]);
    }
    const connPad = ' '.repeat(Math.max(2, Math.floor((lastTo === e.from ? toBox[3] : fromBox[3]) / 2) + 2));
    out.push(connPad + paintSgr(bdrSgr, '│') + (e.label ? ' ' + paintSgr(dimSgr, e.label) : ''));
    out.push(connPad + paintSgr(bdrSgr, '▼'));
    out.push('  ' + toBox[0], '  ' + toBox[1], '  ' + toBox[2]);
    lastTo = e.to;
  }
  return out;
}

export function renderMermaidBlock(raw: string, width: number, gfx: GfxMode, theme: Theme): string[] {
  if (gfx === 'none' || theme.id === 'plain') return [];
  return renderMermaidAscii(raw, width, theme);
}
