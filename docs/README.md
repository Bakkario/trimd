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
| `--theme <id>` | Theme id, built-in (`default`, `light`, `dracula`, `tokyo-night`) or user theme (default: config / `default`) |
| `--gfx <mode>` | Image graphics mode: `kitty` (Kitty Graphics Protocol), `halfblock` / `unicode` (truecolor half-block fallback), or `none` (default: auto-detected; pass `--gfx kitty` explicitly over SSH/tmux or if `KITTY_WINDOW_ID` is not set, otherwise Kitty images will not come up) |
| `--config <path>` | Alternate config file (default: `$XDG_CONFIG_HOME/trimd/config.json`) |
| `--no-frontmatter` | Hide the frontmatter metadata block |
| `--no-sidebar` | Start with the sidebar closed |
| `--hidden` | Show hidden (dot) entries in the sidebar |
| `--width <n>` | Force the effective render width |
| `--debug` | Verbose stderr + stack traces on error |
| `-v`, `--version` | Print `trimd v0.4.0` and exit |
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
| `o` | Document outline TOC (floating modal; jump to heading via `↑↓` + Enter or digits `1-9`) |
| `p` | Peek wikilink (floating modal previewing first 8 lines of target note; Enter opens, p/Esc closes) |
| `s` | Toggle sidebar sort order: alphabetical (name) ↔ recent (mtime) |
| `i` | Cycle image graphics mode: `kitty` ↔ `halfblock` ↔ `none` |
| `m` | Toggle frontmatter display between compact pill strip and full YAML |
| Mouse Click | Follow link, open sidebar entry, or click scrollbar track to jump position (R-13) |
| Mouse Wheel | Scroll document or sidebar by ±3 lines |

## SSH & OSC 52 Clipboard

Trimd is built for SSH and remote tmux environments:
- External links (`http(s)`) opened while connected over SSH (detected via `SSH_CONNECTION`, `SSH_TTY`, `SSH_CLIENT`) copy the URL to your local machine clipboard using `OSC 52` rather than failing to spawn `xdg-open` on the remote host.
- Pressing `y` or clicking `[y copy]` on code fence headers copies the code block directly to your client clipboard via `OSC 52` (with transparent tmux DCS passthrough).

## Theming

Built-in themes: `default`, `light`, `dracula`, `tokyo-night`. `T` cycles built-ins, then user themes, wrapping. `NO_COLOR` / `TERM=dumb` overrides everything with a plain unstyled theme.
Terminal window titles are updated dynamically via `OSC 2` (`Trimd — <title>`).

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

## What's New in v0.4.0

- **Lean Production Bundle:** Minified single-file esbuild output (`dist/trimd.js` ≤ 2.2 MB, down from 4.4 MB) with `NODE_ENV="production"` and `DEV="false"` dead-code elimination.
- **Fast Startup & Single-Pass Render:** `--version` / `--help` fast-path exits before loading React/Ink or `highlight.js`; single-pass initial render (`width` and `gfx` aligned between CLI and TUI); unified Git status/branch probe; and `node_modules`/`dist`/`master` exclusion in vault indexing.
- **Bounded Auto-Highlighting & Runtime Caching:** `highlightAuto()` constrained to a 28-language subset with shebang short-circuit, plus in-memory caches for `renderFile()`, `buildIndex()`, and `renderHalfBlockImage()`, and zero-allocation `visibleWidth()` / `stripAnsi()`.
- **Overlay Polish (`ISSUE-032`):** Clean toast modal frame alignment and background fill without `OSC 52` UI jargon.

## Features (v0.3.0)

- **Superfile Framed Sidebar:** Rounded box border (`╭─...─╮` .. `╰─...─╯`), dynamic folder (`📁`) and file (`📄`/`📘`/`📐`) icons, Git status marks (`*` modified), and quick sort toggle (`s`: name ↔ mtime).
- **Extended Markdown Syntax:** `==mark==` highlight, `++ins++` insertion, `^sup^` superscript (`19ᵗʰ`), `~sub~` subscript (`H₂O`), footnotes (`[^1]`), definition lists (`:`, `~`), abbreviations (`*[HTML]: ...`), and `::: <type>` custom containers.
- **LaTeX Math Rendering:** Deterministic Unicode math rendering for inline `$...$` and display `$$...$$` blocks (`α → β ⇒ γ ≤ δ ≠ ∞`, `∑`, `∫`, `∇`, fractions, superscripts/subscripts) without raw delimiter noise.
- **Terminal Graphics & Mermaid Diagrams:** High-DPI inline images via the Kitty Graphics Protocol (**pass `--gfx kitty`** to enable Kitty image rendering when `KITTY_WINDOW_ID` / `TERM=xterm-kitty` isn't auto-detected, e.g. over SSH or `tmux`, otherwise images will not display in Kitty mode), with truecolor half-block fallback (`--gfx halfblock` / `--gfx unicode`) and Unicode box-and-arrow Mermaid diagrams in all graphics modes. Toggle on the fly with `i`.
- **Z-Layer Floating Modals:** Interactive document outline (`o`) and Wikilink peek (`p`) cards composite seamlessly over the top-right of the document without blanking underlying content.
- **Tokyo Night Theme:** Truecolor theme matching the Stage 3 modern developer mockup with rich contrast and syntax highlighting.
- **Terminal Integration:** Click-to-position on the scrollbar track (`R-13`) and dynamic `OSC 2` terminal window titles (`R-16`).

## Limitations

- `![[embeds]]` are clickable previews and placeholders, never infinitely recursively inlined.
- No command palette, watch mode, split/multi-pane, bookmarks, or session persistence.
- TUI only — no non-TTY / print-to-stdout mode.
- Linux only (`xdg-open` for external links); no Windows/macOS.
- Read-only toward the vault: trimd never writes to or indexes `~/Documents/Obsidian`.

## License & Third-Party Attributions

Trimd is licensed under the [MIT License](LICENSE) — Copyright (c) 2026 **Bakkario**.

### Third-Party Open-Source Software

Trimd uses and bundles the following open-source libraries:

- **[ink](https://github.com/vadimdemedes/ink)**, **[react](https://react.dev/)**, **[yoga-layout](https://yogalayout.dev/)**, **[chalk](https://github.com/chalk/chalk)** — MIT License
- **[markdown-it](https://github.com/markdown-it/markdown-it)** — MIT License (with **[entities](https://github.com/fb55/entities)** under BSD-2-Clause and **[argparse](https://github.com/nodeca/argparse)** under PSF-2.0)
- **[markdown-it-task-lists](https://github.com/revin/markdown-it-task-lists)** — ISC License
- **[cli-highlight](https://github.com/felixfbecker/cli-highlight)** — ISC License (with **[parse5](https://github.com/inikulin/parse5)** under MIT)
- **[highlight.js](https://highlightjs.org/)** — BSD-3-Clause License (via `cli-highlight`)
- **[yaml](https://github.com/eemeli/yaml)** — ISC License
