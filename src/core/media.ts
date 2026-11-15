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

export function renderHalfBlockImage(imgBuf: Buffer, cols: number, rows: number, borderSgr = ''): string[] {
  const c = Math.max(1, cols);
  const r = Math.max(1, rows);
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
  return out;
}

export function encodeKittyPng(pngBuf: Buffer, cols: number, rows: number, env: NodeJS.ProcessEnv = process.env): string[] {
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
      params = `a=T,f=100,c=${cols},r=${rows},C=1,q=2,m=${chunks.length > 1 ? 1 : 0}`;
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

  const maxCols = Math.max(20, Math.min(72, width - 6));
  const aspect = img.height > 0 && img.width > 0 ? img.height / img.width : 0.5;
  const cols = maxCols;
  const rows = Math.max(8, Math.min(20, Math.round(cols * aspect * 0.5)));

  if (gfx === 'kitty') {
    return encodeKittyPng(img.png, cols, rows);
  }
  return renderHalfBlockImage(img.png, cols, rows, theme.colors.tableBorder);
}

export function renderMermaidBlock(raw: string, width: number, gfx: GfxMode, theme: Theme): string[] {
  if (gfx !== 'kitty' || theme.id === 'plain') return [];

  const lines = raw.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('%%') && !l.startsWith('graph ') && !l.startsWith('flowchart '));
  const nodes = new Map<string, string>();
  const edges: { from: string; to: string; label?: string }[] = [];

  for (const line of lines) {
    const edgeMatch = line.match(/([a-zA-Z0-9_-]+)(?:\[([^\]]+)\])?\s*-->?(?:\|([^|]+)\|)?\s*([a-zA-Z0-9_-]+)(?:\[([^\]]+)\])?/);
    if (edgeMatch) {
      const fromId = edgeMatch[1];
      const fromLabel = edgeMatch[2] || fromId;
      const edgeLabel = edgeMatch[3];
      const toId = edgeMatch[4];
      const toLabel = edgeMatch[5] || toId;

      if (!nodes.has(fromId)) nodes.set(fromId, fromLabel);
      if (!nodes.has(toId)) nodes.set(toId, toLabel);
      edges.push({ from: fromId, to: toId, label: edgeLabel });
    }
  }

  const nodeList = Array.from(nodes.entries());
  if (nodeList.length === 0) return [];

  const svgW = 440;
  const svgH = 120;
  const stepX = Math.floor((svgW - 80) / Math.max(1, nodeList.length));

  const nodeElements = nodeList.map(([id, label], idx) => {
    const x = 30 + idx * stepX;
    const y = 40;
    return `
      <rect x="${x}" y="${y}" width="70" height="35" rx="5" fill="#24283b" stroke="#7aa2f7" stroke-width="2"/>
      <text x="${x + 35}" y="${y + 22}" fill="#c0caf5" font-family="sans-serif" font-size="11" text-anchor="middle">${label.replace(/[<>&'"]/g, '')}</text>
    `;
  }).join('');

  const edgeElements = edges.map((e) => {
    const fromIdx = nodeList.findIndex(([id]) => id === e.from);
    const toIdx = nodeList.findIndex(([id]) => id === e.to);
    if (fromIdx < 0 || toIdx < 0) return '';
    const x1 = 30 + fromIdx * stepX + 70;
    const x2 = 30 + toIdx * stepX;
    const y = 57;
    return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#7aa2f7" stroke-width="2" marker-end="url(#arr)"/>`;
  }).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">
    <defs>
      <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
        <path d="M0,0 L0,6 L8,3 z" fill="#7aa2f7" />
      </marker>
    </defs>
    <rect width="100%" height="100%" fill="#16161e" rx="6"/>
    ${edgeElements}
    ${nodeElements}
  </svg>`;

  try {
    const res = spawnSync('/usr/bin/magick', ['svg:-', 'png:-'], {
      input: Buffer.from(svg, 'utf8'),
      timeout: 1500,
    });
    if (res.status === 0 && res.stdout && res.stdout.length > 0) {
      const cols = Math.max(16, Math.min(48, width - 6));
      return encodeKittyPng(res.stdout, cols, 6);
    }
  } catch {
    // fallback
  }
  return [];
}
