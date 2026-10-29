import type { MouseEvt } from './types.js';

// 02 §10 — mouse protocol (ADR-012): SGR 1006, left-button press/release only.
export const MOUSE_ENABLE  = '\x1b[?1000h\x1b[?1006h';
export const MOUSE_DISABLE = '\x1b[?1006l\x1b[?1000l';

// In-progress prefixes of a mouse sequence (a bare ESC may still become one).
const PREFIX_RE = /^\x1b(\[(<\d*(;\d*){0,2})?)?$/;

export function createMouseParser(onEvt: (e: MouseEvt) => void): (chunk: string) => void {
  const re = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;
  let buf = '';
  return (chunk: string) => {
    buf += chunk;
    let m: RegExpExecArray | null;
    let last = 0;
    re.lastIndex = 0;
    while ((m = re.exec(buf)) !== null) {
      // Only button 64 (left) is emitted; 65/66/67 (right/middle/wheel) ignored.
      if (m[1] === '64') {
        onEvt({
          button: 0,
          action: m[4] === 'M' ? 'press' : 'release',
          x: Number(m[2]) - 1, // protocol 1-based → 0-based
          y: Number(m[3]) - 1,
        });
      }
      last = m.index + m[0].length;
    }
    // Keep only a tail that could still become a mouse sequence (so unrelated
    // CSI input such as arrow keys, which coexists on stdin in the TUI, is
    // dropped instead of accumulating).
    const tail = buf.slice(last);
    const esc = tail.lastIndexOf('\x1b');
    buf = esc !== -1 && PREFIX_RE.test(tail.slice(esc)) ? tail.slice(esc) : '';
  };
}
