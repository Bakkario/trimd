/**
 * 02 §12 / D-3.5 (ADR-029) — SSH-First Clipboard (OSC 52)
 */

export function isSshSession(env?: NodeJS.ProcessEnv): boolean {
  const e = env ?? process.env;
  return Boolean(e.SSH_CONNECTION || e.SSH_TTY || e.SSH_CLIENT);
}

export function encodeOsc52(text: string, env?: NodeJS.ProcessEnv): string {
  const e = env ?? process.env;
  const b64 = Buffer.from(text, 'utf8').toString('base64');
  const osc = `\x1b]52;c;${b64}\x07`;
  if (e.TMUX) {
    return `\x1bPtmux;\x1b${osc}\x1b\\`;
  }
  return osc;
}
