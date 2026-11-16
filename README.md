# Trimd

**Demo:** [trimd-demo.mp4](docs/trimd-demo.mp4)

A terminal TUI that renders markdown — primarily Obsidian notes — as clean, styled text with **zero visible markdown syntax**. Open a document, browse a toggleable file-tree sidebar, click links (wikilinks navigate in-app; http(s) links open in your browser), and switch between JSON-defined themes. Linux, pure Node, no daemon, no caches written to disk, and strictly read-only toward your vault.

## Install

**From npm** (Linux + Node 22+):

```bash
npm install -g @bakkario/trimd
```

**From source** (development):

```bash
pnpm install && pnpm build && pnpm link --global
```

## Usage

```
trimd <FILE> [flags]
```

See the [full README](docs/README.md) for all flags, keymap, theming, config, and release notes.

## Docs

- [Full README](docs/README.md) — flags, keymap, SSH/OSC 52, theming, config, what's new
- [SAMPLE.md](docs/SAMPLE.md) — feature showcase (lists, tables, code, images, mermaid, callouts, wikilinks)

## License

MIT — see [LICENSE](LICENSE).
