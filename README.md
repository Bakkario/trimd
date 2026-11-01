# Trimd

A terminal TUI that renders markdown — primarily Obsidian notes — as clean, styled text with **zero visible markdown syntax**. Open a document, browse a toggleable file-tree sidebar, click links (wikilinks navigate in-app; http(s) links open in your browser), and switch between JSON-defined themes. Linux, pure Node, no daemon, no caches written to disk, and strictly read-only toward your vault.

## Install

Linux + Node 22+ + pnpm:

```bash
pnpm install && pnpm build && pnpm link --global
```

- `pnpm install` — install dependencies (pinned in `package.json`)
- `pnpm build` — esbuild → single file `dist/trimd.js`
- `pnpm link --global` — exposes the `trimd` command

Developing: `pnpm dev <note.md>` (run from source via tsx) · `pnpm test` (full suite).

## Usage

```
trimd <FILE> [flags]
```

| Flag | Description |
|---|---|
| `--root <dir>` | Root for wikilink basename resolution + sidebar start dir (default: the directory containing `FILE`) |
| `--theme <id>` | Theme id, built-in or user theme (default: config / `default`) |
| `--config <path>` | Alternate config file (default: `$XDG_CONFIG_HOME/trimd/config.json`) |
| `--no-frontmatter` | Hide the frontmatter metadata block |
| `--no-sidebar` | Start with the sidebar closed |
| `--hidden` | Show hidden (dot) entries in the sidebar |
| `--width <n>` | Force the effective render width |
| `--debug` | Verbose stderr + stack traces on error |
| `-h`, `--help` | Print usage and exit |

Flags override the config file, which overrides defaults. `NO_COLOR` (any value) or `TERM=dumb` forces plain unstyled output.

Exit codes: `0` quit/help · `1` file missing · `2` file unreadable / root walk failure · `3` usage/config/theme error. Errors print one line to stderr: `trimd: <message>` (stack trace only with `--debug`).

## Keymap

| Key | Action |
|---|---|
| `q` | Quit (exit 0) |
| `?` | Help overlay (any key closes it) |
| `Tab` | Toggle the sidebar (focuses it when opened) |
| `←` / `→` | Switch focus between doc and sidebar (no-op when the target pane is closed) |
| `↑` / `↓` | Scroll the document, or move the sidebar cursor when the sidebar is focused |
| `PgUp` / `PgDn` | Scroll one pane |
| `g` / `G` | Jump to top / bottom of the document |
| `Enter` | Open the sidebar entry (directory → enter it; note → open it) |
| `Esc` | Close help → leave sidebar focus → navigate back |
| `B` / `F` | Navigate back / forward |
| `r` | Reload (re-render the current document) |
| `T` | Cycle themes (built-ins, then user themes, wrapping); the status bar shows the current theme id |
| `/` | Find within document (doc focus; Esc closes row / clears search) |
| `n` / `N` | Next / previous search match |
| `l` | Keyboard link-hint mode (numbers visible links `[1..N]`, press number to follow) |
| `y` | Copy code block in view to system clipboard via OSC 52 (or pick block if multiple) |
| `o` | Document outline TOC (jump to heading via `↑↓` + Enter or digits `1-9`) |
| `m` | Toggle frontmatter display between compact pill strip and full YAML |
| Mouse Wheel | Scroll document or sidebar by ±3 lines |

## SSH & OSC 52 Clipboard

Trimd is built for SSH and remote tmux environments:
- External links (`http(s)`) opened while connected over SSH (detected via `SSH_CONNECTION`, `SSH_TTY`, `SSH_CLIENT`) copy the URL to your local machine clipboard using `OSC 52` rather than failing to spawn `xdg-open` on the remote host.
- Pressing `y` or clicking `[y copy]` on code fence headers copies the code block directly to your client clipboard via `OSC 52` (with transparent tmux DCS passthrough).

## Theming

Built-in themes: `default`, `light`, `dracula`. `T` cycles built-ins, then user themes, wrapping. `NO_COLOR` / `TERM=dumb` overrides everything with a plain unstyled theme.

User themes live in `$XDG_CONFIG_HOME/trimd/themes/` (default `~/.config/trimd/themes/`), one JSON file per theme. `id` must match the file name; colors are SGR parameter strings, and any key you omit inherits from the `default` theme:

```json
{
  "id": "mytheme",
  "name": "My Theme",
  "colors": {
    "heading1": "1;38;5;45",
    "link": "38;5;21",
    "sidebar": "38;5;252"
  }
}
```

Color keys: `heading1`–`heading6`, `bold`, `italic`, `strike`, `inlineCode`, `codeLabel`, `link`, `tag`, `quote`, `tableHead`, `tableBorder`, `hr`, `dim`, `success`, `warning`, `error`, `info`, `calloutNote`, `calloutTip`, `calloutInfo`, `calloutSuccess`, `calloutQuestion`, `calloutWarning`, `calloutDanger`, `sidebar`, `statusOk`, `statusWarn`, `search`, `headerBg`, `accentPill`, `codeBg`, `calloutBg`, `tagChip`, `linkHint`, `activeDoc`, `scrollbar`.

## Config

`$XDG_CONFIG_HOME/trimd/config.json` (default `~/.config/trimd/config.json`). All keys are optional; a missing or empty file means defaults; malformed JSON exits 3.

```json
{
  "theme": "default",
  "showFrontmatter": true,
  "sidebarOpen": true,
  "showHidden": false,
  "root": null,
  "width": null
}
```

Reset: `rm -rf ~/.config/trimd`.

## Mouse

Clicking works via the SGR (1006) mouse protocol: click a link in the document to navigate (http(s) links open in the browser), click a sidebar entry to open it. A click also moves keyboard focus to the pane you clicked (doc ↔ sidebar). This requires a terminal with mouse reporting — GNOME Terminal, Konsole, kitty, Alacritty, WezTerm, foot: yes. Inside tmux: add `set -g mouse on` to `.tmux.conf`. Inside screen: not supported (the keyboard remains fully functional).

## Limitations (v1.0)

- Text only: images, LaTeX, mermaid, and any diagrams are not rendered — they render as dim placeholders (`[image: …]`, `── math ──`).
- `![[embeds]]` are clickable placeholders, never recursively inlined.
- No fuzzy search, qmd integration, watch mode, split/multi-pane, bookmarks, or session persistence.
- TUI only — no non-TTY / print-to-stdout mode.
- Linux only (`xdg-open` for external links); no Windows/macOS.
- Read-only toward the vault: trimd never writes to or indexes `~/Documents/Obsidian`.
- Wide characters (CJK/emoji): visible width counts code points, not display cells, so wrapping may be off by one cell.

All of the above are binding non-goals for v1.0 and make up the v2 roadmap.
