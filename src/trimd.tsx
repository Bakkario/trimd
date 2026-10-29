import { render } from 'ink';
import { dirname, resolve as resolvePath } from 'node:path';
import App from './ui/App.js';
import { renderFile } from './core/pipeline.js';
import { BUILTIN_THEMES, PLAIN_THEME } from './core/themes.js';
import { ConfigError, FileError, FileMissingError, UsageError } from './core/types.js';
import type { RenderedDoc, Theme } from './core/types.js';

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
  --debug             Verbose stderr + stack traces on error
  -h, --help          Print this usage and exit
`;

// 02 §13 — args handling until task 4.1 replaces this with config.ts parseArgs.
interface Flags {
  root?: string; theme?: string; config?: string;
  noFrontmatter?: boolean; noSidebar?: boolean; hidden?: boolean;
  width?: number; debug?: boolean; help?: boolean;
}

function parseArgs(argv: string[]): { file: string | null; flags: Flags } {
  let file: string | null = null;
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') flags.help = true;
    else if (a === '--no-frontmatter') flags.noFrontmatter = true;
    else if (a === '--no-sidebar') flags.noSidebar = true;
    else if (a === '--hidden') flags.hidden = true;
    else if (a === '--debug') flags.debug = true;
    else if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const name = eq === -1 ? a.slice(2) : a.slice(2, eq);
      let val: string;
      if (eq !== -1) {
        val = a.slice(eq + 1);
      } else {
        i++;
        val = argv[i];
        if (val === undefined) throw new UsageError('missing value for ' + a);
      }
      switch (name) {
        case 'root': flags.root = val; break;
        case 'theme': flags.theme = val; break;
        case 'config': flags.config = val; break; // accepted now; config-file wiring lands in task 4.1
        case 'width': {
          const n = Number(val);
          if (!Number.isInteger(n) || n <= 0) throw new UsageError('invalid --width: ' + val);
          flags.width = n;
          break;
        }
        default: throw new UsageError('unknown flag: --' + name);
      }
    } else if (file === null) file = a;
    else throw new UsageError('unexpected argument: ' + a);
  }
  return { file, flags };
}

// 02 §4 — theme / no-color resolution; config-file part is wired in task 4.1.
function resolveTheme(env: NodeJS.ProcessEnv, themeId?: string): Theme {
  if (env.NO_COLOR !== undefined || env.TERM === 'dumb') return PLAIN_THEME;
  const id = themeId ?? 'default';
  const theme = BUILTIN_THEMES[id]; // user themes: task 4.2
  if (theme === undefined) throw new ConfigError(`theme: unknown theme '${id}'`);
  return theme;
}

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
let parsed: { file: string | null; flags: Flags };
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

const abs = resolvePath(process.cwd(), file);
const root = flags.root !== undefined ? resolvePath(process.cwd(), flags.root) : dirname(abs);

let theme: Theme;
try {
  theme = resolveTheme(process.env, flags.theme);
} catch (err) {
  fail(err, !!flags.debug);
}

const sidebarOpen = !flags.noSidebar;
const cols = process.stdout.columns ?? 80;
const width = flags.width ?? Math.max(cols - (sidebarOpen ? 30 : 0) - 2, 40);

let doc: RenderedDoc;
try {
  doc = renderFile(abs, {
    root,
    width,
    theme,
    showFrontmatter: !flags.noFrontmatter,
    showHidden: !!flags.hidden,
  });
} catch (err) {
  fail(err, !!flags.debug);
}

render(<App doc={doc} root={root} theme={theme} themeId={theme.id} sidebarOpen={sidebarOpen} showHidden={!!flags.hidden} />);
