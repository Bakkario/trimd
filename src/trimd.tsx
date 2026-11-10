import { render } from 'ink';
import { dirname, resolve as resolvePath } from 'node:path';
import App from './ui/App.js';
import { renderFile } from './core/pipeline.js';
import { resolveTheme, allThemeIds } from './core/themes.js';
import { defaultConfigPath, loadConfig, mergeConfig, parseArgs } from './core/config.js';
import { ConfigError, FileError, FileMissingError, UsageError } from './core/types.js';
import type { Config, RenderedDoc, Theme } from './core/types.js';

const USAGE = `usage: trimd <FILE> [flags]

Flags:
  --root <dir>        Root for wikilink basename resolution + sidebar start dir
                      (default: the directory containing FILE)
  --theme <id>        Theme id, built-in or user theme (default: config / 'default')
  --config <path>     Alternate config file (default: $XDG_CONFIG_HOME/trimd/config.json)
  --no-frontmatter    Hide the frontmatter metadata block
  --no-sidebar        Start with the sidebar closed
  --hidden            Show hidden (dot) entries in the sidebar
  --width <n>         Force the effective render width
  --gfx <mode>        Image protocol: kitty, halfblock, unicode, none (default: auto)
  --icons <mode>      Sidebar icons: nerd, emoji, ascii, none, auto (default: theme / auto)
  --debug             Verbose stderr + stack traces on error
  -h, --help          Print this usage and exit
`;

function fail(err: unknown, debug: boolean): never {
  if (
    err instanceof FileMissingError ||
    err instanceof FileError ||
    err instanceof UsageError ||
    err instanceof ConfigError
  ) {
    process.stderr.write('trimd: ' + err.message + '\n');
    if (debug && err instanceof Error && err.stack !== undefined) process.stderr.write(err.stack + '\n');
    process.exit(err.code);
  }
  throw err;
}

const argv = process.argv.slice(2);
let parsed: ReturnType<typeof parseArgs>;
try {
  parsed = parseArgs(argv);
} catch (err) {
  fail(err, false);
}
const { file, flags } = parsed;

if (flags.help) {
  process.stdout.write(USAGE);
  process.exit(0);
}
if (file === null) {
  process.stderr.write('trimd: usage: trimd <FILE> [flags]\n');
  process.exit(3);
}

// 02 §4 — config file: --config <path> or $XDG_CONFIG_HOME/trimd/config.json
// (else ~/.config/trimd/config.json); missing/empty → DEFAULTS; flags beat
// config beat defaults (INV-4.1).
const configPath = flags.config !== undefined ? resolvePath(process.cwd(), flags.config) : defaultConfigPath();
let cfg: Config;
try {
  cfg = loadConfig(configPath);
} catch (err) {
  fail(err, !!flags.debug);
}
const merged = mergeConfig(cfg, flags);

const abs = resolvePath(process.cwd(), file);
const root = flags.root !== undefined ? resolvePath(process.cwd(), flags.root) : dirname(abs);

// 02 §4 — NO_COLOR/TERM=dumb → PLAIN_THEME before any theme lookup.
// 02 §3 — unknown theme id (after allThemeIds()) → `trimd: theme: unknown theme '<id>'`, exit 3.
let theme: Theme;
try {
  const themeId = flags.theme !== undefined ? flags.theme : merged.theme;
  if (!allThemeIds().includes(themeId)) {
    throw new ConfigError("theme: unknown theme '" + themeId + "'");
  }
  theme = resolveTheme(process.env, flags, merged);
} catch (err) {
  fail(err, !!flags.debug);
}

const sidebarOpen = merged.sidebarOpen;
const showFrontmatter = merged.showFrontmatter;
const showHidden = merged.showHidden;
const cols = process.stdout.columns ?? 80;
const width = merged.width ?? Math.max(cols - (sidebarOpen ? 30 : 0) - 2, 40);

let doc: RenderedDoc;
try {
  doc = renderFile(abs, {
    root,
    width,
    theme,
    showFrontmatter,
    showHidden,
    gfx: merged.gfx,
  });
} catch (err) {
  fail(err, !!flags.debug);
}

render(<App doc={doc} root={root} theme={theme} themeId={theme.id} sidebarOpen={sidebarOpen} showHidden={showHidden} showFrontmatter={showFrontmatter} gfx={merged.gfx} icons={flags.icons ?? merged.icons} />);
